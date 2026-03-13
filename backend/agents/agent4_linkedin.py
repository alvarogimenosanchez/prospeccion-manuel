from __future__ import annotations
"""
Agente 4 — Enriquecimiento LinkedIn
Dado un lead con nombre de empresa, busca al director/propietario en LinkedIn
y enriquece el lead con: nombre real, cargo, perfil LinkedIn, email estimado.

Fuentes (por orden de preferencia):
1. Proxycurl API ($0.01/crédito) — legal, fiable, sin riesgo de ban
2. LinkedIn scraping vía httpx — gratuito pero frágil
3. Google "site:linkedin.com/in empresa director" — fallback sin coste

Configura PROXYCURL_API_KEY en .env para usar la fuente 1.
"""

import os
import re
import time
import httpx
import logging
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger("agent4_linkedin")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PROXYCURL_API_KEY = os.environ.get("PROXYCURL_API_KEY", "")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS_BROWSER = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

CARGOS_DIRECTIVOS = [
    "director", "directora", "ceo", "fundador", "fundadora", "propietario", "propietaria",
    "gerente", "socio", "socia", "presidente", "presidenta", "responsable", "jefe", "jefa",
    "owner", "founder", "manager", "partner", "administrador", "administradora",
]


# ============================================================
# FUENTE 1: Proxycurl API (de pago, más fiable)
# ============================================================

def buscar_director_proxycurl(nombre_empresa: str, ciudad: str) -> Optional[dict]:
    """
    Busca el director/propietario de una empresa via Proxycurl.
    Requiere PROXYCURL_API_KEY en .env (~$0.01-0.02 por búsqueda).
    """
    if not PROXYCURL_API_KEY:
        return None

    try:
        # Company search
        resp = httpx.get(
            "https://nubela.co/proxycurl/api/linkedin/company/search",
            params={
                "company_name": nombre_empresa,
                "country": "ES",
                "page_size": 1,
            },
            headers={"Authorization": f"Bearer {PROXYCURL_API_KEY}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return None

        companies = resp.json().get("results", [])
        if not companies:
            return None

        company_url = companies[0].get("linkedin_profile_url")
        if not company_url:
            return None

        # Employee search — buscar roles directivos
        emp_resp = httpx.get(
            "https://nubela.co/proxycurl/api/linkedin/company/employees/",
            params={
                "linkedin_company_profile_url": company_url,
                "role_search": "director gerente propietario fundador ceo owner",
                "page_size": 5,
            },
            headers={"Authorization": f"Bearer {PROXYCURL_API_KEY}"},
            timeout=15,
        )
        if emp_resp.status_code != 200:
            return None

        empleados = emp_resp.json().get("employees", [])
        if not empleados:
            return None

        # Elegir el más directivo
        for emp in empleados:
            cargo = (emp.get("job_title") or "").lower()
            if any(c in cargo for c in CARGOS_DIRECTIVOS):
                return {
                    "nombre": emp.get("name", ""),
                    "cargo": emp.get("job_title", ""),
                    "linkedin_url": emp.get("profile_url", ""),
                    "fuente_enrichment": "proxycurl",
                }

        # Si no hay directivo claro, devolver el primero
        emp = empleados[0]
        return {
            "nombre": emp.get("name", ""),
            "cargo": emp.get("job_title", ""),
            "linkedin_url": emp.get("profile_url", ""),
            "fuente_enrichment": "proxycurl",
        }

    except Exception as e:
        logger.warning(f"Proxycurl error para {nombre_empresa}: {e}")
        return None


# ============================================================
# FUENTE 2: Google "site:linkedin.com/in" (sin coste)
# ============================================================

def buscar_director_google_linkedin(nombre_empresa: str, ciudad: str) -> Optional[dict]:
    """
    Busca en Google perfiles LinkedIn de directivos de la empresa.
    Gratuito pero puede ser bloqueado por Google.
    """
    query = f'site:linkedin.com/in "{nombre_empresa}" (director OR gerente OR propietario OR fundador OR CEO)'
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}&hl=es&num=5"

    try:
        resp = httpx.get(url, headers=HEADERS_BROWSER, timeout=12, follow_redirects=True)
        if resp.status_code != 200:
            return None

        # Extraer URLs de LinkedIn del HTML
        linkedin_urls = re.findall(
            r'linkedin\.com/in/([a-zA-Z0-9\-]+)',
            resp.text
        )

        if not linkedin_urls:
            return None

        # Extraer nombres de los snippets de Google
        # Los snippets suelen tener formato "Nombre - Cargo - Empresa | LinkedIn"
        snippets = re.findall(
            r'([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s*[-–]\s*([^|<\n]{5,50})',
            resp.text
        )

        nombre = ""
        cargo = ""

        if snippets:
            for snip_nombre, snip_cargo in snippets:
                cargo_lower = snip_cargo.lower()
                if any(c in cargo_lower for c in CARGOS_DIRECTIVOS):
                    nombre = snip_nombre.strip()
                    cargo = snip_cargo.strip()
                    break
            if not nombre and snippets:
                nombre = snippets[0][0].strip()
                cargo = snippets[0][1].strip()

        if linkedin_urls:
            return {
                "nombre": nombre,
                "cargo": cargo,
                "linkedin_url": f"https://www.linkedin.com/in/{linkedin_urls[0]}",
                "fuente_enrichment": "google_linkedin",
            }

    except Exception as e:
        logger.warning(f"Google LinkedIn error para {nombre_empresa}: {e}")

    return None


# ============================================================
# FUENTE 3: Búsqueda simple en Google (sin LinkedIn)
# ============================================================

def buscar_director_google(nombre_empresa: str, ciudad: str) -> Optional[dict]:
    """
    Busca "director de Empresa en Ciudad" en Google.
    Extrae nombre del snippet si aparece.
    """
    query = f'director propietario "{nombre_empresa}" {ciudad}'
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}&hl=es"

    try:
        resp = httpx.get(url, headers=HEADERS_BROWSER, timeout=12, follow_redirects=True)

        # Buscar nombres propios en el texto
        nombres = re.findall(
            r'\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,15}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,20})\b',
            resp.text
        )

        # Filtrar nombres que aparezcan cerca de palabras clave de cargo
        texto = resp.text
        for nombre in nombres:
            posicion = texto.find(nombre)
            if posicion == -1:
                continue
            contexto = texto[max(0, posicion - 100):posicion + 100].lower()
            if any(c in contexto for c in CARGOS_DIRECTIVOS):
                return {
                    "nombre": nombre,
                    "cargo": "Director/Propietario",
                    "linkedin_url": None,
                    "fuente_enrichment": "google_snippet",
                }

    except Exception as e:
        logger.warning(f"Google search error para {nombre_empresa}: {e}")

    return None


# ============================================================
# ORQUESTADOR: enriquecer un lead
# ============================================================

def enriquecer_lead(lead: dict) -> Optional[dict]:
    """
    Intenta enriquecer un lead con datos del director/propietario.
    Prueba fuentes en orden: Proxycurl → Google LinkedIn → Google.
    Retorna dict con campos a actualizar, o None si no se encontró nada.
    """
    nombre_empresa = lead.get("empresa", "")
    ciudad = lead.get("ciudad", "")

    if not nombre_empresa:
        return None

    logger.info(f"Enriqueciendo: {nombre_empresa} ({ciudad})")

    # Intentar fuentes en orden
    resultado = None

    if PROXYCURL_API_KEY:
        resultado = buscar_director_proxycurl(nombre_empresa, ciudad)
        time.sleep(0.5)

    if not resultado:
        resultado = buscar_director_google_linkedin(nombre_empresa, ciudad)
        time.sleep(2)

    if not resultado:
        resultado = buscar_director_google(nombre_empresa, ciudad)
        time.sleep(1)

    if not resultado:
        return None

    # Construir campos a actualizar en el lead
    updates = {}

    if resultado.get("nombre") and not lead.get("apellidos"):
        partes = resultado["nombre"].strip().split(" ", 1)
        if len(partes) >= 1:
            updates["nombre"] = partes[0]
        if len(partes) == 2:
            updates["apellidos"] = partes[1]

    if resultado.get("cargo"):
        updates["cargo"] = resultado["cargo"]

    if resultado.get("linkedin_url"):
        updates["fuente_detalle"] = resultado["linkedin_url"]

    # Añadir nota de enriquecimiento
    nota_actual = lead.get("notas") or ""
    nota_enrichment = f"[LinkedIn enrichment via {resultado['fuente_enrichment']}]"
    if nota_enrichment not in nota_actual:
        updates["notas"] = f"{nota_enrichment}\n{nota_actual}".strip()

    return updates if updates else None


# ============================================================
# ENRIQUECER LOTE DE LEADS
# ============================================================

def enriquecer_leads_sin_nombre(limite: int = 50) -> dict:
    """
    Busca leads de scraping que no tienen nombre real (solo empresa)
    y los enriquece con datos del director.

    Returns: {"procesados": N, "enriquecidos": N, "sin_datos": N}
    """
    # Leads de scraping sin nombre real (nombre = primera palabra de empresa)
    resp = sb.table("leads").select(
        "id, nombre, apellidos, empresa, ciudad, sector, tipo_lead, notas, fuente_detalle, cargo"
    ).eq("fuente", "scraping").is_("apellidos", "null").not_.is_("empresa", "null").limit(limite).execute()

    leads = resp.data or []
    logger.info(f"Enriqueciendo {len(leads)} leads sin nombre...")

    procesados = 0
    enriquecidos = 0

    for lead in leads:
        procesados += 1

        # Saltar si ya tiene apellidos o cargo real
        if lead.get("apellidos") or lead.get("cargo"):
            continue

        updates = enriquecer_lead(lead)

        if updates:
            sb.table("leads").update(updates).eq("id", lead["id"]).execute()
            enriquecidos += 1
            nombre_completo = f"{updates.get('nombre', lead['nombre'])} {updates.get('apellidos', '')}".strip()
            logger.info(f"  ✓ {lead['empresa']} → {nombre_completo} ({updates.get('cargo', '?')})")
        else:
            logger.info(f"  ⚠ {lead['empresa']} → sin datos encontrados")

        # Rate limiting respetuoso
        time.sleep(3)

    resultado = {
        "procesados": procesados,
        "enriquecidos": enriquecidos,
        "sin_datos": procesados - enriquecidos,
    }
    logger.info(f"Enriquecimiento completado: {resultado}")
    return resultado


if __name__ == "__main__":
    print("Iniciando enriquecimiento LinkedIn de leads...")
    resultado = enriquecer_leads_sin_nombre(limite=20)
    print(f"\nResultado: {resultado}")
