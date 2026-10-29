/**
 * Módulo de Tareas y Asignación Operativa (Diseño Dual-Grid de Alta Velocidad)
 * Jardines Lavandería - Flujo de 2 Columnas Side-by-Side tipo Escritorio
 * Módulo ES6 con compatibilidad global
 */

import { API } from '../core/api.js';
import {
  formatDate,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  confirmDialog,
  setSearchCounter,
  setActiveSearchItem,
  focusField,
  showFieldError,
  clearFieldErrors,
  resolverCoincidenciaPorNombre
} from '../core/ui.js';
import { updateProcesoStatusBar } from './procesos.js';

// Estado local del módulo
let prendasTarea = [];
let canastaPrendas = [];
let prendasCatalogoTarea = [];
let prendasStockCache = {};
let prendaSeleccionadaTarea = null;
let trabajadorSeleccionadoTarea = null;
let procesoSeleccionadoTarea = 'remojo';
let stockDisponibleActual = 0;
let trabajadoresCache = [];
let trabajadoresInternosCache = [];
let completarContext = null;
let prendaModalContext = null;
let filaCatalogoActivaIndex = -1;

function getActiveToken() {
  const token = window.token || localStorage.getItem('token');
  if (token && !window.token) window.token = token;
  return token;
}

const PROCESO_COLORES = {
  remojo: '#f59e0b',
  lavado: '#2563eb',
  desmanche: '#ec4899',
  planchado: '#4f46e5',
  tendido: '#10b981',
  recogido: '#06b6d4',
  limpio: '#8b5cf6',
  stock: '#14b8a6',
  sucio: '#ef4444'
};

const PROCESO_NOMBRES = {
  remojo: 'Remojo',
  lavado: 'Lavado',
  desmanche: 'Desmanche',
  planchado: 'Planchado',
  tendido: 'Tendido',
  recogido: 'Recogido',
  limpio: 'Limpio',
  stock: 'Stock',
  sucio: 'Sucio'
};

const PROCESO_ORIGEN_MAP = {
  sucio: 'sucio',
  remojo: 'sucio',
  lavado: 'lavado',
  desmanche: 'lavado',
  planchado: 'limpio'
};

function getInitials(name) {
  if (!name) return 'OP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function calculateElapsedTime(dateStr) {
  if (!dateStr) return 'Reciente';
  const created = new Date(dateStr);
  if (isNaN(created.getTime())) return 'En curso';
  const now = new Date();
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
}

/**
 * Calcula la tarifa por prenda según proceso y condición del operario (factura o normal)
 */
export function calcularTarifaPrenda(prenda, proceso, trabajador) {
  if (!prenda || !proceso) return 0;
  const esFactura = Boolean(trabajador && (trabajador.factura === 1 || trabajador.factura === true || trabajador.factura === '1'));
  if (esFactura) {
    const key = `precio_${proceso}_factura`;
    const val = prenda[key];
    if (val !== undefined && val !== null && val !== '') return Number(val);
  }
  const keyNormal = `precio_${proceso}`;
  const valNormal = prenda[keyNormal];
  return Number(valNormal || 0);
}

/**
 * Obtiene el stock en tiempo real de una prenda para la etapa de origen del proceso actual
 */
export function obtenerStockPrendaEtapa(prendaId, proceso) {
  const origen = PROCESO_ORIGEN_MAP[proceso] || 'sucio';
  const key = `${prendaId}_${origen}`;
  return Number(prendasStockCache[key] || 0);
}

/**
 * Carga todo el stock del inventario en caché para filtrado instantáneo sin latencia
 */
export async function cargarStockInventario() {
  try {
    const token = getActiveToken();
    const res = await fetch(`${API}/prendas/stock`, {
      headers: { 'x-access-token': token }
    });
    const data = await res.json();
    prendasStockCache = {};
    if (Array.isArray(data)) {
      data.forEach(item => {
        const key = `${item.id}_${item.proceso}`;
        prendasStockCache[key] = Number(item.cantidad || 0);
      });
    }
  } catch (err) {
    console.error('Error cargando stock de inventario:', err);
  }
}

/**
 * Renderiza la tabla continua del catálogo de prendas (Panel Izquierdo)
 */
export function renderCatalogoPrendas() {
  const tbody = document.getElementById('catalogTableBody');
  const countBadge = document.getElementById('catalogCountBadge');
  const searchInput = document.getElementById('buscarPrenda');
  const checkSoloStock = document.getElementById('checkSoloConStock');

  if (!tbody) return;

  const query = (searchInput?.value || '').trim().toLowerCase();
  const soloStock = Boolean(checkSoloStock?.checked);
  const proceso = procesoSeleccionadoTarea || 'remojo';

  let filtradas = (prendasCatalogoTarea || []).filter(p => {
    if (query) {
      const matchName = (p.nombre || '').toLowerCase().includes(query);
      const matchId = String(p.id).includes(query);
      if (!matchName && !matchId) return false;
    }
    const stock = obtenerStockPrendaEtapa(p.id, proceso);
    if (soloStock && stock <= 0) return false;
    return true;
  });

  // Ordenar: primero las que tienen stock disponible
  filtradas.sort((a, b) => {
    const stockA = obtenerStockPrendaEtapa(a.id, proceso);
    const stockB = obtenerStockPrendaEtapa(b.id, proceso);
    if (stockA > 0 && stockB <= 0) return -1;
    if (stockB > 0 && stockA <= 0) return 1;
    return (a.nombre || '').localeCompare(b.nombre || '');
  });

  if (countBadge) {
    countBadge.textContent = `${filtradas.length} prendas`;
  }

  if (!filtradas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 36px 12px; color: #94a3b8;">
          <span class="mi" style="font-size: 32px; display: block; margin-bottom: 6px; color: #cbd5e1;">search_off</span>
          No se encontraron prendas con ese criterio o en esta etapa
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtradas.map((p, idx) => {
    const stock = obtenerStockPrendaEtapa(p.id, proceso);
    const tarifa = calcularTarifaPrenda(p, proceso, trabajadorSeleccionadoTarea);
    const isActive = idx === filaCatalogoActivaIndex;

    return `
      <tr class="${isActive ? 'active-row' : ''}" data-prenda-id="${p.id}" onclick="abrirCantidadPrendaDirecta(${p.id})">
        <td class="cell-id">#${p.id}</td>
        <td class="cell-name" title="${p.nombre}">${p.nombre}</td>
        <td class="cell-stock">
          <span class="stock-tag-pill ${stock > 0 ? '' : 'empty'}">${stock} pzs</span>
        </td>
        <td class="cell-rate">Q ${tarifa.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Filtra el catálogo de prendas según la búsqueda y el filtro de stock
 */
export function filtrarCatalogoPrendas() {
  filaCatalogoActivaIndex = 0;
  renderCatalogoPrendas();
}

/**
 * Limpia el campo de búsqueda de prendas y devuelve el foco
 */
export function limpiarBuscadorPrendas() {
  const input = document.getElementById('buscarPrenda');
  if (input) {
    input.value = '';
    input.focus();
  }
  filtrarCatalogoPrendas();
}

/**
 * Abre el diálogo de ingreso de cantidad (CONTROL DE BLANCOS) para una prenda específica
 */
export async function abrirCantidadPrendaDirecta(prendaId) {
  if (!trabajadorSeleccionadoTarea) {
    showWarning('Selecciona primero la persona encargada en la barra superior');
    focusField('tareaTrabajador', 'Selecciona operario');
    return;
  }

  const prenda = (prendasCatalogoTarea || []).find(p => Number(p.id) === Number(prendaId));
  if (!prenda) return;

  const proceso = procesoSeleccionadoTarea || 'remojo';
  const tarifa = calcularTarifaPrenda(prenda, proceso, trabajadorSeleccionadoTarea);

  // Consultar trazabilidad de stock en tiempo real
  let stockDisp = obtenerStockPrendaEtapa(prenda.id, proceso);
  try {
    const token = getActiveToken();
    const res = await fetch(`${API}/prendas/${prenda.id}/stock-trazabilidad`, {
      headers: { 'x-access-token': token }
    });
    const stockData = await res.json();
    const origen = PROCESO_ORIGEN_MAP[proceso] || 'sucio';
    const enOrigen = (Array.isArray(stockData) ? stockData : []).filter(s => s.proceso === origen);
    stockDisp = enOrigen.reduce((sum, s) => sum + s.cantidad, 0);
    // Actualizar caché local
    prendasStockCache[`${prenda.id}_${origen}`] = stockDisp;
  } catch (err) {
    console.error('Error consultando stock en vivo:', err);
  }

  abrirModalCantidadRapida(prenda, stockDisp, tarifa);
}

/**
 * Abre el Modal InputBox: CONTROL DE BLANCOS con autofocus
 */
export function abrirModalCantidadRapida(prenda, stockDisp, tarifa) {
  prendaModalContext = { prenda, stockDisp, tarifa };

  const modal = document.getElementById('modalCantidadRapidaPrenda');
  const prendaNombre = document.getElementById('modalCantidadPrendaNombre');
  const stockTag = document.getElementById('modalCantidadStockTag');
  const tarifaTag = document.getElementById('modalCantidadTarifaTag');
  const inputCant = document.getElementById('inputCantidadRapidaPrenda');

  const procNombre = PROCESO_NOMBRES[procesoSeleccionadoTarea] || (procesoSeleccionadoTarea || '').toUpperCase();
  const origen = (PROCESO_ORIGEN_MAP[procesoSeleccionadoTarea] || 'sucio').toUpperCase();

  if (prendaNombre) prendaNombre.textContent = prenda.nombre;
  if (stockTag) stockTag.textContent = `Disponible en ${origen}: ${stockDisp} piezas`;
  if (tarifaTag) tarifaTag.textContent = `Q ${Number(tarifa || 0).toFixed(2)} / pza`;

  if (inputCant) {
    inputCant.removeAttribute('max');
    inputCant.value = stockDisp > 0 ? '1' : '0';
  }

  if (stockDisp <= 0) {
    mostrarAlertaModal('Sin existencias disponibles', `No hay piezas de esta prenda en ${origen} para ${procNombre}`);
  } else {
    ocultarAlertaModal();
  }

  actualizarSubtotalModalEnVivo();

  if (modal) modal.classList.add('show');

  // Autofocus inmediato con selección total de texto
  setTimeout(() => {
    if (inputCant) {
      inputCant.focus();
      inputCant.select();
    }
  }, 40);
}

/**
 * Cierra el modal rápido y transfiere el foco al buscador de prendas
 */
export function cerrarModalCantidadRapida() {
  const modal = document.getElementById('modalCantidadRapidaPrenda');
  if (modal) modal.classList.remove('show');
  prendaModalContext = null;
  ocultarAlertaModal();

  setTimeout(() => {
    const bPrenda = document.getElementById('buscarPrenda');
    if (bPrenda) {
      bPrenda.value = '';
      bPrenda.focus();
    }
    renderCatalogoPrendas();
  }, 30);
}

export function cerrarModalCantidadRapidaPorBackdrop(e) {
  if (e && e.target && e.target.id === 'modalCantidadRapidaPrenda') {
    cerrarModalCantidadRapida();
  }
}

export function mostrarAlertaModal(titulo, desc) {
  const alertBox = document.getElementById('modalCantidadAlertBox');
  const titleEl = document.getElementById('modalCantidadAlertTitle');
  const descEl = document.getElementById('modalCantidadAlertDesc');
  const inputCant = document.getElementById('inputCantidadRapidaPrenda');
  const confirmBtn = document.getElementById('btnConfirmarCantidadModal');

  if (titleEl) titleEl.textContent = titulo;
  if (descEl) descEl.textContent = desc;

  if (alertBox) {
    alertBox.style.display = 'flex';
    alertBox.style.animation = 'none';
    void alertBox.offsetWidth;
    alertBox.style.animation = 'qinputAlertShake 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
  }

  if (inputCant) {
    inputCant.style.borderColor = '#ef4444';
    inputCant.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.15)';
  }

  if (confirmBtn) {
    confirmBtn.style.opacity = '0.55';
  }
}

export function ocultarAlertaModal() {
  const alertBox = document.getElementById('modalCantidadAlertBox');
  const inputCant = document.getElementById('inputCantidadRapidaPrenda');
  const confirmBtn = document.getElementById('btnConfirmarCantidadModal');

  if (alertBox) alertBox.style.display = 'none';

  if (inputCant) {
    inputCant.style.borderColor = '#0284c7';
    inputCant.style.boxShadow = '';
  }

  if (confirmBtn) {
    confirmBtn.style.opacity = '1';
  }
}

export function actualizarSubtotalModalEnVivo() {
  if (!prendaModalContext) return;
  const input = document.getElementById('inputCantidadRapidaPrenda');
  const subtotalEl = document.getElementById('modalSubtotalEstimado');
  const cant = parseInt(input?.value, 10) || 0;
  const tarifa = Number(prendaModalContext.tarifa || 0);
  const subtotal = cant * tarifa;

  if (subtotalEl) subtotalEl.textContent = `Q ${subtotal.toFixed(2)}`;

  const origen = (PROCESO_ORIGEN_MAP[procesoSeleccionadoTarea] || 'sucio').toUpperCase();
  const stockDisp = prendaModalContext.stockDisp;

  if (cant <= 0) {
    mostrarAlertaModal('Cantidad requerida', 'Ingresa una cantidad mayor a 0');
  } else if (cant > stockDisp) {
    mostrarAlertaModal('Stock insuficiente', `Solo hay ${stockDisp} piezas disponibles en ${origen} (solicitadas: ${cant})`);
  } else {
    ocultarAlertaModal();
  }
}

/**
 * Confirma la cantidad en CONTROL DE BLANCOS y agrega a la tabla de la derecha
 */
export function confirmarCantidadRapidaModal(e) {
  if (e) e.preventDefault();
  if (!prendaModalContext) return;

  const { prenda, stockDisp, tarifa } = prendaModalContext;
  const inputCant = document.getElementById('inputCantidadRapidaPrenda');
  const cant = parseInt(inputCant?.value, 10) || 0;
  const origen = (PROCESO_ORIGEN_MAP[procesoSeleccionadoTarea] || 'sucio').toUpperCase();

  if (cant <= 0) {
    mostrarAlertaModal('Cantidad requerida', 'Ingresa una cantidad mayor a 0 piezas');
    inputCant?.focus();
    inputCant?.select();
    return;
  }

  const existenteIndex = canastaPrendas.findIndex(p => p.prenda_id === prenda.id);
  const cantPrevia = existenteIndex !== -1 ? canastaPrendas[existenteIndex].cantidad : 0;
  const cantTotal = cantPrevia + cant;

  if (cantTotal > stockDisp) {
    mostrarAlertaModal('Stock insuficiente', `Solo hay ${stockDisp} piezas en ${origen} (acumulado solicitado: ${cantTotal})`);
    inputCant?.focus();
    inputCant?.select();
    return;
  }

  if (existenteIndex !== -1) {
    canastaPrendas[existenteIndex].cantidad = cantTotal;
    canastaPrendas[existenteIndex].stockDisponible = stockDisp;
    canastaPrendas[existenteIndex].subtotal = cantTotal * tarifa;
  } else {
    canastaPrendas.push({
      prenda_id: prenda.id,
      nombre: prenda.nombre,
      cantidad: cant,
      stockDisponible: stockDisp,
      tarifa: tarifa,
      subtotal: cant * tarifa
    });
  }

  cerrarModalCantidadRapida();
  renderCanastaPrendas();
  showInfo(`Agregado a la orden: ${cant}x ${prenda.nombre}`);
}

/**
 * Renderiza la tabla de prendas asignadas (Panel Derecho)
 */
export function renderCanastaPrendas() {
  const tbody = document.getElementById('basketTableBody');
  const countBadge = document.getElementById('basketCountBadge');
  const statTipos = document.getElementById('basketStatTipos');
  const statPiezas = document.getElementById('basketStatPiezas');
  const statTotalQ = document.getElementById('basketStatTotalQ');
  const btnSummary = document.getElementById('btnAsignarSummary');
  const dispatchBtn = document.getElementById('btnAsignarTareaMain');

  if (countBadge) countBadge.textContent = `${canastaPrendas.length} asignadas`;

  if (!canastaPrendas.length) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px 12px; color: #94a3b8;">
            <span class="mi" style="font-size: 32px; display: block; margin-bottom: 6px; color: #cbd5e1;">layers_clear</span>
            No hay prendas en la orden todavía.<br>
            <span style="font-size: 11px;">Elige una prenda en la tabla de la izquierda para agregarla.</span>
          </td>
        </tr>
      `;
    }
    if (statTipos) statTipos.textContent = '0 tipos';
    if (statPiezas) statPiezas.textContent = '0 pzs';
    if (statTotalQ) statTotalQ.textContent = 'Q 0.00';
    if (btnSummary) btnSummary.textContent = 'Sin prendas en la orden';
    if (dispatchBtn) dispatchBtn.style.opacity = '0.7';
    return;
  }

  const totalPiezas = canastaPrendas.reduce((sum, item) => sum + item.cantidad, 0);
  const totalDestajo = canastaPrendas.reduce((sum, item) => sum + (item.subtotal || 0), 0);

  if (statTipos) statTipos.textContent = `${canastaPrendas.length} ${canastaPrendas.length === 1 ? 'tipo' : 'tipos'}`;
  if (statPiezas) statPiezas.textContent = `${totalPiezas} pzs`;
  if (statTotalQ) statTotalQ.textContent = `Q ${totalDestajo.toFixed(2)}`;

  const trabNombre = trabajadorSeleccionadoTarea ? trabajadorSeleccionadoTarea.nombre : 'Operario';
  const procNombre = PROCESO_NOMBRES[procesoSeleccionadoTarea] || procesoSeleccionadoTarea;

  if (btnSummary) {
    btnSummary.textContent = `${trabNombre} • ${procNombre} • ${totalPiezas} pzs • Total Q ${totalDestajo.toFixed(2)}`;
  }
  if (dispatchBtn) dispatchBtn.style.opacity = '1';

  if (tbody) {
    tbody.innerHTML = canastaPrendas.map((item, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 800; color: #0284c7; font-size: 13px;">${item.cantidad}</td>
        <td class="cell-id">#${item.prenda_id}</td>
        <td class="cell-name" title="${item.nombre}">${item.nombre}</td>
        <td class="cell-rate">Q ${Number(item.tarifa || 0).toFixed(2)}</td>
        <td style="text-align: right; font-weight: 800; color: #16a34a;">Q ${Number(item.subtotal || 0).toFixed(2)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-remove-basket-row" onclick="eliminarPrendaCanasta(${idx})" title="Quitar de la orden">
            <span class="mi" style="font-size: 15px;">close</span>
          </button>
        </td>
      </tr>
    `).join('');
  }
}

/**
 * Quita una prenda de la canasta
 */
export function eliminarPrendaCanasta(idx) {
  if (idx >= 0 && idx < canastaPrendas.length) {
    const eliminada = canastaPrendas[idx];
    canastaPrendas.splice(idx, 1);
    renderCanastaPrendas();
    showInfo(`Eliminado de la orden: ${eliminada.nombre}`);
  }
}

/**
 * Limpia la canasta completa
 */
export function limpiarCanasta() {
  canastaPrendas = [];
  renderCanastaPrendas();
  showInfo('Orden limpiada');
}

/**
 * Cambia el operario desde el dropdown superior
 */
export function seleccionarTrabajadorDropdown(id) {
  const trab = (trabajadoresCache || []).find(t => Number(t.id) === Number(id));
  trabajadorSeleccionadoTarea = trab || null;

  // Actualizar tarifas de prendas en la canasta si ya hay
  if (trabajadorSeleccionadoTarea && canastaPrendas.length > 0) {
    canastaPrendas.forEach(item => {
      const p = (prendasCatalogoTarea || []).find(x => Number(x.id) === Number(item.prenda_id));
      if (p) {
        item.tarifa = calcularTarifaPrenda(p, procesoSeleccionadoTarea, trabajadorSeleccionadoTarea);
        item.subtotal = item.cantidad * item.tarifa;
      }
    });
  }

  renderCatalogoPrendas();
  renderCanastaPrendas();
}

/**
 * Cambia el proceso desde el dropdown superior
 */
export function seleccionarProcesoDropdown(proceso) {
  procesoSeleccionadoTarea = proceso;

  // Actualizar tarifas de prendas en la canasta si ya hay
  if (canastaPrendas.length > 0) {
    canastaPrendas.forEach(item => {
      const p = (prendasCatalogoTarea || []).find(x => Number(x.id) === Number(item.prenda_id));
      if (p) {
        item.tarifa = calcularTarifaPrenda(p, procesoSeleccionadoTarea, trabajadorSeleccionadoTarea);
        item.subtotal = item.cantidad * item.tarifa;
      }
    });
  }

  renderCatalogoPrendas();
  renderCanastaPrendas();
}

/**
 * Teclas en el buscador: Enter o Flechas para abrir CONTROL DE BLANCOS
 */
export function onBuscarPrendaKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const rows = document.querySelectorAll('#catalogTableBody tr[data-prenda-id]');
    if (rows && rows.length > 0) {
      const targetRow = rows[filaCatalogoActivaIndex] || rows[0];
      targetRow.click();
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    const rows = document.querySelectorAll('#catalogTableBody tr[data-prenda-id]');
    if (rows && rows.length > 0) {
      filaCatalogoActivaIndex = Math.min(rows.length - 1, filaCatalogoActivaIndex + 1);
      renderCatalogoPrendas();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const rows = document.querySelectorAll('#catalogTableBody tr[data-prenda-id]');
    if (rows && rows.length > 0) {
      filaCatalogoActivaIndex = Math.max(0, filaCatalogoActivaIndex - 1);
      renderCatalogoPrendas();
    }
  }
}

/**
 * Configura los atajos de teclado globales (Ctrl+Enter para despachar)
 */
export function setupTecladoDualGrid() {
  if (!window.tecladoDualGridConfigurado) {
    window.tecladoDualGridConfigurado = true;
    window.addEventListener('keydown', (e) => {
      // Ctrl + Enter: Despachar orden directamente
      if (e.ctrlKey && e.key === 'Enter') {
        const modal = document.getElementById('modalCantidadRapidaPrenda');
        if (!modal || !modal.classList.contains('show')) {
          e.preventDefault();
          crearTareaDirecta();
        }
      } else if (e.key === 'Escape') {
        const modal = document.getElementById('modalCantidadRapidaPrenda');
        if (modal && modal.classList.contains('show')) {
          e.preventDefault();
          cerrarModalCantidadRapida();
        }
      }
    });
  }
}

/**
 * Despacho atómico de la orden de tareas a producción
 */
export async function crearTareaDirecta() {
  clearFieldErrors();

  if (!trabajadorSeleccionadoTarea) {
    showWarning('Selecciona la persona encargada en la barra superior');
    focusField('tareaTrabajador', 'Selecciona operario');
    return;
  }

  const proceso = procesoSeleccionadoTarea || 'remojo';

  if (canastaPrendas.length === 0) {
    showWarning('Agrega al menos una prenda a la orden para despachar');
    focusField('buscarPrenda', 'Buscar prenda');
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);

  try {
    const payload = {
      trabajador_id: Number(trabajadorSeleccionadoTarea.id),
      proceso,
      prendas: canastaPrendas.map(p => ({
        prenda_id: p.prenda_id,
        cantidad: p.cantidad,
        nombre: p.nombre
      })),
      fecha_asignacion: hoy
    };

    const token = getActiveToken();
    const res = await fetch(`${API}/tareas/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-token': token },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      const totalPiezas = canastaPrendas.reduce((sum, p) => sum + p.cantidad, 0);
      showSuccess(`¡Orden de ${totalPiezas} piezas asignada a ${trabajadorSeleccionadoTarea.nombre}!`);

      // Limpiar la canasta
      canastaPrendas = [];
      renderCanastaPrendas();

      // Refrescar inventario y monitor en vivo
      await cargarStockInventario();
      renderCatalogoPrendas();
      loadTareasActivas();

      // Devolver foco a buscar prenda
      setTimeout(() => {
        const b = document.getElementById('buscarPrenda');
        if (b) {
          b.value = '';
          b.focus();
        }
      }, 50);
    } else {
      const errorMsg = data.errores ? data.errores.map(e => e.error).join('\n') : (data.message || 'Error al asignar tarea');
      showError(errorMsg);
    }
  } catch (err) {
    console.error('Error al despachar orden:', err);
    showError('Error de red al despachar la tarea');
  }
}

/**
 * Carga principal del módulo y datos iniciales
 */
export async function loadTareasForm() {
  const token = getActiveToken();
  if (!token) {
    console.warn('loadTareasForm: esperando token de autenticación...');
    return;
  }
  try {
    const res = await fetch(`${API}/trabajadores`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    trabajadoresCache = Array.isArray(data) ? data : [];

    const resInternos = await fetch(`${API}/trabajadores-internos`, { headers: { 'x-access-token': token } });
    const dataInternos = await resInternos.json();
    trabajadoresInternosCache = Array.isArray(dataInternos) ? dataInternos : [];

    // Llenar select de trabajadores en la barra superior
    const selectTrab = document.getElementById('tareaTrabajador');
    if (selectTrab) {
      selectTrab.innerHTML = '<option value="">Selecciona persona encargada...</option>' +
        trabajadoresCache.map(t => `<option value="${t.id}">${t.nombre} ${t.factura ? ' (Factura)' : ''}</option>`).join('');

      // Conservar el seleccionado o tomar el primero
      if (!trabajadorSeleccionadoTarea && trabajadoresCache.length > 0) {
        trabajadorSeleccionadoTarea = trabajadoresCache[0];
        selectTrab.value = trabajadorSeleccionadoTarea.id;
      } else if (trabajadorSeleccionadoTarea) {
        selectTrab.value = trabajadorSeleccionadoTarea.id;
      }
    }

    // Filtro del monitor inferior
    const filtroTrab = document.getElementById('filtroTareasTrabajador');
    if (filtroTrab) {
      filtroTrab.innerHTML = '<option value="">Todos los operarios</option>' +
        trabajadoresCache.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
    }

    // Proceso por defecto
    const selectProc = document.getElementById('tareaProceso');
    if (selectProc) {
      if (!procesoSeleccionadoTarea) procesoSeleccionadoTarea = 'remojo';
      selectProc.value = procesoSeleccionadoTarea;
    }

    // Catálogo de prendas
    const resPrendas = await fetch(`${API}/prendas`, { headers: { 'x-access-token': token } });
    const dataPrendas = await resPrendas.json();
    prendasCatalogoTarea = Array.isArray(dataPrendas) ? dataPrendas : [];
    window.prendasCacheGlobal = prendasCatalogoTarea.slice();

    // Cargar stock global
    await cargarStockInventario();

    // Renderizar ambas tablas
    renderCatalogoPrendas();
    renderCanastaPrendas();

    // Cargar monitor inferior
    loadTareasActivas();

    // Atajos de teclado
    setupTecladoDualGrid();

    // Foco inmediato en el buscador de prendas
    setTimeout(() => {
      const bPrenda = document.getElementById('buscarPrenda');
      if (bPrenda) bPrenda.focus();
    }, 60);

  } catch (err) {
    console.error('Error cargando formulario de tareas:', err);
  }
}

export async function loadTareasActivas() {
  const filtro = document.getElementById('filtroTareasTrabajador')?.value || '';
  let url = `${API}/tareas?estado=asignada`;
  if (filtro) url += `&trabajador_id=${filtro}`;

  try {
    const token = getActiveToken();
    const res = await fetch(url, { headers: { 'x-access-token': token } });
    const tareas = await res.json();

    const kpiActivas = document.getElementById('kpiActivasCount');
    if (kpiActivas) kpiActivas.textContent = String(Array.isArray(tareas) ? tareas.length : 0);

    const queueTitle = document.getElementById('taskQueueTitle');
    if (queueTitle) queueTitle.textContent = `Actualizado ${new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}`;

    const listaEl = document.getElementById('tareasActivasLista');
    if (!listaEl) return;

    if (!Array.isArray(tareas) || tareas.length === 0) {
      listaEl.innerHTML = `
        <div class="tasks-empty-state">
          <span class="mi">task_alt</span>
          <h4 style="margin:0 0 4px; color:#64748b; font-weight:700;">Sin tareas en cola</h4>
          <p style="margin:0; font-size:13px;">Todas las órdenes han sido completadas</p>
        </div>
      `;
      return;
    }

    listaEl.innerHTML = tareas.map(t => {
      const procColor = PROCESO_COLORES[t.proceso] || '#0284c7';
      const safeProceso = String(t.proceso || '').replace(/'/g, "\\'");
      const initials = getInitials(t.trabajador_nombre);
      const elapsed = calculateElapsedTime(t.created_at || t.fecha_asignacion);
      const isAuto = Number(t.es_automatica) === 1;

      return `
        <div class="active-task-card" id="taskCard_${t.id}">
          <div class="task-card-top">
            <div class="task-card-left">
              <div class="task-lot-row">
                <span class="task-lot-badge">#LOT-${String(t.id).padStart(4, '0')}</span>
                <span class="task-proc-badge" style="background:${procColor};">${(t.proceso || '').toUpperCase()}</span>
                ${isAuto ? '<span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:1px 6px; border-radius:999px; font-weight:700;">AUTO</span>' : ''}
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <h4 class="task-garment-title" style="margin:0;">${t.cantidad}x ${t.prenda_nombre}</h4>
                <span style="font-size:11.5px; font-weight:800; color:#15803d; background:#dcfce7; padding:2px 7px; border-radius:6px; flex-shrink:0;">Q ${Number(t.total || 0).toFixed(2)}</span>
              </div>
              <p class="task-garment-desc">Asignado: ${formatDate(t.fecha_asignacion)} • Tarifa: Q ${Number(t.precio_unitario || 0).toFixed(2)}/pza</p>
            </div>
            <div class="task-worker-tag">
              <div class="task-worker-avatar-xs">${initials}</div>
              <span>${t.trabajador_nombre}</span>
            </div>
          </div>
          <div class="task-card-bottom">
            <div class="task-time-elapsed">
              <span class="mi" style="font-size:15px;">schedule</span>
              <span>${elapsed}</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn-complete-task" onclick="completarTarea(${t.id}, '${safeProceso}')">
                <span class="mi" style="font-size:16px;">check_circle</span>
                <span>Completar</span>
              </button>
              <button type="button" class="btn btn-danger btn-sm" style="padding:6px 10px; border-radius:8px;" onclick="cancelarTarea(${t.id})" title="Cancelar tarea">
                <span class="mi" style="font-size:16px;">close</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error cargando tareas activas:', err);
  }
}

/**
 * Modal para completar tarea
 */
export function openCompletarTareaModal(id, proceso) {
  completarContext = { id, proceso };
  const modal = document.getElementById('modalCompletarTarea');
  const info = document.getElementById('completarTareaInfo');
  const groupTendedor = document.getElementById('groupTendedor');
  const groupRecogedor = document.getElementById('groupRecogedor');
  const tendedorSelect = document.getElementById('tendedorSelect');
  const recogedorSelect = document.getElementById('recogedorSelect');

  const options = ['<option value="">Sin asignar</option>'].concat(
    trabajadoresInternosCache.map(t => `<option value="${String(t.nombre).replace(/"/g, '&quot;')}">${t.nombre}</option>`)
  ).join('');

  if (tendedorSelect) tendedorSelect.innerHTML = options;
  if (recogedorSelect) recogedorSelect.innerHTML = options;

  if (groupTendedor) groupTendedor.style.display = 'none';
  if (groupRecogedor) groupRecogedor.style.display = proceso === 'tendido' ? 'block' : 'none';

  if (info) {
    info.textContent = proceso === 'lavado'
      ? 'Esta tarea creará automáticamente la tarea de Tendido con el mismo trabajador.'
      : (proceso === 'tendido'
        ? 'Esta tarea creará automáticamente la tarea de Recogido.'
        : 'Confirma para completar la tarea y avanzar la prenda al siguiente proceso.');
  }

  if (modal) modal.classList.add('show');
}

export function closeCompletarTareaModal() {
  const modal = document.getElementById('modalCompletarTarea');
  if (modal) modal.classList.remove('show');
  completarContext = null;
}

export async function confirmCompletarTarea() {
  if (!completarContext) return;
  const { id, proceso } = completarContext;
  const payload = {};
  if (proceso === 'tendido') {
    const recogedor = document.getElementById('recogedorSelect')?.value;
    if (recogedor) payload.recogedor_nombre = recogedor;
  }

  try {
    const token = getActiveToken();
    const res = await fetch(`${API}/tareas/${id}/completar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': token },
      body: JSON.stringify(payload)
    });
    let data = {};
    try { data = await res.json(); } catch (_) { data = {}; }
    if (res.ok) {
      closeCompletarTareaModal();
      showSuccess('Tarea completada con éxito. La prenda avanzó de proceso.');
      loadTareasActivas();
    } else {
      showError(data.message || 'Error al completar tarea');
    }
  } catch (err) {
    showError('Error de red al completar tarea');
  }
}

export async function completarTarea(id, proceso) {
  openCompletarTareaModal(id, proceso);
}

export async function cancelarTarea(id) {
  if (await confirmDialog('¿Estás seguro de cancelar esta tarea?')) {
    try {
      const token = getActiveToken();
      const res = await fetch(`${API}/tareas/${id}/cancelar`, {
        method: 'PUT',
        headers: { 'x-access-token': token }
      });
      if (res.ok) {
        showWarning('Tarea cancelada');
        loadTareasActivas();
      } else {
        showError('No se pudo cancelar la tarea');
      }
    } catch (err) {
      showError('Error al cancelar tarea');
    }
  }
}

/**
 * Renderizado de trazabilidad de stock en caso de stock insuficiente
 */
export function mostrarTrazabilidadStock(prendaId, nombrePrenda, stockData, cantidadSolicitada) {
  const porProceso = {};
  (Array.isArray(stockData) ? stockData : []).forEach(item => {
    if (!porProceso[item.proceso]) {
      porProceso[item.proceso] = { cantidad: 0, deptos: {} };
    }
    porProceso[item.proceso].cantidad += item.cantidad;
    if (item.departamento_nombre && item.departamento_nombre !== 'Lavanderia') {
      if (!porProceso[item.proceso].deptos[item.departamento_nombre]) {
        porProceso[item.proceso].deptos[item.departamento_nombre] = 0;
      }
      porProceso[item.proceso].deptos[item.departamento_nombre] += item.cantidad;
    }
  });

  const procesoColores = { 'sucio': '#ef4444', 'remojo': '#f59e0b', 'lavado': '#2563eb', 'tendido': '#10b981', 'recogido': '#06b6d4', 'reproceso': '#3b82f6', 'limpio': '#8b5cf6', 'planchado': '#4f46e5', 'desmanche': '#ec4899', 'stock': '#14b8a6' };
  const procesoNombres = { 'sucio': 'SUCIO', 'remojo': 'REMOJO', 'lavado': 'LAVADO', 'tendido': 'TENDIDO', 'recogido': 'RECOGIDO', 'reproceso': 'REPROCESO', 'limpio': 'LIMPIO', 'planchado': 'PLANCHADO', 'desmanche': 'DESMANCHE', 'stock': 'STOCK' };

  let html = `<div class="stock-warning-box" style="background:#fffbeb; border:1px solid #fde68a; padding:16px; border-radius:12px; margin-top:14px;">
    <h4 style="color:#b45309; margin:0 0 8px 0; font-size:14px; font-weight:800; display:flex; align-items:center; gap:6px;">
      <span class="mi" style="font-size:18px;">warning</span>Stock Insuficiente
    </h4>
    <p style="color:#78350f; font-size:12px; margin:0 0 10px 0;">
      <strong>${nombrePrenda}</strong> — Cantidad solicitada: <strong>${cantidadSolicitada}</strong>
    </p>`;

  const procesosConStock = Object.keys(porProceso).filter(p => porProceso[p].cantidad > 0);

  if (procesosConStock.length === 0) {
    html += '<p style="color:#ef4444; font-size:12px; margin:0;">No hay stock disponible de esta prenda en ningún proceso.</p>';
  } else {
    procesosConStock.forEach(proceso => {
      const info = porProceso[proceso];
      const deptos = Object.entries(info.deptos).map(([depto, cant]) => `<span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:11px;">${depto}: <strong>${cant}</strong></span>`).join(' ');
      const deptoHtml = Object.keys(info.deptos).length > 0 ? `<div style="margin-top:4px; font-size:11px; color:#64748b;">${deptos}</div>` : '';

      html += `<div style="margin:6px 0; padding:8px 10px; border-left:3px solid ${procesoColores[proceso] || '#94a3b8'}; background:white; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <strong style="color:${procesoColores[proceso] || '#0f172a'}; font-size:12px;">${procesoNombres[proceso] || proceso.toUpperCase()}</strong>: 
        <span style="background:${procesoColores[proceso] || '#94a3b8'}; color:white; padding:1px 8px; border-radius:999px; font-weight:800; font-size:11px;">${info.cantidad}</span>
        ${deptoHtml}
      </div>`;
    });
  }

  html += '</div>';

  const box = document.getElementById('stockInfoPrenda');
  if (box) {
    box.innerHTML = html;
    box.style.display = 'block';

    const totalDisponible = Object.values(porProceso).reduce((sum, p) => sum + p.cantidad, 0);
    if (totalDisponible > 0) {
      box.innerHTML += `
        <button type="button" class="btn btn-warning btn-sm" style="margin-top:10px; width:100%; border-radius:8px;" onclick="usarStockDisponible(${prendaId}, '${nombrePrenda.replace(/'/g, "\\'")}', ${Math.min(totalDisponible, cantidadSolicitada)})">
          <span class="mi">inventory</span>Usar Stock Disponible (${Math.min(totalDisponible, cantidadSolicitada)})
        </button>
      `;
    }
  }
}

export function usarStockDisponible(prendaId, nombrePrenda, cantidad) {
  const cantInput = document.getElementById('cantidadPrenda');
  if (cantInput) cantInput.value = cantidad;
  showInfo(`Cantidad ajustada a ${cantidad} prendas disponibles`);
  actualizarResumenBotonTarea();
}

/**
 * Ver stock y trazabilidad
 */
export async function verStockTrazabilidad() {
  if (!prendaSeleccionadaTarea) {
    showWarning('Selecciona una prenda primero');
    return;
  }
  recalcularStockPrendaSeleccionada(prendaSeleccionadaTarea.id);
}

/**
 * Funciones de compatibilidad hacia atrás
 */
export function updateTareaDraftSummary() {
  const items = prendasTarea.length;
  const total = prendasTarea.reduce((sum, p) => sum + Number(p.cantidad || 0), 0);
  const kpiItems = document.getElementById('kpiBorradorItems');
  const kpiTotal = document.getElementById('kpiBorradorTotal');
  if (kpiItems) kpiItems.textContent = String(items);
  if (kpiTotal) kpiTotal.textContent = String(total);
}

export function renderPrendasTarea() {
  updateTareaDraftSummary();
}

export function quitarPrendaTarea(index) {
  prendasTarea.splice(index, 1);
  window.prendasTarea = prendasTarea;
  renderPrendasTarea();
}

export async function agregarPrendaTarea() {
  await crearTareaDirecta();
}

export async function crearTarea() {
  await crearTareaDirecta();
}

// Exposición global al objeto window para listeners del DOM y módulos externos
Object.assign(window, {
  renderCatalogoPrendas,
  filtrarCatalogoPrendas,
  limpiarBuscadorPrendas,
  abrirCantidadPrendaDirecta,
  seleccionarTrabajadorDropdown,
  seleccionarProcesoDropdown,
  onBuscarPrendaKeydown,
  setupTecladoDualGrid,
  cargarStockInventario,
  
  mostrarAlertaModal,
  ocultarAlertaModal,
  abrirModalCantidadRapida,
  cerrarModalCantidadRapida,
  cerrarModalCantidadRapidaPorBackdrop,
  actualizarSubtotalModalEnVivo,
  confirmarCantidadRapidaModal,
  
  renderCanastaPrendas,
  eliminarPrendaCanasta,
  limpiarCanasta,
  crearTareaDirecta,
  
  calcularTarifaPrenda,
  loadTareasForm,
  loadTareasActivas,
  
  openCompletarTareaModal,
  closeCompletarTareaModal,
  confirmCompletarTarea,
  completarTarea,
  cancelarTarea,
  
  mostrarTrazabilidadStock,
  usarStockDisponible,
  verStockTrazabilidad,
  updateTareaDraftSummary,
  renderPrendasTarea,
  quitarPrendaTarea,
  agregarPrendaTarea,
  crearTarea
});
