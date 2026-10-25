/**
 * Módulo de Tareas y Asignación Operativa (Diseño Stitch)
 * Jardines Lavandería - Flujo Guiado en 3 Pasos y Monitor en Tiempo Real
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
let prendasCatalogoTarea = [];
let prendaSeleccionadaTarea = null;
let trabajadorSeleccionadoTarea = null;
let procesoSeleccionadoTarea = '';
let stockDisponibleActual = 0;
let trabajadoresCache = [];
let trabajadoresInternosCache = [];
let completarContext = null;

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

/**
 * Obtiene iniciales de un nombre para el avatar
 */
function getInitials(name) {
  if (!name) return 'OP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Calcula el tiempo transcurrido desde la creación/asignación
 */
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
 * Actualiza el indicador de pasos y las barras de progreso
 */
export function updateStepperProgress() {
  const step1Done = Boolean(trabajadorSeleccionadoTarea);
  const step2Done = Boolean(procesoSeleccionadoTarea);
  const step3Done = Boolean(prendaSeleccionadaTarea && parseInt(document.getElementById('cantidadPrenda')?.value, 10) > 0);

  const bar1 = document.getElementById('stepBar1');
  const bar2 = document.getElementById('stepBar2');
  const bar3 = document.getElementById('stepBar3');
  const indicator = document.getElementById('taskStepIndicator');

  if (bar1) bar1.className = 'task-stepper-bar active';
  if (bar2) bar2.className = `task-stepper-bar ${step1Done ? 'active' : ''}`;
  if (bar3) bar3.className = `task-stepper-bar ${step1Done && step2Done ? 'active' : ''}`;

  if (indicator) {
    if (!step1Done) {
      indicator.textContent = 'Paso 1 de 3: Selecciona Operario';
    } else if (!step2Done) {
      indicator.textContent = 'Paso 2 de 3: Selecciona Proceso';
    } else if (!step3Done) {
      indicator.textContent = 'Paso 3 de 3: Selecciona Prenda';
    } else {
      indicator.textContent = '¡Todo Listo para Asignar!';
    }
  }
}

/**
 * Actualiza el micro-resumen en el botón principal de asignación
 */
export function actualizarResumenBotonTarea() {
  const summaryBox = document.getElementById('btnAsignarSummary');
  const subText = document.getElementById('btnAsignarSub');
  const mainBtn = document.getElementById('btnAsignarTareaMain');

  const trabNombre = trabajadorSeleccionadoTarea ? trabajadorSeleccionadoTarea.nombre : null;
  const procNombre = procesoSeleccionadoTarea ? PROCESO_NOMBRES[procesoSeleccionadoTarea] || procesoSeleccionadoTarea : null;
  const prendaNombre = prendaSeleccionadaTarea ? prendaSeleccionadaTarea.nombre : null;
  const cant = parseInt(document.getElementById('cantidadPrenda')?.value, 10) || 1;

  if (trabNombre && procNombre && prendaNombre) {
    if (summaryBox) summaryBox.textContent = `${trabNombre} • ${procNombre} • ${cant}x ${prendaNombre}`;
    if (subText) subText.textContent = `Listo para enviar la orden a producción`;
    if (mainBtn) mainBtn.style.opacity = '1';
  } else {
    const faltantes = [];
    if (!trabNombre) faltantes.push('Operario');
    if (!procNombre) faltantes.push('Proceso');
    if (!prendaNombre) faltantes.push('Prenda');

    if (summaryBox) summaryBox.textContent = `Falta: ${faltantes.join(', ')}`;
    if (subText) subText.textContent = `Completa los 3 pasos para despachar la orden`;
  }

  updateStepperProgress();
}

/**
 * Carga principal del módulo y datos iniciales
 */
export async function loadTareasForm() {
  const token = window.token;
  try {
    const res = await fetch(`${API}/trabajadores`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    trabajadoresCache = Array.isArray(data) ? data : [];

    const resInternos = await fetch(`${API}/trabajadores-internos`, { headers: { 'x-access-token': token } });
    const dataInternos = await resInternos.json();
    trabajadoresInternosCache = Array.isArray(dataInternos) ? dataInternos : [];

    // Renderizar tarjetas de trabajadores en el Paso 1
    renderTrabajadoresCards(trabajadoresCache);

    // Inicializar filtros
    const filtroTrab = document.getElementById('filtroTareasTrabajador');
    if (filtroTrab) {
      filtroTrab.innerHTML = '<option value="">Todos los operarios</option>' +
        trabajadoresCache.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
    }

    // Fecha predeterminada
    const hoy = new Date().toISOString().slice(0, 10);
    const fechaInput = document.getElementById('tareaFecha');
    if (fechaInput) fechaInput.value = hoy;

    // Catálogo de prendas
    const resPrendas = await fetch(`${API}/prendas`, { headers: { 'x-access-token': token } });
    const dataPrendas = await resPrendas.json();
    prendasCatalogoTarea = Array.isArray(dataPrendas) ? dataPrendas : [];
    window.prendasCacheGlobal = prendasCatalogoTarea.slice();

    // Resetear selecciones
    trabajadorSeleccionadoTarea = null;
    procesoSeleccionadoTarea = '';
    prendaSeleccionadaTarea = null;
    stockDisponibleActual = 0;

    const trabInput = document.getElementById('tareaTrabajador');
    if (trabInput) trabInput.value = '';
    const bTrabInput = document.getElementById('buscarTrabajadorTarea');
    if (bTrabInput) bTrabInput.value = '';
    const procInput = document.getElementById('tareaProceso');
    if (procInput) procInput.value = '';
    const bPrendaInput = document.getElementById('buscarPrenda');
    if (bPrendaInput) bPrendaInput.value = '';

    const selectedWorkerBadge = document.getElementById('selectedWorkerBadge');
    if (selectedWorkerBadge) selectedWorkerBadge.style.display = 'none';

    const selectedProcessBadge = document.getElementById('selectedProcessBadge');
    if (selectedProcessBadge) selectedProcessBadge.textContent = 'Sin seleccionar';

    const selectedStockTag = document.getElementById('selectedStockTag');
    if (selectedStockTag) selectedStockTag.style.display = 'none';

    // Deseleccionar tarjetas de proceso
    ['procBtnRemojo', 'procBtnLavado', 'procBtnDesmanche', 'procBtnPlanchado'].forEach(id => {
      document.getElementById(id)?.classList.remove('selected');
    });

    loadTareasActivas();
    actualizarResumenBotonTarea();
    updateStepperProgress();
  } catch (err) {
    console.error('Error cargando formulario de tareas:', err);
  }
}

/**
 * Renderiza la cuadrícula de tarjetas de operarios
 */
export function renderTrabajadoresCards(lista) {
  const container = document.getElementById('workersCardsGrid');
  if (!container) return;

  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1; padding:12px; color:#94a3b8; text-align:center; font-size:12px;">No se encontraron operarios</div>';
    return;
  }

  container.innerHTML = lista.map(t => {
    const isSelected = trabajadorSeleccionadoTarea && trabajadorSeleccionadoTarea.id === t.id;
    const safeNombre = String(t.nombre).replace(/'/g, "\\'");
    const initials = getInitials(t.nombre);

    return `
      <div class="worker-card-item ${isSelected ? 'selected' : ''}" id="workerCard_${t.id}" onclick="seleccionarTrabajadorCard(${t.id}, '${safeNombre}')">
        <div class="worker-avatar">
          ${initials}
          <span class="worker-status-dot"></span>
        </div>
        <div class="worker-name" title="${t.nombre}">${t.nombre}</div>
        <span class="worker-status-tag worker-tag-free">${t.factura ? 'Factura' : 'Disponible'}</span>
        <div class="worker-check-icon"><span class="mi">check</span></div>
      </div>
    `;
  }).join('');
}

/**
 * Filtra las tarjetas de operarios en tiempo real
 */
export function filtrarTrabajadoresCards() {
  const query = (document.getElementById('buscarTrabajadorTarea')?.value || '').trim().toLowerCase();
  const filtrados = (trabajadoresCache || []).filter(t => !query || (t.nombre || '').toLowerCase().includes(query));
  renderTrabajadoresCards(filtrados);

  // Si se limpió el buscador o ya no coincide el seleccionado
  if (trabajadorSeleccionadoTarea && query && !trabajadorSeleccionadoTarea.nombre.toLowerCase().includes(query)) {
    // Mantener la selección pero el grid refleja la búsqueda
  }
}

/**
 * Compatibilidad con búsqueda anterior de trabajadores
 */
export function buscarTrabajadoresTarea() {
  filtrarTrabajadoresCards();
}

/**
 * Selecciona un operario desde su tarjeta (Paso 1)
 */
export function seleccionarTrabajadorCard(id, nombre) {
  trabajadorSeleccionadoTarea = { id, nombre };

  const inputId = document.getElementById('tareaTrabajador');
  if (inputId) inputId.value = id;

  const inputNombre = document.getElementById('buscarTrabajadorTarea');
  if (inputNombre) inputNombre.value = nombre;

  // Actualizar clases de selección en todas las tarjetas
  const allCards = document.querySelectorAll('.worker-card-item');
  allCards.forEach(c => c.classList.remove('selected'));

  const selectedCard = document.getElementById(`workerCard_${id}`);
  if (selectedCard) selectedCard.classList.add('selected');

  // Badge de confirmación
  const badge = document.getElementById('selectedWorkerBadge');
  const badgeName = document.getElementById('selectedWorkerName');
  if (badge && badgeName) {
    badgeName.textContent = nombre;
    badge.style.display = 'inline-flex';
  }

  showFieldError('trabajador', false);
  actualizarResumenBotonTarea();
}

/**
 * Alias de compatibilidad
 */
export function seleccionarTrabajadorTarea(id, nombre) {
  seleccionarTrabajadorCard(id, nombre);
}

/**
 * Selecciona un proceso de producción (Paso 2)
 */
export function seleccionarProcesoCard(proceso) {
  procesoSeleccionadoTarea = proceso;

  const input = document.getElementById('tareaProceso');
  if (input) input.value = proceso;

  // Actualizar estado visual de los 4 botones
  ['remojo', 'lavado', 'desmanche', 'planchado'].forEach(p => {
    const idMap = {
      remojo: 'procBtnRemojo',
      lavado: 'procBtnLavado',
      desmanche: 'procBtnDesmanche',
      planchado: 'procBtnPlanchado'
    };
    const el = document.getElementById(idMap[p]);
    if (el) {
      if (p === proceso) el.classList.add('selected');
      else el.classList.remove('selected');
    }
  });

  // Actualizar badge de texto
  const badge = document.getElementById('selectedProcessBadge');
  if (badge) {
    badge.textContent = PROCESO_NOMBRES[proceso] || proceso.toUpperCase();
    badge.style.color = PROCESO_COLORES[proceso] || '#0284c7';
  }

  // Si ya había una prenda seleccionada, recalcular su stock para el nuevo proceso
  if (prendaSeleccionadaTarea) {
    recalcularStockPrendaSeleccionada(prendaSeleccionadaTarea.id);
  }

  showFieldError('proceso', false);
  actualizarResumenBotonTarea();
}

/**
 * Stepper numérico: sumar o restar cantidad
 */
export function ajustarCantidadTarea(delta) {
  const input = document.getElementById('cantidadPrenda');
  if (!input) return;
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, val + delta);
  input.value = val;
  actualizarResumenBotonTarea();
}

/**
 * Presets de cantidad (+5, +10, +25)
 */
export function setCantidadPreset(valor) {
  const input = document.getElementById('cantidadPrenda');
  if (!input) return;
  let val = parseInt(input.value, 10) || 1;
  if (val === 1) {
    val = valor;
  } else {
    val += valor;
  }
  input.value = val;
  actualizarResumenBotonTarea();
}

/**
 * Asigna todo el stock disponible actualmente a la cantidad
 */
export function setCantidadTodoStock() {
  if (!prendaSeleccionadaTarea) {
    showWarning('Primero selecciona una prenda del catálogo');
    document.getElementById('buscarPrenda')?.focus();
    return;
  }

  if (stockDisponibleActual <= 0) {
    showWarning(`No hay stock disponible de ${prendaSeleccionadaTarea.nombre} para este proceso`);
    return;
  }

  const input = document.getElementById('cantidadPrenda');
  if (input) input.value = stockDisponibleActual;
  showInfo(`Cantidad ajustada a ${stockDisponibleActual} (todo el stock disponible)`);
  actualizarResumenBotonTarea();
}

/**
 * Búsqueda de prendas en el catálogo (Paso 3)
 */
export async function buscarPrendasTarea() {
  const query = (document.getElementById('buscarPrenda')?.value || '').trim().toLowerCase();
  const quickBox = document.getElementById('busquedaRapidaTarea');
  if (!quickBox) return;

  if (query.length === 0) {
    quickBox.style.display = 'none';
    quickBox.innerHTML = '';
    return;
  }

  const origen = PROCESO_ORIGEN_MAP[procesoSeleccionadoTarea] || 'sucio';
  const filtradas = (prendasCatalogoTarea || [])
    .filter(p => p.nombre.toLowerCase().includes(query) || (p.descripcion || '').toLowerCase().includes(query))
    .slice(0, 15);

  if (!filtradas.length) {
    quickBox.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:13px;">No se encontraron prendas con ese nombre</div>';
  } else {
    quickBox.innerHTML = filtradas.map(p => {
      const safeNombre = String(p.nombre).replace(/'/g, "\\'");
      return `
        <div class="prenda-option-item" onclick="seleccionarPrendaTarea(${p.id}, '${safeNombre}')">
          <div>
            <div style="font-weight:700; color:#0f172a; font-size:13px;">${p.nombre}</div>
            <div style="font-size:11px; color:#64748b;">Código: #${p.id} • Origen requerido: <strong style="color:#0284c7;">${origen.toUpperCase()}</strong></div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" style="min-width:auto; padding:4px 10px; font-size:11px;">
            <span class="mi" style="font-size:14px;">check</span> Elegir
          </button>
        </div>
      `;
    }).join('');
  }

  quickBox.style.display = 'block';
  showFieldError('prenda', false);
}

/**
 * Prepara la búsqueda al enfocar el campo de prenda
 */
export function prepararBusquedaPrendaTarea() {
  const input = document.getElementById('buscarPrenda');
  if (input && input.value.trim().length > 0) {
    buscarPrendasTarea();
  }
}

/**
 * Recalcula el stock disponible de la prenda para el proceso actual
 */
async function recalcularStockPrendaSeleccionada(prendaId) {
  try {
    const res = await fetch(`${API}/prendas/${prendaId}/stock-trazabilidad`, {
      headers: { 'x-access-token': window.token }
    });
    const stockData = await res.json();
    const origen = PROCESO_ORIGEN_MAP[procesoSeleccionadoTarea] || 'sucio';

    const stockEnOrigen = (Array.isArray(stockData) ? stockData : []).filter(s => s.proceso === origen);
    stockDisponibleActual = stockEnOrigen.reduce((sum, s) => sum + s.cantidad, 0);

    const stockTag = document.getElementById('selectedStockTag');
    if (stockTag) {
      stockTag.textContent = `Stock en ${origen.toUpperCase()}: ${stockDisponibleActual}`;
      stockTag.style.color = stockDisponibleActual > 0 ? '#16a34a' : '#ef4444';
      stockTag.style.display = 'inline-block';
    }
  } catch (err) {
    console.error('Error recalculando stock:', err);
  }
}

/**
 * Selecciona una prenda del buscador (Paso 3)
 */
export async function seleccionarPrendaTarea(id, nombre) {
  prendaSeleccionadaTarea = { id, nombre };

  const input = document.getElementById('buscarPrenda');
  if (input) input.value = nombre;

  const quickBox = document.getElementById('busquedaRapidaTarea');
  if (quickBox) {
    quickBox.innerHTML = '';
    quickBox.style.display = 'none';
  }

  // Ocultar trazabilidad anterior
  const stockInfo = document.getElementById('stockInfoPrenda');
  if (stockInfo) stockInfo.style.display = 'none';

  // Recalcular stock disponible
  await recalcularStockPrendaSeleccionada(id);

  actualizarResumenBotonTarea();
}

/**
 * Creación directa de tarea en 1 solo clic (El nuevo flujo simplificado)
 */
export async function crearTareaDirecta() {
  clearFieldErrors();

  // 1. Validar Operario
  let trabajador_id = trabajadorSeleccionadoTarea ? trabajadorSeleccionadoTarea.id : null;
  const trabajadorInputText = (document.getElementById('buscarTrabajadorTarea')?.value || '').trim();

  if (!trabajador_id && trabajadorInputText) {
    const exacto = (trabajadoresCache || []).find(t => (t.nombre || '').toLowerCase() === trabajadorInputText.toLowerCase());
    const parciales = (trabajadoresCache || []).filter(t => (t.nombre || '').toLowerCase().includes(trabajadorInputText.toLowerCase()));
    const candidato = exacto || (parciales.length === 1 ? parciales[0] : null);
    if (candidato) {
      seleccionarTrabajadorCard(candidato.id, candidato.nombre);
      trabajador_id = candidato.id;
    }
  }

  if (!trabajador_id) {
    showWarning('Paso 1 incompleto: Selecciona un operario para la tarea');
    focusField('buscarTrabajadorTarea', 'Selecciona un operario');
    return;
  }

  // 2. Validar Proceso
  const proceso = procesoSeleccionadoTarea || document.getElementById('tareaProceso')?.value;
  if (!proceso) {
    showWarning('Paso 2 incompleto: Selecciona el proceso a realizar (Remojo, Lavado, Desmanche o Planchado)');
    return;
  }

  // 3. Validar Prenda
  if (!prendaSeleccionadaTarea) {
    const typedPrenda = (document.getElementById('buscarPrenda')?.value || '').trim();
    if (typedPrenda) {
      const candidato = resolverCoincidenciaPorNombre(prendasCatalogoTarea, typedPrenda);
      if (candidato) {
        await seleccionarPrendaTarea(candidato.id, candidato.nombre);
      }
    }
  }

  if (!prendaSeleccionadaTarea) {
    showWarning('Paso 3 incompleto: Selecciona la prenda a procesar');
    focusField('buscarPrenda', 'Escribe el nombre de la prenda');
    return;
  }

  // 4. Validar Cantidad
  const cantidad = parseInt(document.getElementById('cantidadPrenda')?.value, 10) || 0;
  if (cantidad < 1) {
    showWarning('Ingresa una cantidad válida mayor a 0');
    focusField('cantidadPrenda', 'Cantidad');
    return;
  }

  const fecha_asignacion = document.getElementById('tareaFecha')?.value || new Date().toISOString().slice(0, 10);

  // 5. Verificar Stock en tiempo real antes de enviar
  try {
    const resStock = await fetch(`${API}/prendas/${prendaSeleccionadaTarea.id}/stock-trazabilidad`, {
      headers: { 'x-access-token': window.token }
    });
    const stockData = await resStock.json();

    const origen = PROCESO_ORIGEN_MAP[proceso] || proceso;
    const stockEnOrigen = (Array.isArray(stockData) ? stockData : []).filter(s => s.proceso === origen);
    const totalStock = stockEnOrigen.reduce((sum, s) => sum + s.cantidad, 0);

    if (totalStock < cantidad) {
      mostrarTrazabilidadStock(prendaSeleccionadaTarea.id, prendaSeleccionadaTarea.nombre, stockData, cantidad);
      showWarning(`Stock insuficiente: Hay ${totalStock} prendas en ${origen.toUpperCase()} (requeridas: ${cantidad})`);
      return;
    }

    // 6. Despachar la asignación de tarea al backend
    const payload = {
      trabajador_id: Number(trabajador_id),
      proceso,
      prendas: [{
        prenda_id: prendaSeleccionadaTarea.id,
        cantidad,
        nombre: prendaSeleccionadaTarea.nombre
      }],
      fecha_asignacion
    };

    const res = await fetch(`${API}/tareas/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      showSuccess(`¡Tarea asignada con éxito a ${trabajadorSeleccionadoTarea.nombre}!`);

      // Limpiar datos de prenda para la siguiente asignación rápida
      prendaSeleccionadaTarea = null;
      stockDisponibleActual = 0;
      const bPrenda = document.getElementById('buscarPrenda');
      if (bPrenda) bPrenda.value = '';
      const cantInput = document.getElementById('cantidadPrenda');
      if (cantInput) cantInput.value = '1';

      const stockTag = document.getElementById('selectedStockTag');
      if (stockTag) stockTag.style.display = 'none';
      const stockInfo = document.getElementById('stockInfoPrenda');
      if (stockInfo) stockInfo.style.display = 'none';

      // Refrescar cola en vivo
      loadTareasActivas();
      actualizarResumenBotonTarea();
    } else {
      const errorMsg = data.errores ? data.errores.map(e => e.error).join('\n') : (data.message || 'Error al asignar tarea');
      showError(errorMsg);
    }
  } catch (err) {
    console.error('Error al asignar tarea directa:', err);
    showError('Error de red al asignar tarea');
  }
}

/**
 * Carga y renderizado de Tareas Activas en tiempo real
 */
export async function loadTareasActivas() {
  const filtro = document.getElementById('filtroTareasTrabajador')?.value || '';
  let url = `${API}/tareas?estado=asignada`;
  if (filtro) url += `&trabajador_id=${filtro}`;

  try {
    const res = await fetch(url, { headers: { 'x-access-token': window.token } });
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
              <h4 class="task-garment-title">${t.cantidad}x ${t.prenda_nombre}</h4>
              <p class="task-garment-desc">Asignado: ${formatDate(t.fecha_asignacion)}</p>
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
    const res = await fetch(`${API}/tareas/${id}/completar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
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
      const res = await fetch(`${API}/tareas/${id}/cancelar`, {
        method: 'PUT',
        headers: { 'x-access-token': window.token }
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
  updateStepperProgress,
  actualizarResumenBotonTarea,
  loadTareasForm,
  renderTrabajadoresCards,
  filtrarTrabajadoresCards,
  buscarTrabajadoresTarea,
  seleccionarTrabajadorCard,
  seleccionarTrabajadorTarea,
  seleccionarProcesoCard,
  ajustarCantidadTarea,
  setCantidadPreset,
  setCantidadTodoStock,
  buscarPrendasTarea,
  prepararBusquedaPrendaTarea,
  seleccionarPrendaTarea,
  crearTareaDirecta,
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
