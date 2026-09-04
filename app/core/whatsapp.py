"""
Envío de mensajes por WhatsApp Cloud API (Meta).

Requiere en el .env real (NUNCA en texto plano compartido):
- WHATSAPP_TOKEN   (token permanente del sistema, no el temporal de prueba)
- PHONE_NUMBER_ID  (ID del número de WhatsApp Business)
"""

import requests
from app.core.config import settings

GRAPH_API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{settings.PHONE_NUMBER_ID}"


def _headers():
    token = settings.WHATSAPP_TOKEN
    if not token:
        print("⚠️ ALERTA: settings.WHATSAPP_TOKEN está vacío o es None")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def enviar_mensaje_texto(numero_destino: str, texto: str) -> dict:
    """Envía un mensaje de texto simple.

    numero_destino en formato E.164 sin '+', ej: 573001234567
    """
    payload = {
        "messaging_product": "whatsapp",
        "to": numero_destino,
        "type": "text",
        "text": {"body": texto},
    }
    resp = requests.post(
        f"{BASE_URL}/messages", headers=_headers(), json=payload, timeout=15
    )

    if resp.status_code != 200:
        # Esto te mostrará la razón exacta emitida por Meta en la consola
        print(f"❌ Error de Meta API ({resp.status_code}):", resp.text)

    resp.raise_for_status()
    return resp.json()


def subir_documento(ruta_pdf: str) -> str:
    """Sube un PDF a los servidores de Meta y devuelve el media_id para enviarlo."""
    with open(ruta_pdf, "rb") as f:
        files = {"file": (ruta_pdf.split("/")[-1], f, "application/pdf")}
        data = {"messaging_product": "whatsapp"}
        headers = {"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}"}
        resp = requests.post(f"{BASE_URL}/media", headers=headers, data=data, files=files, timeout=30)
    resp.raise_for_status()
    return resp.json()["id"]


def enviar_documento(numero_destino: str, ruta_pdf: str, caption: str = "") -> dict:
    """Sube y envía un PDF de cotización al cliente."""
    media_id = subir_documento(ruta_pdf)
    payload = {
        "messaging_product": "whatsapp",
        "to": numero_destino,
        "type": "document",
        "document": {
            "id": media_id,
            "caption": caption,
            "filename": ruta_pdf.split("/")[-1],
        },
    }
    resp = requests.post(f"{BASE_URL}/messages", headers=_headers(), json=payload, timeout=15)
    resp.raise_for_status()
    return resp.json()


def extraer_mensaje_entrante(payload_webhook: dict) -> dict | None:
    """
    Parsea el JSON que Meta envía al webhook y devuelve
    {"numero": "...", "texto": "...", "nombre": "..."} o None si no es
    un mensaje de texto de cliente (puede ser un status update, etc).
    """
    try:
        entry = payload_webhook["entry"][0]
        cambio = entry["changes"][0]["value"]

        if "messages" not in cambio:
            return None  # es un evento de status (entregado/leído), no un mensaje

        mensaje = cambio["messages"][0]
        if mensaje.get("type") != "text":
            return None  # por ahora solo manejamos texto

        numero = mensaje["from"]
        texto = mensaje["text"]["body"]
        nombre = cambio.get("contacts", [{}])[0].get("profile", {}).get("name", "")

        return {"numero": numero, "texto": texto, "nombre": nombre}
    except (KeyError, IndexError):
        return None