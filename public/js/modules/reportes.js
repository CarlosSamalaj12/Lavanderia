/**
 * Módulo de Reportes, Filtros y Exportación CSV
 * Módulo ES6 con compatibilidad global
 */

import { API } from '../core/api.js';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  showError,
  showWarning,
  setSearchCounter,
  setActiveSearchItem,
  focusField,
  resolverCoincidenciaPorNombre
} from '../core/ui.js';

let prendaReporteSeleccionada = null;
let reporteStockVista = 'ejecutiva';

export async function loadFiltrosReporte() {
  const token = window.token;
  try {
    const res = await fetch(`${API}/trabajadores`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    const trabSelect = document.getElementById('reporteTrabajador');
    if (trabSelect) {
      trabSelect.innerHTML = '<option value="">Todos los trabajadores</option>' +
        (Array.isArray(data) ? data : []).map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
    }

    const resDeptos = await fetch(`${API}/departamentos`, { headers: { 'x-access-token': token } });
    const deptos = await resDeptos.json();
    const deptoSelect = document.getElementById('reporteDepartamento');
    if (deptoSelect) {
      deptoSelect.innerHTML = '<option value="">Todos los departamentos</option>' +
        (Array.isArray(deptos) ? deptos : []).map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
    }

    updateReporteFilterVisibility('pedidos');
  } catch (err) {
    console.error('Error al cargar filtros de reporte:', err);
  }
}

export function updateReporteFilterVisibility(tipo) {
  const showPedidos = tipo === 'pedidos' || tipo === 'pedidos-resumen';
  const showPagos = tipo === 'pagos' || tipo === 'pagos-resumen' || tipo === 'tareas-completadas';
  const showPrenda = tipo === 'stock-prenda';
  const showProcesoTarea = tipo === 'tareas-completadas';

  const deptoWrap = document.getElementById('filtroDepartamentoWrap');
  if (deptoWrap) deptoWrap.style.display = showPedidos ? 'block' : 'none';

  const estadoWrap = document.getElementById('filtroEstadoPedidoWrap');
  if (estadoWrap) estadoWrap.style.display = tipo === 'pedidos' ? 'block' : 'none';

  const numWrap = document.getElementById('filtroNumeroPedidoWrap');
  if (numWrap) numWrap.style.display = tipo === 'pedidos' ? 'block' : 'none';

  const trabSelect = document.getElementById('reporteTrabajador');
  if (trabSelect && trabSelect.parentElement) {
    trabSelect.parentElement.style.display = showPagos ? 'block' : 'none';
  }

  const prendaWrap = document.getElementById('filtroPrendaWrap');
  if (prendaWrap) prendaWrap.style.display = showPrenda ? 'block' : 'none';

  const procWrap = document.getElementById('filtroProcesoTareaWrap');
  if (procWrap) procWrap.style.display = showProcesoTarea ? 'block' : 'none';
}

export async function buscarPrendaReporte() {
  const q = (document.getElementById('reporteBuscarPrenda')?.value || '').trim();
  const box = document.getElementById('reportePrendaResultados');
  if (!box) return;

  if (q.length < 1) {
    box.style.display = 'none';
    box.innerHTML = '';
    setSearchCounter('contadorPrendaReporte', 0, 0);
    return;
  }

  try {
    const res = await fetch(`${API}/prendas?q=${encodeURIComponent(q)}`, {
      headers: { 'x-access-token': window.token }
    });
    const data = await res.json();
    const sliced = (Array.isArray(data) ? data : []).slice(0, 20);

    box.innerHTML = sliced.map(p => `
      <div class="search-result-item" onclick="seleccionarPrendaReporte(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">
        <strong>${p.nombre}</strong>
        ${p.descripcion ? `<span style="color:#95a5a6; font-size:12px;"> - ${p.descripcion}</span>` : ''}
      </div>
    `).join('') || '<div style="padding:10px; color:#7f8c8d;">Sin resultados</div>';

    box.style.display = 'block';
    setSearchCounter('contadorPrendaReporte', sliced.length, (data || []).length);
    if (sliced.length) setActiveSearchItem('reportePrendaResultados', 0);
  } catch (err) {
    console.error('Error buscando prendas para reporte:', err);
  }
}

export function seleccionarPrendaReporte(id, nombre) {
  prendaReporteSeleccionada = { id, nombre };
  const idInput = document.getElementById('reportePrendaId');
  if (idInput) idInput.value = id;
  const searchInput = document.getElementById('reporteBuscarPrenda');
  if (searchInput) searchInput.value = nombre;
  const box = document.getElementById('reportePrendaResultados');
  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
  setSearchCounter('contadorPrendaReporte', 1, 1);
}

export function setReporteStockVista(vista) {
  reporteStockVista = vista === 'simple' ? 'simple' : 'ejecutiva';
  if (document.querySelector('.tab.active')?.id === 'tab-stock-prenda') {
    reporte('stock-prenda');
  }
}

export function actualizarMinFechaFin() {
  const fechaInicio = document.getElementById('reporteFechaInicio')?.value;
  const fechaFin = document.getElementById('reporteFechaFin');
  if (!fechaFin) return;

  if (fechaInicio) {
    fechaFin.min = fechaInicio;
    if (fechaFin.value && fechaFin.value < fechaInicio) {
      fechaFin.value = '';
    }
  } else {
    fechaFin.min = '';
  }
}

export function aplicarFiltros() {
  const fechaInicio = document.getElementById('reporteFechaInicio')?.value;
  const fechaFin = document.getElementById('reporteFechaFin')?.value;

  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    showError('La fecha final no puede ser menor a la fecha inicial');
    return;
  }

  const activeTab = document.querySelector('.tab.active')?.id || 'tab-pedidos';
  const tipoActual = activeTab.replace('tab-', '');
  reporte(tipoActual);
}

export function getMondayFromIsoWeek(weekValue) {
  if (!weekValue || !weekValue.includes('-W')) return null;
  const parts = weekValue.split('-W');
  const year = Number(parts[0]);
  const week = Number(parts[1]);
  if (!year || !week) return null;

  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - jan4Day + 1);

  const monday = new Date(mondayWeek1);
  monday.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return monday;
}

export function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function aplicarSemanaReporte() {
  const weekEl = document.getElementById('reporteSemana');
  if (!weekEl) return;
  const week = weekEl.value;
  const monday = getMondayFromIsoWeek(week);
  if (!monday) {
    showWarning('Selecciona una semana válida.');
    return;
  }
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const inicioInput = document.getElementById('reporteFechaInicio');
  const finInput = document.getElementById('reporteFechaFin');
  if (inicioInput) inicioInput.value = formatDateInput(monday);
  if (finInput) finInput.value = formatDateInput(sunday);

  actualizarMinFechaFin();
  aplicarFiltros();
}

export function seleccionarTab(tipo) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const targetTab = document.getElementById('tab-' + tipo);
  if (targetTab) targetTab.classList.add('active');
  updateReporteFilterVisibility(tipo);
  reporte(tipo);
}

export function toCSVValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n;]+/g, ' ').trim();
}

export function descargarCSV(nombre, headers, rows) {
  const encabezado = headers.join(';');
  const cuerpo = rows.map(row => row.map(toCSVValue).join(';')).join('\n');
  const contenido = `${encabezado}\n${cuerpo}`;
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportarReporteActualCSV() {
  const tipo = window.reporteActualTipo;
  const data = window.reporteActualData || [];

  if (!tipo || !data.length) {
    showError('No hay datos para exportar');
    return;
  }

  const fecha = new Date().toISOString().slice(0, 10);

  if (tipo === 'pedidos') {
    descargarCSV(
      `reporte_pedidos_${fecha}.csv`,
      ['ID', 'Departamento', 'Fecha', 'Estado'],
      data.map(p => [p.id, p.departamento_nombre, formatDate(p.fecha_pedido), p.estado])
    );
    return;
  }

  if (tipo === 'pedidos-resumen') {
    descargarCSV(
      `reporte_resumen_pedidos_${fecha}.csv`,
      ['Departamento', 'Total', 'Pendientes', 'Entregados', 'Cancelados'],
      data.map(d => [d.departamento, d.total_pedidos, d.pedidos_pendientes, d.pedidos_entregados, d.pedidos_cancelados])
    );
    return;
  }

  if (tipo === 'pagos') {
    descargarCSV(
      `reporte_pagos_${fecha}.csv`,
      ['Trabajador', 'Prenda', 'Proceso', 'Cantidad', 'Precio Unitario', 'Total', 'Fecha'],
      data.map(t => [t.trabajador_nombre, t.prenda_nombre, t.proceso, t.cantidad, t.precio_unitario, t.total, formatDate(t.fecha_fin)])
    );
    return;
  }

  if (tipo === 'pagos-resumen') {
    descargarCSV(
      `reporte_resumen_pagos_${fecha}.csv`,
      ['Trabajador', 'Factura', 'Cantidad Tareas', 'Total a Pagar'],
      data.map(p => [p.trabajador_nombre, p.factura ? 'Si' : 'No', p.total_tareas, p.total_pagar])
    );
    return;
  }

  if (tipo === 'tareas-completadas') {
    descargarCSV(
      `reporte_tareas_completadas_${fecha}.csv`,
      ['Trabajador', 'Prenda', 'Proceso', 'Cantidad', 'Precio Unitario', 'Total', 'Fecha Completada'],
      data.map(t => [t.trabajador_nombre, t.prenda_nombre, t.proceso, t.cantidad, t.precio_unitario, t.total, formatDateTime(t.fecha_fin)])
    );
    return;
  }

  if (tipo === 'stock-prenda') {
    descargarCSV(
      `reporte_stock_prenda_${fecha}.csv`,
      ['Prenda', 'Proceso', 'Cantidad', 'Departamento'],
      data.map(r => [r.prenda_nombre || '', r.proceso || '', r.cantidad || 0, r.departamento_nombre || 'Lavanderia'])
    );
  }
}

export async function reporte(tipo) {
  const token = window.token;
  const fechaInicio = document.getElementById('reporteFechaInicio')?.value || '';
  const fechaFin = document.getElementById('reporteFechaFin')?.value || '';
  const trabajadorId = document.getElementById('reporteTrabajador')?.value || '';
  const departamentoId = document.getElementById('reporteDepartamento')?.value || '';
  const estadoPedido = document.getElementById('reporteEstadoPedido')?.value || '';
  const numeroPedido = document.getElementById('reporteNumeroPedido')?.value || '';
  const procesoTarea = document.getElementById('reporteProcesoTarea')?.value || '';

  const params = [];
  if (fechaInicio) params.push(`fecha_inicio=${fechaInicio}`);
  if (fechaFin) params.push(`fecha_fin=${fechaFin}`);
  if ((tipo === 'pagos' || tipo === 'pagos-resumen' || tipo === 'tareas-completadas') && trabajadorId) params.push(`trabajador_id=${trabajadorId}`);
  if ((tipo === 'pedidos' || tipo === 'pedidos-resumen') && departamentoId) params.push(`departamento_id=${departamentoId}`);
  if (tipo === 'pedidos' && estadoPedido) params.push(`estado=${estadoPedido}`);
  if (tipo === 'pedidos' && numeroPedido) params.push(`pedido_id=${numeroPedido}`);
  if (tipo === 'tareas-completadas' && procesoTarea) params.push(`proceso=${procesoTarea}`);
  const queryString = params.length > 0 ? '?' + params.join('&') : '';

  const reportLogo = localStorage.getItem('print_logo_base64');
  const reportLogoHtml = reportLogo
    ? `<div style="text-align:center; margin-bottom:12px;"><img src="${reportLogo}" alt="Logo Reporte" style="max-height:58px; max-width:180px; object-fit:contain;"></div>`
    : '';

  const contentEl = document.getElementById('reporteContent');
  if (!contentEl) return;

  if (tipo === 'pedidos') {
    const res = await fetch(`${API}/reportes/pedidos${queryString}`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    window.reporteActualTipo = 'pedidos';
    window.reporteActualData = data;
    contentEl.innerHTML = `
      ${reportLogoHtml}
      <div style="margin-bottom:12px;"><button class="btn btn-primary" onclick="exportarReporteActualCSV()"><span class="mi">download</span>Exportar CSV</button></div>
      <table><thead><tr><th>ID</th><th>Departamento</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${(data || []).map(p => `<tr><td>${p.id}</td><td>${p.departamento_nombre}</td><td>${formatDate(p.fecha_pedido)}</td><td>${p.estado}</td></tr>`).join('')}</tbody></table>
    `;
  } else if (tipo === 'pedidos-resumen') {
    const res = await fetch(`${API}/reportes/pedidos/resumen${queryString}`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    window.reporteActualTipo = 'pedidos-resumen';
    window.reporteActualData = data;
    const total = (data || []).reduce((acc, d) => acc + (d.total_pedidos || 0), 0);
    contentEl.innerHTML = `
      ${reportLogoHtml}
      <div style="margin-bottom:12px;"><button class="btn btn-primary" onclick="exportarReporteActualCSV()"><span class="mi">download</span>Exportar CSV</button></div>
      <table><thead><tr><th>Departamento</th><th>Total</th><th>Pendientes</th><th>Entregados</th><th>Cancelados</th></tr></thead>
      <tbody>${(data || []).map(d => `<tr><td>${d.departamento}</td><td>${d.total_pedidos}</td><td>${d.pedidos_pendientes}</td><td>${d.pedidos_entregados}</td><td>${d.pedidos_cancelados}</td></tr>`).join('')}</tbody></table>
      <div style="margin-top:14px; padding:12px; background:#eef6ff; border:1px solid #cfe0f5; border-radius:10px;"><strong>Total pedidos del periodo:</strong> ${total}</div>
    `;
  } else if (tipo === 'pagos') {
    const res = await fetch(`${API}/reportes/pagos${queryString}`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    window.reporteActualTipo = 'pagos';
    window.reporteActualData = data;

    const trabajadoresMap = {};
    (data || []).forEach(t => {
      if (!trabajadoresMap[t.trabajador_id]) {
        trabajadoresMap[t.trabajador_id] = {
          nombre: t.trabajador_nombre,
          factura: t.factura,
          tareas: []
        };
      }
      trabajadoresMap[t.trabajador_id].tareas.push(t);
    });

    let html = `${reportLogoHtml}<div style="margin-bottom:20px; display:flex; gap:10px;"><button class="btn btn-primary" onclick="reporte('pagos-resumen')"><span class="mi">analytics</span>Ver Resumen por Trabajador</button><button class="btn btn-primary" onclick="exportarReporteActualCSV()"><span class="mi">download</span>Exportar CSV</button></div>`;
    html += `<table style="width:100%;">
      <thead><tr><th>Trabajador</th><th>Prenda</th><th>Proceso</th><th>Cantidad</th><th>Precio Unit.</th><th>Total</th><th>Fecha</th></tr></thead>
      <tbody>`;

    Object.values(trabajadoresMap).forEach(trab => {
      trab.tareas.forEach(t => {
        html += `<tr>
          <td>${trab.nombre}</td>
          <td>${t.prenda_nombre}</td>
          <td style="text-transform:uppercase;">${t.proceso}</td>
          <td>${t.cantidad}</td>
          <td>${formatCurrency(t.precio_unitario)}</td>
          <td><strong>${formatCurrency(t.total)}</strong></td>
          <td>${formatDate(t.fecha_fin)}</td>
        </tr>`;
      });
    });

    html += `</tbody></table>`;
    const totalGeneral = (data || []).reduce((sum, t) => sum + (t.total || 0), 0);
    html += `<div style="margin-top:20px; padding:15px; background:linear-gradient(135deg,#27ae60,#219a52); color:white; border-radius:8px; text-align:right; font-size:18px;">
      <strong>Total General a Pagar: ${formatCurrency(totalGeneral)}</strong>
    </div>`;

    contentEl.innerHTML = html;
  } else if (tipo === 'pagos-resumen') {
    const urlResumen = `${API}/reportes/pagos/resumen-trabajador${queryString}`;
    const res = await fetch(urlResumen, { headers: { 'x-access-token': token } });
    const data = await res.json();
    window.reporteActualTipo = 'pagos-resumen';
    window.reporteActualData = data;

    const totalGeneral = (data || []).reduce((sum, t) => sum + (t.total_pagar || 0), 0);
    contentEl.innerHTML = `
      ${reportLogoHtml}
      <div style="margin-bottom:20px; display:flex; gap:10px;"><button class="btn btn-primary" onclick="reporte('pagos')"><span class="mi">list_alt</span>Ver Detalle por Prenda</button><button class="btn btn-primary" onclick="exportarReporteActualCSV()"><span class="mi">download</span>Exportar CSV</button></div>
      <table><thead><tr><th>Trabajador</th><th>¿Factura?</th><th>Cant. Tareas</th><th>Total a Pagar</th></tr></thead>
      <tbody>${(data || []).map(p => `<tr><td>${p.trabajador_nombre}</td><td>${p.factura ? 'Si' : 'No'}</td><td>${p.total_tareas}</td><td><strong>${formatCurrency(p.total_pagar)}</strong></td></tr>`).join('')}</tbody></table>
      <div style="margin-top:20px; padding:15px; background:linear-gradient(135deg,#27ae60,#219a52); color:white; border-radius:8px; text-align:right; font-size:18px;">
        <strong>Total General a Pagar: ${formatCurrency(totalGeneral)}</strong>
      </div>
    `;
  } else if (tipo === 'tareas-completadas') {
    const res = await fetch(`${API}/reportes/tareas/completadas${queryString}`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    window.reporteActualTipo = 'tareas-completadas';
    window.reporteActualData = data;

    contentEl.innerHTML = `
      ${reportLogoHtml}
      <div style="margin-bottom:12px;"><button class="btn btn-primary" onclick="exportarReporteActualCSV()"><span class="mi">download</span>Exportar CSV</button></div>
      <table><thead><tr><th>Trabajador</th><th>Prenda</th><th>Proceso</th><th>Cantidad</th><th>Precio Unit.</th><th>Total</th><th>Completada</th></tr></thead>
      <tbody>${(data || []).map(t => `<tr><td>${t.trabajador_nombre}</td><td>${t.prenda_nombre}</td><td>${t.proceso.toUpperCase()}</td><td>${t.cantidad}</td><td>${formatCurrency(t.precio_unitario || 0)}</td><td>${formatCurrency(t.total || 0)}</td><td>${formatDateTime(t.fecha_fin)}</td></tr>`).join('')}</tbody></table>
    `;
  } else if (tipo === 'stock-prenda') {
    let prendaId = document.getElementById('reportePrendaId')?.value;
    if (!prendaId) {
      const typed = (document.getElementById('reporteBuscarPrenda')?.value || '').trim();
      if (typed) {
        const cache = window.prendasCacheGlobal || [];
        const candidato = resolverCoincidenciaPorNombre(cache, typed);
        if (candidato) {
          seleccionarPrendaReporte(candidato.id, candidato.nombre);
          prendaId = candidato.id;
        }
      }
    }
    if (!prendaId) {
      focusField('reporteBuscarPrenda', 'No seleccionó la prenda para el reporte');
      contentEl.innerHTML = '<div style="padding:16px; border:1px solid #d7e4f1; border-radius:10px; background:#f8fbff; color:#52667c;">Selecciona una prenda en el buscador para ver su stock por proceso y departamento.</div>';
      window.reporteActualTipo = 'stock-prenda';
      window.reporteActualData = [];
      return;
    }

    const res = await fetch(`${API}/prendas/${prendaId}/stock-trazabilidad`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    const nombre = prendaReporteSeleccionada ? prendaReporteSeleccionada.nombre : `Prenda #${prendaId}`;
    window.reporteActualTipo = 'stock-prenda';
    window.reporteActualData = (data || []).map(d => ({ ...d, prenda_nombre: nombre }));

    const total = (data || []).reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
    const procesoColores = { sucio: '#e74c3c', remojo: '#e67e22', lavado: '#f1c40f', tendido: '#2ecc71', recogido: '#1abc9c', limpio: '#9b59b6', planchado: '#34495e', stock: '#00bcd4', desmanche: '#e91e63', reproceso: '#3498db' };
    const procesoNombres = { sucio: 'SUCIO', remojo: 'REMOJO', lavado: 'LAVADO', tendido: 'TENDIDO', recogido: 'RECOGIDO', limpio: 'LIMPIO', planchado: 'PLANCHADO', stock: 'STOCK', desmanche: 'DESMANCHE', reproceso: 'REPROCESO' };

    const porProceso = {};
    const porDepartamento = {};
    (data || []).forEach((r) => {
      const proc = r.proceso || 'sin_proceso';
      const dept = r.departamento_nombre || 'Lavanderia';
      porProceso[proc] = (porProceso[proc] || 0) + Number(r.cantidad || 0);
      porDepartamento[dept] = (porDepartamento[dept] || 0) + Number(r.cantidad || 0);
    });

    const procesosOrdenados = Object.entries(porProceso).sort((a, b) => b[1] - a[1]);
    const deptosOrdenados = Object.entries(porDepartamento).sort((a, b) => b[1] - a[1]);
    const topProceso = procesosOrdenados[0];
    const topDepto = deptosOrdenados[0];

    const chipsProcesoHtml = procesosOrdenados.map(([p, c]) => {
      const color = procesoColores[p] || '#95a5a6';
      const nombreProc = procesoNombres[p] || p.toUpperCase();
      return `<span style="display:inline-flex; align-items:center; gap:8px; border:1px solid #dbe6f1; border-radius:999px; padding:5px 10px; background:#fff; font-size:12px; margin:4px;"><span style="width:9px; height:9px; border-radius:50%; background:${color}; display:inline-block;"></span><strong>${nombreProc}</strong> ${c}</span>`;
    }).join('');

    const chipsDeptoHtml = deptosOrdenados.map(([d, c]) => {
      return `<span style="display:inline-flex; align-items:center; gap:6px; border:1px solid #dbe6f1; border-radius:999px; padding:5px 10px; background:#f8fbff; font-size:12px; margin:4px;"><span class="mi" style="font-size:14px; margin-right:0;">apartment</span><strong>${d}</strong> ${c}</span>`;
    }).join('');

    const barrasProcesoHtml = procesosOrdenados.map(([p, c]) => {
      const color = procesoColores[p] || '#95a5a6';
      const nombreProc = procesoNombres[p] || p.toUpperCase();
      const pct = total > 0 ? ((c / total) * 100) : 0;
      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; color:#53677c; margin-bottom:4px;"><span>${nombreProc}</span><strong>${c} (${pct.toFixed(1)}%)</strong></div>
          <div style="height:10px; border-radius:999px; background:#e9eff6; overflow:hidden; border:1px solid #dde7f1;"><div style="height:100%; width:${pct.toFixed(2)}%; background:${color};"></div></div>
        </div>
      `;
    }).join('');

    contentEl.innerHTML = `
      ${reportLogoHtml}
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;">
        <div style="font-weight:700; color:#2c3e50;">Reporte de stock por prenda: ${nombre}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn ${reporteStockVista === 'ejecutiva' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setReporteStockVista('ejecutiva')"><span class="mi">insights</span>Vista Ejecutiva</button>
          <button class="btn ${reporteStockVista === 'simple' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setReporteStockVista('simple')"><span class="mi">table_rows</span>Vista Simple</button>
          <button class="btn btn-primary" onclick="exportarReporteActualCSV()"><span class="mi">download</span>Exportar CSV</button>
        </div>
      </div>
      ${reporteStockVista === 'ejecutiva' ? `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:12px;">
        <div style="padding:12px; border:1px solid #d7e4f1; border-radius:10px; background:#f8fbff;"><div style="font-size:12px; color:#5f7287;">Total unidades</div><div style="font-size:24px; font-weight:800; color:#2c3e50;">${total}</div></div>
        <div style="padding:12px; border:1px solid #d7e4f1; border-radius:10px; background:#f8fbff;"><div style="font-size:12px; color:#5f7287;">Proceso con mayor stock</div><div style="font-size:16px; font-weight:800; color:#2c3e50;">${topProceso ? (procesoNombres[topProceso[0]] || topProceso[0]) : '-'}</div><div style="font-size:12px; color:#5f7287;">${topProceso ? topProceso[1] : 0} unidades</div></div>
        <div style="padding:12px; border:1px solid #d7e4f1; border-radius:10px; background:#f8fbff;"><div style="font-size:12px; color:#5f7287;">Departamento con más unidades</div><div style="font-size:16px; font-weight:800; color:#2c3e50;">${topDepto ? topDepto[0] : '-'}</div><div style="font-size:12px; color:#5f7287;">${topDepto ? topDepto[1] : 0} unidades</div></div>
      </div>
      <div style="padding:10px; border:1px solid #dce7f2; border-radius:10px; background:#fff; margin-bottom:10px;"><div style="font-size:12px; color:#5f7287; margin-bottom:6px;">Chips por proceso</div>${chipsProcesoHtml || '<span style="font-size:12px; color:#7f8c8d;">Sin datos</span>'}</div>
      <div style="padding:10px; border:1px solid #dce7f2; border-radius:10px; background:#fff; margin-bottom:12px;"><div style="font-size:12px; color:#5f7287; margin-bottom:6px;">Chips por departamento</div>${chipsDeptoHtml || '<span style="font-size:12px; color:#7f8c8d;">Sin datos</span>'}</div>
      <div style="padding:12px; border:1px solid #dce7f2; border-radius:10px; background:#fff; margin-bottom:12px;"><div style="font-size:12px; color:#5f7287; margin-bottom:10px;">Distribución rápida por proceso</div>${barrasProcesoHtml || '<span style="font-size:12px; color:#7f8c8d;">Sin datos</span>'}</div>
      ` : ''}
      <table><thead><tr><th>Proceso</th><th>Cantidad</th><th>Departamento</th></tr></thead>
      <tbody>${(data || []).map(r => `<tr><td style="text-transform:uppercase;">${r.proceso}</td><td><strong>${r.cantidad}</strong></td><td>${r.departamento_nombre || 'Lavanderia'}</td></tr>`).join('')}</tbody></table>
      <div style="margin-top:14px; padding:12px; background:#eef6ff; border:1px solid #cfe0f5; border-radius:10px;"><strong>Total unidades:</strong> ${total}</div>
      <div style="margin-top:8px; font-size:12px; color:#6b7f93;">Si un departamento no devolvió prendas, seguirá apareciendo en su departamento hasta que se registre la devolución.</div>
    `;
  }
}

// Exposición global en window
Object.assign(window, {
  loadFiltrosReporte,
  updateReporteFilterVisibility,
  buscarPrendaReporte,
  seleccionarPrendaReporte,
  setReporteStockVista,
  actualizarMinFechaFin,
  aplicarFiltros,
  getMondayFromIsoWeek,
  formatDateInput,
  aplicarSemanaReporte,
  seleccionarTab,
  toCSVValue,
  descargarCSV,
  exportarReporteActualCSV,
  reporte
});
