/**
 * Módulo de Catálogos (CRUD de Prendas, Trabajadores, Departamentos, Usuarios)
 * Módulo ES6 con compatibilidad global
 */

import { API, apiFetch, apiFetchJson } from '../core/api.js';
import {
  formatCurrency,
  showError,
  showSuccess,
  showWarning,
  showInfo,
  confirmDialog
} from '../core/ui.js';

let editandoPrendaId = null;
let editandoTrabajadorId = null;
let editandoTrabajadorInternoId = null;
let editandoDepartamentoId = null;
let editandoUsuarioId = null;

// Iconos minimalistas SVG (stroke vector)
const ICON_EDIT = `<svg class="action-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
const ICON_DELETE = `<svg class="action-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

export async function obtenerPrendasCache() {
  if (window.prendasCacheGlobal && window.prendasCacheGlobal.length) {
    return window.prendasCacheGlobal;
  }
  try {
    const data = await apiFetchJson('prendas');
    window.prendasCacheGlobal = Array.isArray(data) ? data : [];
    return window.prendasCacheGlobal;
  } catch (_) {
    return [];
  }
}

// ----------------------------------------------------
// PRENDAS
// ----------------------------------------------------
export async function loadPrendas() {
  const tabla = document.getElementById('tablaPrendas');
  if (!tabla) return;

  try {
    const data = await apiFetchJson('prendas');
    window.prendasCacheGlobal = Array.isArray(data) ? data.slice() : [];

    const filtro = (document.getElementById('filtroPrendaNombre')?.value || '').trim().toLowerCase();
    const filtradas = (Array.isArray(data) ? data : []).filter((p) => {
      if (!filtro) return true;
      return String(p.nombre || '').toLowerCase().includes(filtro);
    });

    const badge = document.getElementById('prendasCounterBadge');
    if (badge) badge.textContent = `${filtradas.length} Registradas`;

    const footerInfo = document.getElementById('prendasFooterInfo');
    if (footerInfo) {
      footerInfo.innerHTML = `<span>Mostrando <strong>${filtradas.length}</strong> de <strong>${(data || []).length}</strong> prendas en el catálogo</span>`;
    }

    if (filtradas.length === 0) {
      tabla.innerHTML = `
        <thead>
          <tr>
            <th rowspan="2" class="th-dark" style="width: 250px; text-align: left;">Nombre</th>
            <th colspan="4" class="th-factura-group">
              <span class="th-group-icon mi">payments</span>
              CON FACTURA
            </th>
            <th colspan="4" class="th-sinfactura-group">
              <span class="th-group-icon mi">receipt_long</span>
              SIN FACTURA
            </th>
            <th rowspan="2" class="th-dark th-actions" style="width: 110px; text-align: center;">Acciones</th>
          </tr>
          <tr>
            <th class="th-factura-sub">Remojo</th>
            <th class="th-factura-sub">Lavado</th>
            <th class="th-factura-sub">Desm.</th>
            <th class="th-factura-sub">Plancha</th>
            <th class="th-sinfactura-sub">Remojo</th>
            <th class="th-sinfactura-sub">Lavado</th>
            <th class="th-sinfactura-sub">Desm.</th>
            <th class="th-sinfactura-sub">Plancha</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="10" style="text-align:center; padding:45px 20px; color:#64748b;">
              <span class="mi" style="font-size:36px; display:block; margin-bottom:8px; color:#94a3b8;">inventory_2</span>
              ${filtro ? 'No se encontraron prendas con ese filtro' : 'No hay prendas registradas en el catálogo'}
            </td>
          </tr>
        </tbody>
      `;
      return;
    }

    tabla.innerHTML = `
      <thead>
        <tr>
          <th rowspan="2" class="th-dark" style="width: 250px; text-align: left;">Nombre</th>
          <th colspan="6" class="th-factura-group">
            <span class="th-group-icon mi">payments</span>
            CON FACTURA
          </th>
          <th colspan="6" class="th-sinfactura-group">
            <span class="th-group-icon mi">receipt_long</span>
            SIN FACTURA
          </th>
          <th rowspan="2" class="th-dark th-actions" style="width: 110px; text-align: center;">Acciones</th>
        </tr>
        <tr>
          <th class="th-factura-sub">Remojo</th>
          <th class="th-factura-sub">Lavado</th>
          <th class="th-factura-sub">Tendido</th>
          <th class="th-factura-sub">Recog.</th>
          <th class="th-factura-sub">Desm.</th>
          <th class="th-factura-sub">Plancha</th>
          <th class="th-sinfactura-sub">Remojo</th>
          <th class="th-sinfactura-sub">Lavado</th>
          <th class="th-sinfactura-sub">Tendido</th>
          <th class="th-sinfactura-sub">Recog.</th>
          <th class="th-sinfactura-sub">Desm.</th>
          <th class="th-sinfactura-sub">Plancha</th>
        </tr>
      </thead>
      <tbody>${filtradas.map(p => `<tr>
        <td class="td-prenda-name">${p.nombre}</td>
        <td class="td-price-factura ${!Number(p.precio_remojo_factura) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_remojo_factura || 0)}</td>
        <td class="td-price-factura ${!Number(p.precio_lavado_factura) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_lavado_factura || 0)}</td>
        <td class="td-price-factura ${!Number(p.precio_tendido_factura) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_tendido_factura || 0)}</td>
        <td class="td-price-factura ${!Number(p.precio_recogido_factura) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_recogido_factura || 0)}</td>
        <td class="td-price-factura ${!Number(p.precio_desmanche_factura) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_desmanche_factura || 0)}</td>
        <td class="td-price-factura ${!Number(p.precio_planchado_factura) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_planchado_factura || 0)}</td>
        <td class="td-price-sinfactura ${!Number(p.precio_remojo) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_remojo || 0)}</td>
        <td class="td-price-sinfactura ${!Number(p.precio_lavado) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_lavado || 0)}</td>
        <td class="td-price-sinfactura ${!Number(p.precio_tendido) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_tendido || 0)}</td>
        <td class="td-price-sinfactura ${!Number(p.precio_recogido) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_recogido || 0)}</td>
        <td class="td-price-sinfactura ${!Number(p.precio_desmanche) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_desmanche || 0)}</td>
        <td class="td-price-sinfactura ${!Number(p.precio_planchado) ? 'td-price-zero' : ''}">${formatCurrency(p.precio_planchado || 0)}</td>
        <td class="td-actions">
          <div class="actions-wrap">
            <button type="button" class="btn-action-circle btn-action-edit" title="Editar prenda" onclick="editarPrenda(${p.id})">
              ${ICON_EDIT}
            </button>
            <button type="button" class="btn-action-circle btn-action-delete" title="Eliminar prenda" onclick="eliminarPrenda(${p.id})">
              ${ICON_DELETE}
            </button>
          </div>
        </td>
      </tr>`).join('')}</tbody>
    `;
  } catch (err) {
    console.error('Error cargando prendas:', err);
    tabla.innerHTML = `
      <tbody>
        <tr>
          <td colspan="10" style="text-align:center; padding:35px 20px; color:#ef4444;">
            <span class="mi" style="vertical-align:middle; margin-right:6px; font-size:20px;">error</span>
            ${err.message || 'Error al cargar catálogo de prendas'}
          </td>
        </tr>
      </tbody>
    `;
  }
}

export function descargarPlantillaPrendas() {
  const headers = [
    'nombre', 'descripcion',
    'precio_remojo_factura', 'precio_lavado_factura', 'precio_desmanche_factura', 'precio_planchado_factura',
    'precio_remojo', 'precio_lavado', 'precio_desmanche', 'precio_planchado',
    'requiere_plancha'
  ];
  const ejemplo = ['Toalla Blanca', 'Toalla hotelera', '10', '12', '15', '8', '8', '10', '12', '6', '1'];
  const csv = `${headers.join(',')}\n${ejemplo.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_prendas.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showSuccess('Plantilla descargada');
}

export function abrirImportacionPrendas() {
  const input = document.getElementById('archivoImportacionPrendas');
  if (!input) return;
  input.value = '';
  input.click();
}

export async function importarPrendasDesdeArchivo(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    showWarning('El archivo no tiene datos para importar');
    return;
  }

  const detectarSeparador = (line) => {
    const candidatos = [',', ';', '\t', '|'];
    let mejor = ',';
    let maxCols = 1;
    candidatos.forEach((sep) => {
      const cols = line.split(sep).length;
      if (cols > maxCols) {
        maxCols = cols;
        mejor = sep;
      }
    });
    return mejor;
  };

  const separador = detectarSeparador(lines[0]);
  const headers = lines[0].split(separador).map((h) => h.trim());

  if (headers.length <= 1) {
    showError('No se detectaron columnas en el archivo. Guarda el archivo como CSV, separado por comas.');
    return;
  }

  const prendas = lines.slice(1).map((line) => {
    const values = line.split(separador).map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });

  try {
    const res = await fetch(`${API}/prendas/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({ prendas })
    });

    const data = await res.json();
    if (!res.ok) {
      showError(data.message || 'Error al importar prendas');
      return;
    }

    showSuccess(`Importación completada. Creadas: ${data.creadas}, Actualizadas: ${data.actualizadas}, Errores: ${data.errores}`);
    loadPrendas();
  } catch (err) {
    showError('Error de red al importar prendas');
  }
}

export function showPrendaModal() {
  editandoPrendaId = null;
  const nombreInput = document.getElementById('prendaNombre');
  if (nombreInput) nombreInput.value = '';
  const descInput = document.getElementById('prendaDescripcion');
  if (descInput) descInput.value = '';
  const stockInit = document.getElementById('prendaStockInicial');
  if (stockInit) stockInit.value = '0';
  const stockGroup = document.getElementById('prendaStockGroup');
  if (stockGroup) stockGroup.style.display = 'block';

  const remFact = document.getElementById('prendaRemojoFactura');
  if (remFact) remFact.value = '0';
  const lavFact = document.getElementById('prendaLavadoFactura');
  if (lavFact) lavFact.value = '0';
  const tendFact = document.getElementById('prendaTendidoFactura');
  if (tendFact) tendFact.value = '0';
  const recogFact = document.getElementById('prendaRecogidoFactura');
  if (recogFact) recogFact.value = '0';
  const desFact = document.getElementById('prendaDesmancheFactura');
  if (desFact) desFact.value = '0';
  const planFact = document.getElementById('prendaPlanchadoFactura');
  if (planFact) planFact.value = '0';

  const rem = document.getElementById('prendaRemojo');
  if (rem) rem.value = '0';
  const lav = document.getElementById('prendaLavado');
  if (lav) lav.value = '0';
  const tend = document.getElementById('prendaTendido');
  if (tend) tend.value = '0';
  const recog = document.getElementById('prendaRecogido');
  if (recog) recog.value = '0';
  const des = document.getElementById('prendaDesmanche');
  if (des) des.value = '0';
  const plan = document.getElementById('prendaPlanchado');
  if (plan) plan.value = '0';

  const reqPlan = document.getElementById('prendaRequierePlancha');
  if (reqPlan) reqPlan.checked = true;

  const title = document.querySelector('#modalPrenda .modal-header h2');
  if (title) title.textContent = 'Nueva Prenda';

  const modal = document.getElementById('modalPrenda');
  if (modal) modal.classList.add('show');
}

export async function editarPrenda(id) {
  editandoPrendaId = id;
  const stockGroup = document.getElementById('prendaStockGroup');
  if (stockGroup) stockGroup.style.display = 'block';

  const title = document.querySelector('#modalPrenda .modal-header h2');
  if (title) title.textContent = 'Editar Prenda';

  const modal = document.getElementById('modalPrenda');
  if (modal) modal.classList.add('show');

  try {
    const resStock = await fetch(`${API}/procesos/por-proceso/sucio`, { headers: { 'x-access-token': window.token } });
    const stockData = await resStock.json();
    const stockPrenda = (Array.isArray(stockData) ? stockData : []).filter(s => s.prenda_id === id);
    const totalStock = stockPrenda.reduce((sum, s) => sum + s.cantidad, 0);
    const stockInit = document.getElementById('prendaStockInicial');
    if (stockInit) stockInit.value = totalStock;

    const res = await fetch(`${API}/prendas`, { headers: { 'x-access-token': window.token } });
    const data = await res.json();
    const prenda = (Array.isArray(data) ? data : []).find(p => p.id === id);

    if (prenda) {
      document.getElementById('prendaNombre').value = prenda.nombre || '';
      document.getElementById('prendaDescripcion').value = prenda.descripcion || '';
      document.getElementById('prendaRemojoFactura').value = prenda.precio_remojo_factura || '0';
      document.getElementById('prendaLavadoFactura').value = prenda.precio_lavado_factura || '0';
      document.getElementById('prendaTendidoFactura').value = prenda.precio_tendido_factura || '0';
      document.getElementById('prendaRecogidoFactura').value = prenda.precio_recogido_factura || '0';
      document.getElementById('prendaDesmancheFactura').value = prenda.precio_desmanche_factura || '0';
      document.getElementById('prendaPlanchadoFactura').value = prenda.precio_planchado_factura || '0';
      document.getElementById('prendaRemojo').value = prenda.precio_remojo || '0';
      document.getElementById('prendaLavado').value = prenda.precio_lavado || '0';
      document.getElementById('prendaTendido').value = prenda.precio_tendido || '0';
      document.getElementById('prendaRecogido').value = prenda.precio_recogido || '0';
      document.getElementById('prendaDesmanche').value = prenda.precio_desmanche || '0';
      document.getElementById('prendaPlanchado').value = prenda.precio_planchado || '0';
      document.getElementById('prendaRequierePlancha').checked = prenda.requiere_plancha === 1;
    }
  } catch (err) {
    console.error('Error cargando prenda para editar:', err);
  }
}

export function closePrendaModal() {
  const modal = document.getElementById('modalPrenda');
  if (modal) modal.classList.remove('show');
  editandoPrendaId = null;
}

export async function guardarPrenda() {
  const nombre = document.getElementById('prendaNombre')?.value?.trim();
  if (!nombre) {
    showError('El nombre de la prenda es requerido');
    return;
  }

  const data = {
    nombre,
    descripcion: document.getElementById('prendaDescripcion')?.value || '',
    precio_sucio_factura: 0,
    precio_remojo_factura: parseFloat(document.getElementById('prendaRemojoFactura')?.value) || 0,
    precio_lavado_factura: parseFloat(document.getElementById('prendaLavadoFactura')?.value) || 0,
    precio_tendido_factura: parseFloat(document.getElementById('prendaTendidoFactura')?.value) || 0,
    precio_recogido_factura: parseFloat(document.getElementById('prendaRecogidoFactura')?.value) || 0,
    precio_desmanche_factura: parseFloat(document.getElementById('prendaDesmancheFactura')?.value) || 0,
    precio_planchado_factura: parseFloat(document.getElementById('prendaPlanchadoFactura')?.value) || 0,
    precio_sucio: 0,
    precio_remojo: parseFloat(document.getElementById('prendaRemojo')?.value) || 0,
    precio_lavado: parseFloat(document.getElementById('prendaLavado')?.value) || 0,
    precio_tendido: parseFloat(document.getElementById('prendaTendido')?.value) || 0,
    precio_recogido: parseFloat(document.getElementById('prendaRecogido')?.value) || 0,
    precio_desmanche: parseFloat(document.getElementById('prendaDesmanche')?.value) || 0,
    precio_planchado: parseFloat(document.getElementById('prendaPlanchado')?.value) || 0,
    requiere_plancha: document.getElementById('prendaRequierePlancha')?.checked ? 1 : 0
  };

  try {
    if (editandoPrendaId) {
      const nuevoStock = parseInt(document.getElementById('prendaStockInicial')?.value) || 0;
      const res = await fetch(`${API}/prendas/${editandoPrendaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        if (nuevoStock > 0) {
          await fetch(`${API}/procesos/ingresar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
            body: JSON.stringify({ prenda_id: editandoPrendaId, cantidad: nuevoStock, proceso: 'stock' })
          });
        }
        showSuccess('Prenda actualizada correctamente');
        closePrendaModal();
        loadPrendas();
      } else {
        showError('Error al actualizar prenda');
      }
    } else {
      const res = await fetch(`${API}/prendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        const prendaId = result.id;
        const stockInicial = parseInt(document.getElementById('prendaStockInicial')?.value) || 0;
        if (stockInicial > 0) {
          await fetch(`${API}/procesos/ingresar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
            body: JSON.stringify({ prenda_id: prendaId, cantidad: stockInicial, proceso: 'stock' })
          });
          showSuccess(`Prenda creada con ${stockInicial} unidades en STOCK`);
        } else {
          showSuccess('Prenda creada correctamente');
        }
        closePrendaModal();
        const initInput = document.getElementById('prendaStockInicial');
        if (initInput) initInput.value = '0';
        loadPrendas();
      } else {
        showError('Error al crear prenda');
      }
    }
  } catch (err) {
    showError('Error de red al guardar prenda');
  }
}

export async function eliminarPrenda(id) {
  if (await confirmDialog('¿Eliminar prenda?', 'Eliminar prenda')) {
    try {
      await fetch(`${API}/prendas/${id}`, { method: 'DELETE', headers: { 'x-access-token': window.token } });
      showSuccess('Prenda eliminada');
      loadPrendas();
    } catch (err) {
      showError('Error al eliminar prenda');
    }
  }
}

// ----------------------------------------------------
// TRABAJADORES (PAGO POR PIEZA)
// ----------------------------------------------------
export async function loadTrabajadores() {
  const tabla = document.getElementById('tablaTrabajadores');
  if (!tabla) return;

  try {
    const data = await apiFetchJson('trabajadores');
    const trabajadores = Array.isArray(data) ? data : [];

    const badge = document.getElementById('trabajadoresCounterBadge');
    if (badge) badge.textContent = `${trabajadores.length} Registrados`;

    const footerInfo = document.getElementById('trabajadoresFooterInfo');
    if (footerInfo) {
      footerInfo.innerHTML = `<span>Mostrando <strong>${trabajadores.length}</strong> trabajadores registrados</span>`;
    }

    if (trabajadores.length === 0) {
      tabla.innerHTML = `
        <thead><tr>
          <th class="th-dark" style="text-align:left;">Nombre</th>
          <th class="th-dark">Cédula</th>
          <th class="th-dark">Teléfono</th>
          <th class="th-dark">Facturación</th>
          <th class="th-dark">Tareas Activas</th>
          <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
        </tr></thead>
        <tbody>
          <tr>
            <td colspan="6" style="text-align:center; padding:45px 20px; color:#64748b;">
              <span class="mi" style="font-size:36px; display:block; margin-bottom:8px; color:#94a3b8;">badge</span>
              No hay trabajadores registrados
            </td>
          </tr>
        </tbody>
      `;
      return;
    }

    tabla.innerHTML = `
      <thead><tr>
        <th class="th-dark" style="text-align:left;">Nombre</th>
        <th class="th-dark">Cédula</th>
        <th class="th-dark">Teléfono</th>
        <th class="th-dark">Facturación</th>
        <th class="th-dark">Tareas Activas</th>
        <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
      </tr></thead>
      <tbody>${trabajadores.map(t => `<tr>
        <td class="td-prenda-name">${t.nombre}</td>
        <td style="font-family:'JetBrains Mono', monospace; font-size:12.5px; color:#475569;">${t.cedula || '-'}</td>
        <td style="font-family:'JetBrains Mono', monospace; font-size:12.5px; color:#475569;">${t.telefono || '-'}</td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:9999px; font-size:11px; font-weight:600; ${t.factura ? 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;' : 'background:#fffbeb; color:#b45309; border:1px solid #fde68a;'}">
            <span class="mi" style="font-size:13px;">${t.factura ? 'receipt' : 'receipt_long'}</span>
            ${t.factura ? 'Con Factura' : 'Sin Factura'}
          </span>
        </td>
        <td style="font-family:'JetBrains Mono', monospace; font-weight:700; color:#0f172a;">${t.tareas_activas || 0}</td>
        <td class="td-actions">
          <div class="actions-wrap">
            <button type="button" class="btn-action-circle btn-action-edit" title="Editar trabajador" onclick="editarTrabajador(${t.id})">
              ${ICON_EDIT}
            </button>
            <button type="button" class="btn-action-circle btn-action-delete" title="Eliminar trabajador" onclick="eliminarTrabajador(${t.id})">
              ${ICON_DELETE}
            </button>
          </div>
        </td>
      </tr>`).join('')}</tbody>
    `;
  } catch (err) {
    console.error('Error cargando trabajadores:', err);
    tabla.innerHTML = `
      <tbody>
        <tr>
          <td colspan="6" style="text-align:center; padding:35px 20px; color:#ef4444;">
            <span class="mi" style="vertical-align:middle; margin-right:6px; font-size:20px;">error</span>
            ${err.message || 'Error cargando trabajadores'}
          </td>
        </tr>
      </tbody>
    `;
  }
}

export function showTrabajadorModal() {
  editandoTrabajadorId = null;
  const tit = document.getElementById('modalTrabajadorTitulo');
  if (tit) tit.textContent = 'Nuevo Trabajador';
  const btn = document.getElementById('btnGuardarTrabajador');
  if (btn) btn.innerHTML = 'Guardar Trabajador';
  document.getElementById('trabajadorNombre').value = '';
  document.getElementById('trabajadorCedula').value = '';
  document.getElementById('trabajadorTelefono').value = '';
  document.getElementById('trabajadorFactura').checked = false;
  const modal = document.getElementById('modalTrabajador');
  if (modal) modal.classList.add('show');
}

export function closeTrabajadorModal() {
  const modal = document.getElementById('modalTrabajador');
  if (modal) modal.classList.remove('show');
}

export async function guardarTrabajador() {
  const nombre = document.getElementById('trabajadorNombre')?.value?.trim();
  if (!nombre) {
    showError('El nombre del trabajador es requerido');
    return;
  }
  const data = {
    nombre,
    cedula: document.getElementById('trabajadorCedula')?.value || '',
    telefono: document.getElementById('trabajadorTelefono')?.value || '',
    factura: document.getElementById('trabajadorFactura')?.checked
  };
  const url = editandoTrabajadorId ? `${API}/trabajadores/${editandoTrabajadorId}` : `${API}/trabajadores`;
  const method = editandoTrabajadorId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      showSuccess(editandoTrabajadorId ? 'Trabajador actualizado correctamente' : 'Trabajador creado correctamente');
      closeTrabajadorModal();
      loadTrabajadores();
    } else {
      showError(editandoTrabajadorId ? 'Error al actualizar trabajador' : 'Error al crear trabajador');
    }
  } catch (err) {
    showError('Error de red al guardar trabajador');
  }
}

export async function editarTrabajador(id) {
  try {
    const res = await fetch(`${API}/trabajadores`, { headers: { 'x-access-token': window.token } });
    const data = await res.json();
    const t = (Array.isArray(data) ? data : []).find(x => Number(x.id) === Number(id));
    if (!t) {
      showError('No se encontró el trabajador');
      return;
    }

    editandoTrabajadorId = id;
    const tit = document.getElementById('modalTrabajadorTitulo');
    if (tit) tit.textContent = 'Editar Trabajador';
    const btn = document.getElementById('btnGuardarTrabajador');
    if (btn) btn.innerHTML = '<span class="mi">save</span>Actualizar';
    document.getElementById('trabajadorNombre').value = t.nombre || '';
    document.getElementById('trabajadorCedula').value = t.cedula || '';
    document.getElementById('trabajadorTelefono').value = t.telefono || '';
    document.getElementById('trabajadorFactura').checked = !!t.factura;
    const modal = document.getElementById('modalTrabajador');
    if (modal) modal.classList.add('show');
  } catch (err) {
    console.error('Error al editar trabajador:', err);
  }
}

export async function eliminarTrabajador(id) {
  if (await confirmDialog('¿Eliminar trabajador?', 'Eliminar trabajador')) {
    try {
      await fetch(`${API}/trabajadores/${id}`, { method: 'DELETE', headers: { 'x-access-token': window.token } });
      showSuccess('Trabajador eliminado');
      loadTrabajadores();
    } catch (err) {
      showError('Error al eliminar trabajador');
    }
  }
}

// ----------------------------------------------------
// TRABAJADORES INTERNOS (PLANILLA)
// ----------------------------------------------------
export async function loadTrabajadoresInternos() {
  const tabla = document.getElementById('tablaTrabajadoresInternos');
  if (!tabla) return;

  try {
    const data = await apiFetchJson('trabajadores-internos');
    window.trabajadoresInternosCache = Array.isArray(data) ? data : [];

    const badge = document.getElementById('trabajadoresInternosCounterBadge');
    if (badge) badge.textContent = `${window.trabajadoresInternosCache.length} Registrados`;

    const footerInfo = document.getElementById('trabajadoresInternosFooterInfo');
    if (footerInfo) {
      footerInfo.innerHTML = `<span>Mostrando <strong>${window.trabajadoresInternosCache.length}</strong> trabajadores internos de planta</span>`;
    }

    if (window.trabajadoresInternosCache.length === 0) {
      tabla.innerHTML = `
        <thead><tr>
          <th class="th-dark" style="text-align:left;">Nombre</th>
          <th class="th-dark">Cédula</th>
          <th class="th-dark">Teléfono</th>
          <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
        </tr></thead>
        <tbody>
          <tr>
            <td colspan="4" style="text-align:center; padding:45px 20px; color:#64748b;">
              <span class="mi" style="font-size:36px; display:block; margin-bottom:8px; color:#94a3b8;">group</span>
              No hay trabajadores de tendido/recogido registrados
            </td>
          </tr>
        </tbody>
      `;
      return;
    }

    tabla.innerHTML = `
      <thead><tr>
        <th class="th-dark" style="text-align:left;">Nombre</th>
        <th class="th-dark">Cédula</th>
        <th class="th-dark">Teléfono</th>
        <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
      </tr></thead>
      <tbody>${window.trabajadoresInternosCache.map(t => `<tr>
        <td class="td-prenda-name">${t.nombre}</td>
        <td style="font-family:'JetBrains Mono', monospace; font-size:12.5px; color:#475569;">${t.cedula || '-'}</td>
        <td style="font-family:'JetBrains Mono', monospace; font-size:12.5px; color:#475569;">${t.telefono || '-'}</td>
        <td class="td-actions">
          <div class="actions-wrap">
            <button type="button" class="btn-action-circle btn-action-edit" title="Editar trabajador" onclick="editarTrabajadorInterno(${t.id})">
              ${ICON_EDIT}
            </button>
            <button type="button" class="btn-action-circle btn-action-delete" title="Eliminar trabajador" onclick="eliminarTrabajadorInterno(${t.id})">
              ${ICON_DELETE}
            </button>
          </div>
        </td>
      </tr>`).join('')}</tbody>
    `;
  } catch (err) {
    console.error('Error cargando trabajadores internos:', err);
    tabla.innerHTML = `
      <tbody>
        <tr>
          <td colspan="4" style="text-align:center; padding:35px 20px; color:#ef4444;">
            <span class="mi" style="vertical-align:middle; margin-right:6px; font-size:20px;">error</span>
            ${err.message || 'Error cargando trabajadores internos'}
          </td>
        </tr>
      </tbody>
    `;
  }
}

export function showTrabajadorInternoModal() {
  editandoTrabajadorInternoId = null;
  const tit = document.querySelector('#modalTrabajadorInterno .modal-header h2');
  if (tit) tit.textContent = 'Nuevo Trabajador Interno';
  document.getElementById('trabajadorInternoNombre').value = '';
  document.getElementById('trabajadorInternoCedula').value = '';
  document.getElementById('trabajadorInternoTelefono').value = '';
  const modal = document.getElementById('modalTrabajadorInterno');
  if (modal) modal.classList.add('show');
}

export function closeTrabajadorInternoModal() {
  const modal = document.getElementById('modalTrabajadorInterno');
  if (modal) modal.classList.remove('show');
}

export function editarTrabajadorInterno(id) {
  const cache = window.trabajadoresInternosCache || [];
  const t = cache.find(x => Number(x.id) === Number(id));
  if (!t) return;
  editandoTrabajadorInternoId = id;
  const tit = document.querySelector('#modalTrabajadorInterno .modal-header h2');
  if (tit) tit.textContent = 'Editar Trabajador Interno';
  document.getElementById('trabajadorInternoNombre').value = t.nombre || '';
  document.getElementById('trabajadorInternoCedula').value = t.cedula || '';
  document.getElementById('trabajadorInternoTelefono').value = t.telefono || '';
  const modal = document.getElementById('modalTrabajadorInterno');
  if (modal) modal.classList.add('show');
}

export async function guardarTrabajadorInterno() {
  const nombre = document.getElementById('trabajadorInternoNombre')?.value?.trim();
  const cedula = document.getElementById('trabajadorInternoCedula')?.value?.trim();
  const telefono = document.getElementById('trabajadorInternoTelefono')?.value?.trim();
  if (!nombre) return showWarning('El nombre es requerido');

  const url = editandoTrabajadorInternoId ? `${API}/trabajadores-internos/${editandoTrabajadorInternoId}` : `${API}/trabajadores-internos`;
  const method = editandoTrabajadorInternoId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({ nombre, cedula: cedula || null, telefono: telefono || null })
    });
    const data = await res.json();
    if (!res.ok) return showError(data.message || 'Error al guardar trabajador interno');

    showSuccess(editandoTrabajadorInternoId ? 'Trabajador interno actualizado' : 'Trabajador interno creado');
    closeTrabajadorInternoModal();
    loadTrabajadoresInternos();
  } catch (err) {
    showError('Error de red al guardar trabajador interno');
  }
}

export async function eliminarTrabajadorInterno(id) {
  if (!await confirmDialog('¿Eliminar este trabajador interno?', 'Eliminar trabajador interno')) return;
  try {
    const res = await fetch(`${API}/trabajadores-internos/${id}`, {
      method: 'DELETE',
      headers: { 'x-access-token': window.token }
    });
    const data = await res.json();
    if (!res.ok) return showError(data.message || 'Error al eliminar');
    showInfo('Trabajador interno eliminado');
    loadTrabajadoresInternos();
  } catch (err) {
    showError('Error al eliminar trabajador interno');
  }
}

// ----------------------------------------------------
// DEPARTAMENTOS
// ----------------------------------------------------
export async function loadDepartamentos() {
  const tabla = document.getElementById('tablaDepartamentos');
  if (!tabla) return;

  try {
    const data = await apiFetchJson('departamentos');
    const departamentos = Array.isArray(data) ? data : [];

    const badge = document.getElementById('departamentosCounterBadge');
    if (badge) badge.textContent = `${departamentos.length} Registrados`;

    const footerInfo = document.getElementById('departamentosFooterInfo');
    if (footerInfo) {
      footerInfo.innerHTML = `<span>Mostrando <strong>${departamentos.length}</strong> áreas o departamentos operativos</span>`;
    }

    if (departamentos.length === 0) {
      tabla.innerHTML = `
        <thead><tr>
          <th class="th-dark" style="text-align:left; width:280px;">Nombre</th>
          <th class="th-dark" style="text-align:left;">Descripción</th>
          <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
        </tr></thead>
        <tbody>
          <tr>
            <td colspan="3" style="text-align:center; padding:45px 20px; color:#64748b;">
              <span class="mi" style="font-size:36px; display:block; margin-bottom:8px; color:#94a3b8;">domain</span>
              No hay departamentos registrados
            </td>
          </tr>
        </tbody>
      `;
      return;
    }

    tabla.innerHTML = `
      <thead><tr>
        <th class="th-dark" style="text-align:left; width:280px;">Nombre</th>
        <th class="th-dark" style="text-align:left;">Descripción</th>
        <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
      </tr></thead>
      <tbody>${departamentos.map(d => `<tr>
        <td class="td-prenda-name">${d.nombre}</td>
        <td style="color:#475569; font-size:13px;">${d.descripcion || '<span style="color:#94a3b8; font-style:italic;">Sin descripción</span>'}</td>
        <td class="td-actions">
          <div class="actions-wrap">
            <button type="button" class="btn-action-circle btn-action-edit" title="Editar departamento" onclick="editarDepartamento(${d.id}, '${d.nombre.replace(/'/g, "\\'")}', '${(d.descripcion || '').replace(/'/g, "\\'")}')">
              ${ICON_EDIT}
            </button>
            <button type="button" class="btn-action-circle btn-action-delete" title="Eliminar departamento" onclick="eliminarDepartamento(${d.id})">
              ${ICON_DELETE}
            </button>
          </div>
        </td>
      </tr>`).join('')}</tbody>
    `;
  } catch (err) {
    console.error('Error cargando departamentos:', err);
    tabla.innerHTML = `
      <tbody>
        <tr>
          <td colspan="3" style="text-align:center; padding:35px 20px; color:#ef4444;">
            <span class="mi" style="vertical-align:middle; margin-right:6px; font-size:20px;">error</span>
            ${err.message || 'Error cargando departamentos'}
          </td>
        </tr>
      </tbody>
    `;
  }
}

export function showDepartamentoModal() {
  editandoDepartamentoId = null;
  document.getElementById('departamentoNombre').value = '';
  document.getElementById('departamentoDescripcion').value = '';
  const tit = document.querySelector('#modalDepartamento .modal-header h2');
  if (tit) tit.textContent = 'Nuevo Departamento';
  const modal = document.getElementById('modalDepartamento');
  if (modal) modal.classList.add('show');
}

export function editarDepartamento(id, nombre, descripcion) {
  editandoDepartamentoId = id;
  document.getElementById('departamentoNombre').value = nombre;
  document.getElementById('departamentoDescripcion').value = descripcion || '';
  const tit = document.querySelector('#modalDepartamento .modal-header h2');
  if (tit) tit.textContent = 'Editar Departamento';
  const modal = document.getElementById('modalDepartamento');
  if (modal) modal.classList.add('show');
}

export function closeDepartamentoModal() {
  const modal = document.getElementById('modalDepartamento');
  if (modal) modal.classList.remove('show');
  editandoDepartamentoId = null;
}

export async function guardarDepartamento() {
  const nombre = document.getElementById('departamentoNombre')?.value?.trim();
  if (!nombre) {
    showError('El nombre del departamento es requerido');
    return;
  }
  const data = {
    nombre,
    descripcion: document.getElementById('departamentoDescripcion')?.value || ''
  };

  try {
    let res;
    if (editandoDepartamentoId) {
      res = await fetch(`${API}/departamentos/${editandoDepartamentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        showSuccess('Departamento actualizado');
        closeDepartamentoModal();
        loadDepartamentos();
      } else {
        showError('Error al actualizar departamento');
      }
    } else {
      res = await fetch(`${API}/departamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        showSuccess('Departamento creado correctamente');
        closeDepartamentoModal();
        loadDepartamentos();
      } else {
        showError('Error al crear departamento');
      }
    }
  } catch (err) {
    showError('Error de red al guardar departamento');
  }
}

export async function eliminarDepartamento(id) {
  if (await confirmDialog('¿Eliminar departamento?', 'Eliminar departamento')) {
    try {
      await fetch(`${API}/departamentos/${id}`, { method: 'DELETE', headers: { 'x-access-token': window.token } });
      showSuccess('Departamento eliminado');
      loadDepartamentos();
    } catch (err) {
      showError('Error al eliminar departamento');
    }
  }
}

// ----------------------------------------------------
// USUARIOS
// ----------------------------------------------------
export async function loadUsuarios() {
  const rolFiltro = document.getElementById('filtroRolUsuario')?.value || '';
  let path = 'usuarios';
  if (rolFiltro) path += `?rol=${rolFiltro}`;

  const tabla = document.getElementById('tablaUsuarios');
  if (!tabla) return;

  try {
    const [data, deptos] = await Promise.all([
      apiFetchJson(path),
      apiFetchJson('departamentos').catch(() => [])
    ]);

    const deptosMap = {};
    (Array.isArray(deptos) ? deptos : []).forEach(d => { deptosMap[d.id] = d.nombre; });

    const rolLabels = { 'admin': 'Admin', 'encargado': 'Encargado', 'reportes': 'Reportes', 'trabajador': 'Trabajador', 'solicitante': 'Solicitante' };
    const rolColors = {
      'admin': { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' },
      'encargado': { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
      'reportes': { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' },
      'trabajador': { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
      'solicitante': { bg: '#fef3c7', text: '#b45309', border: '#fde68a' }
    };

    const usuarios = Array.isArray(data) ? data : [];

    const badge = document.getElementById('usuariosCounterBadge');
    if (badge) badge.textContent = `${usuarios.length} Registrados`;

    const footerInfo = document.getElementById('usuariosFooterInfo');
    if (footerInfo) {
      footerInfo.innerHTML = `<span>Mostrando <strong>${usuarios.length}</strong> usuarios autorizados</span>`;
    }

    if (usuarios.length === 0) {
      tabla.innerHTML = `
        <thead><tr>
          <th class="th-dark" style="text-align:left;">Usuario</th>
          <th class="th-dark" style="text-align:left;">Nombre</th>
          <th class="th-dark" style="text-align:left;">Departamento</th>
          <th class="th-dark">Rol</th>
          <th class="th-dark">Estado</th>
          <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
        </tr></thead>
        <tbody>
          <tr>
            <td colspan="6" style="text-align:center; padding:45px 20px; color:#64748b;">
              <span class="mi" style="font-size:36px; display:block; margin-bottom:8px; color:#94a3b8;">manage_accounts</span>
              No hay usuarios registrados
            </td>
          </tr>
        </tbody>
      `;
      return;
    }

    tabla.innerHTML = `
      <thead><tr>
        <th class="th-dark" style="text-align:left;">Usuario</th>
        <th class="th-dark" style="text-align:left;">Nombre</th>
        <th class="th-dark" style="text-align:left;">Departamento</th>
        <th class="th-dark">Rol</th>
        <th class="th-dark">Estado</th>
        <th class="th-dark th-actions" style="width:110px; text-align:center;">Acciones</th>
      </tr></thead>
      <tbody>${usuarios.map(u => {
        const rc = rolColors[u.rol] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
        return `
        <tr>
          <td class="td-prenda-name">${u.username}</td>
          <td style="font-weight:500; color:#1e293b;">${u.nombre}</td>
          <td style="color:#475569; font-size:13px;">${u.departamento_id ? (deptosMap[u.departamento_id] || '-') : '-'}</td>
          <td>
            <span style="display:inline-block; background:${rc.bg}; color:${rc.text}; border:1px solid ${rc.border}; padding:3px 10px; border-radius:9999px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">
              ${rolLabels[u.rol] || u.rol}
            </span>
          </td>
          <td>
            <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:9999px; font-size:11px; font-weight:600; ${u.activo ? 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;' : 'background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;'}">
              <span style="width:6px; height:6px; border-radius:50%; background:${u.activo ? '#10b981' : '#ef4444'};"></span>
              ${u.activo ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td class="td-actions">
            <div class="actions-wrap">
              <button type="button" class="btn-action-circle btn-action-edit" title="Editar usuario" onclick="editarUsuario(${u.id}, '${u.username}', '${u.nombre}', ${u.departamento_id || 'null'}, '${u.rol}', ${u.activo})">
                ${ICON_EDIT}
              </button>
              <button type="button" class="btn-action-circle btn-action-delete" title="Eliminar usuario" onclick="eliminarUsuario(${u.id})">
                ${ICON_DELETE}
              </button>
            </div>
          </td>
        </tr>
      `;}).join('')}</tbody>
    `;
  } catch (err) {
    console.error('Error cargando usuarios:', err);
    tabla.innerHTML = `
      <tbody>
        <tr>
          <td colspan="6" style="text-align:center; padding:35px 20px; color:#ef4444;">
            <span class="mi" style="vertical-align:middle; margin-right:6px; font-size:20px;">error</span>
            ${err.message || 'Error cargando usuarios'}
          </td>
        </tr>
      </tbody>
    `;
  }
}

export function showUsuarioModal() {
  editandoUsuarioId = null;
  document.getElementById('usuarioUsername').value = '';
  document.getElementById('usuarioUsername').disabled = false;
  document.getElementById('usuarioPassword').value = '';
  document.getElementById('usuarioNombre').value = '';
  document.getElementById('usuarioDepartamento').value = '';
  document.getElementById('usuarioRol').value = 'solicitante';
  document.getElementById('usuarioActivo').checked = true;
  document.getElementById('labelUsuarioPassword').textContent = 'Contraseña *';
  const tit = document.querySelector('#modalUsuario .modal-header h2');
  if (tit) tit.textContent = 'Nuevo Usuario';
  cargarDepartamentosUsuario();
  const modal = document.getElementById('modalUsuario');
  if (modal) modal.classList.add('show');
}

export async function cargarDepartamentosUsuario() {
  try {
    const res = await fetch(`${API}/departamentos`, { headers: { 'x-access-token': window.token } });
    const data = await res.json();
    const select = document.getElementById('usuarioDepartamento');
    if (!select) return;

    select.innerHTML = '<option value="">Sin asignar</option>' +
      (Array.isArray(data) ? data : []).map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
    if (!data.length) {
      showWarning('No hay departamentos/eventos creados. Crea uno en Catálogo > Departamentos para poder asignarlo al usuario.');
    }
  } catch (err) {
    console.error('Error cargando departamentos para usuario:', err);
  }
}

export function editarUsuario(id, username, nombre, departamento_id, rol, activo) {
  editandoUsuarioId = id;
  cargarDepartamentosUsuario().then(() => {
    document.getElementById('usuarioUsername').value = username;
    document.getElementById('usuarioUsername').disabled = id !== null;
    document.getElementById('usuarioPassword').value = '';
    document.getElementById('labelUsuarioPassword').textContent = 'Contraseña (dejar vacío para mantener)';
    document.getElementById('usuarioNombre').value = nombre;
    document.getElementById('usuarioDepartamento').value = departamento_id || '';
    document.getElementById('usuarioRol').value = rol;
    document.getElementById('usuarioActivo').checked = activo === 1;
    const tit = document.querySelector('#modalUsuario .modal-header h2');
    if (tit) tit.textContent = 'Editar Usuario';
    const modal = document.getElementById('modalUsuario');
    if (modal) modal.classList.add('show');
  });
}

export function closeUsuarioModal() {
  const modal = document.getElementById('modalUsuario');
  if (modal) modal.classList.remove('show');
  editandoUsuarioId = null;
}

export async function guardarUsuario() {
  const username = document.getElementById('usuarioUsername')?.value?.trim();
  const password = document.getElementById('usuarioPassword')?.value;
  const nombre = document.getElementById('usuarioNombre')?.value?.trim();
  const departamento_id = document.getElementById('usuarioDepartamento')?.value;
  const rol = document.getElementById('usuarioRol')?.value;
  const activo = document.getElementById('usuarioActivo')?.checked ? 1 : 0;

  if (!username) {
    showError('El nombre de usuario es requerido');
    return;
  }
  if (!nombre) {
    showError('El nombre completo es requerido');
    return;
  }
  if (!rol) {
    showError('El rol es requerido');
    return;
  }
  if (!editandoUsuarioId && !password) {
    showError('La contraseña es requerida para nuevos usuarios');
    return;
  }

  const data = {
    nombre,
    rol,
    activo,
    departamento_id: departamento_id ? parseInt(departamento_id, 10) : null
  };

  if (!editandoUsuarioId) {
    data.username = username;
    data.password = password;
  } else if (password) {
    data.password = password;
  }

  const url = editandoUsuarioId ? `${API}/usuarios/${editandoUsuarioId}` : `${API}/usuarios`;
  const method = editandoUsuarioId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      showSuccess(editandoUsuarioId ? 'Usuario actualizado' : 'Usuario creado');
      closeUsuarioModal();
      loadUsuarios();
    } else {
      const err = await res.json();
      showError(err.message || 'Error al guardar usuario');
    }
  } catch (err) {
    showError('Error de red al guardar usuario');
  }
}

export async function eliminarUsuario(id) {
  if (await confirmDialog('¿Eliminar este usuario?', 'Eliminar usuario')) {
    try {
      await fetch(`${API}/usuarios/${id}`, { method: 'DELETE', headers: { 'x-access-token': window.token } });
      showSuccess('Usuario eliminado');
      loadUsuarios();
    } catch (err) {
      showError('Error al eliminar usuario');
    }
  }
}

// Exposición global a window
Object.assign(window, {
  obtenerPrendasCache,
  loadPrendas,
  descargarPlantillaPrendas,
  abrirImportacionPrendas,
  importarPrendasDesdeArchivo,
  loadTrabajadores,
  loadTrabajadoresInternos,
  showTrabajadorInternoModal,
  closeTrabajadorInternoModal,
  editarTrabajadorInterno,
  guardarTrabajadorInterno,
  eliminarTrabajadorInterno,
  showPrendaModal,
  editarPrenda,
  closePrendaModal,
  guardarPrenda,
  eliminarPrenda,
  showTrabajadorModal,
  closeTrabajadorModal,
  guardarTrabajador,
  editarTrabajador,
  eliminarTrabajador,
  loadDepartamentos,
  showDepartamentoModal,
  editarDepartamento,
  closeDepartamentoModal,
  guardarDepartamento,
  eliminarDepartamento,
  loadUsuarios,
  showUsuarioModal,
  cargarDepartamentosUsuario,
  editarUsuario,
  closeUsuarioModal,
  guardarUsuario,
  eliminarUsuario
});
