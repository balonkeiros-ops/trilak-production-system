import React, { useState, useEffect } from 'react';
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
  danger: '#2199d11c',
  light: '#f5f5f5',
  border: '#e0e0e0'
};

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [tiposBalon, setTiposBalon] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [produccion, setProduccion] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      try {
        await fetch(`${API_BASE_URL}/inicializar`, { method: 'POST' });
      } catch (e) { console.log('BD ya existe'); }

      await new Promise(r => setTimeout(r, 500));

      let res = await fetch(`${API_BASE_URL}/tipos-balon`);
      if (res.ok) setTiposBalon(await res.json());

      res = await fetch(`${API_BASE_URL}/operarios`);
      if (res.ok) setOperarios(await res.json());

      res = await fetch(`${API_BASE_URL}/materiales`);
      if (res.ok) setMateriales(await res.json());

      res = await fetch(`${API_BASE_URL}/pedidos`);
      if (res.ok) setPedidos(await res.json());

      res = await fetch(`${API_BASE_URL}/dashboard`);
      if (res.ok) setMetricas(await res.json());

      res = await fetch(`${API_BASE_URL}/tareas`);
      if (res.ok) setTareas(await res.json());

      res = await fetch(`${API_BASE_URL}/produccion`);
      if (res.ok) setProduccion(await res.json());

      setCargando(false);
    } catch (error) {
      console.error('Error:', error);
      setCargando(false);
    }
  };

  const exportarExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const resumen = [
        ['DASHBOARD PRODUCCIÓN - TRILAK'],
        [`Generado: ${new Date().toLocaleDateString('es-CO')}`],
        [''],
        ['MÉTRICAS PRINCIPALES'],
        ['Total Pedidos:', metricas?.metricas?.total_pedidos || 0],
        ['Total Operarios:', metricas?.metricas?.total_operarios || 0],
        ['Total Materiales:', metricas?.metricas?.total_materiales || 0],
        ['Tipos de Balón:', metricas?.metricas?.total_tipos_balon || 0],
        ['Producción Promedio:', metricas?.metricas?.produccion_promedio || 0, 'balones/mes'],
        ['Utilización:', metricas?.metricas?.utilizacion || 0, '%'],
        ['Calidad:', (metricas?.metricas?.calidad ?? null) === null ? 'Sin datos' : metricas.metricas.calidad, metricas?.metricas?.calidad != null ? '%' : ''],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumen);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

      const op = [['OPERARIO', 'ESPECIALIDAD', 'ESTADO'], ...operarios.map(o => [o.nombre, o.especialidad, o.estado])];
      const ws2 = XLSX.utils.aoa_to_sheet(op);
      XLSX.utils.book_append_sheet(wb, ws2, 'Operarios');

      const tipos = [['TIPO DE BALÓN'], ...tiposBalon.map(t => [t.nombre])];
      const ws3 = XLSX.utils.aoa_to_sheet(tipos);
      XLSX.utils.book_append_sheet(wb, ws3, 'Tipos Balón');

      const mat = [['MATERIAL', 'STOCK (metros)', 'UNIDAD'], ...materiales.map(m => [m.nombre, m.cantidad_disponible, m.unidad])];
      const ws4 = XLSX.utils.aoa_to_sheet(mat);
      XLSX.utils.book_append_sheet(wb, ws4, 'Materiales');

      const ped = [
        ['PEDIDO', 'CLIENTE', 'ESTADO', 'FECHA', 'DETALLES', 'IMÁGENES (REFERENCIA)'],
        ...pedidos.map(p => [
          p.numero_pedido,
          p.cliente,
          p.estado,
          p.fecha_creacion,
          p.observaciones || '-',
          (p.imagenes && p.imagenes.length > 0)
            ? p.imagenes.map(img => `${window.location.origin}/api/pedidos/${p.id}/imagenes/${img.id}`).join(' | ')
            : '-'
        ])
      ];
      const ws5 = XLSX.utils.aoa_to_sheet(ped);
      XLSX.utils.book_append_sheet(wb, ws5, 'Pedidos');

      const prodData = [['FECHA', 'OPERARIO', 'TAREA', 'CANTIDAD', 'PEDIDO', 'OBSERVACIONES']];
      produccion.forEach(p => {
        prodData.push([
          new Date(p.fecha).toLocaleDateString('es-CO'),
          p.operario_nombre,
          p.tarea_nombre,
          p.cantidad,
          p.pedido_numero || '-',
          p.observaciones || '-'
        ]);
      });
      const wsProd = XLSX.utils.aoa_to_sheet(prodData);
      XLSX.utils.book_append_sheet(wb, wsProd, 'Producción');

      const nombre = `Dashboard_TRILAK_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, nombre);
      alert('✅ Excel descargado correctamente');
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

  // ── DASHBOARD CON WIDGETS (HU-15) ──────────────────────────────────────────

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

      {/* Widget Ejecutivo (HU-15) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '30px' }}>
        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.success}` }}>
          <h3 style={{ color: COLORS.primary, marginBottom: '10px' }}>🏆 Top Operarios Más Productivos</h3>
          {metricas?.metricas?.top_operarios && metricas.metricas.top_operarios.length > 0 ? (
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
          {metricas?.metricas?.top_merma && metricas.metricas.top_merma.length > 0 ? (
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

  // ── NUEVO: ANALÍTICA DE OPERARIO (HU-11, HU-13, HU-14) ──────────────────

  const AnaliticaOperarioView = ({ operarioId, onBack }) => {
    const [periodo, setPeriodo] = useState('mensual');
    const [analitica, setAnalitica] = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
      const cargarAnalitica = async () => {
        setCargando(true);
        try {
          const res = await fetch(`${API_BASE_URL}/operarios/${operarioId}/analitica?periodo=${periodo}`);
          if (res.ok) setAnalitica(await res.json());
          else setAnalitica(null);
        } catch (e) { console.error(e); }
        setCargando(false);
      };
      cargarAnalitica();
    }, [operarioId, periodo]);

    const descargarReporte = async (formato) => {
      try {
        const res = await fetch(`${API_BASE_URL}/reportes/operarios/${operarioId}?formato=${formato}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analitica) // Enviamos los datos calculados al backend
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

    if (cargando) return <div style={{ padding: '20px', textAlign: 'center' }}>⏳ Cargando analítica...</div>;
    if (!analitica) return <div style={{ padding: '20px', textAlign: 'center' }}>Sin datos para este periodo</div>;

    const { operario, metricas, grafica_proactividad, detalle_pedidos } = analitica;

    return (
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '22px', color: COLORS.primary, margin: 0 }}>
            📊 Analítica de {operario.nombre}
          </h2>
          <button onClick={onBack} style={{ padding: '6px 12px', backgroundColor: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Volver</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['diario', 'semanal', 'mensual'].map(p => (
            <button 
              key={p} 
              onClick={() => setPeriodo(p)} 
              style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${COLORS.primary}`, backgroundColor: periodo === p ? COLORS.primary : 'white', color: periodo === p ? 'white' : COLORS.primary, cursor: 'pointer' }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button onClick={() => descargarReporte('excel')} style={{ padding: '8px 12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📊 Excel</button>
            <button onClick={() => descargarReporte('pdf')} style={{ padding: '8px 12px', backgroundColor: COLORS.danger, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📄 PDF</button>
          </div>
        </div>

        {/* KPIs */}
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
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>Eficiencia Global</p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: COLORS.warning }}>{metricas.eficiencia_porcentaje}%</p>
          </div>
          <div style={{ padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9', textAlign: 'center', borderTop: `4px solid ${COLORS.secondary}` }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>Productividad</p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: COLORS.secondary }}>{metricas.productividad_und_hora} und/h</p>
          </div>
        </div>

        {/* Gráfica HU-11 */}
        <h3 style={{ marginBottom: '15px' }}>📈 Proactividad vs Tiempo</h3>
        {grafica_proactividad && grafica_proactividad.length > 0 ? (
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
        ) : <p style={{ color: '#999', marginBottom: '30px' }}>No hay datos suficientes para graficar en este periodo.</p>}

        {/* Trazabilidad HU-13 */}
        <h3 style={{ marginBottom: '15px' }}>📋 Detalle de Calidad por Pedido</h3>
        {detalle_pedidos && detalle_pedidos.length > 0 ? (
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
        ) : <p style={{ color: '#999' }}>Sin pedidos asociados en este periodo.</p>}
      </div>
    );
  };

  // ── PEDIDOS ──────────────────────────────────────────────────────────────────

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
        alert('Por favor completa los campos requeridos');
        return;
      }
      if (formData.observaciones.length > LIMITE_DETALLES) {
        alert(`Los detalles del pedido no pueden superar ${LIMITE_DETALLES} caracteres`);
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/pedidos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const data = await res.json();

        if (res.ok) {
          if (data.alertas_stock && data.alertas_stock.length > 0) {
            setAlertaStock(data.alertas_stock);
          }
          if (data.advertencias && data.advertencias.length > 0) {
            alert('✅ Pedido creado, con avisos:\n' + data.advertencias.join('\n'));
          } else {
            alert('✅ Pedido creado exitosamente');
          }
          await cargarDatos();
          setFormData({
            cliente: '',
            fecha_entrega_solicitada: '',
            observaciones: '',
            imagenes: [],
            items: [{ tipo_balon_id: '', cantidad: 1, material_id: '' }]
          });
        } else {
          alert('❌ ' + (data.error || 'No se pudo crear el pedido'));
        }
      } catch (error) {
        alert('❌ Error: ' + error.message);
      }
    };

    const actualizarItem = (index, campo, valor) => {
      const newItems = [...formData.items];
      newItems[index] = { ...newItems[index], [campo]: valor };
      setFormData({ ...formData, items: newItems });
    };

    const agregarItem = () => {
      setFormData({
        ...formData,
        items: [...formData.items, { tipo_balon_id: '', cantidad: 1, material_id: '' }]
      });
    };

    const quitarItem = (index) => {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: newItems });
    };

    const agregarImagenes = (fileList) => {
      Array.from(fileList).forEach(file => {
        if (!FORMATOS_IMAGEN_VALIDOS.includes(file.type)) {
          alert(`"${file.name}" no es PNG ni JPG, se omite`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const contenido_base64 = reader.result.split(',')[1];
          setFormData(prev => ({
            ...prev,
            imagenes: [...prev.imagenes, {
              nombre_archivo: file.name,
              tipo_mime: file.type,
              contenido_base64
            }]
          }));
        };
        reader.readAsDataURL(file);
      });
    };

    const quitarImagen = (index) => {
      setFormData({ ...formData, imagenes: formData.imagenes.filter((_, i) => i !== index) });
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📋 Pedidos</h1>

        {alertaStock.length > 0 && (
          <div style={{
            backgroundColor: '#fff3cd',
            border: `2px solid ${COLORS.danger}`,
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '20px',
            position: 'relative'
          }}>
            <button onClick={() => setAlertaStock([])} style={{ position: 'absolute', top: '10px', right: '12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', color: COLORS.danger }}>✕</button>
            <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: COLORS.danger, fontSize: '16px' }}>⚠️ Stock crítico de material</p>
            {alertaStock.map((a, i) => (
              <p key={i} style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#664d03' }}>
                <strong>{a.material_nombre}</strong>: quedan {a.cantidad_disponible} {a.unidad} (umbral mínimo: {a.umbral_minimo}).
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
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Tipo de balón #{index + 1}</p>
              <select value={item.tipo_balon_id} onChange={(e) => actualizarItem(index, 'tipo_balon_id', e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                <option value="">-- Seleccionar Tipo de Balón --</option>
                {tiposBalon.map(tipo => (<option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>))}
              </select>
              <select value={item.material_id} onChange={(e) => actualizarItem(index, 'material_id', e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                <option value="">-- Seleccionar Material --</option>
                {materiales.map(mat => (<option key={mat.id} value={mat.id}>{mat.nombre} ({mat.cantidad_disponible} {mat.unidad})</option>))}
              </select>
              <input type="number" min="1" value={item.cantidad} onChange={(e) => actualizarItem(index, 'cantidad', parseInt(e.target.value) || 1)} placeholder="Cantidad" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
            </div>
          ))}

          <button onClick={agregarItem} style={{ width: '100%', padding: '10px', marginBottom: '15px', backgroundColor: 'white', color: COLORS.primary, border: `1px dashed ${COLORS.primary}`, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>➕ Agregar otro tipo de balón</button>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Detalles y características del pedido</label>
          <textarea value={formData.observaciones} onChange={(e) => { if (e.target.value.length <= LIMITE_DETALLES) setFormData({ ...formData, observaciones: e.target.value }); }} maxLength={LIMITE_DETALLES} rows={4} placeholder="Ej: cliente pide balones con logo bordado..." style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          <p style={{ textAlign: 'right', fontSize: '12px', margin: '4px 0 15px 0', color: formData.observaciones.length >= LIMITE_DETALLES ? COLORS.danger : '#999' }}>{formData.observaciones.length}/{LIMITE_DETALLES}</p>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Fotografías o imágenes de referencia (PNG o JPG)</label>
          <input type="file" accept="image/png, image/jpeg" multiple onChange={(e) => { agregarImagenes(e.target.files); e.target.value = ''; }} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
          {formData.imagenes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
              {formData.imagenes.map((img, index) => (
                <div key={index} style={{ position: 'relative', width: '80px' }}>
                  <img src={`data:${img.tipo_mime};base64,${img.contenido_base64}`} alt={img.nombre_archivo} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${COLORS.border}` }} />
                  <button onClick={() => quitarImagen(index)} style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', backgroundColor: COLORS.danger, color: 'white', cursor: 'pointer', fontSize: '12px', lineHeight: '20px', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <button onClick={crearPedido} style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅ Crear Pedido</button>
        </div>

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>Pedidos Registrados ({pedidos.length})</h2>
        {/* (Se mantiene el listado original de pedidos) */}
        {pedidos.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {pedidos.map(p => (
              <div key={p.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.secondary}` }}>
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{p.numero_pedido}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>Cliente:</strong> {p.cliente}</p>
                {p.balones && p.balones.length > 0 && (
                  <div style={{ margin: '0 0 5px 0' }}>
                    <strong style={{ fontSize: '14px', color: '#666' }}>Balones:</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                      {p.balones.map(b => (<li key={b.id} style={{ fontSize: '13px', color: '#666' }}>{b.tipo_balon_nombre}: {b.cantidad}</li>))}
                    </ul>
                  </div>
                )}
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}><strong>Estado:</strong> {p.estado}</p>
                {p.imagenes && p.imagenes.length > 0 && (
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

  // ── OPERARIOS (AHORA CON DRILl-DOWN A ANALÍTICA) ─────────────────────────

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
              <button 
                key={op.id} 
                onClick={() => setOperarioSeleccionado(op.id)}
                style={{ 
                  backgroundColor: 'white', 
                  padding: '15px', 
                  borderRadius: '8px', 
                  borderLeft: `5px solid ${COLORS.primary}`, 
                  border: '1px solid transparent', 
                  cursor: 'pointer', 
                  textAlign: 'left', 
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = COLORS.secondary}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
              >
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{op.nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>Especialidad:</strong> {op.especialidad}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}><strong>Estado:</strong> {op.estado}</p>
              </button>
            ))}
          </div>
        ) : (
          <AnaliticaOperarioView 
            operarioId={operarioSeleccionado} 
            onBack={() => setOperarioSeleccionado(null)} 
          />
        )}
      </div>
    );
  };

  // ── INVENTARIO ──────────────────────────────────────────────────────────────

  const MaterialesView = () => {
    const [editandoId, setEditandoId] = useState(null);
    const [nuevoUmbral, setNuevoUmbral] = useState('');

    const guardarUmbral = async (materialId) => {
      const valor = parseFloat(nuevoUmbral);
      if (isNaN(valor) || valor < 0) return alert('Ingresa un número válido');
      try {
        const res = await fetch(`${API_BASE_URL}/materiales/${materialId}/umbral`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ umbral_minimo: valor })
        });
        if (res.ok) { await cargarDatos(); setEditandoId(null); } 
        else alert('❌ Error al actualizar');
      } catch (error) { alert('❌ Error: ' + error.message); }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📦 Inventario de Materiales ({materiales.length})</h1>
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
                      Umbral mínimo: {umbral} {mat.unidad}{' '}
                      <button onClick={() => { setEditandoId(mat.id); setNuevoUmbral(String(umbral)); }} style={{ border: 'none', background: 'transparent', color: COLORS.primary, cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}>editar</button>
                    </p>
                  )}
                  {critico && <p style={{ fontSize: '12px', color: COLORS.danger, fontWeight: 'bold', margin: 0 }}>⚠️ Stock crítico, por debajo del umbral</p>}
                </div>
              );
            })}
          </div>
        ) : (<p style={{ fontSize: '16px', color: '#999' }}>No hay materiales</p>)}
      </div>
    );
  };

  // ── TIPOS BALÓN ─────────────────────────────────────────────────────────────

  const TiposView = () => {
    const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');

    const categorias = ['Todas', ...Array.from(new Set(tiposBalon.map(t => t.categoria || 'Otros')))];
    const tiposFiltrados = categoriaFiltro === 'Todas' ? tiposBalon : tiposBalon.filter(t => (t.categoria || 'Otros') === categoriaFiltro);
    const COLOR_SEMAFORO = { verde: COLORS.success, amarillo: COLORS.warning, rojo: COLORS.danger };

    const seleccionarTipo = async (tipo) => {
      if (tipoSeleccionado && tipoSeleccionado.id === tipo.id) { setTipoSeleccionado(null); setDetalle(null); return; }
      setTipoSeleccionado(tipo); setDetalle(null); setCargandoDetalle(true);
      try {
        const res = await fetch(`${API_BASE_URL}/tipos-balon/${tipo.id}/metricas`);
        if (res.ok) setDetalle(await res.json());
      } catch (error) { console.error('Error cargando métricas:', error); } 
      finally { setCargandoDetalle(false); }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '20px' }}>⚽ Tipos de Balones ({tiposFiltrados.length}/{tiposBalon.length})</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoriaFiltro(cat)} style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${COLORS.primary}`, backgroundColor: categoriaFiltro === cat ? COLORS.primary : 'white', color: categoriaFiltro === cat ? 'white' : COLORS.primary, cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{cat}</button>
          ))}
        </div>
        {tiposFiltrados.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {tiposFiltrados.map(tipo => {
              const colorSemaforo = tipo.metricas?.semaforo ? COLOR_SEMAFORO[tipo.metricas.semaforo] : COLORS.border;
              const seleccionado = tipoSeleccionado && tipoSeleccionado.id === tipo.id;
              return (
                <button key={tipo.id} onClick={() => seleccionarTipo(tipo)} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: seleccionado ? `2px solid ${COLORS.secondary}` : `1px solid ${COLORS.border}`, borderLeft: `6px solid ${colorSemaforo}`, textAlign: 'left', cursor: 'pointer', font: 'inherit', display: 'block', width: '100%' }}>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 6px 0' }}>{tipo.nombre}</p>
                  <p style={{ fontSize: '12px', color: '#999', margin: '0 0 8px 0' }}>{tipo.categoria || 'Otros'}</p>
                  {tipo.metricas && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Stock: <strong>{tipo.metricas.stock_actual ?? 0}</strong> · Pendientes: <strong>{tipo.metricas.pendientes ?? 0}</strong></p>}
                  {tipo.metricas && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Disponibles: <strong>{tipo.metricas.disponibles}</strong> · Pendientes: <strong>{tipo.metricas.pendientes}</strong></p>}
                </button>
              );
            })}
          </div>
        ) : (<p style={{ fontSize: '16px', color: '#999' }}>No hay tipos de balones en esta categoría</p>)}
        {tipoSeleccionado && (
          <div style={{ marginTop: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>{tipoSeleccionado.nombre}</h2>
            {cargandoDetalle && <p style={{ color: '#999' }}>Cargando métricas...</p>}
            {detalle && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Fabricadas</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.primary }}>{detalle.metricas.fabricadas}</p></div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Defectuosas</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.danger }}>{detalle.metricas.defectuosas}</p></div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Entregadas</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.primary }}>{detalle.metricas.entregadas}</p></div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Pendientes</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.warning }}>{detalle.metricas.pendientes}</p></div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center', borderTop: `4px solid ${COLOR_SEMAFORO[detalle.metricas.semaforo]}` }}><p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Disponibles</p><p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLOR_SEMAFORO[detalle.metricas.semaforo] }}>{detalle.metricas.disponibles}</p></div>
                </div>
                <h3 style={{ fontSize: '15px', color: COLORS.primary, marginBottom: '10px' }}>📦 Trazabilidad de lotes ({detalle.lotes.length})</h3>
                {detalle.lotes.length > 0 ? (
                  <div style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead><tr style={{ textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}><th style={{ padding: '6px' }}>Fecha</th><th style={{ padding: '6px' }}>Operario</th><th style={{ padding: '6px' }}>Buenas</th><th style={{ padding: '6px' }}>Defectuosas</th></tr></thead>
                      <tbody>{detalle.lotes.map(l => (<tr key={l.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}><td style={{ padding: '6px' }}>{new Date(l.fecha).toLocaleDateString('es-CO')}</td><td style={{ padding: '6px' }}>{l.operario_nombre}</td><td style={{ padding: '6px', color: COLORS.success }}>{l.unidades_buenas}</td><td style={{ padding: '6px', color: (l.unidades_defectuosas || 0) > 0 ? COLORS.danger : '#999' }}>{l.unidades_defectuosas}</td></tr>))}</tbody>
                    </table>
                  </div>
                ) : (<p style={{ fontSize: '13px', color: '#999', marginBottom: '20px' }}>Todavía no hay producción registrada para esta referencia.</p>)}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── PRODUCCIÓN ──────────────────────────────────────────────────────────────

  const ProduccionView = () => {
    // ── Sesiones por operario ──────────────────────────────────────────────
    // Antes: un solo 'form' + un solo cronómetro compartidos por toda la
    // pantalla, así que mientras un operario tenía el cronómetro corriendo,
    // el formulario quedaba bloqueado (disabled) para todos los demás.
    //
    // Ahora: cada operario que se "agrega" a la estación tiene su propia
    // tarjeta independiente, con su propio formulario y su propio
    // cronómetro. Varios operarios (ej. 3-4 compartiendo una tablet) pueden
    // tener su tarea abierta y su cronómetro corriendo al mismo tiempo, sin
    // pisarse entre sí.
    //
    // Se guarda en localStorage para que, si la tablet se recarga por
    // accidente a mitad de turno, nadie pierda su cronómetro en curso.
    const STORAGE_KEY = 'trilak_sesiones_produccion';

    const sesionVacia = () => ({
      tarea_id: '',
      pedido_id: '',
      tipo_balon_id: '',
      complejidad_estilo: '32 cascos',
      unidades_buenas: 1,
      unidades_defectuosas: 0,
      fecha: new Date().toISOString().slice(0, 10),
      observaciones: '',
      horaInicioCrono: null, // ISO string o null
      horaFinCrono: null,    // ISO string o null
      cronometroActivo: false
    });

    const [sesiones, setSesiones] = useState(() => {
      try {
        const guardado = localStorage.getItem(STORAGE_KEY);
        return guardado ? JSON.parse(guardado) : {};
      } catch {
        return {};
      }
    });
    const [operarioParaAgregar, setOperarioParaAgregar] = useState('');
    const [tick, setTick] = useState(0); // fuerza re-render cada segundo para los cronómetros activos

    // Persiste las sesiones en localStorage cada vez que cambian
    useEffect(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sesiones)); } catch {}
    }, [sesiones]);

    // Un solo intervalo global que "tickea" cada segundo mientras haya
    // al menos un cronómetro activo, en vez de un setInterval por operario
    useEffect(() => {
      const hayActivos = Object.values(sesiones).some(s => s.cronometroActivo);
      if (!hayActivos) return;
      const intervalo = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(intervalo);
    }, [sesiones]);

    const formatearTiempo = (totalSegundos) => {
      const h = Math.floor(totalSegundos / 3600);
      const m = Math.floor((totalSegundos % 3600) / 60);
      const s = totalSegundos % 60;
      return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const segundosDeSesion = (s) => {
      if (s.cronometroActivo && s.horaInicioCrono) {
        return Math.floor((Date.now() - new Date(s.horaInicioCrono).getTime()) / 1000);
      }
      if (s.horaInicioCrono && s.horaFinCrono) {
        return Math.floor((new Date(s.horaFinCrono).getTime() - new Date(s.horaInicioCrono).getTime()) / 1000);
      }
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
      if (!window.confirm('¿Cerrar esta tarjeta sin registrar? Se perderá el tiempo del cronómetro.')) return;
      setSesiones(prev => {
        const copia = { ...prev };
        delete copia[operarioId];
        return copia;
      });
    };

    const iniciarCronometro = (operarioId) => {
      const s = sesiones[operarioId];
      if (!s.tarea_id) return alert('Selecciona la tarea antes de iniciar el cronómetro');
      actualizarSesion(operarioId, {
        horaInicioCrono: new Date().toISOString(),
        horaFinCrono: null,
        cronometroActivo: true
      });
    };

    const detenerCronometro = (operarioId) => {
      actualizarSesion(operarioId, { horaFinCrono: new Date().toISOString(), cronometroActivo: false });
    };

    const registrarProduccion = async (operarioId) => {
      const s = sesiones[operarioId];
      const totalUnidades = (parseFloat(s.unidades_buenas) || 0) + (parseFloat(s.unidades_defectuosas) || 0);
      if (!s.tarea_id) return alert('Selecciona la tarea');
      if (!s.tipo_balon_id) return alert('Selecciona el tipo de balón (obligatorio)');
      if (totalUnidades <= 0) return alert('Registra al menos una unidad');

      const payload = {
        operario_id: operarioId,
        tarea_id: s.tarea_id,
        pedido_id: s.pedido_id,
        tipo_balon_id: s.tipo_balon_id,
        complejidad_estilo: s.complejidad_estilo,
        unidades_buenas: s.unidades_buenas,
        unidades_defectuosas: s.unidades_defectuosas,
        fecha: s.fecha,
        observaciones: s.observaciones
      };
      if (s.horaInicioCrono && s.horaFinCrono) {
        payload.hora_inicio = s.horaInicioCrono;
        payload.hora_fin = s.horaFinCrono;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/produccion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert('✅ Producción registrada');
          await cargarDatos();
          // Libera al operario: su tarjeta desaparece y puede empezar una tarea nueva
          setSesiones(prev => {
            const copia = { ...prev };
            delete copia[operarioId];
            return copia;
          });
        } else {
          const data = await res.json();
          alert('❌ ' + (data.error || 'Error al registrar'));
        }
      } catch (error) { alert('❌ Error: ' + error.message); }
    };

    const tiempoPromedioPorOperario = React.useMemo(() => {
      const acumulado = {};
      produccion.forEach(p => {
        if (!p.duracion_segundos) return;
        if (!acumulado[p.operario_nombre]) acumulado[p.operario_nombre] = { total: 0, cantidad: 0 };
        acumulado[p.operario_nombre].total += p.duracion_segundos;
        acumulado[p.operario_nombre].cantidad += 1;
      });
      return Object.entries(acumulado).map(([nombre, { total, cantidad }]) => ({ nombre, promedioSegundos: Math.round(total / cantidad), registros: cantidad }));
    }, []);

    const operariosDisponibles = operarios.filter(op => !sesiones[op.id]);
    const idsSesionesActivas = Object.keys(sesiones);

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📝 Registro de Producción</h1>

        {/* Selector para agregar un operario nuevo a la estación (no bloquea a los demás) */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', color: COLORS.primary, marginBottom: '10px' }}>➕ Agregar operario a esta estación</h2>
          <select
            value={operarioParaAgregar}
            onChange={(e) => { setOperarioParaAgregar(e.target.value); agregarOperario(e.target.value); }}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          >
            <option value="">-- Seleccionar operario --</option>
            {operariosDisponibles.map(op => (<option key={op.id} value={op.id}>{op.nombre}</option>))}
          </select>
          {idsSesionesActivas.length === 0 && (
            <p style={{ fontSize: '13px', color: '#999', marginTop: '10px', marginBottom: 0 }}>
              Selecciona un operario para abrirle su tarjeta de tarea. Puedes agregar varios a la vez —
              cada uno tiene su propio cronómetro independiente.
            </p>
          )}
        </div>

        {/* Una tarjeta independiente por cada operario con sesión activa */}
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
                    <h2 style={{ fontSize: '17px', color: COLORS.primary, margin: 0 }}>👤 {operario ? operario.nombre : 'Operario'}</h2>
                    <button onClick={() => cerrarSesion(operarioId)} title="Cerrar sin registrar" style={{ border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✖</button>
                  </div>

                  <select value={s.tarea_id} onChange={(e) => actualizarSesion(operarioId, { tarea_id: e.target.value })} disabled={s.cronometroActivo} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', opacity: s.cronometroActivo ? 0.6 : 1 }}>
                    <option value="">-- Seleccionar Tarea --</option>
                    {tareas.map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                  </select>

                  <select value={s.pedido_id} onChange={(e) => actualizarSesion(operarioId, { pedido_id: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                    <option value="">-- Pedido (opcional) --</option>
                    {pedidos.map(p => (<option key={p.id} value={p.id}>{p.numero_pedido} - {p.cliente}</option>))}
                  </select>

                  <select value={s.tipo_balon_id} onChange={(e) => actualizarSesion(operarioId, { tipo_balon_id: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                    <option value="">-- Tipo de balón (Obligatorio) --</option>
                    {tiposBalon.map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                  </select>

                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Estilo de Termosellado</label>
                  <select value={s.complejidad_estilo} onChange={(e) => actualizarSesion(operarioId, { complejidad_estilo: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                    <option value="32 cascos">32 Cascos (Complejidad Alta)</option>
                    <option value="4 piezas">4 Piezas (Complejidad Estándar)</option>
                  </select>

                  <div style={{ backgroundColor: s.cronometroActivo ? '#fff3cd' : '#f5f5f5', border: `1px solid ${s.cronometroActivo ? COLORS.warning : COLORS.border}`, borderRadius: '4px', padding: '12px', marginBottom: '15px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#666', fontWeight: 'bold' }}>⏱️ Cronómetro de tarea</p>
                    <p style={{ margin: '0 0 10px 0', fontSize: '26px', fontFamily: 'monospace', color: COLORS.primary }}>{formatearTiempo(segundos)}</p>
                    {!s.cronometroActivo ? (
                      <button onClick={() => iniciarCronometro(operarioId)} style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.success, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>▶️ Iniciar cronómetro</button>
                    ) : (
                      <button onClick={() => detenerCronometro(operarioId)} style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.danger, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>⏹️ Detener</button>
                    )}
                    {s.horaInicioCrono && s.horaFinCrono && <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>Tiempo capturado: {formatearTiempo(segundos)} — se guardará junto con este registro.</p>}
                  </div>

                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Unidades buenas</label>
                  <input type="number" min="0" step="0.5" value={s.unidades_buenas} onChange={(e) => actualizarSesion(operarioId, { unidades_buenas: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />

                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>Unidades defectuosas</label>
                  <input type="number" min="0" step="0.5" value={s.unidades_defectuosas} onChange={(e) => actualizarSesion(operarioId, { unidades_defectuosas: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
                  <p style={{ fontSize: '13px', color: '#999', margin: '0 0 10px 0' }}>Total de unidades: <strong>{totalUnidades}</strong></p>

                  <input type="date" value={s.fecha} onChange={(e) => actualizarSesion(operarioId, { fecha: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
                  <textarea value={s.observaciones} onChange={(e) => actualizarSesion(operarioId, { observaciones: e.target.value })} placeholder="Observaciones (opcional)" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', minHeight: '60px' }} />
                  <button onClick={() => registrarProduccion(operarioId)} style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅ Registrar Producción</button>
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
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>Promedio: <strong>{formatearTiempo(t.promedioSegundos)}</strong> ({t.registros} registros)</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>Últimos Registros ({produccion.length})</h2>
        {produccion.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {produccion.map(p => (
              <div key={p.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.secondary}` }}>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>{new Date(p.fecha).toLocaleDateString('es-CO')}</strong></p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{p.operario_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>Tarea: {p.tarea_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>Buenas: <strong style={{ color: COLORS.success }}>{p.unidades_buenas ?? p.cantidad}</strong> {' · '} Defectuosas: <strong style={{ color: (p.unidades_defectuosas || 0) > 0 ? COLORS.danger : '#666' }}>{p.unidades_defectuosas ?? 0}</strong></p>
                <p style={{ fontSize: '12px', color: '#999', margin: '2px 0 0 0' }}>Total: {p.cantidad}</p>
                {p.duracion_segundos != null && <p style={{ fontSize: '12px', color: COLORS.primary, margin: '4px 0 0 0' }}>⏱️ Duración: {formatearTiempo(p.duracion_segundos)}</p>}
                {p.pedido_numero && <p style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>Pedido: {p.pedido_numero}</p>}
              </div>
            ))}
          </div>
        ) : (<p style={{ fontSize: '16px', color: '#999' }}>📭 No hay registros de producción</p>)}
      </div>
    );
  };

  // ── MAIN RENDER ─────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: COLORS.light, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ width: '280px', backgroundColor: COLORS.primary, color: 'white', padding: '20px', overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '40px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 5px 0' }}>TRILAK</h1>
          <p style={{ fontSize: '12px', margin: 0, opacity: 0.8 }}>Sistema de Gestión</p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'pedidos', label: 'Pedidos', icon: '📋' },
            { id: 'produccion', label: 'Producción', icon: '📝' },
            { id: 'tipos', label: 'Tipos Balón', icon: '⚽' },
            { id: 'operarios', label: 'Operarios', icon: '👥' },
            { id: 'materiales', label: 'Inventario', icon: '📦' },
          ].map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} style={{ padding: '12px', backgroundColor: currentView === item.id ? COLORS.secondary : 'transparent', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', textAlign: 'left', transition: 'all 0.3s' }}>
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ backgroundColor: 'white', padding: '15px 30px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, margin: 0 }}>
            {currentView === 'dashboard' && '📊 Dashboard'}
            {currentView === 'pedidos' && '📋 Pedidos'}
            {currentView === 'produccion' && '📝 Producción'}
            {currentView === 'tipos' && '⚽ Tipos de Balones'}
            {currentView === 'operarios' && '👥 Operarios'}
            {currentView === 'materiales' && '📦 Inventario'}
          </h2>
          <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Usuario: Admin</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: COLORS.light }}>
          {cargando ? (
            <div style={{ padding: '30px', textAlign: 'center' }}><p style={{ fontSize: '16px', color: '#999' }}>⏳ Cargando datos...</p></div>
          ) : (
            <>
              {currentView === 'dashboard' && <DashboardView />}
              {currentView === 'pedidos' && <PedidosView />}
              {currentView === 'produccion' && <ProduccionView />}
              {currentView === 'tipos' && <TiposView />}
              {currentView === 'operarios' && <OperariosView />}
              {currentView === 'materiales' && <MaterialesView />}
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