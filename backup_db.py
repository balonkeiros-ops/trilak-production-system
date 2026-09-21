"""
Backup simple de la base de datos a un archivo .sql con INSERTs.
No requiere pg_dump ni instalar nada adicional.
Uso: python backup_db.py
"""
import os
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

if not DATABASE_URL:
    print("ERROR: No hay DATABASE_URL en .env")
    exit(1)

print(f"Conectando a {DATABASE_URL.split('://')[0]}://...")

engine = create_engine(DATABASE_URL)
inspector = inspect(engine)

os.makedirs('backups', exist_ok=True)
fecha = datetime.now().strftime('%Y%m%d_%H%M%S')
archivo = f'backups/backup_{fecha}.sql'

tablas = inspector.get_table_names()
print(f"Tablas encontradas: {len(tablas)}")

def escapar(valor):
    if valor is None:
        return 'NULL'
    if isinstance(valor, bool):
        return 'TRUE' if valor else 'FALSE'
    if isinstance(valor, (int, float)):
        return str(valor)
    if isinstance(valor, bytes):
        return "'\\x" + valor.hex() + "'"
    s = str(valor).replace("'", "''")
    return f"'{s}'"

total_filas = 0
with open(archivo, 'w', encoding='utf-8') as f:
    f.write(f"-- Backup TRILAK producción\n")
    f.write(f"-- Fecha: {datetime.now().isoformat()}\n")
    f.write(f"-- Tablas: {len(tablas)}\n\n")

    with engine.connect() as conn:
        for tabla in tablas:
            print(f"  - {tabla}...", end=' ', flush=True)
            try:
                columnas_info = inspector.get_columns(tabla)
                columnas = [c['name'] for c in columnas_info]
                resultado = conn.execute(text(f'SELECT * FROM "{tabla}"'))
                filas = resultado.fetchall()
                total_filas += len(filas)

                if not filas:
                    print("(vacía)")
                    continue

                f.write(f"\n-- Tabla: {tabla} ({len(filas)} filas)\n")
                cols_sql = ', '.join(f'"{c}"' for c in columnas)
                for fila in filas:
                    valores = ', '.join(escapar(v) for v in fila)
                    f.write(f'INSERT INTO "{tabla}" ({cols_sql}) VALUES ({valores});\n')
                print(f"{len(filas)} filas")
            except Exception as e:
                print(f"ERROR: {e}")
                f.write(f"\n-- ERROR en tabla {tabla}: {e}\n")

print(f"\n✅ Backup completado: {archivo}")
print(f"   Total de filas respaldadas: {total_filas}")