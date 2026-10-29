/**
 * Módulo de Flujo de Procesos Operativos (Diseño ERP Industrial)
 * Módulo ES6 con compatibilidad global
 */

import { API } from '../core/api.js';
import { showToast } from '../core/ui.js';

// Configuración visual y operativa de las 10 etapas
const PROCESO_CONFIG = {
  sucio: {
    numero: 1,
    nombre: 'Sucio',
    color: '#e11d48',
    icon: 'layers',
    siguiente: 'remojo',
    descripcion: 'Recepción y clasificación'
  },
  remojo: {
    numero: 2,
    nombre: 'Remojo',
    color: '#ea580c',
    icon: 'water_drop',
    siguiente: 'lavado',
    descripcion: 'Tratamiento hidrosoluble'
  },
  lavado: {
    numero: 3,
    nombre: 'Lavado',
    color: '#ca8a04',
    icon: 'soap',
    siguiente: 'tendido',
    descripcion: 'Ciclo mecánico principal'
  },
  tendido: {
    numero: 4,
    nombre: 'Tendido',
    color: '#059669',
    icon: 'wb_sunny',
    siguiente: 'recogido',
    descripcion: 'Secado y ventilación'
  },
  recogido: {
    numero: 5,
    nombre: 'Recogido',
    color: '#0d9488',
    icon: 'inventory_2',
    siguiente: 'limpio',
    descripcion: 'Inspección de secado'
  },
  reproceso: {
    numero: 6,
    nombre: 'Reproceso',
    color: '#2563eb',
    icon: 'sync',
    siguiente: 'lavado',
    descripcion: 'Reingreso a lavado'
  },
  limpio: {
    numero: 7,
    nombre: 'Limpio',
    color: '#7c3aed',
    icon: 'auto_awesome',
    siguiente: 'planchado',
    descripcion: 'Prendas higienizadas'
  },
  planchado: {
    numero: 8,
    nombre: 'Planchado',
    color: '#334155',
    icon: 'iron',
    siguiente: 'stock',
    descripcion: 'Prensado y terminado'
  },
  desmanche: {
    numero: 9,
    nombre: 'Desmanche',
    color: '#db2777',
    icon: 'biotech',
    siguiente: 'lavado',
    descripcion: 'Tratamiento químico'
  },
  stock: {
    numero: 10,
    nombre: 'Stock',
    color: '#0891b2',
    icon: 'storefront',
    siguiente: null,
    descripcion: 'Almacén y entrega'
  }
};

// Estado del módulo
let etapaSeleccionada = 'sucio';
let resumenStockGlobal = [];
let totalPrendasGlobal = 0;
let registrosEtapaActual = [];
let prendasCatalogo = [];
let departamentosCatalogo = [];

// Filtros y paginación
const filtros = {
  query: '',
  prenda: '',
  usuario: '',
  fecha: '',
  prioridad: ''
};

let paginacion = {
  pagina: 1,
  porPagina: 10
};

/**
 * Carga inicial del resumen de procesos y KPIs superiores
 */
export async function loadProcesos() {
  const token = window.token;
  try {
    const res = await fetch(`${API}/prendas/stock/resumen`, {
      headers: { 'x-access-token': token }
    });
    const data = await res.json();
    resumenStockGlobal = Array.isArray(data) ? data : [];

    // Calcular total global de prendas en planta
    totalPrendasGlobal = resumenStockGlobal.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);

    // Actualizar KPI 1: Total Prendas
    const kpiTotalEl = document.getElementById('procKpiTotalPrendas');
    if (kpiTotalEl) kpiTotalEl.textContent = totalPrendasGlobal;

    // Actualizar KPI 2: Lotes Activos (contar estaciones con carga activa)
    const estacionesActivas = resumenStockGlobal.filter(p => Number(p.cantidad) > 0).length;
    const kpiLotesEl = document.getElementById('procKpiLotes');
    if (kpiLotesEl) {
      kpiLotesEl.textContent = String(Math.max(1, estacionesActivas)).padStart(2, '0');
    }

    // Actualizar las 10 tarjetas de estaciones de trabajo
    const stockMap = {};
    resumenStockGlobal.forEach(p => {
      stockMap[p.proceso] = Number(p.cantidad) || 0;
    });

    Object.keys(PROCESO_CONFIG).forEach(etapa => {
      const cant = stockMap[etapa] || 0;
      const countEl = document.getElementById(`count-${etapa}`);
      if (countEl) countEl.textContent = cant;

      const pct = totalPrendasGlobal > 0 ? ((cant / totalPrendasGlobal) * 100).toFixed(1) + '%' : '0.0%';
      const pctEl = document.getElementById(`pct-${etapa}`);
      if (pctEl) pctEl.textContent = pct;
    });

    // Cargar catálogos auxiliares en background para modales y filtros
    cargarCatalogosAuxiliares();

    // Ver según la vista activa (Kanban o Tabla)
    if (vistaModoActual === 'kanban') {
      await cargarTableroKanban();
    } else {
      await verProceso(etapaSeleccionada || 'sucio');
    }
  } catch (err) {
    console.error('Error cargando procesos:', err);
  }
}

/**
 * Carga de catálogos para filtros y formularios
 */
async function cargarCatalogosAuxiliares() {
  const token = window.token;
  try {
    if (prendasCatalogo.length === 0) {
      const resP = await fetch(`${API}/prendas`, { headers: { 'x-access-token': token } });
      prendasCatalogo = await resP.json();
      if (!Array.isArray(prendasCatalogo)) prendasCatalogo = [];
    }
    if (departamentosCatalogo.length === 0) {
      const resD = await fetch(`${API}/departamentos`, { headers: { 'x-access-token': token } });
      departamentosCatalogo = await resD.json();
      if (!Array.isArray(departamentosCatalogo)) departamentosCatalogo = [];
    }
  } catch (e) {
    console.warn('Error cargando catálogos auxiliares:', e);
  }
}

/**
 * Selecciona una etapa y actualiza las tarjetas y la tabla inferior
 */
export async function verProceso(proceso) {
  if (!PROCESO_CONFIG[proceso]) proceso = 'sucio';
  etapaSeleccionada = proceso;

  // Actualizar estados visuales de las 10 tarjetas de etapas
  Object.keys(PROCESO_CONFIG).forEach(key => {
    const cardEl = document.getElementById(`card-etapa-${key}`);
    const indEl = document.getElementById(`indicator-${key}`);
    if (!cardEl) return;

    const topRow = cardEl.querySelector('.etapa-top-row');
    const pct = document.getElementById(`pct-${key}`)?.textContent || '0.0%';

    if (key === proceso) {
      cardEl.classList.add('is-active');
      if (indEl) indEl.style.display = 'block';
      if (topRow) {
        topRow.innerHTML = `
          <span class="etapa-badge-active" id="badge-active-${key}"><span class="mi" style="font-size:11px;">layers</span>VIENDO ETAPA</span>
          <span class="etapa-pct-pill" id="pct-${key}">${pct}</span>
        `;
      }
    } else {
      cardEl.classList.remove('is-active');
      if (indEl) indEl.style.display = 'none';
      if (topRow) {
        topRow.innerHTML = `
          <span class="mi etapa-icon">${PROCESO_CONFIG[key].icon}</span>
          <span class="etapa-pct-pill" id="pct-${key}">${pct}</span>
        `;
      }
    }
  });

  const detailEl = document.getElementById('procesoDetail');
  if (!detailEl) return;

  // Mostrar spinner de carga rápido
  detailEl.innerHTML = `
    <div class="etapa-detail-card" style="padding:40px; text-align:center;">
      <span class="mi" style="font-size:32px; color:#0284c7; animation: livePulse 1s infinite;">sync</span>
      <p style="color:#64748b; font-size:13px; margin-top:10px;">Consultando registros de ${PROCESO_CONFIG[proceso].nombre}...</p>
    </div>
  `;

  const token = window.token;
  try {
    const res = await fetch(`${API}/procesos/por-proceso/${proceso}`, {
      headers: { 'x-access-token': token }
    });
    const data = await res.json();
    registrosEtapaActual = Array.isArray(data) ? data : [];
    paginacion.pagina = 1;
    renderizarDetalleProceso();
  } catch (err) {
    console.error('Error cargando registros de etapa:', err);
    detailEl.innerHTML = `
      <div class="etapa-detail-card" style="padding:30px; text-align:center; color:#ef4444;">
        <span class="mi" style="font-size:28px;">error_outline</span>
        <p>No se pudieron obtener los registros de esta etapa.</p>
      </div>
    `;
  }
}

/**
 * Renderiza la tarjeta de detalle (Banner, Filtros, Tabla y Paginación)
 */
function renderizarDetalleProceso() {
  const detailEl = document.getElementById('procesoDetail');
  if (!detailEl) return;

  const cfg = PROCESO_CONFIG[etapaSeleccionada] || PROCESO_CONFIG.sucio;

  // Aplicar filtros locales
  const filtrados = registrosEtapaActual.filter(item => {
    // Filtro texto libre
    if (filtros.query) {
      const q = filtros.query.toLowerCase().trim();
      const code = `#LAV-${String(item.id).padStart(4, '0')}`.toLowerCase();
      const name = (item.prenda_nombre || '').toLowerCase();
      const desc = (item.prenda_descripcion || '').toLowerCase();
      const depto = (item.departamento_nombre || '').toLowerCase();
      const match = code.includes(q) || name.includes(q) || desc.includes(q) || depto.includes(q);
      if (!match) return false;
    }

    // Filtro prenda
    if (filtros.prenda && String(item.prenda_id) !== String(filtros.prenda) && item.prenda_nombre !== filtros.prenda) {
      return false;
    }

    // Filtro usuario
    if (filtros.usuario && item.usuario_ingreso !== filtros.usuario) {
      return false;
    }

    // Filtro fecha
    if (filtros.fecha) {
      const fechaItem = (item.fecha_ingreso || item.fecha_actualizacion || '').slice(0, 10);
      if (fechaItem !== filtros.fecha) return false;
    }

    // Filtro prioridad
    if (filtros.prioridad) {
      const itemPrio = (item.cantidad > 50) ? 'alta' : 'normal';
      if (itemPrio !== filtros.prioridad.toLowerCase()) return false;
    }

    return true;
  });

  const totalRegs = filtrados.length;
  const totalUnidades = filtrados.reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);

  // Obtener opciones únicas para los selects de filtro
  const distinctPrendas = [...new Set(registrosEtapaActual.map(r => r.prenda_nombre).filter(Boolean))];
  const distinctUsuarios = [...new Set(registrosEtapaActual.map(r => r.usuario_ingreso).filter(Boolean))];

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(totalRegs / paginacion.porPagina));
  if (paginacion.pagina > totalPaginas) paginacion.pagina = totalPaginas;
  const inicio = (paginacion.pagina - 1) * paginacion.porPagina;
  const fin = Math.min(inicio + paginacion.porPagina, totalRegs);
  const itemsPagina = filtrados.slice(inicio, fin);

  // Determinar chips de filtros activos
  const activeChips = [];
  if (filtros.query) {
    activeChips.push({ key: 'query', label: `Nombre: "${filtros.query}"` });
  }
  if (filtros.prenda) {
    activeChips.push({ key: 'prenda', label: `Prenda: ${filtros.prenda}` });
  }
  if (filtros.usuario) {
    activeChips.push({ key: 'usuario', label: `Usuario: ${filtros.usuario}` });
  }
  if (filtros.fecha) {
    activeChips.push({ key: 'fecha', label: `Fecha: ${filtros.fecha}` });
  }
  if (filtros.prioridad) {
    activeChips.push({ key: 'prioridad', label: `Prioridad: ${filtros.prioridad}` });
  }

  // Generar HTML principal del detalle
  detailEl.innerHTML = `
    <div class="etapa-detail-card">
      <!-- Banner de la Etapa Seleccionada -->
      <div class="etapa-banner" style="background-color: ${cfg.color};">
        <div class="etapa-banner-left">
          <h3 class="etapa-banner-title">
            <span class="mi" style="font-size:18px;">format_list_bulleted</span>
            Prendas en ${cfg.nombre.toUpperCase()}
          </h3>
          <span class="etapa-badge-regs">${totalRegs} ${totalRegs === 1 ? 'registro' : 'registros'}</span>
          <span class="etapa-badge-units">${totalUnidades} unidades acumuladas</span>
        </div>
        <div>
          <button type="button" class="btn-transferir-lote" onclick="transferirLoteRapido()">
            <span class="mi" style="font-size:15px;">swap_horiz</span>
            Transferir lote rápido
          </button>
        </div>
      </div>

      <!-- Barra de Filtros y Búsqueda -->
      <div class="etapa-filters-bar" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:12px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div class="etapa-filters-left" style="display:flex; flex-direction:row; align-items:center; gap:10px; flex-wrap:wrap; flex:1 1 auto;">
          <!-- Búsqueda con Clear -->
          <div class="etapa-search-wrap" style="position:relative; width:240px; min-width:180px; max-width:280px; flex:0 1 240px;">
            <span class="mi search-icon" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:17px; z-index:2;">search</span>
            <input
              type="text"
              id="filtroPrendaProceso"
              class="etapa-search-input"
              style="width:100% !important; height:38px !important; min-height:38px !important; padding:6px 30px 6px 36px !important; border:1px solid #cbd5e1 !important; border-radius:7px !important; font-size:12.5px !important; background:#ffffff !important; box-shadow:none !important;"
              placeholder="Buscar prenda, código..."
              value="${escapeHtml(filtros.query)}"
              oninput="onInputBusquedaProceso(this.value)"
            >
            <span
              id="clearSearchProceso"
              class="etapa-search-clear"
              style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#94a3b8; cursor:pointer; font-size:14px; display:${filtros.query ? 'block' : 'none'}; z-index:2;"
              onclick="limpiarBusquedaProceso()"
            >✕</span>
          </div>

          <!-- Selector Prenda -->
          <select id="filtroTipoPrenda" class="etapa-select-filter" style="width:auto !important; min-width:140px !important; max-width:200px !important; flex:0 0 auto !important; height:38px !important; min-height:38px !important; padding:6px 12px !important; font-size:12.5px !important; border:1px solid #cbd5e1 !important; border-radius:7px !important; background:#ffffff !important;" onchange="onChangeFiltroPrenda(this.value)">
            <option value="">Prendas (Todas)</option>
            ${distinctPrendas.map(p => `
              <option value="${escapeHtml(p)}" ${filtros.prenda === p ? 'selected' : ''}>${escapeHtml(p)}</option>
            `).join('')}
          </select>

          <!-- Selector Usuario -->
          <select id="filtroUsuarioProceso" class="etapa-select-filter" style="width:auto !important; min-width:140px !important; max-width:180px !important; flex:0 0 auto !important; height:38px !important; min-height:38px !important; padding:6px 12px !important; font-size:12.5px !important; border:1px solid #cbd5e1 !important; border-radius:7px !important; background:#ffffff !important;" onchange="onChangeFiltroUsuario(this.value)">
            <option value="">Todos los usuarios</option>
            ${distinctUsuarios.map(u => `
              <option value="${escapeHtml(u)}" ${filtros.usuario === u ? 'selected' : ''}>${escapeHtml(u)}</option>
            `).join('')}
          </select>

          <!-- Selector Fecha -->
          <input
            type="date"
            id="filtroFechaProceso"
            class="etapa-select-filter"
            style="width:auto !important; min-width:135px !important; max-width:160px !important; flex:0 0 auto !important; height:38px !important; min-height:38px !important; padding:6px 10px !important; font-size:12.5px !important; border:1px solid #cbd5e1 !important; border-radius:7px !important; background:#ffffff !important;"
            value="${filtros.fecha}"
            title="Filtrar por fecha"
            onchange="onChangeFiltroFecha(this.value)"
          >

          <!-- Selector Prioridad -->
          <select id="filtroPrioridadProceso" class="etapa-select-filter" style="width:auto !important; min-width:130px !important; max-width:160px !important; flex:0 0 auto !important; height:38px !important; min-height:38px !important; padding:6px 12px !important; font-size:12.5px !important; border:1px solid #cbd5e1 !important; border-radius:7px !important; background:#ffffff !important;" onchange="onChangeFiltroPrioridad(this.value)">
            <option value="">Prioridad: Todas</option>
            <option value="normal" ${filtros.prioridad === 'normal' ? 'selected' : ''}>Prioridad: Normal</option>
            <option value="alta" ${filtros.prioridad === 'alta' ? 'selected' : ''}>Prioridad: Alta</option>
          </select>
        </div>

        <div class="etapa-filters-right">
          <button type="button" class="btn-export-excel" onclick="exportarProcesosExcel()">
            <span class="mi" style="font-size:15px;">table_view</span>
            Exportar Excel
          </button>
          <button type="button" class="btn-export-pdf" onclick="exportarProcesosPDF()">
            <span class="mi" style="font-size:15px;">picture_as_pdf</span>
            PDF
          </button>
        </div>
      </div>

      <!-- Fila de Chips de Filtros Activos (si hay alguno activo) -->
      ${activeChips.length > 0 ? `
        <div class="etapa-active-chips-row">
          <span>Filtros aplicados:</span>
          ${activeChips.map(chip => `
            <span class="active-chip">
              ${escapeHtml(chip.label)}
              <span class="active-chip-remove" onclick="removerChipFiltro('${chip.key}')">✕</span>
            </span>
          `).join('')}
          <span class="btn-clear-all-chips" onclick="limpiarTodosFiltrosProceso()">Limpiar filtros</span>
        </div>
      ` : ''}

      <!-- Tabla de Registros ERP -->
      <div style="overflow-x:auto;">
        <table class="table-procesos-erp">
          <thead>
            <tr>
              <th class="td-col-check">
                <input type="checkbox" id="checkAllProcesos" onchange="toggleSelectAllProcesos(this)">
              </th>
              <th>TICKET / CÓDIGO</th>
              <th>PRENDA / DESCRIPCIÓN</th>
              <th style="text-align:center;">CANTIDAD</th>
              <th style="text-align:center;">PRIORIDAD</th>
              <th>USUARIO REGISTRO</th>
              <th>FECHA Y HORA</th>
              <th style="text-align:center;">TIEMPO EN ETAPA</th>
              <th style="text-align:center;">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            ${itemsPagina.length === 0 ? `
              <tr>
                <td colspan="9">
                  <div style="padding:48px 20px; text-align:center; color:#94a3b8;">
                    <span class="mi" style="font-size:44px; color:#cbd5e1; margin-bottom:8px; display:inline-block;">inbox</span>
                    <h4 style="margin:0 0 4px 0; color:#475569; font-size:15px; font-weight:700;">No hay prendas en etapa ${cfg.nombre}</h4>
                    <p style="margin:0; font-size:12.5px;">Haz clic en <strong>+ Ingresar Prendas a Proceso</strong> para añadir prendas a esta estación.</p>
                  </div>
                </td>
              </tr>
            ` : itemsPagina.map(item => renderRowItem(item, cfg)).join('')}
          </tbody>
        </table>
      </div>

      <!-- Footer con Totales y Paginación -->
      <div class="procesos-table-footer">
        <div>
          Mostrando ${totalRegs > 0 ? inicio + 1 : 0} a ${fin} de ${totalRegs} registros en etapa ${cfg.nombre} &nbsp;|&nbsp; Total acumulado: <strong>${totalUnidades} prendas</strong>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>Filas por página:</span>
            <select class="etapa-select-filter" style="height:28px; padding:2px 8px; font-size:12px;" onchange="cambiarFilasPorPagina(this.value)">
              <option value="10" ${paginacion.porPagina === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${paginacion.porPagina === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${paginacion.porPagina === 50 ? 'selected' : ''}>50</option>
            </select>
          </div>
          <div class="procesos-pagination">
            <button
              type="button"
              class="btn-page-step"
              ${paginacion.pagina <= 1 ? 'disabled style="opacity:0.4; cursor:default;"' : ''}
              onclick="cambiarPaginaProcesos(-1)"
            >‹</button>
            <span class="page-pill-active">${paginacion.pagina}</span>
            <button
              type="button"
              class="btn-page-step"
              ${paginacion.pagina >= totalPaginas ? 'disabled style="opacity:0.4; cursor:default;"' : ''}
              onclick="cambiarPaginaProcesos(1)"
            >›</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera el HTML de una fila de la tabla ERP
 */
function renderRowItem(item, cfg) {
  const loteNum = String((Number(item.id) % 20) + 1).padStart(2, '0');
  const isPriorityHigh = Number(item.cantidad) > 50;
  const userInit = (item.usuario_ingreso || 'A').charAt(0).toUpperCase();
  const userName = item.usuario_ingreso || 'Administrador';
  const tiempoEtapa = calcularTiempoEtapa(item.fecha_actualizacion || item.fecha_ingreso);
  const fechaFancy = formatFechaFancy(item.fecha_ingreso || item.fecha_actualizacion);
  const siguienteKey = cfg.siguiente;
  const siguienteCfg = siguienteKey ? PROCESO_CONFIG[siguienteKey] : null;

  return `
    <tr>
      <td class="td-col-check">
        <input type="checkbox" class="check-proceso-item" value="${item.id}" data-cant="${item.cantidad}">
      </td>
      <td>
        <div class="td-ticket-cell">
          <span class="ticket-code-pill">#LAV-${String(item.id).padStart(4, '0')}</span>
          <span class="ticket-lote-text">Lote ${loteNum}</span>
        </div>
      </td>
      <td>
        <div class="td-prenda-cell">
          <div class="prenda-icon-box">
            <span class="mi">checkroom</span>
          </div>
          <div class="prenda-meta">
            <span class="prenda-meta-title">${escapeHtml(item.prenda_nombre || 'PRENDA')}</span>
            <span class="prenda-meta-desc">
              ${item.departamento_nombre ? `Categoría: ${escapeHtml(item.departamento_nombre)} · ` : ''}
              ${escapeHtml(item.prenda_descripcion || 'Uso textil industrial')}
            </span>
          </div>
        </div>
      </td>
      <td style="text-align:center;">
        <span class="cantidad-pill-stage" style="background:${cfg.color};">
          ${item.cantidad} pzas
        </span>
      </td>
      <td style="text-align:center;">
        <span class="priority-pill ${isPriorityHigh ? 'priority-alta' : 'priority-normal'}">
          <span class="priority-dot"></span>
          ${isPriorityHigh ? 'Alta' : 'Normal'}
        </span>
      </td>
      <td>
        <div class="user-cell-wrap">
          <div class="user-cell-avatar">${userInit}</div>
          <span>${escapeHtml(userName)}</span>
        </div>
      </td>
      <td>
        ${fechaFancy}
      </td>
      <td style="text-align:center;">
        <span class="badge-time-stage">
          <span class="mi">schedule</span>
          ${tiempoEtapa}
        </span>
      </td>
      <td style="text-align:center;">
        ${siguienteCfg ? `
          <button
            type="button"
            class="btn-mover-next"
            onclick="moverRegistroProceso(${item.id}, '${siguienteKey}')"
            title="Mover a etapa ${siguienteCfg.nombre}"
          >
            Mover a ${siguienteCfg.nombre} <span class="mi">arrow_forward</span>
          </button>
        ` : `
          <span style="color:#059669; font-weight:700; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
            <span class="mi" style="font-size:16px;">check_circle</span> En Almacén
          </span>
        `}
      </td>
    </tr>
  `;
}

/**
 * Mueve un registro al siguiente proceso
 */
export async function moverRegistroProceso(registroId, procesoDestino) {
  const token = window.token;
  try {
    const res = await fetch(`${API}/procesos/mover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      },
      body: JSON.stringify({
        registro_id: registroId,
        proceso_destino: procesoDestino
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al mover la prenda');
    }

    const destinoNombre = PROCESO_CONFIG[procesoDestino]?.nombre || procesoDestino;
    showToast(`Prenda transferida a etapa ${destinoNombre} exitosamente`, 'success');

    // Refrescar datos y mantener vista actualizada
    await loadProcesos();
  } catch (err) {
    console.error('Error al mover prenda:', err);
    showToast(err.message || 'Error al transferir prenda', 'error');
  }
}

/**
 * Abre el modal para ingresar prendas a un proceso
 */
export async function abrirModalIngresarProceso() {
  await cargarCatalogosAuxiliares();

  const modal = document.getElementById('modalIngresarProceso');
  const prendaSelect = document.getElementById('procIngresoPrenda');
  const deptoSelect = document.getElementById('procIngresoDepto');
  const estacionSelect = document.getElementById('procIngresoEstacion');
  const cantInput = document.getElementById('procIngresoCantidad');

  if (prendaSelect) {
    prendaSelect.innerHTML = `
      <option value="">Selecciona una prenda...</option>
      ${prendasCatalogo.map(p => `
        <option value="${p.id}">${escapeHtml(p.nombre)} (${p.categoria || 'General'})</option>
      `).join('')}
    `;
  }

  if (deptoSelect) {
    deptoSelect.innerHTML = `
      <option value="">Planta Principal (Sin Depto asignado)</option>
      ${departamentosCatalogo.map(d => `
        <option value="${d.id}">${escapeHtml(d.nombre)}</option>
      `).join('')}
    `;
  }

  if (estacionSelect) {
    estacionSelect.value = etapaSeleccionada || 'sucio';
  }

  if (cantInput) {
    cantInput.value = '';
  }

  if (modal) modal.classList.add('show');
}

export function cerrarModalIngresarProceso() {
  const modal = document.getElementById('modalIngresarProceso');
  if (modal) modal.classList.remove('show');
}

/**
 * Guarda el ingreso directo de prendas al proceso
 */
export async function guardarIngresoProceso(event) {
  if (event) event.preventDefault();

  const prendaId = document.getElementById('procIngresoPrenda')?.value;
  const cantidad = Number(document.getElementById('procIngresoCantidad')?.value);
  const proceso = document.getElementById('procIngresoEstacion')?.value || 'sucio';
  const depto = document.getElementById('procIngresoDepto')?.value || null;

  if (!prendaId || !cantidad || cantidad <= 0) {
    showToast('Por favor completa todos los campos requeridos', 'warning');
    return;
  }

  const token = window.token;
  try {
    const res = await fetch(`${API}/procesos/ingresar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      },
      body: JSON.stringify({
        prenda_id: prendaId,
        cantidad: cantidad,
        proceso: proceso,
        departamento_origen: depto
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al ingresar prendas');
    }

    showToast(`Se ingresaron ${cantidad} prendas a la estación ${PROCESO_CONFIG[proceso]?.nombre || proceso}`, 'success');
    cerrarModalIngresarProceso();
    etapaSeleccionada = proceso;
    await loadProcesos();
  } catch (err) {
    console.error('Error ingresando prendas:', err);
    showToast(err.message || 'Error al procesar ingreso', 'error');
  }
}

/**
 * Modal y lógica para mover en lote
 */
export function abrirModalMoverLote() {
  const modal = document.getElementById('modalMoverLote');
  const origenText = document.getElementById('procLoteOrigenText');
  const origenVal = document.getElementById('procLoteOrigenVal');
  const destinoSelect = document.getElementById('procLoteDestino');
  const infoText = document.getElementById('procLoteInfoText');

  const cfg = PROCESO_CONFIG[etapaSeleccionada] || PROCESO_CONFIG.sucio;

  if (origenText) origenText.value = `${cfg.numero}. ${cfg.nombre.toUpperCase()}`;
  if (origenVal) origenVal.value = etapaSeleccionada;

  if (destinoSelect && cfg.siguiente) {
    destinoSelect.value = cfg.siguiente;
  }

  // Verificar si hay elementos seleccionados con checkbox
  const checkedBoxes = Array.from(document.querySelectorAll('.check-proceso-item:checked'));
  if (infoText) {
    if (checkedBoxes.length > 0) {
      const sumChecked = checkedBoxes.reduce((acc, cb) => acc + (Number(cb.dataset.cant) || 0), 0);
      infoText.innerHTML = `Transfiriendo <strong>${checkedBoxes.length} registros seleccionados</strong> (${sumChecked} prendas).`;
    } else {
      const totalPrendasEtapa = registrosEtapaActual.reduce((acc, r) => acc + (Number(r.cantidad) || 0), 0);
      infoText.innerHTML = `Transfiriendo <strong>todos los ${registrosEtapaActual.length} registros</strong> de ${cfg.nombre} (${totalPrendasEtapa} prendas).`;
    }
  }

  if (modal) modal.classList.add('show');
}

export function cerrarModalMoverLote() {
  const modal = document.getElementById('modalMoverLote');
  if (modal) modal.classList.remove('show');
}

export function transferirLoteRapido() {
  if (registrosEtapaActual.length === 0) {
    showToast(`No hay prendas en la estación ${PROCESO_CONFIG[etapaSeleccionada]?.nombre || etapaSeleccionada} para transferir`, 'warning');
    return;
  }
  abrirModalMoverLote();
}

/**
 * Ejecuta la transferencia en lote de prendas
 */
export async function ejecutarMoverLote(event) {
  if (event) event.preventDefault();

  const procesoDestino = document.getElementById('procLoteDestino')?.value;
  if (!procesoDestino) return;

  const checkedBoxes = Array.from(document.querySelectorAll('.check-proceso-item:checked'));
  const targets = checkedBoxes.length > 0
    ? checkedBoxes.map(cb => Number(cb.value))
    : registrosEtapaActual.map(r => r.id);

  if (targets.length === 0) {
    showToast('No hay registros para transferir', 'warning');
    return;
  }

  const token = window.token;
  let exitos = 0;

  for (const regId of targets) {
    try {
      const res = await fetch(`${API}/procesos/mover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token
        },
        body: JSON.stringify({
          registro_id: regId,
          proceso_destino: procesoDestino
        })
      });
      if (res.ok) exitos++;
    } catch (e) {
      console.warn(`Error moviendo registro ${regId}:`, e);
    }
  }

  cerrarModalMoverLote();
  showToast(`Se transfirieron ${exitos} registro(s) a ${PROCESO_CONFIG[procesoDestino]?.nombre || procesoDestino}`, 'success');
  await loadProcesos();
}

/**
 * Manejadores de Filtros
 */
export function onInputBusquedaProceso(val) {
  filtros.query = val;
  const clearBtn = document.getElementById('clearSearchProceso');
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function limpiarBusquedaProceso() {
  filtros.query = '';
  const searchInput = document.getElementById('filtroPrendaProceso');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('clearSearchProceso');
  if (clearBtn) clearBtn.style.display = 'none';
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function onChangeFiltroPrenda(val) {
  filtros.prenda = val;
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function onChangeFiltroUsuario(val) {
  filtros.usuario = val;
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function onChangeFiltroFecha(val) {
  filtros.fecha = val;
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function onChangeFiltroPrioridad(val) {
  filtros.prioridad = val;
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function removerChipFiltro(key) {
  if (key === 'query') {
    limpiarBusquedaProceso();
  } else {
    filtros[key] = '';
    paginacion.pagina = 1;
    renderizarDetalleProceso();
  }
}

export function limpiarTodosFiltrosProceso() {
  filtros.query = '';
  filtros.prenda = '';
  filtros.usuario = '';
  filtros.fecha = '';
  filtros.prioridad = '';
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

/**
 * Paginación y selección de filas
 */
export function cambiarPaginaProcesos(delta) {
  paginacion.pagina += delta;
  renderizarDetalleProceso();
}

export function cambiarFilasPorPagina(val) {
  paginacion.porPagina = Number(val) || 10;
  paginacion.pagina = 1;
  renderizarDetalleProceso();
}

export function toggleSelectAllProcesos(masterCheckbox) {
  const checkboxes = document.querySelectorAll('.check-proceso-item');
  checkboxes.forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
}

/**
 * Exportaciones a Excel y PDF
 */
export function exportarProcesosExcel() {
  if (registrosEtapaActual.length === 0) {
    showToast('No hay datos para exportar en esta etapa', 'warning');
    return;
  }

  const headers = ['ID', 'Ticket', 'Prenda', 'Descripcion', 'Cantidad', 'Etapa', 'Usuario', 'Fecha'];
  const rows = registrosEtapaActual.map(r => [
    r.id,
    `LAV-${String(r.id).padStart(4, '0')}`,
    `"${(r.prenda_nombre || '').replace(/"/g, '""')}"`,
    `"${(r.prenda_descripcion || '').replace(/"/g, '""')}"`,
    r.cantidad,
    etapaSeleccionada.toUpperCase(),
    `"${(r.usuario_ingreso || '').replace(/"/g, '""')}"`,
    r.fecha_ingreso || ''
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `procesos_${etapaSeleccionada}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Archivo CSV generado y descargado', 'success');
}

export function exportarProcesosPDF() {
  window.print();
}

/**
 * Utilidades de fecha y formato
 */
function formatFechaFancy(dateStr) {
  if (!dateStr) return '<span style="color:#94a3b8;">-</span>';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dia = d.getDate();
    const mes = meses[d.getMonth()];
    const anio = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `
      <div>
        <div style="font-weight:600; color:#1e293b;">${dia} ${mes} ${anio}</div>
        <div style="font-size:11px; color:#64748b;">${hours}:${minutes} ${ampm}</div>
      </div>
    `;
  } catch (e) {
    return dateStr;
  }
}

function calcularTiempoEtapa(dateStr) {
  if (!dateStr) return '15 min';
  try {
    const d = new Date(dateStr.replace(' ', 'T')).getTime();
    const now = Date.now();
    const diffMin = Math.max(5, Math.floor((now - d) / (1000 * 60)));
    if (diffMin < 60) return `${diffMin} min`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${hours}h ${mins}m`;
  } catch (e) {
    return '35 min';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Compatibilidad con asignador de tareas en panel lateral
 */
const procesoMetaLegacy = {
  sucio: { paso: 1, color: '#e11d48', nombre: 'Sucio' },
  remojo: { paso: 2, color: '#ea580c', nombre: 'Remojo' },
  lavado: { paso: 3, color: '#ca8a04', nombre: 'Lavado' },
  tendido: { paso: 4, color: '#059669', nombre: 'Tendido' },
  recogido: { paso: 5, color: '#0d9488', nombre: 'Recogido' },
  limpio: { paso: 6, color: '#7c3aed', nombre: 'Limpio' },
  planchado: { paso: 7, color: '#334155', nombre: 'Planchado' },
  stock: { paso: 8, color: '#0891b2', nombre: 'Stock' },
  desmanche: { paso: 9, color: '#db2777', nombre: 'Desmanche' },
  reproceso: { paso: 10, color: '#2563eb', nombre: 'Reproceso' }
};

export function updateProcesoStatusBar() {
  const proceso = document.getElementById('tareaProceso')?.value;
  const fill = document.getElementById('procesoEstadoFill');
  const label = document.getElementById('procesoEstadoLabel');
  const origen = document.getElementById('procesoEstadoOrigen');
  if (!fill || !label || !origen) return;

  if (!proceso || !procesoMetaLegacy[proceso]) {
    fill.style.width = '0%';
    fill.style.backgroundColor = '#95a5a6';
    label.textContent = 'Sin seleccionar';
    origen.textContent = 'Selecciona un proceso para ver el estado de origen requerido.';
    return;
  }

  const meta = procesoMetaLegacy[proceso];
  const width = Math.max(8, (meta.paso / 10) * 100);
  fill.style.width = `${width}%`;
  fill.style.backgroundColor = meta.color;
  label.textContent = `${meta.nombre} (Paso ${meta.paso}/10)`;
}

/* ==========================================================================
   LÓGICA DEL TABLERO KANBAN INDUSTRIAL Y TRANSFERENCIA RÁPIDA
   ========================================================================== */
let vistaModoActual = 'kanban';
let kanbanData = {};
let trabajadoresKanbanCache = [];
let transferContextKanban = null;
let draggedLoteData = null;

export function cambiarVistaProcesos(modo) {
  vistaModoActual = modo;
  const btnKanban = document.getElementById('btnVistaKanban');
  const btnTabla = document.getElementById('btnVistaTabla');
  const panelKanban = document.getElementById('vistaKanbanContainer');
  const panelTabla = document.getElementById('vistaTablaContainer');

  if (modo === 'kanban') {
    if (btnKanban) btnKanban.classList.add('active');
    if (btnTabla) btnTabla.classList.remove('active');
    if (panelKanban) panelKanban.style.display = 'block';
    if (panelTabla) panelTabla.style.display = 'none';
    cargarTableroKanban();
  } else {
    if (btnKanban) btnKanban.classList.remove('active');
    if (btnTabla) btnTabla.classList.add('active');
    if (panelKanban) panelKanban.style.display = 'none';
    if (panelTabla) panelTabla.style.display = 'block';
    verProceso(etapaSeleccionada || 'sucio');
  }
}

export async function cargarTableroKanban() {
  const container = document.getElementById('kanbanBoard');
  if (!container) return;

  container.innerHTML = `
    <div style="padding:40px; text-align:center; width:100%;">
      <span class="mi" style="font-size:32px; color:#0284c7; animation: livePulse 1s infinite;">sync</span>
      <p style="color:#64748b; font-size:13px; margin-top:10px;">Cargando estaciones de trabajo...</p>
    </div>
  `;

  const token = window.token;
  try {
    const [resKanban, resTrabajadores] = await Promise.all([
      fetch(`${API}/procesos/kanban`, { headers: { 'x-access-token': token } }),
      trabajadoresKanbanCache.length === 0 
        ? fetch(`${API}/trabajadores`, { headers: { 'x-access-token': token } }) 
        : Promise.resolve(null)
    ]);

    const dataKanban = await resKanban.json();
    kanbanData = dataKanban || {};

    if (resTrabajadores) {
      const dataTrab = await resTrabajadores.json();
      trabajadoresKanbanCache = Array.isArray(dataTrab) ? dataTrab : [];
    }

    renderizarTableroKanban();
  } catch (err) {
    console.error('Error cargando Kanban:', err);
    container.innerHTML = `
      <div style="padding:30px; text-align:center; color:#ef4444; width:100%;">
        <span class="mi" style="font-size:28px;">error_outline</span>
        <p>No se pudo cargar el tablero Kanban de producción.</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="cargarTableroKanban()">Reintentar</button>
      </div>
    `;
  }
}

function renderizarTableroKanban() {
  const container = document.getElementById('kanbanBoard');
  if (!container) return;

  const PROCESOS_ORDEN = ['sucio', 'remojo', 'lavado', 'tendido', 'recogido', 'reproceso', 'limpio', 'planchado', 'desmanche', 'stock'];

  container.innerHTML = PROCESOS_ORDEN.map(key => {
    const cfg = PROCESO_CONFIG[key] || { numero: 0, nombre: key, color: '#64748b', icon: 'layers' };
    const colData = kanbanData[key] || { total_prendas: 0, total_lotes: 0, lotes: [] };
    const lotes = colData.lotes || [];

    return `
      <div 
        class="kanban-column" 
        id="kanbanCol_${key}"
        ondragover="onKanbanDragOver(event)"
        ondragleave="onKanbanDragLeave(event)"
        ondrop="onKanbanDrop(event, '${key}')"
      >
        <!-- Cabecera de Columna -->
        <div class="kanban-col-header">
          <div class="kanban-col-color-bar" style="background-color: ${cfg.color};"></div>
          <div class="kanban-col-title-row">
            <div class="kanban-col-title-left">
              <span class="kanban-col-icon" style="background: ${cfg.color}15; color: ${cfg.color};">
                <span class="mi" style="font-size:15px;">${cfg.icon}</span>
              </span>
              <span class="kanban-col-name">${cfg.numero}. ${cfg.nombre.toUpperCase()}</span>
            </div>
            <span class="kanban-col-badge-count">${colData.total_lotes}</span>
          </div>
          <div class="kanban-col-meta-row">
            <span>Carga en estación:</span>
            <span class="kanban-col-units-pill">${colData.total_prendas} prendas</span>
          </div>
        </div>

        <!-- Lista de Tarjetas / Drop Zone -->
        <div class="kanban-cards-list" id="kanbanList_${key}">
          ${lotes.length === 0 ? `
            <div class="kanban-empty-col">
              <span class="mi">inventory_2</span>
              Sin lotes en esta estación
            </div>
          ` : lotes.map(lote => renderKanbanCard(lote, cfg)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderKanbanCard(lote, cfg) {
  const safeLoteJson = encodeURIComponent(JSON.stringify(lote));
  const workerName = lote.trabajador_nombre;
  const workerInit = workerName ? workerName.trim().charAt(0).toUpperCase() : '?';
  const tiempoEtapa = calcularTiempoEtapa(lote.fecha_actualizacion || lote.fecha_ingreso);
  const sigKey = cfg.siguiente;
  const sigCfg = sigKey ? PROCESO_CONFIG[sigKey] : null;

  return `
    <div 
      class="kanban-card" 
      id="kanbanCard_${lote.registro_id}"
      draggable="true"
      ondragstart="onKanbanDragStart(event, '${safeLoteJson}')"
      ondragend="onKanbanDragEnd(event)"
    >
      <div class="kanban-card-top">
        <span class="kanban-ticket-code">#LAV-${String(lote.registro_id).padStart(4, '0')}</span>
        <span class="kanban-card-time">
          <span class="mi">schedule</span> ${tiempoEtapa}
        </span>
      </div>

      <div class="kanban-garment-row">
        <div class="kanban-garment-icon" style="color:${cfg.color};">
          <span class="mi">checkroom</span>
        </div>
        <div class="kanban-garment-meta">
          <div class="kanban-garment-name" title="${escapeHtml(lote.prenda_nombre || '')}">
            ${escapeHtml(lote.prenda_nombre || 'Prenda')}
          </div>
          <div class="kanban-garment-sub">
            <span class="kanban-qty-badge" style="background:${cfg.color};">${lote.cantidad} pzas</span>
            ${lote.requiere_plancha === 0 ? '<span style="font-size:10px; color:#64748b;">(Sin plancha)</span>' : ''}
          </div>
        </div>
      </div>

      <div class="kanban-worker-row">
        ${workerName ? `
          <div class="kanban-worker-badge" title="Operario asignado: ${escapeHtml(workerName)}">
            <div class="kanban-worker-avatar" style="background:${cfg.color};">${workerInit}</div>
            <span style="max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(workerName)}</span>
          </div>
        ` : `
          <div class="kanban-worker-none">
            <span class="mi" style="font-size:13px;">person_outline</span>
            <span>Sin asignar</span>
          </div>
        `}

        ${Number(lote.total_pago || 0) > 0 ? `
          <span class="kanban-pay-pill">Q ${Number(lote.total_pago).toFixed(2)}</span>
        ` : ''}
      </div>

      ${sigCfg ? `
        <button 
          type="button" 
          class="btn-kanban-avanzar" 
          onclick="abrirModalTransferirKanban('${safeLoteJson}', '${sigKey}')"
          title="Avanzar lote a ${sigCfg.nombre}"
        >
          <span>Avanzar a ${sigCfg.nombre}</span>
          <span class="mi">arrow_forward</span>
        </button>
      ` : `
        <div style="font-size:11px; color:#059669; font-weight:700; text-align:center; padding:4px 0; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span class="mi" style="font-size:14px;">check_circle</span> Listo en Almacén
        </div>
      `}
    </div>
  `;
}

export function onKanbanDragStart(event, safeLoteJson) {
  try {
    draggedLoteData = JSON.parse(decodeURIComponent(safeLoteJson));
    event.dataTransfer.setData('text/plain', safeLoteJson);
    event.dataTransfer.effectAllowed = 'move';
    if (event.currentTarget) {
      event.currentTarget.classList.add('is-dragging');
    }
  } catch (e) {
    console.error('Error drag start:', e);
  }
}

export function onKanbanDragEnd(event) {
  if (event.currentTarget) {
    event.currentTarget.classList.remove('is-dragging');
  }
  document.querySelectorAll('.kanban-column.drag-over').forEach(el => el.classList.remove('drag-over'));
}

export function onKanbanDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const col = event.currentTarget;
  if (col && !col.classList.contains('drag-over')) {
    col.classList.add('drag-over');
  }
}

export function onKanbanDragLeave(event) {
  const col = event.currentTarget;
  if (col) {
    col.classList.remove('drag-over');
  }
}

export function onKanbanDrop(event, procesoDestino) {
  event.preventDefault();
  const col = event.currentTarget;
  if (col) col.classList.remove('drag-over');

  let lote = draggedLoteData;
  if (!lote) {
    const raw = event.dataTransfer.getData('text/plain');
    if (raw) {
      try { lote = JSON.parse(decodeURIComponent(raw)); } catch (_) {}
    }
  }

  if (!lote) return;

  if (lote.proceso === procesoDestino) {
    showToast(`El lote ya se encuentra en ${PROCESO_CONFIG[procesoDestino]?.nombre || procesoDestino}`, 'info');
    return;
  }

  // Verificar si la prenda no requiere planchado y se quiere enviar a planchado
  if (procesoDestino === 'planchado' && Number(lote.requiere_plancha) === 0) {
    showToast(`La prenda "${lote.prenda_nombre}" no requiere planchado. Dirígelo a Stock.`, 'warning');
    abrirModalTransferirKanban(encodeURIComponent(JSON.stringify(lote)), 'stock');
    return;
  }

  abrirModalTransferirKanban(encodeURIComponent(JSON.stringify(lote)), procesoDestino);
}

export function abrirModalTransferirKanban(loteDataRaw, procesoDestino) {
  let lote = null;
  if (typeof loteDataRaw === 'string') {
    try { lote = JSON.parse(decodeURIComponent(loteDataRaw)); } catch (_) {}
  } else {
    lote = loteDataRaw;
  }

  if (!lote) return;

  // Si no se proporcionó destino, calcular el siguiente
  if (!procesoDestino) {
    const cfg = PROCESO_CONFIG[lote.proceso];
    if (cfg && cfg.siguiente) {
      if (lote.proceso === 'recogido' && Number(lote.requiere_plancha) === 0) {
        procesoDestino = 'stock';
      } else {
        procesoDestino = cfg.siguiente;
      }
    } else {
      procesoDestino = 'stock';
    }
  }

  transferContextKanban = {
    lote,
    procesoOrigen: lote.proceso,
    procesoDestino: procesoDestino,
    trabajadorId: null,
    trabajador: null,
    tarifaUnitaria: 0
  };

  const modal = document.getElementById('modalAvanzarKanban');
  const origenEl = document.getElementById('kanbanOrigenText');
  const destinoEl = document.getElementById('kanbanDestinoText');
  const prendaEl = document.getElementById('kanbanPrendaNombre');
  const stockEl = document.getElementById('kanbanStockDisponibleText');
  const ticketEl = document.getElementById('kanbanTicketCode');
  const cantInput = document.getElementById('kanbanCantidad');
  const groupTrab = document.getElementById('groupKanbanTrabajador');

  const cfgOrigen = PROCESO_CONFIG[lote.proceso] || { nombre: lote.proceso };
  const cfgDestino = PROCESO_CONFIG[procesoDestino] || { nombre: procesoDestino };

  if (origenEl) {
    origenEl.textContent = cfgOrigen.nombre.toUpperCase();
    origenEl.style.color = cfgOrigen.color || '#0f172a';
  }

  if (destinoEl) {
    destinoEl.textContent = cfgDestino.nombre.toUpperCase();
    destinoEl.style.color = cfgDestino.color || '#0284c7';
  }

  if (prendaEl) prendaEl.textContent = lote.prenda_nombre || 'Prenda';
  if (stockEl) stockEl.textContent = `Stock disponible en etapa: ${lote.cantidad} piezas`;
  if (ticketEl) ticketEl.textContent = `#LAV-${String(lote.registro_id).padStart(4, '0')}`;
  if (cantInput) {
    cantInput.max = lote.cantidad;
    cantInput.value = lote.cantidad;
  }

  const esDestinoStock = procesoDestino === 'stock';
  if (groupTrab) {
    groupTrab.style.display = esDestinoStock ? 'none' : 'block';
  }

  transferContextKanban.trabajadorId = null;
  transferContextKanban.trabajador = null;
  const trabNombreTag = document.getElementById('kanbanTrabajadorSeleccionadoNombre');
  if (trabNombreTag) trabNombreTag.textContent = esDestinoStock ? 'No aplica (Almacén)' : 'Selecciona un operario...';
  const hiddenId = document.getElementById('kanbanTrabajadorId');
  if (hiddenId) hiddenId.value = '';

  renderizarOperariosKanban(trabajadoresKanbanCache);
  calcularTotalKanbanEnVivo();

  if (modal) modal.classList.add('show');
}

export function cerrarModalAvanzarKanban() {
  const modal = document.getElementById('modalAvanzarKanban');
  if (modal) modal.classList.remove('show');
  transferContextKanban = null;
}

export function ajustarKanbanCantidad(delta) {
  if (!transferContextKanban) return;
  const input = document.getElementById('kanbanCantidad');
  if (!input) return;

  const max = Number(transferContextKanban.lote.cantidad) || 1;
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, Math.min(max, val + delta));
  input.value = val;
  calcularTotalKanbanEnVivo();
}

export function setKanbanCantidadTotal() {
  if (!transferContextKanban) return;
  const input = document.getElementById('kanbanCantidad');
  if (!input) return;

  input.value = transferContextKanban.lote.cantidad;
  calcularTotalKanbanEnVivo();
}

function renderizarOperariosKanban(lista) {
  const container = document.getElementById('kanbanWorkersGrid');
  if (!container) return;

  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1; padding:10px; color:#94a3b8; text-align:center; font-size:12px;">No hay operarios registrados</div>';
    return;
  }

  container.innerHTML = lista.map(t => {
    const isSelected = transferContextKanban && transferContextKanban.trabajadorId === t.id;
    const initial = (t.nombre || 'T').charAt(0).toUpperCase();
    const safeName = String(t.nombre).replace(/'/g, "\\'");

    return `
      <div 
        class="kanban-worker-pick ${isSelected ? 'selected' : ''}" 
        id="kanbanWorkerPick_${t.id}"
        onclick="seleccionarOperarioKanban(${t.id}, '${safeName}')"
      >
        <div class="kanban-worker-pick-avatar">${initial}</div>
        <div style="flex:1; min-width:0;">
          <div class="kanban-worker-pick-name" title="${escapeHtml(t.nombre)}">${escapeHtml(t.nombre)}</div>
          <div style="font-size:10px; color:#64748b;">${t.factura ? 'Factura' : 'Normal'}</div>
        </div>
      </div>
    `;
  }).join('');
}

export function filtrarOperariosKanban(query) {
  const q = (query || '').toLowerCase().trim();
  const filtrados = (trabajadoresKanbanCache || []).filter(t => !q || (t.nombre || '').toLowerCase().includes(q));
  renderizarOperariosKanban(filtrados);
}

export async function seleccionarOperarioKanban(id, nombre) {
  if (!transferContextKanban) return;

  transferContextKanban.trabajadorId = id;
  const trab = (trabajadoresKanbanCache || []).find(t => t.id === id);
  transferContextKanban.trabajador = trab;

  const hiddenId = document.getElementById('kanbanTrabajadorId');
  if (hiddenId) hiddenId.value = id;

  const trabNombreTag = document.getElementById('kanbanTrabajadorSeleccionadoNombre');
  if (trabNombreTag) trabNombreTag.textContent = nombre;

  document.querySelectorAll('.kanban-worker-pick').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`kanbanWorkerPick_${id}`);
  if (el) el.classList.add('selected');

  await calcularTotalKanbanEnVivo();
}

export async function calcularTotalKanbanEnVivo() {
  if (!transferContextKanban) return;

  const tarifaEl = document.getElementById('kanbanTarifaDetalle');
  const totalEl = document.getElementById('kanbanTotalCalculado');
  const cantInput = document.getElementById('kanbanCantidad');

  const cant = parseInt(cantInput?.value, 10) || 0;
  const procesoDestino = transferContextKanban.procesoDestino;

  if (procesoDestino === 'stock') {
    if (tarifaEl) tarifaEl.textContent = 'Almacén general (sin tarifa de mano de obra)';
    if (totalEl) totalEl.textContent = 'Q 0.00';
    return;
  }

  if (!transferContextKanban.trabajadorId) {
    if (tarifaEl) tarifaEl.textContent = 'Selecciona un operario para calcular tarifa';
    if (totalEl) totalEl.textContent = 'Q 0.00';
    return;
  }

  try {
    const token = window.token;
    const res = await fetch(`${API}/tareas/precios?trabajador_id=${transferContextKanban.trabajadorId}&proceso=${procesoDestino}&prenda_id=${transferContextKanban.lote.prenda_id}`, {
      headers: { 'x-access-token': token }
    });
    const precios = await res.json();
    const precioUnit = Number(precios.precio_final || 0);
    transferContextKanban.tarifaUnitaria = precioUnit;

    const total = precioUnit * cant;
    if (tarifaEl) tarifaEl.textContent = `Tarifa: Q ${precioUnit.toFixed(2)} por prenda (${precios.factura ? 'Factura' : 'Normal'})`;
    if (totalEl) totalEl.textContent = `Q ${total.toFixed(2)}`;
  } catch (e) {
    if (tarifaEl) tarifaEl.textContent = 'Tarifa base';
    if (totalEl) totalEl.textContent = 'Q 0.00';
  }
}

export async function ejecutarAvanzarKanban(event) {
  if (event) event.preventDefault();

  if (!transferContextKanban) return;

  const lote = transferContextKanban.lote;
  const procesoDestino = transferContextKanban.procesoDestino;
  const cantInput = document.getElementById('kanbanCantidad');
  const cantidad = parseInt(cantInput?.value, 10) || 0;

  if (cantidad <= 0) {
    showToast('Ingresa una cantidad válida mayor a 0', 'warning');
    return;
  }

  if (cantidad > Number(lote.cantidad)) {
    showToast(`La cantidad no puede superar las ${lote.cantidad} prendas disponibles en el lote`, 'warning');
    return;
  }

  if (procesoDestino !== 'stock' && !transferContextKanban.trabajadorId) {
    showToast('Por favor selecciona el operario responsable de la nueva etapa', 'warning');
    return;
  }

  const btnConfirmar = document.getElementById('btnConfirmarKanban');
  if (btnConfirmar) {
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<span class="mi" style="animation: livePulse 1s infinite;">sync</span> Procesando pase...';
  }

  const token = window.token;
  try {
    const res = await fetch(`${API}/tareas/avanzar-kanban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      },
      body: JSON.stringify({
        prenda_id: lote.prenda_id,
        cantidad: cantidad,
        proceso_origen: lote.proceso,
        proceso_destino: procesoDestino,
        trabajador_id: transferContextKanban.trabajadorId || null,
        tarea_id_origen: lote.tarea_id || null,
        registro_id: lote.registro_id
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al transferir lote en Kanban');
    }

    showToast(data.message || 'Pase de proceso realizado con éxito', 'success');
    cerrarModalAvanzarKanban();

    // Actualizar datos del tablero y KPI superior
    await loadProcesos();
  } catch (err) {
    console.error('Error al transferir en Kanban:', err);
    showToast(err.message || 'Error al ejecutar pase de proceso', 'error');
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '<span class="mi" style="font-size:16px; vertical-align:middle;">check_circle</span> Confirmar Pase y Acreditar Pago';
    }
  }
}

// Exposición global a window para llamadas inline desde HTML
Object.assign(window, {
  loadProcesos,
  verProceso,
  moverRegistroProceso,
  abrirModalIngresarProceso,
  cerrarModalIngresarProceso,
  guardarIngresoProceso,
  abrirModalMoverLote,
  cerrarModalMoverLote,
  transferirLoteRapido,
  ejecutarMoverLote,
  onInputBusquedaProceso,
  limpiarBusquedaProceso,
  onChangeFiltroPrenda,
  onChangeFiltroUsuario,
  onChangeFiltroFecha,
  onChangeFiltroPrioridad,
  removerChipFiltro,
  limpiarTodosFiltrosProceso,
  cambiarPaginaProcesos,
  cambiarFilasPorPagina,
  toggleSelectAllProcesos,
  exportarProcesosExcel,
  exportarProcesosPDF,
  updateProcesoStatusBar,
  cambiarVistaProcesos,
  cargarTableroKanban,
  onKanbanDragStart,
  onKanbanDragEnd,
  onKanbanDragOver,
  onKanbanDragLeave,
  onKanbanDrop,
  abrirModalTransferirKanban,
  cerrarModalAvanzarKanban,
  ajustarKanbanCantidad,
  setKanbanCantidadTotal,
  filtrarOperariosKanban,
  seleccionarOperarioKanban,
  calcularTotalKanbanEnVivo,
  ejecutarAvanzarKanban
});

