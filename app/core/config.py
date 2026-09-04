from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "TRILAK SPORT - Cotizador WhatsApp"

    # LLM (interpretacion de mensajes, NUNCA calculo de precios)
    OPENAI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # WhatsApp Cloud API (Meta)
    WHATSAPP_TOKEN: str = ""
    PHONE_NUMBER_ID: str = ""
    VERIFY_TOKEN: str = ""

    # Modo de operacion del agente:
    # "aprobacion" = todo pasa por ti antes de enviarse (recomendado al inicio)
    # "automatico" = se envia directo si el caso esta dentro de reglas conocidas
    MODO_AGENTE: str = "aprobacion"

    # Numero de WhatsApp del asesor que recibe las alertas de aprobacion
    NUMERO_ASESOR: str = ""


settings = Settings()