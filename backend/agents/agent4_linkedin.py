from __future__ import annotations
"""
Agente 4 — Enriquecimiento de leads
Dado un lead con nombre de empresa, busca al director/propietario y enriquece
el lead con: nombre real, cargo, teléfono móvil, perfil LinkedIn.

Jerarquía de fuentes (por orden):
1. Web del negocio — scraping de la URL guardada (~60-70% éxito PyMEs)
   Extrae: nombre propietario, cargo, móvil (6xx/7xx), email
2. Google snippet — "director propietario [empresa] [ciudad]" (~40% éxito)
3. NinjaPear API — LinkedIn (requiere NINJAPEAR_API_KEY)

Las fuentes 1 y 2 son gratuitas.
"""

import os
import re
import time
import httpx
import logging
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client
from bs4 import BeautifulSoup

load_dotenv()

logger = logging.getLogger("agent4_enriquecedor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
NINJAPEAR_API_KEY = os.environ.get("NINJAPEAR_API_KEY", "")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS_BROWSER = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}

CARGOS_DIRECTIVOS = [
    "director", "directora", "ceo", "fundador", "fundadora", "propietario", "propietaria",
    "gerente", "socio", "socia", "presidente", "presidenta", "responsable", "jefe", "jefa",
    "owner", "founder", "manager", "partner", "administrador", "administradora",
]

# Patrón para detectar nombres propios españoles (Nombre Apellido o Nombre Apellido Apellido)
PATRON_NOMBRE = re.compile(
    r'\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,15}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,20}){1,2})\b'
)

# Palabras que no son nombres aunque pasen el patrón
FALSOS_POSITIVOS = {
    "Sobre Nosotros", "Contáctanos", "Inicio Página", "Política Privacidad",
    "Aviso Legal", "Todos Los", "Nuestros Servicios", "Más Información",
    "Para Más", "También Puedes", "Puedes Contactar", "Haz Click",
    "Ver Más", "Leer Más", "España Madrid", "Madrid Barcelona",
}


# ============================================================
# FUENTE 1: Web del propio negocio
# ============================================================

PATRON_MOVIL = re.compile(r'\b((?:\+34\s?)?(?:6|7)\d{2}[\s\-]?\d{3}[\s\-]?\d{3})\b')
PATRON_EMAIL = re.compile(r'\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b')


def _extraer_movil(texto: str) -> Optional[str]:
    """Extrae el primer móvil español (6xx/7xx) del texto y lo normaliza."""
    matches = PATRON_MOVIL.findall(texto)
    for m in matches:
        limpio = re.sub(r'[\s\-]', '', m)
        if limpio.startswith("+34"):
            limpio = limpio[3:]
        if len(limpio) == 9 and limpio[0] in ("6", "7"):
            return "+34" + limpio
    return None


def _extraer_email(texto: str) -> Optional[str]:
    """Extrae el primer email válido del texto, descartando imágenes y genéricos."""
    matches = PATRON_EMAIL.findall(texto)
    ignorar = {"png", "jpg", "jpeg", "gif", "webp", "svg", "woff", "ttf"}
    for m in matches:
        ext = m.split(".")[-1].lower()
        if ext in ignorar:
            continue
        if any(x in m.lower() for x in ("noreply", "no-reply", "example", "test@")):
            continue
        return m.lower()
    return None


def buscar_director_en_web(url_negocio: str, nombre_empresa: str) -> Optional[dict]:
    """
    Scraping de la web del negocio para encontrar:
    - Nombre y cargo del propietario/director
    - Teléfono móvil (6xx/7xx) para WhatsApp
    - Email de contacto
    Busca en home + páginas de contacto/equipo/sobre-nosotros.
    """
    if not url_negocio:
        return None

    if not url_negocio.startswith("http"):
        url_negocio = "https://" + url_negocio

    paginas_a_probar = [
        url_negocio,
        url_negocio.rstrip("/") + "/contacto",
        url_negocio.rstrip("/") + "/sobre-nosotros",
        url_negocio.rstrip("/") + "/quienes-somos",
        url_negocio.rstrip("/") + "/equipo",
        url_negocio.rstrip("/") + "/contact",
        url_negocio.rstrip("/") + "/about",
    ]

    resultado_acumulado: dict = {}

    for pagina in paginas_a_probar:
        try:
            resp = httpx.get(pagina, headers=HEADERS_BROWSER, timeout=8, follow_redirects=True)
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            texto_pagina = soup.get_text(" ", strip=True)

            # --- Extraer móvil (prioritario) ---
            if not resultado_acumulado.get("movil"):
                movil = _extraer_movil(texto_pagina)
                if movil:
                    resultado_acumulado["movil"] = movil
                    logger.info(f"  [web] Móvil encontrado: {movil} en {pagina}")

            # --- Extraer email ---
            if not resultado_acumulado.get("email"):
                # Primero buscar mailto: links (más fiables)
                mailto = soup.find("a", href=re.compile(r'^mailto:', re.I))
                if mailto:
                    email = mailto["href"].replace("mailto:", "").split("?")[0].strip()
                    if "@" in email:
                        resultado_acumulado["email"] = email.lower()
                        logger.info(f"  [web] Email mailto encontrado: {email}")
                else:
                    email = _extraer_email(texto_pagina)
                    if email:
                        resultado_acumulado["email"] = email

            # --- Schema.org Person o LocalBusiness ---
            if not resultado_acumulado.get("nombre"):
                import json as _json
                for script in soup.find_all("script", type="application/ld+json"):
                    try:
                        data = _json.loads(script.string or "")
                        items = data if isinstance(data, list) else [data]
                        for item in items:
                            # Buscar teléfono también en schema
                            tel = item.get("telephone") or ""
                            if tel and not resultado_acumulado.get("movil"):
                                movil = _extraer_movil(tel)
                                if movil:
                                    resultado_acumulado["movil"] = movil

                            # Buscar persona
                            if item.get("@type") == "Person":
                                nombre = item.get("name", "").strip()
                                if nombre and len(nombre.split()) >= 2:
                                    resultado_acumulado["nombre"] = nombre
                                    resultado_acumulado["cargo"] = item.get("jobTitle", "Propietario")
                                    resultado_acumulado["fuente_enrichment"] = "web_schema"
                                    break
                            elif item.get("@type") in ("LocalBusiness", "RealEstateAgent", "AutoDealer"):
                                for campo in ("founder", "employee", "contactPoint"):
                                    persona = item.get(campo)
                                    if isinstance(persona, dict) and persona.get("name"):
                                        nombre = persona["name"].strip()
                                        if len(nombre.split()) >= 2:
                                            resultado_acumulado["nombre"] = nombre
                                            resultado_acumulado["cargo"] = persona.get("jobTitle", "Director")
                                            resultado_acumulado["fuente_enrichment"] = "web_schema"
                                            break
                    except Exception:
                        pass

            # --- Meta author ---
            if not resultado_acumulado.get("nombre"):
                meta_author = soup.find("meta", attrs={"name": "author"})
                if meta_author:
                    autor = (meta_author.get("content") or "").strip()
                    if autor and len(autor.split()) >= 2 and autor not in FALSOS_POSITIVOS:
                        if nombre_empresa.lower()[:10] not in autor.lower():
                            resultado_acumulado["nombre"] = autor
                            resultado_acumulado["cargo"] = "Propietario/Director"
                            resultado_acumulado["fuente_enrichment"] = "web_meta"

            # --- Copyright en footer ---
            if not resultado_acumulado.get("nombre"):
                footer = soup.find("footer") or soup.find(class_=re.compile(r"footer|pie", re.I))
                if footer:
                    texto_footer = footer.get_text(" ", strip=True)
                    copyright_match = re.search(
                        r'(?:©|copyright)\s*(?:\d{4}\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,15}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,20})',
                        texto_footer, re.IGNORECASE
                    )
                    if copyright_match:
                        nombre = copyright_match.group(1).strip()
                        if nombre not in FALSOS_POSITIVOS and nombre_empresa.lower()[:8] not in nombre.lower():
                            resultado_acumulado["nombre"] = nombre
                            resultado_acumulado["cargo"] = "Propietario"
                            resultado_acumulado["fuente_enrichment"] = "web_copyright"

            # --- Nombre+cargo en texto (ej: "Juan García, Director") ---
            if not resultado_acumulado.get("nombre"):
                for cargo in CARGOS_DIRECTIVOS:
                    m = re.search(
                        rf'([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,15}}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,20}})\s*[,·\-–]\s*{cargo}',
                        texto_pagina, re.IGNORECASE
                    )
                    if not m:
                        m = re.search(
                            rf'{cargo}\s*[:\-–]\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,15}}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,20}})',
                            texto_pagina, re.IGNORECASE
                        )
                    if m:
                        nombre = m.group(1).strip()
                        if nombre not in FALSOS_POSITIVOS:
                            resultado_acumulado["nombre"] = nombre
                            resultado_acumulado["cargo"] = cargo.capitalize()
                            resultado_acumulado["fuente_enrichment"] = "web_texto"
                            break

            # Si ya tenemos nombre + móvil, no hace falta seguir
            if resultado_acumulado.get("nombre") and resultado_acumulado.get("movil"):
                break

            time.sleep(0.5)

        except Exception as e:
            logger.debug(f"  [web] Error en {pagina}: {e}")
            continue

    # Devolver solo si encontramos algo útil
    if resultado_acumulado.get("nombre") or resultado_acumulado.get("movil") or resultado_acumulado.get("email"):
        return {
            "nombre": resultado_acumulado.get("nombre", ""),
            "cargo": resultado_acumulado.get("cargo", ""),
            "linkedin_url": None,
            "movil": resultado_acumulado.get("movil"),
            "email": resultado_acumulado.get("email"),
            "fuente_enrichment": resultado_acumulado.get("fuente_enrichment", "web"),
        }

    return None


# ============================================================
# FUENTE 2: Google snippet (mejorado)
# ============================================================

def buscar_director_google(nombre_empresa: str, ciudad: str) -> Optional[dict]:
    """
    Busca en Google "director propietario de [empresa] [ciudad]".
    Extrae nombre del snippet si aparece cerca de una palabra de cargo.
    También intenta búsqueda en LinkedIn si hay perfil.
    """
    queries = [
        f'director propietario "{nombre_empresa}" {ciudad}',
        f'site:linkedin.com/in "{nombre_empresa}" (director OR gerente OR propietario OR fundador)',
        f'"{nombre_empresa}" gerente director {ciudad} contacto',
    ]

    for query in queries:
        try:
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}&hl=es&num=5"
            resp = httpx.get(url, headers=HEADERS_BROWSER, timeout=12, follow_redirects=True)
            if resp.status_code != 200:
                time.sleep(2)
                continue

            texto = resp.text

            # Buscar URLs de LinkedIn (para la fuente)
            linkedin_urls = re.findall(r'linkedin\.com/in/([a-zA-Z0-9\-]+)', texto)
            linkedin_url = f"https://www.linkedin.com/in/{linkedin_urls[0]}" if linkedin_urls else None

            # Buscar nombre + cargo en snippets de Google
            # Patrón: "Juan García - Director en Empresa | LinkedIn"
            patron_linkedin = re.compile(
                r'([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,15}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,20})\s*[-–]\s*([^|<\n]{5,60})',
            )
            matches = patron_linkedin.findall(texto)
            for nombre_cand, cargo_cand in matches:
                if nombre_cand in FALSOS_POSITIVOS:
                    continue
                cargo_lower = cargo_cand.lower()
                if any(c in cargo_lower for c in CARGOS_DIRECTIVOS):
                    logger.info(f"  [google] Encontrado: {nombre_cand} ({cargo_cand.strip()})")
                    return {
                        "nombre": nombre_cand.strip(),
                        "cargo": cargo_cand.strip()[:60],
                        "linkedin_url": linkedin_url,
                        "fuente_enrichment": "google_snippet",
                    }

            # Si tenemos URL de LinkedIn pero no nombre claro, devolver con datos parciales
            if linkedin_url and "linkedin.com/in/" in query:
                logger.info(f"  [google] LinkedIn encontrado sin nombre claro: {linkedin_url}")
                return {
                    "nombre": "",
                    "cargo": "",
                    "linkedin_url": linkedin_url,
                    "fuente_enrichment": "google_linkedin_url",
                }

            time.sleep(2)

        except Exception as e:
            logger.warning(f"  [google] Error para {nombre_empresa}: {e}")
            time.sleep(1)

    return None


# ============================================================
# FUENTE 3: NinjaPear API (nubela.co — sucesor de Proxycurl)
# ============================================================

def buscar_director_ninjapear(nombre_empresa: str) -> Optional[dict]:
    """
    Busca el director/propietario vía NinjaPear API (nubela.co).
    Usa Person Search con filtro por company_name y rol directivo.
    Requiere NINJAPEAR_API_KEY en .env.
    """
    if not NINJAPEAR_API_KEY:
        return None

    headers = {"Authorization": f"Bearer {NINJAPEAR_API_KEY}"}

    try:
        # Buscar persona con cargo directivo en la empresa
        resp = httpx.get(
            "https://nubela.co/api/v1/person/search",
            params={
                "company_name": nombre_empresa,
                "company_country": "ES",
                "title": "director gerente propietario fundador ceo owner",
                "page_size": 3,
            },
            headers=headers,
            timeout=60,  # NinjaPear recomienda timeout de 100s, usamos 60
        )

        if resp.status_code == 200:
            personas = resp.json().get("results", [])
            for persona in personas:
                cargo = (persona.get("job_title") or persona.get("title") or "").lower()
                if any(c in cargo for c in CARGOS_DIRECTIVOS):
                    nombre = persona.get("name") or persona.get("full_name") or ""
                    logger.info(f"  [ninjapear] Encontrado: {nombre} ({cargo})")
                    return {
                        "nombre": nombre,
                        "cargo": persona.get("job_title") or persona.get("title") or "Director",
                        "linkedin_url": persona.get("linkedin_profile_url") or persona.get("profile_url"),
                        "fuente_enrichment": "ninjapear",
                    }
            # Si hay resultados pero ninguno tiene cargo directivo claro, devolver el primero
            if personas:
                p = personas[0]
                nombre = p.get("name") or p.get("full_name") or ""
                if nombre:
                    return {
                        "nombre": nombre,
                        "cargo": p.get("job_title") or p.get("title") or "Contacto",
                        "linkedin_url": p.get("linkedin_profile_url") or p.get("profile_url"),
                        "fuente_enrichment": "ninjapear",
                    }

        # Fallback: Role Lookup — buscar directamente el CEO/director de la empresa
        role_resp = httpx.get(
            "https://nubela.co/api/v1/role/lookup",
            params={
                "company_name": nombre_empresa,
                "role": "CEO",
                "country": "ES",
            },
            headers=headers,
            timeout=60,
        )
        if role_resp.status_code == 200:
            data = role_resp.json()
            nombre = data.get("name") or data.get("full_name") or ""
            if nombre:
                logger.info(f"  [ninjapear] Role lookup CEO: {nombre}")
                return {
                    "nombre": nombre,
                    "cargo": data.get("job_title") or "CEO/Director",
                    "linkedin_url": data.get("linkedin_profile_url"),
                    "fuente_enrichment": "ninjapear_role",
                }

        logger.info(f"  [ninjapear] Sin resultados para {nombre_empresa}")
        return None

    except Exception as e:
        logger.warning(f"  [ninjapear] Error para {nombre_empresa}: {e}")
        return None


# ============================================================
# ORQUESTADOR: enriquecer un lead
# ============================================================

def enriquecer_lead(lead: dict) -> Optional[dict]:
    """
    Enriquece un lead con datos del director/propietario.
    Jerarquía: Web del negocio → Google snippet → Proxycurl
    """
    nombre_empresa = lead.get("empresa", "")
    ciudad = lead.get("ciudad", "") or ""
    # Buscar web en campo dedicado primero, luego en fuente_detalle (si no es un place_id)
    fuente = lead.get("fuente_detalle") or ""
    url_web = lead.get("web") or (fuente if fuente.startswith("http") else "")

    if not nombre_empresa:
        return None

    logger.info(f"Enriqueciendo: {nombre_empresa} ({ciudad})")

    resultado = None

    # Fuente 1: Web del negocio (gratis, mejor para PyMEs)
    if url_web and "linkedin.com" not in url_web:
        resultado = buscar_director_en_web(url_web, nombre_empresa)
        if resultado:
            logger.info(f"  → Fuente: web del negocio")

    # Fuente 2: Google snippet (gratis)
    if not resultado:
        resultado = buscar_director_google(nombre_empresa, ciudad)
        if resultado:
            logger.info(f"  → Fuente: Google")
        time.sleep(2)

    # Fuente 3: NinjaPear (de pago, solo si las gratuitas fallaron)
    if not resultado and NINJAPEAR_API_KEY:
        resultado = buscar_director_ninjapear(nombre_empresa)
        if resultado:
            logger.info(f"  → Fuente: NinjaPear")
        time.sleep(0.5)

    if not resultado:
        logger.info(f"  → Sin datos encontrados para {nombre_empresa}")
        return None

    # Construir campos a actualizar
    updates: dict = {}

    # Nombre y apellidos
    nombre_completo = resultado.get("nombre", "").strip()
    if nombre_completo and len(nombre_completo.split()) >= 2:
        partes = nombre_completo.split(" ", 1)
        if not lead.get("nombre") or lead.get("nombre") == nombre_empresa.split()[0]:
            updates["nombre"] = partes[0]
        if not lead.get("apellidos"):
            updates["apellidos"] = partes[1] if len(partes) > 1 else ""

    # Cargo
    if resultado.get("cargo") and not lead.get("cargo"):
        updates["cargo"] = resultado["cargo"][:100]

    # Móvil → telefono_whatsapp (solo si no tenía ya uno)
    movil = resultado.get("movil")
    if movil and not lead.get("telefono_whatsapp"):
        updates["telefono_whatsapp"] = movil
        logger.info(f"  ✓ Móvil guardado como WhatsApp: {movil}")

    # Email
    email = resultado.get("email")
    if email and not lead.get("email"):
        updates["email"] = email

    # LinkedIn / fuente
    if resultado.get("linkedin_url"):
        updates["fuente_detalle"] = resultado["linkedin_url"]

    # Nota de enriquecimiento
    nota_actual = lead.get("notas") or ""
    fuente = resultado.get("fuente_enrichment", "desconocida")
    nota_enrichment = f"[Enriquecido: {fuente}]"
    if nota_enrichment not in nota_actual:
        updates["notas"] = f"{nota_enrichment}\n{nota_actual}".strip()

    return updates if updates else None


# ============================================================
# ENRIQUECER LOTE DE LEADS
# ============================================================

def enriquecer_leads_sin_nombre(limite: int = 50) -> dict:
    """
    Busca leads de scraping sin nombre real (solo empresa) y los enriquece.
    Returns: {"procesados": N, "enriquecidos": N, "sin_datos": N}
    """
    resp = sb.table("leads").select(
        "id, nombre, apellidos, empresa, ciudad, sector, tipo_lead, notas, fuente_detalle, cargo, web"
    ).eq("fuente", "scraping").not_.is_("empresa", "null").in_("estado", ["nuevo", "enriquecido"]).limit(limite).execute()

    leads = resp.data or []
    logger.info(f"Enriqueciendo lote de {len(leads)} leads sin nombre...")

    procesados = 0
    enriquecidos = 0

    for lead in leads:
        procesados += 1

        if lead.get("apellidos") and lead.get("apellidos").strip():
            continue

        updates = enriquecer_lead(lead)

        if updates:
            updates["estado"] = "enriquecido"
            sb.table("leads").update(updates).eq("id", lead["id"]).execute()
            enriquecidos += 1
            nombre_completo = f"{updates.get('nombre', lead.get('nombre', ''))} {updates.get('apellidos', '')}".strip()
            logger.info(f"  ✓ {lead['empresa']} → {nombre_completo} ({updates.get('cargo', '?')})")
        else:
            logger.info(f"  ⚠ {lead['empresa']} → sin datos")

        time.sleep(3)

    resultado = {
        "procesados": procesados,
        "enriquecidos": enriquecidos,
        "sin_datos": procesados - enriquecidos,
    }
    logger.info(f"Enriquecimiento completado: {resultado}")
    return resultado


if __name__ == "__main__":
    print("Iniciando enriquecimiento de leads...")
    resultado = enriquecer_leads_sin_nombre(limite=20)
    print(f"\nResultado: {resultado}")
