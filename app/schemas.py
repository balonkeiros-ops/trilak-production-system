from typing import Optional
from pydantic import BaseModel, Field


# --- Esquemas para el Cotizador ---
class CotizacionRequest(BaseModel):
  producto_id: int = Field(..., description="ID del producto a cotizar")
  cantidad: int = Field(..., gt=0, description="Cantidad de unidades a cotizar")


class CotizacionResponse(BaseModel):
  producto_id: int
  referencia: str
  descripcion: str
  dimensiones: Optional[str] = (
      None  # Permite valor string o None si el producto no tiene dimensiones
  )
  cantidad: int
  porcentaje_descuento: float
  precio_base_original_sin_iva: float
  precio_unitario_con_descuento_sin_iva: float
  iva_unitario_19_pct: float
  precio_unitario_final_con_iva: float
  subtotal_neto_sin_iva: float
  total_iva_19_pct: float
  total_general_con_iva: float


# --- Esquemas para el Agente IA ---
class ChatRequest(BaseModel):
  mensaje: str = Field(..., description="Mensaje del usuario")


class ChatResponse(BaseModel):
  respuesta: str = Field(..., description="Respuesta del asistente IA")