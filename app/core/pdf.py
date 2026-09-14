"""
Generador del PDF de cotización.

Recibe SIEMPRE datos ya calculados por app.core.pricing - este módulo solo
da formato, nunca recalcula ni ajusta cifras.
"""

import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)

CARPETA_SALIDA = os.getenv("CARPETA_PDF", "/tmp/cotizaciones")
os.makedirs(CARPETA_SALIDA, exist_ok=True)

LOGO_PATH = os.getenv(
    "LOGO_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "assets", "logo.png"),
)

EMPRESA = {
    "razon_social": os.getenv("EMPRESA_NOMBRE", "TRILAK SPORT S.A.S."),
    "nit": os.getenv("EMPRESA_NIT", "900464121-9"),
    "contacto_comercial": os.getenv("EMPRESA_CONTACTO", "Aldo Reyes"),
    "telefono": os.getenv("EMPRESA_TELEFONO", "3175754903"),
    "email": os.getenv("EMPRESA_EMAIL", "aldo.reyes@keiros.com.co"),
}

CONDICIONES_COMERCIALES_DEFAULT = [
    ("Condiciones Comerciales", [
        "Descuentos: los precios cotizados aplicarán un descuento a partir de las 200 unidades solicitadas.",
        "Forma de pago: 50% de anticipo y 50% restante previo a la entrega del producto.",
        "En virtud de esta propuesta, se hará el pago total a contraentrega una vez entregado el pedido en su totalidad.",
        "Tiempo de entrega: 25 días (calendario y/o sujeto a la cantidad contratada, según corresponda) a partir de "
        "la confirmación de la orden, la aprobación de los artes finales y el pago del anticipo, o dependiendo de "
        "existencias. Entregas parciales semanales.",
        "Diseño: el desarrollo del diseño está incluido y no genera ningún costo adicional sobre el valor del balón.",
    ]),
    ("Especificaciones del Producto", [
        "Características: balón termoformado con diseño personalizado por Keiros. Incluye la marca del cliente a "
        "dos (2) tintas, repujadas en bajo relieve.",
        "Presentación: los balones se entregan inflados y empacados en paquetes de doce (12) unidades.",
        "Opción desinflados: si se solicitan desinflados, requieren un empaque especial y tendrán un costo "
        "adicional de $2.000 por unidad.",
    ]),
    ("Entrega y Transporte", [
        "Puntos de entrega: la entrega se realizará en un único punto asignado por el cliente dentro de Bogotá, o "
        "directamente en nuestra planta de producción en la misma ciudad. No incluye transporte interno en la "
        "ciudad de Bogotá.",
        "Envíos nacionales: la cotización no incluye costos de transporte fuera ni dentro de Bogotá.",
    ]),
    ("Validez de la Oferta", [
        "La presente cotización tiene una validez de quince (15) días calendario a partir de la fecha de "
        "expedición. Pasado este plazo, Trilak Sport no asume ninguna responsabilidad sobre los valores aquí "
        "cotizados.",
    ]),
]


def _formato_pesos(valor: float) -> str:
    return f"${valor:,.0f}".replace(",", ".")


def generar_pdf_cotizacion(
    numero_cotizacion: str,
    fecha_expedicion: datetime,
    fecha_expiracion: datetime,
    nombre_cliente: str,
    items: list,
    empresa_cliente: str = "",
    telefono_cliente: str = "",
    ciudad_entrega: str = "",
    condiciones_comerciales: list | None = None,
    creado_por: str = "",
) -> str:
    ruta_pdf = os.path.join(CARPETA_SALIDA, f"{numero_cotizacion}.pdf")
    secciones_condiciones = condiciones_comerciales or CONDICIONES_COMERCIALES_DEFAULT

    doc = SimpleDocTemplate(
        ruta_pdf, pagesize=letter,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()
    subtitulo_style = ParagraphStyle("Subtitulo", parent=styles["Normal"], fontSize=10, textColor=colors.grey)
    seccion_style = ParagraphStyle(
        "Seccion", parent=styles["Heading3"], fontSize=12,
        spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#1a3c34")
    )
    condicion_style = ParagraphStyle("Condicion", parent=styles["Normal"], fontSize=8.5, leading=11, spaceAfter=4)

    story = []

    # --- Encabezado con logo ---
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image(LOGO_PATH, width=6.5 * cm, height=6.5 * cm * (1643 / 4597))
            story.append(logo)
            story.append(Spacer(1, 6))
        except Exception:
            pass  # si el logo falla, el PDF se genera igual sin él

    datos_empresa = " | ".join(filter(None, [
        f"NIT {EMPRESA['nit']}" if EMPRESA["nit"] else "",
        EMPRESA["contacto_comercial"],
        EMPRESA["telefono"],
        EMPRESA["email"],
    ]))
    if datos_empresa:
        story.append(Paragraph(datos_empresa, subtitulo_style))
    story.append(Spacer(1, 14))

    # --- Datos de la cotización ---
    story.append(Paragraph(f"<b>Cotización N°:</b> {numero_cotizacion}", styles["Normal"]))
    story.append(Paragraph(f"<b>Fecha de expedición:</b> {fecha_expedicion.strftime('%d/%m/%Y')}", styles["Normal"]))
    story.append(Paragraph(
        f"<b>Válida hasta:</b> {fecha_expiracion.strftime('%d/%m/%Y')}",
        ParagraphStyle("Vigencia", parent=styles["Normal"], textColor=colors.HexColor("#b03a2e")),
    ))
    story.append(Paragraph(f"<b>Cliente:</b> {nombre_cliente}", styles["Normal"]))
    if empresa_cliente:
        story.append(Paragraph(f"<b>Empresa:</b> {empresa_cliente}", styles["Normal"]))
    if telefono_cliente:
        story.append(Paragraph(f"<b>Teléfono:</b> {telefono_cliente}", styles["Normal"]))
    if ciudad_entrega:
        story.append(Paragraph(f"<b>Ciudad de entrega:</b> {ciudad_entrega}", styles["Normal"]))
    if creado_por:
        story.append(Paragraph(f"<b>Asesor:</b> {creado_por}", styles["Normal"]))
    story.append(Spacer(1, 14))

    # --- Tabla de productos ---
    encabezados = ["Referencia", "Cant.", "Escala", "V. Unit. c/desc", "Subtotal", "IVA", "Total"]
    filas = [encabezados]
    total_general = 0.0

    for item in items:
        if item.error:
            continue

        if item.escala_aplicada and item.descuento_pct > 0:
            escala_texto = f"E{item.escala_aplicada} (-{item.descuento_pct:.1f}%)"
        else:
            escala_texto = "—"

        filas.append([
            Paragraph(item.descripcion, styles["Normal"]),
            str(item.cantidad),
            escala_texto,
            _formato_pesos(item.precio_unitario_final),
            _formato_pesos(item.subtotal),
            _formato_pesos(item.iva),
            _formato_pesos(item.total),
        ])
        total_general += item.total

    tabla = Table(filas, colWidths=[6.5*cm, 1.2*cm, 1.8*cm, 2.2*cm, 2.2*cm, 1.8*cm, 2.2*cm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c34")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tabla)
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        f"<b>TOTAL COTIZACIÓN: {_formato_pesos(total_general)}</b>",
        ParagraphStyle("Total", parent=styles["Normal"], fontSize=13, alignment=2),
    ))
    story.append(Spacer(1, 16))

    # --- Errores (si algún ítem no se pudo calcular) ---
    items_con_error = [i for i in items if i.error]
    if items_con_error:
        story.append(Paragraph("<b>Atención - ítems no incluidos:</b>", styles["Heading4"]))
        for item in items_con_error:
            story.append(Paragraph(f"• {item.referencia}: {item.error}", styles["Normal"]))
        story.append(Spacer(1, 10))

    # --- Condiciones comerciales por sección ---
    for titulo_seccion, lineas in secciones_condiciones:
        story.append(Paragraph(titulo_seccion, seccion_style))
        for linea in lineas:
            story.append(Paragraph(f"• {linea}", condicion_style))

    doc.build(story)
    return ruta_pdf