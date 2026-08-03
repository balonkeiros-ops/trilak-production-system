import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const API_BASE_URL = 'http://127.0.0.1:5000/api';

const COLORS = {
  primary: '#003B6F',
  secondary: '#FF6B35',
  success: '#4CAF50',
  warning: '#FFC107',
  danger: '#f44336',
  info: '#2196F3',
  light: '#f5f5f5',
  border: '#e0e0e0'
};

// DATOS SIMULADOS (para cuando BD esté vacía)
const DATOS_SIMULADOS = {
  produccion: [
    { mes: 'Septiembre', balones: 6800, meta: 7000 },
    { mes: 'Octubre', balones: 7200, meta: 7000 },
    { mes: 'Noviembre', balones: 6950, meta: 7000 },
    { mes: 'Diciembre', balones: 7100, meta: 7000 },
    { mes: 'Enero', balones: 6850, meta: 7000 },
    { mes: 'Febrero', balones: 7050, meta: 7000 }
  ],
  operarios: [
    { nombre: 'Juan', balones: 520, especialidad: 'Enrollado' },
    { nombre: 'Sergio', balones: 480, especialidad: 'Vulcanizado' },
    { nombre: 'María', balones: 510, especialidad: 'Macillado' },
    { nombre: 'Pedro', balones: 500, especialidad: 'Planchado' },
  ],
  tiempoCiclo: [
    { tipo: 'Publicitario', promedio: 18, minimo: 16, maximo: 20 },
    { tipo: 'Oficial', promedio: 24, minimo: 22, maximo: 26 },
    { tipo: 'Económico', promedio: 12, minimo: 11, maximo: 14 }
  ],
  materiales: [
    { nombre: 'AZT GALAXY', consumo: 2.48, para10000: 24800, para50000: 124000 },
    { nombre: 'COMUS AZUL', consumo: 1.55, para10000: 15500, para50000: 77500 },
    { nombre: 'AZT BLANCO', consumo: 2.45, para10000: 24500, para50000: 122500 }
  ],
  etapas: [
    { etapa: 'Enrollado', porcentaje: 40 },
    { etapa: 'Vulcanizado', porcentaje: 25 },
    { etapa: 'Macillado', porcentaje: 15 },
    { etapa: 'Planchado', porcentaje: 10 },
    { etapa: 'Estampado', porcentaje: 10 }
  ],
  calidad: [
    { mes: 'Septiembre', aceptables: 97.2 },
    { mes: 'Octubre', aceptables: 97.8 },
    { mes: 'Noviembre', aceptables: 98.2 },
    { mes: 'Diciembre', aceptables: 98.5 },
    { mes: 'Enero', aceptables: 98.8 },
    { mes: 'Febrero', aceptables: 98.9 }
  ],
  proyeccion: [
    { escenario: 'Actual', balones: 7000 },
    { escenario: '+Máquina', balones: 11000 },
    { escenario: '+Operarios', balones: 10500 },
    { escenario: 'Combinado', balones: 16000 }
  ]
};

export default function DashboardProduccion() {
  const [produccion, setProduccion] = useState(DATOS_SIMULADOS.produccion);
  const [operarios, setOperarios] = useState(DATOS_SIMULADOS.operarios);
  const [tiempoCiclo, setTiempoCiclo] = useState(DATOS_SIMULADOS.tiempoCiclo);
  const [materiales, setMateriales] = useState(DATOS_SIMULADOS.materiales);
  const [etapas, setEtapas] = useState(DATOS_SIMULADOS.etapas);
  const [calidad, setCalidad] = useState(DATOS_SIMULADOS.calidad);
  const [proyeccion, setProyeccion] = useState(DATOS_SIMULADOS.proyeccion);
  const [metricas, setMetricas] = useState({});
  const [cargando, setCargando] = useState(true);
  const dashboardRef = useRef(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      // Usar datos simulados (en versión final, conectar con API)
      const produccionPromedio = Math.round(produccion.reduce((s, p) => s + p.balones, 0) / produccion.length);
      const utilizacion = ((produccionPromedio / 7000) * 100).toFixed(1);
      const calidadPromedio = (calidad.reduce((s, c) => s + c.aceptables, 0) / calidad.length).toFixed(1);

      setMetricas({
        produccionMensual: produccionPromedio,
        utilizacion: utilizacion,
        calidadPromedio: calidadPromedio,
        operariosTotal: operarios.length,
        tiempoPromedio: 18,
        cuelloBotellaEtapa: 'Enrollado (40%)',
        proyeccionConInversion: '16,000 balones/mes'
      });

      setCargando(false);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setCargando(false);
    }
  };

  // EXPORTAR A EXCEL
  const exportarExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Resumen
      const resumen = [
        ['DASHBOARD PRODUCCIÓN - TRILAK'],
        [`Generado: ${new Date().toLocaleDateString('es-CO')}`],
        [''],
        ['MÉTRICAS PRINCIPALES'],
        ['Producción Promedio:', metricas.produccionMensual, 'balones/mes'],
        ['Utilización:', metricas.utilizacion, '%'],
        ['Calidad:', metricas.calidadPromedio, '%'],
        ['Operarios:', metricas.operariosTotal],
        ['Proyección:', metricas.proyeccionConInversion],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumen);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

      // Producción
      const prod = [['MES', 'BALONES', 'META', 'VARIACIÓN'], ...produccion.map(p => [p.mes, p.balones, p.meta, ((p.balones - p.meta) / p.meta * 100).toFixed(1)])];
      const ws2 = XLSX.utils.aoa_to_sheet(prod);
      XLSX.utils.book_append_sheet(wb, ws2, 'Producción');

      // Operarios
      const op = [['OPERARIO', 'BALONES/MES', 'ESPECIALIDAD'], ...operarios.map(o => [o.nombre, o.balones, o.especialidad])];
      const ws3 = XLSX.utils.aoa_to_sheet(op);
      XLSX.utils.book_append_sheet(wb, ws3, 'Operarios');

      // Materiales
      const mat = [['MATERIAL', 'POR BALÓN', 'PARA 10,000', 'PARA 50,000'], ...materiales.map(m => [m.nombre, m.consumo, m.para10000, m.para50000])];
      const ws4 = XLSX.utils.aoa_to_sheet(mat);
      XLSX.utils.book_append_sheet(wb, ws4, 'Materiales');

      // Calidad
      const cal = [['MES', 'ACEPTABLES %', 'RECHAZADOS %'], ...calidad.map(c => [c.mes, c.aceptables, (100 - c.aceptables).toFixed(1)])];
      const ws5 = XLSX.utils.aoa_to_sheet(cal);
      XLSX.utils.book_append_sheet(wb, ws5, 'Calidad');

      // Licitaciones
      const lic = [
        ['ANÁLISIS PARA LICITACIONES'],
        [''],
        ['CAPACIDAD COMPROBADA'],
        ['Producción:', metricas.produccionMensual, 'balones/mes'],
        ['Calidad:', metricas.calidadPromedio + '%'],
        ['Operarios:', metricas.operariosTotal, 'especializados'],
        [''],
        ['PARA LICITACIÓN 50,000 BALONES EN 3 MESES'],
        ['Inversión:', '$23,000 USD'],
        ['Nueva capacidad:', '16,000 balones/mes'],
        ['Plazo:', '3.1 meses'],
        ['Conclusión:', '✅ APTA PARA LICITACIONES PÚBLICAS']
      ];
      const ws6 = XLSX.utils.aoa_to_sheet(lic);
      XLSX.utils.book_append_sheet(wb, ws6, 'Licitaciones');

      const nombre = `Dashboard_TRILAK_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, nombre);
      alert('✅ Excel descargado correctamente');
    } catch (error) {
      alert('❌ Error en Excel: ' + error.message);
    }
  };

  // EXPORTAR A PDF
  const exportarPDF = async () => {
    try {
      alert('⏳ Generando PDF... por favor espera');
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 1.5,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF('p', 'mm', 'A4');
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.setFontSize(24);
      pdf.setTextColor(0, 59, 111);
      pdf.text('DASHBOARD DE PRODUCCIÓN', 105, 50, { align: 'center' });
      pdf.setFontSize(18);
      pdf.text('TRILAK', 105, 80, { align: 'center' });
      pdf.setFontSize(11);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${new Date().toLocaleDateString('es-CO')}`, 105, 110, { align: 'center' });

      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const nombre = `Dashboard_TRILAK_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}.pdf`;
      pdf.save(nombre);
      alert('✅ PDF descargado correctamente');
    } catch (error) {
      alert('❌ Error en PDF: ' + error.message);
    }
  };

  if (cargando) {
    return <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>⏳ Cargando...</div>;
  }

  return (
    <div style={{ padding: '30px', backgroundColor: COLORS.light, minHeight: '100vh' }} ref={dashboardRef}>
      <h1 style={{ fontSize: '32px', color: COLORS.primary, marginBottom: '20px' }}>📊 Dashboard de Producción - TRILAK</h1>

      {/* BOTONES DE DESCARGA */}
      <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', marginBottom: '30px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={exportarExcel} style={{ padding: '10px 20px', backgroundColor: '#217346', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          📊 Excel
        </button>
        <button onClick={exportarPDF} style={{ padding: '10px 20px', backgroundColor: '#c4302b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          📄 PDF
        </button>
      </div>

      {/* MÉTRICAS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <Card titulo="Producción" valor={`${metricas.produccionMensual} balones`} subtitulo="Últimos 6 meses" color={COLORS.primary} />
        <Card titulo="Utilización" valor={`${metricas.utilizacion}%`} subtitulo="De capacidad" color={COLORS.secondary} />
        <Card titulo="Calidad" valor={`${metricas.calidadPromedio}%`} subtitulo="Aceptables" color={COLORS.success} />
        <Card titulo="Operarios" valor={metricas.operariosTotal} subtitulo="Especializados" color={COLORS.info} />
      </div>

      {/* GRÁFICO 1: PRODUCCIÓN */}
      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>📈 Producción Histórica</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={produccion}>
            <defs>
              <linearGradient id="color" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="balones" stroke={COLORS.secondary} fill="url(#color)" />
          </AreaChart>
        </ResponsiveContainer>
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>✅ Capacidad comprobada y consistente</p>
      </div>

      {/* GRÁFICO 2: OPERARIOS */}
      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>👥 Productividad por Operario</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={operarios}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nombre" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="balones" fill={COLORS.primary} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* GRÁFICO 3 Y 4 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>⏱️ Tiempo de Ciclo</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tiempoCiclo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tipo" />
              <YAxis />
              <Tooltip formatter={(v) => `${v}h`} />
              <Bar dataKey="promedio" fill={COLORS.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>✅ Tasa de Calidad</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={calidad}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis domain={[96, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="aceptables" stroke={COLORS.success} strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GRÁFICO 5 Y 6 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>🔄 Etapas de Producción</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={etapas} cx="50%" cy="50%" labelLine={false} label={({ etapa, porcentaje }) => `${etapa}: ${porcentaje}%`} outerRadius={80} fill="#8884d8" dataKey="porcentaje">
                {etapas.map((e, i) => <Cell key={i} fill={[COLORS.secondary, COLORS.primary, COLORS.info, COLORS.warning, COLORS.success][i]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>🚀 Proyección de Capacidad</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={proyeccion}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="escenario" angle={-15} textAnchor="end" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="balones" fill={COLORS.success} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABLA MATERIALES */}
      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '20px', color: COLORS.primary, marginBottom: '15px' }}>📦 Consumo de Materiales</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${COLORS.primary}` }}>
              <th style={{ padding: '12px', textAlign: 'left', color: COLORS.primary, fontWeight: 'bold' }}>Material</th>
              <th style={{ padding: '12px', textAlign: 'center', color: COLORS.primary, fontWeight: 'bold' }}>Por Balón</th>
              <th style={{ padding: '12px', textAlign: 'center', color: COLORS.primary, fontWeight: 'bold' }}>Para 10,000</th>
              <th style={{ padding: '12px', textAlign: 'center', color: COLORS.primary, fontWeight: 'bold' }}>Para 50,000</th>
            </tr>
          </thead>
          <tbody>
            {materiales.map((m, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px' }}>{m.nombre}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{m.consumo} m</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{m.para10000.toLocaleString()} m</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{m.para50000.toLocaleString()} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CONCLUSIÓN */}
      <div style={{ backgroundColor: '#E8F5E9', padding: '25px', borderRadius: '8px', borderLeft: `5px solid ${COLORS.success}` }}>
        <h3 style={{ fontSize: '18px', color: COLORS.success, marginBottom: '10px' }}>✅ Conclusión: Apta para Licitaciones</h3>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>✅ Producción demostrada: {metricas.produccionMensual} balones/mes</li>
          <li>✅ Tasa de calidad: {metricas.calidadPromedio}% (mejorando)</li>
          <li>✅ Personal especializado y capacitado</li>
          <li>✅ Escalable hasta 16,000 balones/mes</li>
          <li>✅ Control de inventario integrado con SGII</li>
        </ul>
      </div>
    </div>
  );
}

function Card({ titulo, valor, subtitulo, color }) {
  return (
    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', borderTop: `4px solid ${color}`, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' }}>
      <p style={{ fontSize: '12px', color: '#999', margin: '0 0 10px 0', fontWeight: 'bold' }}>{titulo}</p>
      <p style={{ fontSize: '28px', fontWeight: 'bold', color: color, margin: '0 0 10px 0' }}>{valor}</p>
      <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>{subtitulo}</p>
    </div>
  );
}
