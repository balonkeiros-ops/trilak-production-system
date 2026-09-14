"""
Cálculo de precios - 100% determinístico. Ninguna función aquí depende de
un modelo de IA. Toda la exactitud de precios, descuentos e IVA sale
directamente de la base de datos (tablas Producto y EscalaDescuento).
"""

from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session

from app.core.models import Producto, EscalaDescuento


@dataclass
class LineaCotizacion:
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


def buscar_producto(db: Session, referencia: str) -> Optional[Producto]:
    """Búsqueda exacta por referencia (case-insensitive)."""
    return (
        db.query(Producto)
        .filter(Producto.referencia.ilike(referencia), Producto.activo == True)  # noqa: E712
        .first()
    )


_PALABRAS_VACIAS = {
    "de", "del", "la", "el", "los", "las", "en", "con", "para", "por", "un", "una",
    "y", "o", "al", "a", "numero", "no", "n", "necesito", "necesitamos", "quiero",
    "requerimos", "solicitamos", "unidades", "unidad",
}


def _quitar_tildes(texto: str) -> str:
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def _tokenizar(texto: str) -> set[str]:
    import re
    limpio = _quitar_tildes(texto.lower())
    limpio = re.sub(r"[^\w]+", " ", limpio)
    palabras = {
        p for p in limpio.split()
        if p not in _PALABRAS_VACIAS and (p.isdigit() or len(p) >= 2)
    }
    return palabras


def _stem_simple(palabra: str) -> str:
    """Quita terminaciones de plural comunes en español, de forma conservadora."""
    if palabra.endswith("es") and len(palabra) > 5:
        return palabra[:-2]
    if palabra.endswith("s") and len(palabra) > 4:
        return palabra[:-1]
    return palabra


def _palabras_relacionadas(a: str, b: str) -> bool:
    """
    Dos palabras 'matchean' si son iguales, o si son iguales tras quitar
    el plural (cronometro/cronometros, cono/conos).
    """
    return a == b or _stem_simple(a) == _stem_simple(b)


def buscar_productos_por_texto(db: Session, texto: str, limite: int = 10) -> list[Producto]:
    """
    [DEPRECATED] Usar buscar_productos_con_score.
    Se mantiene por compatibilidad. Devuelve solo la lista de productos.
    """
    return [p for _, p in buscar_productos_con_score(db, texto, limite)]


def buscar_productos_con_score(db: Session, texto: str, limite: int = 10) -> list[tuple[int, Producto]]:
    """
    Búsqueda con scoring ponderado. Devuelve lista de (score, Producto)
    ordenada de mayor a menor score.

    Pesos por coincidencia:
      - Coincide en REFERENCIA:  +3
      - Coincide en DESCRIPCIÓN: +2
      - Coincide en CATEGORÍA:   +1
      - Coincide en DIMENSIÓN:   +1
      - Bonus si TODAS las palabras del query coinciden: +5

    Ejemplo: "balón fútbol No. 5" vs FUTBOL-5-VULCANIZADO
      balon  → +2 (desc) +1 (cat)      = 3
      futbol → +3 (ref)                = 3
      5      → +3 (ref) +2 (desc)      = 5
      bonus  →                          5
      Total:                            16
    """
    palabras_busqueda = _tokenizar(texto)
    if not palabras_busqueda:
        return []

    productos = db.query(Producto).filter(Producto.activo == True).all()  # noqa: E712

    resultados: list[tuple[int, Producto]] = []

    for p in productos:
        ref_tokens = _tokenizar(p.referencia or "")
        desc_tokens = _tokenizar(p.descripcion or "")
        cat_tokens = _tokenizar(p.categoria or "")
        dim_tokens = _tokenizar(p.dimension or "")

        score = 0
        matched = set()

        for pq in palabras_busqueda:
            matched_any = False

            if any(_palabras_relacionadas(pq, t) for t in ref_tokens):
                score += 3
                matched_any = True
            if any(_palabras_relacionadas(pq, t) for t in desc_tokens):
                score += 2
                matched_any = True
            if any(_palabras_relacionadas(pq, t) for t in cat_tokens):
                score += 1
                matched_any = True
            if any(_palabras_relacionadas(pq, t) for t in dim_tokens):
                score += 1
                matched_any = True

            if matched_any:
                matched.add(pq)

        # Bonus por cobertura completa de todas las palabras
        if matched and len(matched) == len(palabras_busqueda):
            score += 5

        if score > 0:
            resultados.append((score, p))

    resultados.sort(key=lambda t: t[0], reverse=True)
    return resultados[:limite]


def obtener_escala(db: Session, categoria: str, cantidad: int) -> tuple[Optional[int], float]:
    """
    Devuelve (numero_escala, descuento_pct) para una cantidad dada.
    Prioridad: primero busca una regla específica de la categoría del
    producto; si no existe, usa la regla general (categoria = NULL).
    Si no hay ninguna regla configurada, no hay descuento (0%).
    """
    regla = (
        db.query(EscalaDescuento)
        .filter(
            EscalaDescuento.categoria == categoria,
            EscalaDescuento.cantidad_min <= cantidad,
            (EscalaDescuento.cantidad_max.is_(None) | (EscalaDescuento.cantidad_max >= cantidad)),
        )
        .first()
    )

    if regla is None:
        regla = (
            db.query(EscalaDescuento)
            .filter(
                EscalaDescuento.categoria.is_(None),
                EscalaDescuento.cantidad_min <= cantidad,
                (EscalaDescuento.cantidad_max.is_(None) | (EscalaDescuento.cantidad_max >= cantidad)),
            )
            .first()
        )

    if regla is None:
        return None, 0.0

    return regla.escala, regla.descuento_pct


def calcular_linea(db: Session, referencia: str, cantidad: int) -> LineaCotizacion:
    """
    Calcula una línea de cotización completa para un producto y cantidad.
    Esta es LA función que decide precios - nunca debe ser reemplazada
    por una estimación de un modelo de IA.
    """
    producto = buscar_producto(db, referencia)

    if producto is None:
        return LineaCotizacion(
            referencia=referencia, descripcion="", cantidad=cantidad,
            escala_aplicada=None, descuento_pct=0.0,
            precio_unitario_base=0.0, precio_unitario_final=0.0,
            subtotal=0.0, iva=0.0, total=0.0,
            error=f"No existe un producto activo con la referencia '{referencia}'.",
        )

    if cantidad < 1:
        return LineaCotizacion(
            referencia=producto.referencia, descripcion=producto.descripcion,
            cantidad=cantidad, escala_aplicada=None, descuento_pct=0.0,
            precio_unitario_base=producto.precio_unitario, precio_unitario_final=0.0,
            subtotal=0.0, iva=0.0, total=0.0,
            error="La cantidad debe ser mayor a 0.",
        )

    # Solo aplica escala si el producto tiene la bandera activa
    if producto.aplica_descuento_escala:
        escala, descuento_pct = obtener_escala(db, producto.categoria, cantidad)
        # Si no hay descuento real (0%), no mostramos escala
        if descuento_pct == 0.0:
            escala = None
    else:
        escala, descuento_pct = None, 0.0

    precio_final = round(producto.precio_unitario * (1 - descuento_pct / 100), 2)
    subtotal = round(precio_final * cantidad, 2)
    iva = round(subtotal * (producto.iva_pct / 100), 2)
    total = round(subtotal + iva, 2)

    return LineaCotizacion(
        referencia=producto.referencia,
        descripcion=producto.descripcion,
        cantidad=cantidad,
        escala_aplicada=escala,
        descuento_pct=descuento_pct,
        precio_unitario_base=producto.precio_unitario,
        precio_unitario_final=precio_final,
        subtotal=subtotal,
        iva=iva,
        total=total,
    )