from pydantic import BaseModel, Field
from typing import List, Optional

class MensajeChat(BaseModel):
    role: str  # "user" o "model"
    text: str

class ChatRequest(BaseModel):
    mensaje: str
    historial: Optional[List[MensajeChat]] = []

class ChatResponse(BaseModel):
    respuesta: str

class CotizacionRequest(BaseModel):
    producto_id: int = Field(..., example=1, description="ID del producto en la base de datos")
    cantidad: int = Field(..., gt=0, example=100, description="Cantidad de unidades a cotizar (debe ser mayor a 0)")

class CotizacionDetalleResponse(BaseModel):
    cantidad: int
    porcentaje_descuento: float
    precio_base_original_sin_iva: float
    precio_unitario_con_descuento_sin_iva: float
    iva_unitario_19_pct: float
    precio_unitario_final_con_iva: float
    subtotal_neto_sin_iva: float
    total_iva_19_pct: float
    total_general_con_iva: float

class CotizacionResponse(BaseModel):
    producto_id: int
    referencia: str
    descripcion: str
    dimensiones: str
    cotizacion: CotizacionDetalleResponse

class ProductoResponse(BaseModel):
    id: int
    referencia: str
    descripcion: str
    precio_base_sin_iva: float
    precio_total_base_con_iva: float

    class Config:
        from_attributes = True