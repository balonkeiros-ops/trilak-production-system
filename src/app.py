from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trilak.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_SORT_KEYS'] = False
app.secret_key = 'trilak-secret-2026'

db = SQLAlchemy(app)
CORS(app)

# ======================== MODELOS ========================

class TipoBalon(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)

    def to_dict(self):
        return {'id': self.id, 'nombre': self.nombre}


class Operario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(150), nullable=False, unique=True)
    estado = db.Column(db.String(20), default='disponible')

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'estado': self.estado
        }


class Material(db.Model):
    """52 Materiales REALES de SGII con stock actual"""
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
    """Procesos/tareas que realiza cada operario"""
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
    """Pedidos con múltiples materiales y cantidades manuales"""
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
    materiales = db.relationship('MaterialPedido', backref='pedido', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'numero_pedido': self.numero_pedido,
            'cliente': self.cliente,
            'tipo_balon_id': self.tipo_balon_id,
            'tipo_balon_nombre': self.tipo_balon.nombre if self.tipo_balon else None,
            'cantidad_balones': self.cantidad_balones,
            'fecha_creacion': self.fecha_creacion.isoformat(),
            'fecha_entrega_solicitada': self.fecha_entrega_solicitada.isoformat() if self.fecha_entrega_solicitada else None,
            'estado': self.estado,
            'observaciones': self.observaciones,
            'materiales': [m.to_dict() for m in self.materiales]
        }


class MaterialPedido(db.Model):
    """Materiales asignados a un pedido con cantidades MANUALES"""
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
    """Registro de producción: operario + tarea + pedido + DESCUENTO MANUAL de material"""
    id = db.Column(db.Integer, primary_key=True)
    operario_id = db.Column(db.Integer, db.ForeignKey('operario.id'), nullable=False)
    tarea_id = db.Column(db.Integer, db.ForeignKey('tarea.id'), nullable=False)
    pedido_id = db.Column(db.Integer, db.ForeignKey('pedido.id'), nullable=True)
    material_id = db.Column(db.Integer, db.ForeignKey('material.id'), nullable=True)
    cantidad_material_descontada = db.Column(db.Float, default=0)
    cantidad_producida = db.Column(db.Float, default=1)
    fecha = db.Column(db.DateTime, default=datetime.now)
    observaciones = db.Column(db.Text)

    operario = db.relationship('Operario', backref='producciones')
    tarea = db.relationship('Tarea', backref='producciones')
    pedido = db.relationship('Pedido')
    material = db.relationship('Material')

    def to_dict(self):
        return {
            'id': self.id,
            'operario_id': self.operario_id,
            'operario_nombre': self.operario.nombre if self.operario else None,
            'tarea_id': self.tarea_id,
            'tarea_nombre': self.tarea.nombre if self.tarea else None,
            'pedido_id': self.pedido_id,
            'pedido_numero': self.pedido.numero_pedido if self.pedido else None,
            'material_id': self.material_id,
            'material_nombre': self.material.nombre if self.material else None,
            'cantidad_material_descontada': self.cantidad_material_descontada,
            'cantidad_producida': self.cantidad_producida,
            'fecha': self.fecha.isoformat(),
            'observaciones': self.observaciones
        }


# ======================== INICIALIZAR BD ========================

def inicializar_datos():
    """Carga datos iniciales"""
    
    tipos_balon = [
        'Balón Fútbol #5', 'Balón Fútbol #4', 'Balón Fútbol #3',
        'Balón Fútbol #2', 'Balón Fútbol #1', 'Balón Fútbol Mini',
        'Balón Fútbol Sala', 'Balón Micro Fútbol', 'Balón Voley Ball',
        'Balón Baloncesto #7', 'Balón Baloncesto #6', 'Balón Baloncesto #5', 'Otros'
    ]

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
        'TATIANA HERNANDEZ OSPINA'
    ]

    tareas = [
        ('Corte de Material', 'Corte de material para balones'),
        ('Enrollado', 'Proceso de enrollar el material'),
        ('Masillado', 'Aplicar masilla/acabado'),
        ('Estampado', 'Estampar logos/diseños'),
        ('Troquelado', 'Corte con troquel'),
        ('Repujado', 'Repujar detalles'),
        ('Re troquelado', 'Segundo corte con troquel'),
        ('Ensamblado', 'Ensamble de piezas'),
        ('Planchado', 'Planchar la superficie'),
        ('Alistamiento', 'Preparación de materiales'),
        ('Vulcanizado', 'Aplicar calor y presión'),
        ('Despacho', 'Empaque y despacho'),
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
    print("✅ Datos iniciales cargados (13 tipos, 14 operarios, 13 tareas)")


def cargar_materiales_sgii():
    """
    Carga 52 MATERIALES REALES de SGII con stock actual
    Datos extraídos directamente del SGII real
    """
    
    # 52 MATERIALES REALES DE SGII CON STOCK ACTUAL
    materiales_sgii = [
        ('ARK VERDE', 51.00),
        ('AZT BLANCO', 673.00),
        ('AZT GALAXY', 4.00),
        ('BT BLANCO', 10.00),
        ('BT ROJO', 50.00),
        ('COMUS AMARILLO', 8.00),
        ('COMUS AMARILLO VERDE', 0.00),
        ('COMUS AZUL', 59.10),
        ('COMUS BLANCO', 74.70),
        ('COMUS BLANCO BRILLANTE', 4.00),
        ('COMUS NARANJA', 28.00),
        ('COMUS NEGRO', 95.48),
        ('COMUS ROJO', 5.00),
        ('COS OBLANCO', 25.00),
        ('COS OROJO', 35.00),
        ('COS OVERDE', 71.00),
        ('GE AMARILLO', 66.10),
        ('GER BLANCO', 93.00),
        ('GER NARANJA', 214.00),
        ('GER NEGRO', 38.50),
        ('GER ROJO', 129.80),
        ('GER VERDE', 8.00),
        ('KOM BLANCO', 39.00),
        ('M26 BLANCO', 0.00),
        ('MEETAZUL ELECTRICO', 18.00),
        ('MEETAZUL PETROLEO', 10.00),
        ('MEETDORADO', 24.50),
        ('MEETMANDARINA', 2.30),
        ('MEETNEGRO', 27.00),
        ('MEETROJO', 25.00),
        ('METTGRIS', 0.00),
        ('MEX AMARILLO BANDERA', 28.00),
        ('MEX AZUL', 38.00),
        ('MEX BLANCO', 89.00),
        ('MEX MAGENTA', 30.00),
        ('MEX NARANJA', 75.00),
        ('MEX NEGRO', 40.00),
        ('MEX OASISI VERDE', 30.00),
        ('MEX ROJO', 25.00),
        ('MON AMARILLO', 13.00),
        ('MON BLANCO', 0.00),
        ('MON NARANJA', 0.00),
        ('MON VERDE', 37.00),
        ('TORS AMARILLO', 18.60),
        ('TORS AZUL', 43.90),
        ('TORS BLANCO', 24.00),
        ('TORSOL 2.5', 44.70),
        ('VOL AMARILLO', 7.00),
        ('VOL AZUL', 12.00),
        ('VOL BLANCO', 4.00),
        ('VOL ROJO', 25.00),
        ('VOL VERDE', 0.00),
    ]
    
    for nombre, cantidad in materiales_sgii:
        if not Material.query.filter_by(nombre=nombre).first():
            db.session.add(Material(
                nombre=nombre,
                codigo=nombre,
                cantidad_disponible=cantidad,
                unidad='metros'
            ))
    
    db.session.commit()
    print(f"✅ 52 Materiales de SGII cargados con stock real")


# ======================== RUTAS API ========================

@app.route('/api/inicializar', methods=['POST'])
def inicializar_bd():
    db.create_all()
    inicializar_datos()
    cargar_materiales_sgii()
    return jsonify({"mensaje": "BD inicializada"}), 200


@app.route('/api/tipos-balon', methods=['GET'])
def get_tipos_balon():
    tipos = TipoBalon.query.order_by(TipoBalon.nombre).all()
    return jsonify([t.to_dict() for t in tipos])


@app.route('/api/operarios', methods=['GET'])
def get_operarios():
    ops = Operario.query.order_by(Operario.nombre).all()
    return jsonify([op.to_dict() for op in ops])


@app.route('/api/tareas', methods=['GET'])
def get_tareas():
    tareas = Tarea.query.order_by(Tarea.nombre).all()
    return jsonify([t.to_dict() for t in tareas])


@app.route('/api/materiales', methods=['GET'])
def get_materiales():
    """Retorna 52 materiales de SGII con stock actual"""
    materiales = Material.query.order_by(Material.nombre).all()
    return jsonify([m.to_dict() for m in materiales])


@app.route('/api/pedidos', methods=['GET', 'POST'])
def pedidos_route():
    if request.method == 'GET':
        peds = Pedido.query.order_by(Pedido.fecha_creacion.desc()).all()
        return jsonify([p.to_dict() for p in peds])

    # POST: CREAR PEDIDO CON MATERIALES MANUALES
    try:
        data = request.json
        
        nuevo_pedido = Pedido(
            numero_pedido=data.get('numero_pedido'),
            cliente=data.get('cliente'),
            tipo_balon_id=data.get('tipo_balon_id'),
            cantidad_balones=data.get('cantidad_balones', 0),
            fecha_entrega_solicitada=(
                datetime.fromisoformat(data['fecha_entrega_solicitada'])
                if data.get('fecha_entrega_solicitada') else None
            ),
            observaciones=data.get('observaciones', ''),
            estado='pendiente'
        )
        db.session.add(nuevo_pedido)
        db.session.flush()

        # Agregar materiales al pedido (TÚ ESPECIFICAS CANTIDAD)
        for mat_data in data.get('materiales', []):
            material = Material.query.get(mat_data['material_id'])
            if material:
                db.session.add(MaterialPedido(
                    pedido_id=nuevo_pedido.id,
                    material_id=material.id,
                    cantidad=mat_data['cantidad'],
                    observacion=mat_data.get('observacion', '')
                ))

        db.session.commit()
        return jsonify(nuevo_pedido.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/produccion', methods=['GET', 'POST'])
def produccion_route():
    if request.method == 'GET':
        registros = Produccion.query.order_by(Produccion.fecha.desc()).all()
        return jsonify([r.to_dict() for r in registros])

    # POST: REGISTRAR PRODUCCIÓN CON DESCUENTO MANUAL DE MATERIAL
    try:
        data = request.json

        operario = Operario.query.get(data.get('operario_id'))
        tarea = Tarea.query.get(data.get('tarea_id'))

        if not operario or not tarea:
            return jsonify({'error': 'Operario o tarea inválido'}), 400

        # DESCUENTO MANUAL: Tú especificas material_id y cantidad a descontar
        material_id = data.get('material_id')
        cantidad_material_descontada = float(data.get('cantidad_material_descontada', 0))
        
        # Validar stock si hay descuento
        if material_id and cantidad_material_descontada > 0:
            material = Material.query.get(material_id)
            if not material:
                return jsonify({'error': 'Material no encontrado'}), 400
            
            # Validar stock disponible
            if material.cantidad_disponible < cantidad_material_descontada:
                return jsonify({
                    'error': f'❌ Stock insuficiente de {material.nombre}. '
                             f'Disponible: {material.cantidad_disponible} m, '
                             f'Solicitado: {cantidad_material_descontada} m'
                }), 400
            
            # ✅ DESCONTAR AUTOMÁTICAMENTE
            material.cantidad_disponible -= cantidad_material_descontada

        nueva = Produccion(
            operario_id=operario.id,
            tarea_id=tarea.id,
            pedido_id=data.get('pedido_id') or None,
            material_id=material_id or None,
            cantidad_material_descontada=cantidad_material_descontada,
            cantidad_producida=data.get('cantidad_producida', 1),
            fecha=datetime.fromisoformat(data['fecha']) if data.get('fecha') else datetime.now(),
            observaciones=data.get('observaciones', '')
        )
        db.session.add(nueva)
        db.session.commit()
        
        respuesta = nueva.to_dict()
        if cantidad_material_descontada > 0:
            respuesta['mensaje'] = f"✅ {cantidad_material_descontada}m de {material.nombre} descontados"
        
        return jsonify(respuesta), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    """Dashboard con métricas útiles"""
    
    # Consumo total de materiales
    consumo_total = db.session.query(db.func.sum(Produccion.cantidad_material_descontada)).scalar() or 0
    
    # Materiales con bajo stock (< 50m)
    materiales_bajo_stock = Material.query.filter(Material.cantidad_disponible < 50).count()
    
    # Top 5 materiales más utilizados
    top_materiales = db.session.query(
        Material.nombre,
        db.func.sum(Produccion.cantidad_material_descontada)
    ).join(Produccion).group_by(Material.nombre).order_by(
        db.func.sum(Produccion.cantidad_material_descontada).desc()
    ).limit(5).all()
    
    # Distribución de producciones por tarea
    tareas_stats = db.session.query(
        Tarea.nombre,
        db.func.count(Produccion.id)
    ).join(Produccion).group_by(Tarea.nombre).all()
    
    return jsonify({
        'metricas': {
            'total_pedidos': Pedido.query.count(),
            'pedidos_pendientes': Pedido.query.filter_by(estado='pendiente').count(),
            'pedidos_en_proceso': Pedido.query.filter_by(estado='en_proceso').count(),
            'pedidos_completados': Pedido.query.filter_by(estado='completado').count(),
            'total_operarios': Operario.query.count(),
            'total_materiales': Material.query.count(),
            'total_tipos_balon': TipoBalon.query.count(),
            'total_registros_produccion': Produccion.query.count(),
            'consumo_material_total': round(float(consumo_total), 2),
            'materiales_bajo_stock': materiales_bajo_stock,
            'materiales_mas_utilizados': [
                {'material': m[0], 'cantidad': round(float(m[1]), 2)} for m in top_materiales
            ],
            'tareas_realizadas': [
                {'tarea': t[0], 'cantidad': t[1]} for t in tareas_stats
            ]
        }
    })


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        inicializar_datos()
        cargar_materiales_sgii()

    print("=" * 80)
    print("🏭  TRILAK - SISTEMA DE GESTIÓN DE PRODUCCIÓN")
    print("🌐  Servidor: http://127.0.0.1:5001")
    print("📦  Materiales: 52 reales de SGII con stock actual")
    print("👥  Operarios: 14 | 📋  Tareas: 13 | ⚽  Tipos Balón: 13")
    print("=" * 80)

    app.run(debug=True, port=5001)
