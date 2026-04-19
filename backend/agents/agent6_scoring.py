"""
AGENTE 6 — Clasificador de Interés (Scoring)
Evalúa y actualiza continuamente el nivel de interés y temperatura de cada lead.
Se ejecuta cada vez que hay una nueva interacción con el lead.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Temperatura(str, Enum):
    CALIENTE = "caliente"
    TEMPLADO = "templado"
    FRIO = "frio"


class Prioridad(str, Enum):
    ALTA = "alta"
    MEDIA = "media"
    BAJA = "baja"


@dataclass
class ScoringResult:
    temperatura: Temperatura
    nivel_interes: int          # 0-10
    prioridad: Prioridad
    producto_interes_principal: Optional[str]
    proxima_accion: str
    motivo: str


# Palabras clave que aumentan el scoring
SEÑALES_CALIENTE = [
    "me interesa", "quiero contratarlo", "cómo lo contrato", "qué necesito",
    "cuándo podemos", "me llamas", "quiero saber más", "me parece bien",
    "lo veo bien", "vamos adelante", "cuánto cuesta exactamente", "precio concreto",
    "condiciones", "qué papeles necesito", "empezamos"
]

SEÑALES_TEMPLADO = [
    "cuéntame", "háblame", "qué cubre", "cómo funciona", "tengo una pregunta",
    "dudas", "comparar", "diferencia", "opciones", "pensarlo", "lo consulto",
    "más información", "me manda", "envíame"
]

SEÑALES_FRIO = [
    "no me interesa", "no gracias", "ya tengo", "no necesito", "demasiado caro",
    "otro momento", "ahora no", "no es para mí", "paso"
]


def calcular_señales(mensaje: str) -> tuple[int, int, int]:
    """
    Analiza un mensaje y devuelve (puntos_caliente, puntos_templado, puntos_frio).
    """
    mensaje_lower = mensaje.lower()
    caliente = sum(1 for s in SEÑALES_CALIENTE if s in mensaje_lower)
    templado = sum(1 for s in SEÑALES_TEMPLADO if s in mensaje_lower)
    frio = sum(1 for s in SEÑALES_FRIO if s in mensaje_lower)
    return caliente, templado, frio


def score_lead(
    interacciones: list[dict],
    dias_desde_primer_contacto: int,
    tiene_cita_agendada: bool,
    cita_rechazada: bool,
    escalo_a_humano: bool,
    productos_mencionados: list[str],
) -> ScoringResult:
    """
    Calcula el scoring actualizado de un lead basándose en toda su actividad.

    Args:
        interacciones: Lista de mensajes del lead (dicts con 'mensaje' y 'origen')
        dias_desde_primer_contacto: Días que llevan en contacto
        tiene_cita_agendada: Si hay una cita futura confirmada
        cita_rechazada: Si el lead rechazó una cita propuesta
        escalo_a_humano: Si el chatbot escaló a humano en algún momento
        productos_mencionados: Productos que el lead mencionó o por los que preguntó

    Returns:
        ScoringResult con temperatura, nivel, prioridad y próxima acción
    """
    puntos_totales = 0
    señales_caliente_total = 0
    señales_frio_total = 0
    motivos = []

    # Analizar mensajes del lead
    mensajes_lead = [i for i in interacciones if i.get("origen") == "lead"]

    for interaccion in mensajes_lead:
        c, t, f = calcular_señales(interaccion.get("mensaje", ""))
        señales_caliente_total += c
        señales_frio_total += f
        puntos_totales += (c * 3) + (t * 1) - (f * 4)

    # Bonificaciones por comportamiento
    if tiene_cita_agendada:
        puntos_totales += 8
        motivos.append("tiene cita agendada")

    if escalo_a_humano:
        puntos_totales += 5
        motivos.append("se escaló a humano")

    if len(mensajes_lead) >= 3:
        puntos_totales += 2
        motivos.append("conversación activa (3+ mensajes)")

    # Penalizaciones
    if cita_rechazada:
        puntos_totales -= 3
        motivos.append("rechazó cita")

    if dias_desde_primer_contacto > 14 and len(mensajes_lead) == 0:
        puntos_totales -= 5
        motivos.append("sin respuesta en 14+ días")

    if dias_desde_primer_contacto > 7 and len(mensajes_lead) <= 1:
        puntos_totales -= 2
        motivos.append("poca actividad en 7+ días")

    # Convertir puntos a nivel de interés 0-10
    nivel_interes = max(0, min(10, puntos_totales))

    # Determinar temperatura
    if señales_frio_total >= 2 or puntos_totales < 0:
        temperatura = Temperatura.FRIO
    elif tiene_cita_agendada or escalo_a_humano or señales_caliente_total >= 2 or nivel_interes >= 7:
        temperatura = Temperatura.CALIENTE
    elif nivel_interes >= 3:
        temperatura = Temperatura.TEMPLADO
    else:
        temperatura = Temperatura.FRIO

    # Determinar prioridad
    if temperatura == Temperatura.CALIENTE:
        prioridad = Prioridad.ALTA
    elif temperatura == Temperatura.TEMPLADO:
        prioridad = Prioridad.MEDIA
    else:
        prioridad = Prioridad.BAJA

    # Producto de mayor interés (el más mencionado)
    producto_principal = productos_mencionados[0] if productos_mencionados else None

    # Determinar próxima acción recomendada
    if temperatura == Temperatura.CALIENTE and not tiene_cita_agendada:
        proxima_accion = "LLAMAR HOY — Lead caliente sin cita agendada"
    elif tiene_cita_agendada:
        proxima_accion = "Preparar reunión — Cita ya agendada"
    elif temperatura == Temperatura.TEMPLADO and dias_desde_primer_contacto > 3:
        proxima_accion = "Enviar seguimiento — Lead templado sin actividad reciente"
    elif señales_frio_total >= 2:
        proxima_accion = "Dejar enfriar 30 días — Lead marcó señales de no interés"
    elif dias_desde_primer_contacto > 14 and temperatura == Temperatura.FRIO:
        proxima_accion = "Archivar o enviar reactivación — Sin actividad en 14+ días"
    else:
        proxima_accion = "Mantener conversación activa — Continuar nutriendo"

    motivo_str = "; ".join(motivos) if motivos else "scoring inicial"

    return ScoringResult(
        temperatura=temperatura,
        nivel_interes=nivel_interes,
        prioridad=prioridad,
        producto_interes_principal=producto_principal,
        proxima_accion=proxima_accion,
        motivo=motivo_str
    )


def score_desde_cuestionario(lead_data: dict) -> int:
    """
    Puntos de scoring adicionales basados en datos del cuestionario de captación.
    Se suma al resultado de score_lead() para leads con fuente 'inbound'.
    """
    puntos = 0
    tipo_lead = lead_data.get("tipo_lead")
    tiene_hijos = lead_data.get("tiene_hijos")
    tiene_hipoteca = lead_data.get("tiene_hipoteca")
    fuente = lead_data.get("fuente")
    notas = lead_data.get("notas") or ""

    # Lead vino a nosotros (inbound) → intención alta por definición
    if fuente == "inbound":
        puntos += 3

    # Autónomo con hijos → necesidad doble (cobertura profesional + familiar)
    if tipo_lead == "autonomo" and tiene_hijos:
        puntos += 4

    # Hipoteca → necesidad clara de MiHogar o seguro de vida
    if tiene_hipoteca:
        puntos += 3

    # Urgencia declarada en el formulario
    if "Urgencia: hoy_manana" in notas or "hoy_manana" in notas:
        puntos += 5
    elif "Urgencia: esta_semana" in notas or "esta_semana" in notas:
        puntos += 2

    return puntos


# ============================================================
# Demo / test local
# ============================================================
if __name__ == "__main__":
    print("=== DEMO AGENTE 6 — SCORING ===\n")

    # Escenario 1: Lead caliente
    print("Escenario 1: Lead que quiere contratar")
    resultado = score_lead(
        interacciones=[
            {"origen": "lead", "mensaje": "Hola, me interesa lo del seguro de autónomo"},
            {"origen": "bot", "mensaje": "¡Hola! Te cuento..."},
            {"origen": "lead", "mensaje": "¿Cuánto cuesta exactamente? Quiero contratarlo"},
        ],
        dias_desde_primer_contacto=1,
        tiene_cita_agendada=False,
        cita_rechazada=False,
        escalo_a_humano=True,
        productos_mencionados=["contigo_autonomo"]
    )
    print(f"  Temperatura: {resultado.temperatura.value}")
    print(f"  Nivel interés: {resultado.nivel_interes}/10")
    print(f"  Prioridad: {resultado.prioridad.value}")
    print(f"  Próxima acción: {resultado.proxima_accion}")
    print()

    # Escenario 2: Lead frío
    print("Escenario 2: Lead que no responde")
    resultado2 = score_lead(
        interacciones=[],
        dias_desde_primer_contacto=15,
        tiene_cita_agendada=False,
        cita_rechazada=False,
        escalo_a_humano=False,
        productos_mencionados=[]
    )
    print(f"  Temperatura: {resultado2.temperatura.value}")
    print(f"  Nivel interés: {resultado2.nivel_interes}/10")
    print(f"  Próxima acción: {resultado2.proxima_accion}")
