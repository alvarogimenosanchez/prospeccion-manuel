"""
Verificación de JWT de Supabase para endpoints del backend.

Las rutas protegidas exigen Authorization: Bearer <jwt> emitido por Supabase Auth.
El JWT se valida con SUPABASE_JWT_SECRET (Supabase Dashboard → Settings → API → JWT Secret).
Tras decodificar, se comprueba que el email del JWT exista en `comerciales` con activo=true.

Cron de Railway: endpoints internos (/seguimiento/*) aceptan también el header
X-Cron-Secret con el valor de INTERNAL_CRON_SECRET como bypass (sin JWT).
"""

from __future__ import annotations
import os
import logging
import time
from typing import Optional, Any

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import jwt, JWTError
from supabase import create_client, Client

logger = logging.getLogger(__name__)

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
INTERNAL_CRON_SECRET = os.environ.get("INTERNAL_CRON_SECRET", "")
ENV = os.environ.get("ENV", "production").lower()

# JWKS URL de Supabase: contiene las claves públicas para verificar JWTs
# firmados con las nuevas "JWT Signing Keys" (ES256/RS256 asimétricos).
SUPABASE_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""

_supabase_admin: Optional[Client] = None
_jwks_cache: dict[str, Any] = {"data": None, "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 600  # 10 minutos


def _get_supabase_admin() -> Client:
    global _supabase_admin
    if _supabase_admin is None:
        _supabase_admin = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _supabase_admin


def _get_jwks() -> Optional[dict]:
    """Devuelve el JWKS de Supabase con caché de 10 min."""
    if not SUPABASE_JWKS_URL:
        return None
    now = time.time()
    if _jwks_cache["data"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL_SECONDS:
        return _jwks_cache["data"]
    try:
        resp = httpx.get(SUPABASE_JWKS_URL, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        _jwks_cache["data"] = data
        _jwks_cache["fetched_at"] = now
        return data
    except Exception as e:
        logger.warning(f"No se pudo obtener JWKS de Supabase: {e}")
        return _jwks_cache["data"]  # devolver cache stale si hay


def _decode_with_jwks(token: str) -> dict:
    """Verifica un JWT firmado con JWT Signing Keys (ES256/RS256 asimétricos)."""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT malformado: {e}")

    kid = unverified_header.get("kid")
    alg = unverified_header.get("alg", "ES256")
    jwks = _get_jwks()
    if not jwks or "keys" not in jwks:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWKS no disponible")

    matching_key = None
    for key in jwks["keys"]:
        if key.get("kid") == kid:
            matching_key = key
            break
    if matching_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWKS sin clave kid={kid}")

    try:
        return jwt.decode(
            token,
            matching_key,
            algorithms=[alg, "ES256", "RS256"],
            audience="authenticated",
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT inválido (JWKS): {e}")


def _decode_jwt(token: str) -> dict:
    """
    Verifica un JWT de Supabase. Soporta dos sistemas de firma:
    1. Legacy JWT Secret (HS256, simétrico) — si SUPABASE_JWT_SECRET está configurado
    2. JWT Signing Keys (ES256/RS256, asimétrico) — vía JWKS público

    Estrategia: lee el header del JWT y elige el método según el algoritmo.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT malformado: {e}")

    alg = header.get("alg", "")

    # ES256/RS256/EdDSA → JWKS asimétrico (sistema nuevo de Supabase)
    if alg in ("ES256", "RS256", "EdDSA"):
        return _decode_with_jwks(token)

    # HS256 → Legacy JWT Secret simétrico
    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            logger.warning("JWT con HS256 pero SUPABASE_JWT_SECRET no configurado — decode sin verificar firma.")
            try:
                return jwt.get_unverified_claims(token)
            except JWTError as e:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT malformado: {e}")
        try:
            return jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except JWTError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT inválido (HS256): {e}")

    # Algoritmo desconocido → intentar JWKS por si acaso
    return _decode_with_jwks(token)


def _email_es_comercial_activo(email: str) -> Optional[dict]:
    sb = _get_supabase_admin()
    resp = sb.table("comerciales").select("id, email, rol, activo").eq("email", email).eq("activo", True).maybe_single().execute()
    return resp.data if resp and resp.data else None


def verify_supabase_jwt(authorization: Optional[str] = Header(None)) -> dict:
    """
    FastAPI dependency. Valida el JWT, comprueba que el email esté en `comerciales.activo=true`
    y devuelve el dict del comercial: {id, email, rol, activo}.
    Lanza 401 si falta o es inválido.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Falta header Authorization: Bearer <jwt>")

    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_jwt(token)
    email = (payload.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWT sin email")

    comercial = _email_es_comercial_activo(email)
    if not comercial:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario no autorizado")

    return comercial


def verify_director(comercial: dict = Depends(verify_supabase_jwt)) -> dict:
    """Dependency: exige rol director."""
    if comercial.get("rol") != "director":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere rol director")
    return comercial


def verify_jwt_or_cron(
    authorization: Optional[str] = Header(None),
    x_cron_secret: Optional[str] = Header(None),
) -> dict:
    """
    Dependency para endpoints invocados por crons internos (Railway) y también por la UI.
    Acepta:
      - X-Cron-Secret: <INTERNAL_CRON_SECRET>  (cron de Railway)
      - Authorization: Bearer <jwt>            (UI de un comercial)
    """
    if x_cron_secret and INTERNAL_CRON_SECRET and x_cron_secret == INTERNAL_CRON_SECRET:
        return {"id": None, "email": "internal-cron", "rol": "system", "activo": True}
    return verify_supabase_jwt(authorization)
