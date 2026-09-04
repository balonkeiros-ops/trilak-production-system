"""
Catálogo de precios y reglas de negocio - TRILAK SPORT S.A.S. (KEIROS)

Fuente: REGLAS_DE_NEGOCIO.xlsx (hojas: "Cotización de Balones", "Ficha Técnica
y Comparativa", "Escala")

IMPORTANTE: Este archivo contiene ÚNICAMENTE datos y reglas fijas. Ninguna
función aquí depende de un modelo de IA. El LLM (OpenAI/OpenRouter) NUNCA debe
inventar ni ajustar precios, IVA, descuentos o fechas de entrega - todo sale
de este catálogo y de las funciones determinísticas de abajo.

SUPUESTOS APLICADOS (confirmar con el dueño del negocio si no son correctos):
1. Descuento por escala: acumulativo desde la escala 1, +1 escala = -2.5%
   adicional sobre el precio unitario de tabla (ver ESCALAS_DESCUENTO).
2. Pedido mínimo: se respeta la tabla de Escala (arranca en 1 unidad), NO la
   nota "Escala de 1.000 a 5.000 unidades" de la Ficha Técnica, que entra en
   conflicto con la tabla de descuentos.
3. Rango de escala corregido: el Excel tenía un vacío entre 200 y 202
   unidades; se normalizó a un rango continuo 201-500.
"""

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# DATOS DE LA EMPRESA (para encabezado de cotizaciones / PDF)
# ---------------------------------------------------------------------------

EMPRESA = {
    "razon_social": "TRILAK SPORT S.A.S. - KEIROS",
    "nit": "900464121-9",
    "contacto_comercial": "Aldo Reyes",
    "email": "aldo.reyes@keiros.com",
    "telefono": "3175754903",
    "sitio_web": "www.trilaksport.com / www.keiros.com.co",
    "direccion_planta": "Calle 6a #32-44, Zona Industrial Pensilvania, Bogotá",
    "tiempo_entrega": "Entrega parcial 25 días después de la Orden de Compra",
    "lugar_entrega_base": "Entregado en Bogotá",
}


# ---------------------------------------------------------------------------
# ESCALA DE DESCUENTOS POR VOLUMEN
# ---------------------------------------------------------------------------
# SUPUESTO #1: descuento acumulativo de 2.5% por cada escala sobre el precio
# unitario base de tabla. Escala 1 = precio de tabla sin descuento.

ESCALAS_DESCUENTO = [
    {"escala": 1, "min": 1, "max": 50, "descuento_pct": 0.0},
    {"escala": 2, "min": 51, "max": 200, "descuento_pct": 2.5},
    {"escala": 3, "min": 201, "max": 500, "descuento_pct": 5.0},
    {"escala": 4, "min": 501, "max": 1000, "descuento_pct": 7.5},
    {"escala": 5, "min": 1001, "max": 2000, "descuento_pct": 10.0},
    {"escala": 6, "min": 2001, "max": None, "descuento_pct": 12.5},  # sin tope
]

IVA_PORCENTAJE = 19.0


# ---------------------------------------------------------------------------
# CATÁLOGO DE PRODUCTOS
# ---------------------------------------------------------------------------
# precio_unitario = precio de tabla SIN IVA, SIN descuento por escala.
# El precio final para una cotización se calcula siempre con calcular_precio().

CATALOGO_PRECIOS = [
    # --- 1. BALÓN VULCANIZADO (Cubierta Semi Brillante) ---
    {
        "referencia": "FUTBOL NO 5 VULCANIZADO",
        "categoria": "Balón Vulcanizado",
        "descripcion": "Balón Vulcanizado N° 5 PVC",
        "dimension": "Circunf 67-69 cm | Altura 22 cm",
        "precio_unitario": 29000,
        "especificaciones": (
            "Neumático de Látex, enmallado en Poli Nylon, doble capa de "
            "masilla, tintas libres de metales pesados. Grabado en molde."
        ),
    },
    {
        "referencia": "FUTBOL NO 4 VULCANIZADO",
        "categoria": "Balón Vulcanizado",
        "descripcion": "Balón Vulcanizado N° 4 PVC",
        "dimension": "Circunf 64-65 cm | Altura 20 cm",
        "precio_unitario": 29000,
        "especificaciones": (
            "Neumático de Látex, enmallado en Poli Nylon, doble capa de "
            "masilla, tintas libres de metales pesados. Grabado en molde."
        ),
    },
    {
        "referencia": "FUTBOL NO 3 VULCANIZADO",
        "categoria": "Balón Vulcanizado",
        "descripcion": "Balón Vulcanizado N° 3 PVC",
        "dimension": "Circunf 53-55 cm | Altura 18 cm",
        "precio_unitario": 27000,
        "especificaciones": (
            "Neumático de Látex, enmallado en Poli Nylon, doble capa de "
            "masilla, tintas libres de metales pesados. Grabado en molde."
        ),
    },
    {
        "referencia": "FUTBOL NO 2 VULCANIZADO",
        "categoria": "Balón Vulcanizado",
        "descripcion": "Balón Vulcanizado N° 2 PVC",
        "dimension": "Circunf 42-45 cm | Altura 14 cm",
        "precio_unitario": 24590,
        "especificaciones": (
            "Neumático de Látex, enmallado en Poli Nylon, doble capa de "
            "masilla, tintas libres de metales pesados. Grabado en molde."
        ),
    },

    # --- 2. BALÓN TERMOFORMADO (Cubierta PVC Relieve) ---
    {
        "referencia": "FUTBOL NO 5 TERMOFORMADO PVC",
        "categoria": "Balón Termoformado PVC",
        "descripcion": "Balón Termoformado N° 5 PVC",
        "dimension": "Circunf 67-69 cm | Altura 22 cm",
        "precio_unitario": 49000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "FUTBOL NO 4 TERMOFORMADO PVC",
        "categoria": "Balón Termoformado PVC",
        "descripcion": "Balón Termoformado N° 4 PVC",
        "dimension": "Circunf 64-65 cm | Altura 20 cm",
        "precio_unitario": 49000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "FUTBOL NO 3 TERMOFORMADO PVC",
        "categoria": "Balón Termoformado PVC",
        "descripcion": "Balón Termoformado N° 3 PVC",
        "dimension": "Circunf 53-55 cm | Altura 18 cm",
        "precio_unitario": 45000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "FUTBOL NO 2 TERMOFORMADO PVC",
        "categoria": "Balón Termoformado PVC",
        "descripcion": "Balón Termoformado N° 2 PVC",
        "dimension": "Circunf 42-45 cm | Altura 14 cm",
        "precio_unitario": 34590,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },

    # --- 3. BALÓN TERMOFORMADO (Cubierta PU Relieve) ---
    {
        "referencia": "FUTBOL NO 5 TERMOFORMADO PU",
        "categoria": "Balón Termoformado PU",
        "descripcion": "Balón Termoformado N° 5 PU",
        "dimension": "Circunf 67-69 cm | Altura 22 cm",
        "precio_unitario": 55000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta poliuretano PU 3mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "FUTBOL NO 4 TERMOFORMADO PU",
        "categoria": "Balón Termoformado PU",
        "descripcion": "Balón Termoformado N° 4 PU",
        "dimension": "Circunf 64-65 cm | Altura 20 cm",
        "precio_unitario": 55000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta poliuretano PU 3mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "FUTBOL NO 3 TERMOFORMADO PU",
        "categoria": "Balón Termoformado PU",
        "descripcion": "Balón Termoformado N° 3 PU",
        "dimension": "Circunf 53-55 cm | Altura 18 cm",
        "precio_unitario": 52000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta poliuretano PU 3mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "FUTBOL NO 2 TERMOFORMADO PU",
        "categoria": "Balón Termoformado PU",
        "descripcion": "Balón Termoformado N° 2 PU",
        "dimension": "Circunf 42-45 cm | Altura 14 cm",
        "precio_unitario": 47000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta poliuretano PU 3mm. Marca en bajo relieve."
        ),
    },

    # --- 4. BALONES DE BALONCESTO EN CAUCHO ---
    {
        "referencia": "BALONCESTO NO 7",
        "categoria": "Balón de Baloncesto",
        "descripcion": "Balón de Baloncesto Caucho Profesional",
        "dimension": "Tamaño N° 7",
        "precio_unitario": 45000,
        "especificaciones": (
            "Balón baloncesto caucho, neumático de butilo enmallado en "
            "nylon impermeabilizado en caucho, cubierta de alta resistencia."
        ),
    },
    {
        "referencia": "BALONCESTO NO 6",
        "categoria": "Balón de Baloncesto",
        "descripcion": "Balón de Baloncesto Caucho Femenino / Juvenil",
        "dimension": "Tamaño N° 6",
        "precio_unitario": 44000,
        "especificaciones": (
            "Balón baloncesto caucho, neumático de butilo enmallado en "
            "nylon impermeabilizado en caucho, cubierta de alta resistencia."
        ),
    },
    {
        "referencia": "BALONCESTO NO 5",
        "categoria": "Balón de Baloncesto",
        "descripcion": "Balón de Baloncesto Caucho Infantil",
        "dimension": "Tamaño N° 5",
        "precio_unitario": 43600,
        "especificaciones": (
            "Balón baloncesto caucho, neumático de butilo enmallado en "
            "nylon impermeabilizado en caucho, cubierta de alta resistencia."
        ),
    },
    {
        "referencia": "BALONCESTO NO 3",
        "categoria": "Balón de Baloncesto",
        "descripcion": "Balón de Baloncesto Caucho Mini",
        "dimension": "Tamaño N° 3",
        "precio_unitario": 41000,
        "especificaciones": (
            "Balón baloncesto caucho, neumático de butilo enmallado en "
            "nylon impermeabilizado en caucho, cubierta de alta resistencia."
        ),
    },

    # --- 5. BALONES MEDICINALES Y BALÓN SONORO ---
    {
        "referencia": "BALON MEDICINAL 1KG",
        "categoria": "Balón Medicinal",
        "descripcion": "Balón Medicinal en Caucho - 1 Kilo",
        "dimension": "Peso: 1 Kg",
        "precio_unitario": 46150,
        "especificaciones": None,
    },
    {
        "referencia": "BALON MEDICINAL 2KG",
        "categoria": "Balón Medicinal",
        "descripcion": "Balón Medicinal en Caucho - 2 Kilos",
        "dimension": "Peso: 2 Kg",
        "precio_unitario": 47725,
        "especificaciones": None,
    },
    {
        "referencia": "BALON MEDICINAL 3KG",
        "categoria": "Balón Medicinal",
        "descripcion": "Balón Medicinal en Caucho - 3 Kilos",
        "dimension": "Peso: 3 Kg",
        "precio_unitario": 49300,
        "especificaciones": None,
    },
    {
        "referencia": "BALON MEDICINAL 4KG",
        "categoria": "Balón Medicinal",
        "descripcion": "Balón Medicinal en Caucho - 4 Kilos",
        "dimension": "Peso: 4 Kg",
        "precio_unitario": 50500,
        "especificaciones": None,
    },
    {
        "referencia": "BALON MEDICINAL 5KG",
        "categoria": "Balón Medicinal",
        "descripcion": "Balón Medicinal en Caucho - 5 Kilos",
        "dimension": "Peso: 5 Kg",
        "precio_unitario": 52400,
        "especificaciones": None,
    },
    {
        "referencia": "BALON SONORO",
        "categoria": "Balón Sonoro",
        "descripcion": "Balón Sonoro Especial para Discapacidad Visual",
        "dimension": "Estándar",
        "precio_unitario": 57000,
        "especificaciones": None,
    },

    # --- 6. BALÓN VOLEIBOL (Termoformado PVC) ---
    {
        "referencia": "VOLEIBOL NO 5",
        "categoria": "Balón de Voleibol",
        "descripcion": "Balón Termoformado N° 5 PVC (Voleibol)",
        "dimension": "Circunf 65-67 cm",
        "precio_unitario": 49000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },
    {
        "referencia": "VOLEIBOL NO 4",
        "categoria": "Balón de Voleibol",
        "descripcion": "Balón Termoformado N° 4 PVC (Voleibol)",
        "dimension": "Circunf 62-64 cm",
        "precio_unitario": 47000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },

    # --- 7. BALÓN FUTBOL SALA (Termoformado PVC) ---
    {
        "referencia": "FUTBOL SALA PVC",
        "categoria": "Balón Fútbol Sala",
        "descripcion": "Balón Termoformado 62-64 PVC (Fútbol Sala)",
        "dimension": "Circunf 62-64 cm",
        "precio_unitario": 52000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },

    # --- 8. BALÓN FUTBOL SALA (Termoformado PU) ---
    {
        "referencia": "FUTBOL SALA PU",
        "categoria": "Balón Fútbol Sala",
        "descripcion": "Balón Termoformado 62-64 PU (Fútbol Sala)",
        "dimension": "Circunf 62-64 cm",
        "precio_unitario": 52000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PU 3mm. Marca en bajo relieve."
        ),
    },

    # --- 9. BALÓN MICROFÚTBOL ---
    {
        "referencia": "MICROFUTBOL PVC",
        "categoria": "Balón Microfútbol",
        "descripcion": "Balón Termoformado 60-62 PVC (Microfútbol)",
        "dimension": "Circunf 60-62 cm",
        "precio_unitario": 52000,
        "especificaciones": (
            "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural "
            "esponjoso, cubierta PVC 2mm. Marca en bajo relieve."
        ),
    },
]


# ---------------------------------------------------------------------------
# FICHA TÉCNICA COMPARATIVA (Vulcanizado vs Termoformado)
# ---------------------------------------------------------------------------

FICHA_TECNICA_COMPARATIVA = {
    "Tipo de Construcción": {
        "Balón Vulcanizado": "Vulcanizado (moldeado)",
        "Balón Termoformado": "Termosellado / Laminado al calor",
    },
    "Cámara / Neumático": {
        "Balón Vulcanizado": "Neumático de látex",
        "Balón Termoformado": "Cámara de butilo (válvula removible)",
    },
    "Cubierta Exterior": {
        "Balón Vulcanizado": "Cuero sintético PVC",
        "Balón Termoformado": "Poliuretano o PVC de 2mm (con relieve)",
    },
    "Estructura Interior": {
        "Balón Vulcanizado": "Enmallado en poly nylon",
        "Balón Termoformado": "Capa interior en Nylon 100% Ducilo",
    },
    "Capas Internas / Preforma": {
        "Balón Vulcanizado": "Doble capa de masilla",
        "Balón Termoformado": "Caucho con microcápsulas para mayor suavidad",
    },
    "Personalización / Marcas": {
        "Balón Vulcanizado": "Estampado con tinta libre de metales pesados",
        "Balón Termoformado": "Grabado en bajo relieve / Personalización incluida",
    },
    "Rango de Peso": {
        "Balón Vulcanizado": "300 a 450 grs (según tamaño)",
        "Balón Termoformado": "300 a 450 grs (según tamaño)",
    },
    "Garantía": {
        "Balón Vulcanizado": "Garantía de fábrica",
        "Balón Termoformado": "3 meses por defecto de fabricación (condiciones normales)",
    },
}


# ---------------------------------------------------------------------------
# FUNCIONES DE NEGOCIO (determinísticas - SIN IA)
# ---------------------------------------------------------------------------

@dataclass
class ResultadoCotizacion:
    referencia: str
    descripcion: str
    cantidad: int
    escala_aplicada: int
    descuento_pct: float
    precio_unitario_base: float
    precio_unitario_con_descuento: float
    subtotal_sin_iva: float
    iva: float
    total_con_iva: float
    producto_no_encontrado: bool = False
    error: Optional[str] = None


def buscar_producto(texto_busqueda: str) -> list[dict]:
    """
    Busca productos en el catálogo por coincidencia de texto en referencia,
    descripción o categoría. Devuelve una lista de coincidencias (puede
    estar vacía si no hay match, o tener varias si el texto es ambiguo).

    Esta función NO usa IA - es búsqueda determinística por texto. El LLM
    se usa ANTES de esto, solo para traducir el mensaje ambiguo del cliente
    ("balones para el colegio") en términos de búsqueda razonables
    ("futbol", "no 5"), pero la búsqueda y el match final son de este código.
    """
    texto = texto_busqueda.strip().lower()
    if not texto:
        return []

    resultados = []
    for producto in CATALOGO_PRECIOS:
        campos = " ".join(
            str(v) for v in [
                producto["referencia"],
                producto["descripcion"],
                producto["categoria"],
            ]
        ).lower()
        if texto in campos:
            resultados.append(producto)

    return resultados


def obtener_escala(cantidad: int) -> dict:
    """Devuelve el bloque de escala/descuento que aplica a una cantidad dada."""
    for bloque in ESCALAS_DESCUENTO:
        minimo = bloque["min"]
        maximo = bloque["max"]
        if cantidad >= minimo and (maximo is None or cantidad <= maximo):
            return bloque
    # Si por algún motivo no cae en ningún rango (ej. cantidad <= 0),
    # se devuelve la escala más baja como fallback seguro.
    return ESCALAS_DESCUENTO[0]


def calcular_precio(referencia: str, cantidad: int) -> ResultadoCotizacion:
    """
    Calcula el precio final para una referencia y cantidad dadas, aplicando
    la escala de descuento correspondiente y el IVA del 19%.

    Esta es LA función que decide precios. El LLM nunca debe hacer este
    cálculo por su cuenta - solo debe llamar a esta función con los
    parámetros que extrajo del mensaje del cliente.
    """
    producto = next(
        (p for p in CATALOGO_PRECIOS if p["referencia"] == referencia), None
    )

    if producto is None:
        return ResultadoCotizacion(
            referencia=referencia,
            descripcion="",
            cantidad=cantidad,
            escala_aplicada=0,
            descuento_pct=0.0,
            precio_unitario_base=0.0,
            precio_unitario_con_descuento=0.0,
            subtotal_sin_iva=0.0,
            iva=0.0,
            total_con_iva=0.0,
            producto_no_encontrado=True,
            error=f"Referencia '{referencia}' no existe en el catálogo.",
        )

    if cantidad < 1:
        return ResultadoCotizacion(
            referencia=referencia,
            descripcion=producto["descripcion"],
            cantidad=cantidad,
            escala_aplicada=0,
            descuento_pct=0.0,
            precio_unitario_base=producto["precio_unitario"],
            precio_unitario_con_descuento=0.0,
            subtotal_sin_iva=0.0,
            iva=0.0,
            total_con_iva=0.0,
            error="La cantidad debe ser mayor a 0.",
        )

    escala = obtener_escala(cantidad)
    precio_base = producto["precio_unitario"]
    precio_con_descuento = round(precio_base * (1 - escala["descuento_pct"] / 100), 2)

    subtotal = round(precio_con_descuento * cantidad, 2)
    iva = round(subtotal * (IVA_PORCENTAJE / 100), 2)
    total = round(subtotal + iva, 2)

    return ResultadoCotizacion(
        referencia=producto["referencia"],
        descripcion=producto["descripcion"],
        cantidad=cantidad,
        escala_aplicada=escala["escala"],
        descuento_pct=escala["descuento_pct"],
        precio_unitario_base=precio_base,
        precio_unitario_con_descuento=precio_con_descuento,
        subtotal_sin_iva=subtotal,
        iva=iva,
        total_con_iva=total,
    )


def listar_categorias() -> list[str]:
    """Devuelve las categorías únicas del catálogo, útil para mostrar un menú."""
    vistas = []
    for p in CATALOGO_PRECIOS:
        if p["categoria"] not in vistas:
            vistas.append(p["categoria"])
    return vistas


if __name__ == "__main__":
    # Prueba rápida manual: python -m app.core.pricing
    ejemplo = calcular_precio("FUTBOL NO 5 TERMOFORMADO PVC", 750)
    print(ejemplo)