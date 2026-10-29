/**
 * Módulo de Autenticación, Sesión y Control de Roles
 * Módulo ES6 con compatibilidad global
 */

export async function login() {
  const username = (document.getElementById('username')?.value || '').trim();
  const password = (document.getElementById('password')?.value || '').trim();

  if (!username || !password) {
    if (typeof window.showError === 'function') {
      window.showError('Ingresa usuario y contraseña');
    }
    return;
  }

  try {
    const res = await fetch(window.buildApiUrl ? window.buildApiUrl('auth/login') : `/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al iniciar sesión');

    window.token = data.token;
    window.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    if (typeof window.showSuccess === 'function') {
      window.showSuccess(`¡Bienvenido ${data.user.nombre || data.user.username}!`);
    }
    showApp();
  } catch (err) {
    if (typeof window.showError === 'function') {
      window.showError(err.message || 'Error al iniciar sesión');
    }
  }
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.token = null;
  window.user = null;

  const loginSection = document.getElementById('loginSection');
  const nav = document.getElementById('nav');
  const mobileNav = document.getElementById('mobileBottomNav');

  document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
  if (nav) nav.style.display = 'none';
  if (mobileNav) mobileNav.style.display = 'none';
  if (loginSection) loginSection.style.display = 'block';

  location.reload();
}

export function verificarToken() {
  const currentToken = window.token || localStorage.getItem('token');
  if (!currentToken) {
    logout();
    return;
  }

  fetch(window.buildApiUrl ? window.buildApiUrl('auth/verify') : `/api/auth/verify`, {
    headers: { 'x-access-token': currentToken },
    cache: 'no-store'
  })
    .then(async res => {
      if (res.status === 401 || res.status === 403 || !res.ok) {
        throw new Error('Sesión no válida o expirada');
      }
      return res.json();
    })
    .then(data => {
      if (!data || !data.user) {
        throw new Error('Estructura de usuario no válida');
      }
      window.user = data.user;
      window.token = currentToken;
      localStorage.setItem('user', JSON.stringify(data.user));
      showApp();
    })
    .catch((err) => {
      console.warn('Verificación de sesión fallida:', err.message);
      logout();
    });
}

export function showApp() {
  const loginSection = document.getElementById('loginSection');
  const nav = document.getElementById('nav');
  const mobileNav = document.getElementById('mobileBottomNav');

  if (loginSection) loginSection.style.display = 'none';
  if (nav) nav.style.display = 'flex';
  if (mobileNav) mobileNav.style.display = 'flex';

  const currentUser = window.user || {};
  const brandingMenu = document.getElementById('menuBranding');
  if (brandingMenu) {
    brandingMenu.style.display = currentUser.rol === 'admin' ? '' : 'none';
  }

  applyRoleUiRestrictions();

  // Actualizar datos del usuario en la barra
  const userName = currentUser.nombre || currentUser.username || 'Usuario';
  const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const initialsEl = document.getElementById('userInitials');
  const userNameEl = document.getElementById('userNameNav');
  const userDeptoEl = document.getElementById('userDeptoNav');

  if (initialsEl) initialsEl.textContent = initials;
  if (userNameEl) userNameEl.textContent = userName;

  if (currentUser.departamento_id) {
    fetch(`${window.API}/departamentos/${currentUser.departamento_id}`, {
      headers: { 'x-access-token': window.token }
    })
      .then(res => res.json())
      .then(dept => {
        if (userDeptoEl) userDeptoEl.textContent = dept.nombre || 'Departamento';
      })
      .catch(() => {
        if (userDeptoEl) userDeptoEl.textContent = 'Sin asignar';
      });
  } else {
    if (userDeptoEl) userDeptoEl.textContent = 'Sin departamento';
  }

  if (typeof window.showSection === 'function') {
    window.showSection(currentUser.rol === 'solicitante' ? 'pedidos' : 'dashboard');
  }
}

export function canAccessSection(section) {
  const currentUser = window.user || {};
  if (currentUser.rol !== 'solicitante') return true;
  return section === 'pedidos';
}

export function applyRoleUiRestrictions() {
  const currentUser = window.user || {};

  if (currentUser.rol === 'reportes') {
    const bloqueados = [
      'button[onclick="showPrendaModal()"]',
      'button[onclick="showDepartamentoModal()"]',
      'button[onclick="showUsuarioModal()"]',
      '#formTarea button[type="submit"]',
      '#btnAgregarPrendaTarea'
    ];
    bloqueados.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.display = 'none';
    });

    const rolSelect = document.getElementById('usuarioRol');
    if (rolSelect) {
      const adminOpt = rolSelect.querySelector('option[value="admin"]');
      if (adminOpt) adminOpt.style.display = 'none';
    }
    return;
  }

  if (currentUser.rol !== 'solicitante') return;

  const mobNav = document.getElementById('mobileBottomNav');
  if (mobNav) {
    const tareasTab = mobNav.querySelector('[data-section="tareas"]');
    const dashTab = mobNav.querySelector('[data-section="dashboard"]');
    if (tareasTab) tareasTab.style.display = 'none';
    if (dashTab) dashTab.style.display = 'none';
  }

  const sectionsToHide = [
    'dashboard', 'procesos', 'tareas', 'devoluciones', 'externa',
    'departamentos', 'prendas', 'trabajadores', 'trabajadores-internos',
    'usuarios', 'branding', 'reportes'
  ];

  sectionsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const navClickable = document.querySelectorAll('[onclick*="showSection("]');
  navClickable.forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    const match = onclick.match(/showSection\('([^']+)'\)/);
    if (match && match[1] !== 'pedidos') {
      el.style.display = 'none';
    }
  });
}

// Exposición global
Object.assign(window, {
  login,
  logout,
  showApp,
  canAccessSection,
  applyRoleUiRestrictions,
  verificarToken
});
