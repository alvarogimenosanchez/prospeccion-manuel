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
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from jose import jwt, JWTError
from supabase import create_client, Client

logger = logging.getLogger(__name__)

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
INTERNAL_CRON_SECRET = os.environ.get("INTERNAL_CRON_SECRET", "")
ENV = os.environ.get("ENV", "production").lower()

_supabase_admin: Optional[Client] = None


def _get_supabase_admin() -> Client:
    global _supabase_admin
    if _supabase_admin is None:
        _supabase_admin = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _supabase_admin


def _decode_jwt(token: str) -> dict:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SUPABASE_JWT_SECRET no configurado en el backend",
        )
    try:
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT inválido: {e}")


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
