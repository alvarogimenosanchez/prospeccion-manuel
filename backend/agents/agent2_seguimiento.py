"""
Agente 2 — Seguimiento automático de leads que no responden.

Lógica:
  - Estado "mensaje_enviado" + sin actividad 3 días  → recordatorio 1
  - Estado "mensaje_enviado" + sin actividad 7 días  → recordatorio 2
  - Estado "mensaje_enviado" + sin actividad 14 días → marcar como "frio" + baja prioridad
  - Estado "respondio"       + sin respuesta 24 h   → crear alerta urgente para el comercial

Los mensajes se registran en `interactions` (tipo='whatsapp_enviado', origen='bot')
y en `scoring_history`. NO se envía WhatsApp real hasta que haya API configurada:
el campo `whatsapp_message_id` queda vacío y el mensaje se marca como pendiente de envío
mediante una nota en el campo `mensaje` con el prefijo "[PENDIENTE_ENVIO]".

Se puede ejecutar:
  - Directamente:   python3 agent2_seguimiento.py
  - Como módulo:    from agents.agent2_seguimiento import ejecutar_seguimiento
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [agent2_seguimiento] %(levelname)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("agent2_seguimiento")

# ============================================================
# Cliente Supabase (service role para operaciones del servidor)
# ============================================================
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)


# ============================================================
# Plantillas de seguimiento por segmento
# ============================================================

def _plantillas_recordatorio_dia1() -> Dict[str, str]:
    """Plantillas para el recordatorio del día 1 (24h sin respuesta)."""
    return {
        "inmobiliaria": (
            "Hola {nombre}, soy Manuel. Te escribí ayer sobre cómo generar ingresos adicionales "
            "para {empresa} derivando clientes hipotecarios. ¿Has tenido oportunidad de verlo?"
        ),
        "autonomo": (
            "Hola {nombre}, soy Manuel. Te comenté ayer sobre el seguro para autónomos que cubre "
            "desde el primer día de baja. ¿Lo pudiste ver?"
        ),
        "pyme": (
            "Hola {nombre}, soy Manuel. Te escribí ayer sobre el seguro colectivo para tu equipo "
            "en {empresa}. ¿Tienes un momento para verlo?"
        ),
        "particular": (
            "Hola {nombre}, soy Manuel. Te escribí ayer sobre protección para tu familia. "
            "¿Llegaste a verlo?"
        ),
        "generico": (
            "Hola {nombre}, soy Manuel. Te escribí ayer con una propuesta. ¿Has tenido ocasión "
            "de verla?"
        ),
    }


def _plantillas_recordatorio_1() -> Dict[str, str]:
    """Plantillas para el primer recordatorio (3 días sin respuesta)."""
    return {
        "inmobiliaria": (
            "Hola {nombre}, soy Manuel. Te escribí hace unos días sobre cómo podemos generar "
            "ingresos adicionales para {empresa} derivando clientes hipotecarios. Sé que estás "
            "ocupado. ¿Tienes 10 minutos esta semana para que te cuente cómo funciona con otras "
            "inmobiliarias de {ciudad}?"
        ),
        "autonomo": (
            "Hola {nombre}, soy Manuel de nuevo. Te hablé del seguro para autónomos que cubre "
            "desde el primer día si te pones enfermo. ¿Sigue siendo algo que te interesa explorar? "
            "Un momento malo sin ingresos lo hemos pasado todos."
        ),
        "pyme": (
            "Hola {nombre}, Manuel aquí. Te contacté sobre el seguro colectivo para tu equipo en "
            "{empresa}. No requiere reconocimiento médico y es un beneficio que ayuda a retener "
            "talento. ¿Cuándo tienes un momento para verlo?"
        ),
        "particular": (
            "Hola {nombre}, te escribí sobre protección para tu familia. Sé que no es fácil "
            "encontrar el momento para estos temas. Si quieres, te mando información resumida y "
            "cuando puedas me dices."
        ),
        "generico": (
            "Hola {nombre}, soy Manuel. Te escribí hace unos días con una propuesta que creo que "
            "puede interesarte. ¿Tienes un momento para que te lo cuente?"
        ),
    }


def _plantillas_recordatorio_2() -> Dict[str, str]:
    """Plantillas para el segundo recordatorio (7 días sin respuesta)."""
    return {
        "inmobiliaria": (
            "{nombre}, última vez que te escribo, lo prometo 😄 Trabajamos con inmobiliarias en "
            "{ciudad} y el mes pasado generamos comisiones medias de 800-1.200€ por operación "
            "hipotecaria para sus directores. Si no es para ti, sin problema. ¿Lo descartamos?"
        ),
        "autonomo": (
            "{nombre}, por si se perdió mi mensaje: con Contigo Autónomo cobrarías entre 10€ y "
            "200€/día desde el primer día de baja. Cuesta desde 5€/mes. Si tienes 5 minutos, te "
            "explico exactamente cuánto te saldría según tu situación."
        ),
        "pyme": (
            "{nombre}, ¿tu equipo en {empresa} tiene cobertura de vida? Muchas pymes como la tuya "
            "lo tienen pendiente y luego pasa lo que pasa. Te lo dejo aquí por si lo retomas: es "
            "sin cuestionario médico y se contrata en un día. ¿Lo vemos?"
        ),
        "particular": (
            "{nombre}, última vez. Una familia con hipoteca e hijos sin seguro de vida es un "
            "riesgo enorme. Desde 5€/mes puedes tener hasta 500.000€ cubiertos. Si te parece "
            "mucho, hablamos y ajustamos. ¿Te llamo?"
        ),
        "generico": (
            "{nombre}, última vez que te contacto sobre esto. Si no es el momento, sin problema. "
            "¿Lo dejamos para más adelante o lo descartamos?"
        ),
    }


# ============================================================
# Helpers de plantillas
# ============================================================

def _detectar_segmento(lead: Dict[str, Any]) -> str:
    """
    Devuelve la clave de segmento que se usará para seleccionar la plantilla.
    Orden de prioridad: sector inmobiliaria > tipo autonomo > tipo pyme > particular > generico.
    """
    sector = (lead.get("sector") or "").lower()
    tipo = (lead.get("tipo_lead") or "").lower()

    if "inmobiliaria" in sector or "inmobil" in sector:
        return "inmobiliaria"
    if tipo == "autonomo":
        return "autonomo"
    if tipo in ("pyme", "empresa"):
        return "pyme"
    if tipo == "particular":
        return "particular"
    return "generico"


def _rellenar_plantilla(plantilla: str, lead: Dict[str, Any]) -> str:
    """Sustituye las variables de la plantilla con los datos del lead."""
    nombre = lead.get("nombre") or "hola"
    empresa = lead.get("empresa") or "vuestra empresa"
    ciudad = lead.get("ciudad") or "vuestra ciudad"
    return (
        plantilla
        .replace("{nombre}", nombre)
        .replace("{empresa}", empresa)
        .replace("{ciudad}", ciudad)
    )


def _generar_mensaje_recordatorio(lead: Dict[str, Any], numero_recordatorio: int) -> str:
    """Genera el mensaje de recordatorio adecuado para el lead."""
    segmento = _detectar_segmento(lead)
    if numero_recordatorio == 0:
        plantilla = _plantillas_recordatorio_dia1().get(segmento, _plantillas_recordatorio_dia1()["generico"])
    elif numero_recordatorio == 1:
        plantilla = _plantillas_recordatorio_1().get(segmento, _plantillas_recordatorio_1()["generico"])
    else:
        plantilla = _plantillas_recordatorio_2().get(segmento, _plantillas_recordatorio_2()["generico"])
    return _rellenar_plantilla(plantilla, lead)


# ============================================================
# Funciones de detección de leads pendientes
# ============================================================

def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _obtener_leads_mensaje_enviado() -> List[Dict[str, Any]]:
    """
    Devuelve todos los leads con estado 'mensaje_enviado'.
    Incluye updated_at para calcular días de inactividad.
    """
    resp = supabase.table("leads").select(
        "id, nombre, apellidos, tipo_lead, sector, empresa, ciudad, "
        "estado, temperatura, prioridad, updated_at, comercial_asignado"
    ).eq("estado", "mensaje_enviado").execute()
    return resp.data or []


def _obtener_leads_accion_vencida() -> List[Dict[str, Any]]:
    """
    Devuelve leads con proxima_accion_fecha vencida que no estén cerrados.
    Excluye leads donde ya se notificó en las últimas 12h.
    """
    ahora = _ahora_utc()
    resp = supabase.table("leads").select(
        "id, nombre, apellidos, empresa, proxima_accion, proxima_accion_fecha, comercial_asignado"
    ).not_.is_("proxima_accion", "null").neq(
        "proxima_accion", "ninguna"
    ).lt(
        "proxima_accion_fecha", ahora.isoformat()
    ).not_.in_(
        "estado", ["cerrado_ganado", "cerrado_perdido", "descartado"]
    ).execute()
    return resp.data or []


def _obtener_leads_respondio_sin_atencion() -> List[Dict[str, Any]]:
    """
    Devuelve leads en estado 'respondio' cuyo updated_at tiene más de 24 horas.
    Estos leads respondieron pero ningún comercial les ha contestado.
    """
    limite = _ahora_utc() - timedelta(hours=24)
    resp = supabase.table("leads").select(
        "id, nombre, apellidos, tipo_lead, empresa, ciudad, "
        "estado, nivel_interes, prioridad, updated_at, comercial_asignado"
    ).eq("estado", "respondio").lte("updated_at", limite.isoformat()).execute()
    return resp.data or []


def _dias_desde(fecha_iso: str) -> float:
    """Calcula los días transcurridos desde una fecha ISO 8601."""
    try:
        fecha = datetime.fromisoformat(fecha_iso.replace("Z", "+00:00"))
        delta = _ahora_utc() - fecha
        return delta.total_seconds() / 86400.0
    except (ValueError, TypeError):
        return 0.0


# ============================================================
# Registro en base de datos
# ============================================================

def _registrar_interaccion(lead_id: str, mensaje: str, notas_extra: Optional[str] = None) -> None:
    """Guarda la interacción de seguimiento en la tabla interactions."""
    texto_final = f"[PENDIENTE_ENVIO] {mensaje}"
    if notas_extra:
        texto_final += f"\n\n[NOTA: {notas_extra}]"

    supabase.table("interactions").insert({
        "lead_id": lead_id,
        "tipo": "whatsapp_enviado",
        "mensaje": texto_final,
        "origen": "bot",
        "sentimiento": "neutro",
    }).execute()


def _registrar_scoring_history(
    lead_id: str,
    temperatura: str,
    nivel_interes: int,
    prioridad: str,
    motivo: str,
    evento_tipo: str,
) -> None:
    """Guarda un registro en scoring_history."""
    supabase.table("scoring_history").insert({
        "lead_id": lead_id,
        "temperatura": temperatura,
        "nivel_interes": nivel_interes,
        "prioridad": prioridad,
        "motivo": motivo,
        "evento_tipo": evento_tipo,
    }).execute()


def _actualizar_lead(lead_id: str, campos: Dict[str, Any]) -> None:
    """Actualiza campos del lead y pone updated_at al momento actual."""
    campos["updated_at"] = _ahora_utc().isoformat()
    supabase.table("leads").update(campos).eq("id", lead_id).execute()


# ============================================================
# Procesamiento por tipo de situación
# ============================================================

def _procesar_recordatorio_dia1(lead: Dict[str, Any]) -> None:
    """Lead lleva 1 día sin responder → recordatorio suave de seguimiento."""
    lead_id = lead["id"]
    nombre = lead.get("nombre", "sin nombre")
    mensaje = _generar_mensaje_recordatorio(lead, 0)

    logger.info("Recordatorio día 1 → lead %s (%s)", lead_id, nombre)

    _registrar_interaccion(
        lead_id=lead_id,
        mensaje=mensaje,
        notas_extra="Recordatorio automático día 1 — 24h sin respuesta",
    )
    _registrar_scoring_history(
        lead_id=lead_id,
        temperatura=lead.get("temperatura", "templado"),
        nivel_interes=lead.get("nivel_interes", 5),
        prioridad=lead.get("prioridad", "media"),
        motivo="Recordatorio día 1 enviado — 24h sin respuesta al primer mensaje",
        evento_tipo="sin_respuesta_1_dia",
    )
    _actualizar_lead(lead_id, {})


def _procesar_recordatorio_1(lead: Dict[str, Any]) -> None:
    """Lead lleva 3 días sin responder → enviar recordatorio 1."""
    lead_id = lead["id"]
    nombre = lead.get("nombre", "sin nombre")
    mensaje = _generar_mensaje_recordatorio(lead, 1)

    logger.info("Recordatorio 1 → lead %s (%s)", lead_id, nombre)

    _registrar_interaccion(
        lead_id=lead_id,
        mensaje=mensaje,
        notas_extra="Recordatorio automático 1 — 3 días sin respuesta",
    )
    _registrar_scoring_history(
        lead_id=lead_id,
        temperatura=lead.get("temperatura", "frio"),
        nivel_interes=lead.get("nivel_interes", 3),
        prioridad=lead.get("prioridad", "media"),
        motivo="Recordatorio 1 enviado — 3 días sin respuesta al primer mensaje",
        evento_tipo="sin_respuesta_3_dias",
    )
    # No cambiamos el estado; el lead sigue en "mensaje_enviado"
    # pero actualizamos updated_at para no volver a enviarlo mañana
    _actualizar_lead(lead_id, {})


def _procesar_recordatorio_2(lead: Dict[str, Any]) -> None:
    """Lead lleva 7 días sin responder → enviar recordatorio 2."""
    lead_id = lead["id"]
    nombre = lead.get("nombre", "sin nombre")
    mensaje = _generar_mensaje_recordatorio(lead, 2)

    logger.info("Recordatorio 2 → lead %s (%s)", lead_id, nombre)

    _registrar_interaccion(
        lead_id=lead_id,
        mensaje=mensaje,
        notas_extra="Recordatorio automático 2 — 7 días sin respuesta",
    )
    _registrar_scoring_history(
        lead_id=lead_id,
        temperatura=lead.get("temperatura", ""),
        nivel_interes=max(0, (lead.get("nivel_interes") or 2) - 1),
        prioridad="baja",
        motivo="Recordatorio 2 enviado — 7 días sin respuesta. Interés decreciente.",
        evento_tipo="sin_respuesta_7_dias",
    )
    _actualizar_lead(lead_id, {
        "prioridad": "baja",
    })


def _procesar_lead_frio(lead: Dict[str, Any]) -> None:
    """Lead lleva 14 días sin responder → marcar como frío y baja prioridad."""
    lead_id = lead["id"]
    nombre = lead.get("nombre", "sin nombre")

    logger.info("Marcando como frío → lead %s (%s)", lead_id, nombre)

    _registrar_interaccion(
        lead_id=lead_id,
        mensaje=(
            f"[SISTEMA] Lead marcado automáticamente como frío tras 14 días sin respuesta. "
            f"Se archiva con prioridad baja. Puede reactivarse si el lead contacta."
        ),
        notas_extra="14 días sin respuesta — archivado como frío",
    )
    _registrar_scoring_history(
        lead_id=lead_id,
        temperatura=lead.get("temperatura", ""),
        nivel_interes=0,
        prioridad="baja",
        motivo="14 días sin respuesta. Lead archivado automáticamente.",
        evento_tipo="sin_respuesta_14_dias",
    )
    _actualizar_lead(lead_id, {
        "prioridad": "baja",
        "nivel_interes": 0,
    })


ACCIONES_LABEL: Dict[str, str] = {
    "llamar": "Llamar",
    "whatsapp": "WhatsApp",
    "email": "Email",
    "esperar_respuesta": "Esperar respuesta",
    "enviar_info": "Enviar información",
    "reunion": "Reunión",
}


def _notificar_accion_vencida(lead: Dict[str, Any]) -> None:
    """
    Registra una nota en interactions cuando la próxima acción comprometida ha vencido.
    """
    lead_id = lead["id"]
    nombre = lead.get("nombre", "sin nombre")
    empresa = lead.get("empresa") or ""
    accion = ACCIONES_LABEL.get(lead.get("proxima_accion", ""), lead.get("proxima_accion", "acción"))
    fecha = lead.get("proxima_accion_fecha", "")
    try:
        dt_fecha = datetime.fromisoformat(fecha.replace("Z", "+00:00"))
        horas_retraso = int((_ahora_utc() - dt_fecha).total_seconds() / 3600)
    except (ValueError, TypeError):
        horas_retraso = 0

    logger.warning(
        "Acción vencida — lead %s (%s%s): %s — %dh de retraso",
        lead_id, nombre, f" ({empresa})" if empresa else "", accion, horas_retraso,
    )

    alerta = (
        f"[ACCIÓN VENCIDA] Tenías pendiente: {accion} a {nombre}"
        + (f" ({empresa})" if empresa else "")
        + f". Lleva {horas_retraso}h de retraso. Revisa y reprograma."
    )

    supabase.table("interactions").insert({
        "lead_id": lead_id,
        "tipo": "nota_manual",
        "mensaje": alerta,
        "origen": "bot",
        "sentimiento": "neutro",
        "señal_escalado": horas_retraso >= 24,
    }).execute()

    _registrar_scoring_history(
        lead_id=lead_id,
        temperatura=lead.get("temperatura", "templado"),
        nivel_interes=lead.get("nivel_interes", 5),
        prioridad=lead.get("prioridad", "media"),
        motivo=f"Acción '{accion}' vencida — {horas_retraso}h de retraso.",
        evento_tipo="accion_vencida_notificada",
    )


def _procesar_alerta_urgente(lead: Dict[str, Any]) -> None:
    """
    Lead respondió pero ningún comercial contestó en 24 horas.
    Crea una alerta urgente en interactions con señal_escalado=True.
    """
    lead_id = lead["id"]
    nombre = lead.get("nombre", "sin nombre")
    empresa = lead.get("empresa") or ""
    horas = int(_dias_desde(lead.get("updated_at", "")) * 24)

    logger.warning(
        "ALERTA URGENTE — lead %s (%s) lleva %d horas sin atención del comercial",
        lead_id, nombre, horas,
    )

    alerta = (
        f"[ALERTA URGENTE] {nombre}"
        + (f" de {empresa}" if empresa else "")
        + f" respondió hace {horas} horas y NO ha recibido atención del equipo comercial. "
        f"Prioridad máxima."
    )

    supabase.table("interactions").insert({
        "lead_id": lead_id,
        "tipo": "nota_manual",
        "mensaje": alerta,
        "origen": "bot",
        "sentimiento": "neutro",
        "señal_escalado": True,
    }).execute()

    _registrar_scoring_history(
        lead_id=lead_id,
        temperatura=lead.get("temperatura", ""),
        nivel_interes=min(10, (lead.get("nivel_interes") or 5) + 1),
        prioridad="alta",
        motivo=f"Lead respondió hace {horas}h y no hay atención comercial. Alerta urgente generada.",
        evento_tipo="alerta_sin_atencion_24h",
    )
    _actualizar_lead(lead_id, {
        "prioridad": "alta",
    })


# ============================================================
# Función principal
# ============================================================

def ejecutar_seguimiento() -> Dict[str, Any]:
    """
    Punto de entrada principal del agente.
    Devuelve un resumen de las acciones realizadas.
    """
    logger.info("=== Iniciando ciclo de seguimiento ===")
    ahora = _ahora_utc()

    resultado: Dict[str, Any] = {
        "ejecutado_en": ahora.isoformat(),
        "recordatorios_dia1_enviados": 0,
        "recordatorios_1_enviados": 0,
        "recordatorios_2_enviados": 0,
        "leads_marcados_frios": 0,
        "alertas_urgentes_creadas": 0,
        "acciones_vencidas_notificadas": 0,
        "errores": [],
    }

    # ---- 1. Leads en "mensaje_enviado" (cadencia 1/3/7/14 días) ----
    leads_enviados = _obtener_leads_mensaje_enviado()
    logger.info("Leads en estado 'mensaje_enviado': %d", len(leads_enviados))

    for lead in leads_enviados:
        try:
            dias = _dias_desde(lead.get("updated_at", ""))

            if dias >= 14:
                _procesar_lead_frio(lead)
                resultado["leads_marcados_frios"] += 1
            elif dias >= 7:
                ya_enviado = _tiene_interaccion_reciente(lead["id"], "sin_respuesta_7_dias")
                if not ya_enviado:
                    _procesar_recordatorio_2(lead)
                    resultado["recordatorios_2_enviados"] += 1
            elif dias >= 3:
                ya_enviado = _tiene_interaccion_reciente(lead["id"], "sin_respuesta_3_dias")
                if not ya_enviado:
                    _procesar_recordatorio_1(lead)
                    resultado["recordatorios_1_enviados"] += 1
            elif dias >= 1:
                ya_enviado = _tiene_interaccion_reciente(lead["id"], "sin_respuesta_1_dia")
                if not ya_enviado:
                    _procesar_recordatorio_dia1(lead)
                    resultado["recordatorios_dia1_enviados"] += 1

        except Exception as exc:  # pylint: disable=broad-except
            msg = f"Error procesando lead {lead.get('id')}: {exc}"
            logger.error(msg)
            resultado["errores"].append(msg)

    # ---- 2. Leads en "respondio" sin atención del comercial ----
    leads_sin_atencion = _obtener_leads_respondio_sin_atencion()
    logger.info("Leads en 'respondio' sin atención >24h: %d", len(leads_sin_atencion))

    for lead in leads_sin_atencion:
        try:
            ya_alertado = _tiene_interaccion_reciente(lead["id"], "alerta_sin_atencion_24h")
            if not ya_alertado:
                _procesar_alerta_urgente(lead)
                resultado["alertas_urgentes_creadas"] += 1
        except Exception as exc:  # pylint: disable=broad-except
            msg = f"Error generando alerta para lead {lead.get('id')}: {exc}"
            logger.error(msg)
            resultado["errores"].append(msg)

    # ---- 3. Acciones comprometidas vencidas ----
    leads_accion_vencida = _obtener_leads_accion_vencida()
    logger.info("Leads con acción vencida: %d", len(leads_accion_vencida))

    for lead in leads_accion_vencida:
        try:
            ya_notificado = _tiene_interaccion_reciente(lead["id"], "accion_vencida_notificada")
            if not ya_notificado:
                _notificar_accion_vencida(lead)
                resultado["acciones_vencidas_notificadas"] += 1
        except Exception as exc:  # pylint: disable=broad-except
            msg = f"Error notificando acción vencida para lead {lead.get('id')}: {exc}"
            logger.error(msg)
            resultado["errores"].append(msg)

    logger.info(
        "=== Ciclo completado: R0=%d R1=%d R2=%d frías=%d alertas=%d accVenc=%d errores=%d ===",
        resultado["recordatorios_dia1_enviados"],
        resultado["recordatorios_1_enviados"],
        resultado["recordatorios_2_enviados"],
        resultado["leads_marcados_frios"],
        resultado["alertas_urgentes_creadas"],
        resultado["acciones_vencidas_notificadas"],
        len(resultado["errores"]),
    )
    return resultado


def _tiene_interaccion_reciente(lead_id: str, evento_tipo: str) -> bool:
    """
    Comprueba en scoring_history si ya existe un registro del tipo de evento
    en las últimas 48 horas, para evitar duplicar recordatorios en ejecuciones
    consecutivas del agente.
    """
    limite = (_ahora_utc() - timedelta(hours=48)).isoformat()
    resp = supabase.table("scoring_history").select("id").eq(
        "lead_id", lead_id
    ).eq(
        "evento_tipo", evento_tipo
    ).gte("created_at", limite).execute()
    return bool(resp.data)


# ============================================================
# Renovaciones de clientes
# ============================================================

def _verificar_renovaciones_clientes() -> int:
    """
    Revisa la tabla clientes buscando fechas de renovación próximas (7 días o menos)
    y genera una nota en interactions del lead vinculado si la hay.
    Devuelve el número de alertas generadas.
    """
    from datetime import timedelta

    ahora = _ahora_utc()
    en_7_dias = (ahora + timedelta(days=7)).isoformat()

    resp = supabase.table("clientes").select(
        "id, nombre, apellidos, empresa, producto, fecha_renovacion, lead_id, comercial_asignado"
    ).eq(
        "estado", "activo"
    ).not_.is_(
        "fecha_renovacion", "null"
    ).lte(
        "fecha_renovacion", en_7_dias
    ).gte(
        "fecha_renovacion", ahora.date().isoformat()
    ).execute()

    clientes = resp.data or []
    alertas = 0

    for cliente in clientes:
        try:
            fecha_ren = cliente.get("fecha_renovacion", "")
            try:
                dt_ren = datetime.fromisoformat(fecha_ren)
                if dt_ren.tzinfo is None:
                    dt_ren = dt_ren.replace(tzinfo=timezone.utc)
                dias_restantes = (dt_ren.date() - ahora.date()).days
            except (ValueError, TypeError):
                continue

            nombre_cliente = f"{cliente.get('nombre', '')} {cliente.get('apellidos', '') or ''}".strip()
            empresa = cliente.get("empresa") or ""
            producto = cliente.get("producto") or "servicio"
            lead_id = cliente.get("lead_id")

            alerta = (
                f"[RENOVACIÓN] {nombre_cliente}"
                + (f" ({empresa})" if empresa else "")
                + f" — {producto} vence en {dias_restantes} {'día' if dias_restantes == 1 else 'días'} "
                f"({fecha_ren[:10]}). Contactar para renovar."
            )

            if lead_id:
                # Comprobamos si ya generamos esta alerta hoy
                ya_alertado = supabase.table("interactions").select("id").eq(
                    "lead_id", lead_id
                ).like("mensaje", "%[RENOVACIÓN]%").gte(
                    "created_at", ahora.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
                ).execute()

                if not ya_alertado.data:
                    supabase.table("interactions").insert({
                        "lead_id": lead_id,
                        "tipo": "nota_manual",
                        "mensaje": alerta,
                        "origen": "bot",
                        "sentimiento": "neutro",
                        "señal_escalado": dias_restantes <= 3,
                    }).execute()
                    alertas += 1
                    logger.info("Alerta renovación → cliente %s (%d días)", nombre_cliente, dias_restantes)
            else:
                # Sin lead vinculado — solo logueamos
                logger.warning("Renovación próxima (sin lead): %s — %d días", nombre_cliente, dias_restantes)
                alertas += 1

        except Exception as exc:  # pylint: disable=broad-except
            logger.error("Error verificando renovación cliente %s: %s", cliente.get("id"), exc)

    return alertas


# ============================================================
# Funciones de consulta para los endpoints del dashboard
# ============================================================

def obtener_resumen_pendientes() -> Dict[str, Any]:
    """
    Devuelve cuántos leads están en cada categoría de seguimiento pendiente.
    Usado por el endpoint GET /seguimiento/pendientes.
    """
    leads_enviados = _obtener_leads_mensaje_enviado()

    pendientes_r1 = 0
    pendientes_r2 = 0
    leads_frios_14 = 0

    for lead in leads_enviados:
        dias = _dias_desde(lead.get("updated_at", ""))
        if dias >= 14:
            leads_frios_14 += 1
        elif dias >= 7:
            pendientes_r2 += 1
        elif dias >= 3:
            pendientes_r1 += 1

    # Leads que respondieron y llevan >24h sin atención
    leads_sin_atencion = _obtener_leads_respondio_sin_atencion()

    return {
        "recordatorio_1_pendientes": pendientes_r1,    # 3-6 días sin respuesta
        "recordatorio_2_pendientes": pendientes_r2,    # 7-13 días sin respuesta
        "leads_frios_14_dias": leads_frios_14,         # 14+ días sin respuesta
        "alertas_sin_atencion_24h": len(leads_sin_atencion),
        "total_accion_requerida": pendientes_r1 + pendientes_r2 + leads_frios_14 + len(leads_sin_atencion),
    }


# ============================================================
# Ejecución directa
# ============================================================

if __name__ == "__main__":
    import json as _json
    resumen = ejecutar_seguimiento()
    print(_json.dumps(resumen, indent=2, ensure_ascii=False))
