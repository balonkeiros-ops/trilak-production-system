"""
database.py - Módulo de Base de Datos y Modelos ORM para TRILAK SPORT / KEIROS
Basado en las Reglas de Negocio y Cotizaciones del catálogo.
"""

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Dict, Any

from sqlalchemy import (
    create_engine, Column, Integer, String, Numeric, Text, 
    ForeignKey, DateTime, Float, Boolean, CheckConstraint
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session

# Inicialización de Base ORM
Base = declarative_base()

# ==========================================
# LÓGICA CORE DE COTIZACIÓN Y DESCUENTOS
# ==========================================

def calcular_cotizacion_detallada(
    precio_base_sin_iva: Decimal, 
    cantidad: int, 
    tarifa_iva: Decimal = Decimal("19.00")
) -> Dict[str, Any]:
    """
    Aplica la escala de descuento por volumen sobre el precio base sin IVA
    y calcula de forma exacta el IVA y el valor total acumulado.
    """
    if cantidad <= 0:
        raise ValueError("La cantidad debe ser mayor a 0.")

    if isinstance(precio_base_sin_iva, (int, float, str)):
        precio_base_sin_iva = Decimal(str(precio_base_sin_iva))

    # 1. Determinación del descuento por cantidad (Regla del 2.5% por tramo)
    if cantidad <= 50:
        desc_pct = Decimal("0.0")
    elif cantidad <= 200:
        desc_pct = Decimal("2.5")
    elif cantidad <= 500:
        desc_pct = Decimal("5.0")
    elif cantidad <= 1000:
        desc_pct = Decimal("7.5")
    elif cantidad <= 2000:
        desc_pct = Decimal("10.0")
    else:
        desc_pct = Decimal("12.5")

    # 2. Cálculos Unitarios con precisión Decimal
    factor_descuento = Decimal("1.00") - (desc_pct / Decimal("100.00"))
    unitario_sin_iva = (precio_base_sin_iva * factor_descuento).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    iva_factor = tarifa_iva / Decimal("100.00")
    unitario_iva = (unitario_sin_iva * iva_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    unitario_con_iva = unitario_sin_iva + unitario_iva

    # 3. Totales de la Orden
    subtotal_neto = unitario_sin_iva * cantidad
    total_impuesto_iva = unitario_iva * cantidad
    total_orden = unitario_con_iva * cantidad

    return {
        "cantidad": cantidad,
        "porcentaje_descuento": float(desc_pct),
        "precio_base_original_sin_iva": float(precio_base_sin_iva),
        "precio_unitario_con_descuento_sin_iva": float(unitario_sin_iva),
        "iva_unitario_19_pct": float(unitario_iva),
        "precio_unitario_final_con_iva": float(unitario_con_iva),
        "subtotal_neto_sin_iva": float(subtotal_neto),
        "total_iva_19_pct": float(total_impuesto_iva),
        "total_general_con_iva": float(total_orden)
    }


# ==========================================
# 1. MODELOS DE DATOS (ORM)
# ==========================================

class CategoriaProducto(Base):
    """Categorías principales de productos (e.g. Vulcanizados, Termoformados, Baloncesto, Medicinales, etc.)"""
    __tablename__ = 'categorias_producto'

    id = Column(Integer, primary_key=True, autoincrement=True)
    codigo_seccion = Column(String(10), unique=True, nullable=False)  # Ej: "1", "2", "3"
    nombre = Column(String(150), nullable=False)                       # Ej: "BALÓN VULCANIZADO"
    especificaciones_generales = Column(Text, nullable=True)

    productos = relationship("Producto", back_populates="categoria", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<CategoriaProducto(codigo='{self.codigo_seccion}', nombre='{self.nombre}')>"


class Producto(Base):
    """Catálogo de Balones y Artículos Deportivos"""
    __tablename__ = 'productos'

    id = Column(Integer, primary_key=True, autoincrement=True)
    categoria_id = Column(Integer, ForeignKey('categorias_producto.id'), nullable=False)
    referencia = Column(String(50), nullable=False)
    descripcion = Column(String(255), nullable=False)
    dimension_circunferencia = Column(String(100), nullable=False)
    
    # Precios Base (Escala 1 a 50 unidades)
    precio_unitario_base = Column(Numeric(12, 2), nullable=False)      # Precio sin IVA
    porcentaje_iva = Column(Numeric(5, 2), default=19.00)              # IVA por defecto: 19%
    
    # Ficha Técnica Específica
    tipo_construccion = Column(String(100), nullable=True)
    neumatico_camara = Column(String(100), nullable=True)
    cubierta_exterior = Column(String(100), nullable=True)
    estructura_interior = Column(String(100), nullable=True)
    capas_internas = Column(String(100), nullable=True)
    garantia_meses = Column(Integer, default=3)
    
    categoria = relationship("CategoriaProducto", back_populates="productos")

    @property
    def valor_iva_base(self) -> Decimal:
        """Calcula el valor del IVA en pesos sobre el precio base."""
        base = Decimal(str(self.precio_unitario_base))
        iva_pct = Decimal(str(self.porcentaje_iva))
        return (base * (iva_pct / Decimal("100.00"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def precio_total_base(self) -> Decimal:
        """Calcula el precio total base con IVA incluido."""
        base = Decimal(str(self.precio_unitario_base))
        return base + self.valor_iva_base

    def __repr__(self):
        return f"<Producto(ref='{self.referencia}', desc='{self.descripcion}', precio_base={self.precio_unitario_base})>"


class EscalaDescuento(Base):
    """Escalas de Descuento por Volumen (2.5% acumulativo/progresivo por rango)"""
    __tablename__ = 'escalas_descuento'

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre_escala = Column(String(50), nullable=False)
    cantidad_minima = Column(Integer, nullable=False)
    cantidad_maxima = Column(Integer, nullable=True)
    porcentaje_descuento = Column(Numeric(5, 2), nullable=False)

    def __repr__(self):
        return f"<EscalaDescuento(rango='{self.nombre_escala}', descuento={self.porcentaje_descuento}%)>"


# ==========================================
# 2. SEMBRADO DE DATOS (POBLAR BASE DE DATOS)
# ==========================================

def init_db(engine_url: str = "sqlite:///trilak_database.db"):
    """Crea las tablas e inserta la información del catálogo si la BD está vacía."""
    engine = create_engine(engine_url, echo=False)
    Base.metadata.create_all(engine)
    
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
    if session.query(CategoriaProducto).count() > 0:
        session.close()
        return engine

    # 1. Cargar Escalas de Descuento
    escalas_datos = [
        EscalaDescuento(nombre_escala="1 a 50", cantidad_minima=1, cantidad_maxima=50, porcentaje_descuento=Decimal("0.0")),
        EscalaDescuento(nombre_escala="51 a 200", cantidad_minima=51, cantidad_maxima=200, porcentaje_descuento=Decimal("2.5")),
        EscalaDescuento(nombre_escala="201 a 500", cantidad_minima=201, cantidad_maxima=500, porcentaje_descuento=Decimal("5.0")),
        EscalaDescuento(nombre_escala="501 a 1000", cantidad_minima=501, cantidad_maxima=1000, porcentaje_descuento=Decimal("7.5")),
        EscalaDescuento(nombre_escala="1001 a 2000", cantidad_minima=1001, cantidad_maxima=2000, porcentaje_descuento=Decimal("10.0")),
        EscalaDescuento(nombre_escala="Mas de 2000", cantidad_minima=2001, cantidad_maxima=None, porcentaje_descuento=Decimal("12.5")),
    ]
    session.add_all(escalas_datos)

    # 2. Cargar Categorías y Productos
    catalog_data = [
        {
            "codigo": "1",
            "nombre": "BALÓN VULCANIZADO (Cubierta Semi Brillante)",
            "specs": "Neumático de Látex, enmallado en Poli Nylon, doble capa de masilla, tintas libres de metales pesados. Grabado en molde.",
            "productos": [
                ("FUTBOL NO 5", "Balón Vulcanizado N° 5 PVC", "Circunf 67-69 cm | Altura 22 cm", 29000),
                ("FUTBOL NO 4", "Balón Vulcanizado N° 4 PVC", "Circunf 64-65 cm | Altura 20 cm", 29000),
                ("FUTBOL NO 3", "Balón Vulcanizado N° 3 PVC", "Circunf 53-55 cm | Altura 18 cm", 27000),
                ("FUTBOL NO 2", "Balón Vulcanizado N° 2 PVC", "Circunf 42-45 cm | Altura 14 cm", 24590),
            ]
        },
        {
            "codigo": "2",
            "nombre": "BALÓN TERMOFORMADO (Cubierta PVC Relieve)",
            "specs": "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural esponjoso, cubierta PVC 2mm. Marca en bajo relieve.",
            "productos": [
                ("FUTBOL NO 5", "Balón Termoformado N° 5 PVC", "Circunf 67-69 cm | Altura 22 cm", 49000),
                ("FUTBOL NO 4", "Balón Termoformado N° 4 PVC", "Circunf 64-65 cm | Altura 20 cm", 49000),
                ("FUTBOL NO 3", "Balón Termoformado N° 3 PVC", "Circunf 53-55 cm | Altura 18 cm", 45000),
                ("FUTBOL NO 2", "Balón Termoformado N° 2 PVC", "Circunf 42-45 cm | Altura 14 cm", 34590),
            ]
        },
        {
            "codigo": "3",
            "nombre": "BALÓN TERMOFORMADO (Cubierta PU Relieve)",
            "specs": "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural esponjoso, cubierta poliuretano PU 3mm. Marca en bajo relieve.",
            "productos": [
                ("FUTBOL NO 5", "Balón Termoformado N° 5 PU", "Circunf 67-69 cm | Altura 22 cm", 55000),
                ("FUTBOL NO 4", "Balón Termoformado N° 4 PU", "Circunf 64-65 cm | Altura 20 cm", 55000),
                ("FUTBOL NO 3", "Balón Termoformado N° 3 PU", "Circunf 53-55 cm | Altura 18 cm", 52000),
                ("FUTBOL NO 2", "Balón Termoformado N° 2 PU", "Circunf 42-45 cm | Altura 14 cm", 47000),
            ]
        },
        {
            "codigo": "4",
            "nombre": "BALONES DE BALONCESTO EN CAUCHO",
            "specs": "Balón baloncesto caucho, neumático de butilo enmallado en nylon impermeabilizado en caucho, cubierta de alta resistencia en caucho.",
            "productos": [
                ("Baloncesto No 7", "Balón de Baloncesto Caucho Profesional", "Tamaño N° 7", 45000),
                ("Baloncesto No 6", "Balón de Baloncesto Caucho Femenino / Juvenil", "Tamaño N° 6", 44000),
                ("Baloncesto No 5", "Balón de Baloncesto Caucho Infantil", "Tamaño N° 5", 43600),
                ("Baloncesto No 3", "Balón de Baloncesto Caucho Mini", "Tamaño N° 3", 41000),
            ]
        },
        {
            "codigo": "5",
            "nombre": "BALONES MEDICINALES Y BALÓN SONORO",
            "specs": "Balones de caucho de alto impacto para entrenamiento funcional y acondicionamiento deportivo con peso adaptable.",
            "productos": [
                ("Balón Medicinal 1 kg", "Balón Medicinal en Caucho - 1 Kilo", "Peso: 1 Kg", 46150),
                ("Balón Medicinal 2 kg", "Balón Medicinal en Caucho - 2 Kilos", "Peso: 2 Kg", 47725),
                ("Balón Medicinal 3 kg", "Balón Medicinal en Caucho - 3 Kilos", "Peso: 3 Kg", 49300),
                ("Balón Medicinal 4 kg", "Balón Medicinal en Caucho - 4 Kilos", "Peso: 4 Kg", 50500),
                ("Balón Medicinal 5 kg", "Balón Medicinal en Caucho - 5 Kilos", "Peso: 5 Kg", 52400),
                ("Balón Sonoro", "Balón Sonoro Especial para Discapacidad Visual", "Estándar", 57000),
            ]
        },
        {
            "codigo": "6",
            "nombre": "BALÓN VOLEYBOL TERMOFORMADO (Cubierta PVC Relieve)",
            "specs": "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural esponjoso, cubierta PVC 2mm. Marca en bajo relieve.",
            "productos": [
                ("Balón Voleybol No 5", "Balón Termoformado N° 5 PVC", "Circunf 65-67 cm", 49000),
                ("Balón Voleybol No 4", "Balón Termoformado N° 4 PVC", "Circunf 62-64 cm", 47000),
            ]
        },
        {
            "codigo": "7",
            "nombre": "BALONES FÚTBOL SALA Y MICROFÚTBOL TERMOFORMADOS",
            "specs": "Neumático/Cámara de Butilo, enmallado en nylon, caucho natural esponjoso, cubierta PVC/PU.",
            "productos": [
                ("BALON FUTBOL SALA PVC", "Balón Termoformado 62-64 PVC", "Circunf 62-64 cm", 52000),
                ("BALON FUTBOL SALA PU", "Balón Termoformado 62-64 PU", "Circunf 62-64 cm", 52000),
                ("BALON MICROFUTBOL PVC", "Balón Termoformado 60-62 PVC", "Circunf 60-62 cm", 50000),
            ]
        }
    ]

    for cat in catalog_data:
        categoria_obj = CategoriaProducto(
            codigo_seccion=cat["codigo"],
            nombre=cat["nombre"],
            especificaciones_generales=cat["specs"]
        )
        session.add(categoria_obj)
        session.flush()
        
        for ref, desc, dim, precio in cat["productos"]:
            prod = Producto(
                categoria_id=categoria_obj.id,
                referencia=ref,
                descripcion=desc,
                dimension_circunferencia=dim,
                precio_unitario_base=Decimal(str(precio)),
                porcentaje_iva=Decimal("19.00")
            )
            session.add(prod)

    session.commit()
    session.close()
    return engine


# ==========================================
# 3. PRUEBA DE EJECUCIÓN
# ==========================================

if __name__ == "__main__":
    print("Inicializando base de datos local trilak_database.db...")
    engine = init_db()
    
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()

    # Consulta: Productos vulcanizados
    print("\n--- CATÁLOGO DE BALONES VULCANIZADOS ---")
    vulcanizados = session.query(Producto).join(CategoriaProducto).filter(CategoriaProducto.codigo_seccion == "1").all()
    for p in vulcanizados:
        print(f"[{p.referencia}] {p.descripcion} | Base: ${p.precio_unitario_base:,.2f} | IVA: ${p.valor_iva_base:,.2f} | Total: ${p.precio_total_base:,.2f}")

    # Ejemplo de Cotización
    print("\n--- EJEMPLO DE COTIZACIÓN POR VOLUMEN ---")
    balon_seleccionado = vulcanizados[0]  # Futbol No 5 PVC ($29,000)
    cantidades_prueba = [10, 100, 300, 600, 1500, 2500]
    
    for cant in cantidades_prueba:
        cotiz = calcular_cotizacion_detallada(balon_seleccionado.precio_unitario_base, cant)
        print(f"Cantidad: {cant:4d} unids | Desc: {cotiz['porcentaje_descuento']:4.1f}% | Unitario sin IVA: ${cotiz['precio_unitario_con_descuento_sin_iva']:,.2f} | Total Pedido: ${cotiz['total_general_con_iva']:,.2f}")

# Dependencia para FastAPI
def get_db():
    engine = create_engine("sqlite:///trilak_database.db", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()