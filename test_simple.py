import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
print(f"URL: {DATABASE_URL[:50]}...")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute('SELECT 1')
    result = cur.fetchone()
    cur.close()
    conn.close()
    print("✅ Conexión exitosa!")
    print(f"Resultado: {result}")
except Exception as e:
    print("❌ Error:", e)
    print("Tipo:", type(e).__name__)