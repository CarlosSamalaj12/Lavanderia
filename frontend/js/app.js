const API_ORIGIN = window.location.port === '3000' ? window.location.origin : '';

const socket = io(API_ORIGIN, {
  transports: ['websocket', 'polling']
});

const TAB_STORAGE_KEY = 'lavanderia-active-tab';
const SUBTAB_STORAGE_KEY = 'lavanderia-active-subtabs';
const SIDEBAR_STORAGE_KEY = 'lavanderia-collapsed-sidebars';

const state = {
  data: null,
  pedidoItems: [],
  assignmentDrafts: [],
  selectedAssignmentId: null,
  draggingAssignmentId: null,
  activeTab: window.sessionStorage.getItem(TAB_STORAGE_KEY) || 'resumen',
  activeSubTabs: JSON.parse(window.sessionStorage.getItem(SUBTAB_STORAGE_KEY) || '{}'),
  collapsedSidebars: JSON.parse(window.sessionStorage.getItem(SIDEBAR_STORAGE_KEY) || '{}'),
  activeBlock: null,
  ignoreSocketUntil: 0,
  lastSocketAt: 0
};

let pickersInitialized = false;

const ASSIGNMENT_TASK_CODES = ['remojo', 'desmanche', 'lavado', 'reproceso', 'tendido', 'recogido', 'planchado'];

const $ = (selector) => document.querySelector(selector);

function activeUserId() {
  const value = Number($('#usuario-activo').value);
  return Number.isNaN(value) ? null : value;
}

function activeWorkerId() {
  const value = Number($('#asignacion-trabajador').value);
  return Number.isNaN(value) ? null : value;
}

function getActiveUser() {
  const userId = activeUserId();
  return getCatalog('usuarios').find((item) => Number(item.id) === Number(userId)) || null;
}

function canManageTaskBoard() {
  const role = String(getActiveUser()?.rol || '').toLowerCase();
  return role === 'admin' || role === 'encargado';
}

function persistCurrentView() {
  window.sessionStorage.setItem(TAB_STORAGE_KEY, state.activeTab);
  window.sessionStorage.setItem(SUBTAB_STORAGE_KEY, JSON.stringify(state.activeSubTabs));
}

function setCurrentViewFromNode(node) {
  const panel = node?.closest?.('.panel');
  const subpanel = node?.closest?.('.subpanel');

  if (panel?.id) {
    state.activeTab = panel.id;
  }

  if (subpanel?.id) {
    const subgroup = subpanel.id.split('-')[0];
    state.activeSubTabs[subgroup] = subpanel.id;
  }

  persistCurrentView();
}

function rememberCurrentView() {
  const activePanel = document.querySelector('.panel.active');
  const activeSubpanels = document.querySelectorAll('.subpanel.active');

  if (activePanel?.id) {
    state.activeTab = activePanel.id;
  }

  activeSubpanels.forEach((panel) => {
    const subgroup = panel.id.split('-')[0];
    state.activeSubTabs[subgroup] = panel.id;
  });

  persistCurrentView();
}

async function api(url, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_ORIGIN}${url}`, config);
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const rawText = await response.text();
    const looksLikeHtml = rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html');
    if (looksLikeHtml) {
      throw new Error(`La API no respondio JSON. Abre la app con el servidor Node en http://localhost:3000 o deja el backend encendido mientras usas Live Server.`);
    }
    throw new Error('La respuesta del servidor no es JSON valido.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo completar la operacion.');
  }
  return data;
}

function optionList(items, placeholder, mapper) {
  return [`<option value="">${placeholder}</option>`]
    .concat(items.map(mapper))
    .join('');
}

function table(headers, rows, options = {}) {
  if (!rows.length) {
    return '<div class="empty">No hay registros.</div>';
  }

  const wrapClass = options.wrapClass ? ` ${options.wrapClass}` : '';
  const thead = headers.map((header) => `<th>${header}</th>`).join('');
  const tbody = rows.map((row) => {
    const cells = Array.isArray(row) ? row : row.cells;
    const rowClass = Array.isArray(row) ? '' : (row.className ? ` class="${row.className}"` : '');
    return `<tr${rowClass}>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="table-wrap${wrapClass}"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function badge(text) {
  return `<span class="pill">${text}</span>`;
}

function actionButton({ action, id = '', icon, label, className = '', extra = '' }) {
  const idAttr = id !== '' ? ` data-id="${id}"` : '';
  const classes = ['small-btn', 'icon-btn', className].filter(Boolean).join(' ');
  return `<button type="button" class="${classes}" data-action="${action}"${idAttr}${extra} title="${label}" aria-label="${label}"><span aria-hidden="true">${icon || '...'}</span></button>`;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function reviewBadge(value) {
  const code = value || 'pendiente';
  const map = {
    pendiente: { label: 'Pendiente', className: 'pending' },
    parcial: { label: 'Parcial', className: 'partial' },
    cumplida: { label: 'Cumplida', className: 'done' }
  };
  const review = map[code] || map.pendiente;
  return `<span class="review-badge ${review.className}">${review.label}</span>`;
}

function checkedBadge(value) {
  return value
    ? '<span class="review-badge done">Revisada</span>'
    : '<span class="review-badge pending">Sin revisar</span>';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCatalog(name) {
  return state.data?.catalogos?.[name] || [];
}

function getInventory() {
  return state.data?.inventario?.lavanderia || [];
}

function getTaskRoute(taskCode) {
  return {
    remojo: { sourceCandidates: ['reproceso', 'sucio'], inventoryTarget: 'remojo', label: 'Remojo' },
    desmanche: { sourceCandidates: ['remojo'], inventoryTarget: 'desmanche', label: 'Desmanche' },
    lavado: { sourceCandidates: ['desmanche', 'remojo'], inventoryTarget: 'lavado', label: 'Lavado' },
    reproceso: { sourceCandidates: ['limpio', 'recogido'], inventoryTarget: 'reproceso', label: 'Reproceso' },
    tendido: { sourceCandidates: ['lavado'], inventoryTarget: 'tendido', label: 'Tendido' },
    recogido: { sourceCandidates: ['tendido'], inventoryTarget: 'limpio', label: 'Recogido' },
    planchado: { sourceCandidates: ['limpio'], inventoryTarget: 'stock', label: 'Planchado' },
    stock: { sourceCandidates: ['limpio'], inventoryTarget: 'stock', label: 'Stock' }
  }[taskCode];
}

function getAutomaticNextStateCode(currentCode, noPlanchar = false) {
  return {
    sucio: 'remojo',
    remojo: 'lavado',
    lavado: 'tendido',
    tendido: 'recogido',
    recogido: 'limpio',
    limpio: noPlanchar ? 'stock' : 'planchado',
    planchado: 'stock'
  }[currentCode] || null;
}

function canAutoAdvanceInventoryRow(item) {
  return Boolean(getAutomaticNextStateCode(item.estado_codigo, item.no_planchar));
}

function getStateByCode(code) {
  return getCatalog('estados').find((item) => item.codigo === code);
}

function getAvailableStock(prendaId, estadoId) {
  const inventoryRow = getInventory().find((item) => (
    Number(item.prenda_id) === Number(prendaId) &&
    Number(item.estado_id) === Number(estadoId)
  ));

  const reserved = state.assignmentDrafts
    .filter((item) => Number(item.prenda_id) === Number(prendaId) && Number(item.estado_origen_id) === Number(estadoId))
    .reduce((sum, item) => sum + Number(item.cantidad), 0);

  const actual = inventoryRow?.cantidad || 0;
  return {
    actual,
    reserved,
    available: Math.max(actual - reserved, 0)
  };
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const tone = {
    success: { icon: 'OK', title: 'Proceso completado' },
    error: { icon: '!', title: 'Necesita atencion' },
    info: { icon: 'i', title: 'Actualizacion' }
  }[type] || { icon: 'i', title: 'Aviso' };

  toast.innerHTML = `
    <div class="toast-icon">${tone.icon}</div>
    <div class="toast-copy">
      <strong>${tone.title}</strong>
      <span></span>
    </div>
  `;
  toast.querySelector('span').textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('leaving'), 3000);
  setTimeout(() => toast.remove(), 3400);
}

function initEnhancedPickers() {
  if (pickersInitialized || typeof window.flatpickr !== 'function') {
    return;
  }

  if (window.flatpickr?.l10ns?.es) {
    window.flatpickr.localize(window.flatpickr.l10ns.es);
  }

  const dateOptions = {
    locale: 'es',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false
  };

  window.flatpickr('#pedido-fecha', dateOptions);
  window.flatpickr('#reporte-rendimiento-desde', dateOptions);
  window.flatpickr('#reporte-rendimiento-hasta', dateOptions);
  window.flatpickr('#pedido-horario', {
    locale: 'es',
    enableTime: true,
    noCalendar: true,
    dateFormat: 'H:i',
    time_24hr: true,
    altInput: true,
    altFormat: 'H:i',
    allowInput: false
  });

  pickersInitialized = true;
}

function openModal({ title, message, input = false, inputType = 'text', inputValue = '', confirmText = 'Aceptar', cancelText = 'Cancelar' }) {
  return new Promise((resolve) => {
    const modal = $('#app-modal');
    const titleNode = $('#app-modal-title');
    const messageNode = $('#app-modal-message');
    const inputNode = $('#app-modal-input');
    const actionsNode = $('#app-modal-actions');
    const closeNode = $('#app-modal-close');

    titleNode.textContent = title;
    messageNode.textContent = message;
    inputNode.classList.toggle('hidden', !input);
    inputNode.type = inputType;
    inputNode.value = inputValue;
    actionsNode.innerHTML = '';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn ghost';
    cancelButton.textContent = cancelText;

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn primary';
    confirmButton.textContent = confirmText;

    const cleanup = (value) => {
      modal.classList.add('hidden');
      confirmButton.onclick = null;
      cancelButton.onclick = null;
      closeNode.onclick = null;
      resolve(value);
    };

    cancelButton.onclick = () => cleanup(null);
    closeNode.onclick = () => cleanup(null);
    confirmButton.onclick = () => cleanup(input ? inputNode.value : true);

    actionsNode.append(cancelButton, confirmButton);
    modal.classList.remove('hidden');
    if (input) {
      setTimeout(() => inputNode.focus(), 0);
    }
  });
}

async function askText(title, message, initialValue = '', inputType = 'text') {
  return openModal({ title, message, input: true, inputType, inputValue: initialValue, confirmText: 'Guardar' });
}

async function askConfirm(title, message) {
  return openModal({ title, message, input: false, confirmText: 'Confirmar' });
}

function colorForState(code, index) {
  const colors = {
    sucio: 'linear-gradient(135deg, #805ad5, #6b46c1)',
    remojo: 'linear-gradient(135deg, #3182ce, #2b6cb0)',
    desmanche: 'linear-gradient(135deg, #dd6b20, #c05621)',
    lavado: 'linear-gradient(135deg, #2c5282, #2b6cb0)',
    reproceso: 'linear-gradient(135deg, #c53030, #9b2c2c)',
    tendido: 'linear-gradient(135deg, #38a169, #2f855a)',
    recogido: 'linear-gradient(135deg, #2f855a, #276749)',
    limpio: 'linear-gradient(135deg, #319795, #2c7a7b)',
    planchado: 'linear-gradient(135deg, #d69e2e, #b7791f)',
    stock: 'linear-gradient(135deg, #4a5568, #2d3748)'
  };
  return colors[code] || `linear-gradient(135deg, #1c6e61, #c58b39 ${40 + index}%)`;
}

function solidColorForState(code) {
  const colors = {
    sucio: '#7d57c2',
    remojo: '#3f86d9',
    desmanche: '#de772f',
    lavado: '#3c6fb1',
    reproceso: '#c54747',
    tendido: '#41a26c',
    recogido: '#34825a',
    limpio: '#3d9a9d',
    planchado: '#d49a2c',
    stock: '#566176'
  };
  return getStateByCode(code)?.color || colors[code] || '#1c6e61';
}

async function loadData() {
  rememberCurrentView();
  state.ignoreSocketUntil = Date.now() + 900;
  state.data = await api('/api/bootstrap');
  renderAll();
}

function syncAfterMutation() {
  const issuedAt = Date.now();
  window.setTimeout(async () => {
    if (state.lastSocketAt >= issuedAt) {
      return;
    }
    try {
      await loadData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, 900);
}

function renderAll() {
  rememberCurrentView();
  initEnhancedPickers();
  renderTabs();
  renderUserSelect();
  renderTaskControlPermissions();
  renderSubTabs();
  renderWorkspaceShells();
  renderSelects();
  renderSummary();
  renderOperationalInventory();
  renderAssignments();
  renderAssignmentFinder();
  renderAssignmentDrafts();
  renderCatalogs();
  renderOrders();
  renderReports();
  restoreActiveBlock();
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.activeTab);
    button.onclick = () => {
      state.activeTab = button.dataset.tab;
      applyActiveTab();
    };
  });

  applyActiveTab();
}

function applyActiveTab() {
  window.sessionStorage.setItem(TAB_STORAGE_KEY, state.activeTab);

  document.querySelectorAll('.tab').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === state.activeTab);
  });

  document.querySelectorAll('.panel').forEach((item) => {
    item.classList.toggle('active', item.id === state.activeTab);
  });
}

function renderSubTabs() {
  document.querySelectorAll('.module-tab').forEach((button) => {
    const subgroup = button.dataset.subgroup;
    const panel = button.dataset.subpanel;
    const activePanel = state.activeSubTabs[subgroup] || document.querySelector(`.module-tab[data-subgroup="${subgroup}"]`)?.dataset.subpanel;
    button.classList.toggle('active', activePanel === panel);
    button.onclick = () => {
      setCurrentViewFromNode(button);
      state.activeSubTabs[subgroup] = panel;
      applySubTab(subgroup);
      const panelId = button.closest('.panel')?.id;
      if (panelId) {
        state.collapsedSidebars[panelId] = true;
        window.sessionStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(state.collapsedSidebars));
        renderWorkspaceShells();
      }
    };
  });

  const groups = new Set([...document.querySelectorAll('.module-tab')].map((button) => button.dataset.subgroup));
  groups.forEach((group) => {
    if (!state.activeSubTabs[group]) {
      state.activeSubTabs[group] = document.querySelector(`.module-tab[data-subgroup="${group}"]`)?.dataset.subpanel;
    }
    applySubTab(group);
  });
}

function applySubTab(subgroup) {
  window.sessionStorage.setItem(SUBTAB_STORAGE_KEY, JSON.stringify(state.activeSubTabs));
  const activePanel = state.activeSubTabs[subgroup];

  document.querySelectorAll(`.module-tab[data-subgroup="${subgroup}"]`).forEach((button) => {
    button.classList.toggle('active', button.dataset.subpanel === activePanel);
  });

  document.querySelectorAll(`.subpanel[id^="${subgroup}-"]`).forEach((panel) => {
    panel.classList.toggle('active', panel.id === activePanel);
  });
}

function renderWorkspaceShells() {
  document.querySelectorAll('.panel .workspace-shell').forEach((shell) => {
    const panel = shell.closest('.panel');
    const panelId = panel?.id;
    const collapsed = Boolean(state.collapsedSidebars[panelId]);
    shell.classList.toggle('sidebar-collapsed', collapsed);
  });

  document.querySelectorAll('.sidebar-toggle').forEach((button) => {
    const panelId = button.dataset.panel;
    const collapsed = Boolean(state.collapsedSidebars[panelId]);
    const label = button.querySelector('.sidebar-toggle-label');
    if (label) {
      label.textContent = collapsed ? 'Mostrar menu' : 'Cerrar menu';
    }
  });
}

function restoreActiveBlock() {
  if (!state.activeBlock) {
    return;
  }

  requestAnimationFrame(() => {
    const element = document.querySelector(state.activeBlock);
    if (element) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' });
      const firstField = element.querySelector('input, select, textarea, button');
      if (firstField) {
        firstField.focus();
      }
    }
    state.activeBlock = null;
  });
}

function renderUserSelect() {
  const select = $('#usuario-activo');
  const users = getCatalog('usuarios');
  const currentValue = select.value;
  select.innerHTML = optionList(users, 'Selecciona usuario', (user) => (
    `<option value="${user.id}">${user.nombre} (${user.rol})</option>`
  ));
  if (users.some((user) => String(user.id) === currentValue)) {
    select.value = currentValue;
  } else if (users.length) {
    const admin = users.find((user) => user.username === 'admin');
    select.value = admin ? admin.id : users[0].id;
  }

  $('#pedido-usuario').innerHTML = optionList(users.filter((user) => user.rol === 'solicitante' || user.rol === 'admin'), 'Usuario solicitante', (user) => (
    `<option value="${user.id}">${user.nombre} - ${user.bodega_nombre || 'Sin bodega'}</option>`
  ));

  if (!$('#pedido-fecha').value) {
    $('#pedido-fecha').value = new Date().toISOString().slice(0, 10);
  }

  if (!$('#pedido-horario').value) {
    $('#pedido-horario').value = '08:00';
  }

  select.onchange = () => {
    rememberCurrentView();
    renderAll();
  };
}

function renderTaskControlPermissions() {
  const canView = canManageTaskBoard();
  const tabButton = document.querySelector('.module-tab[data-subpanel="operacion-historial"]');
  const panel = document.querySelector('#operacion-historial');
  const codeInput = $('#assignment-modal-codigo');

  if (tabButton) {
    tabButton.hidden = !canView;
  }

  if (panel) {
    panel.classList.toggle('hidden', !canView);
  }

  if (codeInput) {
    codeInput.placeholder = canView
      ? 'Codigo de autorizacion solo si vas a eliminar'
      : 'Codigo de autorizacion';
  }

  if (!canView && state.activeSubTabs.operacion === 'operacion-historial') {
    state.activeSubTabs.operacion = 'operacion-ingreso';
    persistCurrentView();
  }
}

function renderSelects() {
  const prendas = getCatalog('prendas');
  const estados = getCatalog('estados');
  const trabajadores = getCatalog('trabajadores');
  const areas = getCatalog('areas');
  const bodegas = getCatalog('bodegas');
  const selectedControlWorker = $('#control-tareas-trabajador')?.value || '';
  const selectedControlTask = $('#control-tareas-estado')?.value || '';
  const selectedAssignmentWorker = $('#assignment-modal-trabajador')?.value || '';
  const selectedPerformanceWorker = $('#reporte-rendimiento-trabajador')?.value || '';
  const selectedPerformanceTask = $('#reporte-rendimiento-tarea')?.value || '';

  const garmentOptions = optionList(prendas, 'Selecciona prenda', (item) => `<option value="${item.id}">${item.nombre}</option>`);
  const stateOptions = optionList(estados, 'Selecciona estado', (item) => `<option value="${item.id}">${item.nombre}</option>`);
  const workerOptions = optionList(trabajadores, 'Sin trabajador', (item) => `<option value="${item.id}">${item.nombre}${item.factura ? ' - factura' : ''}</option>`);
  const controlWorkerOptions = optionList(trabajadores, 'Todos los trabajadores', (item) => `<option value="${item.id}">${item.nombre}</option>`);
  const controlTaskOptions = optionList(
    estados.filter((item) => ASSIGNMENT_TASK_CODES.includes(item.codigo)),
    'Todas las tareas',
    (item) => `<option value="${item.id}">${item.nombre}</option>`
  );
  const performanceWorkerOptions = optionList(trabajadores, 'Todos los trabajadores', (item) => `<option value="${item.id}">${item.nombre}</option>`);
  const performanceTaskOptions = optionList(
    estados.filter((item) => ASSIGNMENT_TASK_CODES.includes(item.codigo)),
    'Todas las tareas',
    (item) => `<option value="${item.id}">${item.nombre}</option>`
  );
  const areaOptions = optionList(areas, 'Area de uso', (item) => `<option value="${item.id}">${item.nombre}</option>`);
  const userWarehouseOptions = optionList(bodegas, 'Bodega asignada', (item) => `<option value="${item.id}">${item.nombre}</option>`);
  const internalWarehouseOptions = optionList(bodegas.filter((item) => item.tipo !== 'principal'), 'Selecciona bodega', (item) => `<option value="${item.id}">${item.nombre} (${item.tipo})</option>`);
  const externalWarehouseOptions = optionList(bodegas.filter((item) => item.tipo === 'externa'), 'Bodega externa', (item) => `<option value="${item.id}">${item.nombre}</option>`);

  ['#ingreso-prenda', '#devolucion-prenda', '#externa-prenda-salida', '#externa-prenda-retorno', '#pedido-item-prenda', '#precio-prenda']
    .forEach((selector) => { $(selector).innerHTML = garmentOptions; });

  renderAssignmentGarmentOptions();
  renderAssignmentTasks();
  renderOrderGarmentOptions();
  renderOrderFinder();

  ['#ingreso-estado', '#devolucion-estado', '#externa-estado-salida', '#externa-estado-retorno', '#precio-estado']
    .forEach((selector) => { $(selector).innerHTML = stateOptions; });

  $('#asignacion-trabajador').innerHTML = workerOptions;
  $('#control-tareas-trabajador').innerHTML = controlWorkerOptions;
  $('#control-tareas-estado').innerHTML = controlTaskOptions;
  $('#assignment-modal-trabajador').innerHTML = workerOptions;
  $('#reporte-rendimiento-trabajador').innerHTML = performanceWorkerOptions;
  $('#reporte-rendimiento-tarea').innerHTML = performanceTaskOptions;
  $('#prenda-area').innerHTML = areaOptions;
  $('#usuario-bodega').innerHTML = userWarehouseOptions;
  $('#devolucion-bodega').innerHTML = internalWarehouseOptions;
  $('#externa-bodega-salida').innerHTML = externalWarehouseOptions;
  $('#externa-bodega-retorno').innerHTML = externalWarehouseOptions;

  $('#control-tareas-trabajador').value = selectedControlWorker;
  $('#control-tareas-estado').value = selectedControlTask;
  $('#assignment-modal-trabajador').value = selectedAssignmentWorker;
  $('#reporte-rendimiento-trabajador').value = selectedPerformanceWorker;
  $('#reporte-rendimiento-tarea').value = selectedPerformanceTask;
  renderPrendaPriceBuilder();
}

function renderPrendaPriceBuilder() {
  const container = $('#prenda-precios-builder');
  if (!container) {
    return;
  }

  const states = getCatalog('estados')
    .filter((item) => item.codigo !== 'stock')
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));

  container.innerHTML = `
    <div class="table-wrap">
      <table class="compact-price-table">
        <thead>
          <tr>
            <th>Proceso</th>
            <th>Factura</th>
            <th>Sin factura</th>
          </tr>
        </thead>
        <tbody>
          ${states.map((item) => `
            <tr>
              <td>
                <div class="price-process-cell">
                  ${badge(item.nombre)}
                  <small>${item.cobra ? 'Proceso pagado' : 'Proceso usualmente sin pago'}</small>
                </div>
              </td>
              <td><input type="number" min="0" step="0.01" class="price-builder-input" data-price-state="${item.id}" data-price-type="factura" value="0"></td>
              <td><input type="number" min="0" step="0.01" class="price-builder-input" data-price-state="${item.id}" data-price-type="no_factura" value="0"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function collectPrendaPrices() {
  return [...document.querySelectorAll('#prenda-precios-builder .price-builder-input[data-price-type="factura"]')].map((input) => {
    const estadoId = Number(input.dataset.priceState);
    const noFacturaInput = document.querySelector(`#prenda-precios-builder .price-builder-input[data-price-state="${estadoId}"][data-price-type="no_factura"]`);
    return {
      estado_id: estadoId,
      precio_factura: Number(input.value || 0),
      precio_no_factura: Number(noFacturaInput?.value || 0)
    };
  });
}

function renderAssignmentTasks() {
  const container = $('#asignacion-tareas');
  if (!container) {
    return;
  }

  let selectedTaskId = Number($('#asignacion-estado-destino').value);
  const tasks = getCatalog('estados').filter((item) => ASSIGNMENT_TASK_CODES.includes(item.codigo));
  if (!selectedTaskId && tasks.length) {
    const defaultTask = tasks.find((item) => item.codigo === 'remojo') || tasks[0];
    selectedTaskId = defaultTask.id;
    $('#asignacion-estado-destino').value = defaultTask.id;
  }
  container.innerHTML = tasks.map((task) => `
    <button
      type="button"
      class="task-card ${selectedTaskId === Number(task.id) ? 'active' : ''}"
      data-action="pick-task"
      data-task="${task.id}"
    >
      <strong>${task.nombre}</strong>
      <small>${task.descripcion || 'Tarea operativa'}</small>
    </button>
  `).join('');
}

function renderAssignmentGarmentOptions() {
  const select = $('#asignacion-prenda');
  const search = ($('#asignacion-prenda-buscar')?.value || '').trim().toLowerCase();
  const prendas = getCatalog('prendas');
  const currentValue = select.value;
  const filtered = !search
    ? prendas
    : prendas.filter((item) => item.nombre.toLowerCase().includes(search) || (item.sku || '').toLowerCase().includes(search));

  select.innerHTML = optionList(filtered, filtered.length ? 'Selecciona prenda' : 'No se encontraron prendas', (item) => (
    `<option value="${item.id}">${item.nombre}${item.sku ? ` (${item.sku})` : ''}</option>`
  ));

  if (filtered.some((item) => String(item.id) === currentValue)) {
    select.value = currentValue;
  } else if (filtered.length === 1) {
    select.value = filtered[0].id;
  }

  updateAssignmentStockInfo();
}

function renderOrderGarmentOptions() {
  const select = $('#pedido-item-prenda');
  if (!select) {
    return;
  }

  const search = ($('#pedido-item-buscar')?.value || '').trim().toLowerCase();
  const prendas = getCatalog('prendas');
  const currentValue = select.value;
  const filtered = !search
    ? prendas
    : prendas.filter((item) => (
      (item.nombre || '').toLowerCase().includes(search) ||
      (item.sku || '').toLowerCase().includes(search) ||
      (item.descripcion || '').toLowerCase().includes(search)
    ));

  select.innerHTML = optionList(filtered, filtered.length ? 'Selecciona prenda' : 'No se encontraron prendas', (item) => (
    `<option value="${item.id}">${item.nombre}${item.sku ? ` (${item.sku})` : ''}</option>`
  ));

  if (filtered.some((item) => String(item.id) === currentValue)) {
    select.value = currentValue;
  } else if (filtered.length === 1) {
    select.value = String(filtered[0].id);
  }
}

function renderOrderFinder() {
  const container = $('#pedido-item-resultados');
  const meta = $('#pedido-item-resultados-meta');
  if (!container) {
    return;
  }

  const search = ($('#pedido-item-buscar')?.value || '').trim().toLowerCase();
  const prendas = getCatalog('prendas')
    .filter((item) => {
      if (!search) {
        return true;
      }
      return (
        (item.nombre || '').toLowerCase().includes(search) ||
        (item.sku || '').toLowerCase().includes(search) ||
        (item.descripcion || '').toLowerCase().includes(search)
      );
    })
    .slice(0, 16);

  if (!prendas.length) {
    container.innerHTML = '<div class="empty">No se encontraron prendas para esa busqueda.</div>';
    if (meta) {
      meta.textContent = '0 resultados. Prueba con otro nombre, SKU o descripcion.';
    }
    return;
  }

  const currentPrendaId = Number($('#pedido-item-prenda').value);
  const selected = prendas.find((item) => Number(item.id) === currentPrendaId) || findById('prendas', currentPrendaId);
  if (meta) {
    meta.textContent = `${prendas.length} resultados visibles.${selected ? ` Seleccionada: ${selected.nombre}.` : ''}`;
  }
  container.innerHTML = prendas.map((item) => `
    <button
      type="button"
      class="assignment-result ${currentPrendaId === Number(item.id) ? 'active' : ''}"
      data-action="pick-order-item"
      data-prenda="${item.id}"
    >
      <div class="assignment-result-head">
        <strong>${item.nombre}</strong>
        ${item.sku ? `<span class="result-tag">${item.sku}</span>` : '<span class="result-tag soft">Prenda</span>'}
      </div>
      <small>${item.descripcion || 'Prenda disponible para pedido'}</small>
    </button>
  `).join('');
}

function renderAssignmentFinder() {
  const search = ($('#asignacion-prenda-buscar')?.value || '').trim().toLowerCase();
  const container = $('#asignacion-resultados');
  const meta = $('#asignacion-resultados-meta');
  if (!container) {
    return;
  }

  const rows = getInventory()
    .filter((item) => item.cantidad > 0)
    .filter((item) => {
      if (!search) {
        return true;
      }
      const name = (item.prenda_nombre || '').toLowerCase();
      const stateName = (item.estado_nombre || '').toLowerCase();
      return name.includes(search) || stateName.includes(search);
    })
    .slice(0, 16);

  if (!rows.length) {
    container.innerHTML = '<div class="empty">No hay prendas con stock para esa busqueda.</div>';
    if (meta) {
      meta.textContent = '0 resultados con stock para esa busqueda.';
    }
    return;
  }

  const currentPrendaId = Number($('#asignacion-prenda').value);
  const currentEstadoId = Number($('#asignacion-estado-origen').value);
  const selected = rows.find((item) => Number(item.prenda_id) === currentPrendaId && Number(item.estado_id) === currentEstadoId)
    || rows.find((item) => Number(item.prenda_id) === currentPrendaId);
  if (meta) {
    meta.textContent = `${rows.length} opciones con stock.${selected ? ` Seleccionada: ${selected.prenda_nombre}${selected.estado_nombre ? ` en ${selected.estado_nombre}` : ''}.` : ''}`;
  }

  container.innerHTML = rows.map((item) => `
    <button
      type="button"
      class="assignment-result ${currentPrendaId === Number(item.prenda_id) && currentEstadoId === Number(item.estado_id) ? 'active' : ''}"
      data-action="pick-assignment-item"
      data-prenda="${item.prenda_id}"
      data-estado="${item.estado_id}"
    >
      <div class="assignment-result-head">
        <strong>${item.prenda_nombre}</strong>
        <span class="result-tag">${item.estado_nombre}</span>
      </div>
      <small>Stock actual ${item.cantidad}${item.sku ? ` · ${item.sku}` : ''}</small>
    </button>
  `).join('');
}

function resolveClientAssignmentRoute(prendaId, taskStateId, explicitOriginId = null) {
  const taskState = findById('estados', taskStateId);
  const prenda = findById('prendas', prendaId);
  const route = getTaskRoute(taskState?.codigo);
  if (!taskState || !route) {
    return null;
  }

  let originState = explicitOriginId ? findById('estados', explicitOriginId) : null;
  const allowedOriginIds = route.sourceCandidates
    .map((code) => getStateByCode(code)?.id)
    .filter(Boolean);

  if (originState && !allowedOriginIds.includes(Number(originState.id))) {
    originState = null;
  }

  if (!originState) {
    for (const code of route.sourceCandidates) {
      const candidateState = getStateByCode(code);
      const qty = candidateState ? getInventory().find((item) => Number(item.prenda_id) === Number(prendaId) && Number(item.estado_id) === Number(candidateState.id))?.cantidad || 0 : 0;
      if (qty > 0) {
        originState = candidateState;
        break;
      }
    }
  }

  if (!originState && route.sourceCandidates.length) {
    originState = getStateByCode(route.sourceCandidates[0]);
  }

  const inventoryTargetState = getStateByCode(route.inventoryTarget === 'stock' && prenda?.no_planchar && taskState.codigo === 'planchado' ? 'stock' : route.inventoryTarget);
  return {
    taskState,
    originState,
    inventoryTargetState
  };
}

function renderAssignmentDrafts() {
  const rows = state.assignmentDrafts.map((item, index) => [
    item.trabajador_nombre || 'Sin asignar',
    item.prenda_nombre,
    `${item.estado_origen_nombre} -> tarea ${item.estado_destino_nombre} -> ${item.estado_inventario_final_nombre}`,
    item.cantidad,
    `Stock ${item.stock_actual} / reservado ${item.stock_reserved} / disponible ${item.stock_available}`,
    `<button type="button" class="small-btn icon-btn danger" data-action="remove-assignment-draft" data-index="${index}" title="Quitar" aria-label="Quitar"><span aria-hidden="true">Del</span></button>`
  ]);

  $('#tabla-borrador-asignaciones').innerHTML = table(
    ['Trabajador', 'Prenda', 'Ruta', 'Cantidad', 'Control stock', 'Accion'],
    rows
  );
  $('#asignacion-cart-resumen').textContent = `${state.assignmentDrafts.length} tareas agregadas, cada una con su propio responsable`;
}

function updateAssignmentStockInfo() {
  const prendaId = Number($('#asignacion-prenda')?.value);
  const taskStateId = Number($('#asignacion-estado-destino')?.value);
  const explicitOriginId = Number($('#asignacion-estado-origen')?.value);
  const info = $('#asignacion-stock-info');
  const routeInfo = $('#asignacion-ruta-info');

  if (!info || !prendaId || !taskStateId) {
    if (info) {
      info.textContent = 'Selecciona prenda y tarea para ver stock disponible.';
    }
    if (routeInfo) {
      routeInfo.textContent = 'Selecciona una tarea para ver de donde se descontara la prenda y a donde se movera.';
    }
    return;
  }

  const route = resolveClientAssignmentRoute(prendaId, taskStateId, explicitOriginId);
  if (!route?.originState) {
    info.textContent = 'No se pudo determinar el estado anterior para esta tarea.';
    routeInfo.textContent = `La tarea ${route?.taskState?.nombre || ''} no tiene origen disponible con stock para esta prenda.`;
    return;
  }

  $('#asignacion-estado-origen').value = route.originState.id;

  const stock = getAvailableStock(prendaId, route.originState.id);
  const prenda = findById('prendas', prendaId);
  info.textContent = `${prenda?.nombre || 'Prenda'} en ${route.originState.nombre}: stock actual ${stock.actual}, reservado en carrito ${stock.reserved}, disponible para asignar ${stock.available}.`;
  routeInfo.textContent = `Ruta seleccionada: ${route.originState.nombre} -> tarea ${route.taskState.nombre} -> inventario final ${route.inventoryTargetState?.nombre || route.taskState.nombre}.`;
}

function renderSummary() {
  const dashboard = state.data.dashboard;
  $('#cards-estados').innerHTML = dashboard.porEstado.map((item, index) => `
    <article class="status-card" style="background:${colorForState(item.codigo, index)}">
      <span>${item.nombre}</span>
      <strong>${item.cantidad}</strong>
      <small>${item.codigo.toUpperCase()}</small>
    </article>
  `).join('');

  $('#dato-pedidos-pendientes').textContent = dashboard.pedidosPendientes;
  $('#dato-stock-despacho').textContent = dashboard.stockDespacho;

  $('#tabla-top-trabajadores').innerHTML = table(
    ['Trabajador', 'Tareas', 'Generado'],
    dashboard.topTrabajadores.map((item) => [
      item.nombre || 'Sin nombre',
      item.tareas || 0,
      `Q ${(item.total_generado || 0).toFixed(2)}`
    ])
  );

  $('#tabla-inventario-resumen').innerHTML = table(
    ['Prenda', 'Estado', 'Cantidad', 'Atajo'],
    getInventory().map((item) => [
      item.prenda_nombre,
      badge(item.estado_nombre),
      item.cantidad,
      canAutoAdvanceInventoryRow(item)
        ? `<button type="button" class="small-btn icon-btn primary" data-action="quick-next" data-prenda="${item.prenda_id}" data-estado="${item.estado_id}" data-cantidad="${item.cantidad}" title="Siguiente" aria-label="Siguiente"><span aria-hidden="true">Go</span></button>`
        : '<span class="small-pill manual-pill">Manual</span>'
    ])
  );
}

function renderOperationalInventory() {
  $('#tabla-operacion-inventario').innerHTML = table(
    ['Prenda', 'Estado actual', 'Cantidad', 'No plancha', 'Acciones'],
    getInventory().map((item) => [
      item.prenda_nombre,
      badge(item.estado_nombre),
      item.cantidad,
      item.no_planchar ? 'Si' : 'No',
      `
        <div class="action-list">
          ${canAutoAdvanceInventoryRow(item)
            ? `<button type="button" class="small-btn icon-btn primary" data-action="quick-next" data-prenda="${item.prenda_id}" data-estado="${item.estado_id}" data-cantidad="${item.cantidad}" title="Pasar al siguiente estado" aria-label="Pasar al siguiente estado"><span aria-hidden="true">Go</span></button>`
            : '<span class="small-pill manual-pill">Ruta manual</span>'
          }
          <button type="button" class="small-btn icon-btn warning" data-action="send-reprocess" data-prenda="${item.prenda_id}" data-estado="${item.estado_id}" data-cantidad="${item.cantidad}" title="Enviar a reproceso" aria-label="Enviar a reproceso"><span aria-hidden="true">RP</span></button>
          <button type="button" class="small-btn icon-btn warning" data-action="send-desmanche" data-prenda="${item.prenda_id}" data-estado="${item.estado_id}" data-cantidad="${item.cantidad}" title="Enviar a desmanche" aria-label="Enviar a desmanche"><span aria-hidden="true">DS</span></button>
        </div>
      `
    ])
  );
}

function renderAssignments() {
  const assignments = getFilteredAssignments();
  const totalAssigned = assignments.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  const totalDone = assignments.reduce((sum, item) => sum + Number(item.cantidad_realizada || 0), 0);
  const totalPending = assignments.reduce((sum, item) => sum + Number(item.cantidad_pendiente ?? Math.max(item.cantidad - (item.cantidad_realizada || 0), 0)), 0);

  $('#tabla-asignaciones').innerHTML = `
    <div class="kanban-summary-strip table-summary-strip">
      <article class="kanban-mini-stat">
        <span>Tareas visibles</span>
        <strong>${assignments.length}</strong>
        <small>segun tus filtros</small>
      </article>
      <article class="kanban-mini-stat">
        <span>Prendas asignadas</span>
        <strong>${totalAssigned}</strong>
        <small>carga total</small>
      </article>
      <article class="kanban-mini-stat">
        <span>Avance reportado</span>
        <strong>${totalDone}</strong>
        <small>cantidad realizada</small>
      </article>
      <article class="kanban-mini-stat">
        <span>Pendiente</span>
        <strong>${totalPending}</strong>
        <small>por completar</small>
      </article>
    </div>
    ${table(
      ['Fecha', 'Prenda', 'Ruta', 'Responsable', 'Asignada', 'Realizada', 'Pendiente', 'Cumplimiento', 'Revisada', 'Pago', 'Acciones'],
      assignments.map((item) => ({
        className: state.selectedAssignmentId === Number(item.id) ? 'row-selected' : '',
        cells: [
          new Date(item.fecha_asignacion).toLocaleString('es-GT'),
          item.prenda_nombre,
          `${item.estado_origen_nombre || 'Ingreso'} -> ${item.estado_destino_nombre}`,
          item.trabajador_nombre || 'Sin asignar',
          item.cantidad,
          item.cantidad_realizada || 0,
          item.cantidad_pendiente ?? Math.max(item.cantidad - (item.cantidad_realizada || 0), 0),
          reviewBadge(item.estado_revision),
          checkedBadge(item.revisada),
          `Q ${(item.precio_total || 0).toFixed(2)}`,
          `
            <div class="action-list">
              ${actionButton({ action: 'select-assignment', id: item.id, icon: 'Abrir', label: 'Abrir', className: 'primary' })}
              ${actionButton({ action: 'quick-check-assignment', id: item.id, icon: 'OK', label: 'Marcar OK' })}
              ${actionButton({ action: 'delete-assignment', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}
            </div>
          `
        ]
      })),
      { wrapClass: 'tall wide-table-wrap' }
    )}
  `;

  if (state.selectedAssignmentId) {
    const selected = getAssignmentById(state.selectedAssignmentId);
    if (selected) {
      loadAssignmentIntoControl(selected.id);
    } else {
      clearAssignmentControlForm();
    }
  }
}

function getAssignmentLane(item) {
  if (item.revisada) {
    return 'revisada';
  }
  return item.estado_revision || 'pendiente';
}

function getAssignmentLaneConfig() {
  return [
    { key: 'pendiente', title: 'Pendientes', hint: 'Recien asignadas o sin avance', accent: '#d36a43' },
    { key: 'parcial', title: 'En proceso', hint: 'Avance parcial reportado', accent: '#d49a2c' },
    { key: 'cumplida', title: 'Cumplidas', hint: 'Terminadas pendientes de chequeo', accent: '#2f8d72' },
    { key: 'revisada', title: 'Revisadas OK', hint: 'Chequeadas y validadas', accent: '#3173c7' }
  ];
}

function getAssignmentLaneConfigForMode(assignments, mode) {
  if (mode === 'trabajador') {
    const ids = Array.from(new Set(assignments.map((item) => item.trabajador_id || 0)));
    return ids.map((workerId) => {
      const worker = workerId ? findById('trabajadores', workerId) : null;
      return {
        key: `worker-${workerId}`,
        title: worker?.nombre || 'Sin asignar',
        hint: workerId ? 'Tareas del responsable' : 'Tareas sin responsable',
        accent: workerId ? '#2f8d72' : '#7b879b'
      };
    });
  }

  if (mode === 'tarea') {
    const ids = Array.from(new Set(assignments.map((item) => item.estado_destino_id))).filter(Boolean);
    return ids.map((stateId) => {
      const task = findById('estados', stateId);
      return {
        key: `task-${stateId}`,
        title: task?.nombre || 'Tarea',
        hint: 'Agrupado por tipo de proceso',
        accent: solidColorForState(task?.codigo)
      };
    });
  }

  return getAssignmentLaneConfig();
}

function getAssignmentBucket(item, mode) {
  if (mode === 'trabajador') {
    return `worker-${item.trabajador_id || 0}`;
  }
  if (mode === 'tarea') {
    return `task-${item.estado_destino_id}`;
  }
  return getAssignmentLane(item);
}

function renderAssignmentsKanban(assignments) {
  const mode = getAssignmentBoardMode();
  const laneConfig = getAssignmentLaneConfigForMode(assignments, mode);
  const grouped = Object.fromEntries(laneConfig.map((lane) => [lane.key, []]));

  assignments.forEach((item) => {
    grouped[getAssignmentBucket(item, mode)]?.push(item);
  });

  const totalAssigned = assignments.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  const totalDone = assignments.reduce((sum, item) => sum + Number(item.cantidad_realizada || 0), 0);
  const totalPending = assignments.reduce((sum, item) => sum + Number(item.cantidad_pendiente ?? Math.max(item.cantidad - (item.cantidad_realizada || 0), 0)), 0);

  return `
    <div class="kanban-summary-strip">
      <article class="kanban-mini-stat">
        <span>Tareas visibles</span>
        <strong>${assignments.length}</strong>
        <small>segun tus filtros</small>
      </article>
      <article class="kanban-mini-stat">
        <span>Prendas asignadas</span>
        <strong>${totalAssigned}</strong>
        <small>carga total</small>
      </article>
      <article class="kanban-mini-stat">
        <span>Avance reportado</span>
        <strong>${totalDone}</strong>
        <small>cantidad realizada</small>
      </article>
      <article class="kanban-mini-stat">
        <span>Pendiente</span>
        <strong>${totalPending}</strong>
        <small>por completar</small>
      </article>
    </div>
    <div class="kanban-mode-copy">
      ${mode === 'cumplimiento' ? 'Vista por cumplimiento: arrastra entre columnas para marcar avance y revision.' : ''}
      ${mode === 'trabajador' ? 'Vista por persona: arrastra entre columnas para transferir la tarea a otro responsable.' : ''}
      ${mode === 'tarea' ? 'Vista por tarea: ideal para revisar carga por proceso. Esta vista es solo visual.' : ''}
    </div>
    <div class="kanban-board mode-${mode}">
      ${laneConfig.map((lane) => {
        const laneItems = grouped[lane.key] || [];
        return `
          <section class="kanban-lane" data-lane="${lane.key}" data-mode="${mode}" style="--lane-accent:${lane.accent}">
            <header class="kanban-lane-head">
              <div>
                <p>${lane.title}</p>
                <small>${lane.hint}</small>
              </div>
              <strong>${laneItems.length}</strong>
            </header>
            <div class="kanban-lane-body">
              ${laneItems.length
                ? laneItems.map((item) => renderAssignmentKanbanCard(item)).join('')
                : '<div class="kanban-empty">Arrastra una tarea aqui</div>'
              }
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
}

function renderAssignmentKanbanCard(item) {
  const taskColor = solidColorForState(item.estado_destino_codigo);
  const pending = item.cantidad_pendiente ?? Math.max(item.cantidad - (item.cantidad_realizada || 0), 0);
  const selectedClass = state.selectedAssignmentId === Number(item.id) ? ' selected' : '';
  const route = `${item.estado_origen_nombre || 'Ingreso'} -> ${item.estado_destino_nombre}`;
  const mode = getAssignmentBoardMode();
  const isDraggable = mode !== 'tarea';
  const dragMessage = mode === 'trabajador' ? 'Arrastra para transferir' : mode === 'cumplimiento' ? 'Arrastra para revisar' : 'Vista de consulta';

  return `
    <article class="kanban-card${selectedClass}" draggable="${isDraggable}" data-assignment-id="${item.id}" style="--task-color:${taskColor}">
      <div class="kanban-card-glow"></div>
      <div class="kanban-card-head">
        <span class="kanban-task-pill">${escapeHtml(item.estado_destino_nombre || 'Tarea')}</span>
        <span class="kanban-card-date">${new Date(item.fecha_asignacion).toLocaleString('es-GT')}</span>
      </div>
      <h3>${escapeHtml(item.prenda_nombre || 'Prenda')}</h3>
      <p class="kanban-route">${escapeHtml(route)}</p>
      <div class="kanban-worker-row">
        <strong>${escapeHtml(item.trabajador_nombre || 'Sin asignar')}</strong>
        ${checkedBadge(item.revisada)}
      </div>
      <div class="kanban-metrics">
        <span><small>Asignada</small><strong>${item.cantidad || 0}</strong></span>
        <span><small>Realizada</small><strong>${item.cantidad_realizada || 0}</strong></span>
        <span><small>Pendiente</small><strong>${pending}</strong></span>
      </div>
      <div class="kanban-card-footer">
        <span class="kanban-pay">Q ${Number(item.precio_total || 0).toFixed(2)}</span>
        <span class="kanban-drag-note">${dragMessage}</span>
      </div>
      <div class="kanban-card-actions">
        <button type="button" class="small-btn primary" data-action="select-assignment" data-id="${item.id}">Abrir</button>
        <button type="button" class="small-btn" data-action="quick-check-assignment" data-id="${item.id}">OK rapido</button>
        <button type="button" class="small-btn danger" data-action="delete-assignment" data-id="${item.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function renderCatalogs() {
  const areas = getCatalog('areas');
  const bodegas = getCatalog('bodegas');
  const estados = getCatalog('estados');
  const prendas = getCatalog('prendas');
  const trabajadores = getCatalog('trabajadores');
  const usuarios = getCatalog('usuarios');
  const precios = state.data.catalogos.precios || [];

  $('#tabla-areas').innerHTML = table(['Nombre', 'Descripcion', 'Acciones'], areas.map((item) => [
    item.nombre,
    item.descripcion || '',
    `<div class="action-list">${actionButton({ action: 'edit-area', id: item.id, icon: 'Edit', label: 'Editar' })}${actionButton({ action: 'delete-area', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}</div>`
  ]));

  $('#tabla-bodegas').innerHTML = table(['Nombre', 'Tipo', 'Acciones'], bodegas.map((item) => [
    item.nombre,
    badge(item.tipo),
    `<div class="action-list">${actionButton({ action: 'edit-bodega', id: item.id, icon: 'Edit', label: 'Editar' })}${actionButton({ action: 'delete-bodega', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}</div>`
  ]));

  $('#tabla-estados').innerHTML = table(['Nombre', 'Codigo', 'Orden', 'Cobra', 'Acciones'], estados.map((item) => [
    item.nombre,
    item.codigo,
    item.orden,
    item.cobra ? 'Si' : 'No',
    `<div class="action-list">${actionButton({ action: 'edit-estado', id: item.id, icon: 'Edit', label: 'Editar' })}${actionButton({ action: 'delete-estado', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}</div>`
  ]));

  $('#tabla-prendas').innerHTML = table(['Prenda', 'Area', 'No plancha', 'Acciones'], prendas.map((item) => [
    item.nombre,
    item.area_nombre || '',
    item.no_planchar ? 'Si' : 'No',
    `<div class="action-list">${actionButton({ action: 'edit-prenda', id: item.id, icon: 'Edit', label: 'Editar' })}${actionButton({ action: 'delete-prenda', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}</div>`
  ]));

  $('#tabla-precios').innerHTML = table(['Prenda', 'Estado', 'Factura', 'No factura'], precios.map((item) => [
    item.prenda_nombre,
    item.estado_nombre,
    `Q ${(item.precio_factura || 0).toFixed(2)}`,
    `Q ${(item.precio_no_factura || 0).toFixed(2)}`
  ]));

  $('#tabla-trabajadores').innerHTML = table(['Nombre', 'Factura', 'Acciones'], trabajadores.map((item) => [
    item.nombre,
    item.factura ? 'Si' : 'No',
    `<div class="action-list">${actionButton({ action: 'edit-trabajador', id: item.id, icon: 'Edit', label: 'Editar' })}${actionButton({ action: 'delete-trabajador', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}</div>`
  ]));

  $('#tabla-usuarios').innerHTML = table(['Nombre', 'Usuario', 'Rol', 'Bodega', 'Acciones'], usuarios.map((item) => [
    item.nombre,
    item.username,
    badge(item.rol),
    item.bodega_nombre || '',
    `<div class="action-list">${actionButton({ action: 'edit-usuario', id: item.id, icon: 'Edit', label: 'Editar' })}${actionButton({ action: 'delete-usuario', id: item.id, icon: 'Del', label: 'Eliminar', className: 'danger' })}</div>`
  ]));
}

function renderOrders() {
  const pedidos = state.data.pedidos || [];
  $('#pedido-items').innerHTML = state.pedidoItems.map((item, index) => `
    <div class="chip">
      <span>${item.prenda_nombre} x ${item.cantidad}</span>
      <button type="button" data-action="remove-order-item" data-index="${index}">x</button>
    </div>
  `).join('');

    $('#tabla-pedidos').innerHTML = table(
      ['Fecha', 'Usuario', 'Bodega', 'Solicitado', 'Estado', 'Detalle', 'Acciones'],
      pedidos.map((pedido) => [
        new Date(pedido.fecha_creacion).toLocaleString('es-GT'),
      pedido.usuario_nombre,
      pedido.bodega_nombre,
        `${pedido.fecha_solicitada} ${pedido.horario_solicitado}`,
        badge(pedido.estado),
        pedido.detalles.map((item) => `${item.prenda_nombre} x ${item.cantidad} (id:${item.id}, desp:${item.cantidad_despachada || 0})`).join('<br>'),
        `
          <div class="action-list">
            ${pedido.estado === 'pendiente'
              ? actionButton({ action: 'dispatch-order', id: pedido.id, icon: 'Go', label: 'Despachar', className: 'primary' })
              : '<span class="muted">Despachado</span>'
            }
            ${(pedido.estado === 'despachado' || pedido.estado === 'parcial')
              ? actionButton({ action: 'undo-dispatch-order', id: pedido.id, icon: 'Undo', label: 'Anular despacho', className: 'danger' })
              : ''
            }
            ${(pedido.estado === 'despachado' || pedido.estado === 'parcial')
              ? actionButton({ action: 'undo-dispatch-item', id: pedido.id, icon: 'Undo', label: 'Anular prenda' })
              : ''
            }
            ${actionButton({ action: 'print-order-pdf', id: pedido.id, icon: 'PDF', label: 'PDF' })}
          </div>
        `
      ])
    );
  }

function renderReports() {
  const reportes = state.data.reportes;
  $('#reporte-asignaciones-dia').innerHTML = table(['Fecha', 'Usuario', 'Trabajador', 'Prenda', 'Cantidad', 'Tarea'], reportes.asignacionesDia.map((item) => [
    item.fecha,
    item.usuario_nombre || '',
    item.trabajador_nombre || '',
    item.prenda_nombre,
    item.cantidad,
    item.estado_destino_nombre
  ]));

  $('#reporte-tareas').innerHTML = table(['Trabajador', 'Tarea', 'Cantidad', 'Precio U.', 'Precio total'], reportes.tareasPorUsuario.map((item) => [
    item.trabajador || '',
    item.tarea,
    item.cantidad || 0,
    `Q ${(item.precio_unitario || 0).toFixed(2)}`,
    `Q ${(item.precio_total || 0).toFixed(2)}`
  ]));

  $('#reporte-reversiones').innerHTML = table(['Fecha', 'Usuario', 'Detalle'], reportes.reversiones.map((item) => [
    new Date(item.fecha_evento).toLocaleString('es-GT'),
    item.usuario || '',
    item.detalle
  ]));

  $('#reporte-prendas-estado').innerHTML = table(['Estado', 'Cantidad'], reportes.prendasPorEstado.map((item) => [
    item.estado,
    item.cantidad
  ]));

  $('#reporte-inventario').innerHTML = table(['Prenda', 'Estado', 'Cantidad'], reportes.inventario.map((item) => [
    item.prenda,
    item.estado,
    item.cantidad
  ]));

  $('#reporte-bodega').innerHTML = table(['Bodega', 'Prenda', 'Cantidad'], reportes.existenciaBodega.map((item) => [
    item.bodega,
    item.prenda,
    item.cantidad
  ]));

  const performanceRows = getFilteredPerformanceAssignments();
  const performanceSummary = Array.from(
    performanceRows.reduce((map, item) => {
      const key = item.trabajador_id || `sin-${item.trabajador_nombre || 'Sin asignar'}`;
      if (!map.has(key)) {
        map.set(key, {
          trabajador: item.trabajador_nombre || 'Sin asignar',
          tareas: 0,
          prendas: 0,
          realizadas: 0,
          generado: 0
        });
      }
      const row = map.get(key);
      row.tareas += 1;
      row.prendas += Number(item.cantidad || 0);
      row.realizadas += Number(item.cantidad_realizada || 0);
      row.generado += Number(item.precio_total || 0);
      return map;
    }, new Map()).values()
  ).sort((a, b) => b.generado - a.generado || b.prendas - a.prendas || b.tareas - a.tareas);
  const totalTareas = performanceRows.length;
  const totalPrendas = performanceRows.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  const totalRealizado = performanceRows.reduce((sum, item) => sum + Number(item.cantidad_realizada || 0), 0);
  const totalGenerado = performanceRows.reduce((sum, item) => sum + Number(item.precio_total || 0), 0);

  $('#reporte-rendimiento-cards').innerHTML = `
    <article class="state-card soap-card" style="background:${colorForState('lavado', 0)}">
      <span class="soap-bubble soap-bubble-a"></span>
      <span class="soap-bubble soap-bubble-b"></span>
      <div class="state-card-copy">
        <small>Tareas filtradas</small>
        <strong>${totalTareas}</strong>
        <span>Registros encontrados</span>
      </div>
    </article>
    <article class="state-card soap-card" style="background:${colorForState('tendido', 0)}">
      <span class="soap-bubble soap-bubble-a"></span>
      <span class="soap-bubble soap-bubble-b"></span>
      <div class="state-card-copy">
        <small>Prendas asignadas</small>
        <strong>${totalPrendas}</strong>
        <span>Cantidad total</span>
      </div>
    </article>
    <article class="state-card soap-card" style="background:${colorForState('limpio', 0)}">
      <span class="soap-bubble soap-bubble-a"></span>
      <span class="soap-bubble soap-bubble-b"></span>
      <div class="state-card-copy">
        <small>Prendas realizadas</small>
        <strong>${totalRealizado}</strong>
        <span>Avance reportado</span>
      </div>
    </article>
    <article class="state-card soap-card" style="background:${colorForState('planchado', 0)}">
      <span class="soap-bubble soap-bubble-a"></span>
      <span class="soap-bubble soap-bubble-b"></span>
      <div class="state-card-copy">
        <small>Total generado</small>
        <strong>Q ${totalGenerado.toFixed(2)}</strong>
        <span>Pago del filtro</span>
      </div>
    </article>
  `;

  $('#reporte-rendimiento-resumen').innerHTML = table(
    ['Trabajador', 'Tareas', 'Cant. asignada', 'Cant. realizada', 'Total generado'],
    performanceSummary.map((item) => [
      item.trabajador,
      item.tareas,
      item.prendas,
      item.realizadas,
      `Q ${item.generado.toFixed(2)}`
    ])
  );

  $('#reporte-rendimiento').innerHTML = table(
    ['Fecha', 'Trabajador', 'Tarea', 'Prenda', 'Cant. asignada', 'Cant. realizada', 'Cumplimiento', 'Revisada', 'Total'],
    performanceRows.map((item) => [
      new Date(item.fecha_asignacion).toLocaleString('es-GT'),
      item.trabajador_nombre || 'Sin asignar',
      item.estado_destino_nombre || '',
      item.prenda_nombre || '',
      item.cantidad || 0,
      item.cantidad_realizada || 0,
      reviewBadge(item.estado_revision),
      checkedBadge(item.revisada),
      `Q ${Number(item.precio_total || 0).toFixed(2)}`
    ]),
    { wrapClass: 'tall' }
  );
}

function findById(listName, id) {
  return getCatalog(listName).find((item) => Number(item.id) === Number(id));
}

function getAssignmentById(id) {
  return (state.data?.asignaciones || []).find((item) => Number(item.id) === Number(id));
}

function getFilteredPerformanceAssignments() {
  const workerId = Number($('#reporte-rendimiento-trabajador')?.value);
  const taskId = Number($('#reporte-rendimiento-tarea')?.value);
  const fromDate = $('#reporte-rendimiento-desde')?.value || '';
  const toDate = $('#reporte-rendimiento-hasta')?.value || '';

  return (state.data?.asignaciones || []).filter((item) => {
    const matchesWorker = Number.isNaN(workerId) || !workerId || Number(item.trabajador_id) === workerId;
    const matchesTask = Number.isNaN(taskId) || !taskId || Number(item.estado_destino_id) === taskId;
    const assignmentDate = String(item.fecha_asignacion || '').slice(0, 10);
    const matchesFrom = !fromDate || assignmentDate >= fromDate;
    const matchesTo = !toDate || assignmentDate <= toDate;
    return !item.eliminada && matchesWorker && matchesTask && matchesFrom && matchesTo;
  });
}

function exportPerformanceReport() {
  const rows = getFilteredPerformanceAssignments();
  if (!rows.length) {
    throw new Error('No hay datos para exportar con los filtros actuales.');
  }

  const headers = ['Fecha', 'Trabajador', 'Tarea', 'Prenda', 'Cantidad', 'Precio Unitario', 'Precio Total', 'Cumplimiento', 'Revisada', 'Observaciones'];
  const csvRows = [
    headers.join(','),
    ...rows.map((item) => ([
      new Date(item.fecha_asignacion).toLocaleString('es-GT'),
      item.trabajador_nombre || 'Sin asignar',
      item.estado_destino_nombre || '',
      item.prenda_nombre || '',
      item.cantidad || 0,
      Number(item.precio_unitario || 0).toFixed(2),
      Number(item.precio_total || 0).toFixed(2),
      item.estado_revision || 'pendiente',
      item.revisada ? 'Si' : 'No',
      item.observaciones || ''
    ].map(escapeCsv).join(',')))
  ];

  const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `reporte-rendimiento-${today}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildOrderPdfData(orderLike) {
  const usuario = findById('usuarios', orderLike.usuario_id);
  const bodegaId = orderLike.bodega_id || usuario?.bodega_id || null;
  const bodega = findById('bodegas', bodegaId);
  return {
    id: orderLike.id || 'N/D',
    usuario: orderLike.usuario_nombre || usuario?.nombre || 'Usuario no definido',
    bodega: orderLike.bodega_nombre || bodega?.nombre || 'Bodega no definida',
    fecha: orderLike.fecha_solicitada || '',
    horario: orderLike.horario_solicitado || '',
    observaciones: orderLike.observaciones || '',
    detalles: (orderLike.detalles || []).map((item) => ({
      prenda_nombre: item.prenda_nombre || findById('prendas', item.prenda_id)?.nombre || 'Prenda',
      cantidad: item.cantidad || 0
    }))
  };
}

function generateOrderPdf(orderLike, { openPrint = true } = {}) {
  if (!window.jspdf?.jsPDF) {
    throw new Error('La libreria de PDF no esta disponible en este momento.');
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const order = buildOrderPdfData(orderLike);
  const now = new Date();
  const pageWidth = 210;
  const left = 14;
  const right = 196;
  let y = 14;

  pdf.setDrawColor(221, 198, 160);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(10, 10, 190, 277, 6, 6);

  pdf.setFillColor(18, 107, 115);
  pdf.roundedRect(14, 14, 182, 24, 4, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('JARDINES DEL LAGO', 18, 24);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Pedido interno de lavanderia', 18, 31);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`No. ${order.id}`, 188, 24, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.text(now.toLocaleDateString('es-GT'), 188, 31, { align: 'right' });

  y = 48;
  pdf.setTextColor(55, 46, 36);
  pdf.setFillColor(250, 244, 235);
  pdf.roundedRect(14, y, 88, 32, 4, 4, 'F');
  pdf.roundedRect(108, y, 88, 32, 4, 4, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Solicitante', 18, y + 8);
  pdf.text('Entrega requerida', 112, y + 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(order.usuario, 18, y + 16);
  pdf.text(`Fecha: ${order.fecha || '-'}`, 112, y + 16);
  pdf.text(`Bodega: ${order.bodega}`, 18, y + 24);
  pdf.text(`Hora: ${order.horario || '-'}`, 112, y + 24);

  y += 42;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Listado de prendas solicitadas', 14, y);

  y += 8;
  pdf.setFillColor(18, 107, 115);
  pdf.setTextColor(255, 255, 255);
  pdf.rect(14, y - 5, 134, 9, 'F');
  pdf.rect(148, y - 5, 24, 9, 'F');
  pdf.rect(172, y - 5, 24, 9, 'F');
  pdf.setFontSize(10);
  pdf.text('Prenda', 18, y);
  pdf.text('Cant.', 160, y, { align: 'center' });
  pdf.text('Linea', 184, y, { align: 'center' });

  y += 9;
  pdf.setTextColor(55, 46, 36);
  pdf.setFont('helvetica', 'normal');

  (order.detalles || []).forEach((item, index) => {
    if (y > 230) {
      pdf.addPage();
      pdf.setDrawColor(221, 198, 160);
      pdf.roundedRect(10, 10, 190, 277, 6, 6);
      y = 24;
    }

    if (index % 2 === 0) {
      pdf.setFillColor(252, 248, 242);
      pdf.rect(14, y - 5, 182, 9, 'F');
    }

    pdf.text(String(item.prenda_nombre), 18, y);
    pdf.text(String(item.cantidad || 0), 160, y, { align: 'center' });
    pdf.text(String(index + 1), 184, y, { align: 'center' });
    y += 9;
  });

  const totalLines = (order.detalles || []).length;
  const totalItems = (order.detalles || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);

  y += 6;
  pdf.setFillColor(244, 234, 217);
  pdf.roundedRect(14, y - 5, 182, 14, 4, 4, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Total de lineas: ${totalLines}`, 18, y + 3);
  pdf.text(`Total de prendas: ${totalItems}`, 192, y + 3, { align: 'right' });

  y += 20;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Observaciones', 14, y);
  y += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.roundedRect(14, y, 182, 28, 4, 4);
  const noteLines = pdf.splitTextToSize(order.observaciones || 'Sin observaciones.', 172);
  pdf.text(noteLines, 18, y + 8);

  y += 42;
  pdf.setDrawColor(170, 160, 145);
  pdf.line(20, y, 86, y);
  pdf.line(124, y, 190, y);
  pdf.setFontSize(9);
  pdf.text('Firma quien solicita', 53, y + 5, { align: 'center' });
  pdf.text('Firma quien recibe / despacha', 157, y + 5, { align: 'center' });

  pdf.setFontSize(8);
  pdf.setTextColor(110, 101, 88);
  pdf.text('Documento generado por el sistema de lavanderia.', pageWidth / 2, 283, { align: 'center' });

  if (openPrint) {
    pdf.autoPrint();
    pdf.output('dataurlnewwindow');
  } else {
    pdf.save(`pedido-${order.id}.pdf`);
  }
}

function getFilteredAssignments() {
  const search = ($('#control-tareas-buscar')?.value || '').trim().toLowerCase();
  const workerId = Number($('#control-tareas-trabajador')?.value);
  const taskId = Number($('#control-tareas-estado')?.value);
  const review = $('#control-tareas-revision')?.value || '';

  return (state.data?.asignaciones || []).filter((item) => {
    const matchesSearch = !search || [
      item.prenda_nombre,
      item.trabajador_nombre,
      item.estado_destino_nombre,
      item.observaciones
    ].some((value) => String(value || '').toLowerCase().includes(search));

    const matchesWorker = Number.isNaN(workerId) || !workerId || Number(item.trabajador_id) === workerId;
    const matchesTask = Number.isNaN(taskId) || !taskId || Number(item.estado_destino_id) === taskId;
    const matchesReview = !review || (item.estado_revision || 'pendiente') === review;
    return matchesSearch && matchesWorker && matchesTask && matchesReview;
  });
}

function clearAssignmentControlForm() {
  state.selectedAssignmentId = null;
  clearAssignmentModalForm();
}

function clearAssignmentModalForm() {
  $('#assignment-modal-id').value = '';
  $('#assignment-modal-summary').textContent = 'Selecciona una tarea para verla en detalle.';
  $('#assignment-modal-trabajador').value = '';
  $('#assignment-modal-revision').value = 'pendiente';
  $('#assignment-modal-realizada').value = '0';
  $('#assignment-modal-revisada').checked = false;
  $('#assignment-modal-observaciones').value = '';
  $('#assignment-modal-codigo').value = '';
}

function openAssignmentModal() {
  $('#assignment-modal').classList.remove('hidden');
}

function closeAssignmentModal() {
  $('#assignment-modal').classList.add('hidden');
}

function getAssignmentEditorNodes(prefix) {
  return {
    id: $(`#${prefix}-id`),
    summary: $(`#${prefix}-summary`),
    trabajador: $(`#${prefix}-trabajador`),
    revision: $(`#${prefix}-revision`),
    realizada: $(`#${prefix}-realizada`),
    revisada: $(`#${prefix}-revisada`),
    observaciones: $(`#${prefix}-observaciones`),
    codigo: $(`#${prefix}-codigo`)
  };
}

function fillAssignmentEditor(prefix, item) {
  const nodes = getAssignmentEditorNodes(prefix);
  if (!nodes.id || !nodes.summary || !nodes.trabajador || !nodes.revision || !nodes.realizada || !nodes.revisada || !nodes.observaciones || !nodes.codigo) {
    return;
  }

  nodes.id.value = item.id;
  nodes.summary.textContent = `${item.prenda_nombre} | ${item.estado_origen_nombre || 'Ingreso'} -> ${item.estado_destino_nombre} | asignadas ${item.cantidad}, realizadas ${item.cantidad_realizada || 0}, pendientes ${item.cantidad_pendiente ?? Math.max(item.cantidad - (item.cantidad_realizada || 0), 0)}, chequeada ${item.revisada ? 'si' : 'no'}.`;
  nodes.trabajador.value = item.trabajador_id || '';
  nodes.revision.value = item.estado_revision || 'pendiente';
  nodes.realizada.value = item.cantidad_realizada || 0;
  nodes.revisada.checked = Boolean(item.revisada);
  nodes.observaciones.value = item.observaciones || '';
  nodes.codigo.value = '';
}

function loadAssignmentIntoControl(assignmentId) {
  const item = getAssignmentById(assignmentId);
  if (!item) {
    clearAssignmentControlForm();
    return;
  }

  state.selectedAssignmentId = Number(item.id);
  fillAssignmentEditor('assignment-modal', item);
}

function getAssignmentFormPayload(prefix) {
  const nodes = getAssignmentEditorNodes(prefix);
  return {
    assignmentId: Number(nodes.id?.value),
    codigo: nodes.codigo?.value.trim() || '',
    trabajador_id: Number(nodes.trabajador?.value) || null,
    estado_revision: nodes.revision?.value || 'pendiente',
    cantidad_realizada: Number(nodes.realizada?.value) || 0,
    revisada: Boolean(nodes.revisada?.checked),
    observaciones: nodes.observaciones?.value || ''
  };
}

async function requestAssignmentAuthorization(message) {
  if (canManageTaskBoard()) {
    return '';
  }
  const existingCode = $('#assignment-modal-codigo')?.value.trim();
  if (existingCode) {
    return existingCode;
  }
  return askText('Autorizacion', message, '', 'password');
}

async function saveAssignmentControlChanges(assignmentId, overrides = {}, successMessage = 'Tarea actualizada.') {
  const item = getAssignmentById(assignmentId);
  if (!item) {
    throw new Error('No se encontro la tarea seleccionada.');
  }

  const codigo = overrides.codigo_autorizacion || await requestAssignmentAuthorization('Ingresa el codigo de autorizacion para actualizar la tarea.');
  if (!codigo) {
    return;
  }

  await api(`/api/asignaciones/${assignmentId}`, {
    method: 'PUT',
    body: {
      usuario_id: activeUserId(),
      trabajador_id: Object.prototype.hasOwnProperty.call(overrides, 'trabajador_id')
        ? overrides.trabajador_id
        : (item.trabajador_id || null),
      estado_revision: overrides.estado_revision || item.estado_revision || 'pendiente',
      cantidad_realizada: Object.prototype.hasOwnProperty.call(overrides, 'cantidad_realizada')
        ? overrides.cantidad_realizada
        : Number(item.cantidad_realizada || 0),
      revisada: Object.prototype.hasOwnProperty.call(overrides, 'revisada')
        ? overrides.revisada
        : Boolean(item.revisada),
      observaciones: Object.prototype.hasOwnProperty.call(overrides, 'observaciones')
        ? overrides.observaciones
        : (item.observaciones || ''),
      codigo_autorizacion: codigo
    }
  });

  showToast(successMessage, 'success');
  syncAfterMutation();
}

async function moveAssignmentToLane(assignmentId, laneKey) {
  const item = getAssignmentById(assignmentId);
  if (!item) {
    throw new Error('No se encontro la tarea para mover.');
  }

  const mode = getAssignmentBoardMode();

  if (mode === 'trabajador') {
    const workerId = Number(String(laneKey).replace('worker-', '')) || null;
    if (Number(item.trabajador_id || 0) === Number(workerId || 0)) {
      return;
    }
    await saveAssignmentControlChanges(
      assignmentId,
      { trabajador_id: workerId },
      `Responsable actualizado a ${findById('trabajadores', workerId)?.nombre || 'Sin asignar'}.`
    );
    return;
  }

  if (mode === 'tarea') {
    return;
  }

  const currentLane = getAssignmentLane(item);
  if (currentLane === laneKey) {
    return;
  }

  const laneMeta = getAssignmentLaneConfig().find((lane) => lane.key === laneKey);
  const payload = laneKey === 'revisada'
    ? { estado_revision: 'cumplida', revisada: true, cantidad_realizada: Number(item.cantidad || 0) }
    : laneKey === 'cumplida'
      ? { estado_revision: 'cumplida', revisada: false, cantidad_realizada: Number(item.cantidad || 0) }
      : laneKey === 'pendiente'
        ? { estado_revision: 'pendiente', revisada: false, cantidad_realizada: 0 }
        : { estado_revision: 'parcial', revisada: false, cantidad_realizada: Number(item.cantidad_realizada || 0) };

  await saveAssignmentControlChanges(
    assignmentId,
    payload,
    `Tarea movida a ${laneMeta?.title || laneKey}.`
  );
}

function setupKanbanInteractions() {
  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.kanban-card');
    if (!card || card.getAttribute('draggable') !== 'true') {
      return;
    }
    state.draggingAssignmentId = Number(card.dataset.assignmentId);
    card.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(state.draggingAssignmentId));
    }
  });

  document.addEventListener('dragend', (event) => {
    event.target.closest('.kanban-card')?.classList.remove('dragging');
    state.draggingAssignmentId = null;
    document.querySelectorAll('.kanban-lane.drag-over').forEach((lane) => lane.classList.remove('drag-over'));
  });

  document.addEventListener('dragover', (event) => {
    const lane = event.target.closest('.kanban-lane');
    if (!lane || !state.draggingAssignmentId || lane.dataset.mode === 'tarea') {
      return;
    }
    event.preventDefault();
    document.querySelectorAll('.kanban-lane.drag-over').forEach((node) => {
      if (node !== lane) {
        node.classList.remove('drag-over');
      }
    });
    lane.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (event) => {
    const lane = event.target.closest('.kanban-lane');
    if (!lane) {
      return;
    }
    const relatedLane = event.relatedTarget?.closest?.('.kanban-lane');
    if (lane !== relatedLane) {
      lane.classList.remove('drag-over');
    }
  });

  document.addEventListener('drop', (event) => {
    const lane = event.target.closest('.kanban-lane');
    if (!lane || !state.draggingAssignmentId) {
      return;
    }
    event.preventDefault();
    const assignmentId = state.draggingAssignmentId;
    lane.classList.remove('drag-over');
    state.draggingAssignmentId = null;
    moveAssignmentToLane(assignmentId, lane.dataset.lane).catch((error) => showToast(error.message, 'error'));
  });
}

function buildAssignmentDraft() {
  const prenda_id = Number($('#asignacion-prenda').value);
  const estado_destino_id = Number($('#asignacion-estado-destino').value);
  const explicitOriginId = Number($('#asignacion-estado-origen').value);
  const cantidad = Number($('#asignacion-cantidad').value);

  if (!prenda_id || !estado_destino_id || !cantidad) {
    throw new Error('Completa prenda, tarea y cantidad.');
  }

  const route = resolveClientAssignmentRoute(prenda_id, estado_destino_id, explicitOriginId);
  const estado_origen_id = route?.originState?.id;
  if (!estado_origen_id) {
    throw new Error('No se encontro un estado anterior valido para esta tarea.');
  }

  const stock = getAvailableStock(prenda_id, estado_origen_id);
  if (cantidad > stock.available) {
    const prenda = findById('prendas', prenda_id);
    throw new Error(`No hay suficiente stock para ${prenda?.nombre || 'la prenda'} en ${route.originState.nombre}. Stock actual: ${stock.actual}. Reservado: ${stock.reserved}. Disponible: ${stock.available}.`);
  }

  return {
    prenda_id,
    estado_origen_id,
    estado_destino_id,
    trabajador_id: activeWorkerId(),
    usuario_id: activeUserId(),
    cantidad,
    observaciones: $('#asignacion-observacion').value,
    prenda_nombre: findById('prendas', prenda_id)?.nombre || '',
    estado_origen_nombre: route.originState.nombre,
    estado_destino_nombre: route.taskState.nombre,
    estado_inventario_final_nombre: route.inventoryTargetState?.nombre || route.taskState.nombre,
    trabajador_nombre: findById('trabajadores', activeWorkerId())?.nombre || '',
    stock_actual: stock.actual,
    stock_reserved: stock.reserved,
    stock_available: stock.available
  };
}

function clearAssignmentComposer() {
  $('#asignacion-prenda-buscar').value = '';
  $('#asignacion-prenda').value = '';
  $('#asignacion-estado-origen').value = '';
  $('#asignacion-cantidad').value = '1';
  $('#asignacion-observacion').value = '';
  renderAssignmentGarmentOptions();
  renderAssignmentTasks();
  renderAssignmentFinder();
  updateAssignmentStockInfo();
}

function setupForms() {
  $('#btn-recargar').onclick = () => {
    rememberCurrentView();
    loadData();
  };
  document.querySelectorAll('form').forEach((form) => {
    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', () => setCurrentViewFromNode(form), true);
  });
  $('#asignacion-prenda-buscar').addEventListener('input', () => {
    renderAssignmentGarmentOptions();
    renderAssignmentFinder();
  });
  $('#pedido-item-buscar').addEventListener('input', () => {
    renderOrderGarmentOptions();
    renderOrderFinder();
  });
  $('#pedido-item-prenda').addEventListener('change', renderOrderFinder);
  ['#control-tareas-buscar', '#control-tareas-trabajador', '#control-tareas-estado', '#control-tareas-revision'].forEach((selector) => {
    $(selector).addEventListener('input', renderAssignments);
    $(selector).addEventListener('change', renderAssignments);
  });
  ['#reporte-rendimiento-trabajador', '#reporte-rendimiento-tarea', '#reporte-rendimiento-desde', '#reporte-rendimiento-hasta'].forEach((selector) => {
    $(selector).addEventListener('input', renderReports);
    $(selector).addEventListener('change', renderReports);
  });
  ['#asignacion-prenda', '#asignacion-cantidad'].forEach((selector) => {
    $(selector).addEventListener('change', updateAssignmentStockInfo);
    $(selector).addEventListener('input', updateAssignmentStockInfo);
  });

  $('#btn-reporte-rendimiento-limpiar').onclick = () => {
    $('#reporte-rendimiento-trabajador').value = '';
    $('#reporte-rendimiento-tarea').value = '';
    $('#reporte-rendimiento-desde').value = '';
    $('#reporte-rendimiento-hasta').value = '';
    renderReports();
    showToast('Filtros del reporte limpiados.', 'info');
  };

  $('#btn-reporte-rendimiento-exportar').onclick = () => {
    try {
      exportPerformanceReport();
      showToast('Reporte exportado para Excel.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-ingreso').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/inventario/ingreso', {
        method: 'POST',
        body: {
          prenda_id: Number($('#ingreso-prenda').value),
          estado_id: Number($('#ingreso-estado').value),
          cantidad: Number($('#ingreso-cantidad').value),
          usuario_id: activeUserId(),
          detalle: $('#ingreso-detalle').value
        }
      });
      event.target.reset();
      showToast('Ingreso registrado correctamente.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-asignacion').onsubmit = async (event) => {
    event.preventDefault();
    try {
      if (!state.assignmentDrafts.length) {
        state.assignmentDrafts.push(buildAssignmentDraft());
      }

      for (const item of state.assignmentDrafts) {
        await api('/api/asignaciones', {
          method: 'POST',
          body: {
            prenda_id: item.prenda_id,
            estado_origen_id: item.estado_origen_id,
            estado_destino_id: item.estado_destino_id,
            trabajador_id: item.trabajador_id,
            usuario_id: item.usuario_id,
            cantidad: item.cantidad,
            observaciones: item.observaciones
          }
        });
      }
      state.assignmentDrafts = [];
      clearAssignmentComposer();
      showToast('Tareas asignadas correctamente.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

    $('#btn-agregar-asignacion').onclick = () => {
      try {
        const draft = buildAssignmentDraft();
        state.assignmentDrafts.push(draft);
      renderAssignmentDrafts();
      renderAssignmentFinder();
      updateAssignmentStockInfo();
      showToast(`Tarea agregada para ${draft.trabajador_nombre || 'Sin asignar'}.`, 'info');
      clearAssignmentComposer();
    } catch (error) {
        showToast(error.message, 'error');
      }
    };

    $('#assignment-modal-close').onclick = closeAssignmentModal;
    $('#assignment-modal-clear').onclick = () => {
      clearAssignmentModalForm();
      showToast('Detalle del modal limpiado.', 'info');
    };

    $('#assignment-modal-delete').onclick = async () => {
      try {
        const { assignmentId, codigo } = getAssignmentFormPayload('assignment-modal');
        if (!assignmentId) {
          throw new Error('Selecciona una tarea para eliminar.');
        }
        if (!codigo) {
          throw new Error('Ingresa el codigo de autorizacion para eliminar.');
        }
        const confirm = await askConfirm('Eliminar tarea', 'Se eliminara la tarea y se revertira el movimiento de stock asociado.');
        if (!confirm) {
          return;
        }
        await api(`/api/asignaciones/${assignmentId}`, {
          method: 'DELETE',
          body: { codigo_autorizacion: codigo }
        });
        clearAssignmentModalForm();
        closeAssignmentModal();
        clearAssignmentControlForm();
        showToast('Tarea eliminada.', 'success');
        syncAfterMutation();
      } catch (error) {
        showToast(error.message, 'error');
      }
    };

    $('#form-assignment-modal').onsubmit = async (event) => {
      event.preventDefault();
      try {
        const payload = getAssignmentFormPayload('assignment-modal');
        if (!payload.assignmentId) {
          throw new Error('Selecciona una tarea para rectificarla.');
        }
        if (!payload.codigo && !canManageTaskBoard()) {
          throw new Error('Ingresa el codigo de autorizacion.');
        }

        await api(`/api/asignaciones/${payload.assignmentId}`, {
          method: 'PUT',
          body: {
            usuario_id: activeUserId(),
            trabajador_id: payload.trabajador_id,
            estado_revision: payload.estado_revision,
            cantidad_realizada: payload.cantidad_realizada,
            revisada: payload.revisada,
            observaciones: payload.observaciones,
            codigo_autorizacion: payload.codigo
          }
        });
        closeAssignmentModal();
        showToast('Tarea rectificada correctamente.', 'success');
        syncAfterMutation();
      } catch (error) {
        showToast(error.message, 'error');
      }
    };

  $('#form-devolucion-bodega').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/traslados/bodega-a-lavanderia', {
        method: 'POST',
        body: {
          bodega_id: Number($('#devolucion-bodega').value),
          prenda_id: Number($('#devolucion-prenda').value),
          estado_destino_id: Number($('#devolucion-estado').value),
          cantidad: Number($('#devolucion-cantidad').value),
          usuario_id: activeUserId(),
          detalle: $('#devolucion-detalle').value
        }
      });
      event.target.reset();
      showToast('Devolucion registrada correctamente.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-externa-salida').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/traslados/a-externa', {
        method: 'POST',
        body: {
          bodega_externa_id: Number($('#externa-bodega-salida').value),
          prenda_id: Number($('#externa-prenda-salida').value),
          estado_origen_id: Number($('#externa-estado-salida').value),
          cantidad: Number($('#externa-cantidad-salida').value),
          usuario_id: activeUserId()
        }
      });
      event.target.reset();
      showToast('Salida a lavanderia externa registrada.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-externa-retorno').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/traslados/externa-a-lavanderia', {
        method: 'POST',
        body: {
          bodega_externa_id: Number($('#externa-bodega-retorno').value),
          prenda_id: Number($('#externa-prenda-retorno').value),
          estado_destino_id: Number($('#externa-estado-retorno').value),
          cantidad: Number($('#externa-cantidad-retorno').value),
          usuario_id: activeUserId()
        }
      });
      event.target.reset();
      showToast('Retorno desde lavanderia externa registrado.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-area').onsubmit = async (event) => {
    try {
      await handleCreate(event, '/api/areas', {
        nombre: $('#area-nombre').value,
        descripcion: $('#area-descripcion').value
      });
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-bodega').onsubmit = async (event) => {
    try {
      await handleCreate(event, '/api/bodegas', {
        nombre: $('#bodega-nombre').value,
        tipo: $('#bodega-tipo').value,
        descripcion: $('#bodega-descripcion').value
      });
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-estado').onsubmit = async (event) => {
    try {
      await handleCreate(event, '/api/estados', {
        codigo: $('#estado-codigo').value,
        nombre: $('#estado-nombre').value,
        orden: Number($('#estado-orden').value),
        cobra: $('#estado-cobra').checked,
        es_final: $('#estado-final').checked,
        color: $('#estado-color').value || '#1c6e61',
        descripcion: $('#estado-descripcion').value
      });
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-prenda').onsubmit = async (event) => {
    try {
      await handleCreate(event, '/api/prendas', {
        nombre: $('#prenda-nombre').value,
        sku: $('#prenda-sku').value,
        area_uso_id: Number($('#prenda-area').value) || null,
        no_planchar: $('#prenda-no-planchar').checked,
        descripcion: $('#prenda-descripcion').value,
        precios: collectPrendaPrices()
      });
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-trabajador').onsubmit = async (event) => {
    try {
      await handleCreate(event, '/api/trabajadores', {
        nombre: $('#trabajador-nombre').value,
        telefono: $('#trabajador-telefono').value,
        factura: $('#trabajador-factura').checked,
        activo: true,
        observaciones: $('#trabajador-observacion').value
      });
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-usuario').onsubmit = async (event) => {
    try {
      await handleCreate(event, '/api/usuarios', {
        nombre: $('#usuario-nombre').value,
        username: $('#usuario-username').value,
        password: $('#usuario-password').value,
        rol: $('#usuario-rol').value,
        bodega_id: Number($('#usuario-bodega').value) || null,
        codigo_autorizacion: $('#usuario-codigo').value,
        activo: true
      });
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#form-precio').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/precios', {
        method: 'POST',
        body: {
          prenda_id: Number($('#precio-prenda').value),
          estado_id: Number($('#precio-estado').value),
          precio_factura: Number($('#precio-factura').value || 0),
          precio_no_factura: Number($('#precio-no-factura').value || 0)
        }
      });
      event.target.reset();
      showToast('Precio guardado correctamente.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  $('#btn-agregar-item').onclick = () => {
    const prendaId = Number($('#pedido-item-prenda').value);
    const cantidad = Number($('#pedido-item-cantidad').value);
    const prenda = findById('prendas', prendaId);
    if (!prenda || !cantidad) {
      showToast('Selecciona una prenda y una cantidad valida.', 'error');
      return;
    }
    state.pedidoItems.push({ prenda_id: prendaId, cantidad, prenda_nombre: prenda.nombre });
    renderOrders();
    showToast('Item agregado al pedido.', 'info');
  };

  $('#form-pedido').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const pedidoPayload = {
        usuario_id: Number($('#pedido-usuario').value),
        fecha_solicitada: $('#pedido-fecha').value,
        horario_solicitado: $('#pedido-horario').value,
        observaciones: $('#pedido-observaciones').value,
        items: state.pedidoItems
      };

      const response = await api('/api/pedidos', {
        method: 'POST',
        body: pedidoPayload
      });
      generateOrderPdf({
        id: response.id,
        usuario_id: pedidoPayload.usuario_id,
        fecha_solicitada: pedidoPayload.fecha_solicitada,
        horario_solicitado: pedidoPayload.horario_solicitado,
        observaciones: pedidoPayload.observaciones,
        detalles: pedidoPayload.items
      });
      state.pedidoItems = [];
      event.target.reset();
      renderOrders();
      showToast('Pedido guardado y PDF generado.', 'success');
      syncAfterMutation();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };
}

async function handleCreate(event, url, body) {
  event.preventDefault();
  setCurrentViewFromNode(event.target);
  state.activeBlock = `#${event.target.id}`;
  const subpanel = event.target.closest('.subpanel');
  if (subpanel) {
    const subgroup = subpanel.id.split('-')[0];
    state.activeSubTabs[subgroup] = subpanel.id;
  }
  await api(url, { method: 'POST', body });
  event.target.reset();
  showToast('Registro guardado correctamente.', 'success');
  syncAfterMutation();
}

async function handleAction(action, button) {
  setCurrentViewFromNode(button);
  const id = button.dataset.id;

  if (action === 'open-picker') {
    const target = document.getElementById(button.dataset.target);
    if (target) {
      target.focus();
      if (target._flatpickr) {
        target._flatpickr.open();
        return;
      }
      if (typeof target.showPicker === 'function') {
        target.showPicker();
      }
    }
    return;
  }

  if (action === 'toggle-sidebar') {
    const panelId = button.dataset.panel;
    state.collapsedSidebars[panelId] = !state.collapsedSidebars[panelId];
    window.sessionStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(state.collapsedSidebars));
    renderWorkspaceShells();
    showToast(state.collapsedSidebars[panelId] ? 'Menu oculto para ampliar el area de trabajo.' : 'Menu mostrado nuevamente.', 'info');
    return;
  }

  if (action === 'remove-order-item') {
    state.pedidoItems.splice(Number(button.dataset.index), 1);
    renderOrders();
    return;
  }

  if (action === 'remove-assignment-draft') {
    state.assignmentDrafts.splice(Number(button.dataset.index), 1);
    renderAssignmentDrafts();
    renderAssignmentFinder();
    updateAssignmentStockInfo();
    showToast('Tarea quitada del carrito.', 'info');
    return;
  }

  if (action === 'pick-assignment-item') {
    $('#asignacion-prenda').value = button.dataset.prenda;
    $('#asignacion-estado-origen').value = button.dataset.estado || '';
    $('#asignacion-prenda-buscar').value = findById('prendas', button.dataset.prenda)?.nombre || '';
    renderAssignmentGarmentOptions();
    renderAssignmentFinder();
    updateAssignmentStockInfo();
    showToast('Prenda cargada al formulario de asignacion.', 'info');
    return;
  }

  if (action === 'pick-order-item') {
    $('#pedido-item-prenda').value = button.dataset.prenda;
    $('#pedido-item-buscar').value = findById('prendas', button.dataset.prenda)?.nombre || '';
    renderOrderGarmentOptions();
    renderOrderFinder();
    showToast('Prenda cargada al pedido.', 'info');
    return;
  }

  if (action === 'pick-task') {
    $('#asignacion-estado-destino').value = button.dataset.task;
    renderAssignmentTasks();
    updateAssignmentStockInfo();
    showToast('Tarea seleccionada.', 'info');
    return;
  }

  if (action === 'select-assignment') {
    loadAssignmentIntoControl(id);
    openAssignmentModal();
    renderAssignments();
    showToast('Tarea abierta en ventana flotante.', 'info');
    return;
  }

  if (action === 'quick-check-assignment') {
    await saveAssignmentControlChanges(
      Number(id),
      {
        estado_revision: 'cumplida',
        cantidad_realizada: Number(getAssignmentById(id)?.cantidad || 0),
        revisada: true
      },
      'Tarea chequeada y marcada como revisada.'
    );
    return;
  }

  if (action === 'dispatch-order') {
    await api(`/api/pedidos/${id}/despachar`, {
      method: 'POST',
      body: { usuario_id: activeUserId() }
    });
    showToast('Pedido despachado.', 'success');
    syncAfterMutation();
    return;
  }

  if (action === 'undo-dispatch-order') {
    const confirm = await askConfirm('Anular despacho completo', 'Se revertira todo el despacho del pedido y regresara el stock a lavanderia.');
    if (!confirm) {
      return;
    }
    await api(`/api/pedidos/${id}/anular-despacho`, {
      method: 'POST',
      body: { usuario_id: activeUserId() }
    });
    showToast('Despacho completo anulado.', 'success');
    syncAfterMutation();
    return;
  }

  if (action === 'undo-dispatch-item') {
    const pedido = (state.data?.pedidos || []).find((item) => Number(item.id) === Number(id));
    if (!pedido) {
      throw new Error('No se encontro el pedido.');
    }

    const opciones = (pedido.detalles || [])
      .filter((item) => Number(item.cantidad_despachada || 0) > 0)
      .map((item) => `id ${item.id}: ${item.prenda_nombre} (despachado ${item.cantidad_despachada})`)
      .join(' | ');

    if (!opciones) {
      throw new Error('El pedido no tiene prendas despachadas para anular.');
    }

    const detalleId = Number(await askText('Anular prenda', `Ingresa el ID de detalle a anular. Opciones: ${opciones}`, '', 'number') || 0);
    if (!detalleId) {
      return;
    }

    const detalle = (pedido.detalles || []).find((item) => Number(item.id) === detalleId);
    if (!detalle) {
      throw new Error('El ID de detalle no pertenece al pedido.');
    }

    const cantidad = Number(await askText('Cantidad a anular', `Maximo despachado: ${detalle.cantidad_despachada}.`, `${detalle.cantidad_despachada || 0}`, 'number') || 0);
    if (!cantidad) {
      return;
    }

    await api(`/api/pedidos/${id}/anular-despacho-item`, {
      method: 'POST',
      body: {
        usuario_id: activeUserId(),
        detalle_id: detalleId,
        cantidad
      }
    });
    showToast('Despacho de prenda anulado.', 'success');
    syncAfterMutation();
    return;
  }

  if (action === 'print-order-pdf') {
    const pedido = (state.data?.pedidos || []).find((item) => Number(item.id) === Number(id));
    if (!pedido) {
      throw new Error('No se encontro el pedido para generar el PDF.');
    }
    generateOrderPdf(pedido);
    showToast('PDF del pedido generado.', 'success');
    return;
  }

  if (action === 'quick-next') {
    const quantity = Number(await askText('Mover al siguiente estado', 'Ingresa la cantidad a mover.', button.dataset.cantidad, 'number') || 0);
    if (!quantity) {
      return;
    }
    await api('/api/asignaciones/avance-rapido', {
      method: 'POST',
      body: {
        prenda_id: Number(button.dataset.prenda),
        estado_origen_id: Number(button.dataset.estado),
        trabajador_id: activeWorkerId(),
        usuario_id: activeUserId(),
        cantidad: quantity,
        observaciones: 'Movimiento rapido'
      }
    });
    showToast('Prenda movida al siguiente estado.', 'success');
    syncAfterMutation();
    return;
  }

  if (action === 'send-reprocess' || action === 'send-desmanche') {
    const target = getCatalog('estados').find((item) => item.codigo === (action === 'send-reprocess' ? 'reproceso' : 'desmanche'));
    const quantity = Number(await askText('Mover prenda', 'Ingresa la cantidad a mover.', button.dataset.cantidad, 'number') || 0);
    if (!target || !quantity) {
      return;
    }
    await api('/api/asignaciones', {
      method: 'POST',
      body: {
        prenda_id: Number(button.dataset.prenda),
        estado_origen_id: Number(button.dataset.estado),
        estado_destino_id: target.id,
        trabajador_id: activeWorkerId(),
        usuario_id: activeUserId(),
        cantidad: quantity,
        observaciones: action === 'send-reprocess' ? 'Enviado a reproceso' : 'Enviado a desmanche'
      }
    });
    showToast(action === 'send-reprocess' ? 'Prenda enviada a reproceso.' : 'Prenda enviada a desmanche.', 'success');
    syncAfterMutation();
    return;
  }

  if (action === 'delete-assignment') {
    const confirm = await askConfirm('Eliminar asignacion', 'Esta accion necesita autorizacion y deshara el movimiento de stock.');
    if (!confirm) {
      return;
    }
    const codigo = await askText('Autorizacion', 'Ingresa el codigo para eliminar la asignacion.');
    if (!codigo) {
      return;
    }
    await api(`/api/asignaciones/${id}`, {
      method: 'DELETE',
      body: { codigo_autorizacion: codigo }
    });
    showToast('Asignacion eliminada.', 'success');
    syncAfterMutation();
    return;
  }

  const map = {
    area: '/api/areas',
    bodega: '/api/bodegas',
    estado: '/api/estados',
    prenda: '/api/prendas',
    trabajador: '/api/trabajadores',
    usuario: '/api/usuarios'
  };

  const matches = action.match(/^(edit|delete)-(area|bodega|estado|prenda|trabajador|usuario)$/);
  if (!matches) {
    return;
  }

  const [, mode, entity] = matches;
  const url = `${map[entity]}/${id}`;

  if (mode === 'delete') {
    const confirm = await askConfirm('Eliminar registro', 'Confirma si deseas eliminar este registro.');
    if (!confirm) {
      return;
    }
    await api(url, { method: 'DELETE' });
    showToast('Registro eliminado correctamente.', 'success');
    syncAfterMutation();
    return;
  }

  await handleEntityEdit(entity, Number(id));
}

async function handleEntityEdit(entity, id) {
  const pluralMap = {
    area: 'areas',
    bodega: 'bodegas',
    estado: 'estados',
    prenda: 'prendas',
    trabajador: 'trabajadores',
    usuario: 'usuarios'
  };
  const item = findById(pluralMap[entity], id);
  if (!item) {
    return;
  }

  if (entity === 'area') {
    const nombre = await askText('Editar area', 'Nombre del area.', item.nombre);
    if (nombre === null) {
      return;
    }
    const descripcion = await askText('Editar area', 'Descripcion del area.', item.descripcion || '');
    await api(`/api/areas/${id}`, {
      method: 'PUT',
      body: {
        nombre,
        descripcion
      }
    });
  }

  if (entity === 'bodega') {
    const nombre = await askText('Editar bodega', 'Nombre de la bodega.', item.nombre);
    if (nombre === null) {
      return;
    }
    const tipo = await askText('Editar bodega', 'Tipo de bodega.', item.tipo);
    const descripcion = await askText('Editar bodega', 'Descripcion.', item.descripcion || '');
    await api(`/api/bodegas/${id}`, {
      method: 'PUT',
      body: {
        nombre,
        tipo,
        descripcion
      }
    });
  }

  if (entity === 'prenda') {
    const nombre = await askText('Editar prenda', 'Nombre de la prenda.', item.nombre);
    if (nombre === null) {
      return;
    }
    const sku = await askText('Editar prenda', 'SKU.', item.sku || '');
    const area_uso_id = await askText('Editar prenda', 'ID de area.', item.area_uso_id || '', 'number');
    const noPlanchar = await askText('Editar prenda', 'No planchar? 1 si / 0 no.', item.no_planchar ? '1' : '0');
    const descripcion = await askText('Editar prenda', 'Descripcion.', item.descripcion || '');
    await api(`/api/prendas/${id}`, {
      method: 'PUT',
      body: {
        nombre,
        sku,
        area_uso_id: Number(area_uso_id) || null,
        no_planchar: (noPlanchar || '0') === '1',
        activa: true,
        descripcion
      }
    });
  }

  if (entity === 'estado') {
    const codigo = await askText('Editar estado', 'Codigo interno.', item.codigo);
    if (codigo === null) {
      return;
    }
    const nombre = await askText('Editar estado', 'Nombre visible.', item.nombre);
    const orden = await askText('Editar estado', 'Orden.', item.orden, 'number');
    const cobra = await askText('Editar estado', 'Cobra? 1 si / 0 no.', item.cobra ? '1' : '0');
    const esFinal = await askText('Editar estado', 'Es final? 1 si / 0 no.', item.es_final ? '1' : '0');
    const color = await askText('Editar estado', 'Color.', item.color || '#1c6e61');
    const descripcion = await askText('Editar estado', 'Descripcion.', item.descripcion || '');
    await api(`/api/estados/${id}`, {
      method: 'PUT',
      body: {
        codigo,
        nombre,
        orden: Number(orden),
        cobra: (cobra || '0') === '1',
        es_final: (esFinal || '0') === '1',
        color,
        descripcion
      }
    });
  }

  if (entity === 'trabajador') {
    const nombre = await askText('Editar trabajador', 'Nombre.', item.nombre);
    if (nombre === null) {
      return;
    }
    const telefono = await askText('Editar trabajador', 'Telefono.', item.telefono || '');
    const factura = await askText('Editar trabajador', 'Factura? 1 si / 0 no.', item.factura ? '1' : '0');
    const observaciones = await askText('Editar trabajador', 'Observaciones.', item.observaciones || '');
    await api(`/api/trabajadores/${id}`, {
      method: 'PUT',
      body: {
        nombre,
        telefono,
        factura: (factura || '0') === '1',
        activo: true,
        observaciones
      }
    });
  }

  if (entity === 'usuario') {
    const nombre = await askText('Editar usuario', 'Nombre.', item.nombre);
    if (nombre === null) {
      return;
    }
    const username = await askText('Editar usuario', 'Username.', item.username);
    const password = await askText('Editar usuario', 'Password.', item.password);
    const rol = await askText('Editar usuario', 'Rol.', item.rol);
    const bodegaId = await askText('Editar usuario', 'ID de bodega.', item.bodega_id || '', 'number');
    const codigo = await askText('Editar usuario', 'Codigo de autorizacion.', item.codigo_autorizacion || '');
    await api(`/api/usuarios/${id}`, {
      method: 'PUT',
      body: {
        nombre,
        username,
        password,
        rol,
        bodega_id: Number(bodegaId) || null,
        codigo_autorizacion: codigo,
        activo: true
      }
    });
  }

  showToast('Registro actualizado correctamente.', 'success');
  syncAfterMutation();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  handleAction(button.dataset.action, button).catch((error) => showToast(error.message, 'error'));
});

socket.on('datos-actualizados', (payload) => {
  rememberCurrentView();
  state.lastSocketAt = Date.now();
  if (Date.now() < state.ignoreSocketUntil) {
    return;
  }
  state.data = payload;
  renderAll();
});

setupForms();
loadData().catch((error) => {
  showToast(`${error.message} API esperada: ${API_ORIGIN}`, 'error');
});

