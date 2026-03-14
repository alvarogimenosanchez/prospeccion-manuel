"""
Webhook de WhatsApp (360dialog / Meta API)
Recibe mensajes entrantes y los procesa con el Agente 5 (Chatbot)
Actualiza Supabase con interacciones y scoring (Agente 6)
"""

from __future__ import annotations
import os
import hmac
import hashlib
import json
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

from agents.agent5_chatbot import handle_incoming_whatsapp
from agents.agent6_scoring import score_lead, Temperatura
from agents.agent1_scraper import ejecutar_campana
from agents.agent2_seguimiento import ejecutar_seguimiento, obtener_resumen_pendientes
from agents.agent4_linkedin import enriquecer_leads_sin_nombre

load_dotenv()

app = FastAPI(title="Manuel Prospección — API")

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

DIALOG360_API_KEY = os.environ.get("DIALOG360_API_KEY", "")
DIALOG360_WEBHOOK_SECRET = os.environ.get("DIALOG360_WEBHOOK_SECRET", "")


# ============================================================
# Verificación de webhook (Meta requiere esto para activarlo)
# ============================================================
@app.get("/webhook/whatsapp")
async def verify_webhook(request: Request):
    params = dict(request.query_params)
    verify_token = os.environ.get("WHATSAPP_VERIFY_TOKEN", "manuel_prospeccion_2024")

    if params.get("hub.verify_token") == verify_token:
        return int(params.get("hub.challenge", 0))

    raise HTTPException(status_code=403, detail="Token de verificación incorrecto")


# ============================================================
# Recepción de mensajes entrantes
# ============================================================
@app.post("/webhook/whatsapp")
async def receive_whatsapp_message(request: Request, background_tasks: BackgroundTasks):
    """
    Recibe mensajes de WhatsApp vía 360dialog webhook.
    Responde inmediatamente con 200 OK y procesa en background.
    """
    # Verificar firma del webhook (seguridad)
    if DIALOG360_WEBHOOK_SECRET:
        signature = request.headers.get("X-Hub-Signature-256", "")
        body = await request.body()
        expected = "sha256=" + hmac.new(
            DIALOG360_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Firma inválida")

    payload = await request.json()

    # Extraer datos del mensaje de WhatsApp
    # Estructura de 360dialog/Meta API
    try:
        entry = payload.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return {"status": "ok", "message": "no messages"}

        message = messages[0]
        from_number = message.get("from")          # Número del lead (con código de país)
        message_type = message.get("type")
        whatsapp_message_id = message.get("id")

        # Por ahora solo procesamos mensajes de texto
        if message_type != "text":
            return {"status": "ok", "message": "non-text message ignored"}

        message_text = message.get("text", {}).get("body", "")

    except (KeyError, IndexError, TypeError):
        return {"status": "ok", "message": "payload parsing failed"}

    # Procesar en background para responder a Meta en < 5 segundos
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

    # Actualizar lead con nuevo scoring
    update_data = {
        "temperatura": scoring.temperatura.value,
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
    """Envía un mensaje de WhatsApp vía 360dialog API."""
    url = "https://waba.360dialog.io/v1/messages"
    headers = {
        "D360-API-KEY": DIALOG360_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "recipient_type": "individual",
        "to": to_number,
        "type": "text",
        "text": {"body": message}
    }
    async with httpx.AsyncClient() as client:
        await client.post(url, json=payload, headers=headers)


async def notify_comercial_escalado(lead_id: str, lead: dict, ultimo_mensaje: str, motivo: str | None):
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
    lead = supabase.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    interactions = supabase.table("interactions").select("*").eq(
        "lead_id", lead_id
    ).order("created_at").execute()

    appointments = supabase.table("appointments").select("*").eq(
        "lead_id", lead_id
    ).order("fecha_hora").execute()

    return {
        "lead": lead.data,
        "interactions": interactions.data,
        "appointments": appointments.data
    }


@app.get("/api/dashboard/resumen")
async def get_dashboard_resumen():
    """Resumen diario para el dashboard de Manuel."""
    from datetime import timedelta
    hoy = datetime.now(timezone.utc)
    inicio_hoy = hoy.replace(hour=0, minute=0, second=0, microsecond=0)

    leads_nuevos_hoy = supabase.table("leads").select(
        "id", count="exact"
    ).gte("fecha_captacion", inicio_hoy.isoformat()).execute()

    leads_calientes = supabase.table("leads").select(
        "id", count="exact"
    ).eq("temperatura", "caliente").neq("estado", "descartado").execute()

    citas_hoy = supabase.table("appointments").select(
        "id", count="exact"
    ).gte("fecha_hora", inicio_hoy.isoformat()).lte(
        "fecha_hora", (inicio_hoy + timedelta(days=1)).isoformat()
    ).eq("estado", "confirmada").execute()

    # Leads que respondieron y llevan más de 2 horas sin atención
    sin_atencion = supabase.table("leads").select(
        "id, nombre, apellidos, nivel_interes"
    ).eq("estado", "respondio").lte(
        "updated_at", (hoy - timedelta(hours=2)).isoformat()
    ).order("nivel_interes", desc=True).execute()

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
from pydantic import BaseModel
from typing import List

class CampanaRequest(BaseModel):
    ciudades: List[str]
    categorias: List[str]
    paginas: int = 2
    solo_con_telefono: bool = False
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
    - Envía recordatorio 1 a leads sin respuesta en 3 días.
    - Envía recordatorio 2 a leads sin respuesta en 7 días.
    - Marca como frío a leads sin respuesta en 14 días.
    - Crea alertas urgentes para leads que respondieron y llevan >24h sin atención comercial.
    Responde inmediatamente; el procesamiento ocurre en background.
    """
    background_tasks.add_task(ejecutar_seguimiento)
    return {
        "status": "iniciado",
        "mensaje": "Ciclo de seguimiento en curso — revisa interactions y scoring_history para ver resultados.",
    }


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
    Enriquece leads de scraping sin nombre real buscando al director/propietario en LinkedIn.
    Corre en background. Requiere PROXYCURL_API_KEY para máxima fiabilidad.
    """
    background_tasks.add_task(enriquecer_leads_sin_nombre, limite=payload.limite)
    return {
        "status": "iniciado",
        "mensaje": f"Enriqueciendo hasta {payload.limite} leads en background. Revisa los leads para ver los nombres actualizados.",
    }
