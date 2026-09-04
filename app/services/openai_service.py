"""
Cliente OpenRouter con fallback dinámico entre modelos gratuitos.

En vez de mantener una lista fija de IDs (que se vuelven obsoletos, como
pasó con google/gemma-2-9b-it:free), este script consulta en vivo el
endpoint /models de OpenRouter, filtra los modelos realmente gratuitos
($0 prompt y $0 completion) y los prueba en orden hasta que uno responda.

Requiere: pip install openai requests
"""
from dotenv import load_dotenv
load_dotenv()

import os
API_KEY = os.environ.get("OPENROUTER_API_KEY")
import os
import requests
from openai import OpenAI

# --- Configuración ---
# NUNCA hardcodees la API key en el código fuente. Usa variable de entorno.
API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "Falta la variable de entorno OPENROUTER_API_KEY. "
        "Define OPENROUTER_API_KEY antes de ejecutar este script."
    )

BASE_URL = "https://openrouter.ai/api/v1"

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

# Modelos preferidos: si alguno de estos está disponible gratis hoy,
# se probará primero (por calidad conocida). El resto de gratuitos
# disponibles se agregan después como respaldo adicional.
MODELOS_PREFERIDOS = [
    "deepseek/deepseek-r1:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-235b-a22b:free",
]

# Cuántos modelos gratuitos "de respaldo" adicionales agregar automáticamente
MAX_MODELOS_RESPALDO_EXTRA = 5


def obtener_modelos_gratis_disponibles() -> list[str]:
    """
    Consulta el catálogo de modelos de OpenRouter y devuelve los IDs
    de los que son actualmente gratuitos ($0 prompt y $0 completion).
    """
    try:
        resp = requests.get(f"{BASE_URL}/models", timeout=15)
        resp.raise_for_status()
        data = resp.json().get("data", [])
    except Exception as e:
        print(f"No se pudo consultar la lista de modelos ({e}). "
              f"Usando solo la lista de preferidos como respaldo.")
        return []

    gratis = []
    for modelo in data:
        pricing = modelo.get("pricing", {})
        prompt_price = pricing.get("prompt")
        completion_price = pricing.get("completion")
        model_id = modelo.get("id", "")
        es_gratis = (
            prompt_price in ("0", 0, "0.0", 0.0)
            and completion_price in ("0", 0, "0.0", 0.0)
        )
        if es_gratis and model_id:
            gratis.append(model_id)

    return gratis


def construir_lista_de_intentos() -> list[str]:
    """
    Combina los modelos preferidos (si siguen siendo gratis) con
    modelos gratuitos adicionales detectados dinámicamente, evitando
    duplicados y preservando el orden de prioridad.
    """
    disponibles_gratis = set(obtener_modelos_gratis_disponibles())

    lista_final = []

    # 1. Preferidos, solo si de verdad siguen siendo gratis hoy
    for modelo in MODELOS_PREFERIDOS:
        if not disponibles_gratis or modelo in disponibles_gratis:
            lista_final.append(modelo)

    # 2. Respaldo extra: otros modelos gratis no incluidos ya
    extra_agregados = 0
    for modelo in sorted(disponibles_gratis):
        if modelo not in lista_final:
            lista_final.append(modelo)
            extra_agregados += 1
        if extra_agregados >= MAX_MODELOS_RESPALDO_EXTRA:
            break

    if not lista_final:
        # Último recurso: usar los preferidos tal cual, por si la consulta
        # a /models falló pero los modelos siguen funcionando en realidad.
        lista_final = MODELOS_PREFERIDOS

    return lista_final


def procesar_mensaje_cliente(prompt: str) -> str:
    modelos_a_intentar = construir_lista_de_intentos()
    print(f"Modelos a intentar en orden: {modelos_a_intentar}")

    for model_id in modelos_a_intentar:
        try:
            response = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
            )
            contenido = response.choices[0].message.content
            print(f"✅ Respuesta obtenida con el modelo: {model_id}")
            return contenido
        except Exception as e:
            print(f"⚠️ Error con modelo {model_id}: {e}. Intentando siguiente respaldo...")
            continue

    return "Lo siento, ocurrió un error procesando tu solicitud. Ningún modelo gratuito respondió."


if __name__ == "__main__":
    resultado = procesar_mensaje_cliente("Hola, ¿cómo estás?")
    print("\n--- Resultado final ---")
    print(resultado)