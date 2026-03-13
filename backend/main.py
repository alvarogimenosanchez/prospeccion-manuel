"""
Punto de entrada principal del servidor FastAPI.
Ejecutar con: uvicorn main:app --reload --port 8000
"""
from api.webhook_whatsapp import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
