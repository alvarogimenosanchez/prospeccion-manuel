"""
Agente 3 — Módulo centralizado de plantillas de mensajes.

Contiene:
  - generar_primer_contacto(lead)   → mensaje de primer contacto personalizado
  - generar_asunto_email(lead)      → asunto de email según perfil
  - recomendar_productos(lead)      → lista de IDs de producto recomendados
  - calcular_score_inicial(lead)    → score 0-10 al crear el lead

Compatible con Python 3.9+.
"""

from __future__ import annotations

from typing import Optional, List, Dict, Any


# ============================================================
# Helpers internos
# ============================================================

def _normalizar(valor: Optional[str]) -> str:
    """Devuelve el valor en minúsculas o cadena vacía si es None."""
    return (valor or "").lower().strip()


def _campo(lead: Dict[str, Any], clave: str, defecto: str = "") -> str:
    """Extrae un campo del lead; devuelve defecto si es None o vacío."""
    return (lead.get(clave) or defecto).strip()


def _rellenar(plantilla: str, lead: Dict[str, Any]) -> str:
    """
    Sustituye las variables estándar de la plantilla con los datos del lead.
    Variables soportadas: {nombre}, {empresa}, {ciudad}, {num_empleados}.
    """
    nombre = _campo(lead, "nombre", "hola")
    empresa = _campo(lead, "empresa", "vuestra empresa")
    ciudad = _campo(lead, "ciudad", "tu ciudad")
    num_empleados = str(lead.get("num_empleados") or "tu equipo")

    return (
        plantilla
        .replace("{nombre}", nombre)
        .replace("{empresa}", empresa)
        .replace("{ciudad}", ciudad)
        .replace("{num_empleados}", num_empleados)
    )


# ============================================================
# Detección de sub-segmento
# ============================================================

def _es_inmobiliaria(lead: Dict[str, Any]) -> bool:
    sector = _normalizar(lead.get("sector"))
    empresa = _normalizar(lead.get("empresa"))
    cargo = _normalizar(lead.get("cargo"))
    return any(
        kw in s
        for kw in ("inmobiliaria", "inmobil", "agencia inmob", "gestor inmob", "agente prop")
        for s in (sector, empresa, cargo)
    )


def _es_asesoria(lead: Dict[str, Any]) -> bool:
    sector = _normalizar(lead.get("sector"))
    empresa = _normalizar(lead.get("empresa"))
    return any(
        kw in s
        for kw in ("asesor", "gestor", "gestoría", "asesoría", "contab", "fiscal", "tax")
        for s in (sector, empresa)
    )


def _es_hosteleria(lead: Dict[str, Any]) -> bool:
    sector = _normalizar(lead.get("sector"))
    empresa = _normalizar(lead.get("empresa"))
    return any(
        kw in s
        for kw in ("hostel", "restaur", "bar ", "cafeter", "hotel", "tabern", "catering", "gastro")
        for s in (sector, empresa)
    )


def _es_mayor_55(lead: Dict[str, Any]) -> bool:
    edad = lead.get("edad_estimada")
    if edad is None:
        return False
    try:
        return int(edad) >= 55
    except (ValueError, TypeError):
        return False


def _tiene_hipoteca(lead: Dict[str, Any]) -> bool:
    return bool(lead.get("tiene_hipoteca"))


# ============================================================
# generar_primer_contacto
# ============================================================

_PLANTILLAS_PRIMER_CONTACTO: Dict[str, str] = {
    "inmobiliaria": (
        "Hola {nombre}, soy Manuel, asesor financiero en {ciudad}. Vi que diriges {empresa} "
        "y trabajo con varias inmobiliarias de la zona en acuerdos de derivación hipotecaria "
        "— básicamente, cuando un cliente tuyo necesita hipoteca, os generáis una comisión "
        "sin hacer nada extra. ¿Tiene sentido que hablemos 15 minutos?"
    ),
    "asesoria": (
        "Hola {nombre}, soy Manuel. Trabajo con asesorías como {empresa} para ofrecer a sus "
        "clientes autónomos un seguro que cubre desde el primer día de baja — algo que muchos "
        "autónomos necesitan y ninguna gestoría tiene. ¿Podríamos ver si encajaría con vuestra "
        "cartera de clientes?"
    ),
    "autonomo_hosteleria": (
        "Hola {nombre}, vi que tienes {empresa} en {ciudad}. Trabajo con autónomos del sector "
        "y muchos no saben que existe un seguro desde 5€/mes que te cubre el día que te pones "
        "enfermo — porque si no trabajas, no cobras. ¿Te cuento en 5 minutos?"
    ),
    "autonomo_general": (
        "Hola {nombre}, soy Manuel. ¿Tienes cubierto qué pasa si mañana no puedes trabajar? "
        "Como autónomo, cada día de baja es dinero que no entra. Tengo algo específico para tu "
        "situación desde 5€/mes. ¿Hablamos?"
    ),
    "pyme_general": (
        "Hola {nombre}, soy Manuel, asesor en {ciudad}. ¿{empresa} tiene seguro de vida "
        "colectivo para el equipo? Es el beneficio laboral más valorado por empleados y no "
        "requiere reconocimiento médico. Si tienes {num_empleados} personas, el coste es mínimo. "
        "¿Lo vemos?"
    ),
    "particular_hipoteca": (
        "Hola {nombre}, soy Manuel. Si tienes hipoteca, hay algo importante que deberías saber: "
        "desde 5€/mes puedes asegurarte de que tu familia no pierde la casa si te pasa algo. "
        "Sin exámenes médicos. ¿Te parece si te explico cómo funciona?"
    ),
    "particular_mayor55": (
        "Hola {nombre}, soy Manuel. Trabajo con personas como tú que quieren tener algo reservado "
        "para sus hijos o cubrir gastos imprevistos. Tengo productos específicos para mayores de 55 "
        "sin reconocimiento médico. ¿Tienes un momento?"
    ),
    "generico": (
        "Hola {nombre}, soy Manuel, asesor de seguros y productos financieros en {ciudad}. "
        "Me gustaría presentarte algo que puede ser útil para tu situación. "
        "¿Tienes 5 minutos esta semana?"
    ),
}


def generar_primer_contacto(lead: Dict[str, Any]) -> str:
    """
    Genera el mensaje de primer contacto personalizado según el perfil del lead.

    Jerarquía de selección de plantilla:
      1. Inmobiliaria (sector o empresa con keywords inmobiliarias)
      2. Asesoría / Gestoría
      3. Autónomo hostelería
      4. Autónomo general
      5. Pyme general (tipo pyme o empresa)
      6. Particular con hipoteca
      7. Particular mayor de 55
      8. Genérico
    """
    tipo = _normalizar(lead.get("tipo_lead"))

    if _es_inmobiliaria(lead):
        clave = "inmobiliaria"
    elif _es_asesoria(lead):
        clave = "asesoria"
    elif tipo == "autonomo" and _es_hosteleria(lead):
        clave = "autonomo_hosteleria"
    elif tipo == "autonomo":
        clave = "autonomo_general"
    elif tipo in ("pyme", "empresa"):
        clave = "pyme_general"
    elif tipo == "particular" and _tiene_hipoteca(lead):
        clave = "particular_hipoteca"
    elif tipo == "particular" and _es_mayor_55(lead):
        clave = "particular_mayor55"
    else:
        clave = "generico"

    plantilla = _PLANTILLAS_PRIMER_CONTACTO[clave]
    return _rellenar(plantilla, lead)


# ============================================================
# generar_asunto_email
# ============================================================

_ASUNTOS_EMAIL: Dict[str, str] = {
    "inmobiliaria": "Ingresos adicionales por derivación hipotecaria — {empresa}",
    "asesoria": "Nuevo servicio para los autónomos de {empresa}",
    "autonomo": "¿Qué pasa si mañana no puedes trabajar? (para autónomos)",
    "pyme": "Seguro colectivo para {empresa} — sin reconocimiento médico",
    "particular": "Protege a tu familia desde 5€/mes — sin exámenes médicos",
    "generico": "Una propuesta que puede interesarte, {nombre}",
}


def generar_asunto_email(lead: Dict[str, Any]) -> str:
    """Genera el asunto de email adecuado según el perfil del lead."""
    tipo = _normalizar(lead.get("tipo_lead"))

    if _es_inmobiliaria(lead):
        clave = "inmobiliaria"
    elif _es_asesoria(lead):
        clave = "asesoria"
    elif tipo == "autonomo":
        clave = "autonomo"
    elif tipo in ("pyme", "empresa"):
        clave = "pyme"
    elif tipo == "particular":
        clave = "particular"
    else:
        clave = "generico"

    plantilla = _ASUNTOS_EMAIL[clave]
    return _rellenar(plantilla, lead)


# ============================================================
# recomendar_productos
# ============================================================

def recomendar_productos(lead: Dict[str, Any]) -> List[str]:
    """
    Devuelve una lista ordenada de IDs de producto recomendados para el lead,
    basada en señales detectadas en su perfil.

    IDs disponibles:
      contigo_futuro, sialp, contigo_autonomo, contigo_familia,
      contigo_pyme, contigo_senior, liderplus
    """
    tipo = _normalizar(lead.get("tipo_lead"))
    sector = _normalizar(lead.get("sector"))
    señales = [_normalizar(s) for s in (lead.get("señales_detectadas") or [])]
    productos: List[str] = []

    edad = lead.get("edad_estimada")
    try:
        edad_int: Optional[int] = int(edad) if edad is not None else None
    except (ValueError, TypeError):
        edad_int = None

    tiene_hijos = bool(lead.get("tiene_hijos"))
    tiene_hipoteca_flag = bool(lead.get("tiene_hipoteca"))
    num_empleados = lead.get("num_empleados") or 0
    try:
        num_empleados = int(num_empleados)
    except (ValueError, TypeError):
        num_empleados = 0

    # --- Autónomo ---
    if tipo == "autonomo":
        productos.append("contigo_autonomo")   # Prioridad máxima para autónomos
        productos.append("sialp")
        productos.append("contigo_futuro")
        if tiene_hijos or tiene_hipoteca_flag:
            productos.append("contigo_familia")
        productos.append("liderplus")

    # --- Pyme / empresa ---
    elif tipo in ("pyme", "empresa") or num_empleados > 1:
        if _es_inmobiliaria(lead):
            # Inmobiliarias: hipotecas en primer lugar, luego pyme
            productos.append("contigo_pyme")
            productos.append("contigo_futuro")
        else:
            productos.append("contigo_pyme")
            productos.append("contigo_futuro")
        if num_empleados > 0:
            productos.append("sialp")

    # --- Particular ---
    elif tipo == "particular":
        if edad_int is not None and edad_int >= 55:
            productos.append("contigo_senior")
            productos.append("liderplus")
        else:
            if tiene_hijos or tiene_hipoteca_flag:
                productos.append("contigo_familia")
            productos.append("liderplus")
            productos.append("contigo_futuro")
            if tiene_hipoteca_flag:
                productos.append("sialp")

    # --- Señales específicas adicionales ---
    for señal in señales:
        if any(kw in señal for kw in ("jubilac", "pensión", "ahorro", "futuro")):
            if "contigo_futuro" not in productos:
                productos.append("contigo_futuro")
        if any(kw in señal for kw in ("irpf", "fiscal", "impuesto", "renta")):
            if "sialp" not in productos:
                productos.insert(0, "sialp")
        if "hipoteca" in señal and "contigo_familia" not in productos:
            productos.append("contigo_familia")

    # Genérico: si no hay productos determinados, lista básica
    if not productos:
        productos = ["liderplus", "contigo_futuro", "contigo_familia"]

    # Eliminar duplicados manteniendo orden
    vistos: List[str] = []
    for p in productos:
        if p not in vistos:
            vistos.append(p)
    return vistos


# ============================================================
# calcular_score_inicial
# ============================================================

def calcular_score_inicial(lead: Dict[str, Any]) -> int:
    """
    Calcula un score inicial (0-10) para el lead en el momento de su creación.

    Criterios:
      +2  Fuente referido o inbound (ya mostró interés)
      +1  Tiene teléfono WhatsApp
      +1  Tiene email
      +1  Tipo lead definido (no vacío)
      +1  Empresa o sector definidos
      +1  Tiene hijos (más necesidad de protección)
      +1  Tiene hipoteca (necesidad clara)
      +1  Señales detectadas informadas (>=1)
      +1  Empleados > 5 (pyme con masa crítica)

    El score no supera 10.
    """
    score = 0

    fuente = _normalizar(lead.get("fuente"))
    if fuente in ("referido", "inbound"):
        score += 2
    elif fuente in ("linkedin", "base_existente"):
        score += 1

    if lead.get("telefono_whatsapp"):
        score += 1
    if lead.get("email"):
        score += 1
    if lead.get("tipo_lead"):
        score += 1
    if lead.get("empresa") or lead.get("sector"):
        score += 1
    if lead.get("tiene_hijos"):
        score += 1
    if lead.get("tiene_hipoteca"):
        score += 1

    señales = lead.get("señales_detectadas") or []
    if len(señales) >= 1:
        score += 1

    num_empleados = lead.get("num_empleados") or 0
    try:
        if int(num_empleados) > 5:
            score += 1
    except (ValueError, TypeError):
        pass

    return min(score, 10)
