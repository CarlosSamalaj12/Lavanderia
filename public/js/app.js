/**
 * Punto de entrada principal de la aplicación frontend (ES Modules)
 * Centraliza imports de módulos, escuchadores globales, reloj, Service Worker y autenticación
 */

import { state } from './core/state.js';
import { API, buildApiUrl } from './core/api.js';
import {
  updateGuatemalaTime,
  cargarPreviewLogos,
  setupDropZone,
  bindSearchKeyboard,
  initCustomDatePickers,
  openShortcutsHelp,
  applyAppLogo
} from './core/ui.js';
import { login, verificarToken } from './modules/auth.js';
import {
  showSection,
  refreshCurrentSection,
  triggerPrimaryAction,
  initKeyboardShortcuts,
  toggleMobileDrawer
} from './modules/navigation.js';

// Cargar módulos para registrar controladores operativos en el scope global
import './modules/dashboard.js';
import './modules/procesos.js';
import './modules/tareas.js';
import './modules/pedidos.js';
import './modules/devoluciones.js';
import './modules/externa.js';
import './modules/catalogos.js';
import './modules/reportes.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializar reloj y logos de marca
  setInterval(updateGuatemalaTime, 1000);
  updateGuatemalaTime();
  applyAppLogo();
  cargarPreviewLogos();

  // 2. Drag & Drop de logos en sección Branding
  setupDropZone('logoAppDrop', 'logoAppInput', 'app_logo_base64', 'logoAppPreview', 'logoAppFileName');
  setupDropZone('logoPrintDrop', 'logoPrintInput', 'print_logo_base64', 'logoPrintPreview', 'logoPrintFileName');

  // 3. Vincular navegación por teclado en buscadores
  bindSearchKeyboard('buscarTrabajadorTarea', 'resultadosTrabajadorTarea');
  bindSearchKeyboard('buscarPrenda', 'busquedaRapidaTarea');
  bindSearchKeyboard('buscarPrendaPedido', 'resultadosPrendaPedido');
  bindSearchKeyboard('buscarPrenda_externa', 'resultadosPrendas_externa');
  bindSearchKeyboard('reporteBuscarPrenda', 'reportePrendaResultados');

  // 4. Inicializar Flatpickr en selectores de fecha
  initCustomDatePickers();

  // 5. Vincular formulario y campos de login
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', login);
  }

  const togglePasswordBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  const togglePasswordIcon = document.getElementById('togglePasswordIcon');

  if (togglePasswordBtn && passwordInput && togglePasswordIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const showPassword = passwordInput.type === 'password';
      passwordInput.type = showPassword ? 'text' : 'password';
      togglePasswordBtn.classList.toggle('active', showPassword);
      togglePasswordIcon.textContent = showPassword ? 'visibility_off' : 'visibility';
      togglePasswordBtn.setAttribute('aria-label', showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }

  const usernameInput = document.getElementById('username');
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });
  }
  if (usernameInput) {
    usernameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });
  }

  // 6. Cerrar menús de resultados al hacer clic fuera
  document.addEventListener('click', (e) => {
    const prendaInput = document.getElementById('buscarPrenda');
    const resultsContainer = document.getElementById('resultadosPrendaTarea');
    if (prendaInput && resultsContainer) {
      const searchContainer = prendaInput.parentElement;
      if (searchContainer && !searchContainer.contains(e.target) && !resultsContainer.contains(e.target)) {
        resultsContainer.style.display = 'none';
      }
    }

    const trabajadorInput = document.getElementById('buscarTrabajadorTarea');
    const trabajadorResultados = document.getElementById('resultadosTrabajadorTarea');
    if (trabajadorInput && trabajadorResultados) {
      const trabajadorWrap = trabajadorInput.parentElement;
      if (trabajadorWrap && !trabajadorWrap.contains(e.target)) {
        trabajadorResultados.style.display = 'none';
      }
    }

    const reporteInput = document.getElementById('reporteBuscarPrenda');
    const reporteResultados = document.getElementById('reportePrendaResultados');
    if (reporteInput && reporteResultados) {
      const reporteWrap = document.getElementById('filtroPrendaWrap');
      if (reporteWrap && !reporteWrap.contains(e.target)) {
        reporteResultados.style.display = 'none';
      }
    }

    const pedidoInput = document.getElementById('buscarPrendaPedido');
    const pedidoResultados = document.getElementById('resultadosPrendaPedido');
    if (pedidoInput && pedidoResultados) {
      const pedidoWrap = pedidoInput.parentElement;
      if (pedidoWrap && !pedidoWrap.contains(e.target) && !pedidoResultados.contains(e.target)) {
        pedidoResultados.style.display = 'none';
      }
    }

    const externaInput = document.getElementById('buscarPrenda_externa');
    const externaResultados = document.getElementById('resultadosPrendas_externa');
    if (externaInput && externaResultados) {
      const externaWrap = externaInput.parentElement;
      if (externaWrap && !externaWrap.contains(e.target)) {
        externaResultados.style.display = 'none';
      }
    }
  });

  // 7. Atajos de teclado para navegación rápida
  initKeyboardShortcuts();

  document.addEventListener('keydown', (e) => {
    if (!window.token) return;
    const activeEl = document.activeElement;
    const isInput = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);

    if (e.key === '?' && !isInput) {
      e.preventDefault();
      openShortcutsHelp();
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const sectionMap = {
        '1': 'dashboard',
        '2': 'procesos',
        '3': 'tareas',
        '4': 'pedidos',
        '5': 'devoluciones',
        '6': 'externa',
        '7': 'reportes'
      };
      if (sectionMap[e.key]) {
        e.preventDefault();
        showSection(sectionMap[e.key]);
        return;
      }
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      triggerPrimaryAction();
    }
  });

  // 8. Verificar token existente y reanudar sesión
  if (window.token) {
    verificarToken();
  }

  // 9. Registrar Service Worker PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Registro de Service Worker ignorado:', err);
    });
  }

  console.log('Sistema de Lavandería: Arquitectura ES Modules inicializada.');
});
