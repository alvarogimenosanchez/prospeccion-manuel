"""
Cron de seguimiento — se ejecuta cada hora en Railway como servicio separado.

Railway Cron Service: en railway.json se puede añadir un segundo servicio con
startCommand "python cron_seguimiento.py" y un cron schedule "0 * * * *".

Alternativamente puede correr como worker en bucle con sleep.
"""
from __future__ import annotations

import os
import sys
import time
import logging
import json
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [cron_seguimiento] %(levelname)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("cron_seguimiento")

# Intervalo entre ejecuciones (segundos). Por defecto 1 hora.
INTERVALO_SEGUNDOS = int(os.environ.get("CRON_INTERVALO_SEGUNDOS", 3600))

# Si CRON_SOLO_UNA_VEZ=1 ejecuta una sola vez y sale (útil para Railway Cron)
SOLO_UNA_VEZ = os.environ.get("CRON_SOLO_UNA_VEZ", "0") == "1"


def ejecutar_ciclo() -> None:
    """Importa y ejecuta el agente de seguimiento."""
    # Importar aquí para que los errores de import no maten el loop
    from agents.agent2_seguimiento import ejecutar_seguimiento
    from agents.agent2_seguimiento import _verificar_renovaciones_clientes

    ahora = datetime.now(timezone.utc).isoformat()
    logger.info("▶ Ciclo de seguimiento iniciado — %s", ahora)

    try:
        resultado = ejecutar_seguimiento()
        logger.info(
            "✓ Seguimiento: R0=%d R1=%d R2=%d frías=%d alertas=%d accVenc=%d errores=%d",
            resultado.get("recordatorios_dia1_enviados", 0),
            resultado.get("recordatorios_1_enviados", 0),
            resultado.get("recordatorios_2_enviados", 0),
            resultado.get("leads_marcados_frios", 0),
            resultado.get("alertas_urgentes_creadas", 0),
            resultado.get("acciones_vencidas_notificadas", 0),
            len(resultado.get("errores", [])),
        )
        if resultado.get("errores"):
            for err in resultado["errores"]:
                logger.error("  Error: %s", err)
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("✗ Error en ejecutar_seguimiento: %s", exc)

    # Renovaciones de clientes (solo a las 9h UTC para no spamear)
    hora_utc = datetime.now(timezone.utc).hour
    if hora_utc == 8:  # 9h España hora invierno
        try:
            n = _verificar_renovaciones_clientes()
            logger.info("✓ Renovaciones verificadas: %d alertas generadas", n)
        except Exception as exc:  # pylint: disable=broad-except
            logger.error("✗ Error en renovaciones: %s", exc)


if __name__ == "__main__":
    logger.info("Cron de seguimiento arrancado (intervalo=%ds, solo_una_vez=%s)",
                INTERVALO_SEGUNDOS, SOLO_UNA_VEZ)

    if SOLO_UNA_VEZ:
        ejecutar_ciclo()
        sys.exit(0)

    # Modo worker: bucle con sleep
    while True:
        ejecutar_ciclo()
        logger.info("⏸ Durmiendo %d segundos hasta el próximo ciclo...", INTERVALO_SEGUNDOS)
        time.sleep(INTERVALO_SEGUNDOS)
