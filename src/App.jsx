import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://127.0.0.1:5002/api' 
  : '/api';

const COLORS = {
  primary: '#164d63',
  secondary: '#FF6B35',
  success: '#29cac2',
  warning: '#FFC107',
  danger: '#e74c3c',
  light: '#f5f5f5',
  border: '#e0e0e0'
};

// ── Helper fetchApi: incluye cookies, maneja 401 redirigiendo a login ────
const fetchApi = async (path, options = {}) => {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res;
};

// ── Pantalla de Login ────────────────────────────────────────────────────
const LoginView = ({ onLoginExitoso }) => {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await fetchApi('/login', {
        method: 'POST',
        body: JSON.stringify({ usuario, contrasena })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onLoginExitoso(data.usuario);
      } else {
        setError(data.error || 'Error al iniciar sesión');
      }
    } catch (err) {
      setError('No se pudo conectar con el servidor');
    }
    setCargando(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: COLORS.primary, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', width: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '32px', color: COLORS.primary, margin: '0 0 5px 0' }}>TRILAK</h1>
          <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>Sistema de Gestión de Producción</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px', fontWeight: 'bold' }}>Usuario</label>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
            autoComplete="username"
            style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', fontSize: '14px' }}
          />

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px', fontWeight: 'bold' }}>Contraseña</label>
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete="current-password"
            style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', fontSize: '14px' }}
          />

          {error && (
            <div style={{ backgroundColor: '#ffebee', color: COLORS.danger, padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando || !usuario || !contrasena}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: cargando ? '#999' : COLORS.secondary,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: cargando ? 'wait' : 'pointer',
              fontWeight: 'bold',
              fontSize: '15px'
            }}
          >
            {cargando ? '⏳ Ingresando...' : '🔐 Ingresar'}
          </button>
        </form>

        <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '20px', marginBottom: 0 }}>
          © 2026 TRILAK
        </p>
      </div>
    </div>
  );
};

// ── App principal ────────────────────────────────────────────────────────
export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [tiposBalon, setTiposBalon] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [produccion, setProduccion] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Al montar, verifica si ya hay sesión activa (cookie válida)
  useEffect(() => {
    const verificarSesion = async () => {
      try {
        const res = await fetchApi('/me');
        if (res.ok) {
          const data = await res.json();
          setUsuario(data);
          // Ajustar vista inicial según rol
          if (data.rol === 'tablet') setCurrentView('produccion');
        }
      } catch (e) {
        // Sin sesión, se queda en login
      }
      setVerificandoSesion(false);
    };
    verificarSesion();
  }, []);

  // Cargar datos cuando el usuario esté logueado
  useEffect(() => {
    if (usuario) cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      try { await fetchApi('/inicializar', { method: 'POST' }); } catch (e) {}

      const cargar = async (path, setter) => {
        try {
          const res = await fetchApi(path);
          if (res.status === 401) {
            // Sesión expirada
            setUsuario(null);
            return;
          }
          if (res.ok) setter(await res.json());
        } catch (e) { console.error(e); }
      };

      await Promise.all([
        cargar('/tipos-balon', setTiposBalon),
        cargar('/operarios', setOperarios),
        cargar('/materiales', setMateriales),
        cargar('/pedidos', setPedidos),
        cargar('/dashboard', setMetricas),
        cargar('/tareas', setTareas),
        cargar('/produccion', setProduccion),
      ]);
    } catch (error) {
      console.error('Error:', error);
    }
    setCargando(false);
  };

  const cerrarSesion = async () => {
    if (!window.confirm('¿Cerrar sesión?')) return;
    try { await fetchApi('/logout', { method: 'POST' }); } catch (e) {}
    setUsuario(null);
    setCurrentView('dashboard');
  };

  const exportarExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const resumen = [
        ['DASHBOARD PRODUCCIÓN - TRILAK'],
        [`Generado: ${new Date().toLocaleDateString('es-CO')}`],
        [''],
        ['Total Pedidos:', metricas?.metricas?.total_pedidos || 0],
        ['Total Operarios:', metricas?.metricas?.total_operarios || 0],
        ['Total Materiales:', metricas?.metricas?.total_materiales || 0],
        ['Tipos de Balón:', metricas?.metricas?.total_tipos_balon || 0],
        ['Calidad:', (metricas?.metricas?.calidad ?? null) === null ? 'Sin datos' : metricas.metricas.calidad, metricas?.metricas?.calidad != null ? '%' : ''],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumen);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

      const op = [['OPERARIO', 'ESTADO'], ...operarios.map(o => [o.nombre, o.estado])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(op), 'Operarios');

      const ped = [
        ['PEDIDO', 'CLIENTE', 'ESTADO', 'FECHA'],
        ...pedidos.map(p => [p.numero_pedido, p.cliente, p.estado, p.fecha_creacion])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ped), 'Pedidos');

      const prodData = [['FECHA', 'OPERARIO', 'TAREA', 'CANTIDAD']];
      produccion.forEach(p => prodData.push([new Date(p.fecha).toLocaleDateString('es-CO'), p.operario_nombre, p.tarea_nombre, p.cantidad]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodData), 'Producción');

      XLSX.writeFile(wb, `Dashboard_TRILAK_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}.xlsx`);
      alert('✅ Excel descargado');
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  };

  const Card = ({ titulo, valor, color }) => (
    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', borderLeft: `5px solid ${color}`, textAlign: 'center' }}>
      <p style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>{titulo}</p>
      <p style={{ fontSize: '36px', fontWeight: 'bold', color: color, margin: 0 }}>{valor}</p>
    </div>
  );

  // ── DASHBOARD ───────────────────────────────────────────────────────────
  const DashboardView = () => (
    <div style={{ padding: '30px' }}>
      <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📊 Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <Card titulo="Total Pedidos" valor={metricas?.metricas?.total_pedidos || 0} color={COLORS.primary} />
        <Card titulo="Total Operarios" valor={metricas?.metricas?.total_operarios || 0} color={COLORS.secondary} />
        <Card titulo="Total Materiales" valor={metricas?.metricas?.total_materiales || 0} color={COLORS.success} />
        <Card titulo="Tipos de Balón" valor={metricas?.metricas?.total_tipos_balon || 0} color={COLORS.warning} />
        <Card
          titulo="Calidad (buenas/total)"
          valor={metricas?.metricas?.calidad != null ? `${metricas.metricas.calidad}%` : 'Sin datos'}
          color={COLORS.success}
        />
      </div>

      <button onClick={exportarExcel} style={{ padding: '12px 20px', backgroundColor: COLORS.primary, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '20px' }}>
        📊 Descargar Excel
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '30px' }}>
        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.success}` }}>
          <h3 style={{ color: COLORS.primary, marginBottom: '10px' }}>🏆 Top Operarios Más Productivos</h3>
          {metricas?.metricas?.top_operarios?.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {metricas.metricas.top_operarios.map((op, i) => (
                <li key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{i+1}. {op.nombre}</span>
                  <span style={{ fontWeight: 'bold', color: COLORS.primary }}>{op.total_unidades} und.</span>
                </li>
              ))}
            </ul>
          ) : <p style={{ fontSize: '13px', color: '#999' }}>Aún no hay suficientes datos.</p>}
        </div>

        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.danger}` }}>
          <h3 style={{ color: COLORS.primary, marginBottom: '10px' }}>⚠️ Alertas de Merma (Top Defectos)</h3>
          {metricas?.metricas?.top_merma?.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {metricas.metricas.top_merma.map((op, i) => (
                <li key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{i+1}. {op.nombre}</span>
                  <span style={{ fontWeight: 'bold', color: COLORS.danger }}>{op.total_defectos} defectos</span>
                </li>
              ))}
            </ul>
          ) : <p style={{ fontSize: '13px', color: '#999' }}>Sin registros de defectos.</p>}
        </div>
      </div>
    </div>
  );

  // ── ANALÍTICA OPERARIO ──────────────────────────────────────────────────
  const AnaliticaOperarioView = ({ operarioId, onBack }) => {
    const [periodo, setPeriodo] = useState('mensual');
    const [analitica, setAnalitica] = useState(null);
    const [cargandoAnalitica, setCargandoAnalitica] = useState(true);

    useEffect(() => {
      const cargarAnalitica = async () => {
        setCargandoAnalitica(true);
        try {
          const res = await fetchApi(`/operarios/${operarioId}/analitica?periodo=${periodo}`);
          if (res.ok) setAnalitica(await res.json());
          else setAnalitica(null);
        } catch (e) { console.error(e); }
        setCargandoAnalitica(false);
      };
      cargarAnalitica();
    }, [operarioId, periodo]);

    const descargarReporte = async (formato) => {
      try {
        const res = await fetchApi(`/reportes/operarios/${operarioId}?formato=${formato}`, {
          method: 'GET',
          body: JSON.stringify(analitica)
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `reporte.${formato === 'excel' ? 'xlsx' : 'pdf'}`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
      } catch (e) { alert('Error al descargar: ' + e.message); }
    };

    if (cargandoAnalitica) return <div style={{ padding: '20px', textAlign: 'center' }}>⏳ Cargando analítica...</div>;
    if (!analitica) return <div style={{ padding: '20px', textAlign: 'center' }}>Sin datos para este periodo</div>;

    const { operario, metricas, grafica_proactividad, detalle_pedidos } = analitica;

    return (
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '22px', color: COLORS.primary, margin: 0 }}>📊 Analítica de {operario.nombre}</h2>
          <button onClick={onBack} style={{ padding: '6px 12px', backgroundColor: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Volver</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['diario', 'semanal', 'mensual'].map(p => (
            <button key={p} onClick={() => setPeriodo(p)} style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${COLORS.primary}`, backgroundColor: periodo === p ? COLORS.primary : 'white', color: periodo === p ? 'white' : COLORS.primary, cursor: 'pointer' }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button onClick={() => descargarReporte('excel')} style={{ padding: '8px 12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📊 Excel</button>
            <button onClick={() => descargarReporte('pdf')} style={{ padding: '8px 12px', backgroundColor: COLORS.danger, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📄 PDF</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px', marginBottom: '30px' }}>
          <div style={{ padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9', textAlign: 'center', borderTop: `4px solid ${COLORS.primary}` }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>Unidades Totales</p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: COLORS.primary }}>{metricas.total_unidades}</p>
          </div>
          <div style={{ padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9', textAlign: 'center', borderTop: `4px solid ${COLORS.success}` }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>Índice Calidad</p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: COLORS.success }}>{metricas.indice_calidad_porcentaje}%</p>
          </div>
          <div style={{ padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9', textAlign: 'center', borderTop: `4px solid ${COLORS.warning}` }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>Eficiencia</p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: COLORS.warning }}>{metricas.eficiencia_porcentaje}%</p>
          </div>
          <div style={{ padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9', textAlign: 'center', borderTop: `4px solid ${COLORS.secondary}` }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>Productividad</p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: COLORS.secondary }}>{metricas.productividad_und_hora} und/h</p>
          </div>
        </div>

        <h3 style={{ marginBottom: '15px' }}>📈 Proactividad vs Tiempo</h3>
        {grafica_proactividad?.length > 0 ? (
          <div style={{ height: '250px', marginBottom: '30px', padding: '10px', border: `1px solid ${COLORS.border}`, borderRadius: '6px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafica_proactividad}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="proactividad" stroke={COLORS.secondary} strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p style={{ color: '#999', marginBottom: '30px' }}>No hay datos suficientes para graficar.</p>}

        <h3 style={{ marginBottom: '15px' }}>📋 Detalle por Pedido</h3>
        {detalle_pedidos?.length > 0 ? (
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead style={{ backgroundColor: '#f4f4f4' }}>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Pedido</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Totales</th>
                  <th style={{ padding: '8px', textAlign: 'center', color: COLORS.success }}>Buenas</th>
                  <th style={{ padding: '8px', textAlign: 'center', color: COLORS.danger }}>Defectuosas</th>
                </tr>
              </thead>
              <tbody>
                {detalle_pedidos.map(p => (
                  <tr key={p.numero} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.numero}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{p.total_unidades}</td>
                    <td style={{ padding: '8px', textAlign: 'center', color: COLORS.success }}>{p.buenas}</td>
                    <td style={{ padding: '8px', textAlign: 'center', color: COLORS.danger }}>{p.defectuosas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{ color: '#999' }}>Sin pedidos asociados.</p>}
      </div>
    );
  };

  // ── PEDIDOS ─────────────────────────────────────────────────────────────
  const PedidosView = () => {
    const [formData, setFormData] = useState({
      cliente: '',
      fecha_entrega_solicitada: '',
      observaciones: '',
      imagenes: [],
      items: [{ tipo_balon_id: '', cantidad: 1, material_id: '' }]
    });
    const LIMITE_DETALLES = 500;
    const FORMATOS_IMAGEN_VALIDOS = ['image/png', 'image/jpeg'];
    const [alertaStock, setAlertaStock] = useState([]);

    const crearPedido = async () => {
      if (!formData.cliente || !formData.items[0].tipo_balon_id) {
        alert('Completa los campos requeridos');
        return;
      }
      try {
        const res = await fetchApi('/pedidos', { method: 'POST', body: JSON.stringify(formData) });
        const data = await res.json();
        if (res.ok) {
          if (data.alertas_stock?.length > 0) setAlertaStock(data.alertas_stock);
          alert(data.advertencias?.length > 0 ? '✅ Pedido creado, con avisos:\n' + data.advertencias.join('\n') : '✅ Pedido creado');
          await cargarDatos();
          setFormData({ cliente: '', fecha_entrega_solicitada: '', observaciones: '', imagenes: [], items: [{ tipo_balon_id: '', cantidad: 1, material_id: '' }] });
        } else {
          alert('❌ ' + (data.error || 'No se pudo crear'));
        }
      } catch (error) { alert('❌ Error: ' + error.message); }
    };

    const actualizarItem = (index, campo, valor) => {
      const newItems = [...formData.items];
      newItems[index] = { ...newItems[index], [campo]: valor };
      setFormData({ ...formData, items: newItems });
    };
    const agregarItem = () => setFormData({ ...formData, items: [...formData.items, { tipo_balon_id: '', cantidad: 1, material_id: '' }] });
    const quitarItem = (i) => setFormData({ ...formData, items: formData.items.filter((_, idx) => idx !== i) });

    const agregarImagenes = (fileList) => {
      Array.from(fileList).forEach(file => {
        if (!FORMATOS_IMAGEN_VALIDOS.includes(file.type)) return alert(`"${file.name}" no es PNG ni JPG`);
        const reader = new FileReader();
        reader.onload = () => {
          const contenido_base64 = reader.result.split(',')[1];
          setFormData(prev => ({ ...prev, imagenes: [...prev.imagenes, { nombre_archivo: file.name, tipo_mime: file.type, contenido_base64 }] }));
        };
        reader.readAsDataURL(file);
      });
    };
    const quitarImagen = (i) => setFormData({ ...formData, imagenes: formData.imagenes.filter((_, idx) => idx !== i) });

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📋 Pedidos</h1>

        {alertaStock.length > 0 && (
          <div style={{ backgroundColor: '#fff3cd', border: `2px solid ${COLORS.danger}`, borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', position: 'relative' }}>
            <button onClick={() => setAlertaStock([])} style={{ position: 'absolute', top: '10px', right: '12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', color: COLORS.danger }}>✕</button>
            <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: COLORS.danger, fontSize: '16px' }}>⚠️ Stock crítico de material</p>
            {alertaStock.map((a, i) => (
              <p key={i} style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#664d03' }}>
                <strong>{a.material_nombre}</strong>: quedan {a.cantidad_disponible} {a.unidad} (umbral: {a.umbral_minimo}).
              </p>
            ))}
          </div>
        )}

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '20px' }}>Crear Nuevo Pedido</h2>
          <input type="text" placeholder="Cliente" value={formData.cliente} onChange={(e) => setFormData({ ...formData, cliente: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
          <input type="date" value={formData.fecha_entrega_solicitada} onChange={(e) => setFormData({ ...formData, fecha_entrega_solicitada: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />

          {formData.items.map((item, index) => (
            <div key={index} style={{ border: `1px solid ${COLORS.border}`, borderRadius: '4px', padding: '10px', marginBottom: '10px', position: 'relative' }}>
              {formData.items.length > 1 && (
                <button onClick={() => quitarItem(index)} style={{ position: 'absolute', top: '6px', right: '6px', border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>✕</button>
              )}
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Tipo #{index + 1}</p>
              <select value={item.tipo_balon_id} onChange={(e) => actualizarItem(index, 'tipo_balon_id', e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                <option value="">-- Tipo de Balón --</option>
                {tiposBalon.map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
              </select>
              <select value={item.material_id} onChange={(e) => actualizarItem(index, 'material_id', e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                <option value="">-- Material --</option>
                {materiales.map(m => (<option key={m.id} value={m.id}>{m.nombre} ({m.cantidad_disponible} {m.unidad})</option>))}
              </select>
              <input type="number" min="1" value={item.cantidad} onChange={(e) => actualizarItem(index, 'cantidad', parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
            </div>
          ))}

          <button onClick={agregarItem} style={{ width: '100%', padding: '10px', marginBottom: '15px', backgroundColor: 'white', color: COLORS.primary, border: `1px dashed ${COLORS.primary}`, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>➕ Agregar otro tipo</button>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Detalles del pedido</label>
          <textarea value={formData.observaciones} onChange={(e) => { if (e.target.value.length <= LIMITE_DETALLES) setFormData({ ...formData, observaciones: e.target.value }); }} rows={4} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          <p style={{ textAlign: 'right', fontSize: '12px', margin: '4px 0 15px 0', color: formData.observaciones.length >= LIMITE_DETALLES ? COLORS.danger : '#999' }}>{formData.observaciones.length}/{LIMITE_DETALLES}</p>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Imágenes (PNG/JPG)</label>
          <input type="file" accept="image/png, image/jpeg" multiple onChange={(e) => { agregarImagenes(e.target.files); e.target.value = ''; }} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
          {formData.imagenes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
              {formData.imagenes.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: '80px' }}>
                  <img src={`data:${img.tipo_mime};base64,${img.contenido_base64}`} alt={img.nombre_archivo} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${COLORS.border}` }} />
                  <button onClick={() => quitarImagen(i)} style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', backgroundColor: COLORS.danger, color: 'white', cursor: 'pointer', fontSize: '12px', lineHeight: '20px', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <button onClick={crearPedido} style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅ Crear Pedido</button>
        </div>

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>Pedidos ({pedidos.length})</h2>
        {pedidos.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {pedidos.map(p => (
              <div key={p.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.secondary}` }}>
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{p.numero_pedido}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>Cliente:</strong> {p.cliente}</p>
                {p.balones?.length > 0 && (
                  <ul style={{ margin: '4px 0 5px 0', paddingLeft: '18px' }}>
                    {p.balones.map(b => (<li key={b.id} style={{ fontSize: '13px', color: '#666' }}>{b.tipo_balon_nombre}: {b.cantidad}</li>))}
                  </ul>
                )}
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}><strong>Estado:</strong> {p.estado}</p>
                {p.imagenes?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {p.imagenes.map(img => (
                      <img key={img.id} src={`${API_BASE_URL}/pedidos/${p.id}/imagenes/${img.id}`} alt={img.nombre_archivo} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${COLORS.border}` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (<p style={{ fontSize: '16px', color: '#999' }}>📭 No hay pedidos registrados</p>)}
      </div>
    );
  };

  // ── OPERARIOS ───────────────────────────────────────────────────────────
  const OperariosView = () => {
    const [operarioSeleccionado, setOperarioSeleccionado] = useState(null);
    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>
          👥 Operarios ({operarios.length}) {operarioSeleccionado && "— Analítica Individual"}
        </h1>
        {!operarioSeleccionado ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {operarios.map(op => (
              <button key={op.id} onClick={() => setOperarioSeleccionado(op.id)} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.primary}`, border: '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s' }}>
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{op.nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}><strong>Estado:</strong> {op.estado}</p>
              </button>
            ))}
          </div>
        ) : (
          <AnaliticaOperarioView operarioId={operarioSeleccionado} onBack={() => setOperarioSeleccionado(null)} />
        )}
      </div>
    );
  };

  // ── MATERIALES ──────────────────────────────────────────────────────────
  const MaterialesView = () => {
    const [editandoId, setEditandoId] = useState(null);
    const [nuevoUmbral, setNuevoUmbral] = useState('');
    const esAdmin = usuario?.rol === 'admin';

    const guardarUmbral = async (materialId) => {
      const valor = parseFloat(nuevoUmbral);
      if (isNaN(valor) || valor < 0) return alert('Ingresa un número válido');
      try {
        const res = await fetchApi(`/materiales/${materialId}/umbral`, { method: 'PUT', body: JSON.stringify({ umbral_minimo: valor }) });
        if (res.ok) { await cargarDatos(); setEditandoId(null); }
        else alert('❌ Error al actualizar');
      } catch (error) { alert('❌ Error: ' + error.message); }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📦 Inventario ({materiales.length})</h1>
        {materiales.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {materiales.map(mat => {
              const umbral = mat.umbral_minimo ?? 50;
              const critico = mat.cantidad_disponible < umbral;
              return (
                <div key={mat.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${critico ? COLORS.danger : COLORS.success}` }}>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{mat.nombre}</p>
                  <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>Stock:</strong> {mat.cantidad_disponible} {mat.unidad}</p>
                  {editandoId === mat.id ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                      <input type="number" min="0" value={nuevoUmbral} onChange={(e) => setNuevoUmbral(e.target.value)} style={{ width: '80px', padding: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}` }} />
                      <button onClick={() => guardarUmbral(mat.id)} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.success, color: 'white', cursor: 'pointer' }}>Guardar</button>
                      <button onClick={() => setEditandoId(null)} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#eee', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#999', margin: '0 0 5px 0' }}>
                      Umbral: {umbral} {mat.unidad}
                      {esAdmin && <button onClick={() => { setEditandoId(mat.id); setNuevoUmbral(String(umbral)); }} style={{ border: 'none', background: 'transparent', color: COLORS.primary, cursor: 'pointer', textDecoration: 'underline', fontSize: '12px', marginLeft: '6px' }}>editar</button>}
                    </p>
                  )}
                  {critico && <p style={{ fontSize: '12px', color: COLORS.danger, fontWeight: 'bold', margin: 0 }}>⚠️ Stock crítico</p>}
                </div>
              );
            })}
          </div>
        ) : (<p style={{ fontSize: '16px', color: '#999' }}>No hay materiales</p>)}
      </div>
    );
  };

  // ── TIPOS BALÓN ─────────────────────────────────────────────────────────
  const TiposView = () => {
    const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const COLOR_SEMAFORO = { verde: COLORS.success, amarillo: COLORS.warning, rojo: COLORS.danger };

    const seleccionarTipo = async (tipo) => {
      if (tipoSeleccionado?.id === tipo.id) { setTipoSeleccionado(null); setDetalle(null); return; }
      setTipoSeleccionado(tipo); setDetalle(null); setCargandoDetalle(true);
      try {
        const res = await fetchApi(`/tipos-balon/${tipo.id}/metricas`);
        if (res.ok) setDetalle(await res.json());
      } catch (e) {} finally { setCargandoDetalle(false); }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '20px' }}>⚽ Tipos de Balones ({tiposBalon.length})</h1>
        {tiposBalon.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {tiposBalon.map(tipo => {
              const colorSemaforo = tipo.metricas?.semaforo ? COLOR_SEMAFORO[tipo.metricas.semaforo] : COLORS.border;
              return (
                <button key={tipo.id} onClick={() => seleccionarTipo(tipo)} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: `1px solid ${COLORS.border}`, borderLeft: `6px solid ${colorSemaforo}`, textAlign: 'left', cursor: 'pointer', font: 'inherit', display: 'block', width: '100%' }}>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 8px 0' }}>{tipo.nombre}</p>
                  {tipo.metricas && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Stock: <strong>{tipo.metricas.stock_actual ?? 0}</strong> · Pendientes: <strong>{tipo.metricas.pendientes ?? 0}</strong></p>}
                </button>
              );
            })}
          </div>
        ) : <p style={{ fontSize: '16px', color: '#999' }}>No hay tipos</p>}

        {tipoSeleccionado && (
          <div onClick={() => { setTipoSeleccionado(null); setDetalle(null); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto', zIndex: 1000 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', maxWidth: '700px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontSize: '20px', color: COLORS.primary, margin: 0 }}>{tipoSeleccionado.nombre}</h2>
                <button onClick={() => { setTipoSeleccionado(null); setDetalle(null); }} style={{ border: 'none', background: 'transparent', fontSize: '22px', cursor: 'pointer', color: '#999' }}>✖</button>
              </div>
              {cargandoDetalle && <p style={{ color: '#999' }}>Cargando...</p>}
              {detalle && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Fabricadas</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.primary }}>{detalle.metricas.fabricadas}</p></div>
                    <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Defectuosas</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.danger }}>{detalle.metricas.defectuosas}</p></div>
                    <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Entregadas</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.primary }}>{detalle.metricas.entregadas}</p></div>
                    <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Pendientes</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.warning }}>{detalle.metricas.pendientes}</p></div>
                  </div>
                  <h3 style={{ fontSize: '15px', color: COLORS.primary, marginBottom: '10px' }}>📦 Trazabilidad ({detalle.lotes.length})</h3>
                  {detalle.lotes.length > 0 ? (
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead><tr style={{ textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}><th style={{ padding: '6px' }}>Fecha</th><th style={{ padding: '6px' }}>Operario</th><th style={{ padding: '6px' }}>Buenas</th><th style={{ padding: '6px' }}>Defectuosas</th></tr></thead>
                        <tbody>{detalle.lotes.map(l => (<tr key={l.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}><td style={{ padding: '6px' }}>{new Date(l.fecha).toLocaleDateString('es-CO')}</td><td style={{ padding: '6px' }}>{l.operario_nombre}</td><td style={{ padding: '6px', color: COLORS.success }}>{l.unidades_buenas}</td><td style={{ padding: '6px', color: (l.unidades_defectuosas || 0) > 0 ? COLORS.danger : '#999' }}>{l.unidades_defectuosas}</td></tr>))}</tbody>
                      </table>
                    </div>
                  ) : (<p style={{ fontSize: '13px', color: '#999' }}>Sin producción registrada.</p>)}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── PRODUCCIÓN ──────────────────────────────────────────────────────────
  const ProduccionView = () => {
    const STORAGE_KEY = 'trilak_sesiones_produccion';
    const sesionVacia = () => ({
      tarea_id: '', pedido_id: '', tipo_balon_id: '',
      complejidad_estilo: '32 cascos',
      unidades_buenas: 1, unidades_defectuosas: 0,
      fecha: new Date().toISOString().slice(0, 10),
      observaciones: '',
      horaInicioCrono: null, horaFinCrono: null, cronometroActivo: false
    });

    const [sesiones, setSesiones] = useState(() => {
      try { const g = localStorage.getItem(STORAGE_KEY); return g ? JSON.parse(g) : {}; } catch { return {}; }
    });
    const [operarioParaAgregar, setOperarioParaAgregar] = useState('');
    const [, setTick] = useState(0);

    useEffect(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sesiones)); } catch {}
    }, [sesiones]);

    useEffect(() => {
      const hayActivos = Object.values(sesiones).some(s => s.cronometroActivo);
      if (!hayActivos) return;
      const i = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(i);
    }, [sesiones]);

    const formatearTiempo = (totalSegundos) => {
      const h = Math.floor(totalSegundos / 3600);
      const m = Math.floor((totalSegundos % 3600) / 60);
      const s = totalSegundos % 60;
      return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const segundosDeSesion = (s) => {
      if (s.cronometroActivo && s.horaInicioCrono) return Math.floor((Date.now() - new Date(s.horaInicioCrono).getTime()) / 1000);
      if (s.horaInicioCrono && s.horaFinCrono) return Math.floor((new Date(s.horaFinCrono).getTime() - new Date(s.horaInicioCrono).getTime()) / 1000);
      return 0;
    };

    const agregarOperario = (operarioId) => {
      if (!operarioId) return;
      setSesiones(prev => prev[operarioId] ? prev : { ...prev, [operarioId]: sesionVacia() });
      setOperarioParaAgregar('');
    };

    const actualizarSesion = (operarioId, cambios) => {
      setSesiones(prev => ({ ...prev, [operarioId]: { ...prev[operarioId], ...cambios } }));
    };

    const cerrarSesion = (operarioId) => {
      if (!window.confirm('¿Cerrar sin registrar? Se perderá el tiempo.')) return;
      setSesiones(prev => { const c = { ...prev }; delete c[operarioId]; return c; });
    };

    const iniciarCronometro = (operarioId) => {
      const s = sesiones[operarioId];
      if (!s.tarea_id) return alert('Selecciona la tarea antes de iniciar');
      actualizarSesion(operarioId, { horaInicioCrono: new Date().toISOString(), horaFinCrono: null, cronometroActivo: true });
    };

    const detenerCronometro = (operarioId) => {
      actualizarSesion(operarioId, { horaFinCrono: new Date().toISOString(), cronometroActivo: false });
    };

    const registrarProduccion = async (operarioId) => {
      const s = sesiones[operarioId];
      const totalUnidades = (parseFloat(s.unidades_buenas) || 0) + (parseFloat(s.unidades_defectuosas) || 0);
      if (!s.tarea_id) return alert('Selecciona la tarea');
      if (!s.tipo_balon_id) return alert('Selecciona el tipo de balón');
      if (totalUnidades <= 0) return alert('Registra al menos una unidad');

      const payload = {
        operario_id: operarioId, tarea_id: s.tarea_id, pedido_id: s.pedido_id,
        tipo_balon_id: s.tipo_balon_id, complejidad_estilo: s.complejidad_estilo,
        unidades_buenas: s.unidades_buenas, unidades_defectuosas: s.unidades_defectuosas,
        fecha: s.fecha, observaciones: s.observaciones
      };
      if (s.horaInicioCrono && s.horaFinCrono) {
        payload.hora_inicio = s.horaInicioCrono;
        payload.hora_fin = s.horaFinCrono;
      }

      try {
        const res = await fetchApi('/produccion', { method: 'POST', body: JSON.stringify(payload) });
        if (res.ok) {
          alert('✅ Producción registrada');
          await cargarDatos();
          setSesiones(prev => { const c = { ...prev }; delete c[operarioId]; return c; });
        } else {
          const data = await res.json();
          alert('❌ ' + (data.error || 'Error'));
        }
      } catch (e) { alert('❌ Error: ' + e.message); }
    };

        // eslint-disable-next-line react-hooks/exhaustive-deps
        
    const tiempoPromedioPorOperario = useMemo(() => {
      const acumulado = {};
      produccion.forEach(p => {
        if (!p.duracion_segundos) return;
        if (!acumulado[p.operario_nombre]) acumulado[p.operario_nombre] = { total: 0, cantidad: 0 };
        acumulado[p.operario_nombre].total += p.duracion_segundos;
        acumulado[p.operario_nombre].cantidad += 1;
      });
      return Object.entries(acumulado).map(([nombre, { total, cantidad }]) => ({ nombre, promedioSegundos: Math.round(total / cantidad), registros: cantidad }));
    }, [produccion]);

    const operariosDisponibles = operarios.filter(op => !sesiones[op.id] && op.estado === 'disponible');
    const idsSesionesActivas = Object.keys(sesiones);

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📝 Registro de Producción</h1>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', color: COLORS.primary, marginBottom: '10px' }}>➕ Agregar operario</h2>
          <select value={operarioParaAgregar} onChange={(e) => { setOperarioParaAgregar(e.target.value); agregarOperario(e.target.value); }} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
            <option value="">-- Seleccionar operario --</option>
            {operariosDisponibles.map(op => (<option key={op.id} value={op.id}>{op.nombre}</option>))}
          </select>
        </div>

        {idsSesionesActivas.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            {idsSesionesActivas.map(operarioId => {
              const s = sesiones[operarioId];
              const operario = operarios.find(op => String(op.id) === String(operarioId));
              const segundos = segundosDeSesion(s);
              const totalUnidades = (parseFloat(s.unidades_buenas) || 0) + (parseFloat(s.unidades_defectuosas) || 0);

              return (
                <div key={operarioId} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: `2px solid ${s.cronometroActivo ? COLORS.warning : COLORS.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ fontSize: '17px', color: COLORS.primary, margin: 0 }}>👤 {operario?.nombre}</h2>
                    <button onClick={() => cerrarSesion(operarioId)} style={{ border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontSize: '18px' }}>✖</button>
                  </div>

                  <select value={s.tarea_id} onChange={(e) => actualizarSesion(operarioId, { tarea_id: e.target.value })} disabled={s.cronometroActivo} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', opacity: s.cronometroActivo ? 0.6 : 1 }}>
                    <option value="">-- Tarea --</option>
                    {tareas.map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                  </select>

                  <select value={s.pedido_id} onChange={(e) => actualizarSesion(operarioId, { pedido_id: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                    <option value="">-- Pedido (opcional) --</option>
                    {pedidos.map(p => (<option key={p.id} value={p.id}>{p.numero_pedido} - {p.cliente}</option>))}
                  </select>

                  <select value={s.tipo_balon_id} onChange={(e) => actualizarSesion(operarioId, { tipo_balon_id: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                    <option value="">-- Tipo balón (obligatorio) --</option>
                    {tiposBalon.map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                  </select>

                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Estilo</label>
                  <select value={s.complejidad_estilo} onChange={(e) => actualizarSesion(operarioId, { complejidad_estilo: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                    <option value="32 cascos">32 Cascos</option>
                    <option value="4 piezas">4 Piezas</option>
                  </select>

                  <div style={{ backgroundColor: s.cronometroActivo ? '#fff3cd' : '#f5f5f5', border: `1px solid ${s.cronometroActivo ? COLORS.warning : COLORS.border}`, borderRadius: '4px', padding: '12px', marginBottom: '15px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#666', fontWeight: 'bold' }}>⏱️ Cronómetro</p>
                    <p style={{ margin: '0 0 10px 0', fontSize: '26px', fontFamily: 'monospace', color: COLORS.primary }}>{formatearTiempo(segundos)}</p>
                    {!s.cronometroActivo ? (
                      <button onClick={() => iniciarCronometro(operarioId)} style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.success, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>▶️ Iniciar</button>
                    ) : (
                      <button onClick={() => detenerCronometro(operarioId)} style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.danger, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>⏹️ Detener</button>
                    )}
                  </div>

                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Unidades buenas</label>
                  <input type="number" min="0" step="0.5" value={s.unidades_buenas} onChange={(e) => actualizarSesion(operarioId, { unidades_buenas: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />

                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Unidades defectuosas</label>
                  <input type="number" min="0" step="0.5" value={s.unidades_defectuosas} onChange={(e) => actualizarSesion(operarioId, { unidades_defectuosas: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
                  <p style={{ fontSize: '13px', color: '#999', margin: '0 0 10px 0' }}>Total: <strong>{totalUnidades}</strong></p>

                  <input type="date" value={s.fecha} onChange={(e) => actualizarSesion(operarioId, { fecha: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
                  <textarea value={s.observaciones} onChange={(e) => actualizarSesion(operarioId, { observaciones: e.target.value })} placeholder="Observaciones" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', minHeight: '60px' }} />
                  <button onClick={() => registrarProduccion(operarioId)} style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅ Registrar</button>
                </div>
              );
            })}
          </div>
        )}

        {tiempoPromedioPorOperario.length > 0 && (
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>⏱️ Tiempo promedio por operario</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '15px' }}>
              {tiempoPromedioPorOperario.map(t => (
                <div key={t.nombre} style={{ padding: '12px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${COLORS.warning}` }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: COLORS.primary }}>{t.nombre}</p>
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>Promedio: <strong>{formatearTiempo(t.promedioSegundos)}</strong> ({t.registros})</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>Últimos Registros ({produccion.length})</h2>
        {produccion.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {produccion.slice(0, 30).map(p => (
              <div key={p.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.secondary}` }}>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>{new Date(p.fecha).toLocaleDateString('es-CO')}</strong></p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{p.operario_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>Tarea: {p.tarea_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>Buenas: <strong style={{ color: COLORS.success }}>{p.unidades_buenas ?? p.cantidad}</strong> · Defectuosas: <strong style={{ color: (p.unidades_defectuosas || 0) > 0 ? COLORS.danger : '#666' }}>{p.unidades_defectuosas ?? 0}</strong></p>
                {p.duracion_segundos != null && <p style={{ fontSize: '12px', color: COLORS.primary, margin: '4px 0 0 0' }}>⏱️ {formatearTiempo(p.duracion_segundos)}</p>}
                {p.pedido_numero && <p style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>Pedido: {p.pedido_numero}</p>}
              </div>
            ))}
          </div>
        ) : (<p style={{ fontSize: '16px', color: '#999' }}>📭 No hay registros</p>)}
      </div>
    );
  };

  // ── MENÚ POR ROL ────────────────────────────────────────────────────────
  const MENU_POR_ROL = {
    admin: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'pedidos', label: 'Pedidos', icon: '📋' },
      { id: 'produccion', label: 'Producción', icon: '📝' },
      { id: 'tipos', label: 'Tipos Balón', icon: '⚽' },
      { id: 'operarios', label: 'Operarios', icon: '👥' },
      { id: 'materiales', label: 'Inventario', icon: '📦' },
    ],
    gerente: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'pedidos', label: 'Pedidos', icon: '📋' },
      { id: 'produccion', label: 'Producción', icon: '📝' },
      { id: 'tipos', label: 'Tipos Balón', icon: '⚽' },
      { id: 'operarios', label: 'Operarios', icon: '👥' },
      { id: 'materiales', label: 'Inventario', icon: '📦' },
    ],
    tablet: [
      { id: 'produccion', label: 'Producción', icon: '📝' },
      { id: 'pedidos', label: 'Pedidos', icon: '📋' },
      { id: 'tipos', label: 'Tipos Balón', icon: '⚽' },
      { id: 'materiales', label: 'Inventario', icon: '📦' },
    ]
  };

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────
  if (verificandoSesion) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: COLORS.primary, color: 'white', fontFamily: 'Arial, sans-serif' }}>
        <p style={{ fontSize: '18px' }}>⏳ Cargando...</p>
      </div>
    );
  }

  if (!usuario) {
    return <LoginView onLoginExitoso={(u) => { setUsuario(u); if (u.rol === 'tablet') setCurrentView('produccion'); }} />;
  }

  const menuItems = MENU_POR_ROL[usuario.rol] || MENU_POR_ROL.tablet;
  const vistaValida = menuItems.some(m => m.id === currentView);
  const vistaActual = vistaValida ? currentView : menuItems[0].id;

  const tituloHeader = {
    dashboard: '📊 Dashboard',
    pedidos: '📋 Pedidos',
    produccion: '📝 Producción',
    tipos: '⚽ Tipos de Balones',
    operarios: '👥 Operarios',
    materiales: '📦 Inventario'
  }[vistaActual] || '';

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: COLORS.light, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ width: '280px', backgroundColor: COLORS.primary, color: 'white', padding: '20px', overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '40px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 5px 0' }}>TRILAK</h1>
          <p style={{ fontSize: '12px', margin: 0, opacity: 0.8 }}>Sistema de Gestión</p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {menuItems.map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} style={{ padding: '12px', backgroundColor: vistaActual === item.id ? COLORS.secondary : 'transparent', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', textAlign: 'left', transition: 'all 0.3s' }}>
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ backgroundColor: 'white', padding: '15px 30px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, margin: 0 }}>{tituloHeader}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
              <strong>{usuario.username}</strong> <span style={{ fontSize: '12px', color: '#999' }}>({usuario.rol})</span>
            </p>
            <button onClick={cerrarSesion} style={{ padding: '6px 12px', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', color: '#666' }}>
              🚪 Salir
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: COLORS.light }}>
          {cargando ? (
            <div style={{ padding: '30px', textAlign: 'center' }}><p style={{ fontSize: '16px', color: '#999' }}>⏳ Cargando datos...</p></div>
          ) : (
            <>
              {vistaActual === 'dashboard' && <DashboardView />}
              {vistaActual === 'pedidos' && <PedidosView />}
              {vistaActual === 'produccion' && <ProduccionView />}
              {vistaActual === 'tipos' && <TiposView />}
              {vistaActual === 'operarios' && <OperariosView />}
              {vistaActual === 'materiales' && <MaterialesView />}
            </>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: '15px 30px', borderTop: `1px solid ${COLORS.border}`, textAlign: 'center', fontSize: '12px', color: '#999' }}>
          © 2026 TRILAK - Sistema de Gestión de Producción v2.0
        </div>
      </div>
    </div>
  );
}