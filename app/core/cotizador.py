from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.models import (
    get_db, Cotizacion, CotizacionItem,
    numero_cotizacion_nuevo, fecha_expiracion_default,
)
from app.core.pricing import calcular_linea
from app.core.pdf import generar_pdf_cotizacion

router = APIRouter(prefix="/api/v1", tags=["Cotizador"])


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------

class ItemSolicitado(BaseModel):
    referencia: str
    cantidad: int = Field(..., gt=0)


class SolicitudCotizacion(BaseModel):
    nombre_cliente: str
    empresa_cliente: Optional[str] = None
    telefono_cliente: Optional[str] = None
    ciudad_entrega: Optional[str] = None
    creado_por: Optional[str] = None  # nombre del asesor que genera la cotización
    validez_dias: int = 15
    items: list[ItemSolicitado]


class LineaRespuesta(BaseModel):
    referencia: str
    descripcion: str
    cantidad: int
    escala_aplicada: Optional[int]
    descuento_pct: float
    precio_unitario_base: float
    precio_unitario_final: float
    subtotal: float
    iva: float
    total: float
    error: Optional[str] = None
    sugerencia_usada: Optional[str] = None


class RespuestaCotizacion(BaseModel):
    numero: str
    fecha_expedicion: datetime
    fecha_expiracion: datetime
    subtotal: float
    iva_total: float
    total: float
    items: list[LineaRespuesta]
    pdf_url: str


# ---------------------------------------------------------------------------
# Endpoint principal
# ---------------------------------------------------------------------------

@router.post("/cotizar", response_model=RespuestaCotizacion)
def generar_cotizacion(solicitud: SolicitudCotizacion, db: Session = Depends(get_db)):
    if not solicitud.items:
        raise HTTPException(status_code=400, detail="Debe incluir al menos un producto.")

    lineas = [calcular_linea(db, item.referencia, item.cantidad) for item in solicitud.items]

    lineas_validas = [l for l in lineas if not l.error]
    if not lineas_validas:
        # Ninguna línea se pudo calcular - no se genera cotización ni PDF
        raise HTTPException(
            status_code=422,
            detail={"mensaje": "Ningún producto pudo cotizarse.", "detalles": [l.error for l in lineas]},
        )

    subtotal = round(sum(l.subtotal for l in lineas_validas), 2)
    iva_total = round(sum(l.iva for l in lineas_validas), 2)
    total = round(sum(l.total for l in lineas_validas), 2)

    numero = numero_cotizacion_nuevo()
    fecha_exp = datetime.utcnow()
    fecha_expira = fecha_expiracion_default(solicitud.validez_dias)

    # --- Persistir en base de datos (trazabilidad / auditoría de precios) ---
    cotizacion_db = Cotizacion(
        numero=numero,
        nombre_cliente=solicitud.nombre_cliente,
        empresa_cliente=solicitud.empresa_cliente,
        telefono_cliente=solicitud.telefono_cliente,
        ciudad_entrega=solicitud.ciudad_entrega,
        fecha_expedicion=fecha_exp,
        fecha_expiracion=fecha_expira,
        subtotal=subtotal,
        iva_total=iva_total,
        total=total,
        creado_por=solicitud.creado_por,
    )
    db.add(cotizacion_db)
    db.flush()  # asigna cotizacion_db.id sin cerrar la transacción

    for l in lineas_validas:
        db.add(CotizacionItem(
            cotizacion_id=cotizacion_db.id,
            referencia=l.referencia, descripcion=l.descripcion, cantidad=l.cantidad,
            escala_aplicada=l.escala_aplicada, descuento_pct=l.descuento_pct,
            precio_unitario_base=l.precio_unitario_base, precio_unitario_final=l.precio_unitario_final,
            subtotal=l.subtotal, iva=l.iva, total=l.total,
        ))
    db.commit()

    # --- Generar PDF ---
    ruta_pdf = generar_pdf_cotizacion(
        numero_cotizacion=numero,
        fecha_expedicion=fecha_exp,
        fecha_expiracion=fecha_expira,
        nombre_cliente=solicitud.nombre_cliente,
        items=lineas,  # incluye también las que tuvieron error, para que quede visible
        empresa_cliente=solicitud.empresa_cliente or "",
        telefono_cliente=solicitud.telefono_cliente or "",
        ciudad_entrega=solicitud.ciudad_entrega or "",
        creado_por=solicitud.creado_por or "",
    )

    return RespuestaCotizacion(
        numero=numero,
        fecha_expedicion=fecha_exp,
        fecha_expiracion=fecha_expira,
        subtotal=subtotal,
        iva_total=iva_total,
        total=total,
        items=[LineaRespuesta(**l.__dict__) for l in lineas],
        pdf_url=f"/api/v1/cotizaciones/{numero}/pdf",
    )


@router.get("/cotizaciones/{numero}/pdf")
def descargar_pdf(numero: str):
    import os
    from app.core.pdf import CARPETA_SALIDA
    ruta = os.path.join(CARPETA_SALIDA, f"{numero}.pdf")
    if not os.path.exists(ruta):
        raise HTTPException(status_code=404, detail="PDF no encontrado (puede haber expirado del servidor).")
    return FileResponse(ruta, media_type="application/pdf", filename=f"{numero}.pdf")


@router.get("/cotizaciones")
def listar_cotizaciones(limite: int = 50, db: Session = Depends(get_db)):
    """Historial de cotizaciones generadas, más recientes primero."""
    cotizaciones = (
        db.query(Cotizacion)
        .order_by(Cotizacion.fecha_expedicion.desc())
        .limit(limite)
        .all()
    )
    return [
        {
            "numero": c.numero,
            "nombre_cliente": c.nombre_cliente,
            "empresa_cliente": c.empresa_cliente,
            "fecha_expedicion": c.fecha_expedicion,
            "fecha_expiracion": c.fecha_expiracion,
            "total": c.total,
            "creado_por": c.creado_por,
        }
        for c in cotizaciones
    ]