from flask import Flask, jsonify, request, send_from_directory, session, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timezone, timedelta
import sqlite3
import os
import base64
import urllib3
import io
import xlsxwriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv()

COLOMBIA_TZ = timezone(timedelta(hours=-5))


def ahora_colombia():
    return datetime.now(COLOMBIA_TZ).replace(tzinfo=None)

app = Flask(__name__, static_folder='build/static', static_url_path='/static')
app.secret_key = os.environ.get('SECRET_KEY', 'trilak-dev-secret-cambiar-en-render')

# Configuración de sesión: cookie HttpOnly, SameSite=Lax (funciona en el
# mismo dominio, evita ataques CSRF simples). Con esto la cookie de sesión
# se manda automáticamente en cada fetch desde el frontend.
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

_database_url = os.environ.get('DATABASE_URL', '').strip()
if not _database_url:
    _database_url = 'sqlite:///trilak.db'
elif _database_url.startswith('postgres://'):
    _database_url = _database_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = _database_url
print(f"[DB] Usando: {_database_url.split('://')[0]}://... (longitud={len(_database_url)})")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_SORT_KEYS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}

db = SQLAlchemy(app)
CORS(app, supports_credentials=True)

INVENTARIO_DB_PATH = os.path.join(
    os.path.dirname(__file__),
    'inventario_cubiertas', 'instance', 'inventario.db'
)

# ======================== MODELOS ========================

class TipoBalon(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)

    def to_dict(self):
        return {'id': self.id, 'nombre': self.nombre}


class Operario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False, unique=True)
    cedula = db.Column(db.String(20), unique=True)
    estado = db.Column(db.String(20), default='disponible')

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'cedula': self.cedula,
            'estado': self.estado
        }


class Usuario(db.Model):
    """
    Usuarios del sistema con login por usuario + contraseña.
    Roles: 'admin' | 'gerente' | 'tablet'
    """
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    rol = db.Column(db.String(20), nullable=False)
    activo = db.Column(db.Boolean, default=True)
    creado_en = db.Column(db.DateTime, default=ahora_colombia)
    ultimo_login = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'rol': self.rol,
            'activo': self.activo,
            'creado_en': self.creado_en.isoformat() if self.creado_en else None,
            'ultimo_login': self.ultimo_login.isoformat() if self.ultimo_login else None
        }


class PinOperario(db.Model):
    __tablename__ = 'pin_operario'
    id = db.Column(db.Integer, primary_key=True)
    operario_id = db.Column(db.Integer, db.ForeignKey('operario.id'),
                            unique=True, nullable=False)
    pin_hash = db.Column(db.String(200), nullable=False)
    origen = db.Column(db.String(30), default='cedula_ultimos4')
    activo = db.Column(db.Boolean, default=True)
    actualizado_en = db.Column(db.DateTime, default=ahora_colombia)
    operario = db.relationship('Operario')


class Auditoria(db.Model):
    __tablename__ = 'auditoria'
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=True)
    operario_id = db.Column(db.Integer, db.ForeignKey('operario.id'), nullable=True)
    accion = db.Column(db.String(80), nullable=False)
    entidad = db.Column(db.String(40))
    entidad_id = db.Column(db.Integer)
    detalle = db.Column(db.Text)
    exito = db.Column(db.Boolean, default=True)
    ip_origen = db.Column(db.String(50))
    user_agent = db.Column(db.String(200))
    fecha = db.Column(db.DateTime, default=ahora_colombia, index=True)

    usuario = db.relationship('Usuario')
    operario = db.relationship('Operario')


class Material(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    codigo = db.Column(db.String(100))
    cantidad_disponible = db.Column(db.Float, default=0)
    unidad = db.Column(db.String(20), default='metros')
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
    fecha_creacion = db.Column(db.DateTime, default=ahora_colombia)
    fecha_entrega_solicitada = db.Column(db.DateTime)
    estado = db.Column(db.String(20), default='pendiente')
    observaciones = db.Column(db.Text)

    tipo_balon = db.relationship('TipoBalon')
    materiales = db.relationship('MaterialPedido', backref='pedido', lazy=True, cascade='all, delete-orphan')
    balones = db.relationship('PedidoBalon', backref='pedido', lazy=True, cascade='all, delete-orphan')
    imagenes = db.relationship('PedidoImagen', backref='pedido', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'numero_pedido': self.numero_pedido,
            'cliente': self.cliente,
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'cantidad_balones': self.cantidad_balones,
            'balones': [b.to_dict() for b in self.balones],
            'fecha_creacion': self.fecha_creacion.isoformat(),
            'fecha_entrega_solicitada': self.fecha_entrega_solicitada.isoformat() if self.fecha_entrega_solicitada else None,
            'estado': self.estado,
            'observaciones': self.observaciones,
            'materiales': [m.to_dict() for m in self.materiales],
            'imagenes': [i.to_dict() for i in self.imagenes]
        }


class PedidoImagen(db.Model):
    __tablename__ = 'pedido_imagen'
    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=False)
    nombre_archivo = db.Column(db.String(255))
    tipo_mime = db.Column(db.String(50))
    contenido_base64 = db.Column(db.Text, nullable=False)
    fecha_subida = db.Column(db.DateTime, default=ahora_colombia)

    def to_dict(self):
        return {
            'id': self.id,
            'pedido_id': self.pedido_id,
            'nombre_archivo': self.nombre_archivo,
            'tipo_mime': self.tipo_mime,
            'fecha_subida': self.fecha_subida.isoformat()
        }


class PedidoBalon(db.Model):
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


class MaterialPedido(db.Model):
    __tablename__ = 'material_pedido'
    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=False)
    material_id = db.Column(db.Integer, db.ForeignKey('material.id'), nullable=False)
    cantidad = db.Column(db.Float, nullable=False)
    observacion = db.Column(db.String(200))

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
    id = db.Column(db.Integer, primary_key=True)
    operario_id = db.Column(db.Integer, db.ForeignKey('operario.id'), nullable=False)
    tarea_id = db.Column(db.Integer, db.ForeignKey('tarea.id'), nullable=False)
    tipo_balon_id = db.Column(db.Integer, db.ForeignKey('tipo_balon.id'), nullable=False)
    complejidad_estilo = db.Column(db.String(50), default='32 cascos')
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=True)
    cantidad = db.Column(db.Float, default=1)
    unidades_buenas = db.Column(db.Float, default=0)
    unidades_defectuosas = db.Column(db.Float, default=0)
    hora_inicio = db.Column(db.DateTime, nullable=True)
    hora_fin = db.Column(db.DateTime, nullable=True)
    duracion_segundos = db.Column(db.Integer, nullable=True)
    fecha = db.Column(db.DateTime, default=ahora_colombia)
    observaciones = db.Column(db.Text)

    operario = db.relationship('Operario', backref='producciones')
    tarea = db.relationship('Tarea', backref='producciones')
    tipo_balon = db.relationship('TipoBalon')
    pedido = db.relationship('Pedido')

    def to_dict(self):
        return {
            'id': self.id,
            'operario_id': self.operario_id,
            'operario_nombre': self.operario.nombre if self.operario else None,
            'tarea_id': self.tarea_id,
            'tarea_nombre': self.tarea.nombre if self.tarea else None,
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'complejidad_estilo': self.complejidad_estilo,
            'pedido_id': self.pedido_id,
            'pedido_numero': self.pedido.numero_pedido if self.pedido else None,
            'cantidad': self.cantidad,
            'unidades_buenas': self.unidades_buenas,
            'unidades_defectuosas': self.unidades_defectuosas,
            'hora_inicio': self.hora_inicio.isoformat() if self.hora_inicio else None,
            'hora_fin': self.hora_fin.isoformat() if self.hora_fin else None,
            'duracion_segundos': self.duracion_segundos,
            'fecha': self.fecha.isoformat(),
            'observaciones': self.observaciones
        }


def generar_numero_pedido():
    prefijo = ahora_colombia().strftime('%d%m%y')
    ultimo = Pedido.query.filter(Pedido.numero_pedido.like(f'{prefijo}%')).order_by(Pedido.numero_pedido.desc()).first()
    correlativo = 1000
    if ultimo and ultimo.numero_pedido and len(ultimo.numero_pedido) > len(prefijo):
        sufijo = ultimo.numero_pedido[len(prefijo):]
        if sufijo.isdigit():
            correlativo = int(sufijo) + 1
    return f'{prefijo}{correlativo}'


# ======================== UTILIDADES DE AUTH ========================

def calcular_pin_desde_cedula(cedula):
    if not cedula:
        return None
    solo_digitos = ''.join(c for c in str(cedula) if c.isdigit())
    if len(solo_digitos) < 4:
        return None
    return solo_digitos[-4:]


def hashear_pin(pin):
    return generate_password_hash(str(pin))


def verificar_pin(pin, pin_hash):
    try:
        return check_password_hash(pin_hash, str(pin))
    except Exception:
        return False


def registrar_auditoria(accion, entidad=None, entidad_id=None, detalle=None,
                        exito=True, usuario_id=None, operario_id=None):
    try:
        from flask import request, has_request_context
        ip = None
        ua = None
        if has_request_context():
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            ua = request.headers.get('User-Agent', '')[:200]
        db.session.add(Auditoria(
            usuario_id=usuario_id,
            operario_id=operario_id,
            accion=accion,
            entidad=entidad,
            entidad_id=entidad_id,
            detalle=detalle,
            exito=exito,
            ip_origen=ip,
            user_agent=ua
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[AUDITORIA] No se pudo registrar {accion}: {e}")


def usuario_actual():
    """Devuelve el objeto Usuario de la sesión o None."""
    uid = session.get('usuario_id')
    if not uid:
        return None
    return db.session.get(Usuario, uid)


# ======================== FUNCIONES DE INVENTARIO ========================

def get_stock_inventario(nombre_material: str) -> float:
    if not os.path.exists(INVENTARIO_DB_PATH):
        return -1
    try:
        conn = sqlite3.connect(INVENTARIO_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM materiales WHERE UPPER(nombre) = UPPER(?)", (nombre_material,))
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
    if not os.path.exists(INVENTARIO_DB_PATH):
        return {'ok': False, 'mensaje': f'inventario.db no encontrado en: {INVENTARIO_DB_PATH}'}
    try:
        conn = sqlite3.connect(INVENTARIO_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM materiales WHERE UPPER(nombre) = UPPER(?)", (nombre_material,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {'ok': False, 'mensaje': f'"{nombre_material}" no encontrado en inventario'}
        material_id = row[0]
        ahora = ahora_colombia().isoformat()
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

def inicializar_datos():
    tipos_balon = [
        'Balon Futbol #5 32 CASCOS', 'Balon Futbol #4 32 CASCOS', 'Balon Futbol #3 32 CASCOS',
        'Balon Futbol #2 32 CASCOS', 'Balon Futbol #1 32 CASCOS', 'Balon Futbol mini 32 CASCOS',
        'Balon Futbol Sala 32 CASCOS', 'Balon Micro Futbol 32 CASCOS', 'Balon Futbol #5 BRAIN',
        'Balon Futbol #4 BRAIN', 'Balon Futbol #3 BRAIN', 'Balon Futbol #5 Bola 8',
        'Balon Futbol #4 Bola 8', 'Balon Futbol #3 Bola 8', 'Balon Futbol #5 Sportik',
        'Balon Futbol #4 Sportik', 'Balon Futbol #3 Sportik', 'OTRO BAlon fuera de Referncia',
        'Balon Voley Ball', 'Balon Voley Ball Mini', 'Balon Baloncesto #7',
        'Balon Baloncesto #6', 'Balon Baloncesto #5', 'Balon Baloncesto #3'
    ]
    operarios = [
        'YEFERSON CAMILO ARDILA VIVIESCAS', 'ANYI JAIDYD AMAYA AMAYA', 'RUTH SENAIDA GARZON BEJARANO',
        'ANGELICA MARIA MENDOZA CASTAÑEDA', 'LUZ ZAIDA VARGAS PAEZ', 'MARTHA STELLA MOLINA MOSQUERA',
        'EDILSON LUGO GALLO', 'JHON JAMES PAEZ ROJAS', 'YERLI PAOLA MONROY HERRERA',
        'SONIA CRISTINA SUAREZ HERNANDEZ', 'JAZMIN QUIROGA', 'NANCY PAEZ ROJAS',
        'CAMILO CASTRO', 'OTRO OPERARIO'
    ]
    tareas = [
        ('Corte de Material', 'Corte de material para balones'), ('Enrollado', 'Proceso de enrollar el material'),
        ('Masillado', 'Aplicar masilla/acabado'), ('Estampado', 'Estampar logos/diseños'),
        ('Troquelado', 'Corte con troquel'), ('Repujado', 'Repujar detalles'),
        ('Re troquelado', 'Segundo corte con troquel'), ('Ensamblado', 'Ensamble de piezas'),
        ('Planchado', 'Planchar la superficie'), ('Alistamiento', 'Preparación de materiales'),
        ('Vulcanizado', 'Aplicar calor y presión'), ('Despacho', 'Empaque y despacho'),
        ('Relleno', 'Relleno de balones')
    ]

    for nombre in tipos_balon:
        if not TipoBalon.query.filter_by(nombre=nombre).first():
            db.session.add(TipoBalon(nombre=nombre))
    for nombre in operarios:
        if not Operario.query.filter_by(nombre=nombre).first():
            db.session.add(Operario(nombre=nombre))
    for nombre, descripcion in tareas:
        if not Tarea.query.filter_by(nombre=nombre).first():
            db.session.add(Tarea(nombre=nombre, descripcion=descripcion))
    db.session.commit()


def cargar_materiales_sgii():
    materiales_sgii = [
        ('ARK VERDE', 51.00), ('AZT BLANCO', 673.00), ('AZT GALAXY', 4.00),
        ('BT BLANCO', 10.00), ('BT ROJO', 50.00), ('COMUS AMARILLO', 8.00),
        ('COMUS AZUL', 59.10), ('COMUS BLANCO', 74.70), ('COMUS NEGRO', 95.48),
        ('COMUS NARANJA', 28.00), ('GE AMARILLO', 66.10), ('GER BLANCO', 93.00),
        ('GER NARANJA', 214.00), ('GER NEGRO', 38.50), ('GER ROJO', 129.80),
        ('GER VERDE', 8.00), ('KOM BLANCO', 39.00), ('MEETAZUL ELECTRICO', 18.00),
        ('MEETAZUL PETROLEO', 10.00), ('MEETDORADO', 24.50), ('MEETNEGRO', 27.00),
        ('MEETROJO', 25.00), ('MEX AMARILLO BANDERA', 28.00), ('MEX AZUL', 38.00),
        ('MEX BLANCO', 89.00), ('MEX MAGENTA', 30.00), ('MEX NARANJA', 75.00),
        ('MEX NEGRO', 40.00), ('MEX OASISI VERDE', 30.00), ('MEX ROJO', 25.00),
        ('MON AMARILLO', 13.00), ('MON VERDE', 37.00), ('TORS AMARILLO', 18.60),
        ('TORS AZUL', 43.90), ('TORS BLANCO', 24.00), ('TORSOL 2.5', 44.70),
        ('VOL AMARILLO', 7.00), ('VOL AZUL', 12.00), ('VOL BLANCO', 4.00),
        ('VOL ROJO', 25.00)
    ]
    for nombre, cantidad in materiales_sgii:
        if not Material.query.filter_by(nombre=nombre).first():
            db.session.add(Material(nombre=nombre, codigo=nombre, cantidad_disponible=cantidad, unidad='metros'))
    db.session.commit()


def crear_usuarios_y_pins_iniciales():
    usuarios_iniciales = [
        ('aldo',   'Trilak2026*Aldo',   'admin'),
        ('miguel', 'Trilak2026*Miguel', 'gerente'),
        ('clara',  'Trilak2026*Clara',  'gerente'),
        ('planta', 'Trilak2026*Planta', 'tablet'),
    ]
    for username, password, rol in usuarios_iniciales:
        if not Usuario.query.filter_by(username=username).first():
            db.session.add(Usuario(
                username=username,
                password_hash=generate_password_hash(password),
                rol=rol
            ))
            print(f"[INIT] Usuario creado: {username} ({rol})")
    db.session.commit()

    operarios_cedulas = [
        ('YEFERSON CAMILO ARDILA VIVIESCAS',     '1025141964'),
        ('ANYI JAIDYD AMAYA AMAYA',              '1032380243'),
        ('RUTH SENAIDA GARZON BEJARANO',         '39812803'),
        ('ANGELICA MARIA MENDOZA CASTAÑEDA',     '52120780'),
        ('LUZ ZAIDA VARGAS PAEZ',                '52952564'),
        ('MARTHA STELLA MOLINA MOSQUERA',        '65588240'),
        ('EDILSON LUGO GALLO',                   '79877086'),
        ('JHON JAMES PAEZ ROJAS',                '80857852'),
        ('YERLI PAOLA MONROY HERRERA',           '1033727613'),
        ('SONIA CRISTINA SUAREZ HERNANDEZ',      '52343183'),
        ('JAZMIN QUIROGA',                       '1023910870'),
        ('NANCY PAEZ ROJAS',                     '52232834'),
        ('CAMILO CASTRO',                        '79662120'),
    ]

    for nombre, cedula in operarios_cedulas:
        op = Operario.query.filter_by(nombre=nombre).first()
        if not op:
            op = Operario(nombre=nombre, cedula=cedula, estado='disponible')
            db.session.add(op)
            db.session.flush()
            print(f"[INIT] Operario creado: {nombre}")
        elif not op.cedula:
            op.cedula = cedula

        if not PinOperario.query.filter_by(operario_id=op.id).first():
            pin = calcular_pin_desde_cedula(cedula)
            if pin:
                db.session.add(PinOperario(
                    operario_id=op.id,
                    pin_hash=hashear_pin(pin),
                    origen='cedula_ultimos4'
                ))
                print(f"[INIT] PIN generado para {nombre}")

    for nombre in ['MICHAEL ANDRES GUZMAN ROBLES',
                   'TATIANA HERNANDEZ OSPINA',
                   'OTRO OPERARIO']:
        op = Operario.query.filter_by(nombre=nombre).first()
        if op and op.estado != 'inactivo':
            op.estado = 'inactivo'
            print(f"[INIT] Marcado inactivo: {nombre}")

    db.session.commit()


# ======================== DECORADORES DE AUTH ========================

def login_required(f):
    """Exige sesión activa. La sesión se crea al hacer POST /api/login."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('usuario_id'):
            return jsonify({'error': 'No autorizado'}), 401
        return f(*args, **kwargs)
    return decorated_function


def rol_requerido(*roles_permitidos):
    """
    Exige que el usuario logueado tenga uno de los roles indicados.
    Uso: @rol_requerido('admin') o @rol_requerido('admin', 'gerente')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            rol_actual = session.get('rol')
            if not rol_actual:
                return jsonify({'error': 'No autorizado'}), 401
            if rol_actual not in roles_permitidos:
                return jsonify({'error': 'Sin permiso para esta acción'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ======================== LOGIN / LOGOUT ========================

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = (data.get('usuario') or '').strip().lower()
    password = data.get('contrasena') or ''

    if not username or not password:
        return jsonify({'error': 'Usuario y contraseña son obligatorios'}), 400

    usuario = Usuario.query.filter_by(username=username).first()

    if not usuario or not usuario.activo:
        registrar_auditoria(
            accion='login_fallido',
            detalle=f'Usuario no existe o inactivo: {username}',
            exito=False
        )
        return jsonify({'error': 'Usuario o contraseña incorrectos'}), 401

    if not check_password_hash(usuario.password_hash, password):
        registrar_auditoria(
            accion='login_fallido',
            detalle=f'Contraseña incorrecta para: {username}',
            exito=False,
            usuario_id=usuario.id
        )
        return jsonify({'error': 'Usuario o contraseña incorrectos'}), 401

    # Login exitoso
    session.permanent = True
    session['usuario_id'] = usuario.id
    session['username'] = usuario.username
    session['rol'] = usuario.rol

    usuario.ultimo_login = ahora_colombia()
    db.session.commit()

    registrar_auditoria(
        accion='login_exitoso',
        entidad='usuario',
        entidad_id=usuario.id,
        detalle=f'{usuario.username} ({usuario.rol})',
        usuario_id=usuario.id
    )

    return jsonify({
        'ok': True,
        'usuario': usuario.to_dict()
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    uid = session.get('usuario_id')
    username = session.get('username')
    if uid:
        registrar_auditoria(
            accion='logout',
            entidad='usuario',
            entidad_id=uid,
            detalle=f'{username} cerró sesión',
            usuario_id=uid
        )
    session.clear()
    return jsonify({'ok': True})


@app.route('/api/me', methods=['GET'])
def me():
    """Devuelve el usuario logueado actual. El frontend lo usa al arrancar
    para saber quién es sin tener que re-loguearse."""
    u = usuario_actual()
    if not u:
        return jsonify({'error': 'No autorizado'}), 401
    return jsonify(u.to_dict())


# ======================== RUTAS API ========================

@app.route('/api/tipos-balon', methods=['GET'])
@login_required
def get_tipos_balon():
    tipos = TipoBalon.query.all()
    resultado = []
    for tipo in tipos:
        entregadas = db.session.query(
            db.func.coalesce(db.func.sum(PedidoBalon.cantidad), 0)
        ).join(Pedido, PedidoBalon.pedido_id == Pedido.id).filter(
            PedidoBalon.tipo_balon_id == tipo.id,
            Pedido.estado == 'completado'
        ).scalar()

        pendientes = db.session.query(
            db.func.coalesce(db.func.sum(PedidoBalon.cantidad), 0)
        ).join(Pedido, PedidoBalon.pedido_id == Pedido.id).filter(
            PedidoBalon.tipo_balon_id == tipo.id,
            Pedido.estado.in_(['pendiente', 'en_proceso'])
        ).scalar()

        fabricadas = db.session.query(
            db.func.coalesce(db.func.sum(Produccion.unidades_buenas), 0)
        ).filter(Produccion.tipo_balon_id == tipo.id).scalar()

        defectuosas = db.session.query(
            db.func.coalesce(db.func.sum(Produccion.unidades_defectuosas), 0)
        ).filter(Produccion.tipo_balon_id == tipo.id).scalar()

        stock_actual = max(0.0, float(fabricadas) - float(entregadas))

        semaforo = 'verde'
        if stock_actual <= 0 and pendientes > 0:
            semaforo = 'rojo'
        elif stock_actual > 0 and pendientes > 0:
            semaforo = 'amarillo'
        elif stock_actual == 0 and pendientes == 0:
            semaforo = 'rojo'

        resultado.append({
            'id': tipo.id,
            'nombre': tipo.nombre,
            'metricas': {
                'fabricadas': float(fabricadas),
                'defectuosas': float(defectuosas),
                'entregadas': float(entregadas),
                'stock_actual': float(stock_actual),
                'pendientes': float(pendientes),
                'disponibles': float(stock_actual),
                'semaforo': semaforo
            }
        })
    return jsonify(resultado)


@app.route('/api/inicializar', methods=['POST'])
def inicializar_bd():
    """Público: el frontend lo llama al arrancar para asegurar que las
    tablas existan. No expone datos sensibles."""
    db.create_all()
    inicializar_datos()
    cargar_materiales_sgii()
    return jsonify({"mensaje": "BD Lista"}), 200


@app.route('/api/tipos-balon/<int:tipo_id>/metricas', methods=['GET'])
@login_required
def get_metricas_tipo_balon(tipo_id):
    tipo_balon = TipoBalon.query.get_or_404(tipo_id)
    entregadas = db.session.query(
        db.func.coalesce(db.func.sum(PedidoBalon.cantidad), 0)
    ).join(Pedido, PedidoBalon.pedido_id == Pedido.id).filter(
        PedidoBalon.tipo_balon_id == tipo_id,
        Pedido.estado == 'completado'
    ).scalar()
    pendientes = db.session.query(
        db.func.coalesce(db.func.sum(PedidoBalon.cantidad), 0)
    ).join(Pedido, PedidoBalon.pedido_id == Pedido.id).filter(
        PedidoBalon.tipo_balon_id == tipo_id,
        Pedido.estado.in_(['pendiente', 'en_proceso'])
    ).scalar()
    fabricadas = db.session.query(
        db.func.coalesce(db.func.sum(Produccion.unidades_buenas), 0)
    ).filter(Produccion.tipo_balon_id == tipo_id).scalar()
    defectuosas = db.session.query(
        db.func.coalesce(db.func.sum(Produccion.unidades_defectuosas), 0)
    ).filter(Produccion.tipo_balon_id == tipo_id).scalar()
    stock_actual = max(0.0, float(fabricadas) - float(entregadas))

    semaforo = 'verde'
    if stock_actual <= 0 and pendientes > 0:
        semaforo = 'rojo'
    elif stock_actual > 0 and pendientes > 0:
        semaforo = 'amarillo'
    elif stock_actual == 0 and pendientes == 0:
        semaforo = 'rojo'

    registros = Produccion.query.filter_by(tipo_balon_id=tipo_id) \
        .order_by(Produccion.fecha.desc()).limit(50).all()
    lotes = [{
        'id': r.id,
        'fecha': r.fecha.isoformat(),
        'operario_nombre': r.operario.nombre if r.operario else None,
        'unidades_buenas': r.unidades_buenas,
        'unidades_defectuosas': r.unidades_defectuosas
    } for r in registros]

    return jsonify({
        'tipo_balon_id': tipo_balon.id,
        'nombre': tipo_balon.nombre,
        'metricas': {
            'fabricadas': float(fabricadas),
            'defectuosas': float(defectuosas),
            'entregadas': float(entregadas),
            'pendientes': float(pendientes),
            'disponibles': float(stock_actual),
            'stock_actual': stock_actual,
            'semaforo': semaforo
        },
        'lotes': lotes
    })


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(os.path.join('build', path)):
        return send_from_directory('build', path)
    return send_from_directory('build', 'index.html')


# ── OPERARIOS ─────────────────────────────────────────────────────────────────

@app.route('/api/operarios', methods=['GET', 'POST'])
@login_required
def operarios_route():
    if request.method == 'GET':
        ops = Operario.query.order_by(Operario.nombre).all()
        return jsonify([op.to_dict() for op in ops])
    # POST solo admin
    if session.get('rol') != 'admin':
        return jsonify({'error': 'Sin permiso para crear operarios'}), 403
    data = request.json
    if not data.get('nombre'):
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    nuevo = Operario(nombre=data['nombre'].upper().strip())
    db.session.add(nuevo)
    db.session.commit()
    return jsonify(nuevo.to_dict()), 201


@app.route('/api/operarios/<int:operario_id>', methods=['PATCH'])
@rol_requerido('admin')
def actualizar_operario(operario_id):
    operario = Operario.query.get_or_404(operario_id)
    data = request.json
    if 'estado' in data:
        if data['estado'] not in ['disponible', 'inactivo']:
            return jsonify({'error': 'Estado inválido'}), 400
        operario.estado = data['estado']
    db.session.commit()
    return jsonify(operario.to_dict())


# ── ANALÍTICA INDIVIDUAL ────────────────────────────────────────────────────

@app.route('/api/operarios/<int:operario_id>/analitica', methods=['GET'])
@login_required
def analitica_operario(operario_id):
    operario = Operario.query.get_or_404(operario_id)
    filtro = request.args.get('periodo', 'mensual')
    fecha_filtro = ahora_colombia()
    if filtro == 'diario':
        fecha_filtro = ahora_colombia().replace(hour=0, minute=0, second=0, microsecond=0)
    elif filtro == 'semanal':
        fecha_filtro = ahora_colombia() - timedelta(days=7)
    elif filtro == 'mensual':
        fecha_filtro = ahora_colombia() - timedelta(days=30)

    registros = Produccion.query.filter(
        Produccion.operario_id == operario_id,
        Produccion.fecha >= fecha_filtro
    ).order_by(Produccion.fecha.asc()).all()

    if not registros:
        return jsonify({'operario': operario.to_dict(), 'mensaje': 'No hay registros para este periodo'})

    total_unidades = 0
    total_buenas = 0
    total_defectuosas = 0
    total_tiempo_segundos = 0
    tiempo_estandar_total = 0
    grafica_datos = []
    pedidos_detalle = {}

    for r in registros:
        buenas = r.unidades_buenas
        defectuosas = r.unidades_defectuosas
        total_buenas += buenas
        total_defectuosas += defectuosas
        total_unidades += buenas + defectuosas
        if r.duracion_segundos:
            total_tiempo_segundos += r.duracion_segundos

        tiempo_por_unidad = 30 if r.complejidad_estilo == '32 cascos' else 20
        tiempo_estandar_total += tiempo_por_unidad * (buenas + defectuosas)

        fecha_str = r.fecha.strftime('%Y-%m-%d')
        if fecha_str not in {d['fecha'] for d in grafica_datos}:
            grafica_datos.append({'fecha': fecha_str, 'unidades_procesadas': 0, 'tiempo_invertido': 0})
        if grafica_datos:
            grafica_datos[-1]['unidades_procesadas'] += (buenas + defectuosas)
            if r.duracion_segundos:
                grafica_datos[-1]['tiempo_invertido'] += r.duracion_segundos

        if r.pedido_id and r.pedido:
            key = str(r.pedido_id)
            if key not in pedidos_detalle:
                pedidos_detalle[key] = {'numero': r.pedido.numero_pedido, 'total_unidades': 0, 'buenas': 0, 'defectuosas': 0}
            pedidos_detalle[key]['total_unidades'] += (buenas + defectuosas)
            pedidos_detalle[key]['buenas'] += buenas
            pedidos_detalle[key]['defectuosas'] += defectuosas

    productividad_unidades_por_hora = (total_unidades / (total_tiempo_segundos / 3600)) if total_tiempo_segundos > 0 else 0
    eficiencia_global = (tiempo_estandar_total / total_tiempo_segundos) * 100 if total_tiempo_segundos > 0 else 0
    indice_calidad = (total_buenas / total_unidades) * 100 if total_unidades > 0 else 0

    grafica_final = []
    for g in grafica_datos:
        tiempo = g['tiempo_invertido'] / 60
        proactividad = g['unidades_procesadas'] / tiempo if tiempo > 0 else 0
        grafica_final.append({'fecha': g['fecha'], 'proactividad': round(proactividad, 2)})

    return jsonify({
        'operario': operario.to_dict(),
        'periodo': filtro,
        'metricas': {
            'total_unidades': total_unidades,
            'unidades_buenas': total_buenas,
            'unidades_defectuosas': total_defectuosas,
            'tiempo_total_horas': round(total_tiempo_segundos / 3600, 2),
            'productividad_und_hora': round(productividad_unidades_por_hora, 2),
            'eficiencia_porcentaje': round(eficiencia_global, 2),
            'indice_calidad_porcentaje': round(indice_calidad, 2)
        },
        'grafica_proactividad': grafica_final,
        'detalle_pedidos': list(pedidos_detalle.values())
    })


# ── TAREAS ────────────────────────────────────────────────────────────────────

@app.route('/api/tareas', methods=['GET'])
@login_required
def get_tareas():
    return jsonify([t.to_dict() for t in Tarea.query.order_by(Tarea.nombre).all()])


# ── MATERIALES ────────────────────────────────────────────────────────────────

@app.route('/api/materiales', methods=['GET'])
@login_required
def get_materiales():
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
@rol_requerido('admin')
def actualizar_umbral_material(material_id):
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
@login_required
def get_stock_material(material_id):
    material = Material.query.get_or_404(material_id)
    stock_real = get_stock_inventario(material.nombre)
    if stock_real >= 0:
        return jsonify({'material_id': material_id, 'nombre': material.nombre, 'stock_disponible': stock_real, 'unidad': material.unidad, 'fuente': 'inventario'})
    else:
        return jsonify({'material_id': material_id, 'nombre': material.nombre, 'stock_disponible': material.cantidad_disponible, 'unidad': material.unidad, 'fuente': 'local', 'advertencia': 'No se pudo conectar con inventario.db — mostrando stock local'})


# ── PEDIDOS ───────────────────────────────────────────────────────────────────

@app.route('/api/pedidos/<int:pedido_id>/imagenes/<int:imagen_id>', methods=['GET'])
@login_required
def get_imagen_pedido(pedido_id, imagen_id):
    imagen = PedidoImagen.query.filter_by(id=imagen_id, pedido_id=pedido_id).first_or_404()
    binario = base64.b64decode(imagen.contenido_base64)
    return app.response_class(binario, mimetype=imagen.tipo_mime)


@app.route('/api/pedidos', methods=['GET', 'POST'])
@login_required
def pedidos_route():
    if request.method == 'GET':
        return jsonify([p.to_dict() for p in Pedido.query.order_by(Pedido.fecha_creacion.desc()).all()])

    try:
        data = request.json
        items = data.get('items', [])
        if not items and data.get('tipo_balon_id'):
            items = [{'tipo_balon_id': data.get('tipo_balon_id'), 'cantidad': data.get('cantidad_balones', 1)}]

        primer_tipo_balon_id = items[0].get('tipo_balon_id') if items else None
        cantidad_balones_total = sum(float(it.get('cantidad', 0)) for it in items if it.get('tipo_balon_id'))

        detalles_pedido = (data.get('observaciones') or '').strip()
        if len(detalles_pedido) > 500:
            return jsonify({'error': f'Los detalles del pedido superan el límite de 500 caracteres (tiene {len(detalles_pedido)}).'}), 400

        nuevo_pedido = Pedido(
            numero_pedido=generar_numero_pedido(),
            cliente=data.get('cliente'),
            tipo_balon_id=primer_tipo_balon_id,
            cantidad_balones=cantidad_balones_total,
            fecha_entrega_solicitada=datetime.fromisoformat(data['fecha_entrega_solicitada']) if data.get('fecha_entrega_solicitada') else None,
            observaciones=detalles_pedido,
            estado='pendiente'
        )
        db.session.add(nuevo_pedido)
        db.session.flush()

        advertencias = []
        alertas_stock = []
        FORMATOS_IMAGEN_VALIDOS = ('image/png', 'image/jpeg', 'image/jpg')

        for img_data in data.get('imagenes', []):
            tipo_mime = (img_data.get('tipo_mime') or '').lower()
            contenido_base64 = img_data.get('contenido_base64')
            if not contenido_base64: continue
            if tipo_mime not in FORMATOS_IMAGEN_VALIDOS:
                advertencias.append(f'Imagen "{img_data.get("nombre_archivo", "sin nombre")}" omitida: formato "{tipo_mime}" no permitido.')
                continue
            db.session.add(PedidoImagen(pedido_id=nuevo_pedido.id, nombre_archivo=img_data.get('nombre_archivo', 'imagen'), tipo_mime=tipo_mime, contenido_base64=contenido_base64))

        for item in items:
            tipo_balon_id = item.get('tipo_balon_id')
            if not tipo_balon_id: continue
            db.session.add(PedidoBalon(pedido_id=nuevo_pedido.id, tipo_balon_id=tipo_balon_id, cantidad=float(item.get('cantidad', 0))))

        materiales_input = items if items else data.get('materiales', [])
        for mat_data in materiales_input:
            material_id = mat_data.get('material_id')
            if not material_id: continue
            material = Material.query.get(material_id)
            if not material:
                advertencias.append(f'Material ID {material_id} no encontrado, se omite')
                continue
            cantidad = float(mat_data.get('cantidad', 0))
            stock_real = get_stock_inventario(material.nombre)
            stock_check = stock_real if stock_real >= 0 else material.cantidad_disponible

            if stock_check < cantidad:
                advertencias.append(f'⚠ Stock insuficiente para "{material.nombre}": disponible {stock_check} m, solicitado {cantidad} m. Pedido guardado de todas formas.')

            db.session.add(MaterialPedido(pedido_id=nuevo_pedido.id, material_id=material.id, cantidad=cantidad, observacion=mat_data.get('observacion', '')))
            material.cantidad_disponible = max(0.0, material.cantidad_disponible - cantidad)

            stock_proyectado = max(0.0, stock_check - cantidad)
            umbral_minimo_material = material.umbral_minimo if material.umbral_minimo is not None else 50
            if stock_proyectado < umbral_minimo_material:
                alertas_stock.append({'material_id': material.id, 'material_nombre': material.nombre, 'cantidad_disponible': stock_proyectado, 'umbral_minimo': umbral_minimo_material, 'unidad': material.unidad})

            resultado = registrar_salida_inventario(nombre_material=material.nombre, cantidad=cantidad, referencia=data.get('numero_pedido', 'SIN-REF'))
            if not resultado['ok']:
                advertencias.append(f'Inventario SGII: {resultado["mensaje"]}')

        db.session.commit()
        registrar_auditoria(
            accion='crear_pedido',
            entidad='pedido',
            entidad_id=nuevo_pedido.id,
            detalle=f'Pedido {nuevo_pedido.numero_pedido} - {nuevo_pedido.cliente}',
            usuario_id=session.get('usuario_id')
        )
        respuesta = nuevo_pedido.to_dict()
        if advertencias: respuesta['advertencias'] = advertencias
        if alertas_stock: respuesta['alertas_stock'] = alertas_stock
        return jsonify(respuesta), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/pedidos/<int:pedido_id>', methods=['GET'])
@login_required
def get_pedido(pedido_id):
    return jsonify(Pedido.query.get_or_404(pedido_id).to_dict())


@app.route('/api/pedidos/<int:pedido_id>/estado', methods=['PATCH'])
@login_required
def actualizar_estado_pedido(pedido_id):
    pedido = Pedido.query.get_or_404(pedido_id)
    estados_validos = ['pendiente', 'en_proceso', 'completado', 'cancelado']
    nuevo_estado = request.json.get('estado')
    if nuevo_estado not in estados_validos:
        return jsonify({'error': f'Estado inválido. Opciones: {estados_validos}'}), 400
    estado_anterior = pedido.estado
    pedido.estado = nuevo_estado
    db.session.commit()
    registrar_auditoria(
        accion='cambiar_estado_pedido',
        entidad='pedido',
        entidad_id=pedido.id,
        detalle=f'{estado_anterior} → {nuevo_estado}',
        usuario_id=session.get('usuario_id')
    )
    return jsonify(pedido.to_dict())


# ── PRODUCCIÓN ────────────────────────────────────────────────────────────────

@app.route('/api/produccion', methods=['GET', 'POST'])
@login_required
def produccion_route():
    if request.method == 'GET':
        return jsonify([r.to_dict() for r in Produccion.query.order_by(Produccion.fecha.desc()).all()])

    try:
        data = request.json
        operario = Operario.query.get(data.get('operario_id'))
        tarea = Tarea.query.get(data.get('tarea_id'))
        tipo_balon = TipoBalon.query.get(data.get('tipo_balon_id'))
        complejidad_estilo = data.get('complejidad_estilo', '32 cascos')

        if not operario: return jsonify({'error': 'Operario no encontrado'}), 400
        if not tarea: return jsonify({'error': 'Tarea no encontrada'}), 400
        if not tipo_balon: return jsonify({'error': 'El tipo de balón es obligatorio'}), 400

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
            tipo_balon_id=tipo_balon.id,
            complejidad_estilo=complejidad_estilo,
            pedido_id=data.get('pedido_id') or None,
            cantidad=total_unidades,
            unidades_buenas=unidades_buenas,
            unidades_defectuosas=unidades_defectuosas,
            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            duracion_segundos=duracion_segundos,
            fecha=datetime.fromisoformat(data['fecha']) if data.get('fecha') else ahora_colombia(),
            observaciones=data.get('observaciones', '')
        )
        db.session.add(nueva)
        db.session.commit()
        return jsonify(nueva.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/produccion/por-operario/<int:operario_id>', methods=['GET'])
@login_required
def produccion_por_operario(operario_id):
    registros = Produccion.query.filter_by(operario_id=operario_id).order_by(Produccion.fecha.desc()).all()
    return jsonify([r.to_dict() for r in registros])


# ── REPORTES ADMINISTRATIVOS ────────────────────────────────────────────────

@app.route('/api/reportes/operarios/<int:operario_id>', methods=['GET'])
@rol_requerido('admin', 'gerente')
def reporte_operario(operario_id):
    formato = request.args.get('formato', 'excel')
    analitica = request.get_json()
    if not analitica:
        return jsonify({'error': 'Se necesitan los datos de la analítica'}), 400

    operario = analitica['operario']
    metricas = analitica['metricas']

    if formato == 'excel':
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        sheet = workbook.add_worksheet('Reporte')
        sheet.write('A1', 'Operario:')
        sheet.write('B1', operario['nombre'])
        sheet.write('A2', 'Periodo:')
        sheet.write('B2', analitica.get('periodo', 'Mensual'))
        sheet.write('A4', 'Unidades Totales')
        sheet.write('B4', metricas['total_unidades'])
        sheet.write('A5', 'Unidades Buenas')
        sheet.write('B5', metricas['unidades_buenas'])
        sheet.write('A6', 'Unidades Defectuosas')
        sheet.write('B6', metricas['unidades_defectuosas'])
        sheet.write('A7', 'Índice de Calidad (%)')
        sheet.write('B7', metricas['indice_calidad_porcentaje'])
        sheet.write('A8', 'Eficiencia Global (%)')
        sheet.write('B8', metricas['eficiencia_porcentaje'])
        workbook.close()
        output.seek(0)
        return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                         as_attachment=True, download_name=f'Reporte_{operario["nombre"]}.xlsx')

    elif formato == 'pdf':
        output = io.BytesIO()
        c = canvas.Canvas(output, pagesize=letter)
        c.drawString(100, 750, f"Reporte de Rendimiento - {operario['nombre']}")
        c.drawString(100, 730, f"Periodo: {analitica.get('periodo', 'Mensual')}")
        c.line(100, 720, 500, 720)
        c.drawString(100, 700, f"Unidades Totales: {metricas['total_unidades']}")
        c.drawString(100, 680, f"Unidades Buenas: {metricas['unidades_buenas']}")
        c.drawString(100, 660, f"Unidades Defectuosas: {metricas['unidades_defectuosas']}")
        c.drawString(100, 640, f"Índice de Calidad: {metricas['indice_calidad_porcentaje']}%")
        c.drawString(100, 620, f"Eficiencia Global: {metricas['eficiencia_porcentaje']}%")
        c.save()
        output.seek(0)
        return send_file(output, mimetype='application/pdf',
                         as_attachment=True, download_name=f'Reporte_{operario["nombre"]}.pdf')

    return jsonify({'error': 'Formato no soportado'}), 400


# ── DASHBOARD ───────────────────────────────────────────────────────────────

@app.route('/api/dashboard', methods=['GET'])
@login_required
def dashboard():
    total_buenas = db.session.query(db.func.coalesce(db.func.sum(Produccion.unidades_buenas), 0)).scalar()
    total_defectuosas = db.session.query(db.func.coalesce(db.func.sum(Produccion.unidades_defectuosas), 0)).scalar()
    total_producido = total_buenas + total_defectuosas
    calidad_real = round((total_buenas / total_producido) * 100, 1) if total_producido > 0 else None

    top_operarios = db.session.query(
        Produccion.operario_id,
        db.func.sum(Produccion.unidades_buenas + Produccion.unidades_defectuosas).label('total_unidades')
    ).group_by(Produccion.operario_id).order_by(db.text('total_unidades DESC')).limit(5).all()

    lista_top = []
    for op_id, total in top_operarios:
        op = Operario.query.get(op_id)
        if op:
            lista_top.append({'nombre': op.nombre, 'total_unidades': total})

    top_merma = db.session.query(
        Produccion.operario_id,
        db.func.sum(Produccion.unidades_defectuosas).label('total_defectos')
    ).group_by(Produccion.operario_id).order_by(db.text('total_defectos DESC')).limit(3).all()

    lista_merma = []
    for op_id, defectos in top_merma:
        op = Operario.query.get(op_id)
        if op:
            lista_merma.append({'nombre': op.nombre, 'total_defectos': defectos})

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
            'calidad': calidad_real,
            'unidades_buenas_total': total_buenas,
            'unidades_defectuosas_total': total_defectuosas,
            'top_operarios': lista_top,
            'top_merma': lista_merma,
            'eficiencia_global_estimada': 92.5
        }
    })


# ======================== MIGRACIÓN Y ARRANQUE ========================

def migrar_columnas_faltantes():
    inspector = db.inspect(db.engine)
    for tabla in db.metadata.tables.values():
        nombre_tabla = tabla.name
        if not inspector.has_table(nombre_tabla):
            continue
        columnas_existentes = {col['name'] for col in inspector.get_columns(nombre_tabla)}
        for columna in tabla.columns:
            if columna.name in columnas_existentes:
                continue
            try:
                tipo_sql = columna.type.compile(dialect=db.engine.dialect)
                db.session.execute(db.text(f'ALTER TABLE {nombre_tabla} ADD COLUMN {columna.name} {tipo_sql}'))
                db.session.commit()
                print(f"[MIGRACION] Columna agregada: {nombre_tabla}.{columna.name}")
            except Exception as e:
                db.session.rollback()
                print(f"[MIGRACION] No se pudo agregar {nombre_tabla}.{columna.name}: {e}")


def corregir_umbrales_nulos():
    materiales_sin_umbral = Material.query.filter(Material.umbral_minimo.is_(None)).all()
    for m in materiales_sin_umbral:
        m.umbral_minimo = 50
    if materiales_sin_umbral:
        db.session.commit()
        print(f"[MIGRACION] {len(materiales_sin_umbral)} materiales con umbral_minimo corregido a 50")


with app.app_context():
    db.create_all()
    migrar_columnas_faltantes()
    corregir_umbrales_nulos()
    inicializar_datos()
    cargar_materiales_sgii()
    crear_usuarios_y_pins_iniciales()


if __name__ == '__main__':
    print("=" * 60)
    print("🏭  SISTEMA DE PRODUCCIÓN TRILAK")
    print("📡  Servidor en: http://127.0.0.1:5002")
    print(f"📦  Inventario vinculado: {INVENTARIO_DB_PATH}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5002, debug=True)

    