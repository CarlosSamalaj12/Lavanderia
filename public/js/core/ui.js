/**
 * UI Core: Notificaciones Toast, Diálogos Modales, Formateadores y Control de Marca
 * Módulo ES6 con compatibilidad global
 */

const TIMEZONE = 'America/Guatemala';

// Formateo de moneda en Quetzales Guatemaltecos
export function formatCurrency(amount) {
  return 'Q ' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Formateo de fecha con zona horaria de Guatemala
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-GT', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Formateo de fecha y hora completa
export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('es-GT', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Actualizar reloj en tiempo real
export function updateGuatemalaTime() {
  const now = new Date();
  const gtFecha = now.toLocaleDateString('es-GT', {
    timeZone: TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const gtHora = now.toLocaleTimeString('es-GT', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const navTime = document.getElementById('nav-time');
  if (navTime) navTime.textContent = `Guatemala | ${gtFecha} | ${gtHora}`;
}

// Sistema de Notificaciones Toast
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toasts = container.querySelectorAll('.toast');
  if (toasts.length >= 2) {
    toasts[0].remove();
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()" aria-label="Cerrar">&times;</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 2400);
}

export function showSuccess(msg) { showToast(msg, 'success'); }
export function showError(msg) { showToast(msg, 'error'); }
export function showWarning(msg) { showToast(msg, 'warning'); }
export function showInfo(msg) { showToast(msg, 'info'); }

// Diálogo de Confirmación Dinámico
const uiDialogState = { resolver: null, mode: 'confirm' };

export function closeUiDialog(result) {
  const overlay = document.getElementById('uiDialog');
  const input = document.getElementById('uiDialogInput');
  if (overlay) overlay.classList.remove('show');
  if (input) {
    input.value = '';
    input.style.display = 'none';
  }
  if (uiDialogState.resolver) {
    const resolve = uiDialogState.resolver;
    uiDialogState.resolver = null;
    resolve(result);
  }
}

export function getDialogTone({ title, message, tone }) {
  if (tone) return tone;
  const text = `${title || ''} ${message || ''}`.toLowerCase();
  if (/eliminar|anular|cancelar|riesgo|permanente/.test(text)) return 'danger';
  if (/atencion|advertencia|warning|confirmar/.test(text)) return 'warning';
  return 'info';
}

export function resolveDialogConfirmLabel({ mode, title, message, confirmLabel }) {
  if (confirmLabel) return confirmLabel;
  if (mode === 'prompt') return 'Continuar';
  const text = `${title || ''} ${message || ''}`.toLowerCase();
  if (/eliminar/.test(text)) return 'Eliminar';
  if (/anular/.test(text)) return 'Anular';
  if (/cancelar/.test(text)) return 'Cancelar';
  return 'Aceptar';
}

export function showUiDialog({ title, message, mode = 'confirm', defaultValue = '', placeholder = '', tone = '', confirmLabel = '', cancelLabel = 'Cancelar' }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('uiDialog');
    const card = overlay ? overlay.querySelector('.dialog-card') : null;
    const titleEl = document.getElementById('uiDialogTitle');
    const iconEl = document.getElementById('uiDialogIcon');
    const messageEl = document.getElementById('uiDialogMessage');
    const input = document.getElementById('uiDialogInput');
    const btnCancel = document.getElementById('uiDialogCancel');
    const btnConfirm = document.getElementById('uiDialogConfirm');
    if (!overlay || !card || !titleEl || !iconEl || !messageEl || !input || !btnCancel || !btnConfirm) {
      resolve(mode === 'prompt' ? null : false);
      return;
    }

    uiDialogState.mode = mode;
    uiDialogState.resolver = resolve;
    const dialogTone = getDialogTone({ title, message, tone });
    titleEl.textContent = title || 'Confirmar';
    messageEl.textContent = message || '';
    card.classList.remove('danger', 'warning', 'info');
    card.classList.add(dialogTone);
    iconEl.className = `dialog-icon ${dialogTone} mi`;
    iconEl.textContent = dialogTone === 'danger' ? 'dangerous' : dialogTone === 'warning' ? 'warning' : 'info';

    if (mode === 'prompt') {
      input.style.display = 'block';
      input.value = defaultValue || '';
      input.placeholder = placeholder || '';
    } else {
      input.style.display = 'none';
    }

    btnConfirm.textContent = resolveDialogConfirmLabel({ mode, title, message, confirmLabel });
    btnCancel.textContent = cancelLabel || 'Cancelar';

    btnConfirm.classList.remove('btn-success', 'btn-warning', 'btn-danger', 'btn-primary');
    btnConfirm.classList.add(dialogTone === 'danger' ? 'btn-danger' : dialogTone === 'warning' ? 'btn-warning' : 'btn-primary');

    btnCancel.onclick = () => closeUiDialog(mode === 'prompt' ? null : false);
    btnConfirm.onclick = () => {
      if (mode === 'prompt') {
        closeUiDialog(input.value);
      } else {
        closeUiDialog(true);
      }
    };

    overlay.classList.add('show');
    setTimeout(() => {
      if (mode === 'prompt') input.focus();
      else btnConfirm.focus();
    }, 0);
  });
}

export async function confirmDialog(message, title = 'Confirmar acción', tone = '', confirmLabel = '', cancelLabel = 'Cancelar') {
  return showUiDialog({ title, message, mode: 'confirm', tone, confirmLabel, cancelLabel });
}

export async function promptDialog(message, defaultValue = '', title = 'Ingresa un valor', placeholder = '', tone = '', confirmLabel = 'Continuar', cancelLabel = 'Cancelar') {
  return showUiDialog({ title, message, mode: 'prompt', defaultValue, placeholder, tone, confirmLabel, cancelLabel });
}

export function focusField(fieldId, message, type = 'warning') {
  const el = document.getElementById(fieldId);
  if (!el) {
    if (message) (type === 'error' ? showError(message) : showWarning(message));
    return;
  }
  if (message) (type === 'error' ? showError(message) : showWarning(message));
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  el.classList.add('field-attention');
  setTimeout(() => el.classList.remove('field-attention'), 900);
}

// Validación de Campos
export function showFieldError(fieldId, show = true) {
  const el = document.getElementById(`error-${fieldId}`);
  const input = document.getElementById(fieldId === 'trabajador' ? 'buscarTrabajadorTarea' : 
    fieldId === 'proceso' ? 'tareaProceso' : 
    fieldId === 'prenda' ? 'buscarPrenda' : 'cantidadPrenda');
  if (el) el.style.display = show ? 'block' : 'none';
  if (input) input.classList.toggle('error', show);

  if (show && fieldId === 'trabajador') {
    const box = document.getElementById('resultadosTrabajadorTarea');
    if (input) input.focus();
    if (typeof window.buscarTrabajadoresTarea === 'function') window.buscarTrabajadoresTarea();
    if (box) box.style.display = 'block';
  }

  if (show && fieldId === 'prenda') {
    const box = document.getElementById('busquedaRapidaTarea');
    if (input) input.focus();
    if (typeof window.buscarPrendasTarea === 'function') window.buscarPrendasTarea();
    if (box) box.style.display = 'block';
  }
}

export function clearFieldErrors() {
  ['trabajador', 'proceso', 'prenda', 'cantidad'].forEach(id => showFieldError(id, false));
}

// Navegación con teclado en listas desplegables
const searchNavState = {};

export function resetSearchNav(resultsId) {
  searchNavState[resultsId] = -1;
}

export function getSearchItems(resultsId) {
  return Array.from(document.querySelectorAll(`#${resultsId} .search-result-item`));
}

export function setActiveSearchItem(resultsId, index) {
  const items = getSearchItems(resultsId);
  items.forEach((el) => el.classList.remove('active'));
  if (!items.length) {
    searchNavState[resultsId] = -1;
    return;
  }
  const safeIndex = Math.max(0, Math.min(index, items.length - 1));
  items[safeIndex].classList.add('active');
  items[safeIndex].scrollIntoView({ block: 'nearest' });
  searchNavState[resultsId] = safeIndex;
}

export function bindSearchKeyboard(inputId, resultsId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.keyNavBound === '1') return;
  input.addEventListener('keydown', (event) => {
    const box = document.getElementById(resultsId);
    if (!box || box.style.display === 'none') return;
    const items = getSearchItems(resultsId);
    if (!items.length) return;

    const current = Number.isInteger(searchNavState[resultsId]) ? searchNavState[resultsId] : -1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchItem(resultsId, current + 1 < items.length ? current + 1 : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchItem(resultsId, current - 1 >= 0 ? current - 1 : items.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const idx = current >= 0 ? current : 0;
      if (items[idx]) items[idx].click();
      return;
    }
    if (event.key === 'Tab') {
      const idx = current >= 0 ? current : 0;
      if (items[idx]) items[idx].click();
      box.style.display = 'none';
      resetSearchNav(resultsId);
      return;
    }
    if (event.key === 'Escape') {
      box.style.display = 'none';
      resetSearchNav(resultsId);
    }
  });
  input.dataset.keyNavBound = '1';
  resetSearchNav(resultsId);
}

export function setSearchCounter(counterId, shown, total) {
  const el = document.getElementById(counterId);
  if (!el) return;
  if (!shown && !total) {
    el.textContent = '';
    return;
  }
  el.textContent = `${shown}/${total} resultados`;
}

// Búsqueda en caché y utilidades
export function resolverCoincidenciaPorNombre(lista, texto) {
  const value = (texto || '').trim().toLowerCase();
  if (!value) return null;
  const exacto = (lista || []).find(p => (p.nombre || '').toLowerCase() === value);
  if (exacto) return exacto;
  const parciales = (lista || []).filter(p => (p.nombre || '').toLowerCase().includes(value));
  return parciales.length === 1 ? parciales[0] : null;
}

// Flatpickr inicializador
export function initCustomDatePickers() {
  if (typeof flatpickr === 'undefined') return;
  flatpickr.localize(flatpickr.l10ns.es);

  flatpickr("input[type='date']", {
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd M Y',
    disableMobile: true,
    allowInput: true
  });

  flatpickr("input[type='time']", {
    enableTime: true,
    noCalendar: true,
    dateFormat: 'H:i',
    time_24hr: true,
    disableMobile: true,
    allowInput: true
  });

  flatpickr("input[type='datetime-local']", {
    enableTime: true,
    dateFormat: 'Y-m-d\\TH:i',
    altInput: true,
    altFormat: 'd M Y H:i',
    time_24hr: true,
    disableMobile: true,
    allowInput: true
  });
}

// Control de Branding y Logos
export function applyAppLogo() {
  const logo = localStorage.getItem('app_logo_base64');
  const img = document.getElementById('appLogoNav');
  const fallback = document.getElementById('appLogoFallback');
  if (!img || !fallback) return;
  if (logo) {
    img.src = logo;
    img.style.display = 'inline-block';
    fallback.style.display = 'none';
  } else {
    img.src = './Logo Blanco app.png';
    img.style.display = 'inline-block';
    fallback.style.display = 'none';
  }
}

export function cargarPreviewLogos() {
  const appLogo = localStorage.getItem('app_logo_base64');
  const printLogo = localStorage.getItem('print_logo_base64');
  const appPreview = document.getElementById('logoAppPreview');
  const printPreview = document.getElementById('logoPrintPreview');
  if (appPreview) {
    if (appLogo) {
      appPreview.src = appLogo;
      appPreview.style.display = 'inline-block';
    } else {
      appPreview.style.display = 'none';
    }
  }
  if (printPreview) {
    if (printLogo) {
      printPreview.src = printLogo;
      printPreview.style.display = 'inline-block';
    } else {
      printPreview.style.display = 'none';
    }
  }
  applyAppLogo();
}

export function guardarLogo(inputId, storageKey, previewId, fileNameId) {
  const input = document.getElementById(inputId);
  const file = input?.files?.[0];
  if (!file) return;
  const fileName = document.getElementById(fileNameId);
  if (fileName) fileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    localStorage.setItem(storageKey, e.target.result);
    const preview = document.getElementById(previewId);
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = 'inline-block';
    }
    applyAppLogo();
    showSuccess('Logo guardado correctamente');
  };
  reader.readAsDataURL(file);
}

export function limpiarLogo(storageKey, previewId, inputId, fileNameId) {
  localStorage.removeItem(storageKey);
  const preview = document.getElementById(previewId);
  const input = document.getElementById(inputId);
  const fileName = document.getElementById(fileNameId);
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (input) input.value = '';
  if (fileName) fileName.textContent = 'Ningun archivo seleccionado';
  applyAppLogo();
  showInfo('Logo removido');
}

export function setupDropZone(dropId, inputId, storageKey, previewId, fileNameId) {
  const dropZone = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  if (!dropZone || !input) return;

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      prevent(e);
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      prevent(e);
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Solo se permiten imágenes');
      return;
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    guardarLogo(inputId, storageKey, previewId, fileNameId);
  });
}

// Modal de Atajos de Teclado
export function openShortcutsHelp() {
  const modal = document.getElementById('shortcutModal');
  if (modal) modal.classList.add('open');
}

export function closeShortcutsHelp() {
  const modal = document.getElementById('shortcutModal');
  if (modal) modal.classList.remove('open');
}

// Exposición global a window para eventos inline HTML
Object.assign(window, {
  formatCurrency,
  formatDate,
  formatDateTime,
  updateGuatemalaTime,
  showToast,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  closeUiDialog,
  getDialogTone,
  resolveDialogConfirmLabel,
  showUiDialog,
  confirmDialog,
  promptDialog,
  focusField,
  showFieldError,
  clearFieldErrors,
  resetSearchNav,
  getSearchItems,
  setActiveSearchItem,
  bindSearchKeyboard,
  setSearchCounter,
  resolverCoincidenciaPorNombre,
  initCustomDatePickers,
  applyAppLogo,
  cargarPreviewLogos,
  guardarLogo,
  limpiarLogo,
  setupDropZone,
  openShortcutsHelp,
  closeShortcutsHelp
});
