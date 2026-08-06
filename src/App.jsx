import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';

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

// Convierte segundos totales en 'Hh Mm Ss' legible. Se usa en la vista de
// Reportes para mostrar tiempos acumulados sin depender de otro componente.
const formatearDuracionLegible = (segundosTotales) => {
  if (!segundosTotales || segundosTotales <= 0) return '0s';
  const s = Math.floor(segundosTotales);
  const horas = Math.floor(s / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const partes = [];
  if (horas) partes.push(`${horas}h`);
  if (minutos || horas) partes.push(`${minutos}m`);
  partes.push(`${seg}s`);
  return partes.join(' ');
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

      // Inicializar BD
      try {
        await fetch(`${API_BASE_URL}/inicializar`, { method: 'POST' });
      } catch (e) {
        console.log('BD ya existe');
      }

      await new Promise(r => setTimeout(r, 500));

      // Cargar tipos de balón
      let res = await fetch(`${API_BASE_URL}/tipos-balon`);
      if (res.ok) setTiposBalon(await res.json());

      // Cargar operarios
      res = await fetch(`${API_BASE_URL}/operarios`);
      if (res.ok) setOperarios(await res.json());

      // Cargar materiales
      res = await fetch(`${API_BASE_URL}/materiales`);
      if (res.ok) setMateriales(await res.json());

      // Cargar pedidos
      res = await fetch(`${API_BASE_URL}/pedidos`);
      if (res.ok) setPedidos(await res.json());

      // Cargar métricas
      res = await fetch(`${API_BASE_URL}/dashboard`);
      if (res.ok) setMetricas(await res.json());

      // Cargar tareas
      res = await fetch(`${API_BASE_URL}/tareas`);
      if (res.ok) setTareas(await res.json());

      // Cargar producción
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

      // Resumen
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
        ['Calidad:', metricas?.metricas?.calidad || 0, '%'],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumen);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

      // Operarios
      const op = [['OPERARIO', 'ESPECIALIDAD', 'ESTADO'], ...operarios.map(o => [o.nombre, o.especialidad, o.estado])];
      const ws2 = XLSX.utils.aoa_to_sheet(op);
      XLSX.utils.book_append_sheet(wb, ws2, 'Operarios');

      // Tipos de Balón
      const tipos = [['TIPO DE BALÓN'], ...tiposBalon.map(t => [t.nombre])];
      const ws3 = XLSX.utils.aoa_to_sheet(tipos);
      XLSX.utils.book_append_sheet(wb, ws3, 'Tipos Balón');

      // Materiales
      const mat = [['MATERIAL', 'STOCK (metros)', 'UNIDAD'], ...materiales.map(m => [m.nombre, m.cantidad_disponible, m.unidad])];
      const ws4 = XLSX.utils.aoa_to_sheet(mat);
      XLSX.utils.book_append_sheet(wb, ws4, 'Materiales');

      // Pedidos
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

      // Producción
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

  const DashboardView = () => (
    <div style={{ padding: '30px' }}>
      <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📊 Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <Card titulo="Total Pedidos" valor={metricas?.metricas?.total_pedidos || 0} color={COLORS.primary} />
        <Card titulo="Total Operarios" valor={metricas?.metricas?.total_operarios || 0} color={COLORS.secondary} />
        <Card titulo="Total Materiales" valor={metricas?.metricas?.total_materiales || 0} color={COLORS.success} />
        <Card titulo="Tipos de Balón" valor={metricas?.metricas?.total_tipos_balon || 0} color={COLORS.warning} />
      </div>

      <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>
        🔍 Indicadores de calidad
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <Card
          titulo="% Calidad global"
          valor={metricas?.metricas?.calidad != null ? `${metricas.metricas.calidad}%` : '—'}
          color={COLORS.success}
        />
        <Card titulo="Unidades buenas" valor={metricas?.metricas?.total_unidades_buenas ?? 0} color={COLORS.success} />
        <Card titulo="Unidades defectuosas" valor={metricas?.metricas?.total_unidades_defectuosas ?? 0} color={COLORS.warning} />
      </div>

      <button onClick={exportarExcel} style={{ padding: '12px 20px', backgroundColor: COLORS.primary, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '20px' }}>
        📊 Descargar Excel
      </button>
    </div>
  );

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

    // Escenario Gherkin 2: adjuntar fotografía/imagen de referencia (PNG/JPG).
    // Se lee cada archivo como base64 en el navegador y se manda junto con
    // el resto del pedido en el mismo POST /api/pedidos.
    const agregarImagenes = (fileList) => {
      Array.from(fileList).forEach(file => {
        if (!FORMATOS_IMAGEN_VALIDOS.includes(file.type)) {
          alert(`"${file.name}" no es PNG ni JPG, se omite`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const contenido_base64 = reader.result.split(',')[1]; // quitar "data:image/png;base64,"
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

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '20px' }}>Crear Nuevo Pedido</h2>

          <input type="text" placeholder="Cliente" value={formData.cliente} onChange={(e) => setFormData({ ...formData, cliente: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />

          <input type="date" value={formData.fecha_entrega_solicitada} onChange={(e) => setFormData({ ...formData, fecha_entrega_solicitada: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />

          {formData.items.map((item, index) => (
            <div key={index} style={{ border: `1px solid ${COLORS.border}`, borderRadius: '4px', padding: '10px', marginBottom: '10px', position: 'relative' }}>
              {formData.items.length > 1 && (
                <button
                  onClick={() => quitarItem(index)}
                  title="Quitar este tipo de balón"
                  style={{ position: 'absolute', top: '6px', right: '6px', border: 'none', background: 'transparent', color: COLORS.danger, cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
                >
                  ✕
                </button>
              )}
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Tipo de balón #{index + 1}</p>

              <select value={item.tipo_balon_id} onChange={(e) => actualizarItem(index, 'tipo_balon_id', e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                <option value="">-- Seleccionar Tipo de Balón --</option>
                {tiposBalon.map(tipo => (
                  <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                ))}
              </select>

              <select value={item.material_id} onChange={(e) => actualizarItem(index, 'material_id', e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}>
                <option value="">-- Seleccionar Material --</option>
                {materiales.map(mat => (
                  <option key={mat.id} value={mat.id}>{mat.nombre} ({mat.cantidad_disponible} {mat.unidad})</option>
                ))}
              </select>

              <input type="number" min="1" value={item.cantidad} onChange={(e) => actualizarItem(index, 'cantidad', parseInt(e.target.value) || 1)} placeholder="Cantidad" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }} />
            </div>
          ))}

          <button onClick={agregarItem} style={{ width: '100%', padding: '10px', marginBottom: '15px', backgroundColor: 'white', color: COLORS.primary, border: `1px dashed ${COLORS.primary}`, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            ➕ Agregar otro tipo de balón
          </button>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
            Detalles y características del pedido
          </label>
          <textarea
            value={formData.observaciones}
            onChange={(e) => {
              if (e.target.value.length <= LIMITE_DETALLES) {
                setFormData({ ...formData, observaciones: e.target.value });
              }
            }}
            maxLength={LIMITE_DETALLES}
            rows={4}
            placeholder="Ej: cliente pide balones con logo bordado en dos caras, empaque individual..."
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <p style={{
            textAlign: 'right',
            fontSize: '12px',
            margin: '4px 0 15px 0',
            color: formData.observaciones.length >= LIMITE_DETALLES ? COLORS.danger : '#999'
          }}>
            {formData.observaciones.length}/{LIMITE_DETALLES}
          </p>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
            Fotografías o imágenes de referencia (PNG o JPG)
          </label>
          <input
            type="file"
            accept="image/png, image/jpeg"
            multiple
            onChange={(e) => { agregarImagenes(e.target.files); e.target.value = ''; }}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          />
          {formData.imagenes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
              {formData.imagenes.map((img, index) => (
                <div key={index} style={{ position: 'relative', width: '80px' }}>
                  <img
                    src={`data:${img.tipo_mime};base64,${img.contenido_base64}`}
                    alt={img.nombre_archivo}
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${COLORS.border}` }}
                  />
                  <button
                    onClick={() => quitarImagen(index)}
                    title="Quitar imagen"
                    style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', backgroundColor: COLORS.danger, color: 'white', cursor: 'pointer', fontSize: '12px', lineHeight: '20px', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={crearPedido} style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            ✅ Crear Pedido
          </button>
        </div>

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>Pedidos Registrados ({pedidos.length})</h2>
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
                      {p.balones.map(b => (
                        <li key={b.id} style={{ fontSize: '13px', color: '#666' }}>{b.tipo_balon_nombre}: {b.cantidad}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}><strong>Estado:</strong> {p.estado}</p>
                {p.observaciones && (
                  <p style={{ fontSize: '13px', color: '#666', margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>
                    <strong>Detalles:</strong> {p.observaciones}
                  </p>
                )}
                {p.imagenes && p.imagenes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {p.imagenes.map(img => (
                      <img
                        key={img.id}
                        src={`${API_BASE_URL}/pedidos/${p.id}/imagenes/${img.id}`}
                        alt={img.nombre_archivo}
                        title={img.nombre_archivo}
                        style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${COLORS.border}` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '16px', color: '#999' }}>📭 No hay pedidos registrados</p>
        )}
      </div>
    );
  };

  const OperariosView = () => (
    <div style={{ padding: '30px' }}>
      <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>👥 Operarios ({operarios.length})</h1>
      {operarios.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {operarios.map(op => (
            <div key={op.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.primary}` }}>
              <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{op.nombre}</p>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>Especialidad:</strong> {op.especialidad}</p>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}><strong>Estado:</strong> {op.estado}</p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: '16px', color: '#999' }}>No hay operarios</p>
      )}
    </div>
  );

  const MaterialesView = () => (
    <div style={{ padding: '30px' }}>
      <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>📦 Inventario de Materiales ({materiales.length})</h1>
      {materiales.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {materiales.map(mat => (
            <div key={mat.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.success}` }}>
              <p style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 10px 0' }}>{mat.nombre}</p>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}><strong>Stock:</strong> {mat.cantidad_disponible} {mat.unidad}</p>
              {mat.cantidad_disponible < 10 && <p style={{ fontSize: '12px', color: COLORS.warning, margin: 0 }}>⚠️ Stock bajo</p>}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: '16px', color: '#999' }}>No hay materiales</p>
      )}
    </div>
  );

  const ReportesView = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [filtros, setFiltros] = useState({
      fecha_inicio: hace7dias,
      fecha_fin: hoy,
      operario_id: '',
      tarea_id: ''
    });
    const [exportando, setExportando] = useState(null); // null | 'excel' | 'pdf'

    // Escenario: 'ha visualizado las métricas de rendimiento en pantalla
    // para un periodo determinado'. Se calcula en el cliente a partir de
    // los registros ya cargados, filtrando por fecha/operario/tarea, para
    // que el usuario vea el resumen ANTES de exportar.
    const registrosFiltrados = useMemo(() => {
      if (!filtros.fecha_inicio || !filtros.fecha_fin) return [];
      const desde = new Date(filtros.fecha_inicio + 'T00:00:00');
      const hasta = new Date(filtros.fecha_fin + 'T23:59:59');
      return produccion.filter(p => {
        if (p.estado !== 'finalizada' || !p.hora_inicio) return false;
        const inicioTarea = new Date(p.hora_inicio);
        if (inicioTarea < desde || inicioTarea > hasta) return false;
        if (filtros.operario_id && String(p.operario_id) !== String(filtros.operario_id)) return false;
        if (filtros.tarea_id && String(p.tarea_id) !== String(filtros.tarea_id)) return false;
        return true;
      });
    }, [filtros]);

    const resumen = useMemo(() => {
      const buenas = registrosFiltrados.reduce((acc, p) => acc + (p.unidades_buenas || 0), 0);
      const defectuosas = registrosFiltrados.reduce((acc, p) => acc + (p.unidades_defectuosas || 0), 0);
      const total = buenas + defectuosas;
      const duracionTotal = registrosFiltrados.reduce((acc, p) => acc + (p.duracion_segundos || 0), 0);
      return {
        tareas: registrosFiltrados.length,
        buenas,
        defectuosas,
        calidad: total > 0 ? Math.round((buenas / total) * 1000) / 10 : null,
        duracionTotal
      };
    }, [registrosFiltrados]);

    const exportarArchivo = async (formato) => {
      if (!filtros.fecha_inicio || !filtros.fecha_fin) {
        alert('Seleccione un rango de fechas');
        return;
      }
      // Escenario: 'Validación de periodo sin registros de producción'.
      if (registrosFiltrados.length === 0) {
        alert('⚠️ No existen registros de producción para el periodo seleccionado');
        return;
      }

      setExportando(formato);
      try {
        const params = new URLSearchParams({
          fecha_inicio: filtros.fecha_inicio,
          fecha_fin: filtros.fecha_fin
        });
        if (filtros.operario_id) params.append('operario_id', filtros.operario_id);
        if (filtros.tarea_id) params.append('tarea_id', filtros.tarea_id);

        const res = await fetch(`${API_BASE_URL}/reportes/produccion/${formato}?${params.toString()}`);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert('⚠️ ' + (data.error || 'No se pudo generar el reporte'));
          return;
        }

        const blob = await res.blob();
        const extension = formato === 'excel' ? 'xlsx' : 'pdf';
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_produccion_${filtros.fecha_inicio}_${filtros.fecha_fin}.${extension}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        alert('❌ Error al exportar: ' + error.message);
      } finally {
        setExportando(null);
      }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>
          📈 Reportes de Producción y Calidad
        </h1>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>Filtros</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '13px', color: '#666' }}>Desde</label>
              <input
                type="date"
                value={filtros.fecha_inicio}
                max={filtros.fecha_fin}
                onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })}
                style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#666' }}>Hasta</label>
              <input
                type="date"
                value={filtros.fecha_fin}
                min={filtros.fecha_inicio}
                onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })}
                style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#666' }}>Operario (opcional)</label>
              <select
                value={filtros.operario_id}
                onChange={(e) => setFiltros({ ...filtros, operario_id: e.target.value })}
                style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
              >
                <option value="">-- Todos los operarios --</option>
                {operarios.map(op => (
                  <option key={op.id} value={op.id}>{op.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#666' }}>Tarea (opcional)</label>
              <select
                value={filtros.tarea_id}
                onChange={(e) => setFiltros({ ...filtros, tarea_id: e.target.value })}
                style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
              >
                <option value="">-- Todas las tareas --</option>
                {tareas.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>
          Vista previa del periodo
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.primary}` }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>Tareas finalizadas</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '26px', fontWeight: 'bold', color: COLORS.primary }}>{resumen.tareas}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #2e7d32' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>Unidades buenas</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '26px', fontWeight: 'bold', color: '#2e7d32' }}>{resumen.buenas}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.warning}` }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>Unidades defectuosas</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '26px', fontWeight: 'bold', color: COLORS.warning }}>{resumen.defectuosas}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.success}` }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>% Calidad</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '26px', fontWeight: 'bold', color: COLORS.success }}>
              {resumen.calidad !== null ? `${resumen.calidad}%` : '—'}
            </p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.secondary}` }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>Tiempo total</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: COLORS.secondary }}>
              {formatearDuracionLegible(resumen.duracionTotal)}
            </p>
          </div>
        </div>

        {registrosFiltrados.length === 0 && (
          <p style={{ fontSize: '14px', color: '#999', marginBottom: '20px' }}>
            📭 No hay tareas finalizadas en el periodo/filtros seleccionados.
          </p>
        )}

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={() => exportarArchivo('excel')}
            disabled={exportando !== null}
            style={{ padding: '14px 24px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {exportando === 'excel' ? 'Generando...' : '📊 Exportar a Excel'}
          </button>
          <button
            onClick={() => exportarArchivo('pdf')}
            disabled={exportando !== null}
            style={{ padding: '14px 24px', backgroundColor: COLORS.primary, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {exportando === 'pdf' ? 'Generando...' : '📄 Exportar a PDF'}
          </button>
        </div>
      </div>
    );
  };

  const TiposView = () => {
    const [tipoSeleccionado, setTipoSeleccionado] = useState(null);

    const pedidosDelTipo = tipoSeleccionado
      ? pedidos
          .map(p => {
            const item = (p.balones || []).find(b => b.tipo_balon_id === tipoSeleccionado.id);
            return item ? { ...p, cantidadDeEsteTipo: item.cantidad } : null;
          })
          .filter(Boolean)
      : [];

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>⚽ Tipos de Balones ({tiposBalon.length})</h1>
        {tiposBalon.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {tiposBalon.map(tipo => {
              const seleccionado = tipoSeleccionado && tipoSeleccionado.id === tipo.id;
              return (
                <div
                  key={tipo.id}
                  onClick={() => setTipoSeleccionado(seleccionado ? null : tipo)}
                  style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    borderLeft: `5px solid ${COLORS.warning}`,
                    textAlign: 'center',
                    cursor: 'pointer',
                    boxShadow: seleccionado ? `0 0 0 2px ${COLORS.secondary}` : 'none'
                  }}
                >
                  <p style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.primary, margin: 0 }}>{tipo.nombre}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: '16px', color: '#999' }}>No hay tipos de balones</p>
        )}

        {tipoSeleccionado && (
          <div style={{ marginTop: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>
              Pedidos de "{tipoSeleccionado.nombre}" ({pedidosDelTipo.length})
            </h2>
            {pedidosDelTipo.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '15px' }}>
                {pedidosDelTipo.map(p => (
                  <div key={p.id} style={{ padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${COLORS.secondary}` }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: COLORS.primary }}>Pedido: {p.numero_pedido}</p>
                    <p style={{ margin: '0 0 4px 0' }}>Cliente: {p.cliente}</p>
                    <p style={{ margin: 0 }}>Balones pedidos: {p.cantidadDeEsteTipo}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '14px', color: '#999' }}>Aún no hay pedidos con este tipo de balón</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const ProduccionView = () => {
    // Selección previa al inicio del ciclo (operario, tarea, pedido).
    const [form, setForm] = useState({ operario_id: '', tarea_id: '', pedido_id: '' });
    // Tarea actualmente "en_progreso" (viene del backend al iniciar, o se
    // restaura al elegir un operario que ya tenía una tarea abierta).
    const [tareaActiva, setTareaActiva] = useState(null);
    const [mostrarCierre, setMostrarCierre] = useState(false);
    const [unidadesBuenas, setUnidadesBuenas] = useState('');
    const [unidadesDefectuosas, setUnidadesDefectuosas] = useState('');
    const [observacionCalidad, setObservacionCalidad] = useState('');
    const [cronometro, setCronometro] = useState('00:00:00');
    const [cargandoAccion, setCargandoAccion] = useState(false);

    // Formatea el tiempo transcurrido en HH:MM:SS para el cronómetro en vivo.
    const formatearHHMMSS = (segundosTotales) => {
      const s = Math.max(0, Math.floor(segundosTotales));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    // Cronómetro visual: se actualiza cada segundo mientras haya tarea activa.
    useEffect(() => {
      if (!tareaActiva) return;
      const inicio = new Date(tareaActiva.hora_inicio).getTime();
      const tick = () => setCronometro(formatearHHMMSS((Date.now() - inicio) / 1000));
      tick();
      const intervalo = setInterval(tick, 1000);
      return () => clearInterval(intervalo);
    }, [tareaActiva]);

    // Al elegir operario, revisa si ya tiene una tarea "en_progreso" (por si
    // se recargó la página a mitad de un ciclo) y la restaura en pantalla.
    const onSeleccionarOperario = async (operarioId) => {
      setForm({ ...form, operario_id: operarioId });
      setTareaActiva(null);
      if (!operarioId) return;
      try {
        const res = await fetch(`${API_BASE_URL}/produccion/en-progreso/${operarioId}`);
        if (res.ok) {
          const activa = await res.json();
          if (activa) setTareaActiva(activa);
        }
      } catch (error) {
        // Si falla la verificación, simplemente se sigue el flujo normal.
      }
    };

    const iniciarTarea = async () => {
      if (!form.operario_id || !form.tarea_id) {
        alert('Seleccione operario y tarea');
        return;
      }
      setCargandoAccion(true);
      try {
        const res = await fetch(`${API_BASE_URL}/produccion/iniciar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        const data = await res.json();
        if (res.ok) {
          setTareaActiva(data);
          setMostrarCierre(false);
        } else if (res.status === 409 && data.tarea_en_progreso) {
          // El operario ya tenía una tarea abierta: se restaura en vez de duplicar.
          alert(data.error);
          setTareaActiva(data.tarea_en_progreso);
        } else {
          alert('❌ ' + (data.error || 'Error al iniciar la tarea'));
        }
      } catch (error) {
        alert('❌ Error: ' + error.message);
      } finally {
        setCargandoAccion(false);
      }
    };

    // Paso "hace clic en el botón de finalizar la labor": despliega el
    // formulario de cierre con los campos de unidades buenas/defectuosas.
    const abrirFormularioCierre = () => {
      setUnidadesBuenas('');
      setUnidadesDefectuosas('');
      setObservacionCalidad('');
      setMostrarCierre(true);
    };

    const totalUnidadesCierre =
      (Number(unidadesBuenas) || 0) + (Number(unidadesDefectuosas) || 0);

    const finalizarTarea = async () => {
      if (unidadesBuenas === '' || Number(unidadesBuenas) < 0) {
        alert('Ingrese la cantidad de unidades buenas (aprobadas)');
        return;
      }
      if (unidadesDefectuosas === '' || Number(unidadesDefectuosas) < 0) {
        alert('Ingrese la cantidad de unidades defectuosas');
        return;
      }
      setCargandoAccion(true);
      try {
        const res = await fetch(`${API_BASE_URL}/produccion/${tareaActiva.id}/finalizar`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unidades_buenas: Number(unidadesBuenas),
            unidades_defectuosas: Number(unidadesDefectuosas),
            observacion_calidad: observacionCalidad
          })
        });
        const data = await res.json();
        if (res.ok) {
          const resumenCalidad = data.porcentaje_calidad !== null
            ? ` · Calidad: ${data.porcentaje_calidad}%`
            : '';
          alert(`✅ Tarea finalizada. Tiempo total: ${data.duracion_formateada}${resumenCalidad}`);
          await cargarDatos();
          setTareaActiva(null);
          setMostrarCierre(false);
          setUnidadesBuenas('');
          setUnidadesDefectuosas('');
          setObservacionCalidad('');
          setForm({ operario_id: '', tarea_id: '', pedido_id: '' });
        } else {
          alert('❌ ' + (data.error || 'Error al finalizar la tarea'));
        }
      } catch (error) {
        alert('❌ Error: ' + error.message);
      } finally {
        setCargandoAccion(false);
      }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>
          📝 Registro de Producción
        </h1>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '20px' }}>
            {tareaActiva ? 'Tarea en curso' : 'Nueva Tarea'}
          </h2>

          <select
            value={form.operario_id}
            onChange={(e) => onSeleccionarOperario(e.target.value)}
            disabled={!!tareaActiva}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          >
            <option value="">-- Seleccionar Operario --</option>
            {operarios.map(op => (
              <option key={op.id} value={op.id}>{op.nombre}</option>
            ))}
          </select>

          <select
            value={tareaActiva ? tareaActiva.tarea_id : form.tarea_id}
            onChange={(e) => setForm({ ...form, tarea_id: e.target.value })}
            disabled={!!tareaActiva}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          >
            <option value="">-- Seleccionar Tarea --</option>
            {tareas.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>

          <select
            value={tareaActiva ? (tareaActiva.pedido_id || '') : form.pedido_id}
            onChange={(e) => setForm({ ...form, pedido_id: e.target.value })}
            disabled={!!tareaActiva}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          >
            <option value="">-- Pedido (opcional) --</option>
            {pedidos.map(p => (
              <option key={p.id} value={p.id}>{p.numero_pedido} - {p.cliente}</option>
            ))}
          </select>

          {!tareaActiva ? (
            <button
              onClick={iniciarTarea}
              disabled={cargandoAccion}
              style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ▶️ Iniciar Tarea
            </button>
          ) : (
            <div style={{ marginTop: '15px' }}>
              <div style={{ backgroundColor: COLORS.light, padding: '15px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#666' }}>
                  Iniciada: {new Date(tareaActiva.hora_inicio).toLocaleString('es-CO')}
                </p>
                <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: COLORS.primary, fontFamily: 'monospace' }}>
                  ⏱️ {cronometro}
                </p>
              </div>

              {!mostrarCierre ? (
                <button
                  onClick={abrirFormularioCierre}
                  disabled={cargandoAccion}
                  style={{ width: '100%', padding: '12px', backgroundColor: COLORS.secondary, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ⏹️ Finalizar Tarea
                </button>
              ) : (
                <div style={{ border: `2px solid ${COLORS.secondary}`, borderRadius: '6px', padding: '15px' }}>
                  <h3 style={{ fontSize: '15px', color: COLORS.primary, margin: '0 0 12px 0' }}>
                    🔍 Cierre de calidad
                  </h3>

                  <label style={{ fontSize: '13px', color: '#666' }}>Unidades buenas (aprobadas)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={unidadesBuenas}
                    onChange={(e) => setUnidadesBuenas(e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '10px', margin: '4px 0 10px 0', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
                  />

                  <label style={{ fontSize: '13px', color: '#666' }}>Unidades defectuosas</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={unidadesDefectuosas}
                    onChange={(e) => setUnidadesDefectuosas(e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '10px', margin: '4px 0 10px 0', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
                  />

                  <label style={{ fontSize: '13px', color: '#666' }}>Observación (opcional)</label>
                  <textarea
                    value={observacionCalidad}
                    onChange={(e) => setObservacionCalidad(e.target.value)}
                    placeholder="Ej: defectos por costura mal alineada"
                    style={{ width: '100%', padding: '10px', margin: '4px 0 10px 0', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', minHeight: '50px' }}
                  />

                  {(unidadesBuenas !== '' || unidadesDefectuosas !== '') && (
                    <p style={{ fontSize: '13px', color: '#666', margin: '0 0 10px 0' }}>
                      Total unidades: <strong>{totalUnidadesCierre}</strong>
                      {totalUnidadesCierre > 0 && (
                        <> · Calidad estimada: <strong>{Math.round((Number(unidadesBuenas || 0) / totalUnidadesCierre) * 1000) / 10}%</strong></>
                      )}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => setMostrarCierre(false)}
                      disabled={cargandoAccion}
                      style={{ flex: 1, padding: '12px', backgroundColor: 'white', color: COLORS.primary, border: `1px solid ${COLORS.border}`, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={finalizarTarea}
                      disabled={cargandoAccion}
                      style={{ flex: 2, padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ✅ Confirmar Finalización
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>
          Últimos Registros ({produccion.length})
        </h2>
        {produccion.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {produccion.map(p => (
              <div key={p.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${p.estado === 'en_progreso' ? COLORS.warning : COLORS.secondary}` }}>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>
                  <strong>{new Date(p.fecha).toLocaleDateString('es-CO')}</strong>
                  {p.estado === 'en_progreso' && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: COLORS.warning, fontWeight: 'bold' }}>● EN CURSO</span>
                  )}
                </p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{p.operario_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>Tarea: {p.tarea_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>
                  Inicio: {new Date(p.hora_inicio).toLocaleTimeString('es-CO')}
                  {p.hora_fin && ` — Fin: ${new Date(p.hora_fin).toLocaleTimeString('es-CO')}`}
                </p>
                {p.duracion_formateada && (
                  <p style={{ fontSize: '14px', color: COLORS.primary, fontWeight: 'bold', margin: '0 0 5px 0' }}>
                    ⏱️ Duración: {p.duracion_formateada}
                  </p>
                )}
                {p.estado === 'finalizada' && p.unidades_buenas !== null && p.unidades_buenas !== undefined ? (
                  <>
                    <p style={{ fontSize: '14px', color: '#2e7d32', margin: '0 0 2px 0' }}>
                      ✅ Buenas: {p.unidades_buenas} &nbsp; ❌ Defectuosas: {p.unidades_defectuosas}
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 5px 0', color: p.porcentaje_calidad >= 95 ? '#2e7d32' : COLORS.warning }}>
                      Calidad: {p.porcentaje_calidad}%
                    </p>
                    {p.observacion_calidad && (
                      <p style={{ fontSize: '12px', color: '#999', margin: '0 0 5px 0', fontStyle: 'italic' }}>
                        “{p.observacion_calidad}”
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>Unidades: {p.cantidad}</p>
                )}
                {p.pedido_numero && <p style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>Pedido: {p.pedido_numero}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '16px', color: '#999' }}>📭 No hay registros de producción</p>
        )}
      </div>
    );
  };

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
            { id: 'reportes', label: 'Reportes', icon: '📈' },
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
            {currentView === 'reportes' && '📈 Reportes'}
            {currentView === 'tipos' && '⚽ Tipos de Balones'}
            {currentView === 'operarios' && '👥 Operarios'}
            {currentView === 'materiales' && '📦 Inventario'}
          </h2>
          <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Usuario: Admin</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: COLORS.light }}>
          {cargando ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', color: '#999' }}>⏳ Cargando datos...</p>
            </div>
          ) : (
            <>
              {currentView === 'dashboard' && <DashboardView />}
              {currentView === 'pedidos' && <PedidosView />}
              {currentView === 'produccion' && <ProduccionView />}
              {currentView === 'reportes' && <ReportesView />}
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
