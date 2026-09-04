from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Importación de esquemas principales
from app.schemas import ChatRequest, ChatResponse

# Instancia principal de FastAPI
app = FastAPI(
    title="TRILAK SPORT / KEIROS - API Cotizador",
    version="1.0.0",
    description="API RESTful para cotizaciones automáticas con escala de descuentos por volumen y Agente IA"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Importar e incluir los routers de la API
from app.api import webhook

app.include_router(webhook.router, prefix="/api/v1", tags=["Webhook"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "API Cotizador TRILAK SPORT funcionando correctamente"}