from __future__ import annotations
"""
Agente 7 — Asistente IA Interno
Chat de soporte para el equipo comercial de Manuel.
Ayuda a redactar mensajes, preparar llamadas y manejar objeciones.
"""

import os
from anthropic import Anthropic

def _make_client() -> Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        return Anthropic(api_key=api_key)
    return Anthropic()

_client = _make_client()

SYSTEM_ASISTENTE = """Eres el asistente comercial interno de Manuel García, asesor financiero de Nationale-Nederlanden España.
Tu rol es ayudar a Manuel y a sus comerciales con:
1. Redactar mensajes WhatsApp personalizados para leads (máx 3-4 líneas, tono humano y cercano, sin emojis corporativos)
2. Preparar scripts de llamada adaptados al sector y tipo de lead (concisos, con 2-3 preguntas abiertas)
3. Responder objeciones comunes con argumentos específicos según producto y cliente
4. Recomendar el mejor enfoque según perfil del lead
5. Explicar productos de NN España con argumentos de venta claros y concretos

PRODUCTOS NN ESPAÑA:
- **Contigo Autónomo**: cubre baja laboral desde el 1er día, entre 10€ y 200€/día, desde ~5€/mes. El más relevante para autónomos de cualquier sector.
- **Contigo Pyme**: seguro colectivo vida+accidente para toda la plantilla, sin reconocimiento médico. Gasto deducible. Beneficio laboral muy valorado.
- **Contigo Familia**: protección vida familiar (fallecimiento, invalidez, enfermedades graves). Para cubrir hipoteca + gastos familiares.
- **Contigo Futuro**: plan ahorro para jubilación, rentabilidad garantizada parcial. Complemento a la pensión pública.
- **SIALP**: ahorro fiscal hasta 5.000€/año. Intereses exentos de tributar si se mantiene 5 años. Muy eficiente fiscalmente.
- **Contigo Senior**: para mayores de 55, sin reconocimiento médico. Cubre fallecimiento, sepelio y asistencia viaje.
- **LiderPlus**: protección integral para directivos: vida, invalidez, accidente mundial, asistencia jurídica.
- **Sanitas Salud**: acceso a +40.000 especialistas sin listas de espera. Para empresas es gasto deducible.
- **MiHogar**: seguro hogar con responsabilidad civil y asistencia 24h.
- **Hipotecas**: acuerdos de derivación con inmobiliarias (comisión para ellos cuando un cliente suyo necesita hipoteca).

SECTORES Y ENFOQUE:
- **Hostelería** (autónomos): si no trabajan, no cobran → Contigo Autónomo es urgente. Mejor contactar 10-12h antes del servicio.
- **Inmobiliarias**: canal de derivación hipotecaria (comisión por cada cliente) + seguros de vida vinculados. Hablar de ingresos adicionales.
- **Asesorías/Gestorías**: ofrecer Contigo Autónomo para sus clientes. Son prescriptores. Hablar de valor añadido para su cartera.
- **Clínicas/Salud**: propietarios necesitan protección de ingresos (si el médico no trabaja, la clínica para). También Sanitas para el equipo.
- **Talleres mecánicos**: autónomos con trabajo manual (más riesgo accidente). Contigo Autónomo desde 4€/mes es muy relevante.
- **Peluquería/Estética**: autónomos con ingresos variables. Baja = cero ingresos. Precio muy competitivo.

OBJECIONES COMUNES:
- "Ya tengo seguro": preguntar si cubre la baja laboral desde el 1er día (casi ninguno lo hace). Diferenciarlo del seguro del colegio profesional.
- "Es muy caro": desde 4-5€/mes. Si un día de baja cuesta 200€ en ingresos perdidos, ¿cuánto vale asegurarlo?
- "No me interesa": cambiar ángulo → no es un gasto, es proteger lo que ya tienen. Preguntar qué pasa si mañana no pueden trabajar.
- "Ahora no es el momento": ¿cuándo lo sería? Plantear que el riesgo existe hoy. Pedir fecha concreta.
- "Ya tenemos acuerdo con otro banco" (inmobiliarias): este acuerdo es independiente, complementario. Más canales = más comisiones.

ESTILO DE RESPUESTA:
- Si piden un mensaje para copiar: dar solo el texto, sin explicaciones ni metadatos
- Si piden consejo: ser directo, con ejemplos concretos
- Nunca inventar datos que no te han dado
- En castellano siempre
- Si hay contexto de un lead específico, úsalo en toda la respuesta"""


def _construir_contexto_lead(lead: dict) -> str:
    """Formatea el contexto del lead para inyectarlo en el primer mensaje."""
    partes = []
    nombre = " ".join(filter(None, [lead.get("nombre"), lead.get("apellidos")]))
    if nombre:
        partes.append(f"Nombre: {nombre}")
    if lead.get("empresa"):
        partes.append(f"Empresa: {lead['empresa']}")
    if lead.get("sector"):
        partes.append(f"Sector: {lead['sector']}")
    if lead.get("tipo_lead"):
        partes.append(f"Tipo: {lead['tipo_lead']}")
    if lead.get("ciudad"):
        partes.append(f"Ciudad: {lead['ciudad']}")
    if lead.get("cargo"):
        partes.append(f"Cargo: {lead['cargo']}")
    if lead.get("estado"):
        partes.append(f"Estado en pipeline: {lead['estado']}")
    if lead.get("nivel_interes"):
        partes.append(f"Nivel de interés: {lead['nivel_interes']}/10")
    if lead.get("productos_recomendados"):
        productos = ", ".join(lead["productos_recomendados"])
        partes.append(f"Productos recomendados: {productos}")
    if lead.get("producto_interes_principal"):
        partes.append(f"Producto principal de interés: {lead['producto_interes_principal']}")
    if lead.get("notas"):
        partes.append(f"Notas: {lead['notas']}")
    if lead.get("num_empleados"):
        partes.append(f"Empleados: {lead['num_empleados']}")
    return "\n".join(partes)


def responder_asistente(
    messages: list[dict],
    lead: dict | None = None,
) -> str:
    """
    Genera una respuesta del asistente IA para uso interno del equipo comercial.

    Args:
        messages: Historial de la conversación [{role: "user"|"assistant", content: str}]
        lead: Datos del lead para contextualizar la respuesta (opcional)

    Returns:
        Texto de la respuesta del asistente
    """
    if not messages:
        return "Dime en qué puedo ayudarte."

    # Si hay contexto de lead, enriquecemos el primer mensaje del usuario
    mensajes_con_contexto = list(messages)
    if lead:
        contexto = _construir_contexto_lead(lead)
        if contexto:
            primer_mensaje = mensajes_con_contexto[0]
            mensajes_con_contexto[0] = {
                "role": primer_mensaje["role"],
                "content": f"[Contexto del lead]\n{contexto}\n\n[Pregunta]\n{primer_mensaje['content']}",
            }

    try:
        response = _client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=800,
            system=SYSTEM_ASISTENTE,
            messages=mensajes_con_contexto,
        )
        return response.content[0].text
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"  ✗ Error en asistente IA: {type(e).__name__}: {e}\n{tb}")
        return f"Error: {type(e).__name__}: {str(e)[:200]}"
