from __future__ import annotations
"""
Agente 1 — Scraper de Prospección
Busca inmobiliarias, autónomos y pymes via Google Places API.
Requiere: GOOGLE_PLACES_API_KEY en .env
Alternativa sin API: scraping de Yelp ES (menos datos)
"""

import httpx
import time
import re
import os
from bs4 import BeautifulSoup
from supabase import create_client
from dotenv import load_dotenv
import warnings
warnings.filterwarnings('ignore')

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "es-ES,es;q=0.9",
}

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mapeo de categoría → query Google + productos recomendados
CATEGORIAS_CONFIG = {
    "inmobiliarias": {
        "query": "inmobiliaria",
        "tipo_lead": "pyme",
        "productos": ["contigo_pyme"],
        "señales": ["inmobiliaria", "agentes", "posible_derivacion_hipotecas"],
    },
    "asesorias": {
        "query": "asesoría gestoría",
        "tipo_lead": "pyme",
        "productos": ["contigo_pyme", "sialp"],
        "señales": ["asesoria", "gestoria", "autónomos_clientes"],
    },
    "hosteleria": {
        "query": "bar restaurante cafetería",
        "tipo_lead": "autonomo",
        "productos": ["contigo_autonomo", "sialp"],
        "señales": ["hosteleria", "autonomo"],
    },
    "clinicas": {
        "query": "clínica médica dental",
        "tipo_lead": "pyme",
        "productos": ["contigo_pyme", "contigo_familia"],
        "señales": ["salud", "profesional_sanitario"],
    },
    "talleres": {
        "query": "taller mecánico automóvil",
        "tipo_lead": "autonomo",
        "productos": ["contigo_autonomo", "liderplus"],
        "señales": ["autonomo", "trabajo_manual", "riesgo_accidente"],
    },
    "peluquerias": {
        "query": "peluquería estética belleza",
        "tipo_lead": "autonomo",
        "productos": ["contigo_autonomo", "sialp"],
        "señales": ["autonomo", "pequeño_negocio"],
    },
}


def limpiar_telefono(texto: str) -> str:
    if not texto:
        return None
    digits = re.sub(r'\D', '', texto)
    if len(digits) == 9 and digits[0] in '6789':
        return f"+34{digits}"
    if len(digits) == 11 and digits[:2] == '34':
        return f"+{digits}"
    return None


def ya_existe(telefono: str, nombre_empresa: str) -> bool:
    """Evita duplicados por teléfono o nombre de empresa."""
    if telefono:
        r = sb.table('leads').select('id').eq('telefono_whatsapp', telefono).execute()
        if r.data:
            return True
    if nombre_empresa and len(nombre_empresa) > 5:
        r = sb.table('leads').select('id').ilike('empresa', f"%{nombre_empresa[:20]}%").execute()
        if r.data:
            return True
    return False


# ============================================================
# FUENTE 1: Google Places API (con API key)
# ============================================================

def scrape_google_places(categoria: str, ciudad: str, max_results: int = 20) -> list[dict]:
    """
    Busca negocios via Google Places Text Search API.
    Devuelve nombre, teléfono, dirección, web.
    Requiere GOOGLE_PLACES_API_KEY en .env
    """
    if not GOOGLE_API_KEY:
        print("  ⚠ Sin GOOGLE_PLACES_API_KEY — usando Yelp como fallback")
        return []

    config = CATEGORIAS_CONFIG.get(categoria, CATEGORIAS_CONFIG["inmobiliarias"])
    query = f"{config['query']} en {ciudad}"
    leads = []

    try:
        # Text Search
        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            "query": query,
            "language": "es",
            "region": "es",
            "key": GOOGLE_API_KEY,
        }
        resp = httpx.get(url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") not in ["OK", "ZERO_RESULTS"]:
            print(f"  ⚠ Google Places error: {data.get('status')}")
            return []

        lugares = data.get("results", [])[:max_results]
        print(f"  → Google Places {ciudad}/{categoria}: {len(lugares)} resultados")

        for lugar in lugares:
            # Obtener detalles (teléfono y web requieren Details API)
            place_id = lugar.get("place_id")
            details = _get_place_details(place_id)

            tel_raw = details.get("formatted_phone_number") or details.get("international_phone_number")
            tel = limpiar_telefono(tel_raw) if tel_raw else None

            nombre = lugar.get("name", "")
            if ya_existe(tel, nombre):
                continue

            lead = {
                "nombre": nombre.split()[0] if nombre else "Contacto",
                "empresa": nombre,
                "telefono": tel,
                "telefono_whatsapp": tel,
                "ciudad": ciudad,
                "sector": categoria.capitalize(),
                "fuente": "scraping",
                "fuente_detalle": f"google_places:{place_id}",
                "estado": "nuevo",
                "temperatura": "frio",
                "nivel_interes": 1,
                "prioridad": "baja",
                "tipo_lead": config["tipo_lead"],
                "productos_recomendados": config["productos"],
                "señales_detectadas": config["señales"],
            }

            if details.get("website"):
                lead["fuente_detalle"] = details["website"]

            leads.append(lead)
            time.sleep(0.2)  # Rate limit

    except Exception as e:
        print(f"  ✗ Google Places error: {e}")

    return leads


def _get_place_details(place_id: str) -> dict:
    """Obtiene detalles de un lugar: teléfono, web."""
    if not GOOGLE_API_KEY or not place_id:
        return {}
    try:
        url = "https://maps.googleapis.com/maps/api/place/details/json"
        params = {
            "place_id": place_id,
            "fields": "formatted_phone_number,international_phone_number,website",
            "language": "es",
            "key": GOOGLE_API_KEY,
        }
        resp = httpx.get(url, params=params, timeout=8)
        return resp.json().get("result", {})
    except Exception:
        return {}


# ============================================================
# FUENTE 2: Yelp ES (sin API key, scraping)
# ============================================================

def scrape_yelp(categoria: str, ciudad: str) -> list[dict]:
    """
    Scrapea Yelp España. Devuelve nombre y URL (sin teléfono — Yelp lo oculta).
    Útil para tener el nombre de la empresa y buscar el teléfono manualmente.
    """
    config = CATEGORIAS_CONFIG.get(categoria, CATEGORIAS_CONFIG["inmobiliarias"])
    query = config["query"].split()[0]  # Primera palabra del query
    ciudad_encoded = ciudad.replace(' ', '+')
    url = f"https://www.yelp.es/search?find_desc={query}&find_loc={ciudad_encoded}"
    leads = []

    try:
        resp = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            return []

        soup = BeautifulSoup(resp.text, 'html.parser')

        # Extraer nombres de negocios de h3
        nombres = []
        for h3 in soup.find_all('h3'):
            texto = h3.get_text(strip=True)
            if texto and len(texto) > 2 and not texto.startswith('También'):
                nombres.append(texto)

        # Extraer links /biz/ para URL de cada negocio
        biz_links = {}
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if '/biz/' in href:
                nombre = a.get_text(strip=True)
                if nombre and nombre not in biz_links:
                    biz_links[nombre] = f"https://www.yelp.es{href.split('?')[0]}"

        print(f"  → Yelp {ciudad}/{categoria}: {len(nombres)} negocios")

        for nombre in nombres[:15]:
            if ya_existe(None, nombre):
                continue

            lead = {
                "nombre": nombre.split()[0] if nombre else "Contacto",
                "empresa": nombre,
                "telefono": None,
                "telefono_whatsapp": None,
                "ciudad": ciudad,
                "sector": categoria.capitalize(),
                "fuente": "scraping",
                "fuente_detalle": biz_links.get(nombre, f"https://www.yelp.es/search?find_desc={query}&find_loc={ciudad}"),
                "estado": "nuevo",
                "temperatura": "frio",
                "nivel_interes": 1,
                "prioridad": "baja",
                "tipo_lead": config["tipo_lead"],
                "productos_recomendados": config["productos"],
                "señales_detectadas": config["señales"],
                "notas": "⚠ Sin teléfono — buscar en Google o en su web antes de contactar",
            }
            leads.append(lead)

    except Exception as e:
        print(f"  ✗ Yelp error: {e}")

    return leads


# ============================================================
# FUENTE 3: Búsqueda directa en Google (sin API)
# ============================================================

def scrape_google_search(categoria: str, ciudad: str) -> list[dict]:
    """
    Extrae teléfonos del snippet de Google directamente.
    No requiere API key pero puede ser bloqueado.
    """
    config = CATEGORIAS_CONFIG.get(categoria, CATEGORIAS_CONFIG["inmobiliarias"])
    query = f'{config["query"]} {ciudad} teléfono'
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}&hl=es&num=20"
    leads = []

    try:
        resp = httpx.get(url, headers=HEADERS, timeout=12, follow_redirects=True)
        soup = BeautifulSoup(resp.text, 'html.parser')

        # Buscar snippets con teléfono
        tel_regex = re.compile(r'[679]\d{8}')

        resultados = soup.find_all('div', class_=re.compile(r'^(g|tF2Cxc|Gx5Zad)'))
        print(f"  → Google {ciudad}/{categoria}: {len(resultados)} snippets")

        for div in resultados[:20]:
            texto = div.get_text(separator=' ', strip=True)
            tels = tel_regex.findall(texto)
            if not tels:
                continue

            # Intentar extraer nombre del h3
            h3 = div.find('h3')
            nombre = h3.get_text(strip=True) if h3 else ""

            # URL del resultado
            a = div.find('a', href=True)
            link = a['href'] if a else ""

            tel = limpiar_telefono(tels[0])
            if not tel or ya_existe(tel, nombre):
                continue

            lead = {
                "nombre": nombre.split()[0] if nombre else "Contacto",
                "empresa": nombre or f"{categoria.capitalize()} {ciudad}",
                "telefono": tel,
                "telefono_whatsapp": tel,
                "ciudad": ciudad,
                "sector": categoria.capitalize(),
                "fuente": "scraping",
                "fuente_detalle": link,
                "estado": "nuevo",
                "temperatura": "frio",
                "nivel_interes": 2,  # Tiene teléfono = más valor
                "prioridad": "baja",
                "tipo_lead": config["tipo_lead"],
                "productos_recomendados": config["productos"],
                "señales_detectadas": config["señales"],
            }
            leads.append(lead)

    except Exception as e:
        print(f"  ✗ Google search error: {e}")

    return leads


# ============================================================
# ORQUESTADOR PRINCIPAL
# ============================================================

def guardar_leads(leads: list[dict]) -> tuple[int, int]:
    """Guarda leads en Supabase evitando duplicados."""
    guardados = 0
    duplicados = 0

    for lead in leads:
        try:
            lead_clean = {k: v for k, v in lead.items() if v is not None}
            sb.table('leads').insert(lead_clean).execute()
            guardados += 1
            print(f"    ✓ {lead.get('empresa', lead.get('nombre', '?'))} — {lead.get('ciudad')} {'📞' if lead.get('telefono_whatsapp') else '⚠ sin tel'}")
        except Exception as e:
            if 'duplicate' in str(e).lower():
                duplicados += 1
            else:
                print(f"    ✗ Error: {e}")

    return guardados, duplicados


def ejecutar_campana(ciudades: list[str], categorias: list[str], paginas_por_ciudad: int = 2):
    """
    Ejecuta una campaña de prospección completa.
    Prioridad de fuentes: Google Places API > Google Search > Yelp

    Args:
        ciudades: Lista de ciudades a prospectar
        categorias: Lista de categorías (ver CATEGORIAS_CONFIG)
        paginas_por_ciudad: Controla profundidad (1=~10 leads, 3=~30 leads por ciudad/cat)
    """
    total_guardados = 0
    total_duplicados = 0
    max_por_busqueda = paginas_por_ciudad * 10

    print(f"\n🔍 Campaña de prospección iniciada")
    print(f"   Ciudades: {', '.join(ciudades)}")
    print(f"   Categorías: {', '.join(categorias)}")
    print(f"   Objetivo: ~{max_por_busqueda} leads por ciudad/categoría\n")

    for ciudad in ciudades:
        for categoria in categorias:
            print(f"\n📍 {ciudad} — {categoria}")
            leads = []

            # Fuente 1: Google Places API (si hay key)
            if GOOGLE_API_KEY:
                leads = scrape_google_places(categoria, ciudad, max_por_busqueda)

            # Fuente 2: Google Search (sin key)
            if len(leads) < 5:
                print(f"  → Intentando Google Search...")
                leads += scrape_google_search(categoria, ciudad)
                time.sleep(3)

            # Fuente 3: Yelp como último recurso
            if len(leads) < 3:
                print(f"  → Usando Yelp como fallback...")
                leads += scrape_yelp(categoria, ciudad)

            print(f"  → {len(leads)} leads encontrados, guardando...")
            g, d = guardar_leads(leads)
            total_guardados += g
            total_duplicados += d
            print(f"  → ✓ {g} nuevos, {d} duplicados")
            time.sleep(5)  # Pausa entre búsquedas

    print(f"\n{'='*50}")
    print(f"✅ Campaña completada")
    print(f"   Nuevos leads: {total_guardados}")
    print(f"   Duplicados ignorados: {total_duplicados}")
    print(f"{'='*50}\n")

    return total_guardados


if __name__ == "__main__":
    ejecutar_campana(
        ciudades=["Madrid", "Barcelona"],
        categorias=["inmobiliarias"],
        paginas_por_ciudad=2
    )
