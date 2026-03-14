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
Manuel es asesor financiero, asegurador y patrimonial. Sus productos:

1. CONTIGO PYME / AUTÓNOMOS — Seguro multirriesgo para negocios y autónomos.
   Cubre: responsabilidad civil, accidentes del propietario, daños en el local.
   Ideal para: cualquier autónomo o empresa pequeña. Desde ~30€/mes.

2. SANITAS SALUD — Seguro médico privado individual, familiar o colectivo para empresas.
   Ideal para: autónomos sin buena cobertura pública, familias, empresas para empleados.

3. CONTIGO FAMILIA / LIDERPLUS — Seguro de vida y protección familiar.
   Cubre: fallecimiento, invalidez, enfermedad grave.
   Ideal para: cabezas de familia, personas con hipoteca, autónomos.

4. SIALP / CONTIGO FUTURO / PGI — Ahorro e inversión con ventajas fiscales.
   Ideal para: empleados con nómina estable, autónomos con ingresos regulares, 30-55 años.

5. MIHOGAR / CASER — Seguro de hogar y vehículo.
   Ideal para: propietarios de vivienda, conductores.

6. HIPOTECAS ING / ABANCA — Intermediación hipotecaria.
   Ideal para: personas comprando primera vivienda, cambio hipoteca.
   ESPECIALMENTE VALIOSO para inmobiliarias: acuerdo de derivación = comisión por cada cliente.

INMOBILIARIAS son el lead más valioso: en un solo contacto se puede hablar de hipotecas
(acuerdo de derivación), seguro de hogar para nuevos compradores, seguro de vida,
y Contigo Pyme para la propia agencia.
"""

INSTRUCCIONES_MENSAJE = """
Reglas del mensaje:
- Máximo 3 líneas. No más.
- Tono: cercano y directo, como hablaría un conocido, no un vendedor.
- Primera línea: presentación natural de Manuel (sin "estimado", sin "me dirijo a usted").
- Segunda línea: el valor específico para ESE negocio/persona, mencionando algo concreto de su sector o situación.
- Tercera línea: una sola pregunta o CTA muy simple (¿hablamos 10 minutos? / ¿te cuento cómo funciona?).
- NO mencionar precio en el primer mensaje.
- NO usar emojis.
- NO usar lenguaje corporativo ni jerga de seguros.
- Si se conoce el nombre del propietario, usarlo. Si no, usar el nombre del negocio.
- El mensaje debe sonar como escrito por una persona real, no por una IA.
"""


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

    prompt = f"""Eres Manuel, asesor financiero y de seguros en España.
Tienes que escribir el primer mensaje de WhatsApp a este lead para presentarte y generar interés.

DATOS DEL LEAD:
{descripcion}

CONTEXTO DE TUS PRODUCTOS:
{PRODUCTOS_MANUEL}

{INSTRUCCIONES_MENSAJE}

Escribe SOLO el mensaje de WhatsApp, sin explicaciones, sin comillas, sin introducción.
El mensaje debe estar listo para copiar y enviar."""

    try:
        response = claude.messages.create(
            model="claude-haiku-4-5-20251001",  # Haiku: rápido y barato para mensajes
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
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

    sector = (lead.get("sector") or "").lower()
    if "inmob" in sector:
        return (
            f"Hola {destinatario}, soy Manuel, asesor financiero en {ciudad}. "
            f"Trabajo con inmobiliarias de la zona en acuerdos de derivación hipotecaria — "
            f"cuando un cliente tuyo necesita hipoteca, generáis una comisión sin trabajo extra. "
            f"¿Hablamos 15 minutos?"
        )
    return (
        f"Hola {destinatario}, soy Manuel, asesor financiero en {ciudad}. "
        f"Tengo algo que puede ser útil para {empresa or 'tu negocio'}. "
        f"¿Tienes 10 minutos esta semana?"
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

    procesados = 0
    generados = 0
    errores = 0

    for lead in leads:
        procesados += 1
        try:
            mensaje = generar_mensaje_whatsapp(lead)

            # Guardar en mensajes_pendientes para revisión
            sb.table("mensajes_pendientes").insert({
                "lead_id": lead["id"],
                "mensaje": mensaje,
                "estado": "pendiente",
                "comercial_id": lead.get("comercial_asignado"),
                "canal": "whatsapp",
            }).execute()

            generados += 1

        except Exception as e:
            logger.error(f"  ✗ Error para lead {lead.get('empresa', lead['id'])}: {e}")
            errores += 1

    resultado = {"procesados": procesados, "generados": generados, "errores": errores}
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
