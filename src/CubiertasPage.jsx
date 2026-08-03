import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, AlertCircle, Minus, Plus as PlusIcon } from 'lucide-react';

const API_BASE_URL = 'http://127.0.0.1:5000/api';

const COLORS = {
  primary: '#256579',
  secondary: '#FF6B35',
  success: '#362a52',
  warning: '#FFC107',
  danger: '#f44336',
  light: '#f5f5f5',
  border: '#e0e0e0'
};

export default function CubiertasPage({ usuario }) {
  const [cubiertas, setCubiertas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [expandidaCubierta, setExpandidaCubierta] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  // Formulario para nueva cubierta
  const [formCubierta, setFormCubierta] = useState({
    codigo: '',
    nombre: '',
    color: '',
    tipo: '',
    proveedor: '',
    descripcion: '',
    unidad_medida: 'metros',
    cantidad_inicial: 0
  });

  // Formulario para movimiento
  const [formMovimiento, setFormMovimiento] = useState({
    tipo: 'entrada',
    cantidad: 0,
    referencia: '',
    descripcion: ''
  });

  const [cuberturaSeleccionada, setCuberturaSeleccionada] = useState(null);
  const [mostrarFormMovimiento, setMostrarFormMovimiento] = useState(false);

  // Cargar cubiertas al montar el componente
  useEffect(() => {
    cargarCubiertas();
  }, []);

  const cargarCubiertas = async () => {
    try {
      setCargando(true);
      setError('');
      const res = await fetch(`${API_BASE_URL}/cubiertas`);

      if (res.ok) {
        const data = await res.json();
        setCubiertas(data);
      } else {
        setError('No se pudieron cargar las cubiertas');
      }
    } catch (error) {
      setError('Error al conectar con el servidor: ' + error.message);
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const handleAgregarCubierta = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setExito('');

      if (!formCubierta.codigo || !formCubierta.nombre) {
        setError('Código y Nombre son obligatorios');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/cubiertas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: formCubierta.codigo,
          nombre: formCubierta.nombre,
          color: formCubierta.color,
          tipo: formCubierta.tipo,
          proveedor: formCubierta.proveedor,
          descripcion: formCubierta.descripcion,
          unidad_medida: formCubierta.unidad_medida,
          cantidad_inicial: formCubierta.cantidad_inicial
        })
      });

      if (res.ok) {
        const data = await res.json();
        setExito(`✅ Cubierta "${formCubierta.nombre}" creada exitosamente`);
        setFormCubierta({
          codigo: '',
          nombre: '',
          color: '',
          tipo: '',
          proveedor: '',
          descripcion: '',
          unidad_medida: 'metros',
          cantidad_inicial: 0
        });
        setMostrarFormulario(false);
        cargarCubiertas();
      } else {
        const error = await res.json();
        setError(error.error || 'Error al crear cubierta');
      }
    } catch (error) {
      setError('Error: ' + error.message);
    }
  };

  const handleRegistrarMovimiento = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setExito('');

      if (!formMovimiento.cantidad || formMovimiento.cantidad <= 0) {
        setError('La cantidad debe ser mayor a 0');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/cubiertas/${cuberturaSeleccionada.id}/movimiento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: formMovimiento.tipo,
          cantidad: parseFloat(formMovimiento.cantidad),
          referencia: formMovimiento.referencia,
          descripcion: formMovimiento.descripcion
        })
      });

      if (res.ok) {
        const data = await res.json();
        setExito(`✅ ${formMovimiento.tipo.toUpperCase()} registrada exitosamente`);
        setFormMovimiento({
          tipo: 'entrada',
          cantidad: 0,
          referencia: '',
          descripcion: ''
        });
        setMostrarFormMovimiento(false);
        cargarCubiertas();
      } else {
        const error = await res.json();
        setError(error.error || 'Error al registrar movimiento');
      }
    } catch (error) {
      setError('Error: ' + error.message);
    }
  };

  const handleEliminarCubierta = async (id) => {
    if (window.confirm('⚠️ ¿Está seguro de que desea eliminar esta cubierta?')) {
      try {
        setError('');
        const res = await fetch(`${API_BASE_URL}/cubiertas/${id}`, {
          method: 'DELETE'
        });

        if (res.ok) {
          setExito('✅ Cubierta eliminada');
          cargarCubiertas();
        } else {
          const error = await res.json();
          setError(error.error || 'No se pudo eliminar');
        }
      } catch (error) {
        setError('Error: ' + error.message);
      }
    }
  };

  // Filtrar cubiertas por búsqueda
  const cubertasFiltradas = cubiertas.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Calcular totales
  const stockTotal = cubiertas.reduce((sum, c) => sum + (c.stock_actual || 0), 0);
  const totalCubiertas = cubiertas.length;

  return (
    <div style={{ padding: '20px', backgroundColor: COLORS.light, minHeight: '100vh' }}>
      {/* MENSAJES DE ERROR Y ÉXITO */}
      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          color: COLORS.danger,
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            style={{
              marginLeft: 'auto',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {exito && (
        <div style={{
          backgroundColor: '#e8f5e9',
          color: COLORS.success,
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}>
          <span>{exito}</span>
          <button
            onClick={() => setExito('')}
            style={{
              marginLeft: 'auto',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* HEADER CON ESTADÍSTICAS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '25px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: `4px solid ${COLORS.primary}`
        }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Total de Cubiertas</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold', color: COLORS.primary }}>{totalCubiertas}</p>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: `4px solid ${COLORS.secondary}`
        }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Stock Total</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold', color: COLORS.secondary }}>
            {stockTotal.toFixed(1)} m
          </p>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: `4px solid ${COLORS.success}`
        }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Estado</p>
          <p style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.success }}>
            {cargando ? '⏳ Cargando...' : '✅ Sistema Activo'}
          </p>
        </div>
      </div>

      {/* BUSCADOR Y BOTÓN AGREGAR */}
      <div style={{
        display: 'flex',
        gap: '15px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="🔍 Buscar cubierta por nombre o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            flex: 1,
            minWidth: '250px',
            padding: '12px',
            borderRadius: '6px',
            border: `1px solid ${COLORS.border}`,
            fontSize: '14px'
          }}
        />

        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          style={{
            backgroundColor: mostrarFormulario ? COLORS.danger : COLORS.secondary,
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {mostrarFormulario ? '✕ Cancelar' : <Plus size={20} />}
          {mostrarFormulario ? 'Cancelar' : 'Agregar Cubierta'}
        </button>
      </div>

      {/* FORMULARIO PARA AGREGAR CUBIERTA */}
      {mostrarFormulario && (
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '25px',
          borderLeft: `5px solid ${COLORS.secondary}`
        }}>
          <h3 style={{ color: COLORS.primary, marginTop: 0, marginBottom: '20px' }}>
            ➕ Agregar Nueva Cubierta
          </h3>

          <form onSubmit={handleAgregarCubierta}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '15px',
              marginBottom: '15px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Código *
                </label>
                <input
                  type="text"
                  value={formCubierta.codigo}
                  onChange={(e) => setFormCubierta({ ...formCubierta, codigo: e.target.value })}
                  placeholder="Ej: COD-001"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formCubierta.nombre}
                  onChange={(e) => setFormCubierta({ ...formCubierta, nombre: e.target.value })}
                  placeholder="Ej: Cubierta Negra Premium"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Color
                </label>
                <input
                  type="text"
                  value={formCubierta.color}
                  onChange={(e) => setFormCubierta({ ...formCubierta, color: e.target.value })}
                  placeholder="Ej: Negro"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Tipo
                </label>
                <input
                  type="text"
                  value={formCubierta.tipo}
                  onChange={(e) => setFormCubierta({ ...formCubierta, tipo: e.target.value })}
                  placeholder="Ej: Carcasa Externa"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Proveedor
                </label>
                <input
                  type="text"
                  value={formCubierta.proveedor}
                  onChange={(e) => setFormCubierta({ ...formCubierta, proveedor: e.target.value })}
                  placeholder="Ej: Proveedor A"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Unidad de Medida
                </label>
                <select
                  value={formCubierta.unidad_medida}
                  onChange={(e) => setFormCubierta({ ...formCubierta, unidad_medida: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                >
                  <option value="metros">Metros</option>
                  <option value="kg">Kilogramos</option>
                  <option value="unidades">Unidades</option>
                  <option value="rollos">Rollos</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Cantidad Inicial
                </label>
                <input
                  type="number"
                  value={formCubierta.cantidad_inicial}
                  onChange={(e) => setFormCubierta({ ...formCubierta, cantidad_inicial: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                Descripción
              </label>
              <textarea
                value={formCubierta.descripcion}
                onChange={(e) => setFormCubierta({ ...formCubierta, descripcion: e.target.value })}
                placeholder="Notas adicionales..."
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: `1px solid ${COLORS.border}`,
                  boxSizing: 'border-box',
                  fontSize: '14px',
                  minHeight: '80px',
                  fontFamily: 'Arial'
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: '15px',
                backgroundColor: COLORS.success,
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              ✅ Guardar Cubierta
            </button>
          </form>
        </div>
      )}

      {/* LISTA DE CUBIERTAS */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          ⏳ Cargando cubiertas...
        </div>
      ) : cubertasFiltradas.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          textAlign: 'center',
          borderRadius: '8px',
          color: '#999'
        }}>
          {cubiertas.length === 0
            ? '📦 No hay cubiertas registradas. ¡Crea la primera!'
            : '🔍 No se encontraron cubiertas con esa búsqueda'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {cubertasFiltradas.map((cubierta) => (
            <div
              key={cubierta.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'hidden'
              }}
            >
              {/* ENCABEZADO DE CUBIERTA */}
              <div
                onClick={() => setExpandidaCubierta(expandidaCubierta === cubierta.id ? null : cubierta.id)}
                style={{
                  padding: '15px 20px',
                  backgroundColor: expandidaCubierta === cubierta.id ? COLORS.light : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: expandidaCubierta === cubierta.id ? `2px solid ${COLORS.primary}` : 'none'
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', color: COLORS.primary }}>
                    {cubierta.nombre}
                  </p>
                  <p style={{ fontSize: '12px', color: '#666', margin: '0' }}>
                    Código: {cubierta.codigo} | Color: {cubierta.color || '-'} | Tipo: {cubierta.tipo || '-'}
                  </p>
                </div>

                <div style={{
                  textAlign: 'right',
                  marginRight: '15px'
                }}>
                  <p style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: cubierta.stock_actual > 100 ? COLORS.success : cubierta.stock_actual > 0 ? COLORS.warning : COLORS.danger,
                    margin: '0'
                  }}>
                    {cubierta.stock_actual.toFixed(1)}
                  </p>
                  <p style={{ fontSize: '10px', color: '#999', margin: '2px 0 0 0' }}>
                    {cubierta.unidad_medida}
                  </p>
                </div>

                <ChevronDown
                  size={20}
                  style={{
                    transform: expandidaCubierta === cubierta.id ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s',
                    color: COLORS.primary
                  }}
                />
              </div>

              {/* DETALLES EXPANDIDOS */}
              {expandidaCubierta === cubierta.id && (
                <div style={{ padding: '20px', borderTop: `1px solid ${COLORS.border}` }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '15px',
                    marginBottom: '20px'
                  }}>
                    <div>
                      <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>Proveedor</p>
                      <p style={{ fontSize: '14px', margin: 0 }}>{cubierta.proveedor || '-'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>Unidad</p>
                      <p style={{ fontSize: '14px', margin: 0 }}>{cubierta.unidad_medida}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>Creado</p>
                      <p style={{ fontSize: '14px', margin: 0 }}>
                        {cubierta.fecha_creacion ? new Date(cubierta.fecha_creacion).toLocaleDateString() : '-'}
                      </p>
                    </div>
                  </div>

                  {cubierta.descripcion && (
                    <div style={{ marginBottom: '20px' }}>
                      <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>Descripción</p>
                      <p style={{ fontSize: '13px', margin: 0, color: '#333' }}>{cubierta.descripcion}</p>
                    </div>
                  )}

                  {/* BARRA DE STOCK */}
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '6px' }}>Stock Disponible</p>
                    <div style={{
                      width: '100%',
                      height: '30px',
                      backgroundColor: COLORS.light,
                      borderRadius: '6px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: `${Math.min((cubierta.stock_actual / 500) * 100, 100)}%`,
                        height: '100%',
                        backgroundColor: cubierta.stock_actual > 100 ? COLORS.success : cubierta.stock_actual > 0 ? COLORS.warning : COLORS.danger,
                        transition: 'width 0.3s'
                      }} />
                      <span style={{
                        position: 'absolute',
                        left: '10px',
                        fontWeight: 'bold',
                        color: 'white',
                        fontSize: '12px',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                      }}>
                        {cubierta.stock_actual.toFixed(1)} {cubierta.unidad_medida}
                      </span>
                    </div>
                  </div>

                  {/* BOTONES DE ACCIÓN */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={() => {
                        setCuberturaSeleccionada(cubierta);
                        setMostrarFormMovimiento(true);
                      }}
                      style={{
                        backgroundColor: COLORS.secondary,
                        color: 'white',
                        border: 'none',
                        padding: '10px 15px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px'
                      }}
                    >
                      <PlusIcon size={16} /> Registrar Movimiento
                    </button>

                    <button
                      onClick={() => handleEliminarCubierta(cubierta.id)}
                      style={{
                        backgroundColor: COLORS.danger,
                        color: 'white',
                        border: 'none',
                        padding: '10px 15px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px'
                      }}
                    >
                      <Trash2 size={16} /> Eliminar
                    </button>
                  </div>

                  {/* HISTORIAL DE MOVIMIENTOS */}
                  {cubierta.movimientos && cubierta.movimientos.length > 0 && (
                    <div>
                      <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '10px' }}>
                        📋 Últimos Movimientos ({cubierta.movimientos.length})
                      </p>
                      <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                        {cubierta.movimientos.slice().reverse().map((mov, idx) => (
                          <div
                            key={mov.id || idx}
                            style={{
                              padding: '10px',
                              backgroundColor: COLORS.light,
                              borderLeft: `4px solid ${mov.tipo === 'entrada' ? COLORS.success : COLORS.danger}`,
                              marginBottom: '8px',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 'bold' }}>
                                {mov.tipo === 'entrada' ? '➕ ENTRADA' : '➖ SALIDA'}
                              </span>
                              <span style={{ fontWeight: 'bold', color: mov.tipo === 'entrada' ? COLORS.success : COLORS.danger }}>
                                {mov.tipo === 'entrada' ? '+' : '-'}{mov.cantidad} {cubierta.unidad_medida}
                              </span>
                            </div>
                            <p style={{ margin: '4px 0', color: '#666' }}>
                              📅 {mov.fecha ? new Date(mov.fecha).toLocaleDateString() : '-'}
                            </p>
                            {mov.referencia && <p style={{ margin: '4px 0', color: '#666' }}>Ref: {mov.referencia}</p>}
                            {mov.descripcion && <p style={{ margin: '4px 0', color: '#666' }}>Desc: {mov.descripcion}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL PARA REGISTRAR MOVIMIENTO */}
      {mostrarFormMovimiento && cuberturaSeleccionada && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ color: COLORS.primary, marginTop: 0 }}>
              Registrar Movimiento
            </h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              {cuberturaSeleccionada.nombre} (Stock actual: {cuberturaSeleccionada.stock_actual} {cuberturaSeleccionada.unidad_medida})
            </p>

            <form onSubmit={handleRegistrarMovimiento}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Tipo de Movimiento
                </label>
                <select
                  value={formMovimiento.tipo}
                  onChange={(e) => setFormMovimiento({ ...formMovimiento, tipo: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                >
                  <option value="entrada">➕ ENTRADA (agregar stock)</option>
                  <option value="salida">➖ SALIDA (restar stock)</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Cantidad *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formMovimiento.cantidad}
                  onChange={(e) => setFormMovimiento({ ...formMovimiento, cantidad: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Referencia (Ej: Orden PED-001)
                </label>
                <input
                  type="text"
                  value={formMovimiento.referencia}
                  onChange={(e) => setFormMovimiento({ ...formMovimiento, referencia: e.target.value })}
                  placeholder="Orden, referencia, etc"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: COLORS.primary }}>
                  Descripción
                </label>
                <textarea
                  value={formMovimiento.descripcion}
                  onChange={(e) => setFormMovimiento({ ...formMovimiento, descripcion: e.target.value })}
                  placeholder="Notas sobre el movimiento..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${COLORS.border}`,
                    boxSizing: 'border-box',
                    fontSize: '14px',
                    minHeight: '80px',
                    fontFamily: 'Arial'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.success,
                    color: 'white',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✅ Guardar Movimiento
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarFormMovimiento(false);
                    setCuberturaSeleccionada(null);
                    setFormMovimiento({ tipo: 'entrada', cantidad: 0, referencia: '', descripcion: '' });
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#999',
                    color: 'white',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
