"""
Generador del PDF de cotización.

Recibe SIEMPRE resultados ya calculados por app.core.pricing.calcular_precio -
este módulo solo da formato, nunca recalcula ni ajusta cifras.
"""

import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)

from app.core.pricing import EMPRESA, ResultadoCotizacion

CARPETA_SALIDA = "/tmp/cotizaciones"
os.makedirs(CARPETA_SALIDA, exist_ok=True)


def _formato_pesos(valor: float) -> str:
    return f"${valor:,.0f}".replace(",", ".")


def generar_pdf(
    nombre_cliente: str,
    telefono_cliente: str,
    items: list[ResultadoCotizacion],
    ciudad_entrega: str = "",
    numero_cotizacion: str | None = None,
) -> str:
    """
    Genera el PDF de cotización a partir de una lista de ResultadoCotizacion
    (ya calculados). Devuelve la ruta del archivo generado.
    """
    if numero_cotizacion is None:
        numero_cotizacion = datetime.now().strftime("COT-%Y%m%d-%H%M%S")

    ruta_pdf = os.path.join(CARPETA_SALIDA, f"{numero_cotizacion}.pdf")

    doc = SimpleDocTemplate(
        ruta_pdf, pagesize=letter,
        topMargin=2 * cm, bottomMargin=2 * cm,
        leftMargin=2 * cm, rightMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    titulo_style = ParagraphStyle(
        "TituloEmpresa", parent=styles["Heading1"], fontSize=16, spaceAfter=2,
    )
    subtitulo_style = ParagraphStyle(
        "Subtitulo", parent=styles["Normal"], fontSize=9, textColor=colors.grey,
    )

    story = []

    # Encabezado
    story.append(Paragraph(EMPRESA["razon_social"], titulo_style))
    story.append(Paragraph(f"NIT {EMPRESA['nit']}", subtitulo_style))
    story.append(Paragraph(
        f"{EMPRESA['contacto_comercial']} | {EMPRESA['telefono']} | {EMPRESA['email']}",
        subtitulo_style,
    ))
    story.append(Spacer(1, 16))

    story.append(Paragraph(f"<b>Cotización N°:</b> {numero_cotizacion}", styles["Normal"]))
    story.append(Paragraph(f"<b>Fecha:</b> {datetime.now().strftime('%d/%m/%Y')}", styles["Normal"]))
    story.append(Paragraph(f"<b>Cliente:</b> {nombre_cliente}", styles["Normal"]))
    story.append(Paragraph(f"<b>Teléfono:</b> {telefono_cliente}", styles["Normal"]))
    if ciudad_entrega:
        story.append(Paragraph(f"<b>Ciudad de entrega:</b> {ciudad_entrega}", styles["Normal"]))
    story.append(Spacer(1, 16))

    # Tabla de productos
    encabezados = ["Referencia", "Cant.", "Escala", "V. Unit. c/desc", "Subtotal", "IVA", "Total"]
    filas = [encabezados]

    total_general = 0.0
    for item in items:
        if item.producto_no_encontrado or item.error:
            continue
        filas.append([
            Paragraph(item.descripcion, styles["Normal"]),
            str(item.cantidad),
            f"E{item.escala_aplicada} (-{item.descuento_pct:.1f}%)",
            _formato_pesos(item.precio_unitario_con_descuento),
            _formato_pesos(item.subtotal_sin_iva),
            _formato_pesos(item.iva),
            _formato_pesos(item.total_con_iva),
        ])
        total_general += item.total_con_iva

    tabla = Table(filas, colWidths=[4.5 * cm, 1.5 * cm, 2.2 * cm, 2.6 * cm, 2.6 * cm, 2.2 * cm, 2.6 * cm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c34")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(tabla)
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        f"<b>TOTAL COTIZACIÓN: {_formato_pesos(total_general)}</b>",
        ParagraphStyle("Total", parent=styles["Normal"], fontSize=13, alignment=2),
    ))
    story.append(Spacer(1, 20))

    # Condiciones
    story.append(Paragraph("<b>Condiciones comerciales</b>", styles["Heading3"]))
    condiciones = [
        f"Tiempo de entrega: {EMPRESA['tiempo_entrega']}.",
        f"Lugar de entrega base: {EMPRESA['lugar_entrega_base']} (transporte a otras ciudades se cotiza aparte).",
        "Precios sujetos a cambio sin previo aviso. Cotización válida por 15 días.",
        "IVA incluido según tarifa vigente del 19%.",
    ]
    for c in condiciones:
        story.append(Paragraph(f"• {c}", styles["Normal"]))

    doc.build(story)
    return ruta_pdf


if __name__ == "__main__":
    from app.core.pricing import calcular_precio
    item = calcular_precio("FUTBOL NO 5 TERMOFORMADO PVC", 300)
    ruta = generar_pdf("Colegio San José", "3001234567", [item], ciudad_entrega="Bogotá")
    print("PDF generado en:", ruta)