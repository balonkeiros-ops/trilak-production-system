"""
Interpretación de mensajes de clientes con LLM.

REGLA DE ORO: este módulo SOLO interpreta lenguaje natural y redacta texto.
Nunca calcula precios, descuentos, IVA ni decide fechas de entrega - eso
siempre sale de app.core.pricing (código determinístico).

Usa OpenRouter (compatible con la API de OpenAI) porque ya tienes
OPENROUTER_API_KEY configurada. Si prefieres usar OpenAI directo, cambia
base_url y api_key abajo.
"""

import json
from openai import OpenAI
from app.core.config import settings
from app.core.pricing import listar_categorias

client = OpenAI(
    api_key=settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY,
    base_url="https://openrouter.ai/api/v1",
)

MODELO = "openai/gpt-4o-mini"  # rápido y barato, suficiente para extracción

SYSTEM_PROMPT_EXTRACCION = f"""Eres un asistente que EXTRAE información de mensajes \
de clientes de una empresa que vende balones deportivos (Trilak Sport / Keiros). \
NO decides precios ni descuentos, NO inventas datos que el cliente no dio.

Categorías de producto disponibles: {", ".join(listar_categorias())}

Devuelve SIEMPRE únicamente un JSON con esta forma exacta, sin texto adicional, \
sin backticks de markdown:

{{
  "producto_query": "texto de búsqueda del producto o null si no se menciona",
  "cantidad": numero_entero_o_null,
  "logo": true_false_o_null,
  "ciudad_entrega": "texto o null",
  "campos_faltantes": ["lista", "de", "campos", "que", "faltan"],
  "resumen_intencion": "una frase breve de qué quiere el cliente"
}}

Los campos_faltantes posibles son: "producto", "cantidad", "logo", "ciudad_entrega".
Si el cliente ya dio un dato, NO lo incluyas en campos_faltantes.
"""


def interpretar_mensaje(texto_cliente: str, historial: list[dict] | None = None) -> dict:
    """
    Extrae producto, cantidad, logo y ciudad de un mensaje de cliente.
    Devuelve un dict; nunca lanza excepción hacia arriba sin controlar
    (si el LLM falla, devuelve todos los campos como faltantes para que
    el webhook simplemente pregunte de nuevo).
    """
    mensajes = [{"role": "system", "content": SYSTEM_PROMPT_EXTRACCION}]
    if historial:
        mensajes.extend(historial)
    mensajes.append({"role": "user", "content": texto_cliente})

    try:
        respuesta = client.chat.completions.create(
            model=MODELO,
            messages=mensajes,
            temperature=0,
            response_format={"type": "json_object"},
        )
        contenido = respuesta.choices[0].message.content
        datos = json.loads(contenido)
        return datos
    except Exception as e:
        return {
            "producto_query": None,
            "cantidad": None,
            "logo": None,
            "ciudad_entrega": None,
            "campos_faltantes": ["producto", "cantidad", "logo", "ciudad_entrega"],
            "resumen_intencion": "",
            "error_llm": str(e),
        }


def redactar_pregunta_aclaratoria(campos_faltantes: list[str], contexto: str = "") -> str:
    """
    Redacta, con el tono de la marca, una pregunta corta pidiendo los datos
    que faltan. Es texto libre (no cálculo), por eso sí puede usar el LLM.
    """
    if not campos_faltantes:
        return ""

    prompt = (
        f"Un cliente escribió: \"{contexto}\". "
        f"Faltan estos datos para poder cotizar: {', '.join(campos_faltantes)}. "
        "Redacta UNA sola pregunta corta, cálida y profesional en español "
        "colombiano, tono cercano de asesor comercial, pidiendo exactamente "
        "esos datos. Máximo 2 líneas. No agregues saludos largos ni firma."
    )

    try:
        respuesta = client.chat.completions.create(
            model=MODELO,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
        )
        return respuesta.choices[0].message.content.strip()
    except Exception:
        # Fallback determinístico si el LLM falla - el agente nunca se cae
        mapa = {
            "producto": "qué referencia de balón necesitas",
            "cantidad": "cuántas unidades",
            "logo": "si lleva logo personalizado",
            "ciudad_entrega": "la ciudad de entrega",
        }
        partes = [mapa[c] for c in campos_faltantes if c in mapa]
        return "¡Con gusto! Para cotizarte, ¿me confirmas " + ", ".join(partes) + "?"