/**
 * Módulo de Pedidos, Catálogo Interactivo, Carrito y Despacho
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
  promptDialog,
  focusField
} from '../core/ui.js';

let pedidoEntregaId = null;
let pedidoEntregaDetalles = [];
let pedidoEntregaAnulados = new Set();
let carritoPedido = [];

// Pestañas del módulo y gestión de pedidos / despachos
let pestanaPedidosActual = 'solicitud'; // 'solicitud' | 'historial'
let todosLosPedidosCache = [];
let filtroEstadoHistorialActual = 'todos'; // 'todos' | 'pendiente' | 'entregado' | 'cancelado'
let busquedaHistorialActual = '';

// Catálogo interactivo de prendas
let catalogoPrendasDisponibles = [];
let stockDisponibleMap = {};
let categoriaFiltroActual = 'todos';
let vistaCatalogoActual = 'grid'; // 'grid' | 'list'
let cantidadesDraftCatalog = {}; // prendaId -> cantidad seleccionada en tarjeta

/**
 * Cambia la pestaña activa en el módulo de Pedidos (Nueva Solicitud vs Despachos)
 */
export function cambiarPestanaPedidos(pestana) {
  pestanaPedidosActual = pestana;
  const btnSolicitud = document.getElementById('tabBtnSolicitud');
  const btnHistorial = document.getElementById('tabBtnHistorial');
  const panelSolicitud = document.getElementById('panelSolicitudPedidos');
  const panelHistorial = document.getElementById('panelHistorialPedidos');

  if (btnSolicitud) btnSolicitud.classList.toggle('active', pestana === 'solicitud');
  if (btnHistorial) btnHistorial.classList.toggle('active', pestana === 'historial');

  if (panelSolicitud) panelSolicitud.style.display = pestana === 'solicitud' ? 'block' : 'none';
  if (panelHistorial) panelHistorial.style.display = pestana === 'historial' ? 'block' : 'none';

  if (pestana === 'historial') {
    loadPedidosRecientes();
  }
}

/**
 * Filtra el historial de pedidos por estado mediante chips rápidos
 */
export function filtrarEstadoHistorial(estado) {
  filtroEstadoHistorialActual = estado;
  const chipIds = ['Todos', 'Pendientes', 'Entregados', 'Cancelados'];
  chipIds.forEach(id => {
    const el = document.getElementById(`chipEstado${id}`);
    if (el) el.classList.remove('active');
  });

  const activeMap = {
    'todos': 'chipEstadoTodos',
    'pendiente': 'chipEstadoPendientes',
    'entregado': 'chipEstadoEntregados',
    'cancelado': 'chipEstadoCancelados'
  };
  const target = document.getElementById(activeMap[estado]);
  if (target) target.classList.add('active');

  renderHistorialPedidosUI();
}

/**
 * Filtra el historial en tiempo real según el texto escrito en la barra de búsqueda
 */
export function filtrarHistorialPedidosUI() {
  const input = document.getElementById('buscarHistorialPedidosInput');
  busquedaHistorialActual = input ? input.value.trim().toLowerCase() : '';
  renderHistorialPedidosUI();
}

/**
 * Clasificador inteligente de categorías según nombre y descripción
 */
export function determinarCategoriaPrenda(nombre = '', descripcion = '') {
  const texto = `${nombre} ${descripcion}`.toLowerCase();

  if (texto.includes('almohad') || texto.includes('funda') || texto.includes('cojin')) {
    return {
      id: 'almohadones',
      nombre: 'Almohadones & Fundas',
      icon: 'airline_seat_flat',
      cssClass: 'cat-almohadon'
    };
  }
  if (
    texto.includes('saban') ||
    texto.includes('sobrecama') ||
    texto.includes('colcha') ||
    texto.includes('frazada') ||
    texto.includes('cobertor') ||
    texto.includes('edredon') ||
    texto.includes('lenceria') ||
    texto.includes('duvet')
  ) {
    return {
      id: 'lenceria',
      nombre: 'Lencería & Sábanas',
      icon: 'bed',
      cssClass: 'cat-sabana'
    };
  }
  if (
    texto.includes('toalla') ||
    texto.includes('bata') ||
    texto.includes('piso') ||
    texto.includes('facial') ||
    texto.includes('playera') ||
    texto.includes('pullman')
  ) {
    return {
      id: 'toallas',
      nombre: 'Toallas & Baño',
      icon: 'dry_cleaning',
      cssClass: 'cat-toalla'
    };
  }
  if (
    texto.includes('mantel') ||
    texto.includes('servilleta') ||
    texto.includes('cubremantel') ||
    texto.includes('faldon') ||
    texto.includes('camino') ||
    texto.includes('bambalina')
  ) {
    return {
      id: 'manteleria',
      nombre: 'Mantelería',
      icon: 'table_restaurant',
      cssClass: 'cat-mantel'
    };
  }

  return {
    id: 'otros',
    nombre: 'Otros Textiles',
    icon: 'checkroom',
    cssClass: 'cat-otro'
  };
}

/**
 * Carga inicial del módulo de Pedidos
 */
export async function loadPedidos() {
  const token = window.token;
  const user = window.user || {};

  try {
    // 1. Cargar departamentos y datos de usuario
    const resDeptos = await fetch(`${API}/departamentos`, { headers: { 'x-access-token': token } });
    const deptos = await resDeptos.json();

    let deptId = user.departamento_id;
    let deptNombre = '';

    if (!deptId && user.id) {
      try {
        const userRes = await fetch(`${API}/usuarios/${user.id}`, { headers: { 'x-access-token': token } });
        const userData = await userRes.json();
        if (userData.departamento_id) {
          deptId = userData.departamento_id;
          user.departamento_id = deptId;
          localStorage.setItem('user', JSON.stringify(user));
        }
      } catch (_) {}
    }

    if (deptId) {
      const dept = (Array.isArray(deptos) ? deptos : []).find(d => d.id == deptId || d.id === Number(deptId));
      deptNombre = dept ? dept.nombre : '';
    }

    // Actualizar campos ocultos y visibles de departamento y solicitante
    const pDept = document.getElementById('pedidoDepartamento');
    if (pDept) pDept.value = deptId || '';
    const pDeptoText = document.getElementById('pedidoDeptoText');
    if (pDeptoText) pDeptoText.textContent = deptNombre || 'Sin asignar';

    const userName = user.nombre || user.username || 'Usuario';
    const pSol = document.getElementById('pedidoSolicitante');
    if (pSol) pSol.value = userName;
    const pSolText = document.getElementById('pedidoSolicitanteText');
    if (pSolText) pSolText.textContent = userName;

    // Actualizar banner superior
    const bannerName = document.getElementById('pedidosBannerUserName');
    if (bannerName) bannerName.textContent = userName;
    const bannerDept = document.getElementById('pedidosBannerUserDept');
    if (bannerDept) bannerDept.textContent = deptNombre ? `Dpto. ${deptNombre}` : (user.rol || 'Lavandería');
    const bannerAvatar = document.getElementById('pedidosBannerUserAvatar');
    if (bannerAvatar) {
      const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      bannerAvatar.textContent = initials || 'OP';
    }

    // Prellenar fecha con hoy por defecto si está vacía
    const fechaInput = document.getElementById('pedidoFecha');
    if (fechaInput && !fechaInput.value) {
      const hoy = new Date().toISOString().slice(0, 10);
      fechaInput.value = hoy;
    }

    // 2. Cargar stock disponible para despacho
    const resStock = await fetch(`${API}/prendas/stock/disponible-despacho`, { headers: { 'x-access-token': token } });
    const stockData = await resStock.json();

    stockDisponibleMap = {};
    (Array.isArray(stockData) ? stockData : []).forEach(s => {
      stockDisponibleMap[s.prenda_id] = Number(s.cantidad || 0);
      // mapeo adicional por nombre por si se requiere
      stockDisponibleMap[s.prenda] = Number(s.cantidad || 0);
    });

    // 3. Cargar catálogo de prendas
    const resPrendas = await fetch(`${API}/prendas`, { headers: { 'x-access-token': token } });
    const prendas = await resPrendas.json();
    catalogoPrendasDisponibles = Array.isArray(prendas) ? prendas : [];

    // Inicializar cantidades por defecto para cada prenda
    catalogoPrendasDisponibles.forEach(p => {
      if (!cantidadesDraftCatalog[p.id]) {
        cantidadesDraftCatalog[p.id] = 1;
      }
    });

    // 4. Renderizar píldoras de categorías con conteo
    renderCategoryChips();

    // 5. Renderizar catálogo de prendas
    renderCatalogoPedidos();

    // 6. Renderizar carrito actual
    renderCarrito();

    // 7. Cargar historial de pedidos recientes
    loadPedidosRecientes();
  } catch (err) {
    console.error('Error cargando pedidos:', err);
    showError('Error al cargar catálogo de pedidos');
  }
}

/**
 * Renderiza las píldoras de filtro por categoría con conteos dinámicos
 */
export function renderCategoryChips() {
  const chipsContainer = document.getElementById('pedidosCategoryChips');
  if (!chipsContainer) return;

  const counts = {
    todos: catalogoPrendasDisponibles.length,
    almohadones: 0,
    lenceria: 0,
    toallas: 0,
    manteleria: 0,
    otros: 0
  };

  catalogoPrendasDisponibles.forEach(p => {
    const cat = determinarCategoriaPrenda(p.nombre, p.descripcion);
    if (counts[cat.id] !== undefined) {
      counts[cat.id]++;
    } else {
      counts.otros++;
    }
  });

  const categories = [
    { id: 'todos', label: 'Todos', count: counts.todos, icon: 'grid_view' },
    { id: 'almohadones', label: 'Almohadones & Fundas', count: counts.almohadones, icon: 'airline_seat_flat' },
    { id: 'lenceria', label: 'Lencería & Sábanas', count: counts.lenceria, icon: 'bed' },
    { id: 'toallas', label: 'Toallas & Baño', count: counts.toallas, icon: 'dry_cleaning' },
    { id: 'manteleria', label: 'Mantelería', count: counts.manteleria, icon: 'table_restaurant' }
  ];

  if (counts.otros > 0) {
    categories.push({ id: 'otros', label: 'Otros Textiles', count: counts.otros, icon: 'checkroom' });
  }

  chipsContainer.innerHTML = categories.map(c => `
    <button type="button" 
      class="category-chip ${categoriaFiltroActual === c.id ? 'active' : ''}" 
      onclick="seleccionarCategoriaPedido('${c.id}')">
      <span class="mi" style="font-size:16px;">${c.icon}</span>
      <span>${c.label}</span>
      <span class="chip-count">(${c.count})</span>
    </button>
  `).join('');
}

/**
 * Cambia la categoría seleccionada y actualiza el catálogo
 */
export function seleccionarCategoriaPedido(categoriaId) {
  categoriaFiltroActual = categoriaId;
  renderCategoryChips();
  filtrarCatalogoPedidos();
}

/**
 * Cambia la vista del catálogo (cuadrícula vs lista)
 */
export function cambiarVistaCatalogo(vista) {
  vistaCatalogoActual = vista;
  const btnGrid = document.getElementById('btnViewGrid');
  const btnList = document.getElementById('btnViewList');
  const gridContainer = document.getElementById('pedidosCatalogGrid');
  const listContainer = document.getElementById('pedidosCatalogList');

  if (btnGrid) btnGrid.classList.toggle('active', vista === 'grid');
  if (btnList) btnList.classList.toggle('active', vista === 'list');

  if (gridContainer && listContainer) {
    gridContainer.style.display = vista === 'grid' ? 'grid' : 'none';
    listContainer.style.display = vista === 'list' ? 'flex' : 'none';
  }

  filtrarCatalogoPedidos();
}

/**
 * Filtra el catálogo por texto de búsqueda y categoría activa
 */
export function filtrarCatalogoPedidos() {
  const query = (document.getElementById('buscarPrendaPedido')?.value || '').trim().toLowerCase();

  const filtradas = catalogoPrendasDisponibles.filter(p => {
    // Filtro por categoría
    if (categoriaFiltroActual !== 'todos') {
      const cat = determinarCategoriaPrenda(p.nombre, p.descripcion);
      if (cat.id !== categoriaFiltroActual) return false;
    }

    // Filtro por texto
    if (query) {
      const idRef = `prd-${String(p.id).padStart(2, '0')}`;
      const matchName = (p.nombre || '').toLowerCase().includes(query);
      const matchDesc = (p.descripcion || '').toLowerCase().includes(query);
      const matchRef = idRef.includes(query) || String(p.id).includes(query);
      if (!matchName && !matchDesc && !matchRef) return false;
    }

    return true;
  });

  // Actualizar contador
  const countEl = document.getElementById('pedidosCatalogCount');
  if (countEl) {
    countEl.textContent = `Mostrando ${filtradas.length} disponibles`;
  }

  renderCatalogoConPrendas(filtradas);
}

/**
 * Renderiza el catálogo según la vista activa (cuadrícula o lista)
 */
function renderCatalogoConPrendas(prendas) {
  const gridContainer = document.getElementById('pedidosCatalogGrid');
  const listContainer = document.getElementById('pedidosCatalogList');

  if (!prendas.length) {
    const emptyHtml = `
      <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #94a3b8; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px;">
        <span class="mi" style="font-size: 42px; margin-bottom: 8px;">search_off</span>
        <div style="font-size: 16px; font-weight: 700; color: #475569;">No se encontraron prendas</div>
        <div style="font-size: 13px;">Prueba ajustando los términos de búsqueda o seleccionando otra categoría.</div>
      </div>
    `;
    if (gridContainer) gridContainer.innerHTML = emptyHtml;
    if (listContainer) listContainer.innerHTML = emptyHtml;
    return;
  }

  if (vistaCatalogoActual === 'grid') {
    if (gridContainer) {
      gridContainer.innerHTML = prendas.map(p => {
        const stock = stockDisponibleMap[p.id] !== undefined ? stockDisponibleMap[p.id] : (stockDisponibleMap[p.nombre] || 0);
        const cat = determinarCategoriaPrenda(p.nombre, p.descripcion);
        const qty = cantidadesDraftCatalog[p.id] || 1;
        const refCode = `Ref: PRD-${String(p.id).padStart(2, '0')}`;

        // Determinar estilo de píldora de stock
        let stockBadgeHtml = '';
        if (stock > 10) {
          stockBadgeHtml = `<span class="stock-pill stock-available"><span class="dot"></span> ${stock} uds disponibles</span>`;
        } else if (stock > 0) {
          stockBadgeHtml = `<span class="stock-pill stock-low"><span class="dot"></span> Stock bajo: ${stock} uds</span>`;
        } else {
          stockBadgeHtml = `<span class="stock-pill stock-none"><span class="dot"></span> 0 uds disponibles</span>`;
        }

        const isTopRequested = stock > 30;

        return `
          <div class="catalog-card">
            ${isTopRequested ? '<span class="catalog-card-top-tag">Más Solicitado</span>' : ''}
            
            <div class="catalog-card-header">
              <div class="catalog-card-icon ${cat.cssClass}">
                <span class="mi">${cat.icon}</span>
              </div>
              <div class="catalog-card-titles">
                <h4 class="catalog-card-title" title="${p.nombre}">${p.nombre}</h4>
                <div class="catalog-card-ref">${refCode} &bull; ${cat.nombre}</div>
              </div>
            </div>

            <div class="catalog-card-stock-row">
              ${stockBadgeHtml}
              <span class="catalog-card-desc">${p.descripcion || 'Lavado estándar'}</span>
            </div>

            <div class="catalog-card-actions">
              <div class="catalog-stepper">
                <button type="button" class="catalog-stepper-btn" onclick="cambiarCantidadCatalogo(${p.id}, -1)">&minus;</button>
                <input type="text" class="catalog-stepper-input" id="catalogQty_${p.id}" value="${qty}" readonly>
                <button type="button" class="catalog-stepper-btn" onclick="cambiarCantidadCatalogo(${p.id}, 1)">&plus;</button>
              </div>

              ${stock > 0 ? `
                <button type="button" class="btn-catalog-add" onclick="agregarAlCarritoDesdeCatalogo(${p.id})">
                  <span class="mi">shopping_bag</span> Añadir al Pedido
                </button>
              ` : `
                <button type="button" class="btn-catalog-disabled" disabled>
                  <span class="mi">block</span> Sin Stock Disponible
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    // Vista Lista
    if (listContainer) {
      listContainer.innerHTML = prendas.map(p => {
        const stock = stockDisponibleMap[p.id] !== undefined ? stockDisponibleMap[p.id] : (stockDisponibleMap[p.nombre] || 0);
        const cat = determinarCategoriaPrenda(p.nombre, p.descripcion);
        const qty = cantidadesDraftCatalog[p.id] || 1;
        const refCode = `Ref: PRD-${String(p.id).padStart(2, '0')}`;

        let stockBadgeHtml = '';
        if (stock > 10) {
          stockBadgeHtml = `<span class="stock-pill stock-available"><span class="dot"></span> ${stock} disponibles</span>`;
        } else if (stock > 0) {
          stockBadgeHtml = `<span class="stock-pill stock-low"><span class="dot"></span> Bajo: ${stock}</span>`;
        } else {
          stockBadgeHtml = `<span class="stock-pill stock-none"><span class="dot"></span> 0 disponibles</span>`;
        }

        return `
          <div class="catalog-list-row">
            <div class="catalog-list-left">
              <div class="catalog-card-icon ${cat.cssClass}" style="width: 40px; height: 40px; font-size: 20px;">
                <span class="mi">${cat.icon}</span>
              </div>
              <div class="catalog-list-info">
                <span class="catalog-list-title">${p.nombre}</span>
                <div class="catalog-list-sub">
                  <span>${refCode}</span>
                  <span>&bull;</span>
                  <span>${cat.nombre}</span>
                  ${p.descripcion ? `<span>&bull;</span> <span>${p.descripcion}</span>` : ''}
                </div>
              </div>
            </div>

            <div class="catalog-list-stock-col">
              ${stockBadgeHtml}
            </div>

            <div class="catalog-list-actions">
              <div class="catalog-stepper">
                <button type="button" class="catalog-stepper-btn" onclick="cambiarCantidadCatalogo(${p.id}, -1)">&minus;</button>
                <input type="text" class="catalog-stepper-input" id="catalogQtyList_${p.id}" value="${qty}" readonly>
                <button type="button" class="catalog-stepper-btn" onclick="cambiarCantidadCatalogo(${p.id}, 1)">&plus;</button>
              </div>

              ${stock > 0 ? `
                <button type="button" class="btn btn-primary btn-sm" onclick="agregarAlCarritoDesdeCatalogo(${p.id})" style="padding: 6px 14px; height: 38px; font-weight: 700; white-space: nowrap;">
                  <span class="mi">add</span> Añadir
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-sm" disabled style="padding: 6px 14px; height: 38px; opacity: 0.6; white-space: nowrap;">
                  Agotado
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

export function renderCatalogoPedidos() {
  filtrarCatalogoPedidos();
}

/**
 * Incrementa o decrementa la cantidad seleccionada en una tarjeta de catálogo
 */
export function cambiarCantidadCatalogo(prendaId, delta) {
  const stock = stockDisponibleMap[prendaId] !== undefined ? stockDisponibleMap[prendaId] : 999;
  const actual = cantidadesDraftCatalog[prendaId] || 1;
  const nuevo = Math.max(1, actual + delta);

  if (delta > 0 && stock > 0 && nuevo > stock) {
    showWarning(`Stock máximo disponible para esta prenda: ${stock} unidades`);
    return;
  }

  cantidadesDraftCatalog[prendaId] = nuevo;

  const inputGrid = document.getElementById(`catalogQty_${prendaId}`);
  if (inputGrid) inputGrid.value = nuevo;
  const inputList = document.getElementById(`catalogQtyList_${prendaId}`);
  if (inputList) inputList.value = nuevo;
}

/**
 * Añade una prenda desde el catálogo al carrito con la cantidad configurada
 */
export function agregarAlCarritoDesdeCatalogo(prendaId) {
  const prenda = catalogoPrendasDisponibles.find(p => p.id === prendaId);
  if (!prenda) return;

  const stock = stockDisponibleMap[prendaId] !== undefined ? stockDisponibleMap[prendaId] : (stockDisponibleMap[prenda.nombre] || 0);
  const cantidadDeseada = cantidadesDraftCatalog[prendaId] || 1;

  if (stock <= 0) {
    showError('No hay stock disponible de esta prenda');
    return;
  }

  const existente = carritoPedido.find(p => p.prenda_id === prendaId);
  const cantidadTotalPrevista = (existente ? existente.cantidad : 0) + cantidadDeseada;

  if (cantidadTotalPrevista > stock) {
    showWarning(`Solo hay ${stock} unidades disponibles de "${prenda.nombre}".`);
    return;
  }

  if (existente) {
    existente.cantidad += cantidadDeseada;
  } else {
    carritoPedido.push({
      prenda_id: prendaId,
      cantidad: cantidadDeseada,
      nombre: prenda.nombre,
      stock
    });
  }

  // Restablecer el stepper del catálogo a 1 tras agregar
  cantidadesDraftCatalog[prendaId] = 1;
  const inputGrid = document.getElementById(`catalogQty_${prendaId}`);
  if (inputGrid) inputGrid.value = 1;
  const inputList = document.getElementById(`catalogQtyList_${prendaId}`);
  if (inputList) inputList.value = 1;

  showSuccess(`${cantidadDeseada}x ${prenda.nombre} añadida(s) al pedido`);
  renderCarrito();
}

/**
 * Modifica la cantidad de una prenda directamente desde el resumen de carrito
 */
export function cambiarCantidadCarrito(prendaId, delta) {
  const itemIndex = carritoPedido.findIndex(p => p.prenda_id === prendaId);
  if (itemIndex === -1) return;

  const item = carritoPedido[itemIndex];
  const stock = stockDisponibleMap[prendaId] !== undefined ? stockDisponibleMap[prendaId] : 999;
  const nuevaCant = item.cantidad + delta;

  if (nuevaCant <= 0) {
    carritoPedido.splice(itemIndex, 1);
    showInfo(`"${item.nombre}" eliminada del pedido`);
  } else if (stock > 0 && nuevaCant > stock) {
    showWarning(`Stock máximo disponible alcanzado (${stock} uds)`);
    return;
  } else {
    item.cantidad = nuevaCant;
  }

  renderCarrito();
}

/**
 * Elimina una prenda del carrito
 */
export function eliminarDelCarrito(prendaId) {
  const itemIndex = carritoPedido.findIndex(p => p.prenda_id === prendaId);
  if (itemIndex !== -1) {
    const nombre = carritoPedido[itemIndex].nombre;
    carritoPedido.splice(itemIndex, 1);
    showInfo(`"${nombre}" eliminada del carrito`);
    renderCarrito();
  }
}

/**
 * Renderiza el carrito de pedidos (sidebar derecho)
 */
export function renderCarrito() {
  const totalItems = carritoPedido.length;
  const totalUnidades = carritoPedido.reduce((sum, p) => sum + p.cantidad, 0);

  // Actualizar píldoras de conteo
  const pillCount = document.getElementById('resumenPillCount');
  if (pillCount) {
    pillCount.textContent = `${totalItems} prendas | ${totalUnidades} uds`;
  }

  // Barra flotante móvil
  const mobileBar = document.getElementById('mobileCartFloatBar');
  const mobileCount = document.getElementById('mobileFloatCount');
  if (mobileBar && mobileCount) {
    if (totalItems > 0) {
      mobileCount.textContent = `${totalItems} prendas (${totalUnidades} uds)`;
      mobileBar.style.display = 'flex';
    } else {
      mobileBar.style.display = 'none';
    }
  }

  const cartEl = document.getElementById('carritoPedido');
  if (!cartEl) return;

  if (carritoPedido.length === 0) {
    cartEl.innerHTML = `
      <div class="cart-empty-message">
        <span class="mi">shopping_cart</span>
        <div style="font-weight: 700; color: #475569; font-size: 14px;">No hay prendas en el pedido</div>
        <div style="font-size: 12px; margin-top: 3px;">Elige prendas del catálogo a la izquierda para armar tu solicitud.</div>
      </div>
    `;
    return;
  }

  cartEl.innerHTML = carritoPedido.map(p => {
    const stock = stockDisponibleMap[p.prenda_id] !== undefined ? stockDisponibleMap[p.prenda_id] : (p.stock || '-');
    const refCode = `Ref: PRD-${String(p.prenda_id).padStart(2, '0')}`;

    return `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <div class="cart-item-name" title="${p.nombre}">${p.nombre}</div>
          <div class="cart-item-ref">${refCode} &bull; Stock: <strong>${stock}</strong></div>
        </div>

        <div class="cart-item-actions">
          <div class="cart-stepper">
            <button type="button" class="cart-stepper-btn" onclick="cambiarCantidadCarrito(${p.prenda_id}, -1)">&minus;</button>
            <span class="cart-stepper-qty">${p.cantidad}</span>
            <button type="button" class="cart-stepper-btn" onclick="cambiarCantidadCarrito(${p.prenda_id}, 1)">&plus;</button>
          </div>

          <button type="button" class="cart-item-remove" onclick="eliminarDelCarrito(${p.prenda_id})" title="Eliminar prenda" aria-label="Eliminar prenda">
            <span class="mi" style="font-size: 18px;">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Vacía completamente el carrito
 */
export function limpiarCarrito() {
  if (carritoPedido.length === 0) {
    showWarning('El carrito ya está vacío');
    return;
  }
  carritoPedido = [];
  renderCarrito();
  showInfo('Carrito vaciado');
}

/**
 * Abre o desliza la vista de resumen en dispositivos móviles
 */
export function toggleMobileCartDrawer() {
  const sidebar = document.getElementById('pedidoSummarySidebar');
  if (sidebar) {
    sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Envía la solicitud y crea el pedido
 */
export async function crearPedido() {
  const departamento_id = document.getElementById('pedidoDepartamento')?.value;
  const evento = (document.getElementById('pedidoEvento')?.value || '').trim();
  const fecha = document.getElementById('pedidoFecha')?.value;
  const hora = document.getElementById('pedidoHora')?.value;
  const solicitante = (document.getElementById('pedidoSolicitante')?.value || '').trim();
  const observaciones = (document.getElementById('pedidoObservaciones')?.value || '').trim();

  if (!departamento_id) {
    showError('No se detectó un departamento asignado para tu usuario');
    return;
  }
  if (!evento) {
    focusField('pedidoEvento', 'Ingresa el evento o área destino', 'error');
    return;
  }
  if (!fecha) {
    focusField('pedidoFecha', 'Selecciona la fecha requerida', 'error');
    return;
  }
  if (!hora) {
    focusField('pedidoHora', 'Selecciona la hora de entrega', 'error');
    return;
  }
  if (!solicitante) {
    showError('No se detectó el solicitante');
    return;
  }

  if (carritoPedido.length === 0) {
    showWarning('Agrega al menos una prenda al pedido antes de confirmar');
    return;
  }

  const pedidoData = {
    departamento_id,
    observaciones: `${evento}${hora ? ' - Hora: ' + hora : ''}${solicitante ? ' - Solicita: ' + solicitante : ''}\n${observaciones}`,
    detalles: carritoPedido,
    fecha_entrega: fecha
  };

  try {
    const res = await fetch(`${API}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify(pedidoData)
    });

    if (res.ok) {
      const result = await res.json();
      showSuccess(`Pedido #${result.id} creado correctamente`);

      // Limpiar formulario y carrito
      const eventoInput = document.getElementById('pedidoEvento');
      if (eventoInput) eventoInput.value = '';
      const obsInput = document.getElementById('pedidoObservaciones');
      if (obsInput) obsInput.value = '';

      carritoPedido = [];
      renderCarrito();

      // Recargar catálogo para actualizar stock en vivo y pedidos recientes
      loadPedidos();
      cambiarPestanaPedidos('historial');

      // Abrir ticket de impresión
      try {
        await imprimirTicket(result.id);
        showInfo('Ticket generado para impresión');
      } catch (_) {}
    } else {
      const err = await res.json();
      showError(err.message || 'Error al crear pedido');
    }
  } catch (err) {
    showError('Error de red al procesar pedido');
  }
}

/**
 * Carga el historial de pedidos y actualiza los badges y contadores
 */
export async function loadPedidosRecientes() {
  try {
    const res = await fetch(`${API}/pedidos`, { headers: { 'x-access-token': window.token } });
    const pedidos = await res.json();
    todosLosPedidosCache = Array.isArray(pedidos) ? pedidos : [];

    // Calcular contadores por estado
    const total = todosLosPedidosCache.length;
    const pendientes = todosLosPedidosCache.filter(p => p.estado === 'pendiente').length;
    const entregados = todosLosPedidosCache.filter(p => p.estado === 'entregado').length;
    const cancelados = todosLosPedidosCache.filter(p => p.estado === 'cancelado').length;

    // Actualizar badge numérico en la pestaña de navegación
    const badgePestana = document.getElementById('pedidosPendingBadge');
    if (badgePestana) {
      badgePestana.textContent = pendientes;
      badgePestana.style.display = pendientes > 0 ? 'inline-flex' : 'none';
    }

    // Actualizar números en los chips de filtro
    const cTodos = document.getElementById('countHistorialTodos');
    if (cTodos) cTodos.textContent = total;
    const cPend = document.getElementById('countHistorialPendientes');
    if (cPend) cPend.textContent = pendientes;
    const cEntr = document.getElementById('countHistorialEntregados');
    if (cEntr) cEntr.textContent = entregados;
    const cCanc = document.getElementById('countHistorialCancelados');
    if (cCanc) cCanc.textContent = cancelados;

    renderHistorialPedidosUI();
  } catch (err) {
    console.error('Error cargando historial de pedidos:', err);
  }
}

/**
 * Renderiza la tabla de pedidos con ordenamiento inteligente:
 * 1. Pedidos PENDIENTES arriba con alerta y botón de despacho
 * 2. Pedidos YA DESPACHADOS abajo con indicador verde
 * 3. Pedidos ANULADOS al final
 */
export function renderHistorialPedidosUI() {
  const listaPedidosEl = document.getElementById('listaPedidos');
  if (!listaPedidosEl) return;

  let pedidos = [...todosLosPedidosCache];

  // 1. Filtrar por estado activo
  if (filtroEstadoHistorialActual !== 'todos') {
    pedidos = pedidos.filter(p => p.estado === filtroEstadoHistorialActual);
  }

  // 2. Filtrar por búsqueda de texto
  if (busquedaHistorialActual) {
    const q = busquedaHistorialActual;
    pedidos = pedidos.filter(p => {
      const idMatch = String(p.id).includes(q);
      const deptoMatch = (p.departamento_nombre || '').toLowerCase().includes(q);
      const userMatch = (p.usuario_nombre || '').toLowerCase().includes(q);
      const obsMatch = (p.observaciones || '').toLowerCase().includes(q);
      return idMatch || deptoMatch || userMatch || obsMatch;
    });
  }

  // 3. Orden inteligente unificado: Pendientes primero, Despachados abajo
  const prioridadEstado = { 'pendiente': 1, 'entregado': 2, 'cancelado': 3 };
  pedidos.sort((a, b) => {
    const pA = prioridadEstado[a.estado] || 99;
    const pB = prioridadEstado[b.estado] || 99;
    if (pA !== pB) return pA - pB;
    // Mismo estado: el más reciente por fecha_pedido va primero
    return new Date(b.fecha_pedido || 0) - new Date(a.fecha_pedido || 0);
  });

  if (pedidos.length === 0) {
    listaPedidosEl.innerHTML = `
      <div style="padding: 42px 20px; text-align: center; color: #94a3b8;">
        <span class="mi" style="font-size: 44px; display: block; margin-bottom: 8px; color: #cbd5e1;">inbox</span>
        <strong style="display: block; font-size: 15px; color: #475569;">No se encontraron pedidos</strong>
        <p style="font-size: 13px; margin: 4px 0 0 0;">Intenta cambiar el filtro o el término de búsqueda.</p>
      </div>
    `;
    return;
  }

  const badgeMap = {
    'pendiente': '<span class="badge-despacho badge-pendiente"><span class="mi" style="font-size:14px;">hourglass_top</span> Por Despachar</span>',
    'entregado': '<span class="badge-despacho badge-entregado"><span class="mi" style="font-size:14px;">check_circle</span> Despachado</span>',
    'cancelado': '<span class="badge-despacho badge-cancelado"><span class="mi" style="font-size:14px;">cancel</span> Anulado</span>'
  };

  const rowClassMap = {
    'pendiente': 'order-row-pending',
    'entregado': 'order-row-entregado',
    'cancelado': 'order-row-cancelado'
  };

  listaPedidosEl.innerHTML = `
    <div class="pedidos-table-container">
      <table class="pedidos-modern-table">
        <thead>
          <tr>
            <th style="width: 70px;">ID</th>
            <th>Departamento & Solicitante</th>
            <th>Evento / Destino</th>
            <th>Prendas</th>
            <th>Fecha Requerida</th>
            <th>Estado</th>
            <th style="text-align: center; width: 170px;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${pedidos.map(p => {
            const detalles = Array.isArray(p.detalles) ? p.detalles : [];
            const cantPrendas = detalles.length;
            const totalUds = detalles.reduce((sum, d) => sum + (Number(d.cantidad) || 0), 0);
            const entregadasUds = detalles.reduce((sum, d) => sum + (Number(d.cantidad_entregada) || 0), 0);
            const rowClass = rowClassMap[p.estado] || '';
            const badgeHtml = badgeMap[p.estado] || `<span class="badge-despacho">${p.estado}</span>`;
            const eventoTexto = (p.observaciones || '').split('\n')[0] || 'Uso Operativo General';

            return `
              <tr class="${rowClass}">
                <td>
                  <span class="order-id-chip">#${p.id}</span>
                </td>
                <td>
                  <div class="order-depto-name">${p.departamento_nombre || 'Sin Asignar'}</div>
                  <div style="font-size: 11px; color: #64748b;">${p.usuario_nombre || 'Usuario'}</div>
                </td>
                <td>
                  <div class="order-event-desc" title="${eventoTexto}">${eventoTexto}</div>
                </td>
                <td>
                  <div class="order-items-summary" title="${detalles.map(d => `${d.cantidad}x ${d.prenda_nombre}`).join(', ')}">
                    <span class="mi" style="font-size: 14px;">checkroom</span>
                    <span>${cantPrendas} items (${p.estado === 'entregado' ? `${entregadasUds}/` : ''}${totalUds} uds)</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
                    ${p.fecha_entrega ? formatDate(p.fecha_entrega) : '-'}
                  </div>
                  ${p.estado === 'pendiente' ? '<span style="font-size: 10px; font-weight: 800; color: #b45309; text-transform: uppercase;">Prioridad Activa</span>' : ''}
                </td>
                <td>
                  ${badgeHtml}
                </td>
                <td>
                  <div class="order-actions-cell">
                    ${p.estado === 'pendiente' ? `
                      <button type="button" class="btn-despacho-entregar" onclick="abrirEntrega(${p.id})" title="Entregar y despachar pedido">
                        <span class="mi" style="font-size: 15px;">local_shipping</span> Despachar
                      </button>
                      <button type="button" class="btn-table-icon btn-danger" onclick="anularPedidoPendiente(${p.id})" title="Anular pedido">
                        <span class="mi" style="font-size: 17px;">block</span>
                      </button>
                    ` : ''}

                    ${p.estado === 'entregado' ? `
                      <button type="button" class="btn-table-icon btn-danger" onclick="anularEntregaTotal(${p.id})" title="Anular despacho y regresar a stock">
                        <span class="mi" style="font-size: 17px;">undo</span>
                      </button>
                    ` : ''}

                    <button type="button" class="btn-table-icon" onclick="imprimirTicket(${p.id})" title="Imprimir ticket térmico">
                      <span class="mi" style="font-size: 17px;">print</span>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Operaciones de Despacho, Entrega y Anulaciones (Mantenidas al 100%)
 */
export async function anularPedidoPendiente(pedidoId) {
  const ok = await confirmDialog(`Se anulará todo el pedido pendiente #${pedidoId}.\n\nQuedará marcado como NO ENTREGADO.\n\n¿Deseas continuar?`, 'Anular pedido pendiente');
  if (!ok) return;

  try {
    const res = await fetch(`${API}/pedidos/${pedidoId}`, {
      method: 'DELETE',
      headers: { 'x-access-token': window.token }
    });

    if (res.ok) {
      showSuccess('Pedido pendiente anulado');
      loadPedidos();
    } else {
      const err = await res.json();
      showError(err.message || 'No se pudo anular el pedido pendiente');
    }
  } catch (err) {
    showError('Error de red al anular pedido');
  }
}

export async function anularItemPendiente(pedidoId) {
  try {
    const resPedido = await fetch(`${API}/pedidos/${pedidoId}`, { headers: { 'x-access-token': window.token } });
    if (!resPedido.ok) return showError('No se pudo cargar el pedido');

    const pedido = await resPedido.json();
    if (pedido.estado !== 'pendiente') return showWarning('Solo se pueden anular prendas en pedidos pendientes');

    const opciones = (pedido.detalles || [])
      .filter(d => Number(d.cantidad_entregada || 0) === 0)
      .map(d => `ID ${d.id}: ${d.prenda_nombre} (solicitado ${d.cantidad})`)
      .join('\n');

    if (!opciones) return showWarning('No hay prendas pendientes para anular en este pedido');

    const detalleIdTxt = await promptDialog(`Selecciona el ID del detalle a anular:\n\n${opciones}`, '', 'Anular prenda pendiente', 'Escribe el ID del detalle');
    const detalleId = Number(detalleIdTxt || 0);
    if (!detalleId) return;

    const detalle = (pedido.detalles || []).find(d => Number(d.id) === detalleId);
    if (!detalle) return showError('El detalle indicado no pertenece al pedido');

    const maximo = Number(detalle.cantidad || 0);
    const cantidadTxt = await promptDialog(`Cantidad a anular para "${detalle.prenda_nombre}" (max ${maximo}):`, `${maximo}`, 'Cantidad a anular', 'Cantidad');
    const cantidad = Number(cantidadTxt || 0);
    if (!cantidad || cantidad <= 0) return;

    const res = await fetch(`${API}/pedidos/${pedidoId}/anular-item-pendiente`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({ detalle_id: detalleId, cantidad })
    });

    if (res.ok) {
      showSuccess('Prenda anulada del pedido');
      loadPedidos();
    } else {
      const err = await res.json();
      showError(err.message || 'No se pudo anular la prenda del pedido');
    }
  } catch (err) {
    showError('Error de red al anular prenda');
  }
}

export async function anularEntregaTotal(pedidoId) {
  const ok = await confirmDialog(`Se anulará todo el despacho del pedido #${pedidoId}.\n\nEsto regresará todas las prendas entregadas al stock general.\n\n¿Deseas continuar?`, 'Anular despacho completo');
  if (!ok) return;

  try {
    const res = await fetch(`${API}/pedidos/${pedidoId}/anular-entrega`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({})
    });

    if (res.ok) {
      showSuccess('Despacho completo anulado');
      loadPedidos();
    } else {
      const err = await res.json();
      showError(err.message || 'No se pudo anular el despacho');
    }
  } catch (err) {
    showError('Error de red al anular despacho');
  }
}

export async function anularEntregaItem(pedidoId) {
  try {
    const resPedido = await fetch(`${API}/pedidos/${pedidoId}`, { headers: { 'x-access-token': window.token } });
    if (!resPedido.ok) return showError('No se pudo cargar el pedido');

    const pedido = await resPedido.json();
    const opciones = (pedido.detalles || [])
      .filter(d => Number(d.cantidad_entregada || 0) > 0)
      .map(d => `ID ${d.id}: ${d.prenda_nombre} (entregado ${d.cantidad_entregada}/${d.cantidad})`)
      .join('\n');

    if (!opciones) return showWarning('Este pedido no tiene prendas entregadas para anular');

    const detalleIdTxt = await promptDialog(`Selecciona el ID del detalle a anular:\n\n${opciones}`, '', 'Anular prenda entregada', 'Escribe el ID del detalle');
    const detalleId = Number(detalleIdTxt || 0);
    if (!detalleId) return;

    const detalle = (pedido.detalles || []).find(d => Number(d.id) === detalleId);
    if (!detalle) return showError('El detalle indicado no pertenece al pedido');

    const maximo = Number(detalle.cantidad_entregada || 0);
    const cantidadTxt = await promptDialog(`Cantidad a anular para "${detalle.prenda_nombre}" (max ${maximo}):`, `${maximo}`, 'Cantidad a anular', 'Cantidad');
    const cantidad = Number(cantidadTxt || 0);
    if (!cantidad || cantidad <= 0) return;

    const res = await fetch(`${API}/pedidos/${pedidoId}/anular-entrega-item`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({ detalle_id: detalleId, cantidad })
    });

    if (res.ok) {
      showSuccess('Prenda devuelta a stock');
      loadPedidos();
    } else {
      const err = await res.json();
      showError(err.message || 'No se pudo anular la prenda');
    }
  } catch (err) {
    showError('Error de red al anular item');
  }
}

export async function abrirEntrega(pedidoId) {
  pedidoEntregaId = pedidoId;
  pedidoEntregaAnulados = new Set();

  try {
    const res = await fetch(`${API}/pedidos/${pedidoId}`, { headers: { 'x-access-token': window.token } });
    const pedido = await res.json();
    pedidoEntregaDetalles = pedido.detalles || [];

    const detEl = document.getElementById('detalleEntregaPedido');
    if (detEl) {
      detEl.innerHTML = `
        <div style="background:#f8f9fa; padding:15px; border-radius:8px;">
          <strong>Pedido #${pedidoId}</strong> - ${pedido.departamento_nombre}<br>
          <small>${(pedido.observaciones || '').split('\n')[0]}</small>
        </div>
      `;
    }

    const resStock = await fetch(`${API}/prendas/stock/disponible-despacho`, { headers: { 'x-access-token': window.token } });
    const stockData = await resStock.json();

    const stockMap = {};
    (Array.isArray(stockData) ? stockData : []).forEach(s => {
      stockMap[s.prenda] = Number(s.cantidad || 0);
    });

    const tablaEl = document.getElementById('tablaEntregaPrendas');
    if (tablaEl) {
      tablaEl.innerHTML = `
        <table style="width:100%;"><thead><tr><th>Prenda</th><th>Solicitado</th><th>Stock</th><th>Entregar</th><th>Acción</th></tr></thead>
        <tbody>${pedidoEntregaDetalles.map((p, i) => {
          const totalStock = Number(stockMap[p.prenda_nombre] || 0);
          return `<tr>
            <td id="entrega_nombre_${i}">${p.prenda_nombre}</td>
            <td id="entrega_solicitado_${i}">${p.cantidad}</td>
            <td><span style="color:${totalStock > 0 ? '#27ae60' : '#e74c3c'}; font-weight:bold;">${totalStock}</span></td>
            <td><input type="number" id="entrega_${i}" class="form-control" value="${p.cantidad}" min="0" max="${p.cantidad + 10}" style="width:80px; padding:5px;"></td>
            <td><button type="button" class="btn btn-danger btn-table" onclick="toggleAnularEntregaItem(${i})"><span class="mi">block</span></button></td>
          </tr>`;
        }).join('')}</tbody></table>
        <div style="margin-top:10px; padding:10px; background:#e8f5e9; border-radius:5px;">
          <small><span class="mi">info</span>Puedes entregar más o menos de lo solicitado. Si anulas un item, se enviará con cantidad 0.</small>
        </div>
      `;
    }

    const modal = document.getElementById('modalEntrega');
    if (modal) modal.classList.add('show');
  } catch (err) {
    console.error('Error al abrir entrega:', err);
  }
}

export function closeEntregaModal() {
  const modal = document.getElementById('modalEntrega');
  if (modal) modal.classList.remove('show');
  pedidoEntregaId = null;
  pedidoEntregaDetalles = [];
  pedidoEntregaAnulados = new Set();
}

export function toggleAnularEntregaItem(index) {
  const input = document.getElementById(`entrega_${index}`);
  const nombre = document.getElementById(`entrega_nombre_${index}`);
  const solicitado = document.getElementById(`entrega_solicitado_${index}`);
  if (!input || !nombre || !solicitado) return;

  if (pedidoEntregaAnulados.has(index)) {
    pedidoEntregaAnulados.delete(index);
    input.disabled = false;
    if (!Number(input.value)) {
      input.value = pedidoEntregaDetalles[index]?.cantidad || 1;
    }
    nombre.style.textDecoration = 'none';
    nombre.style.opacity = '1';
    solicitado.style.textDecoration = 'none';
    solicitado.style.opacity = '1';
    return;
  }

  pedidoEntregaAnulados.add(index);
  input.value = 0;
  input.disabled = true;
  nombre.style.textDecoration = 'line-through';
  nombre.style.opacity = '0.55';
  solicitado.style.textDecoration = 'line-through';
  solicitado.style.opacity = '0.55';
}

export async function confirmarEntrega() {
  if (!pedidoEntregaId) return;

  const entregas = pedidoEntregaDetalles
    .map((p, i) => ({
      detalle_id: p.id,
      prenda_id: p.prenda_id,
      cantidad_entregada: pedidoEntregaAnulados.has(i)
        ? 0
        : (parseInt(document.getElementById(`entrega_${i}`)?.value, 10) || 0)
    }))
    .filter((e) => e.cantidad_entregada > 0);

  if (!entregas.length) {
    showWarning('No hay prendas marcadas para entregar.');
    return;
  }

  try {
    const res = await fetch(`${API}/pedidos/${pedidoEntregaId}/entregar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({ entregas })
    });

    if (res.ok) {
      showSuccess('Pedido entregado correctamente');
      closeEntregaModal();
      loadPedidos();
    } else {
      const err = await res.json();
      showError(err.message || 'Error al entregar pedido');
    }
  } catch (err) {
    showError('Error de red al entregar pedido');
  }
}

/**
 * Impresión de Ticket Térmico 80mm
 */
export async function imprimirTicket(pedidoId) {
  try {
    const res = await fetch(`${API}/pedidos/${pedidoId}`, { headers: { 'x-access-token': window.token } });
    if (!res.ok) throw new Error('Error al obtener pedido');
    const pedido = await res.json();
    if (!pedido) throw new Error('Pedido no encontrado');

    const printWindow = window.open('', '_blank');

    const obs = pedido.observaciones || '';
    let evento = obs;
    let hora = '';
    let solicitante = '';
    const horaMatch = obs.match(/Hora:\s*([\d:]+)/);
    const solMatch = obs.match(/Solicita:\s*(.+?)(?:\n|$)/);
    if (horaMatch) hora = horaMatch[1];
    if (solMatch) solicitante = solMatch[1];
    evento = obs.split('\n')[0] || '-';
    const printLogo = localStorage.getItem('print_logo_base64');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket Pedido #${pedidoId}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          html, body { margin: 0; padding: 0; }
          body { font-family: 'Courier New', monospace; width: 80mm; font-size: 18px; font-weight: bold; padding: 5px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
          .title { font-size: 24px; font-weight: bold; }
          .section { border-bottom: 1px dashed #ccc; padding: 8px 0; margin-bottom: 8px; }
          .section-title { font-weight: 900; font-size: 24px; color: #000; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .info { margin: 5px 0; font-size: 18px; font-weight: bold; }
          .item { display: flex; justify-content: space-between; padding: 4px 0; font-size: 18px; font-weight: bold; }
          .footer { text-align: center; font-size: 14px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          ${printLogo
            ? `<div style="margin-bottom:10px;"><img src="${printLogo}" alt="Logo Tickets" style="max-height:130px; max-width:300px; width:auto; object-fit:contain; filter: contrast(1.35) brightness(0.9);"></div>`
            : `<div class="title">LAVANDERIA</div>`}
          <div>Pedido #${pedidoId}</div>
        </div>
        <div class="section">
          <div class="section-title">Solicitante</div>
          <div class="info" style="font-size:20px;">${solicitante || pedido.usuario_nombre || '-'}</div>
        </div>
        <div class="section">
          <div class="section-title">Detalles del Pedido</div>
          <div class="info">Depto: ${pedido.departamento_nombre || '-'}</div>
          <div class="info">Fecha: ${new Date(pedido.fecha_pedido).toLocaleDateString('es-GT')}</div>
          <div class="info">Entrega: ${pedido.fecha_entrega || '-'} ${hora ? hora : ''}</div>
          <div class="info">Evento: ${evento}</div>
        </div>
        <div class="section">
          <div class="section-title">Prendas</div>
          ${(pedido.detalles && pedido.detalles.length > 0)
            ? pedido.detalles.map(p => `
              <div class="item">
                <span>${p.prenda_nombre || 'Prenda'}</span>
                <span>Cant ${p.cantidad || 0}</span>
              </div>
            `).join('')
            : '<div class="item"><span>Sin prendas</span></div>'}
        </div>
        <div class="footer">
          <div style="font-weight:900; font-size:14px; line-height:1.25;">Hotel y Centro de Convenciones</div>
          <div style="font-weight:900; font-size:14px; line-height:1.25;">Jardines del Lago Panajachel Sololá</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    if (printWindow) {
      printWindow.print();
    } else {
      showError('Permite ventanas emergentes para imprimir');
    }
  } catch (err) {
    showError('Error generando ticket');
  }
}

// Exposición global a window para eventos inline HTML
Object.assign(window, {
  loadPedidos,
  cambiarPestanaPedidos,
  filtrarEstadoHistorial,
  filtrarHistorialPedidosUI,
  renderHistorialPedidosUI,
  determinarCategoriaPrenda,
  renderCategoryChips,
  seleccionarCategoriaPedido,
  cambiarVistaCatalogo,
  filtrarCatalogoPedidos,
  renderCatalogoPedidos,
  cambiarCantidadCatalogo,
  agregarAlCarritoDesdeCatalogo,
  cambiarCantidadCarrito,
  eliminarDelCarrito,
  renderCarrito,
  limpiarCarrito,
  toggleMobileCartDrawer,
  crearPedido,
  loadPedidosRecientes,
  anularPedidoPendiente,
  anularItemPendiente,
  anularEntregaTotal,
  anularEntregaItem,
  abrirEntrega,
  closeEntregaModal,
  toggleAnularEntregaItem,
  confirmarEntrega,
  imprimirTicket
});
