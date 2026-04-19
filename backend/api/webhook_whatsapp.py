"""
Webhook de WhatsApp (Wassenger API)
Recibe mensajes entrantes y los procesa con el Agente 5 (Chatbot)
Actualiza Supabase con interacciones y scoring (Agente 6)
"""

from __future__ import annotations
import os
import json
import hmac
import hashlib
import logging
from datetime import datetime, timezone, timedelta

import asyncio
import httpx
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

from agents.agent5_chatbot import handle_incoming_whatsapp
from agents.agent6_scoring import score_lead
from agents.agent1_scraper import ejecutar_campana
from agents.agent2_seguimiento import ejecutar_seguimiento, obtener_resumen_pendientes, _verificar_renovaciones_clientes
from agents.agent4_linkedin import enriquecer_leads_sin_nombre
from agents.agent3_mensajes import generar_mensajes_lote, aprobar_mensaje, descartar_mensaje, generar_mensaje_whatsapp

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Manuel Prospección — API")

@app.on_event("startup")
async def _check_env():
    if not os.environ.get("WASSENGER_WEBHOOK_SECRET"):
        logger.warning("WASSENGER_WEBHOOK_SECRET no configurado — el webhook acepta cualquier POST sin verificar firma")

_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = _origins_env.split(",") if _origins_env != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # Service role para operaciones del servidor
)

WASSENGER_API_KEY = os.environ.get("WASSENGER_API_KEY", "")
WASSENGER_DEVICE_ID = os.environ.get("WASSENGER_DEVICE_ID", "")  # ID del número en Wassenger
WASSENGER_WEBHOOK_SECRET = os.environ.get("WASSENGER_WEBHOOK_SECRET", "")

# Shared HTTP client — avoids creating/tearing down a connection pool on every send
_http = httpx.AsyncClient(timeout=10)


def _verify_wassenger_signature(body: bytes, signature_header: str | None) -> bool:
    """
    Verifica la firma HMAC-SHA256 del webhook de Wassenger.
    Wassenger envía el header X-Webhook-Signature con el HMAC del body.
    Si no hay secreto configurado, se omite la verificación (modo desarrollo).
    """
    if not WASSENGER_WEBHOOK_SECRET:
        return True  # Sin secreto configurado → aceptar (dev/staging)
    if not signature_header:
        return False
    expected = hmac.new(
        WASSENGER_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()  # type: ignore[attr-defined]
    # Wassenger puede enviar "sha256=<hex>" o solo "<hex>"
    received = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)


# ============================================================
# Verificación de webhook (Meta requiere esto para activarlo)
# ============================================================
@app.get("/webhook/whatsapp")
async def verify_webhook():
    """Wassenger no requiere verificación GET — solo devuelve 200."""
    return {"status": "ok"}


# ============================================================
# Recepción de mensajes entrantes
# ============================================================
@app.post("/webhook/whatsapp")
async def receive_whatsapp_message(request: Request, background_tasks: BackgroundTasks):
    """
    Recibe mensajes de WhatsApp vía Wassenger webhook.
    Responde inmediatamente con 200 OK y procesa en background.
    """
    body = await request.body()
    signature = request.headers.get("X-Webhook-Signature") or request.headers.get("X-Hub-Signature-256")
    if not _verify_wassenger_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return {"status": "ok", "message": "invalid json"}

    # Estructura del webhook de Wassenger
    # https://app.wassenger.com/docs/#tag/Webhooks
    try:
        event = payload.get("event")

        # Solo procesar mensajes entrantes de texto
        if event != "message:in:new":
            return {"status": "ok", "message": "event ignored"}

        data = payload.get("data", {})
        from_number = data.get("fromNumber") or data.get("from_number") or ""
        # Eliminar el sufijo @c.us si existe (formato de algunos webhooks)
        from_number = from_number.replace("@c.us", "").replace("@s.whatsapp.net", "")

        message_type = data.get("type", "")
        whatsapp_message_id = data.get("id", "")

        # Solo texto
        if message_type not in ("text", "chat"):
            return {"status": "ok", "message": "non-text message ignored"}

        message_text = data.get("body") or data.get("text") or ""
        if not message_text or not from_number:
            return {"status": "ok", "message": "empty message"}

    except (KeyError, TypeError):
        return {"status": "ok", "message": "payload parsing failed"}

    # Procesar en background para responder en < 5 segundos
    background_tasks.add_task(
        process_and_respond,
        from_number=from_number,
        message_text=message_text,
        whatsapp_message_id=whatsapp_message_id
    )

    return {"status": "ok"}


async def process_and_respond(from_number: str, message_text: str, whatsapp_message_id: str):
    """
    Lógica principal de procesamiento:
    1. Busca el lead en Supabase
    2. Procesa con Agente 5 (chatbot)
    3. Guarda la interacción en Supabase
    4. Actualiza scoring con Agente 6
    5. Envía respuesta por WhatsApp
    6. Si hay que escalar, notifica al comercial asignado
    """
    try:
        await _process_and_respond_inner(from_number, message_text, whatsapp_message_id)
    except Exception:
        logger.exception("Error en process_and_respond para %s", from_number)


async def _process_and_respond_inner(from_number: str, message_text: str, whatsapp_message_id: str):
    # 1. Buscar lead por número de WhatsApp
    lead_response = supabase.table("leads").select(
        "id, nombre, apellidos, tipo_lead, cargo, empresa, sector, productos_recomendados, comercial_asignado"
    ).eq("telefono_whatsapp", from_number).single().execute()

    if not lead_response.data:
        # Lead desconocido — crear lead mínimo
        nuevo_lead = supabase.table("leads").insert({
            "nombre": "Desconocido",
            "telefono_whatsapp": from_number,
            "fuente": "inbound",
            "estado": "nuevo"
        }).execute()
        lead = nuevo_lead.data[0]
    else:
        lead = lead_response.data

    lead_id = lead["id"]
    lead_nombre = lead.get("nombre", "")

    # Perfil para personalizar el chatbot
    lead_perfil = {
        "tipo_lead": lead.get("tipo_lead"),
        "cargo": lead.get("cargo"),
        "empresa": lead.get("empresa"),
        "sector": lead.get("sector"),
        "productos_recomendados": lead.get("productos_recomendados", [])
    }

    # 2. Guardar mensaje del lead en interactions
    supabase.table("interactions").insert({
        "lead_id": lead_id,
        "tipo": "whatsapp_recibido",
        "mensaje": message_text,
        "whatsapp_message_id": whatsapp_message_id,
        "origen": "lead"
    }).execute()

    # Actualizar estado del lead a "respondio" si era "mensaje_enviado"
    if lead.get("estado") in ["mensaje_enviado", "nuevo"]:
        supabase.table("leads").update({
            "estado": "respondio",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", lead_id).execute()

    # 3. Procesar con Agente 5
    respuesta = handle_incoming_whatsapp(
        lead_id=lead_id,
        lead_nombre=lead_nombre,
        message=message_text,
        lead_perfil=lead_perfil
    )

    mensaje_respuesta = respuesta["mensaje"]
    escalar = respuesta.get("escalar_a_humano", False)
    productos_mencionados = respuesta.get("productos_mencionados", [])
    producto_principal = productos_mencionados[0] if productos_mencionados else None

    # 4. Guardar respuesta del bot en interactions
    supabase.table("interactions").insert({
        "lead_id": lead_id,
        "tipo": "whatsapp_enviado",
        "mensaje": mensaje_respuesta if isinstance(mensaje_respuesta, str) else json.dumps(mensaje_respuesta),
        "origen": "bot",
        "señal_escalado": escalar,
        "palabras_clave_interes": productos_mencionados
    }).execute()

    # 5. Recalcular scoring con Agente 6
    await recalcular_y_guardar_scoring(lead_id, escalar, productos_mencionados, producto_principal)

    # 6. Enviar respuesta por WhatsApp
    if isinstance(mensaje_respuesta, list):
        for msg in mensaje_respuesta:
            await send_whatsapp_message(from_number, msg)
    else:
        await send_whatsapp_message(from_number, mensaje_respuesta)

    # 7. Notificar al comercial si hay que escalar
    if escalar:
        await notify_comercial_escalado(lead_id, lead, message_text, respuesta.get("motivo_escalado"))


async def recalcular_y_guardar_scoring(
    lead_id: str,
    escalo_a_humano: bool,
    productos_mencionados: list[str],
    producto_principal: str | None
):
    """Obtiene el historial de interacciones y recalcula el scoring."""
    # Obtener todas las interacciones del lead
    interactions_resp = supabase.table("interactions").select(
        "mensaje, origen"
    ).eq("lead_id", lead_id).order("created_at").execute()

    interacciones = interactions_resp.data or []

    # Obtener datos del lead para el scoring
    lead_data = supabase.table("leads").select(
        "fecha_captacion, estado"
    ).eq("id", lead_id).single().execute()

    lead = lead_data.data or {}
    fecha_captacion = lead.get("fecha_captacion", datetime.now(timezone.utc).isoformat())

    from datetime import datetime as dt
    dias = (dt.now(timezone.utc) - dt.fromisoformat(fecha_captacion.replace("Z", "+00:00"))).days

    # Verificar si tiene cita agendada
    citas = supabase.table("appointments").select("id, estado").eq(
        "lead_id", lead_id
    ).eq("estado", "confirmada").execute()
    tiene_cita = len(citas.data or []) > 0

    citas_rechazadas = supabase.table("appointments").select("id").eq(
        "lead_id", lead_id
    ).eq("estado", "cancelada").execute()
    cita_rechazada = len(citas_rechazadas.data or []) > 0

    # Calcular scoring
    scoring = score_lead(
        interacciones=interacciones,
        dias_desde_primer_contacto=dias,
        tiene_cita_agendada=tiene_cita,
        cita_rechazada=cita_rechazada,
        escalo_a_humano=escalo_a_humano,
        productos_mencionados=productos_mencionados
    )

    # Guardar en scoring_history
    supabase.table("scoring_history").insert({
        "lead_id": lead_id,
        "temperatura": scoring.temperatura.value,
        "nivel_interes": scoring.nivel_interes,
        "prioridad": scoring.prioridad.value,
        "producto_interes": producto_principal,
        "motivo": scoring.motivo,
        "evento_tipo": "respuesta_whatsapp"
    }).execute()

    # Actualizar lead con nuevo scoring (temperatura la gestiona el usuario manualmente)
    update_data = {
        "nivel_interes": scoring.nivel_interes,
        "prioridad": scoring.prioridad.value,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if producto_principal:
        update_data["producto_interes_principal"] = producto_principal
    if productos_mencionados:
        update_data["productos_recomendados"] = productos_mencionados

    supabase.table("leads").update(update_data).eq("id", lead_id).execute()


async def send_whatsapp_message(to_number: str, message: str):
    """Envía un mensaje de WhatsApp vía Wassenger API."""
    if not WASSENGER_API_KEY:
        print(f"[WhatsApp] Sin credenciales configuradas — mensaje NO enviado a {to_number}")
        return

    url = "https://api.wassenger.com/v1/messages"
    headers = {
        "Token": WASSENGER_API_KEY,
        "Content-Type": "application/json",
    }
    payload: dict = {
        "phone": to_number,
        "message": message,
    }
    if WASSENGER_DEVICE_ID:
        payload["device"] = WASSENGER_DEVICE_ID

    resp = await _http.post(url, json=payload, headers=headers)
    if resp.status_code not in (200, 201):
        logger.error("[WhatsApp] Error al enviar a %s: %s %s", to_number, resp.status_code, resp.text)


async def notify_comercial_escalado(_lead_id: str, lead: dict, ultimo_mensaje: str, motivo: str | None):
    """
    Notifica al comercial asignado que un lead necesita atención humana.
    Lo hace enviando un mensaje de WhatsApp al comercial.
    """
    comercial_id = lead.get("comercial_asignado")
    if not comercial_id:
        # Usar el número de Manuel como fallback
        comercial_whatsapp = os.environ.get("MANUEL_WHATSAPP")
        if not comercial_whatsapp:
            return
    else:
        comercial_resp = supabase.table("comerciales").select("whatsapp").eq("id", comercial_id).single().execute()
        comercial_whatsapp = comercial_resp.data.get("whatsapp") if comercial_resp.data else None

    if not comercial_whatsapp:
        return

    lead_nombre = f"{lead.get('nombre', '')} {lead.get('apellidos', '')}".strip()
    mensaje = (
        f"🔔 LEAD CALIENTE — {lead_nombre}\n"
        f"Ha respondido por WhatsApp y está listo para hablar contigo.\n"
        f"Último mensaje: \"{ultimo_mensaje[:100]}\"\n"
        f"Motivo: {motivo or 'Alta intención detectada'}\n"
        f"Dashboard: revisa su ficha para más contexto."
    )
    await send_whatsapp_message(comercial_whatsapp, mensaje)


# ============================================================
# API endpoints para el Dashboard (Agente 7)
# ============================================================

@app.get("/api/leads")
async def get_leads(
    prioridad: str | None = None,
    temperatura: str | None = None,
    estado: str | None = None,
    comercial_id: str | None = None
):
    """Obtiene leads para el dashboard con filtros opcionales."""
    query = supabase.table("leads_dashboard").select("*")

    if prioridad:
        query = query.eq("prioridad", prioridad)
    if temperatura:
        query = query.eq("temperatura", temperatura)
    if estado:
        query = query.eq("estado", estado)
    if comercial_id:
        query = query.eq("comercial_asignado", comercial_id)

    # Ordenar por prioridad y temperatura
    query = query.order("nivel_interes", desc=True)

    result = query.execute()
    return result.data


@app.get("/api/leads/{lead_id}")
async def get_lead_detail(lead_id: str):
    """Obtiene el detalle completo de un lead con su historial."""
    # supabase-py is sync — run all three queries in threads so they execute in parallel
    lead_r, interactions_r, appointments_r = await asyncio.gather(
        asyncio.to_thread(lambda: supabase.table("leads").select("*").eq("id", lead_id).single().execute()),
        asyncio.to_thread(lambda: supabase.table("interactions").select("*").eq("lead_id", lead_id).order("created_at").execute()),
        asyncio.to_thread(lambda: supabase.table("appointments").select("*").eq("lead_id", lead_id).order("fecha_hora").execute()),
    )
    if not lead_r.data:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    return {
        "lead": lead_r.data,
        "interactions": interactions_r.data,
        "appointments": appointments_r.data,
    }


@app.get("/api/dashboard/resumen")
async def get_dashboard_resumen():
    """Resumen diario para el dashboard de Manuel."""
    hoy = datetime.now(timezone.utc)
    inicio_hoy = hoy.replace(hour=0, minute=0, second=0, microsecond=0)
    fin_hoy = inicio_hoy + timedelta(days=1)
    hace_2h = hoy - timedelta(hours=2)

    nuevos_r, calientes_r, citas_r, sin_atencion_r = await asyncio.gather(
        asyncio.to_thread(lambda: supabase.table("leads").select("id", count="exact").gte("fecha_captacion", inicio_hoy.isoformat()).execute()),
        asyncio.to_thread(lambda: supabase.table("leads").select("id", count="exact").eq("temperatura", "caliente").neq("estado", "descartado").execute()),
        asyncio.to_thread(lambda: supabase.table("appointments").select("id", count="exact").gte("fecha_hora", inicio_hoy.isoformat()).lte("fecha_hora", fin_hoy.isoformat()).eq("estado", "confirmada").execute()),
        asyncio.to_thread(lambda: supabase.table("leads").select("id, nombre, apellidos, nivel_interes").eq("estado", "respondio").lte("updated_at", hace_2h.isoformat()).order("nivel_interes", desc=True).execute()),
    )

    leads_nuevos_hoy = nuevos_r
    leads_calientes = calientes_r
    citas_hoy = citas_r
    sin_atencion = sin_atencion_r

    return {
        "fecha": hoy.date().isoformat(),
        "leads_nuevos_hoy": leads_nuevos_hoy.count,
        "leads_calientes_total": leads_calientes.count,
        "citas_hoy": citas_hoy.count,
        "sin_atencion_urgente": sin_atencion.data or []
    }


# ============================================================
# SCRAPING — Endpoint para lanzar campañas de prospección
# ============================================================

class CampanaRequest(BaseModel):
    ciudades: List[str]
    categorias: List[str]
    paginas: int = 2
    solo_con_telefono: bool = False
    solo_con_web: bool = False
    min_rating: Optional[float] = None
    max_anos_abierto: Optional[int] = None
    excluir_sectores: List[str] = []

@app.post("/scraping/lanzar")
async def lanzar_campana_scraping(payload: CampanaRequest, background_tasks: BackgroundTasks):
    """
    Lanza una campaña de scraping en background.
    El dashboard recibe respuesta inmediata y el scraping corre en paralelo.
    Anti-duplicados: compara contra toda la base existente al inicio.
    """
    background_tasks.add_task(
        ejecutar_campana,
        ciudades=payload.ciudades,
        categorias=payload.categorias,
        paginas_por_ciudad=payload.paginas,
        solo_con_telefono=payload.solo_con_telefono,
        solo_con_web=payload.solo_con_web,
        min_rating=payload.min_rating,
        max_anos_abierto=payload.max_anos_abierto,
        excluir_sectores=payload.excluir_sectores,
    )
    estimado = len(payload.ciudades) * len(payload.categorias) * payload.paginas * 10
    return {
        "status": "iniciada",
        "mensaje": f"Campaña en curso — ~{estimado} leads estimados (sin duplicados)",
        "nuevos_leads": estimado,
    }


# ============================================================
# SEGUIMIENTO — Endpoints del Agente 2
# ============================================================

@app.post("/seguimiento/ejecutar")
async def lanzar_seguimiento(background_tasks: BackgroundTasks):
    """
    Ejecuta el ciclo de seguimiento automático del Agente 2 en background.
    Cadencia: día 1 / 3 / 7 / 14 sin respuesta.
    También notifica acciones vencidas (proxima_accion_fecha < now).
    Llamado automáticamente cada hora por el cron en Railway.
    """
    background_tasks.add_task(ejecutar_seguimiento)
    return {
        "status": "iniciado",
        "mensaje": "Ciclo de seguimiento en curso — revisa interactions y scoring_history para ver resultados.",
    }


@app.post("/seguimiento/renovaciones")
async def verificar_renovaciones(background_tasks: BackgroundTasks):
    """
    Verifica renovaciones de clientes próximas (≤7 días) y genera alertas.
    Llamado automáticamente a las 9h por el cron en Railway.
    """
    background_tasks.add_task(_verificar_renovaciones_clientes)
    return {"status": "iniciado", "mensaje": "Verificando renovaciones de clientes en background."}


@app.get("/seguimiento/pendientes")
async def get_seguimiento_pendientes():
    """
    Devuelve cuántos leads están en cada estado de seguimiento pendiente:
    - recordatorio_1_pendientes: leads con 3-6 días sin respuesta (recordatorio 1 aún no enviado)
    - recordatorio_2_pendientes: leads con 7-13 días sin respuesta (recordatorio 2 aún no enviado)
    - leads_frios_14_dias: leads con 14+ días sin respuesta (pendientes de marcar como frío)
    - alertas_sin_atencion_24h: leads que respondieron y llevan >24h sin atención del comercial
    - total_accion_requerida: suma de todos los anteriores
    """
    return obtener_resumen_pendientes()


# ============================================================
# LINKEDIN — Endpoint del Agente 4
# ============================================================

class EnriquecimientoRequest(BaseModel):
    limite: int = 50

@app.post("/linkedin/enriquecer")
async def lanzar_enriquecimiento_linkedin(payload: EnriquecimientoRequest, background_tasks: BackgroundTasks):
    """
    Enriquece leads de scraping: busca nombre propietario, móvil y email desde la web del negocio.
    Corre en background.
    """
    background_tasks.add_task(enriquecer_leads_sin_nombre, limite=payload.limite)
    return {
        "status": "iniciado",
        "mensaje": f"Enriqueciendo hasta {payload.limite} leads en background. Revisa los leads para ver los datos actualizados.",
    }


@app.get("/linkedin/diagnostico")
async def diagnostico_enriquecimiento():
    """Diagnóstico: muestra los primeros 5 leads candidatos a enriquecer y sus datos clave."""
    resp = supabase.table("leads").select(
        "id, nombre, empresa, ciudad, fuente_detalle, web, apellidos, cargo, estado"
    ).eq("fuente", "scraping").not_.is_("empresa", "null").in_("estado", ["nuevo", "enriquecido"]).limit(5).execute()

    leads = resp.data or []
    resultado = []
    for l in leads:
        fuente = l.get("fuente_detalle") or ""
        url_web = l.get("web") or (fuente if fuente.startswith("http") else "")
        tiene_apellidos = bool(l.get("apellidos") and str(l.get("apellidos")).strip())
        resultado.append({
            "empresa": l.get("empresa"),
            "ciudad": l.get("ciudad"),
            "estado": l.get("estado"),
            "tiene_web": bool(url_web),
            "url_web": url_web or "(ninguna)",
            "fuente_detalle": fuente[:80] if fuente else "(vacío)",
            "ya_enriquecido": tiene_apellidos,
        })

    total_candidatos = supabase.table("leads").select("id", count="exact", head=True).eq("fuente", "scraping").in_("estado", ["nuevo"]).execute()

    return {
        "total_candidatos_a_enriquecer": total_candidatos.count,
        "muestra": resultado,
    }


# ============================================================
# MENSAJES — Endpoints del Agente 3
# ============================================================

class MensajesLoteRequest(BaseModel):
    limite: int = 30

class AprobarMensajeRequest(BaseModel):
    mensaje_editado: Optional[str] = None

class MensajeUnicoRequest(BaseModel):
    lead_id: str

class EnviarDirectoRequest(BaseModel):
    lead_id: str
    mensaje: str


@app.post("/mensajes/generar")
async def lanzar_generacion_mensajes(payload: MensajesLoteRequest, background_tasks: BackgroundTasks):
    """
    Genera mensajes de primer contacto personalizados con Claude para leads sin mensaje pendiente.
    Corre en background. Los mensajes quedan en estado 'pendiente' para revisión del comercial.
    """
    background_tasks.add_task(generar_mensajes_lote, limite=payload.limite)
    return {
        "status": "iniciado",
        "mensaje": f"Generando mensajes para hasta {payload.limite} leads. Revisa la bandeja de aprobación.",
    }


@app.post("/mensajes/generar-uno")
async def generar_mensaje_para_lead(payload: MensajeUnicoRequest):
    """
    Genera (o regenera) el mensaje de WhatsApp para un lead específico.
    Devuelve el mensaje generado para previsualización inmediata.
    """
    lead_resp = supabase.table("leads").select(
        "id, nombre, apellidos, empresa, sector, ciudad, cargo, tipo_lead, "
        "productos_recomendados, num_empleados, señales_detectadas, web, "
        "telefono_whatsapp, comercial_asignado"
    ).eq("id", payload.lead_id).single().execute()

    if not lead_resp.data:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    mensaje = generar_mensaje_whatsapp(lead_resp.data)

    # Upsert en mensajes_pendientes
    existente = supabase.table("mensajes_pendientes").select("id").eq("lead_id", payload.lead_id).eq("estado", "pendiente").execute()
    if existente.data:
        supabase.table("mensajes_pendientes").update({"mensaje": mensaje}).eq("id", existente.data[0]["id"]).execute()
        mensaje_id = existente.data[0]["id"]
    else:
        nuevo = supabase.table("mensajes_pendientes").insert({
            "lead_id": payload.lead_id,
            "mensaje": mensaje,
            "estado": "pendiente",
            "comercial_id": lead_resp.data.get("comercial_asignado"),
            "canal": "whatsapp",
        }).execute()
        mensaje_id = nuevo.data[0]["id"] if nuevo.data else None

    return {"mensaje_id": mensaje_id, "mensaje": mensaje}


@app.get("/mensajes/pendientes")
async def get_mensajes_pendientes(limite: int = 50):
    """
    Devuelve los mensajes pendientes de aprobación con datos del lead.
    """
    resp = supabase.table("mensajes_pendientes").select(
        "id, mensaje, estado, canal, created_at, editado_por_comercial, "
        "leads(id, nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, cargo)"
    ).eq("estado", "pendiente").order("created_at", desc=False).limit(limite).execute()

    return resp.data or []


@app.post("/mensajes/{mensaje_id}/aprobar")
async def aprobar_mensaje_endpoint(mensaje_id: str, payload: AprobarMensajeRequest):
    """
    Aprueba un mensaje (con o sin edición) y lo envía por WhatsApp al lead.
    """
    ok = aprobar_mensaje(mensaje_id, payload.mensaje_editado)
    if not ok:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")

    # Obtener número del lead y enviar por WhatsApp
    try:
        msg_resp = supabase.table("mensajes_pendientes").select(
            "mensaje, leads(telefono_whatsapp, id, nombre)"
        ).eq("id", mensaje_id).single().execute()

        if msg_resp.data:
            lead_data = msg_resp.data.get("leads") or {}
            telefono = lead_data.get("telefono_whatsapp")
            mensaje_final = payload.mensaje_editado or msg_resp.data["mensaje"]

            if telefono:
                await send_whatsapp_message(telefono, mensaje_final)
                # Registrar en interactions
                lead_id = lead_data.get("id")
                if lead_id:
                    supabase.table("interactions").insert({
                        "lead_id": lead_id,
                        "tipo": "whatsapp_enviado",
                        "mensaje": mensaje_final,
                        "origen": "comercial",
                    }).execute()
                    # Actualizar estado del lead
                    supabase.table("leads").update({
                        "estado": "mensaje_enviado",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", lead_id).execute()
    except Exception as e:
        print(f"[aprobar] Error al enviar WhatsApp: {e}")

    return {"status": "aprobado_y_enviado"}


@app.post("/mensajes/{mensaje_id}/descartar")
async def descartar_mensaje_endpoint(mensaje_id: str):
    """Descarta un mensaje sin enviarlo."""
    ok = descartar_mensaje(mensaje_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"status": "descartado"}


@app.post("/mensajes/enviar-directo")
async def enviar_mensaje_directo(payload: EnviarDirectoRequest):
    """
    Envía un mensaje de WhatsApp directamente al lead vía Wassenger.
    No pasa por bandeja de aprobación — el comercial lo escribe/edita y lo envía al momento.
    Registra la interacción y actualiza el estado del lead a mensaje_enviado.
    """
    lead_resp = supabase.table("leads").select(
        "id, nombre, telefono_whatsapp, estado, comercial_asignado"
    ).eq("id", payload.lead_id).single().execute()

    if not lead_resp.data:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    lead = lead_resp.data
    telefono = lead.get("telefono_whatsapp")
    if not telefono:
        raise HTTPException(status_code=400, detail="El lead no tiene número de WhatsApp")

    # Enviar por Wassenger
    await send_whatsapp_message(telefono, payload.mensaje)

    # Registrar interacción
    supabase.table("interactions").insert({
        "lead_id": payload.lead_id,
        "tipo": "whatsapp_enviado",
        "mensaje": payload.mensaje,
        "origen": "comercial",
    }).execute()

    # Actualizar estado del lead
    if lead.get("estado") not in ("respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"):
        supabase.table("leads").update({
            "estado": "mensaje_enviado",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", payload.lead_id).execute()

    return {"status": "enviado", "telefono": telefono}
