# Comenta esta línea:
# from app.services.gemini_service import procesar_mensaje_cliente
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Importación de esquemas (si usas ChatRequest/ChatResponse)
from app.schemas import ChatRequest, ChatResponse
from app.services.gemini_service import procesar_mensaje_cliente
# from app.services.gemini_service import procesar_mensaje_cliente
app = FastAPI(
    title="TRILAK SPORT / KEIROS - API Cotizador",
    version="1.0.0",
    description="API RESTful para cotizaciones automáticas con escala de descuentos por volumen y Agente IA"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base de datos de productos con campo 'dimensiones' garantizado en todos
PRODUCTOS_DB = [
    {
        "id": 1,
        "referencia": "FÚTBOL NO 5",
        "descripcion": "Balón Termofijado N° 5 PU",
        "dimensiones": "Circunferencia 68-70 cm, Peso 410-450 g",
        "precio_base": 49000.0
    },
    {
        "id": 2,
        "referencia": "FÚTBOL NO 4",
        "descripcion": "Balón Termofijado N° 4 PU",
        "dimensiones": "Circunferencia 63.5-66 cm, Peso 350-390 g",
        "precio_base": 40000.0
    },
    {
        "id": 3,
        "referencia": "MICROFÚTBOL",
        "descripcion": "Balón Vulcanizado Futsal / Micro",
        "dimensiones": "Circunferencia 62-64 cm, Peso 400-440 g",
        "precio_base": 38000.0
    },
    {
        "id": 4,
        "referencia": "FÚTBOL NO 2",
        "descripcion": "Balón Vulcanizado N° 2 PVC",
        "dimensiones": "Estándar N° 2",
        "precio_base": 24590.0
    },
    {
        "id": 5,
        "referencia": "FÚTBOL NO 5 PVC",
        "descripcion": "Balón Termofijado N° 5 PVC",
        "dimensiones": "Circunferencia 68-70 cm",
        "precio_base": 49000.0
    }
]

def calcular_descuento_por_volumen(cantidad: int) -> float:
    if cantidad >= 100:
        return 0.15
    elif cantidad >= 50:
        return 0.10
    elif cantidad >= 12:
        return 0.05
    return 0.0

@app.get("/api/v1/productos", tags=["Catálogo"])
def listar_productos():
    return PRODUCTOS_DB

@app.post("/api/v1/cotizar", tags=["Cotizador"], summary="Generar Cotización")
def generar_cotizacion(producto_id: int, cantidad: int):
    # 1. Buscar producto
    producto = next((p for p in PRODUCTOS_DB if p["id"] == producto_id), None)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # 2. Cálculos
    precio_base = producto["precio_base"]
    pct_descuento = calcular_descuento_por_volumen(cantidad)
    
    precio_unit_desc_sin_iva = precio_base * (1 - pct_descuento)
    iva_unitario = precio_unit_desc_sin_iva * 0.19
    precio_unit_final_con_iva = precio_unit_desc_sin_iva + iva_unitario
    
    subtotal_neto = precio_unit_desc_sin_iva * cantidad
    total_iva = iva_unitario * cantidad
    total_general = precio_unit_final_con_iva * cantidad
    
    # 3. Retorno directo en JSON (garantiza que 'dimensiones' siempre exista)
    return {
        "producto_id": producto["id"],
        "referencia": producto["referencia"],
        "descripcion": producto["descripcion"],
        "dimensiones": producto.get("dimensiones", "N/A"),
        "cantidad": cantidad,
        "porcentaje_descuento": round(pct_descuento * 100, 2),
        "precio_base_original_sin_iva": round(precio_base, 2),
        "precio_unitario_con_descuento_sin_iva": round(precio_unit_desc_sin_iva, 2),
        "iva_unitario_19_pct": round(iva_unitario, 2),
        "precio_unitario_final_con_iva": round(precio_unit_final_con_iva, 2),
        "subtotal_neto_sin_iva": round(subtotal_neto, 2),
        "total_iva_19_pct": round(total_iva, 2),
        "total_general_con_iva": round(total_general, 2)
    }

@app.post("/api/v1/chat", response_model=ChatResponse, tags=["Agente IA"], summary="Chat Asistente")
def chat_asistente(request: ChatRequest):
    respuesta = procesar_mensaje_cliente(request.mensaje)
    return {"respuesta": respuesta}