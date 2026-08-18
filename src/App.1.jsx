import React, { useState, useEffect } from 'react';
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
        ['Calidad:', (metricas?.metricas?.calidad ?? null) === null ? 'Sin datos' : metricas.metricas.calidad, metricas?.metricas?.calidad != null ? '%' : ''],
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
        <Card
          titulo="Calidad (buenas/total)"
          valor={metricas?.metricas?.calidad != null ? `${metricas.metricas.calidad}%` : 'Sin datos'}
          color={COLORS.success}
        />
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

    // Escenario Gherkin 2: alerta visual destacada cuando un material
    // (ej. cubierta PU/PVC) queda por debajo del umbral mínimo tras crear
    // el pedido. Se guarda aquí para poder mostrarla como banner, no como
    // un simple alert() del navegador que se cierra y se olvida.
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
          // Escenario 2: stock crítico -> banner visual destacado (se queda
          // en pantalla hasta que el usuario lo cierra, no un alert() que
          // desaparece con un clic).
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

        {alertaStock.length > 0 && (
          <div style={{
            backgroundColor: '#fff3cd',
            border: `2px solid ${COLORS.danger}`,
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '20px',
            position: 'relative'
          }}>
            <button
              onClick={() => setAlertaStock([])}
              title="Cerrar aviso"
              style={{ position: 'absolute', top: '10px', right: '12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', color: COLORS.danger }}
            >
              ✕
            </button>
            <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: COLORS.danger, fontSize: '16px' }}>
              ⚠️ Stock crítico de material
            </p>
            {alertaStock.map((a, i) => (
              <p key={i} style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#664d03' }}>
                <strong>{a.material_nombre}</strong>: quedan {a.cantidad_disponible} {a.unidad}
                {' '}(umbral mínimo configurado: {a.umbral_minimo} {a.unidad}). Es momento de reabastecer.
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

  const MaterialesView = () => {
    const [editandoId, setEditandoId] = useState(null);
    const [nuevoUmbral, setNuevoUmbral] = useState('');

    const guardarUmbral = async (materialId) => {
      const valor = parseFloat(nuevoUmbral);
      if (isNaN(valor) || valor < 0) {
        alert('Ingresa un número válido para el umbral');
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/materiales/${materialId}/umbral`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ umbral_minimo: valor })
        });
        if (res.ok) {
          await cargarDatos();
          setEditandoId(null);
        } else {
          const data = await res.json();
          alert('❌ ' + (data.error || 'No se pudo actualizar el umbral'));
        }
      } catch (error) {
        alert('❌ Error: ' + error.message);
      }
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
                      <input
                        type="number"
                        min="0"
                        value={nuevoUmbral}
                        onChange={(e) => setNuevoUmbral(e.target.value)}
                        style={{ width: '80px', padding: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}` }}
                      />
                      <button onClick={() => guardarUmbral(mat.id)} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.success, color: 'white', cursor: 'pointer' }}>Guardar</button>
                      <button onClick={() => setEditandoId(null)} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#eee', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#999', margin: '0 0 5px 0' }}>
                      Umbral mínimo: {umbral} {mat.unidad}{' '}
                      <button
                        onClick={() => { setEditandoId(mat.id); setNuevoUmbral(String(umbral)); }}
                        style={{ border: 'none', background: 'transparent', color: COLORS.primary, cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}
                      >
                        editar
                      </button>
                    </p>
                  )}

                  {critico && <p style={{ fontSize: '12px', color: COLORS.danger, fontWeight: 'bold', margin: 0 }}>⚠️ Stock crítico, por debajo del umbral</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: '16px', color: '#999' }}>No hay materiales</p>
        )}
      </div>
    );
  };

  const TiposView = () => {
    const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');

    const categorias = ['Todas', ...Array.from(new Set(tiposBalon.map(t => t.categoria || 'Otros')))];
    const tiposFiltrados = categoriaFiltro === 'Todas'
      ? tiposBalon
      : tiposBalon.filter(t => (t.categoria || 'Otros') === categoriaFiltro);

    const COLOR_SEMAFORO = {
      verde: COLORS.success,
      amarillo: COLORS.warning,
      rojo: COLORS.danger
    };

    const pedidosDelTipo = tipoSeleccionado
      ? pedidos
          .map(p => {
            const item = (p.balones || []).find(b => b.tipo_balon_id === tipoSeleccionado.id);
            return item ? { ...p, cantidadDeEsteTipo: item.cantidad } : null;
          })
          .filter(Boolean)
      : [];

    const seleccionarTipo = async (tipo) => {
      if (tipoSeleccionado && tipoSeleccionado.id === tipo.id) {
        setTipoSeleccionado(null);
        setDetalle(null);
        return;
      }
      setTipoSeleccionado(tipo);
      setDetalle(null);
      setCargandoDetalle(true);
      try {
        const res = await fetch(`${API_BASE_URL}/tipos-balon/${tipo.id}/metricas`);
        if (res.ok) setDetalle(await res.json());
      } catch (error) {
        console.error('Error cargando métricas:', error);
      } finally {
        setCargandoDetalle(false);
      }
    };

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '20px' }}>⚽ Tipos de Balones ({tiposFiltrados.length}/{tiposBalon.length})</h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoriaFiltro(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: `1px solid ${COLORS.primary}`,
                backgroundColor: categoriaFiltro === cat ? COLORS.primary : 'white',
                color: categoriaFiltro === cat ? 'white' : COLORS.primary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {tiposFiltrados.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {tiposFiltrados.map(tipo => {
              const seleccionado = tipoSeleccionado && tipoSeleccionado.id === tipo.id;
              const colorSemaforo = COLOR_SEMAFORO[tipo.metricas?.semaforo] || COLORS.border;
              return (
                <button
                  key={tipo.id}
                  onClick={() => seleccionarTipo(tipo)}
                  style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    borderLeft: `6px solid ${colorSemaforo}`,
                    border: seleccionado ? `2px solid ${COLORS.secondary}` : `1px solid ${COLORS.border}`,
                    borderLeftWidth: '6px',
                    borderLeftColor: colorSemaforo,
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                    display: 'block',
                    width: '100%'
                  }}
                >
                  <p style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.primary, margin: '0 0 6px 0' }}>{tipo.nombre}</p>
                  <p style={{ fontSize: '12px', color: '#999', margin: '0 0 8px 0' }}>{tipo.categoria || 'Otros'}</p>
                  {tipo.metricas && (
                    <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                      Disponibles: <strong>{tipo.metricas.disponibles}</strong> · Pendientes: <strong>{tipo.metricas.pendientes}</strong>
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: '16px', color: '#999' }}>No hay tipos de balones en esta categoría</p>
        )}

        {tipoSeleccionado && (
          <div style={{ marginTop: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>
              {tipoSeleccionado.nombre}
            </h2>

            {cargandoDetalle && <p style={{ color: '#999' }}>Cargando métricas...</p>}

            {detalle && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Fabricadas</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.primary }}>{detalle.metricas.fabricadas}</p>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Defectuosas</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.danger }}>{detalle.metricas.defectuosas}</p>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Entregadas</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.primary }}>{detalle.metricas.entregadas}</p>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Pendientes</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLORS.warning }}>{detalle.metricas.pendientes}</p>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f5f5f5', textAlign: 'center', borderTop: `4px solid ${COLOR_SEMAFORO[detalle.metricas.semaforo]}` }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Disponibles</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: COLOR_SEMAFORO[detalle.metricas.semaforo] }}>{detalle.metricas.disponibles}</p>
                  </div>
                </div>

                <h3 style={{ fontSize: '15px', color: COLORS.primary, marginBottom: '10px' }}>
                  📦 Trazabilidad de lotes ({detalle.lotes.length})
                </h3>
                {detalle.lotes.length > 0 ? (
                  <div style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}>
                          <th style={{ padding: '6px' }}>Fecha</th>
                          <th style={{ padding: '6px' }}>Operario</th>
                          <th style={{ padding: '6px' }}>Buenas</th>
                          <th style={{ padding: '6px' }}>Defectuosas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.lotes.map(l => (
                          <tr key={l.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                            <td style={{ padding: '6px' }}>{new Date(l.fecha).toLocaleDateString('es-CO')}</td>
                            <td style={{ padding: '6px' }}>{l.operario_nombre}</td>
                            <td style={{ padding: '6px', color: COLORS.success }}>{l.unidades_buenas}</td>
                            <td style={{ padding: '6px', color: (l.unidades_defectuosas || 0) > 0 ? COLORS.danger : '#999' }}>{l.unidades_defectuosas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#999', marginBottom: '20px' }}>
                    Todavía no hay producción registrada para esta referencia. Al registrar producción, selecciona el tipo de balón para que empiece a contar aquí.
                  </p>
                )}
              </>
            )}

            <h3 style={{ fontSize: '15px', color: COLORS.primary, marginBottom: '10px' }}>
              Pedidos de esta referencia ({pedidosDelTipo.length})
            </h3>
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
    const [form, setForm] = useState({
      operario_id: '',
      tarea_id: '',
      pedido_id: '',
      tipo_balon_id: '',
      unidades_buenas: 1,
      unidades_defectuosas: 0,
      fecha: new Date().toISOString().slice(0, 10),
      observaciones: ''
    });

    // Historia 3: cronómetro por operario/tarea. horaInicioRef guarda el
    // Date real; segundosTranscurridos solo es para refrescar el texto en
    // pantalla cada segundo (setInterval no puede leer un useState directo
    // de forma confiable, por eso el valor real vive en el ref).
    const [cronometroActivo, setCronometroActivo] = useState(false);
    const [segundosTranscurridos, setSegundosTranscurridos] = useState(0);
    const [horaInicioCrono, setHoraInicioCrono] = useState(null);
    const [horaFinCrono, setHoraFinCrono] = useState(null);

    useEffect(() => {
      if (!cronometroActivo || !horaInicioCrono) return;
      const intervalo = setInterval(() => {
        setSegundosTranscurridos(Math.floor((new Date() - horaInicioCrono) / 1000));
      }, 1000);
      return () => clearInterval(intervalo);
    }, [cronometroActivo, horaInicioCrono]);

    const formatearTiempo = (totalSegundos) => {
      const h = Math.floor(totalSegundos / 3600);
      const m = Math.floor((totalSegundos % 3600) / 60);
      const s = totalSegundos % 60;
      return h > 0
        ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const iniciarCronometro = () => {
      if (!form.operario_id || !form.tarea_id) {
        alert('Selecciona operario y tarea antes de iniciar el cronómetro');
        return;
      }
      const ahora = new Date();
      setHoraInicioCrono(ahora);
      setHoraFinCrono(null);
      setSegundosTranscurridos(0);
      setCronometroActivo(true);
    };

    const detenerCronometro = () => {
      setHoraFinCrono(new Date());
      setCronometroActivo(false);
    };

    const totalUnidades = (parseFloat(form.unidades_buenas) || 0) + (parseFloat(form.unidades_defectuosas) || 0);

    const registrarProduccion = async () => {
      if (!form.operario_id || !form.tarea_id) {
        alert('Seleccione operario y tarea');
        return;
      }
      if (totalUnidades <= 0) {
        alert('Registra al menos una unidad (buena o defectuosa)');
        return;
      }

      const payload = { ...form };
      // Solo se manda hora_inicio/hora_fin si de verdad se usó el
      // cronómetro y ya se detuvo; si no, el registro queda sin duración,
      // igual que antes.
      if (horaInicioCrono && horaFinCrono) {
        payload.hora_inicio = horaInicioCrono.toISOString();
        payload.hora_fin = horaFinCrono.toISOString();
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
          setForm({
            operario_id: '',
            tarea_id: '',
            pedido_id: '',
            tipo_balon_id: '',
            unidades_buenas: 1,
            unidades_defectuosas: 0,
            fecha: new Date().toISOString().slice(0, 10),
            observaciones: ''
          });
          setHoraInicioCrono(null);
          setHoraFinCrono(null);
          setSegundosTranscurridos(0);
        } else {
          const data = await res.json();
          alert('❌ ' + (data.error || 'Error al registrar'));
        }
      } catch (error) {
        alert('❌ Error: ' + error.message);
      }
    };

    // Historia 3, Escenario 3: tiempo promedio por operario, calculado a
    // partir de los registros ya cargados que sí tienen duración guardada.
    const tiempoPromedioPorOperario = React.useMemo(() => {
      const acumulado = {};
      produccion.forEach(p => {
        if (!p.duracion_segundos) return;
        if (!acumulado[p.operario_nombre]) {
          acumulado[p.operario_nombre] = { total: 0, cantidad: 0 };
        }
        acumulado[p.operario_nombre].total += p.duracion_segundos;
        acumulado[p.operario_nombre].cantidad += 1;
      });
      return Object.entries(acumulado).map(([nombre, { total, cantidad }]) => ({
        nombre,
        promedioSegundos: Math.round(total / cantidad),
        registros: cantidad
      }));
    }, [produccion]);

    return (
      <div style={{ padding: '30px' }}>
        <h1 style={{ fontSize: '28px', color: COLORS.primary, marginBottom: '30px' }}>
          📝 Registro de Producción
        </h1>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '20px' }}>
            Nueva Tarea Realizada
          </h2>

          <select
            value={form.operario_id}
            onChange={(e) => setForm({ ...form, operario_id: e.target.value })}
            disabled={cronometroActivo}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', opacity: cronometroActivo ? 0.6 : 1 }}
          >
            <option value="">-- Seleccionar Operario --</option>
            {operarios.map(op => (
              <option key={op.id} value={op.id}>{op.nombre}</option>
            ))}
          </select>

          <select
            value={form.tarea_id}
            onChange={(e) => setForm({ ...form, tarea_id: e.target.value })}
            disabled={cronometroActivo}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', opacity: cronometroActivo ? 0.6 : 1 }}
          >
            <option value="">-- Seleccionar Tarea --</option>
            {tareas.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>

          <select
            value={form.pedido_id}
            onChange={(e) => setForm({ ...form, pedido_id: e.target.value })}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          >
            <option value="">-- Pedido (opcional) --</option>
            {pedidos.map(p => (
              <option key={p.id} value={p.id}>{p.numero_pedido} - {p.cliente}</option>
            ))}
          </select>

          <select
            value={form.tipo_balon_id}
            onChange={(e) => setForm({ ...form, tipo_balon_id: e.target.value })}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          >
            <option value="">-- Tipo de balón (opcional, pero recomendado) --</option>
            {tiposBalon.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          <p style={{ fontSize: '11px', color: '#999', margin: '-6px 0 10px 0' }}>
            Selecciónalo para que esta producción cuente en "Tipos Balón" (fabricadas, disponibles, trazabilidad).
          </p>

          <div style={{
            backgroundColor: cronometroActivo ? '#fff3cd' : '#f5f5f5',
            border: `1px solid ${cronometroActivo ? COLORS.warning : COLORS.border}`,
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '15px',
            textAlign: 'center'
          }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#666', fontWeight: 'bold' }}>
              ⏱️ Cronómetro de tarea
            </p>
            <p style={{ margin: '0 0 10px 0', fontSize: '26px', fontFamily: 'monospace', color: COLORS.primary }}>
              {formatearTiempo(segundosTranscurridos)}
            </p>
            {!cronometroActivo ? (
              <button
                onClick={iniciarCronometro}
                style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.success, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ▶️ Iniciar cronómetro
              </button>
            ) : (
              <button
                onClick={detenerCronometro}
                style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: COLORS.danger, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ⏹️ Detener
              </button>
            )}
            {horaInicioCrono && horaFinCrono && (
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                Tiempo capturado: {formatearTiempo(segundosTranscurridos)} — se guardará junto con este registro.
              </p>
            )}
          </div>

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
            Unidades buenas
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={form.unidades_buenas}
            onChange={(e) => setForm({ ...form, unidades_buenas: e.target.value })}
            placeholder="Unidades buenas"
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          />

          <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
            Unidades defectuosas
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={form.unidades_defectuosas}
            onChange={(e) => setForm({ ...form, unidades_defectuosas: e.target.value })}
            placeholder="Unidades defectuosas"
            style={{ width: '100%', padding: '10px', marginBottom: '4px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: '13px', color: '#999', margin: '0 0 10px 0' }}>
            Total de unidades: <strong>{totalUnidades}</strong>
          </p>

          <input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
          />

          <textarea
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            placeholder="Observaciones (opcional)"
            style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', minHeight: '60px' }}
          />

          <button
            onClick={registrarProduccion}
            style={{ width: '100%', padding: '12px', backgroundColor: COLORS.success, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✅ Registrar Producción
          </button>
        </div>

        {tiempoPromedioPorOperario.length > 0 && (
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>
              ⏱️ Tiempo promedio por operario
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '15px' }}>
              {tiempoPromedioPorOperario.map(t => (
                <div key={t.nombre} style={{ padding: '12px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${COLORS.warning}` }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: COLORS.primary }}>{t.nombre}</p>
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                    Promedio: <strong>{formatearTiempo(t.promedioSegundos)}</strong> ({t.registros} {t.registros === 1 ? 'registro' : 'registros'} con tiempo)
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: '18px', color: COLORS.primary, marginBottom: '15px' }}>
          Últimos Registros ({produccion.length})
        </h2>
        {produccion.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {produccion.map(p => (
              <div key={p.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.secondary}` }}>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>
                  <strong>{new Date(p.fecha).toLocaleDateString('es-CO')}</strong>
                </p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{p.operario_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 5px 0' }}>Tarea: {p.tarea_nombre}</p>
                <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
                  Buenas: <strong style={{ color: COLORS.success }}>{p.unidades_buenas ?? p.cantidad}</strong>
                  {' · '}
                  Defectuosas: <strong style={{ color: (p.unidades_defectuosas || 0) > 0 ? COLORS.danger : '#666' }}>{p.unidades_defectuosas ?? 0}</strong>
                </p>
                <p style={{ fontSize: '12px', color: '#999', margin: '2px 0 0 0' }}>Total: {p.cantidad}</p>
                {p.duracion_segundos != null && (
                  <p style={{ fontSize: '12px', color: COLORS.primary, margin: '4px 0 0 0' }}>⏱️ Duración: {formatearTiempo(p.duracion_segundos)}</p>
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
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', color: '#999' }}>⏳ Cargando datos...</p>
            </div>
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
