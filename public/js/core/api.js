/**
 * Cliente API y Generador de Endpoints
 * Módulo ES6 con detección automática de origen
 */

export const API = (() => {
  const configuredApi = (localStorage.getItem('api_base_url') || '').trim();
  if (configuredApi) {
    try {
      const parsed = new URL(configuredApi);
      if (['localhost', '127.0.0.1'].includes(parsed.hostname) && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        localStorage.removeItem('api_base_url');
      } else {
        return parsed.toString().replace(/\/+$/, '');
      }
    } catch (_) {
      localStorage.removeItem('api_base_url');
    }
  }

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalhost && window.location.port && window.location.port !== '3100') {
    return `${window.location.protocol}//${window.location.hostname}:3100/api`;
  }

  return `${window.location.origin}/api`;
})();

export function buildApiUrl(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${API}/${cleanPath}`;
}

let isSessionExpiredNotified = false;

export async function apiFetch(pathOrUrl, options = {}) {
  const isFullUrl = /^https?:\/\//i.test(pathOrUrl);
  const url = isFullUrl ? pathOrUrl : buildApiUrl(pathOrUrl);
  const token = window.token || localStorage.getItem('token');

  const headers = {
    ...(options.headers || {})
  };

  if (token && !headers['x-access-token'] && !headers['Authorization']) {
    headers['x-access-token'] = token;
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    // Si no es el endpoint de login y no hemos notificado ya
    if (!url.includes('/auth/login') && !isSessionExpiredNotified) {
      isSessionExpiredNotified = true;
      if (typeof window.showError === 'function') {
        window.showError('Tu sesión ha expirado o no es válida. Redirigiendo al inicio de sesión...');
      }
      setTimeout(() => {
        if (typeof window.logout === 'function') {
          window.logout();
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.token = null;
          window.user = null;
          location.reload();
        }
      }, 1800);
    }
  }

  return res;
}

export async function apiFetchJson(pathOrUrl, options = {}) {
  const res = await apiFetch(pathOrUrl, options);
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new Error(`El servidor respondió con código ${res.status}`);
    }
    throw new Error('La respuesta del servidor no tiene formato JSON válido');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Error del servidor (${res.status})`);
  }
  return data;
}

// Sincronizar en window para retrocompatibilidad
window.API = API;
window.buildApiUrl = buildApiUrl;
window.apiFetch = apiFetch;
window.apiFetchJson = apiFetchJson;
