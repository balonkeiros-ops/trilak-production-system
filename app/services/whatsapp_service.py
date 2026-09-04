import requests
from app.core.config import settings

def send_whatsapp_message(to_phone: str, message_text: str):
    url = f"https://graph.facebook.com/v18.0/{settings.PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_phone,
        "type": "text",
        "text": {"preview_url": False, "body": message_text},
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        return response.json()
    except Exception as e:
        print(f"Error enviando mensaje a WhatsApp: {e}")
        return None