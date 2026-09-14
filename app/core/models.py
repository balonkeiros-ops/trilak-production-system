"""
Modelos de base de datos - Catálogo, escalas de descuento y cotizaciones.

IMPORTANTE: en producción (Render), DATABASE_URL debe apuntar a PostgreSQL,
no a SQLite. Un archivo SQLite se BORRA cada vez que Render redespliega o
reinicia el servicio en el plan gratuito. SQLite solo se usa aquí como
fallback para desarrollo local rápido.
"""

import os
from datetime import datetime, timedelta
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./trilak_local.db")

# Render a veces da la URL como "postgres://" en vez de "postgresql://",
# que SQLAlchemy moderno ya no acepta - se corrige automáticamente.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CATÁLOGO
# ---------------------------------------------------------------------------

class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    referencia = Column(String(120), unique=True, index=True, nullable=False)
    categoria = Column(String(120), index=True, nullable=False)
    descripcion = Column(String(300), nullable=False)
    dimension = Column(String(200), nullable=True)
    especificaciones = Column(Text, nullable=True)
    precio_unitario = Column(Float, nullable=False)  # sin IVA, sin descuento
    iva_pct = Column(Float, nullable=False, default=19.0)
    # Bandera explícita: solo los productos con este campo en True pueden
    # recibir descuento por escala de volumen. Regla de negocio: SOLO
    # balones tienen descuento por escala; artículos deportivos NUNCA,
    # sin importar la cantidad pedida.
    aplica_descuento_escala = Column(Boolean, default=False, nullable=False)
    activo = Column(Boolean, default=True)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EscalaDescuento(Base):
    """
    Reglas de descuento por volumen. 'categoria' es opcional: si es NULL,
    la regla aplica a TODAS las categorías (regla general). Si tiene un
    valor, solo aplica a esa categoría específica (permite condiciones
    comerciales distintas por línea de producto).
    """
    __tablename__ = "escalas_descuento"

    id = Column(Integer, primary_key=True, index=True)
    categoria = Column(String(120), nullable=True, index=True)  # NULL = aplica a todas
    escala = Column(Integer, nullable=False)  # 1, 2, 3... solo para ordenar/mostrar
    cantidad_min = Column(Integer, nullable=False)
    cantidad_max = Column(Integer, nullable=True)  # NULL = sin tope superior
    descuento_pct = Column(Float, nullable=False, default=0.0)


# ---------------------------------------------------------------------------
# COTIZACIONES (para trazabilidad - evitar errores costosos de cara al cliente)
# ---------------------------------------------------------------------------

class Cotizacion(Base):
    __tablename__ = "cotizaciones"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(40), unique=True, index=True, nullable=False)
    nombre_cliente = Column(String(200), nullable=True)
    empresa_cliente = Column(String(200), nullable=True)
    telefono_cliente = Column(String(50), nullable=True)
    ciudad_entrega = Column(String(120), nullable=True)
    fecha_expedicion = Column(DateTime, default=datetime.utcnow)
    fecha_expiracion = Column(DateTime, nullable=False)
    subtotal = Column(Float, nullable=False, default=0.0)
    iva_total = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    creado_por = Column(String(120), nullable=True)  # nombre de quien la generó

    items = relationship("CotizacionItem", back_populates="cotizacion", cascade="all, delete-orphan")


class CotizacionItem(Base):
    __tablename__ = "cotizacion_items"

    id = Column(Integer, primary_key=True, index=True)
    cotizacion_id = Column(Integer, ForeignKey("cotizaciones.id"), nullable=False)
    referencia = Column(String(120), nullable=False)
    descripcion = Column(String(300), nullable=False)
    cantidad = Column(Integer, nullable=False)
    escala_aplicada = Column(Integer, nullable=True)
    descuento_pct = Column(Float, nullable=False, default=0.0)
    precio_unitario_base = Column(Float, nullable=False)
    precio_unitario_final = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)
    iva = Column(Float, nullable=False)
    total = Column(Float, nullable=False)

    cotizacion = relationship("Cotizacion", back_populates="items")


def crear_tablas():
    Base.metadata.create_all(bind=engine)


def numero_cotizacion_nuevo() -> str:
    return datetime.utcnow().strftime("COT-%Y%m%d-%H%M%S")


def fecha_expiracion_default(dias: int = 15) -> datetime:
    return datetime.utcnow() + timedelta(days=dias)