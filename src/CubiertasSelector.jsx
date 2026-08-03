import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://127.0.0.1:5000/api';

/**
 * CubiertasSelector.jsx
 * =======================
 * Componente React que integra TRILAK con SGII
 * Permite seleccionar cubiertas y registrar automáticamente salidas en SGII
 */

export default function CubiertasSelector({ 
  pedidoId, 
  onCubiertaSeleccionada,
  mostrarStock = true 
}) {
  const [cubiertas, setCubiertas] = useState([]);
  const [cubiertaSeleccionada, setCubiertaSeleccionada] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [cantidad, setCantidad] = useState(1);

  // Cargar cubiertas disponibles desde SGII via TRILAK
  useEffect(() => {
    cargarCubiertas();
  }, []);

  const cargarCubiertas = async () => {
    try {
      setCargando(true);
      setError('');
      
      const response = await fetch(`${API_BASE_URL}/cubiertas-disponibles`);
      
      if (!response.ok) {
        throw new Error('No se pudieron cargar las cubiertas');
      }
      
      const data = await response.json();
      setCubiertas(data);
      
    } catch (err) {
      setError(`Error cargando cubiertas: ${err.message}`);
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  const handleSeleccionCubierta = (e) => {
    const materialId = e.target.value;
    setCubiertaSeleccionada(materialId);
    
    // Encontrar la cubierta seleccionada
    const cubierta = cubiertas.find(c => c.id === materialId);
    if (cubierta && onCubiertaSeleccionada) {
      onCubiertaSeleccionada({
        id: cubierta.id,
        nombre: cubierta.nombre,
        codigo: cubierta.codigo,
        stock: cubierta.stock
      });
    }
  };

  const handleRegistrarSalida = async () => {
    if (!cubiertaSeleccionada) {
      setError('Por favor selecciona una cubierta');
      return;
    }

    if (cantidad <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }

    try {
      setCargando(true);
      setError('');

      // Llamar al endpoint para registrar salida en SGII
      const response = await fetch(`${API_BASE_URL}/registrar-salida-sgii`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          material_id: cubiertaSeleccionada,
          cantidad: cantidad,
          numero_pedido: `Pedido #${pedidoId}`,
          descripcion: 'Descuento automático desde TRILAK'
        })
      });

      const data = await response.json();

      if (data.success) {
        setError('');
        return true; // Éxito
      } else {
        setError(data.error || 'Error registrando salida');
        return false;
      }

    } catch (err) {
      setError(`Error: ${err.message}`);
      return false;
    } finally {
      setCargando(false);
    }
  };

  // Obtener cubierta seleccionada
  const cubiertaActual = cubiertas.find(c => c.id === cubiertaSeleccionada);
  const stockSuficiente = !cubiertaActual || cubiertaActual.stock >= cantidad;

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      marginBottom: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{
        fontSize: '18px',
        color: '#003B6F',
        marginBottom: '15px',
        fontWeight: 'bold'
      }}>
        🧵 Seleccionar Cubierta (Material)
      </h3>

      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#d32f2f',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '15px',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {cargando && (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: '#666'
        }}>
          ⏳ Cargando cubiertas...
        </div>
      )}

      {!cargando && cubiertas.length > 0 && (
        <>
          {/* Selector de Cubierta */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 'bold',
              marginBottom: '8px',
              color: '#333'
            }}>
              Material / Cubierta *
            </label>
            <select
              value={cubiertaSeleccionada}
              onChange={handleSeleccionCubierta}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">-- Seleccionar Material --</option>
              {cubiertas.map((cubierta) => (
                <option key={cubierta.id} value={cubierta.id}>
                  {cubierta.nombre} ({cubierta.codigo})
                  {mostrarStock && ` - Stock: ${cubierta.stock} ${cubierta.unidad}`}
                </option>
              ))}
            </select>
          </div>

          {/* Información de Stock */}
          {cubiertaActual && mostrarStock && (
            <div style={{
              backgroundColor: cubiertaActual.stock > 10 ? '#e8f5e9' : '#fff3e0',
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '15px',
              fontSize: '14px'
            }}>
              <p style={{ margin: '0 0 5px 0' }}>
                <strong>Stock Disponible:</strong> {cubiertaActual.stock.toFixed(1)} {cubiertaActual.unidad}
              </p>
              {cubiertaActual.stock < 5 && (
                <p style={{ margin: '5px 0 0 0', color: '#ff6f00' }}>
                  ⚠️ Stock bajo - considera realizar un pedido
                </p>
              )}
            </div>
          )}

          {/* Campo de Cantidad */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 'bold',
              marginBottom: '8px',
              color: '#333'
            }}>
              Cantidad a Descargar ({cubiertaActual?.unidad || 'm'}) *
            </label>
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={cantidad}
              onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: `1px solid ${stockSuficiente ? '#ddd' : '#f44336'}`,
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {!stockSuficiente && (
            <div style={{
              backgroundColor: '#ffebee',
              color: '#d32f2f',
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '15px',
              fontSize: '14px'
            }}>
              ⚠️ Stock insuficiente (disponible: {cubiertaActual.stock.toFixed(1)} {cubiertaActual.unidad})
            </div>
          )}

          {/* Botón Registrar */}
          <button
            onClick={handleRegistrarSalida}
            disabled={!cubiertaSeleccionada || !stockSuficiente || cargando}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: cubiertaSeleccionada && stockSuficiente ? '#4CAF50' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: cubiertaSeleccionada && stockSuficiente ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '16px',
              transition: 'background-color 0.3s'
            }}
            onMouseOver={(e) => {
              if (cubiertaSeleccionada && stockSuficiente) {
                e.target.style.backgroundColor = '#45a049';
              }
            }}
            onMouseOut={(e) => {
              if (cubiertaSeleccionada && stockSuficiente) {
                e.target.style.backgroundColor = '#4CAF50';
              }
            }}
          >
            {cargando ? '⏳ Registrando...' : '✅ Registrar Descuento en SGII'}
          </button>
        </>
      )}

      {!cargando && cubiertas.length === 0 && !error && (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: '#999'
        }}>
          ⚠️ No hay cubiertas disponibles
          <br />
          <button
            onClick={cargarCubiertas}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#003B6F',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reintentar Carga
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook personalizado para usar en componentes
 * 
 * Uso:
 * const { cubiertas, registrarSalida, cargando } = useCubiertas('usuario', 'contraseña');
 */
export function useCubiertas(usuarioSGII, contraseniaSGII) {
  const [cubiertas, setCubiertas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setCargando(true);
      const response = await fetch(`${API_BASE_URL}/cubiertas-disponibles`);
      const data = await response.json();
      setCubiertas(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const registrarSalida = async (materialId, cantidad, referencia) => {
    try {
      const response = await fetch(`${API_BASE_URL}/registrar-salida-sgii`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: materialId, cantidad, referencia })
      });
      return (await response.json()).success;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return { cubiertas, registrarSalida, cargando, error, recargar: cargar };
}
