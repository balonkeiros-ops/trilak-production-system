from flask import Flask, jsonify, request, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import sqlite3
import os
import base64
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__, static_folder='build/static', static_url_path='/static')
# Antes: Flask(__name__) sin argumentos crea por defecto una ruta /static/<archivo>
# que busca en una carpeta "static/" en la raíz del proyecto (que no existe).
# Esa ruta automática tenía prioridad sobre la ruta personalizada de más abajo
# (serve()), así que /static/js/main.<hash>.js devolvía 404 SIEMPRE, aunque el
# archivo sí existiera dentro de build/static/js/. Por eso la página quedaba
# en blanco: el navegador nunca lograba descargar el bundle de React.
# 'session' (login) usaba app.secret_key sin que existiera -> NameError en /api/login,
# /api/logout y en cualquier ruta protegida con @login_required.
app.secret_key = os.environ.get('SECRET_KEY', 'trilak-dev-secret-cambiar-en-render')

# Usa la base de datos Postgres persistente de Render si existe DATABASE_URL
# (variable que Render inyecta automáticamente al conectar un servicio de
# Postgres). Si no existe (ej. en tu equipo local), sigue usando SQLite
# como hasta ahora, así que esto no rompe el desarrollo local.
_database_url = os.environ.get('DATABASE_URL', '').strip()
if not _database_url:
    # No hay DATABASE_URL (o está vacía) -> usar SQLite como hasta ahora.
    _database_url = 'sqlite:///trilak.db'
elif _database_url.startswith('postgres://'):
    # SQLAlchemy 1.4+ exige el prefijo 'postgresql://', Render todavía
    # entrega 'postgres://' en algunas variables.
    _database_url = _database_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = _database_url
print(f"[DB] Usando: {_database_url.split('://')[0]}://... (longitud={len(_database_url)})")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_SORT_KEYS'] = False

db = SQLAlchemy(app)
CORS(app)

# ================================================================
# RUTA A LA BASE DE DATOS DE INVENTARIO (app_unificada / SGII)
# Ajusta esta ruta según donde esté inventario.db en tu equipo
# ================================================================
INVENTARIO_DB_PATH = os.path.join(
    os.path.dirname(__file__),
    'inventario_cubiertas', 'instance', 'inventario.db'
)


# ======================== MODELOS ========================

class TipoBalon(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    # Punto 6 del requerimiento (filtros por línea): categoría manual,
    # clasificada a partir del nombre en CATEGORIAS_TIPO_BALON (ver abajo).
    categoria = db.Column(db.String(50), default='Otros')

    def to_dict(self):
        return {'id': self.id, 'nombre': self.nombre, 'categoria': self.categoria}


class Operario(db.Model):
    """
    Operarios de la fábrica. Sin tarea fija asignada —
    cada operario puede realizar cualquier tarea según el día.
    La asociación operario+tarea queda registrada en Produccion.
    """
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False, unique=True)
    estado = db.Column(db.String(20), default='disponible')  # disponible / inactivo

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'estado': self.estado
        }


class Material(db.Model):
    """
    Espejo local de los materiales del inventario SGII.
    El stock real siempre se consulta directamente en inventario.db.
    """
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    codigo = db.Column(db.String(100))
    cantidad_disponible = db.Column(db.Float, default=0)
    unidad = db.Column(db.String(20), default='metros')
    # Umbral mínimo configurable por el encargado de inventario. Si el stock
    # queda por debajo de este valor tras un pedido, se dispara la alerta
    # visual (ver POST /api/pedidos y Escenario 2 del Gherkin de stock crítico).
    umbral_minimo = db.Column(db.Float, default=50)

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'codigo': self.codigo,
            'cantidad_disponible': self.cantidad_disponible,
            'unidad': self.unidad,
            'umbral_minimo': self.umbral_minimo
        }


class Tarea(db.Model):
    """
    Catálogo de tareas/procesos disponibles en la fábrica.
    Cualquier operario puede ser asignado a cualquier tarea.
    """
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    descripcion = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'descripcion': self.descripcion
        }


class Pedido(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    numero_pedido = db.Column(db.String(50), unique=True, nullable=False)
    cliente = db.Column(db.String(150), nullable=False)
    tipo_balon_id = db.Column(db.Integer, db.ForeignKey('tipo_balon.id'), nullable=True)
    cantidad_balones = db.Column(db.Float, default=0)
    fecha_creacion = db.Column(db.DateTime, default=datetime.now)
    fecha_entrega_solicitada = db.Column(db.DateTime)
    estado = db.Column(db.String(20), default='pendiente')
    observaciones = db.Column(db.Text)

    tipo_balon = db.relationship('TipoBalon')
    materiales = db.relationship(
        'MaterialPedido',
        backref='pedido',
        lazy=True,
        cascade='all, delete-orphan'
    )
    balones = db.relationship(
        'PedidoBalon',
        backref='pedido',
        lazy=True,
        cascade='all, delete-orphan'
    )
    imagenes = db.relationship(
        'PedidoImagen',
        backref='pedido',
        lazy=True,
        cascade='all, delete-orphan'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'numero_pedido': self.numero_pedido,
            'cliente': self.cliente,
            # Se mantienen por compatibilidad con pantallas antiguas: reflejan
            # el primer tipo de balón y el TOTAL de balones del pedido.
            # La fuente de verdad para "varios tipos en un mismo pedido" es
            # la lista 'balones' de abajo.
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'cantidad_balones': self.cantidad_balones,
            'balones': [b.to_dict() for b in self.balones],
            'fecha_creacion': self.fecha_creacion.isoformat(),
            'fecha_entrega_solicitada': (
                self.fecha_entrega_solicitada.isoformat()
                if self.fecha_entrega_solicitada else None
            ),
            'estado': self.estado,
            # Detalles/características redactadas del pedido (máx. 500 caracteres,
            # validado también en el backend en generar_numero_pedido/crear pedido).
            'observaciones': self.observaciones,
            'materiales': [m.to_dict() for m in self.materiales],
            # Solo metadatos aquí (sin el contenido de la imagen) para no
            # inflar cada listado de pedidos; la imagen se pide aparte con
            # GET /api/pedidos/<id>/imagenes/<imagen_id>.
            'imagenes': [i.to_dict() for i in self.imagenes]
        }


class PedidoImagen(db.Model):
    """
    Fotografías/imágenes de referencia adjuntas a un pedido (diseño,
    muestra, etc.). Un pedido puede tener varias.

    El contenido se guarda como base64 dentro de la propia base de datos
    (no como archivo en disco), porque el disco de Render es efímero y
    se borra en cada redeploy/reinicio; guardarlo en la BD sobrevive a
    eso siempre que la BD sea persistente (ver DATABASE_URL/Postgres).
    """
    __tablename__ = 'pedido_imagen'

    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=False)
    nombre_archivo = db.Column(db.String(255))
    tipo_mime = db.Column(db.String(50))          # 'image/png' o 'image/jpeg'
    contenido_base64 = db.Column(db.Text, nullable=False)
    fecha_subida = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        # No se incluye 'contenido_base64' aquí a propósito (ver docstring
        # de la clase); para mostrar la imagen usar la ruta /imagenes/<id>.
        return {
            'id': self.id,
            'pedido_id': self.pedido_id,
            'nombre_archivo': self.nombre_archivo,
            'tipo_mime': self.tipo_mime,
            'fecha_subida': self.fecha_subida.isoformat()
        }


class PedidoBalon(db.Model):
    """
    Un pedido puede incluir varios tipos de balón (mismo cliente, mismo
    número de pedido). Cada fila aquí es "este pedido lleva X balones
    del tipo Y".
    """
    __tablename__ = 'pedido_balon'

    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=False)
    tipo_balon_id = db.Column(db.Integer, db.ForeignKey('tipo_balon.id'), nullable=False)
    cantidad = db.Column(db.Float, nullable=False, default=0)

    tipo_balon = db.relationship('TipoBalon')

    def to_dict(self):
        return {
            'id': self.id,
            'pedido_id': self.pedido_id,
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'cantidad': self.cantidad
        }


def generar_numero_pedido():
    """
    Genera el número de pedido en el backend (antes lo armaba el frontend con
    Date.now(), lo que no permitía un formato ni un correlativo controlado).

    Formato: 10 dígitos máximo -> AAAAAAABBBB
      - Primeros 6 dígitos: fecha de creación en formato ddmmaa (ej. 03/08/26 -> 030826)
      - Últimos 4 dígitos: correlativo del día, empezando en 1000

    Ejemplo: el primer pedido del 3 de agosto de 2026 -> 0308261000,
    el segundo ese mismo día -> 0308261001, etc.
    """
    prefijo = datetime.now().strftime('%d%m%y')  # 6 dígitos
    ultimo = (
        Pedido.query
        .filter(Pedido.numero_pedido.like(f'{prefijo}%'))
        .order_by(Pedido.numero_pedido.desc())
        .first()
    )
    correlativo = 1000
    if ultimo and ultimo.numero_pedido and len(ultimo.numero_pedido) > len(prefijo):
        sufijo = ultimo.numero_pedido[len(prefijo):]
        if sufijo.isdigit():
            correlativo = int(sufijo) + 1
    # Si algún día se superan los 9999 pedidos en un mismo día, el correlativo
    # crecerá a 5 dígitos en vez de perder o repetir números.
    return f'{prefijo}{correlativo}'


class MaterialPedido(db.Model):
    """
    Materiales asignados a un pedido.
    Un pedido puede llevar varios materiales (combinaciones PU/PVC).
    """
    __tablename__ = 'material_pedido'

    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=False)
    material_id = db.Column(db.Integer, db.ForeignKey('material.id'), nullable=False)
    cantidad = db.Column(db.Float, nullable=False)   # metros a usar
    observacion = db.Column(db.String(200))           # ej: "cubierta exterior"

    material = db.relationship('Material')

    def to_dict(self):
        return {
            'id': self.id,
            'pedido_id': self.pedido_id,
            'material_id': self.material_id,
            'material_nombre': self.material.nombre if self.material else None,
            'cantidad': self.cantidad,
            'observacion': self.observacion
        }


class Produccion(db.Model):
    """
    Registro de trabajo diario: qué operario hizo qué tarea,
    en qué pedido y cuántas unidades. La tarea se elige en el
    momento del registro — los operarios son polivalentes.
    """
    id = db.Column(db.Integer, primary_key=True)
    operario_id = db.Column(db.Integer, db.ForeignKey('operario.id'), nullable=False)
    tarea_id = db.Column(db.Integer, db.ForeignKey('tarea.id'), nullable=False)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=True)
    # Épica de inventario de producto terminado: a qué referencia de balón
    # corresponde este registro. Es indispensable porque un pedido puede
    # tener VARIOS tipos de balón mezclados (ver PedidoBalon) -- con solo
    # pedido_id no había forma de saber cuántas de esas unidades eran de
    # cada referencia. Nullable porque puede haber producción para stock
    # sin pedido asociado todavía, y para no romper registros históricos
    # creados antes de este campo.
    tipo_balon_id = db.Column(db.Integer, db.ForeignKey('tipo_balon.id'), nullable=True)
    # 'cantidad' se mantiene por compatibilidad con pantallas/reportes
    # antiguos: siempre es el TOTAL (unidades_buenas + unidades_defectuosas).
    cantidad = db.Column(db.Float, default=1)
    # Historia 4 (control de calidad): desglose real de unidades buenas vs
    # defectuosas por cada registro de producción.
    unidades_buenas = db.Column(db.Float, default=0)
    unidades_defectuosas = db.Column(db.Float, default=0)
    # Historia 3 (cronómetro): tiempo real que tomó la tarea. Son opcionales
    # a propósito -> si el registro se hace sin usar el cronómetro (como
    # antes), simplemente quedan en null y todo sigue funcionando igual.
    hora_inicio = db.Column(db.DateTime, nullable=True)
    hora_fin = db.Column(db.DateTime, nullable=True)
    duracion_segundos = db.Column(db.Integer, nullable=True)
    fecha = db.Column(db.DateTime, default=datetime.now)
    observaciones = db.Column(db.Text)

    operario = db.relationship('Operario', backref='producciones')
    tarea = db.relationship('Tarea', backref='producciones')
    pedido = db.relationship('Pedido')
    tipo_balon = db.relationship('TipoBalon')

    def to_dict(self):
        return {
            'id': self.id,
            'operario_id': self.operario_id,
            'operario_nombre': self.operario.nombre if self.operario else None,
            'tarea_id': self.tarea_id,
            'tarea_nombre': self.tarea.nombre if self.tarea else None,
            'pedido_id': self.pedido_id,
            'pedido_numero': self.pedido.numero_pedido if self.pedido else None,
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'cantidad': self.cantidad,
            'unidades_buenas': self.unidades_buenas,
            'unidades_defectuosas': self.unidades_defectuosas,
            'hora_inicio': self.hora_inicio.isoformat() if self.hora_inicio else None,
            'hora_fin': self.hora_fin.isoformat() if self.hora_fin else None,
            'duracion_segundos': self.duracion_segundos,
            'fecha': self.fecha.isoformat(),
            'observaciones': self.observaciones
        }


# ======================== FUNCIONES DE INVENTARIO ========================

def get_stock_inventario(nombre_material: str) -> float:
    """
    Consulta el stock real en inventario.db: entradas - salidas.
    Retorna -1 si no se puede conectar o el material no existe.
    """
    if not os.path.exists(INVENTARIO_DB_PATH):
        return -1
    try:
        conn = sqlite3.connect(INVENTARIO_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM materiales WHERE UPPER(nombre) = UPPER(?)",
            (nombre_material,)
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            return -1
        material_id = row[0]
        cursor.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN tipo='entrada' THEN cantidad ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo='salida'  THEN cantidad ELSE 0 END), 0)
            FROM movimientos WHERE material_id = ?
        """, (material_id,))
        stock = cursor.fetchone()[0]
        conn.close()
        return round(float(stock), 2)
    except Exception:
        return -1


def registrar_salida_inventario(nombre_material: str, cantidad: float, referencia: str) -> dict:
    """
    Escribe una salida en movimientos de inventario.db.
    """
    if not os.path.exists(INVENTARIO_DB_PATH):
        return {'ok': False, 'mensaje': f'inventario.db no encontrado en: {INVENTARIO_DB_PATH}'}
    try:
        conn = sqlite3.connect(INVENTARIO_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM materiales WHERE UPPER(nombre) = UPPER(?)",
            (nombre_material,)
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {'ok': False, 'mensaje': f'"{nombre_material}" no encontrado en inventario'}
        material_id = row[0]
        ahora = datetime.now().isoformat()
        cursor.execute("""
            INSERT INTO movimientos
                (material_id, tipo, cantidad, fecha, referencia, descripcion, usuario, created_at)
            VALUES (?, 'salida', ?, ?, ?, 'Descuento automático por pedido', 'Sistema', ?)
        """, (material_id, cantidad, ahora, referencia, ahora))
        conn.commit()
        conn.close()
        return {'ok': True, 'mensaje': f'{cantidad} m descontados de "{nombre_material}"'}
    except Exception as e:
        return {'ok': False, 'mensaje': str(e)}


# ======================== INICIALIZAR BD ========================

# Punto 6 del requerimiento de inventario de producto terminado: categoría
# por línea para poder filtrar. Clasificado a mano según lo que pidió el
# usuario (fútbol, fútbol sala/microfútbol, voleibol, baloncesto, otros).
# Se usa tanto para crear los tipos de balón nuevos como para reclasificar
# los que ya existían en la base de datos (ver migrar_columnas_faltantes).
CATEGORIAS_TIPO_BALON = {
    'Balon Futbol #5 32 CASCOS': 'Fútbol',
    'Balon Futbol #4 32 CASCOS': 'Fútbol',
    'Balon Futbol #3 32 CASCOS': 'Fútbol',
    'Balon Futbol #2 32 CASCOS': 'Fútbol',
    'Balon Futbol #1 32 CASCOS': 'Fútbol',
    'Balon Futbol mini 32 CASCOS': 'Fútbol',
    'Balon Futbol Sala 32 CASCOS': 'Fútbol Sala / Microfútbol',
    'Balon Micro Futbol 32 CASCOS': 'Fútbol Sala / Microfútbol',
    'Balon Futbol #5 BRAIN': 'Fútbol',
    'Balon Futbol #4 BRAIN': 'Fútbol',
    'Balon Futbol #3 BRAIN': 'Fútbol',
    'Balon Futbol #5 Bola 8': 'Fútbol',
    'Balon Futbol #4 Bola 8': 'Fútbol',
    'Balon Futbol #3 Bola 8': 'Fútbol',
    'Balon Futbol #5 Sportik': 'Fútbol',
    'Balon Futbol #4 Sportik': 'Fútbol',
    'Balon Futbol #3 Sportik': 'Fútbol',
    'OTRO BAlon fuera de Referncia': 'Otros',
    'Balon Voley Ball': 'Voleibol',
    'Balon Voley Ball Mini': 'Voleibol',
    'Balon Baloncesto #7': 'Baloncesto',
    'Balon Baloncesto #6': 'Baloncesto',
    'Balon Baloncesto #5': 'Baloncesto',
    'Balon Baloncesto #3': 'Baloncesto',
}


def inicializar_datos():
    """Carga datos iniciales en la base de datos."""

    # 13 TIPOS DE BALONES (coincide con frontend)
    tipos_balon = [
                'Balon Futbol #5 32 CASCOS',
                'Balon Futbol #4 32 CASCOS',
                'Balon Futbol #3 32 CASCOS',
                'Balon Futbol #2 32 CASCOS',
                'Balon Futbol #1 32 CASCOS',
                'Balon Futbol mini 32 CASCOS',
                'Balon Futbol Sala 32 CASCOS',
                'Balon Micro Futbol 32 CASCOS',
                'Balon Futbol #5 BRAIN',
                'Balon Futbol #4 BRAIN',
                'Balon Futbol #3 BRAIN',
                'Balon Futbol #5 Bola 8',
                'Balon Futbol #4 Bola 8',
                'Balon Futbol #3 Bola 8',
                'Balon Futbol #5 Sportik',
                'Balon Futbol #4 Sportik',
                'Balon Futbol #3 Sportik',
                'OTRO BAlon fuera de Referncia',
                'Balon Voley Ball',
                'Balon Voley Ball Mini', 
                'Balon Baloncesto #7',
                'Balon Baloncesto #6',
                'Balon Baloncesto #5',
                'Balon Baloncesto #3',
    ]

    # 14 OPERARIOS (nombres completos)
    operarios = [
        'YEFERSON CAMILO ARDILA VIVIESCAS',
        'ANYI JAIDYD AMAYA AMAYA',
        'RUTH SENAIDA GARZON BEJARANO',
        'ANGELICA MARIA MENDOZA CASTAÑEDA',
        'LUZ ZAIDA VARGAS PAEZ',
        'MARTHA STELLA MOLINA MOSQUERA',
        'EDILSON LUGO GALLO',
        'JHON JAMES PAEZ ROJAS',
        'YERLI PAOLA MONROY HERRERA',
        'SONIA CRISTINA SUAREZ HERNANDEZ',
        'JAZMIN QUIROGA',
        'NANCY PAEZ ROJAS',
        'CAMILO CASTRO',
        'OTRO OPERARIO'
    ]

    # 13 TAREAS (especialidades)
    tareas = [
        ('Corte de Material', 'Corte de material para balones'),
        ('Enrollado',         'Proceso de enrollar el material'),
        ('Masillado',         'Aplicar masilla/acabado'),
        ('Estampado',         'Estampar logos/diseños'),
        ('Troquelado',        'Corte con troquel'),
        ('Repujado',          'Repujar detalles'),
        ('Re troquelado',     'Segundo corte con troquel'),
        ('Ensamblado',        'Ensamble de piezas'),
        ('Planchado',         'Planchar la superficie'),
        ('Alistamiento',      'Preparación de materiales'),
        ('Vulcanizado',       'Aplicar calor y presión'),
        ('Despacho',          'Empaque y despacho'),
        ('Relleno',           'Relleno de balones')
    ]

    for nombre in tipos_balon:
        if not TipoBalon.query.filter_by(nombre=nombre).first():
            db.session.add(TipoBalon(
                nombre=nombre,
                categoria=CATEGORIAS_TIPO_BALON.get(nombre, 'Otros')
            ))

    for nombre in operarios:
        if not Operario.query.filter_by(nombre=nombre).first():
            db.session.add(Operario(nombre=nombre))

    for nombre, descripcion in tareas:
        if not Tarea.query.filter_by(nombre=nombre).first():
            db.session.add(Tarea(nombre=nombre, descripcion=descripcion))

    db.session.commit()


def cargar_materiales_sgii():
    """Carga los 40 materiales de cubierta desde SGII como referencia local."""
    materiales_sgii = [
        ('ARK VERDE', 51.00),    ('AZT BLANCO', 673.00),  ('AZT GALAXY', 4.00),
        ('BT BLANCO', 10.00),    ('BT ROJO', 50.00),       ('COMUS AMARILLO', 8.00),
        ('COMUS AZUL', 59.10),   ('COMUS BLANCO', 74.70),  ('COMUS NEGRO', 95.48),
        ('COMUS NARANJA', 28.00),('GE AMARILLO', 66.10),   ('GER BLANCO', 93.00),
        ('GER NARANJA', 214.00), ('GER NEGRO', 38.50),     ('GER ROJO', 129.80),
        ('GER VERDE', 8.00),     ('KOM BLANCO', 39.00),    ('MEETAZUL ELECTRICO', 18.00),
        ('MEETAZUL PETROLEO', 10.00), ('MEETDORADO', 24.50), ('MEETNEGRO', 27.00),
        ('MEETROJO', 25.00),     ('MEX AMARILLO BANDERA', 28.00), ('MEX AZUL', 38.00),
        ('MEX BLANCO', 89.00),   ('MEX MAGENTA', 30.00),  ('MEX NARANJA', 75.00),
        ('MEX NEGRO', 40.00),    ('MEX OASISI VERDE', 30.00), ('MEX ROJO', 25.00),
        ('MON AMARILLO', 13.00), ('MON VERDE', 37.00),     ('TORS AMARILLO', 18.60),
        ('TORS AZUL', 43.90),    ('TORS BLANCO', 24.00),   ('TORSOL 2.5', 44.70),
        ('VOL AMARILLO', 7.00),  ('VOL AZUL', 12.00),      ('VOL BLANCO', 4.00),
        ('VOL ROJO', 25.00),
    ]
    for nombre, cantidad in materiales_sgii:
        if not Material.query.filter_by(nombre=nombre).first():
            db.session.add(Material(
                nombre=nombre, codigo=nombre,
                cantidad_disponible=cantidad, unidad='metros'
            ))
    db.session.commit()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    usuario = data.get('usuario')
    contrasena = data.get('contrasena')
    # Aquí puedes usar credenciales fijas o validar contra una tabla de usuarios
    if usuario == 'admin' and contrasena == 'trilak2026':
        session['logged_in'] = True
        return jsonify({'ok': True})
    return jsonify({'ok': False}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('logged_in', None)
    return jsonify({'ok': True})

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({'error': 'No autorizado'}), 401
        return f(*args, **kwargs)
    return decorated_function

# ======================== RUTAS API ========================

def calcular_metricas_tipo_balon(tipo_balon_id):
    """
    Épica de inventario de producto terminado / Historia 1.

    - fabricadas: unidades buenas producidas de esta referencia (histórico).
    - defectuosas: unidades defectuosas producidas de esta referencia.
    - entregadas: unidades comprometidas en pedidos YA completados (según lo
      definido con el usuario: el pedido se entrega completo, no por
      referencia individual dentro de él).
    - pendientes: unidades comprometidas en pedidos activos (no completados).
    - disponibles: fabricadas - entregadas (nunca negativo).
    - semaforo: 'rojo' si no alcanza para cubrir lo pendiente, 'amarillo' si
      apenas alcanza (margen menor al 20%), 'verde' si hay holgura.
    """
    fabricadas = db.session.query(
        db.func.coalesce(db.func.sum(Produccion.unidades_buenas), 0)
    ).filter(Produccion.tipo_balon_id == tipo_balon_id).scalar()

    defectuosas = db.session.query(
        db.func.coalesce(db.func.sum(Produccion.unidades_defectuosas), 0)
    ).filter(Produccion.tipo_balon_id == tipo_balon_id).scalar()

    entregadas = db.session.query(
        db.func.coalesce(db.func.sum(PedidoBalon.cantidad), 0)
    ).join(Pedido, PedidoBalon.pedido_id == Pedido.id).filter(
        PedidoBalon.tipo_balon_id == tipo_balon_id,
        Pedido.estado == 'completado'
    ).scalar()

    pendientes = db.session.query(
        db.func.coalesce(db.func.sum(PedidoBalon.cantidad), 0)
    ).join(Pedido, PedidoBalon.pedido_id == Pedido.id).filter(
        PedidoBalon.tipo_balon_id == tipo_balon_id,
        Pedido.estado != 'completado'
    ).scalar()

    disponibles = max(0.0, fabricadas - entregadas)

    if pendientes > disponibles:
        semaforo = 'rojo'
    elif pendientes > 0 and disponibles < pendientes * 1.2:
        semaforo = 'amarillo'
    else:
        semaforo = 'verde'

    return {
        'fabricadas': fabricadas,
        'defectuosas': defectuosas,
        'entregadas': entregadas,
        'pendientes': pendientes,
        'disponibles': disponibles,
        'semaforo': semaforo
    }


@app.route('/api/tipos-balon', methods=['GET'])
def get_tipos_balon():
    tipos = TipoBalon.query.all()
    resultado = []
    for t in tipos:
        item = t.to_dict()
        item['metricas'] = calcular_metricas_tipo_balon(t.id)
        resultado.append(item)
    return jsonify(resultado)


@app.route('/api/tipos-balon/<int:tipo_balon_id>/metricas', methods=['GET'])
def get_metricas_tipo_balon(tipo_balon_id):
    """
    Historia 1 completa + Punto 7 (trazabilidad de lotes): detalle de una
    referencia al hacer clic, incluyendo el histórico de registros de
    producción (operario, fecha, buenas/defectuosas) para auditoría rápida.
    """
    tipo = TipoBalon.query.get_or_404(tipo_balon_id)
    metricas = calcular_metricas_tipo_balon(tipo_balon_id)

    lotes = Produccion.query.filter_by(tipo_balon_id=tipo_balon_id) \
        .order_by(Produccion.fecha.desc()).all()

    return jsonify({
        'tipo_balon': tipo.to_dict(),
        'metricas': metricas,
        'lotes': [l.to_dict() for l in lotes]
    })


@app.route('/api/inicializar', methods=['POST'])
def inicializar_bd():
    # Esta ruta la pide tu App.jsx al inicio
    db.create_all()
    inicializar_datos()
    cargar_materiales_sgii()
    return jsonify({"mensaje": "BD Lista"}), 200


    # ======================== RUTAS PARA SERVIR EL FRONTEND ========================

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # /static/... ya lo sirve Flask automáticamente (ver static_folder arriba).
    # Aquí solo cubrimos archivos sueltos en la raíz de build/ (favicon.ico,
    # manifest.json, logo192.png, etc.) y, si no es ninguno de esos, se asume
    # que es una ruta de React Router y se devuelve index.html.
    if path and os.path.exists(os.path.join('build', path)):
        return send_from_directory('build', path)
    return send_from_directory('build', 'index.html')


# ── OPERARIOS ─────────────────────────────────────────────────────────────────

@app.route('/api/operarios', methods=['GET', 'POST'])
def operarios_route():
    if request.method == 'GET':
        ops = Operario.query.order_by(Operario.nombre).all()
        return jsonify([op.to_dict() for op in ops])

    # POST: agregar nuevo operario
    data = request.json
    if not data.get('nombre'):
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    nuevo = Operario(nombre=data['nombre'].upper().strip())
    db.session.add(nuevo)
    db.session.commit()
    return jsonify(nuevo.to_dict()), 201


@app.route('/api/operarios/<int:operario_id>', methods=['PATCH'])
def actualizar_operario(operario_id):
    """Actualiza estado del operario: disponible / inactivo."""
    operario = Operario.query.get_or_404(operario_id)
    data = request.json
    if 'estado' in data:
        if data['estado'] not in ['disponible', 'inactivo']:
            return jsonify({'error': 'Estado inválido'}), 400
        operario.estado = data['estado']
    db.session.commit()
    return jsonify(operario.to_dict())


# ── TAREAS ────────────────────────────────────────────────────────────────────

@app.route('/api/tareas', methods=['GET'])
def get_tareas():
    """Lista todas las tareas disponibles."""
    return jsonify([t.to_dict() for t in Tarea.query.order_by(Tarea.nombre).all()])


# ── MATERIALES ────────────────────────────────────────────────────────────────

@app.route('/api/materiales', methods=['GET'])
def get_materiales():
    """
    Lista todos los materiales con stock real desde inventario.db.
    Si no hay conexión, usa el valor local como respaldo.
    """
    materiales = Material.query.order_by(Material.nombre).all()
    resultado = []
    for m in materiales:
        data = m.to_dict()
        stock_real = get_stock_inventario(m.nombre)
        data['cantidad_disponible'] = stock_real if stock_real >= 0 else m.cantidad_disponible
        data['fuente_stock'] = 'inventario' if stock_real >= 0 else 'local'
        resultado.append(data)
    return jsonify(resultado)


@app.route('/api/materiales/<int:material_id>/umbral', methods=['PUT'])
def actualizar_umbral_material(material_id):
    """
    Permite al encargado de inventario configurar el umbral mínimo de un
    material (ej. PU/PVC de cubierta). Ver Escenario 2 del Gherkin de
    stock crítico: la alerta se dispara comparando contra este valor.
    """
    material = Material.query.get_or_404(material_id)
    data = request.json or {}
    try:
        nuevo_umbral = float(data.get('umbral_minimo'))
    except (TypeError, ValueError):
        return jsonify({'error': 'umbral_minimo debe ser un número'}), 400
    if nuevo_umbral < 0:
        return jsonify({'error': 'umbral_minimo no puede ser negativo'}), 400

    material.umbral_minimo = nuevo_umbral
    db.session.commit()
    return jsonify(material.to_dict())


@app.route('/api/materiales/<int:material_id>/stock', methods=['GET'])
def get_stock_material(material_id):
    """
    Consulta en vivo el stock de un material específico.
    El frontend lo llama cada vez que se selecciona un material en el pedido.
    """
    material = Material.query.get_or_404(material_id)
    stock_real = get_stock_inventario(material.nombre)

    if stock_real >= 0:
        return jsonify({
            'material_id': material_id,
            'nombre': material.nombre,
            'stock_disponible': stock_real,
            'unidad': material.unidad,
            'fuente': 'inventario'
        })
    else:
        return jsonify({
            'material_id': material_id,
            'nombre': material.nombre,
            'stock_disponible': material.cantidad_disponible,
            'unidad': material.unidad,
            'fuente': 'local',
            'advertencia': 'No se pudo conectar con inventario.db — mostrando stock local'
        })


# ── PEDIDOS ───────────────────────────────────────────────────────────────────

@app.route('/api/pedidos/<int:pedido_id>/imagenes/<int:imagen_id>', methods=['GET'])
def get_imagen_pedido(pedido_id, imagen_id):
    """
    Sirve el contenido real de una imagen adjunta a un pedido, para poder
    usarla directamente como <img src="/api/pedidos/{id}/imagenes/{img_id}">.
    """
    imagen = PedidoImagen.query.filter_by(id=imagen_id, pedido_id=pedido_id).first_or_404()
    binario = base64.b64decode(imagen.contenido_base64)
    return app.response_class(binario, mimetype=imagen.tipo_mime)


@app.route('/api/pedidos', methods=['GET', 'POST'])
def pedidos_route():
    if request.method == 'GET':
        peds = Pedido.query.order_by(Pedido.fecha_creacion.desc()).all()
        return jsonify([p.to_dict() for p in peds])

    # POST: crear pedido con uno o varios materiales
    try:
        data = request.json

        # Aceptar tanto formato 'items' (frontend original) como 'materiales'
        items = data.get('items', [])
        # Compatibilidad hacia atrás: si alguien manda tipo_balon_id suelto
        # (sin 'items'), se trata como un único ítem.
        if not items and data.get('tipo_balon_id'):
            items = [{
                'tipo_balon_id': data.get('tipo_balon_id'),
                'cantidad': data.get('cantidad_balones', 1)
            }]

        # 'tipo_balon_id'/'cantidad_balones' en Pedido se mantienen solo como
        # resumen (primer tipo pedido y total de balones del pedido); el
        # detalle real por tipo de balón vive en la tabla PedidoBalon.
        primer_tipo_balon_id = items[0].get('tipo_balon_id') if items else None
        cantidad_balones_total = sum(
            float(it.get('cantidad', 0)) for it in items if it.get('tipo_balon_id')
        )

        # Escenario Gherkin 1: "el texto tiene una longitud menor o igual a
        # 500 caracteres" -> se valida también en el backend, no solo en el
        # frontend, para no depender únicamente del maxLength del textarea.
        detalles_pedido = (data.get('observaciones') or '').strip()
        if len(detalles_pedido) > 500:
            return jsonify({
                'error': f'Los detalles del pedido superan el límite de 500 caracteres '
                         f'(tiene {len(detalles_pedido)}).'
            }), 400

        nuevo_pedido = Pedido(
            numero_pedido=generar_numero_pedido(),
            cliente=data.get('cliente'),
            tipo_balon_id=primer_tipo_balon_id,
            cantidad_balones=cantidad_balones_total,
            fecha_entrega_solicitada=(
                datetime.fromisoformat(data['fecha_entrega_solicitada'])
                if data.get('fecha_entrega_solicitada') else None
            ),
            observaciones=detalles_pedido,
            estado='pendiente'
        )
        db.session.add(nuevo_pedido)
        db.session.flush()

        advertencias = []
        alertas_stock = []

        # Escenario Gherkin 2: adjuntar fotografía(s)/imagen(es) de referencia,
        # vinculadas al pedido recién creado. Solo se aceptan PNG/JPG.
        FORMATOS_IMAGEN_VALIDOS = ('image/png', 'image/jpeg', 'image/jpg')
        for img_data in data.get('imagenes', []):
            tipo_mime = (img_data.get('tipo_mime') or '').lower()
            contenido_base64 = img_data.get('contenido_base64')
            if not contenido_base64:
                continue
            if tipo_mime not in FORMATOS_IMAGEN_VALIDOS:
                advertencias.append(
                    f'Imagen "{img_data.get("nombre_archivo", "sin nombre")}" '
                    f'omitida: formato "{tipo_mime}" no permitido (solo PNG/JPG).'
                )
                continue
            db.session.add(PedidoImagen(
                pedido_id=nuevo_pedido.id,
                nombre_archivo=img_data.get('nombre_archivo', 'imagen'),
                tipo_mime=tipo_mime,
                contenido_base64=contenido_base64
            ))

        # Un pedido puede llevar varios tipos de balón distintos: se crea
        # una fila PedidoBalon por cada tipo de balón enviado en 'items'.
        for item in items:
            tipo_balon_id = item.get('tipo_balon_id')
            if not tipo_balon_id:
                continue
            db.session.add(PedidoBalon(
                pedido_id=nuevo_pedido.id,
                tipo_balon_id=tipo_balon_id,
                cantidad=float(item.get('cantidad', 0))
            ))

        materiales_input = items if items else data.get('materiales', [])

        for mat_data in materiales_input:
            material_id = mat_data.get('material_id')
            if not material_id:
                continue
            material = Material.query.get(material_id)
            if not material:
                advertencias.append(f'Material ID {material_id} no encontrado, se omite')
                continue

            cantidad = float(mat_data.get('cantidad', 0))

            # Verificar stock real antes de descontar
            stock_real = get_stock_inventario(material.nombre)
            stock_check = stock_real if stock_real >= 0 else material.cantidad_disponible

            if stock_check < cantidad:
                advertencias.append(
                    f'⚠ Stock insuficiente para "{material.nombre}": '
                    f'disponible {stock_check} m, solicitado {cantidad} m. '
                    f'Pedido guardado de todas formas.'
                )

            db.session.add(MaterialPedido(
                pedido_id=nuevo_pedido.id,
                material_id=material.id,
                cantidad=cantidad,
                observacion=mat_data.get('observacion', '')
            ))

            # Descontar en trilak.db (local)
            material.cantidad_disponible = max(0.0, material.cantidad_disponible - cantidad)

            # Escenario Gherkin 2 (stock crítico): se compara el stock
            # proyectado (el mismo 'stock_check' ya calculado arriba, menos
            # lo que se acaba de pedir) contra el umbral configurado del
            # material. No se hace una segunda consulta a SGII: se usa el
            # mismo valor con el que ya se decidió si había stock suficiente.
            stock_proyectado = max(0.0, stock_check - cantidad)
            if stock_proyectado < material.umbral_minimo:
                alertas_stock.append({
                    'material_id': material.id,
                    'material_nombre': material.nombre,
                    'cantidad_disponible': stock_proyectado,
                    'umbral_minimo': material.umbral_minimo,
                    'unidad': material.unidad
                })

            # Descontar en inventario.db (SGII)
            resultado = registrar_salida_inventario(
                nombre_material=material.nombre,
                cantidad=cantidad,
                referencia=data.get('numero_pedido', 'SIN-REF')
            )
            if not resultado['ok']:
                advertencias.append(f'Inventario SGII: {resultado["mensaje"]}')

        db.session.commit()

        respuesta = nuevo_pedido.to_dict()
        if advertencias:
            respuesta['advertencias'] = advertencias
        if alertas_stock:
            respuesta['alertas_stock'] = alertas_stock

        return jsonify(respuesta), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/pedidos/<int:pedido_id>', methods=['GET'])
def get_pedido(pedido_id):
    """Obtiene un pedido por ID."""
    return jsonify(Pedido.query.get_or_404(pedido_id).to_dict())


@app.route('/api/pedidos/<int:pedido_id>/estado', methods=['PATCH'])
def actualizar_estado_pedido(pedido_id):
    """Cambia el estado: pendiente / en_proceso / completado / cancelado."""
    pedido = Pedido.query.get_or_404(pedido_id)
    estados_validos = ['pendiente', 'en_proceso', 'completado', 'cancelado']
    nuevo_estado = request.json.get('estado')
    if nuevo_estado not in estados_validos:
        return jsonify({'error': f'Estado inválido. Opciones: {estados_validos}'}), 400
    pedido.estado = nuevo_estado
    db.session.commit()
    return jsonify(pedido.to_dict())


# ── PRODUCCIÓN ────────────────────────────────────────────────────────────────

@app.route('/api/produccion', methods=['GET', 'POST'])
def produccion_route():
    if request.method == 'GET':
        registros = Produccion.query.order_by(Produccion.fecha.desc()).all()
        return jsonify([r.to_dict() for r in registros])

    try:
        data = request.json

        operario = Operario.query.get(data.get('operario_id'))
        tarea = Tarea.query.get(data.get('tarea_id'))

        if not operario:
            return jsonify({'error': 'Operario no encontrado'}), 400
        if not tarea:
            return jsonify({'error': 'Tarea no encontrada'}), 400

        tipo_balon_id = data.get('tipo_balon_id') or None
        if tipo_balon_id and not TipoBalon.query.get(tipo_balon_id):
            return jsonify({'error': 'Tipo de balón no encontrado'}), 400

        # Historia 4: desglose de calidad. Si el frontend manda
        # unidades_buenas/unidades_defectuosas se usan esas; si no (pantallas
        # antiguas que solo mandan 'cantidad'), se asume que todo fue bueno,
        # para no romper compatibilidad.
        if 'unidades_buenas' in data or 'unidades_defectuosas' in data:
            unidades_buenas = float(data.get('unidades_buenas', 0) or 0)
            unidades_defectuosas = float(data.get('unidades_defectuosas', 0) or 0)
        else:
            unidades_buenas = float(data.get('cantidad', 1) or 0)
            unidades_defectuosas = 0

        if unidades_buenas < 0 or unidades_defectuosas < 0:
            return jsonify({'error': 'Las unidades no pueden ser negativas'}), 400

        total_unidades = unidades_buenas + unidades_defectuosas
        if total_unidades <= 0:
            return jsonify({'error': 'Debes registrar al menos una unidad (buena o defectuosa)'}), 400

        # Historia 3 (cronómetro): si el frontend manda hora_inicio y
        # hora_fin (porque se usó el cronómetro), se calcula la duración
        # real en segundos. Si no vienen (registro manual, sin cronómetro),
        # se guarda sin duración, igual que antes.
        hora_inicio = None
        hora_fin = None
        duracion_segundos = None
        if data.get('hora_inicio') and data.get('hora_fin'):
            try:
                hora_inicio = datetime.fromisoformat(data['hora_inicio'])
                hora_fin = datetime.fromisoformat(data['hora_fin'])
                duracion_segundos = max(0, int((hora_fin - hora_inicio).total_seconds()))
            except (ValueError, TypeError):
                return jsonify({'error': 'hora_inicio/hora_fin del cronómetro no son fechas válidas'}), 400

        nueva = Produccion(
            operario_id=operario.id,
            tarea_id=tarea.id,
            pedido_id=data.get('pedido_id') or None,
            tipo_balon_id=tipo_balon_id,
            cantidad=total_unidades,
            unidades_buenas=unidades_buenas,
            unidades_defectuosas=unidades_defectuosas,
            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            duracion_segundos=duracion_segundos,
            fecha=datetime.fromisoformat(data['fecha']) if data.get('fecha') else datetime.now(),
            observaciones=data.get('observaciones', '')
        )
        db.session.add(nueva)
        db.session.commit()
        return jsonify(nueva.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/produccion/por-operario/<int:operario_id>', methods=['GET'])
def produccion_por_operario(operario_id):
    """Historial de tareas realizadas por un operario específico."""
    registros = Produccion.query.filter_by(operario_id=operario_id)\
        .order_by(Produccion.fecha.desc()).all()
    return jsonify([r.to_dict() for r in registros])


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    """Retorna métricas para el panel de control."""
    # Historia 4: % de calidad real = unidades buenas / total de unidades
    # registradas, calculado sobre TODOS los registros de producción. Antes
    # este valor era un número fijo (98.2) que no salía de ningún dato real.
    total_buenas = db.session.query(db.func.coalesce(db.func.sum(Produccion.unidades_buenas), 0)).scalar()
    total_defectuosas = db.session.query(db.func.coalesce(db.func.sum(Produccion.unidades_defectuosas), 0)).scalar()
    total_producido = total_buenas + total_defectuosas
    calidad_real = round((total_buenas / total_producido) * 100, 1) if total_producido > 0 else None

    return jsonify({
        'metricas': {
            'total_pedidos': Pedido.query.count(),
            'pedidos_pendientes': Pedido.query.filter_by(estado='pendiente').count(),
            'pedidos_en_proceso': Pedido.query.filter_by(estado='en_proceso').count(),
            'pedidos_completados': Pedido.query.filter_by(estado='completado').count(),
            'total_operarios': Operario.query.count(),
            'operarios_disponibles': Operario.query.filter_by(estado='disponible').count(),
            'total_materiales': Material.query.count(),
            'total_tipos_balon': TipoBalon.query.count(),
            'total_registros_produccion': Produccion.query.count(),
            'produccion_promedio': 6975,
            'utilizacion': 99.6,
            # Se mantiene la clave 'calidad' por compatibilidad con el
            # frontend actual, pero ahora es un cálculo real (o null si
            # todavía no hay ningún registro de producción cargado).
            'calidad': calidad_real,
            'unidades_buenas_total': total_buenas,
            'unidades_defectuosas_total': total_defectuosas
        }
    })


# ── ARRANQUE ──────────────────────────────────────────────────────────────────
# Importante: esto se ejecuta SIEMPRE al importar el módulo (tanto con
# "python app_PRODUCCION.py" como con "gunicorn app_PRODUCCION:app", que es
# lo que usa Render según el Procfile). Antes solo estaba dentro de
# "if __name__ == '__main__'", así que en Render nunca se creaban las tablas
# ni se cargaban los tipos de balón / operarios / tareas / materiales.
def migrar_columnas_faltantes():
    """
    db.create_all() SOLO crea tablas que no existen -- nunca agrega columnas
    nuevas a una tabla que ya existía. En Render el disco a veces persiste
    entre despliegues normales (no siempre se limpia), así que si agregamos
    una columna a un modelo (ej. Material.umbral_minimo) y la tabla vieja
    ya existía en el disco, la app revienta al arrancar con
    "no such column: material.umbral_minimo".

    Esta función revisa, tabla por tabla y columna por columna, cuáles
    columnas del modelo actual no existen todavía en la base real, y las
    agrega con ALTER TABLE. Funciona tanto en SQLite como en Postgres.
    Es segura de correr en cada arranque: si ya está todo al día, no hace
    nada.
    """
    inspector = db.inspect(db.engine)
    for tabla in db.metadata.tables.values():
        nombre_tabla = tabla.name
        if not inspector.has_table(nombre_tabla):
            continue  # tabla nueva -> ya la crea db.create_all(), nada que migrar
        columnas_existentes = {col['name'] for col in inspector.get_columns(nombre_tabla)}
        for columna in tabla.columns:
            if columna.name in columnas_existentes:
                continue
            try:
                tipo_sql = columna.type.compile(dialect=db.engine.dialect)
                db.session.execute(db.text(
                    f'ALTER TABLE {nombre_tabla} ADD COLUMN {columna.name} {tipo_sql}'
                ))
                db.session.commit()
                print(f"[MIGRACION] Columna agregada: {nombre_tabla}.{columna.name}")
            except Exception as e:
                db.session.rollback()
                print(f"[MIGRACION] No se pudo agregar {nombre_tabla}.{columna.name}: {e}")


def reclasificar_tipos_balon_existentes():
    """
    La migración automática agrega la columna 'categoria' con valor NULL a
    los tipos de balón que ya existían antes de este cambio (ALTER TABLE no
    aplica el default de Python a filas ya existentes). Esta función les
    asigna la categoría correcta usando CATEGORIAS_TIPO_BALON.
    """
    pendientes = TipoBalon.query.filter(
        (TipoBalon.categoria.is_(None)) | (TipoBalon.categoria == '')
    ).all()
    for tipo in pendientes:
        tipo.categoria = CATEGORIAS_TIPO_BALON.get(tipo.nombre, 'Otros')
    if pendientes:
        db.session.commit()
        print(f"[MIGRACION] Categoría asignada a {len(pendientes)} tipos de balón existentes")


with app.app_context():
    db.create_all()
    migrar_columnas_faltantes()
    inicializar_datos()
    reclasificar_tipos_balon_existentes()
    cargar_materiales_sgii()


if __name__ == '__main__':

    print("=" * 60)
    print("🏭  SISTEMA DE PRODUCCIÓN TRILAK")
    print("📡  Servidor en: http://127.0.0.1:5002")
    print(f"📦  Inventario vinculado: {INVENTARIO_DB_PATH}")
    print("=" * 60)

    app.run(host='0.0.0.0', port=5002, debug=True)
