"""
AGENTE 5 — Chatbot WhatsApp
Gestiona la conversación con el lead en WhatsApp.
- Responde preguntas sobre productos
- Detecta intención de compra
- Agenda citas
- Escala a humano cuando es necesario
"""

import json
from pathlib import Path
from typing import Optional
from anthropic import Anthropic

# Carga la base de conocimiento de productos
KB_PATH = Path(__file__).parent.parent.parent / "knowledge_base_productos.json"
with open(KB_PATH, "r", encoding="utf-8") as f:
    KNOWLEDGE_BASE = json.load(f)


def build_products_context() -> str:
    """Construye el contexto de productos para el prompt del sistema."""
    productos_texto = []
    for p in KNOWLEDGE_BASE["productos"]:
        texto = f"""
PRODUCTO: {p['nombre']} (ID: {p['id']})
Categoría: {p['categoria']}
Descripción: {p['descripcion_chatbot']}
Precio desde: {p.get('precio_desde', p.get('precio_opcion_b', 'Consultar'))}
Ventaja diferencial: {p['ventaja_diferencial']}
Perfil ideal: {', '.join(p['perfil_ideal'])}
"""
        if p.get("preguntas_frecuentes"):
            faqs_raw = p["preguntas_frecuentes"]
            if faqs_raw and isinstance(faqs_raw[0], dict):
                faqs = "\n".join([f"  P: {faq['pregunta']}\n  R: {faq['respuesta']}" for faq in faqs_raw])
            else:
                faqs = "\n".join([f"  - {faq}" for faq in faqs_raw])
            texto += f"FAQs:\n{faqs}"
        productos_texto.append(texto.strip())

    # Servicios complementarios
    complementarios_texto = []
    for s in KNOWLEDGE_BASE["servicios_externos_complementarios"].values():
        complementarios_texto.append(f"- {s['nombre']}: {s['descripcion']}")

    return f"""
=== PRODUCTOS NATIONALE-NEDERLANDEN (Manuel es agente oficial) ===

{chr(10).join(productos_texto)}

=== OTROS SERVICIOS (detalles a consultar con Manuel) ===
{chr(10).join(complementarios_texto)}
"""


SYSTEM_PROMPT = """Eres el asistente comercial de Manuel, agente de Nationale-Nederlanden especializado en servicios financieros, seguros y protección patrimonial.

Tu misión: mantener conversaciones por WhatsApp con potenciales clientes (leads), responder sus preguntas con claridad, generar interés genuino y detectar el momento ideal para conectar con Manuel o su equipo.

{products_context}

=== REGLAS DE COMPORTAMIENTO ===

1. TONO: Cercano, profesional, sin jerga técnica. Habla como una persona real, no como un robot.
   - Con particulares y autónomos: tono más personal y cercano
   - Con directivos de empresa: más formal pero siempre humano

2. PRESENTACIÓN: Si es el primer mensaje del lead, preséntate brevemente:
   "Hola [nombre], soy el asistente de Manuel. ¿En qué puedo ayudarte?"

3. ESCUCHA ACTIVA: Haz preguntas para entender la situación del lead antes de recomendar.
   No vendas inmediatamente. Entiende primero, recomienda después.

4. RECOMENDACIONES: Cuando hagas match entre el perfil del lead y un producto, explica
   POR QUÉ ese producto encaja con SU situación concreta. No hagas presentaciones genéricas.

5. ESCALADO OBLIGATORIO A MANUEL/EQUIPO — Cuando detectes cualquiera de estas señales:
   - El lead pregunta por precio concreto o condiciones exactas de contratación
   - El lead dice "me interesa", "quiero contratarlo", "cómo lo hago"
   - El lead quiere hablar con alguien directamente
   - La pregunta es compleja y no tienes respuesta segura
   → En ese momento responde con algo como:
   "Perfecto, esto lo gestiona directamente Manuel. ¿Prefieres que te llame él ahora, o agendamos una llamada para cuando mejor te venga?"

6. AGENDA: Si el lead quiere agendar una llamada, pide:
   - Su disponibilidad (días y horas)
   - Confirma: "Perfecto, Manuel te llamará el [día] a las [hora]. ¿Algo más que quieras preguntarme mientras tanto?"

7. DATOS CONFIDENCIALES: Nunca compartas precios exactos de cotización individual
   (dependen de edad, estado de salud, etc.). Sí puedes dar precios desde/orientativos.

8. HONESTIDAD: Si no sabes algo, dilo. Mejor "eso te lo confirma Manuel directamente"
   que inventar información.

=== ESTRUCTURA DE TU RESPUESTA ===

Siempre responde en formato JSON con esta estructura:
{{
  "mensaje": "El texto del mensaje para enviar al lead por WhatsApp",
  "intención_detectada": "curiosidad|interés|compra|rechazo|pregunta_info|agendando",
  "productos_mencionados": ["id_producto1", "id_producto2"],
  "escalar_a_humano": true/false,
  "motivo_escalado": "razón si escalar_a_humano es true, null si false",
  "cita_solicitada": true/false,
  "disponibilidad_lead": "texto libre con disponibilidad si la menciona, null si no"
}}

El "mensaje" debe estar listo para enviar directamente por WhatsApp, sin formateo especial.
Máximo 300 caracteres para mensajes de texto simples. Si necesitas más, divide en varios mensajes (devuelve array en "mensaje").
"""


class ChatbotAgent:
    """
    Agente 5: Chatbot WhatsApp con memoria de conversación.
    Usa la API de Claude con multi-turn conversation.
    """

    def __init__(self, lead_id: str, lead_nombre: str, lead_perfil: Optional[dict] = None):
        self.client = Anthropic()
        self.lead_id = lead_id
        self.lead_nombre = lead_nombre
        self.lead_perfil = lead_perfil or {}
        self.conversation_history: list[dict] = []

        # Sistema prompt personalizado con contexto del lead si está disponible
        self.system = SYSTEM_PROMPT.format(
            products_context=build_products_context()
        )
        if lead_perfil:
            perfil_context = f"\n\n=== CONTEXTO DEL LEAD ACTUAL ===\n"
            if lead_perfil.get("tipo_lead"):
                perfil_context += f"Tipo: {lead_perfil['tipo_lead']}\n"
            if lead_perfil.get("cargo"):
                perfil_context += f"Cargo: {lead_perfil['cargo']}\n"
            if lead_perfil.get("empresa"):
                perfil_context += f"Empresa: {lead_perfil['empresa']}\n"
            if lead_perfil.get("sector"):
                perfil_context += f"Sector: {lead_perfil['sector']}\n"
            if lead_perfil.get("productos_recomendados"):
                perfil_context += f"Productos recomendados por el sistema: {', '.join(lead_perfil['productos_recomendados'])}\n"
            self.system += perfil_context

    def process_message(self, incoming_message: str) -> dict:
        """
        Procesa un mensaje entrante del lead y devuelve la respuesta del agente.

        Returns:
            dict con keys: mensaje, intencion_detectada, escalar_a_humano, etc.
        """
        # Añadir mensaje del lead al historial
        self.conversation_history.append({
            "role": "user",
            "content": incoming_message
        })

        # Llamar a Claude
        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=self.system,
            messages=self.conversation_history
        )

        assistant_message = response.content[0].text

        # Añadir respuesta al historial
        self.conversation_history.append({
            "role": "assistant",
            "content": assistant_message
        })

        # Parsear JSON de la respuesta
        try:
            result = json.loads(assistant_message)
        except json.JSONDecodeError:
            # Fallback si Claude no devuelve JSON válido
            result = {
                "mensaje": assistant_message,
                "intencion_detectada": "pregunta_info",
                "productos_mencionados": [],
                "escalar_a_humano": False,
                "motivo_escalado": None,
                "cita_solicitada": False,
                "disponibilidad_lead": None
            }

        return result

    def get_conversation_summary(self) -> str:
        """
        Genera un resumen de la conversación para el dashboard del comercial.
        Útil cuando hay que escalar a humano.
        """
        if not self.conversation_history:
            return "Sin conversación previa."

        summary_response = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system="Eres un asistente que resume conversaciones comerciales de forma concisa.",
            messages=[
                {
                    "role": "user",
                    "content": f"Resume en máximo 3 bullets esta conversación con un lead potencial:\n\n{json.dumps(self.conversation_history, ensure_ascii=False)}\n\nIncluye: qué le interesa, qué preguntó, en qué punto está."
                }
            ]
        )

        return summary_response.content[0].text


# ============================================================
# Función de conveniencia para uso desde el webhook de FastAPI
# ============================================================

# Cache simple en memoria de conversaciones activas
# En producción usar Redis o cargar historial desde Supabase
_active_conversations: dict[str, ChatbotAgent] = {}


def get_or_create_chatbot(lead_id: str, lead_nombre: str, lead_perfil: Optional[dict] = None) -> ChatbotAgent:
    """Obtiene o crea un ChatbotAgent para un lead específico."""
    if lead_id not in _active_conversations:
        _active_conversations[lead_id] = ChatbotAgent(lead_id, lead_nombre, lead_perfil)
    return _active_conversations[lead_id]


def handle_incoming_whatsapp(lead_id: str, lead_nombre: str, message: str, lead_perfil: Optional[dict] = None) -> dict:
    """
    Punto de entrada principal desde el webhook de WhatsApp.

    Args:
        lead_id: ID del lead en Supabase
        lead_nombre: Nombre del lead
        message: Mensaje recibido por WhatsApp
        lead_perfil: Datos del perfil del lead (opcional, para personalización)

    Returns:
        dict con la respuesta lista para enviar
    """
    chatbot = get_or_create_chatbot(lead_id, lead_nombre, lead_perfil)
    return chatbot.process_message(message)


# ============================================================
# Demo / test local
# ============================================================
if __name__ == "__main__":
    print("=== DEMO CHATBOT AGENTE 5 ===\n")
    print("Simulando conversación con un autónomo interesado...\n")

    lead_perfil = {
        "tipo_lead": "autonomo",
        "cargo": "Autónomo",
        "sector": "Hostelería",
        "ciudad": "Madrid",
        "productos_recomendados": ["contigo_autonomo", "sialp"]
    }

    bot = ChatbotAgent(
        lead_id="demo-123",
        lead_nombre="Pedro García",
        lead_perfil=lead_perfil
    )

    conversacion = [
        "Hola, me has escrito por lo del seguro. Cuéntame",
        "Soy autónomo, tengo un bar. Me preocupa qué pasa si me pongo malo y no puedo abrir",
        "¿Y cuánto costaría más o menos?",
    ]

    for mensaje_lead in conversacion:
        print(f"LEAD: {mensaje_lead}")
        respuesta = bot.process_message(mensaje_lead)
        print(f"BOT: {respuesta['mensaje']}")
        print(f"  [intención: {respuesta['intencion_detectada']} | escalar: {respuesta['escalar_a_humano']}]")
        print()
