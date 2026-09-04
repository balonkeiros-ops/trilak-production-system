from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db, Producto, calcular_cotizacion_detallada
from app.schemas import CotizacionResponse, ProductoResponse, ChatRequest, ChatResponse
from app.services.gemini_service import procesar_mensaje_cliente  # nota: corregí el nombre

app = FastAPI(
    title="TRILAK SPORT / KEIROS - API Cotizador",
    description="API RESTful para cotizaciones automáticas con escala de descuentos por volumen y Agente IA",
    version="1.0.0"
)

# CORS (bien aplicado)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== ENDPOINTS ==========

@app.get("/api/v1/productos", response_model=List[ProductoResponse], tags=["Catálogo"])
def listar_productos(db: Session = Depends(get_db)):
    productos = db.query(Producto).all()
    return [
        {
            "id": p.id,
            "referencia": p.referencia,
            "descripcion": p.descripcion,
            "precio_base_sin_iva": float(p.precio_unitario_base),
            "precio_total_base_con_iva": float(p.precio_total_base),
        }
        for p in productos
    ]

@app.post("/api/v1/cotizar", response_model=CotizacionResponse, tags=["Cotizador"])
def generar_cotizacion(
    producto_id: int = Query(..., description="ID del producto a cotizar"),
    cantidad: int = Query(..., gt=0, description="Cantidad de unidades"),
    db: Session = Depends(get_db),
):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    cotizacion = calcular_cotizacion_detallada(
        precio_base_sin_iva=producto.precio_unitario_base,
        cantidad=cantidad,
        tarifa_iva=producto.porcentaje_iva
    )
    return {
        "producto_id": producto.id,
        "referencia": producto.referencia,
        "descripcion": producto.descripcion,
        "cantidad": cantidad,
        "cotizacion": cotizacion,
    }

@app.post("/api/v1/chat", response_model=ChatResponse, tags=["Agente IA"])
def chat_asistente(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Endpoint para conversar con el asistente comercial (Gemini).
    """
    try:
        respuesta = procesar_mensaje_cliente(
            mensaje_usuario=request.mensaje,
            historial=request.historial
        )
        # Si la respuesta es None o vacía, lanzamos un error
        if not respuesta:
            raise HTTPException(status_code=500, detail="El asistente no generó una respuesta")
        return ChatResponse(respuesta=respuesta)
    except Exception as e:
        # Registrar el error en logs (puedes usar logging)
        print(f"Error en chat: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")