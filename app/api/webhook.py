"""
Webhook de WhatsApp - orquesta todo el flujo de cotización.

Flujo:
1. Meta llama a POST /webhook con el mensaje del cliente.
2. Se recupera/crea el estado de conversación de ese número.
3. Se interpreta el mensaje con el LLM (solo extracción, no precios).
4. Si faltan datos -> se pregunta por lo que falta.
5. Si están completos -> se busca el producto y se calcula el precio
   (código determinístico, sin IA).
6. Se genera el PDF.
7. Según MODO_AGENTE:
   - "aprobacion": se le avisa al asesor y se espera su OK antes de enviar.
   - "automatico": se envía directo al cliente.

LIMITACIÓN CONOCIDA: el estado de conversación se guarda en memoria
(diccionario Python). Se pierde si el servidor se reinicia y no funciona
si corres más de una instancia del proceso. Para producción real, cambiar
ESTADOS_CONVERSACION por Redis o una tabla en la base de datos
(SQLAlchemy ya está en tus requirements.txt).
"""

from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import PlainTextResponse

from app.schemas import ChatRequest, ChatResponse
from app.services.openai_service import procesar_mensaje_cliente
from app.core.config import settings
from app.core.llm import interpretar_mensaje, redactar_pregunta_aclaratoria
from app.core.pricing import buscar_producto, calcular_precio
from app.core.pdf import generar_pdf
from app.core.whatsapp import (
    enviar_mensaje_texto, enviar_documento, extraer_mensaje_entrante
)

router = APIRouter()

# --- Estado de conversación en memoria (ver limitación arriba) ---
ESTADOS_CONVERSACION: dict[str, dict] = {}

# --- Cotizaciones pendientes de aprobación humana ---
COTIZACIONES_PENDIENTES: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Verificación del webhook (handshake requerido por Meta al configurar)
# ---------------------------------------------------------------------------
@router.get("/webhook")
def verificar_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.VERIFY_TOKEN:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403, detail="Token de verificación inválido")


# ---------------------------------------------------------------------------
# Recepción de mensajes
# ---------------------------------------------------------------------------
@router.post("/webhook")
async def recibir_mensaje(request: Request):
    payload = await request.json()
    info = extraer_mensaje_entrante(payload)

    if info is None:
        # Puede ser un status update (mensaje leído/entregado) - se ignora
        return {"status": "ignorado"}

    numero = info["numero"]
    texto = info["texto"]
    nombre = info["nombre"] or "Cliente"

    estado = ESTADOS_CONVERSACION.setdefault(numero, {
        "nombre": nombre,
        "producto_query": None,
        "cantidad": None,
        "logo": None,
        "ciudad_entrega": None,
        "historial": [],
    })

    # 1. Interpretar el mensaje con el LLM (solo extracción)
    extraido = interpretar_mensaje(texto, historial=estado["historial"])
    estado["historial"].append({"role": "user", "content": texto})

    # Fusionar lo nuevo extraído con lo que ya sabíamos del cliente
    for campo in ["producto_query", "cantidad", "logo", "ciudad_entrega"]:
        if extraido.get(campo) is not None:
            estado[campo] = extraido[campo]

    campos_faltantes = [
        campo for campo in ["producto", "cantidad", "logo", "ciudad_entrega"]
        if (
            (campo == "producto" and not estado["producto_query"]) or
            (campo == "cantidad" and not estado["cantidad"]) or
            (campo == "logo" and estado["logo"] is None) or
            (campo == "ciudad_entrega" and not estado["ciudad_entrega"])
        )
    ]

    # 2. Si faltan datos, preguntar y salir
    if campos_faltantes:
        pregunta = redactar_pregunta_aclaratoria(campos_faltantes, contexto=texto)
        enviar_mensaje_texto(numero, pregunta)
        estado["historial"].append({"role": "assistant", "content": pregunta})
        return {"status": "pregunta_enviada", "faltantes": campos_faltantes}

    # 3. Buscar el producto en el catálogo (determinístico)
    coincidencias = buscar_producto(estado["producto_query"])

    if len(coincidencias) == 0:
        msg = (
            f"No encontré un balón que coincida con \"{estado['producto_query']}\". "
            "¿Me confirmas el nombre exacto o el deporte (fútbol, baloncesto, voleibol)?"
        )
        enviar_mensaje_texto(numero, msg)
        estado["producto_query"] = None  # se vuelve a pedir
        return {"status": "producto_no_encontrado"}

    if len(coincidencias) > 1:
        opciones = "\n".join(f"- {p['referencia']}" for p in coincidencias[:6])
        msg = f"Encontré varias opciones, ¿cuál te sirve?\n{opciones}"
        enviar_mensaje_texto(numero, msg)
        estado["producto_query"] = None  # se vuelve a pedir, ya con más precisión
        return {"status": "ambiguo_multiple_opciones"}

    # 4. Calcular precio (100% determinístico, cero IA)
    producto = coincidencias[0]
    resultado = calcular_precio(producto["referencia"], int(estado["cantidad"]))

    if resultado.error:
        enviar_mensaje_texto(numero, f"No pude calcular la cotización: {resultado.error}")
        return {"status": "error_calculo", "detalle": resultado.error}

    # 5. Generar PDF
    ruta_pdf = generar_pdf(
        nombre_cliente=estado["nombre"],
        telefono_cliente=numero,
        items=[resultado],
        ciudad_entrega=estado["ciudad_entrega"],
    )

    # 6. Enviar según el modo configurado
    if settings.MODO_AGENTE == "automatico":
        caption = (
            f"Aquí tienes tu cotización, {estado['nombre']}. "
            f"Total: ${resultado.total_con_iva:,.0f}".replace(",", ".")
        )
        enviar_documento(numero, ruta_pdf, caption=caption)
        ESTADOS_CONVERSACION.pop(numero, None)  # reinicia la conversación
        return {"status": "cotizacion_enviada", "total": resultado.total_con_iva}

    else:  # modo "aprobacion" (recomendado para empezar)
        COTIZACIONES_PENDIENTES[numero] = {
            "ruta_pdf": ruta_pdf,
            "resultado": resultado,
            "nombre_cliente": estado["nombre"],
        }
        if settings.NUMERO_ASESOR:
            resumen = (
                f"Cotización lista para aprobar:\n"
                f"Cliente: {estado['nombre']} ({numero})\n"
                f"Producto: {resultado.descripcion} x{resultado.cantidad}\n"
                f"Total: ${resultado.total_con_iva:,.0f}\n"
                f"Responde 'APROBAR {numero}' para enviarla."
            ).replace(",", ".")
            enviar_mensaje_texto(settings.NUMERO_ASESOR, resumen)
        return {"status": "pendiente_aprobacion", "numero_cliente": numero}


# ---------------------------------------------------------------------------
# Endpoint simple para que el asesor apruebe manualmente (o desde WhatsApp)
# ---------------------------------------------------------------------------
@router.post("/webhook/aprobar/{numero_cliente}")
def aprobar_cotizacion(numero_cliente: str):
    pendiente = COTIZACIONES_PENDIENTES.get(numero_cliente)
    if not pendiente:
        raise HTTPException(status_code=404, detail="No hay cotización pendiente para ese número.")

    resultado = pendiente["resultado"]
    caption = (
        f"Aquí tienes tu cotización, {pendiente['nombre_cliente']}. "
        f"Total: ${resultado.total_con_iva:,.0f}"
    ).replace(",", ".")

    enviar_documento(numero_cliente, pendiente["ruta_pdf"], caption=caption)
    COTIZACIONES_PENDIENTES.pop(numero_cliente, None)
    ESTADOS_CONVERSACION.pop(numero_cliente, None)
    return {"status": "enviado", "numero_cliente": numero_cliente}
    # ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Endpoint de pruebas para Swagger / Postman
# ---------------------------------------------------------------------------
@router.post("/webhook/test-chat", response_model=ChatResponse)
def probar_chat_manual(payload: ChatRequest):
    """
    Endpoint exclusivo para hacer pruebas desde la interfaz de Swagger.
    """
    try:
        respuesta = procesar_mensaje_cliente(payload.mensaje)
        return ChatResponse(respuesta=respuesta)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))