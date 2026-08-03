from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import sqlite3
import os

# Configuración inteligente de la Base de Datos
database_url = os.environ.get('DATABASE_URL')
if database_url and database_url.startswith('postgres://'):
  database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///trilak.db'
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__, static_folder='build', static_url_path='')
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

    def to_dict(self):
        return {'id': self.id, 'nombre': self.nombre}


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

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'codigo': self.codigo,
            'cantidad_disponible': self.cantidad_disponible,
            'unidad': self.unidad
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

    def to_dict(self):
        return {
            'id': self.id,
            'numero_pedido': self.numero_pedido,
            'cliente': self.cliente,
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'cantidad_balones': self.cantidad_balones,
            'fecha_creacion': self.fecha_creacion.isoformat(),
            'fecha_entrega_solicitada': (
                self.fecha_entrega_solicitada.isoformat()
                if self.fecha_entrega_solicitada else None
            ),
            'estado': self.estado,
            'observaciones': self.observaciones,
            'materiales': [m.to_dict() for m in self.materiales]
        }


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
    cantidad = db.Column(db.Float, default=1)
    fecha = db.Column(db.DateTime, default=datetime.now)
    observaciones = db.Column(db.Text)

    operario = db.relationship('Operario', backref='producciones')
    tarea = db.relationship('Tarea', backref='producciones')
    pedido = db.relationship('Pedido')

    def to_dict(self):
        return {
            'id': self.id,
            'operario_id': self.operario_id,
            'operario_nombre': self.operario.nombre if self.operario else None,
            'tarea_id': self.tarea_id,
            'tarea_nombre': self.tarea.nombre if self.tarea else None,
            'pedido_id': self.pedido_id,
            'pedido_numero': self.pedido.numero_pedido if self.pedido else None,
            'cantidad': self.cantidad,
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
            db.session.add(TipoBalon(nombre=nombre))

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

@app.route('/api/inicializar', methods=['POST'])
@login_required
def inicializar_bd():
    # Esta ruta la pide tu App.jsx al inicio
    db.create_all()
    inicializar_datos() # La función que ya creamos
    return jsonify({"mensaje": "BD Lista"}), 200

@app.route('/api/tipos-balon', methods=['GET'])
@login_required
def get_tipos_balon():
    tipos = TipoBalon.query.all()
    return jsonify([t.to_dict() for t in tipos])


@app.route('/api/materiales', methods=['GET'])
@login_required
def listar_materiales_api():
    # Tu App.jsx espera 'cantidad_disponible' y 'unidad'
    mats = Material.query.all()
    return jsonify([{
        "id": m.id, 
        "nombre": m.nombre, 
        "cantidad_disponible": 100, # O el stock real de SGII
        "unidad": "metros"
    } for m in mats])

@app.route('/api/produccion', methods=['GET', 'POST'])
@login_required
def gestionar_produccion():
    if request.method == 'POST':
        data = request.json
        nueva_p = Produccion(
            operario_id=data['operario_id'],
            tarea_id=data['tarea_id'],
            pedido_id=data.get('pedido_id'),
            # cantidad=data.get('cantidad', 1) # Asegúrate que tu modelo tenga 'cantidad'
        )
        db.session.add(nueva_p)
        db.session.commit()
        return jsonify({"ok": True}), 201
    
    # Para el listado de producción
    prods = Produccion.query.all()
    return jsonify([{
        "id": p.id,
        "operario_nombre": p.operario.nombre,
        "tarea_nombre": p.tarea.nombre,
        "fecha": p.fecha.isoformat(),
        "cantidad": 1 # valor por defecto
    } for p in prods])


    # ======================== RUTAS PARA SERVIR EL FRONTEND ========================

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and (path.startswith('static/') or path.startswith('assets/')):
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
        tipo_balon_id = data.get('tipo_balon_id') or (items[0].get('tipo_balon_id') if items else None)
        cantidad_balones = data.get('cantidad_balones') or (items[0].get('cantidad', 1) if items else 0)

        nuevo_pedido = Pedido(
            numero_pedido=data.get('numero_pedido'),
            cliente=data.get('cliente'),
            tipo_balon_id=tipo_balon_id,
            cantidad_balones=cantidad_balones,
            fecha_entrega_solicitada=(
                datetime.fromisoformat(data['fecha_entrega_solicitada'])
                if data.get('fecha_entrega_solicitada') else None
            ),
            observaciones=data.get('observaciones', ''),
            estado='pendiente'
        )
        db.session.add(nuevo_pedido)
        db.session.flush()

        advertencias = []
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

        nueva = Produccion(
            operario_id=operario.id,
            tarea_id=tarea.id,
            pedido_id=data.get('pedido_id') or None,
            cantidad=data.get('cantidad', 1),
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
            'calidad': 98.2
        }
    })


# ── ARRANQUE ──────────────────────────────────────────────────────────────────
@app.route('/')
def home():
    return app.send_static_file('index.html')
    with app.app_context():
    db.create_all()
    inicializar_datos()
    cargar_materiales_sgii()

if __name__ == '__main__':
    print("=" * 60)
    print("🛠️ SISTEMA DE PRODUCCIÓN TRILAK")
    print("🚀 Servidor en: http://127.0.0.1:5002")
    print(f"📦 Inventario vinculado: {INVENTARIO_DB_PATH}")
    print("=" * 60)
    app.run(debug=True, port=5002)
