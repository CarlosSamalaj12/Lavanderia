/**
 * Módulo de Navegación, Rutas de Secciones y Control de Menú Móvil
 * Módulo ES6 con compatibilidad global
 */

let tareasAutoRefresh = null;

export function showSection(section) {
  if (typeof window.canAccessSection === 'function' && !window.canAccessSection(section)) {
    if (typeof window.showWarning === 'function') {
      window.showWarning('Tu rol solo tiene acceso a Pedidos.');
    }
    section = 'pedidos';
  }

  const currentUser = window.user || {};
  if (section === 'branding' && currentUser.rol !== 'admin') {
    if (typeof window.showError === 'function') {
      window.showError('Solo el administrador puede acceder a Branding');
    }
    section = 'dashboard';
  }

  document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
  const targetContent = document.getElementById(section);
  if (targetContent) targetContent.classList.add('active');
  window.currentSection = section;

  updateMobileNavActive(section);

  // Despachar carga de datos según la sección
  if (section === 'dashboard' && typeof window.loadDashboard === 'function') window.loadDashboard();
  if (section === 'procesos' && typeof window.loadProcesos === 'function') window.loadProcesos();
  if (section === 'tareas') {
    if (typeof window.obtenerPrendasCache === 'function') window.obtenerPrendasCache();
    if (typeof window.loadTareasForm === 'function') window.loadTareasForm();
  }
  if (section === 'pedidos') {
    if (typeof window.obtenerPrendasCache === 'function') window.obtenerPrendasCache();
    if (typeof window.loadPedidos === 'function') window.loadPedidos();
  }
  if (section === 'devoluciones' && typeof window.loadDevoluciones === 'function') window.loadDevoluciones();
  if (section === 'externa') {
    if (typeof window.obtenerPrendasCache === 'function') window.obtenerPrendasCache();
    if (typeof window.loadLavanderiaExterna === 'function') window.loadLavanderiaExterna();
  }
  if (section === 'departamentos' && typeof window.loadDepartamentos === 'function') window.loadDepartamentos();
  if (section === 'prendas' && typeof window.loadPrendas === 'function') window.loadPrendas();
  if (section === 'trabajadores' && typeof window.loadTrabajadores === 'function') window.loadTrabajadores();
  if (section === 'trabajadores-internos' && typeof window.loadTrabajadoresInternos === 'function') window.loadTrabajadoresInternos();
  if (section === 'usuarios' && typeof window.loadUsuarios === 'function') window.loadUsuarios();
  if (section === 'branding' && typeof window.cargarPreviewLogos === 'function') window.cargarPreviewLogos();
  if (section === 'reportes') {
    if (typeof window.obtenerPrendasCache === 'function') window.obtenerPrendasCache();
    if (typeof window.loadFiltrosReporte === 'function') window.loadFiltrosReporte();
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabPedidos = document.getElementById('tab-pedidos');
    if (tabPedidos) tabPedidos.classList.add('active');
    if (typeof window.reporte === 'function') window.reporte('pedidos');
  }

  // Auto-refresco en tareas
  if (tareasAutoRefresh) {
    clearInterval(tareasAutoRefresh);
    tareasAutoRefresh = null;
  }
  if (section === 'tareas') {
    tareasAutoRefresh = setInterval(() => {
      if (window.currentSection === 'tareas' && typeof window.loadTareasActivas === 'function') {
        window.loadTareasActivas();
      }
    }, 20000);
  }
}

export function updateMobileNavActive(section) {
  const tabs = document.querySelectorAll('.mobile-nav-item');
  tabs.forEach(tab => {
    if (tab.dataset.section === section) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

export function toggleMobileDrawer(open) {
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  if (!backdrop) return;
  const shouldOpen = (open !== undefined) ? !!open : !backdrop.classList.contains('show');

  if (shouldOpen) {
    const currentUser = window.user;
    if (currentUser) {
      const userName = currentUser.nombre || currentUser.username || 'Operador';
      const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const avatarEl = document.getElementById('drawerUserInitials');
      const nameEl = document.getElementById('drawerUserName');
      const deptEl = document.getElementById('drawerUserDept');
      const navDept = document.getElementById('userDeptoNav');

      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = userName;
      if (deptEl) deptEl.textContent = (navDept && navDept.textContent) ? navDept.textContent : (currentUser.rol || 'Lavandería');

      const brandingItem = document.getElementById('drawerBrandingItem');
      if (brandingItem) {
        brandingItem.style.display = (currentUser.rol === 'admin') ? '' : 'none';
      }
    }
    backdrop.classList.add('show');
  } else {
    backdrop.classList.remove('show');
  }
}

export function refreshCurrentSection() {
  if (!window.token) return;
  showSection(window.currentSection || 'dashboard');
  if (typeof window.showInfo === 'function') window.showInfo('Sección recargada');
}

export function triggerPrimaryAction() {
  const candidates = Array.from(document.querySelectorAll('button')).filter(btn => {
    const style = window.getComputedStyle(btn);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && !btn.disabled;
    if (!visible) return false;
    const text = (btn.textContent || '').toLowerCase();
    return text.includes('guardar') || text.includes('crear') || text.includes('asignar') || text.includes('aplicar');
  });
  if (candidates.length) {
    candidates[0].click();
    if (typeof window.showInfo === 'function') window.showInfo('Acción principal ejecutada (Ctrl+S)');
  } else {
    if (typeof window.showWarning === 'function') window.showWarning('No se encontró acción para guardar en esta vista');
  }
}

// Configuración de atajos de teclado globales
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (typeof window.closeShortcutsHelp === 'function') window.closeShortcutsHelp();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (window.token) triggerPrimaryAction();
      return;
    }

    if (!window.token) return;

    switch (event.key) {
      case 'F1':
        event.preventDefault();
        const modal = document.getElementById('shortcutModal');
        if (modal && modal.classList.contains('open')) {
          if (typeof window.closeShortcutsHelp === 'function') window.closeShortcutsHelp();
        } else {
          if (typeof window.openShortcutsHelp === 'function') window.openShortcutsHelp();
        }
        break;
      case 'F2':
        event.preventDefault();
        showSection('dashboard');
        break;
      case 'F3':
        event.preventDefault();
        showSection('procesos');
        break;
      case 'F4':
        event.preventDefault();
        showSection('tareas');
        break;
      case 'F6':
        event.preventDefault();
        showSection('pedidos');
        break;
      case 'F7':
        event.preventDefault();
        showSection('devoluciones');
        break;
      case 'F8':
        event.preventDefault();
        showSection('reportes');
        break;
      case 'F9':
        event.preventDefault();
        refreshCurrentSection();
        break;
      case 'F10':
        event.preventDefault();
        if (typeof window.logout === 'function') window.logout();
        break;
      default:
        break;
    }
  });
}

// Exposición global a window
Object.assign(window, {
  showSection,
  updateMobileNavActive,
  toggleMobileDrawer,
  refreshCurrentSection,
  triggerPrimaryAction,
  initKeyboardShortcuts
});
