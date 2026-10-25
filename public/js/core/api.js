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

// Sincronizar en window para retrocompatibilidad
window.API = API;
window.buildApiUrl = buildApiUrl;
