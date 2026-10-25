/**
 * Estado Global Reactivo de la Aplicación
 * Módulo ES6 con persistencia local y sincronización con window
 */

export const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  prendasCacheGlobal: [],
  trabajadoresCacheGlobal: [],
  departamentosCacheGlobal: [],
  carritoPedido: [],
  prendasTarea: [],
  prendasCatalogoTarea: [],
  prendaSeleccionadaTarea: null,
  prendaSeleccionadaPedido: null,
  prendaReporteSeleccionada: null,
  reporteStockVista: 'ejecutiva',
  searchNavState: {},
  editandoId: null,
  selectedWorkerForDetail: null,
  currentSection: 'dashboard',
  prendaSeleccionada_externa: null
};

// Cargar usuario persistido
try {
  const cachedUser = localStorage.getItem('user');
  if (cachedUser) {
    state.user = JSON.parse(cachedUser);
  }
} catch (_) {
  state.user = null;
}

// Sincronizar en el scope global (window) para compatibilidad
Object.assign(window, state);
window.appState = state;
