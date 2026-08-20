import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar las variables del archivo .env
load_dotenv()

# Leer las variables de entorno
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")

# Crear el cliente de Supabase
supabase: Client = create_client(url, key)