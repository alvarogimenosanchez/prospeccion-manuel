from __future__ import annotations
"""
Agente 3 — Generador de mensajes personalizados con Claude
Dado un lead enriquecido, genera el mensaje de primer contacto por WhatsApp
usando Claude para máxima personalización y naturalidad.

El comercial recibe el mensaje generado para revisar y aprobar con un click.
"""

import os
import logging
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
import anthropic
from supabase import create_client

load_dotenv()

logger = logging.getLogger("agent3_mensajes")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ============================================================
# Contexto de productos de Manuel
# ============================================================

PRODUCTOS_MANUEL = """
Manuel es asesor financiero y de seguros de Nationale-Nederlanden España.

PRODUCTOS CLAVE:
- Contigo Autónomo: cubre baja laboral desde el 1er día, entre 10-200€/día, desde ~5€/mes.
  El más relevante para cualquier autónomo. Si no trabajan, no cobran → esto lo soluciona.
- Contigo Pyme: seguro colectivo vida+accidente para toda la plantilla, sin reconocimiento médico.
  Es gasto deducible y beneficio laboral muy valorado. Para empresas con empleados.
- Contigo Familia: protección de vida (fallecimiento, invalidez, enfermedades graves). Cubre hipoteca.
- Contigo Futuro / SIALP: ahorro fiscal para jubilación. SIALP: hasta 5.000€/año libres de tributar.
- LiderPlus: protección integral para directivos (vida, invalidez, accidente mundial).
- Sanitas Salud: acceso a +40.000 especialistas sin listas de espera. Deducible en empresa.
- MiHogar: seguro de hogar con responsabilidad civil y asistencia 24h.
- Hipotecas (derivación): acuerdo con inmobiliarias → comisión por cada cliente hipotecario.

ENFOQUES POR SECTOR:
- Hostelería/talleres/peluquerías (autónomos): Contigo Autónomo — si paran, pierden todo.
- Inmobiliarias: acuerdo de derivación hipotecaria (comisión pasiva) + Contigo Pyme para la agencia.
- Asesorías/gestorías: prescriptores de Contigo Autónomo para sus clientes. Valor añadido.
- Clínicas/salud: si el médico no trabaja, la clínica para → Contigo Autónomo urgente.
- Pymes con plantilla: Contigo Pyme — beneficio laboral y gasto deducible.
"""

URL_CUESTIONARIO = os.environ.get("CUESTIONARIO_URL", "https://manuelasesora.es/captacion")

INSTRUCCIONES_MENSAJE = f"""
Reglas del mensaje:
- Máximo 3-4 líneas. Ni más ni menos.
- Tono: completamente humano, como si fuera un amigo conocido del sector, sin sonar a vendedor ni a bot.
- Primera línea: saludo natural usando el nombre si se tiene. Sin "estimado", sin formalismos.
- Segunda línea: referencia concreta y específica a su negocio/sector/situación — que parezca que Manuel los conoce.
- Tercera línea: propuesta de valor muy concreta, sin jerga de seguros, en lenguaje de calle.
- Última línea: invitación al cuestionario para que el lead pueda ver qué necesita sin compromiso.
  Usa exactamente esta URL: {URL_CUESTIONARIO}
  Ejemplo: "Si te apetece, aquí puedes ver en 2 minutos qué opciones encajan con tu situación: {URL_CUESTIONARIO}"
  O bien: "Rellena esto en 2 minutos y te digo exactamente qué te conviene: {URL_CUESTIONARIO}"
- Si el lead es una inmobiliaria, el CTA puede ser también una pregunta directa sobre derivación.
- NO mencionar precio en el primer mensaje.
- NO usar emojis.
- NO usar lenguaje corporativo ni jerga de seguros (no decir "póliza", "cobertura", "prima").
- El mensaje debe sonar ESCRITO A MANO por Manuel, no generado por IA.
- Variedad: no uses siempre la misma estructura. Cambia el orden, el tono, la longitud según el perfil.
"""

# System prompt estático — se cachea en Anthropic entre llamadas del mismo lote
_SYSTEM_CACHED = [
    {
        "type": "text",
        "text": (
            "Eres Manuel, asesor financiero y de seguros en España.\n"
            "Tu tarea es escribir mensajes de primer contacto por WhatsApp a leads.\n"
            f"\nCONTEXTO DE TUS PRODUCTOS:\n{PRODUCTOS_MANUEL}\n"
            f"\nREGLAS DEL MENSAJE:\n{INSTRUCCIONES_MENSAJE}"
        ),
        "cache_control": {"type": "ephemeral"},
    }
]


# ============================================================
# Generador principal
# ============================================================

def generar_mensaje_whatsapp(lead: dict) -> str:
    """
    Genera un mensaje de primer contacto personalizado con Claude.
    Usa todos los datos disponibles del lead para máxima personalización.
    """
    nombre = lead.get("nombre") or ""
    apellidos = lead.get("apellidos") or ""
    empresa = lead.get("empresa") or ""
    sector = lead.get("sector") or ""
    ciudad = lead.get("ciudad") or ""
    cargo = lead.get("cargo") or ""
    tipo_lead = lead.get("tipo_lead") or ""
    productos = lead.get("productos_recomendados") or []
    num_empleados = lead.get("num_empleados")
    señales = lead.get("señales_detectadas") or []
    web = lead.get("web") or ""

    # Construir descripción del lead para Claude
    descripcion_lead = []
    if nombre and apellidos:
        descripcion_lead.append(f"Nombre: {nombre} {apellidos}")
    elif nombre:
        descripcion_lead.append(f"Nombre de contacto: {nombre}")
    if cargo:
        descripcion_lead.append(f"Cargo: {cargo}")
    if empresa:
        descripcion_lead.append(f"Empresa: {empresa}")
    if sector:
        descripcion_lead.append(f"Sector: {sector}")
    if ciudad:
        descripcion_lead.append(f"Ciudad: {ciudad}")
    if tipo_lead:
        descripcion_lead.append(f"Tipo: {tipo_lead}")
    if num_empleados:
        descripcion_lead.append(f"Empleados aproximados: {num_empleados}")
    if web:
        descripcion_lead.append(f"Web: {web}")
    if señales:
        descripcion_lead.append(f"Señales detectadas: {', '.join(señales)}")
    if productos:
        descripcion_lead.append(f"Productos recomendados para este perfil: {', '.join(productos)}")

    descripcion = "\n".join(descripcion_lead) if descripcion_lead else "Lead sin datos detallados"

    user_prompt = (
        f"DATOS DEL LEAD:\n{descripcion}\n\n"
        "Escribe SOLO el mensaje de WhatsApp, sin explicaciones, sin comillas, sin introducción.\n"
        "El mensaje debe estar listo para copiar y enviar."
    )

    try:
        response = claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=280,
            system=_SYSTEM_CACHED,
            messages=[{"role": "user", "content": user_prompt}],
        )
        mensaje = response.content[0].text.strip()
        logger.info(f"  ✓ Mensaje generado para {empresa or nombre} ({len(mensaje)} chars)")
        return mensaje

    except Exception as e:
        logger.error(f"  ✗ Error Claude para {empresa}: {e}")
        # Fallback a plantilla estática si Claude falla
        return _mensaje_fallback(lead)


def _mensaje_fallback(lead: dict) -> str:
    """Plantilla estática de emergencia si Claude no está disponible."""
    nombre = lead.get("nombre") or ""
    empresa = lead.get("empresa") or ""
    ciudad = lead.get("ciudad") or ""
    destinatario = nombre if nombre else empresa if empresa else "hola"
    url = URL_CUESTIONARIO

    sector = (lead.get("sector") or "").lower()
    if "inmob" in sector:
        return (
            f"Hola {destinatario}, soy Manuel, asesor financiero en {ciudad}. "
            f"Trabajo con inmobiliarias de la zona en acuerdos de derivación hipotecaria — "
            f"cuando un cliente tuyo necesita hipoteca, generáis una comisión sin trabajo extra. "
            f"¿Hablamos 15 minutos? O si prefieres ver primero de qué va: {url}"
        )
    return (
        f"Hola {destinatario}, soy Manuel, asesor financiero en {ciudad}. "
        f"Tengo algo que puede ser útil para {empresa or 'tu negocio'}. "
        f"Si quieres ver qué opciones te encajan antes de hablar, aquí en 2 minutos: {url}"
    )


# ============================================================
# Generar mensajes en lote para leads sin mensaje
# ============================================================

def generar_mensajes_lote(limite: int = 30) -> dict:
    """
    Genera mensajes de primer contacto para leads que aún no tienen mensaje generado.
    Guarda el mensaje en la tabla `mensajes_pendientes` para revisión del comercial.
    Returns: {"procesados": N, "generados": N, "errores": N}
    """
    # Leads con teléfono WhatsApp, estado nuevo, sin mensaje pendiente ya generado
    resp = sb.table("leads").select(
        "id, nombre, apellidos, empresa, sector, ciudad, cargo, tipo_lead, "
        "productos_recomendados, num_empleados, señales_detectadas, web, "
        "telefono_whatsapp, comercial_asignado"
    ).eq("estado", "nuevo").not_.is_("telefono_whatsapp", "null").limit(limite).execute()

    leads = resp.data or []

    # Filtrar los que ya tienen mensaje pendiente
    if leads:
        ids = [l["id"] for l in leads]
        ya_tienen = sb.table("mensajes_pendientes").select("lead_id").in_("lead_id", ids).eq("estado", "pendiente").execute()
        ids_con_mensaje = {r["lead_id"] for r in (ya_tienen.data or [])}
        leads = [l for l in leads if l["id"] not in ids_con_mensaje]

    logger.info(f"Generando mensajes para {len(leads)} leads...")

    generados = 0
    errores = 0

    def _generar_y_guardar(lead: dict) -> bool:
        """Genera y persiste el mensaje para un lead. Returns True on success."""
        mensaje = generar_mensaje_whatsapp(lead)
        sb.table("mensajes_pendientes").insert({
            "lead_id": lead["id"],
            "mensaje": mensaje,
            "estado": "pendiente",
            "comercial_id": lead.get("comercial_asignado"),
            "canal": "whatsapp",
        }).execute()
        return True

    # Parallelize Claude calls — each takes 1-3s; sequential would be 30-90s for 30 leads
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_generar_y_guardar, lead): lead for lead in leads}
        for future in as_completed(futures):
            lead = futures[future]
            try:
                future.result()
                generados += 1
            except Exception as e:
                logger.error(f"  ✗ Error para lead {lead.get('empresa', lead['id'])}: {e}")
                errores += 1

    resultado = {"procesados": len(leads), "generados": generados, "errores": errores}
    logger.info(f"Mensajes generados: {resultado}")
    return resultado


# ============================================================
# Aprobar y marcar como enviado
# ============================================================

def aprobar_mensaje(mensaje_id: str, mensaje_editado: Optional[str] = None) -> bool:
    """
    Marca un mensaje como aprobado (con o sin edición del comercial).
    El envío real lo gestiona el endpoint de WhatsApp.
    """
    update = {"estado": "aprobado"}
    if mensaje_editado:
        update["mensaje"] = mensaje_editado
        update["editado_por_comercial"] = True

    resp = sb.table("mensajes_pendientes").update(update).eq("id", mensaje_id).execute()
    return bool(resp.data)


def descartar_mensaje(mensaje_id: str) -> bool:
    """Descarta un mensaje sin enviarlo."""
    resp = sb.table("mensajes_pendientes").update({"estado": "descartado"}).eq("id", mensaje_id).execute()
    return bool(resp.data)


if __name__ == "__main__":
    print("Generando mensajes de prueba...")
    resultado = generar_mensajes_lote(limite=5)
    print(f"Resultado: {resultado}")
