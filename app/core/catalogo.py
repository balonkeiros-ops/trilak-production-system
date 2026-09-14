"""
Gestión del catálogo: carga masiva por Excel + edición individual.

Formato esperado del Excel (hoja "Productos"):
  referencia | categoria | descripcion | dimension | precio_unitario | iva_pct | especificaciones

Formato esperado del Excel (hoja "Escalas", opcional):
  categoria | escala | cantidad_min | cantidad_max | descuento_pct
  (deja 'categoria' vacío para que la regla aplique a TODAS las categorías)
"""

import io
from datetime import datetime
from typing import Optional

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.models import get_db, Producto, EscalaDescuento

router = APIRouter(prefix="/api/v1/catalogo", tags=["Catálogo"])


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------

class ProductoIn(BaseModel):
    referencia: str = Field(..., max_length=120)
    categoria: str = Field(..., max_length=120)
    descripcion: str = Field(..., max_length=300)
    dimension: Optional[str] = None
    especificaciones: Optional[str] = None
    precio_unitario: float = Field(..., gt=0)
    iva_pct: float = Field(19.0, ge=0, le=100)
    aplica_descuento_escala: bool = False
    activo: bool = True


class ProductoOut(ProductoIn):
    id: int
    actualizado_en: datetime

    class Config:
        from_attributes = True


class EscalaIn(BaseModel):
    categoria: Optional[str] = None  # None = aplica a todas
    escala: int
    cantidad_min: int = Field(..., ge=1)
    cantidad_max: Optional[int] = None
    descuento_pct: float = Field(..., ge=0, le=100)


class EscalaOut(EscalaIn):
    id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Carga masiva por Excel
# ---------------------------------------------------------------------------

@router.post("/upload-excel")
async def cargar_catalogo_excel(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Sube un Excel con hoja 'Productos' (obligatoria) y opcionalmente hoja
    'Escalas'. Actualiza productos existentes por 'referencia' (upsert) e
    inserta los nuevos. No borra productos que no vengan en el archivo.
    """
    if not archivo.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx o .xls")

    contenido = await archivo.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el Excel: {e}")

    if "Productos" not in wb.sheetnames:
        raise HTTPException(
            status_code=400,
            detail=f"Falta la hoja 'Productos'. Hojas encontradas: {wb.sheetnames}",
        )

    hoja = wb["Productos"]
    encabezados = [str(c.value).strip().lower() if c.value else "" for c in hoja[1]]
    columnas_requeridas = {"referencia", "categoria", "descripcion", "precio_unitario"}
    if not columnas_requeridas.issubset(set(encabezados)):
        raise HTTPException(
            status_code=400,
            detail=f"Faltan columnas obligatorias. Encontradas: {encabezados}. "
                   f"Requeridas: {sorted(columnas_requeridas)}",
        )

    idx = {nombre: i for i, nombre in enumerate(encabezados)}
    productos_creados, productos_actualizados, errores = 0, 0, []

    for num_fila, fila in enumerate(hoja.iter_rows(min_row=2, values_only=True), start=2):
        if not fila or all(v is None for v in fila):
            continue

        try:
            referencia = str(fila[idx["referencia"]]).strip()
            categoria = str(fila[idx["categoria"]]).strip()
            descripcion = str(fila[idx["descripcion"]]).strip()
            precio_unitario = float(fila[idx["precio_unitario"]])
            dimension = str(fila[idx["dimension"]]).strip() if "dimension" in idx and fila[idx["dimension"]] else None
            especificaciones = (
                str(fila[idx["especificaciones"]]).strip()
                if "especificaciones" in idx and fila[idx["especificaciones"]] else None
            )
            iva_pct = float(fila[idx["iva_pct"]]) if "iva_pct" in idx and fila[idx["iva_pct"]] is not None else 19.0

            # Columna opcional 'aplica_descuento_escala': acepta TRUE/FALSE,
            # SI/NO, 1/0. Si la columna no existe en el Excel, por defecto
            # es False (más seguro: nunca aplicar descuento por accidente).
            aplica_escala = False
            if "aplica_descuento_escala" in idx and fila[idx["aplica_descuento_escala"]] is not None:
                valor_crudo = str(fila[idx["aplica_descuento_escala"]]).strip().lower()
                aplica_escala = valor_crudo in ("true", "si", "sí", "1", "yes")

            if not referencia or not categoria or not descripcion or precio_unitario <= 0:
                errores.append(f"Fila {num_fila}: datos incompletos o precio inválido, se omitió.")
                continue

            existente = db.query(Producto).filter(Producto.referencia.ilike(referencia)).first()
            if existente:
                existente.categoria = categoria
                existente.descripcion = descripcion
                existente.dimension = dimension
                existente.especificaciones = especificaciones
                existente.precio_unitario = precio_unitario
                existente.iva_pct = iva_pct
                existente.aplica_descuento_escala = aplica_escala
                existente.activo = True
                productos_actualizados += 1
            else:
                db.add(Producto(
                    referencia=referencia, categoria=categoria, descripcion=descripcion,
                    dimension=dimension, especificaciones=especificaciones,
                    precio_unitario=precio_unitario, iva_pct=iva_pct,
                    aplica_descuento_escala=aplica_escala, activo=True,
                ))
                productos_creados += 1

        except Exception as e:
            errores.append(f"Fila {num_fila}: {e}")

    # --- Hoja de Escalas (opcional) ---
    escalas_creadas = 0
    if "Escalas" in wb.sheetnames:
        hoja_esc = wb["Escalas"]
        enc_esc = [str(c.value).strip().lower() if c.value else "" for c in hoja_esc[1]]
        idx_esc = {nombre: i for i, nombre in enumerate(enc_esc)}
        requeridas_esc = {"escala", "cantidad_min", "descuento_pct"}

        if requeridas_esc.issubset(set(enc_esc)):
            # Reemplaza todas las escalas existentes por las nuevas del archivo
            db.query(EscalaDescuento).delete()
            for fila in hoja_esc.iter_rows(min_row=2, values_only=True):
                if not fila or all(v is None for v in fila):
                    continue
                try:
                    categoria_esc = (
                        str(fila[idx_esc["categoria"]]).strip()
                        if "categoria" in idx_esc and fila[idx_esc["categoria"]] else None
                    )
                    db.add(EscalaDescuento(
                        categoria=categoria_esc,
                        escala=int(fila[idx_esc["escala"]]),
                        cantidad_min=int(fila[idx_esc["cantidad_min"]]),
                        cantidad_max=(
                            int(fila[idx_esc["cantidad_max"]])
                            if "cantidad_max" in idx_esc and fila[idx_esc["cantidad_max"]] is not None else None
                        ),
                        descuento_pct=float(fila[idx_esc["descuento_pct"]]),
                    ))
                    escalas_creadas += 1
                except Exception as e:
                    errores.append(f"Hoja Escalas: {e}")

    db.commit()

    return {
        "productos_creados": productos_creados,
        "productos_actualizados": productos_actualizados,
        "escalas_cargadas": escalas_creadas,
        "errores": errores,
    }


# ---------------------------------------------------------------------------
# CRUD individual de productos
# ---------------------------------------------------------------------------

@router.get("/productos", response_model=list[ProductoOut])
def listar_productos(categoria: Optional[str] = None, solo_activos: bool = True, db: Session = Depends(get_db)):
    query = db.query(Producto)
    if solo_activos:
        query = query.filter(Producto.activo == True)  # noqa: E712
    if categoria:
        query = query.filter(Producto.categoria.ilike(categoria))
    return query.order_by(Producto.categoria, Producto.referencia).all()


@router.get("/productos/{producto_id}", response_model=ProductoOut)
def obtener_producto(producto_id: int, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


@router.post("/productos", response_model=ProductoOut)
def crear_producto(datos: ProductoIn, db: Session = Depends(get_db)):
    existente = db.query(Producto).filter(Producto.referencia.ilike(datos.referencia)).first()
    if existente:
        raise HTTPException(status_code=409, detail="Ya existe un producto con esa referencia")
    producto = Producto(**datos.model_dump())
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


@router.put("/productos/{producto_id}", response_model=ProductoOut)
def actualizar_producto(producto_id: int, datos: ProductoIn, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for campo, valor in datos.model_dump().items():
        setattr(producto, campo, valor)
    db.commit()
    db.refresh(producto)
    return producto


@router.delete("/productos/{producto_id}")
def desactivar_producto(producto_id: int, db: Session = Depends(get_db)):
    """No borra físicamente - desactiva, para no romper cotizaciones históricas."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    producto.activo = False
    db.commit()
    return {"status": "desactivado", "id": producto_id}


# ---------------------------------------------------------------------------
# CRUD de escalas de descuento
# ---------------------------------------------------------------------------

@router.get("/escalas", response_model=list[EscalaOut])
def listar_escalas(db: Session = Depends(get_db)):
    return db.query(EscalaDescuento).order_by(EscalaDescuento.categoria, EscalaDescuento.escala).all()


@router.post("/escalas", response_model=EscalaOut)
def crear_escala(datos: EscalaIn, db: Session = Depends(get_db)):
    escala = EscalaDescuento(**datos.model_dump())
    db.add(escala)
    db.commit()
    db.refresh(escala)
    return escala


@router.delete("/escalas/{escala_id}")
def borrar_escala(escala_id: int, db: Session = Depends(get_db)):
    escala = db.query(EscalaDescuento).filter(EscalaDescuento.id == escala_id).first()
    if not escala:
        raise HTTPException(status_code=404, detail="Escala no encontrada")
    db.delete(escala)
    db.commit()
    return {"status": "eliminada", "id": escala_id}


@router.get("/categorias")
def listar_categorias(db: Session = Depends(get_db)):
    """Categorías únicas del catálogo, útil para llenar selects en el frontend."""
    filas = db.query(Producto.categoria).filter(Producto.activo == True).distinct().all()  # noqa: E712
    return sorted([f[0] for f in filas])