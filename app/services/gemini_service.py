import os
import json
from typing import List, Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError, ServerError, ClientError
from sqlalchemy.orm import Session

from app.core.database import get_db, Producto, calcular_cotizacion_detallada
from app.schemas import MensajeChat

load_dotenv()

def obtener_cliente_gemini():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY no encontrada en el archivo .env")
    return genai.Client(api_key=key, http_options=types.HttpOptions(timeout=20000))

# ========== HERRAMIENTA (FUNCIÓN DECLARADA PARA GEMINI) ==========
# Definición de la función que Gemini puede llamar
cotizacion_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="ejecutar_cotizacion_tool",
            description="Calcula la cotización exacta de un producto dado su ID y cantidad.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "producto_id": types.Schema(
                        type=types.Type.INTEGER,
                        description="ID del producto en el catálogo."
                    ),
                    "cantidad": types.Schema(
                        type=types.Type.INTEGER,
                        description="Número de unidades que desea cotizar."
                    )
                },
                required=["producto_id", "cantidad"]
            )
        )
    ]
)

# Función Python que ejecuta la lógica (se llamará desde el código, no desde Gemini directamente)
def ejecutar_cotizacion_tool(producto_id: int, cantidad: int) -> dict:
    """
    Calcula la cotización exacta para un producto por su ID y la cantidad deseada.
    """
    db: Session = next(get_db())
    try:
        producto = db.query(Producto).filter(Producto.id == producto_id).first()
        if not producto:
            return {"error": f"No existe un producto con el ID {producto_id}."}
        
        cotizacion = calcular_cotizacion_detallada(
            precio_base_sin_iva=producto.precio_unitario_base,
            cantidad=cantidad,
            tarifa_iva=producto.porcentaje_iva
        )
        
        return {
            "referencia": producto.referencia,
            "descripcion": producto.descripcion,
            "dimensiones": producto.dimension_circunferencia,
            "cotizacion": cotizacion
        }
    finally:
        db.close()

# ========== CONTEXTO DEL CATÁLOGO ==========
def cargar_contexto_catalogo() -> str:
    db: Session = next(get_db())
    try:
        productos = db.query(Producto).all()
        if not productos:
            return "No hay productos en base de datos."
        return "\n".join([f"- ID: {p.id} | Ref: {p.referencia} | Desc: {p.descripcion} | IVA: {p.porcentaje_iva*100}%" for p in productos])
    except Exception as e:
        return f"Error al consultar productos: {e}"
    finally:
        db.close()

CATALOGO_TEXTO = cargar_contexto_catalogo()

# ========== INSTRUCCIONES DEL SISTEMA ==========
SYSTEM_INSTRUCTION = f"""
Eres el asistente comercial virtual de TRILAK SPORT y KEIROS, empresa colombiana fabricante de balones deportivos de alta calidad.

CATÁLOGOS Y PRODUCTOS REGISTRADOS:
{CATALOGO_TEXTO}

REGLAS DE NEGOCIO PRIMORDIALES DE COTIZACIÓN Y VENTA:
1. PRECIOS Y MONEDA: Todos los valores deben presentarse explícitamente en pesos colombianos (COP).
2. USO DE HERRAMIENTA: Siempre que un cliente solicite cotizar o pregunte precio de una cantidad específica, DEBES identificar el `producto_id` correspondiente en el catálogo y llamar obligatoriamente a `ejecutar_cotizacion_tool(producto_id, cantidad)`.
3. SOLICITUD DE CANTIDAD: Si el cliente consulta sobre un balón pero no dice cuántas unidades requiere, no llames la herramienta de inmediato; pregúntale amablemente la cantidad que necesita para aplicarle la escala de descuentos.
4. DESGLOSE OBLIGATORIO: Al presentar la respuesta de la cotización, muestra el desglose detallado proveniente de la herramienta:
   - Valor unitario base y valor unitario con descuento
   - Subtotal antes de IVA
   - Valor del IVA aplicable
   - Total final en COP
5. ESCALA DE DESCUENTOS POR VOLUMEN: La herramienta calcula automáticamente los descuentos según el rango de unidades. Si el cliente pregunta por descuentos, infórmale que a mayor volumen obtiene un mejor precio unitario.
6. ATENCIÓN AL CLIENTE: Mantén un lenguaje profesional, cordial y enfocado en el mercado colombiano.

Si el cliente envía textos genéricos como "string" o saludos vacíos, responde amablemente ofreciendo el catálogo de balones de fútbol, baloncesto, voleibol y microfútbol.
"""

# ========== MODELOS VÁLIDOS (actualizados a febrero 2026) ==========
MODELOS_DISPONIBLES = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
]
# ========== PROCESAMIENTO DEL MENSAJE ==========
def procesar_mensaje_cliente(mensaje_usuario: str, historial: Optional[List[MensajeChat]] = None) -> str:
    client = obtener_cliente_gemini()
    ultimo_error = None

    # Convertir historial a formato de contenido
    history_formatted = []
    if historial:
        for msg in historial:
            history_formatted.append(
                types.Content(
                    role=msg.role,
                    parts=[types.Part.from_text(text=msg.text)]
                )
            )

    for modelo in MODELOS_DISPONIBLES:
        try:
            # Usamos generate_content con herramientas y sistema de instrucción
            # Nota: Para mantener el historial, lo pasamos en el parámetro `contents`
            # pero la API de chat es más sencilla con `client.chats.create`
            # Sin embargo, la versión actual de google-genai (0.7.0+) soporta chats con tools
            chat = client.chats.create(
                model=modelo,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    tools=[cotizacion_tool],  # Ahora es una lista de Tool
                    temperature=0.2
                ),
                history=history_formatted
            )
            
            # Enviar mensaje y recibir respuesta
            response = chat.send_message(mensaje_usuario)
            
            # Verificar si Gemini quiere llamar a la herramienta
            if response.function_calls:
                # Ejecutar la función solicitada
                function_call = response.function_calls[0]
                if function_call.name == "ejecutar_cotizacion_tool":
                    args = function_call.args
                    resultado = ejecutar_cotizacion_tool(
                        producto_id=args.get("producto_id"),
                        cantidad=args.get("cantidad")
                    )
                    # Enviar el resultado de vuelta a Gemini para que genere la respuesta final
                    response = chat.send_message(
                        types.Part.from_function_response(
                            name="ejecutar_cotizacion_tool",
                            response=resultado
                        )
                    )
                    return response.text
            else:
                # Si no hay llamada a función, devolver el texto directamente
                if response.text:
                    return response.text

        except (APIError, ServerError, ClientError) as e:
            ultimo_error = e
            continue
        except Exception as e:
            ultimo_error = e
            continue

    return f"En este momento nuestros servicios de consulta automática están congestionados. Por favor, intenta de nuevo en un par de minutos. (Detalle: {ultimo_error})"