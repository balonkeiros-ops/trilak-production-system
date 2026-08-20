"""
Prueba de conexión a la base de datos que REALMENTE usa app_PRODUCCION.py
(vía SQLAlchemy + psycopg2, leyendo DATABASE_URL desde .env).

Esto es distinto a probar con el cliente supabase-py (SUPABASE_URL/SUPABASE_KEY),
que sirve para otras funciones de Supabase (Auth, Storage, Realtime) pero NO
es la conexión que usa tu backend Flask para leer/escribir pedidos, operarios,
materiales, etc.

Uso:
    python test_conexion.py
"""

import os
from dotenv import load_dotenv

load_dotenv()

database_url = os.environ.get('DATABASE_URL', '').strip()

print("=" * 60)
print("PRUEBA DE CONEXIÓN A LA BASE DE DATOS (DATABASE_URL)")
print("=" * 60)

if not database_url:
    print("❌ No se encontró DATABASE_URL en el archivo .env")
    print("   Verifica que exista una línea como:")
    print("   DATABASE_URL=postgresql://postgres.xxxx:TU_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres")
    raise SystemExit(1)

# Normaliza igual que hace app_PRODUCCION.py
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

# Muestra la URL ocultando la contraseña, para poder revisarla sin exponerla
try:
    esquema, resto = database_url.split('://', 1)
    userinfo, hostinfo = resto.split('@', 1)
    usuario = userinfo.split(':')[0]
    url_oculta = f"{esquema}://{usuario}:****@{hostinfo}"
except Exception:
    url_oculta = "(no se pudo parsear para mostrarla oculta)"

print(f"URL detectada: {url_oculta}")
print(f"Longitud total: {len(database_url)} caracteres\n")

try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 no está instalado. Corre: pip install psycopg2-binary")
    raise SystemExit(1)

try:
    print("Conectando...")
    conn = psycopg2.connect(database_url, connect_timeout=10)
    cursor = conn.cursor()
    cursor.execute("SELECT version();")
    version = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    print("✅ Conexión exitosa")
    print(f"   Servidor: {version}")
except Exception as e:
    print("❌ Error de conexión:")
    print(f"   {type(e).__name__}: {e}")
    print()
    print("Causas típicas:")
    print("  - Estás usando la URL DIRECTA de Supabase (db.xxxx.supabase.co) en vez")
    print("    de la del POOLER (aws-0-region.pooler.supabase.com). La directa usa")
    print("    IPv6 y muchas redes locales no la resuelven -> getaddrinfo failed.")
    print("  - La contraseña en la URL no es la real (revisa que reemplazaste")
    print("    [YOUR-PASSWORD] por tu contraseña verdadera).")
    print("  - Hay espacios extra o saltos de línea accidentales en el .env.")
    raise SystemExit(1)

print("=" * 60)
