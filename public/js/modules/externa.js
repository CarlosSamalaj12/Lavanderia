/**
 * Módulo de Lavandería Externa
 * Módulo ES6 con compatibilidad global
 */

import { API } from '../core/api.js';
import {
  formatDate,
  formatCurrency,
  showError,
  showSuccess,
  setSearchCounter,
  setActiveSearchItem,
  resetSearchNav,
  focusField,
  resolverCoincidenciaPorNombre
} from '../core/ui.js';

let timeoutPrendasExterna = null;

export async function loadLavanderia_externa() {
  const inputBuscar = document.getElementById('buscarPrenda_externa');
  if (inputBuscar) inputBuscar.value = '';
  const resultadosBox = document.getElementById('resultadosPrendas_externa');
  if (resultadosBox) resultadosBox.innerHTML = '';
  const prendaCard = document.getElementById('prendaSeleccionada_externa');
  if (prendaCard) prendaCard.style.display = 'none';
  const stockBox = document.getElementById('stockProcesos_externa');
  if (stockBox) stockBox.innerHTML = '';
  const cantInput = document.getElementById('externaCantidad');
  if (cantInput) cantInput.value = '1';
  const autoInput = document.getElementById('externaAutorizado');
  if (autoInput) autoInput.value = '';
  const retCant = document.getElementById('externaRetornoCantidad');
  if (retCant) retCant.value = '1';
  const retPrecio = document.getElementById('externaRetornoPrecio');
  if (retPrecio) retPrecio.value = '0';
  const retReenviar = document.getElementById('externaRetornoReenviar');
  if (retReenviar) retReenviar.checked = false;

  await loadHistorialEnviadas();
  await loadRetornosSelect();
  await loadReporteLavanderia_externa();
}

export const loadLavanderiaExterna = loadLavanderia_externa;

export async function buscarPrendas_externa() {
  clearTimeout(timeoutPrendasExterna);
  const input = document.getElementById('buscarPrenda_externa');
  const query = (input?.value || '').trim();
  const resultados = document.getElementById('resultadosPrendas_externa');
  if (!resultados) return;

  if (query.length < 2) {
    resultados.style.display = 'none';
    resetSearchNav('resultadosPrendas_externa');
    setSearchCounter('contadorPrendaExterna', 0, 0);
    return;
  }

  timeoutPrendasExterna = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/prendas?q=${encodeURIComponent(query)}`, {
        headers: { 'x-access-token': window.token }
      });
      const prendas = await res.json();
      const sliced = (Array.isArray(prendas) ? prendas : []).slice(0, 20);

      if (sliced.length === 0) {
        resultados.innerHTML = '<div style="padding:10px; color:#7f8c8d;">No se encontraron prendas</div>';
      } else {
        resultados.innerHTML = sliced.map(p => `
          <div class="search-result-item" style="padding:10px;" onclick="seleccionarPrenda_externa(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">
            <strong>${p.nombre}</strong>
            <span style="color:#7f8c8d; font-size:12px; margin-left:10px;">Stock: ${p.total_stock || 0}</span>
          </div>
        `).join('');
      }
      resultados.style.display = 'block';
      setSearchCounter('contadorPrendaExterna', sliced.length, (prendas || []).length);
      if (sliced.length) setActiveSearchItem('resultadosPrendas_externa', 0);
    } catch (err) {
      console.error('Error buscando prendas para lavandería externa:', err);
    }
  }, 300);
}

export function seleccionarPrenda_externa(id, nombre) {
  const input = document.getElementById('buscarPrenda_externa');
  if (input) input.value = '';
  const box = document.getElementById('resultadosPrendas_externa');
  if (box) box.style.display = 'none';
  setSearchCounter('contadorPrendaExterna', 1, 1);

  const nombreEl = document.getElementById('nombrePrenda_externa');
  if (nombreEl) nombreEl.textContent = nombre;
  const selCard = document.getElementById('prendaSeleccionada_externa');
  if (selCard) selCard.style.display = 'block';

  window.prendaId_externa = id;
  window.prendaNombre_externa = nombre;
  cargarStockProcesos_externa();
}

export function limpiarPrenda_externa() {
  window.prendaId_externa = null;
  window.prendaNombre_externa = null;
  const selCard = document.getElementById('prendaSeleccionada_externa');
  if (selCard) selCard.style.display = 'none';
  const stockEl = document.getElementById('stockProcesos_externa');
  if (stockEl) stockEl.innerHTML = '';
}

export async function loadHistorialEnviadas() {
  try {
    const res = await fetch(`${API}/lavanderia-externa`, { headers: { 'x-access-token': window.token } });
    const data = await res.json();
    const box = document.getElementById('historialEnviadas');
    if (!box) return;

    if (!Array.isArray(data) || data.length === 0) {
      box.innerHTML = '<p style="color:#7f8c8d; text-align:center;">No hay prendas enviadas</p>';
      return;
    }

    let html = '<table style="width:100%; font-size:13px;"><thead><tr><th>Prenda</th><th>Cant.</th><th>Precio</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>';
    data.forEach(item => {
      html += `<tr>
        <td>${item.prenda_nombre}</td>
        <td>${item.cantidad}</td>
        <td>${formatCurrency(item.precio)}</td>
        <td>${formatDate(item.fecha_envio)}</td>
        <td style="color:${item.estado === 'retornado' ? '#27ae60' : '#e74c3c'}; font-weight:bold;">${(item.estado || '').toUpperCase()}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    box.innerHTML = html;
  } catch (err) {
    console.error('Error cargando historial de enviadas:', err);
  }
}

export async function loadRetornosSelect() {
  try {
    const res = await fetch(`${API}/lavanderia-externa`, { headers: { 'x-access-token': window.token } });
    const data = await res.json();
    const select = document.getElementById('externaRetorno');
    if (!select) return;

    const enviados = (Array.isArray(data) ? data : []).filter(d => d.estado === 'enviado' || d.estado === 'parcial');
    select.innerHTML = '<option value="">Seleccionar...</option>' +
      enviados.map(d => `<option value="${d.id}">${d.prenda_nombre} - ${d.cantidad} unidades - ${formatDate(d.fecha_envio)}</option>`).join('');
  } catch (err) {
    console.error('Error cargando select de retornos:', err);
  }
}

export async function loadReporteLavanderia_externa() {
  try {
    const res = await fetch(`${API}/lavanderia-externa/reporte`, { headers: { 'x-access-token': window.token } });
    const data = await res.json();
    const box = document.getElementById('reporteLavanderia_externa');
    if (!box) return;

    const totalEnviadas = data.total_enviadas || 0;
    const totalPendientes = data.total_pendientes || 0;
    const totalRetornadas = data.total_retornadas || 0;
    const totalCosto = data.total_gastado || 0;

    box.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:15px; text-align:center;">
        <div style="background:linear-gradient(135deg,#e74c3c,#c0392b); color:white; padding:20px; border-radius:10px;">
          <div style="font-size:32px; font-weight:bold;">${totalEnviadas}</div>
          <div>Total Enviadas</div>
        </div>
        <div style="background:linear-gradient(135deg,#f39c12,#d68910); color:white; padding:20px; border-radius:10px;">
          <div style="font-size:32px; font-weight:bold;">${totalPendientes}</div>
          <div>Pendientes</div>
        </div>
        <div style="background:linear-gradient(135deg,#27ae60,#219a52); color:white; padding:20px; border-radius:10px;">
          <div style="font-size:32px; font-weight:bold;">${totalRetornadas}</div>
          <div>Retornadas</div>
        </div>
        <div style="background:linear-gradient(135deg,#3498db,#2980b9); color:white; padding:20px; border-radius:10px;">
          <div style="font-size:32px; font-weight:bold;">${formatCurrency(totalCosto)}</div>
          <div>Costo Total</div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error cargando reporte de lavandería externa:', err);
  }
}

export async function cargarStockProcesos_externa() {
  const prendaId = window.prendaId_externa;
  if (!prendaId) return;

  try {
    const res = await fetch(`${API}/prendas/${prendaId}/stock-trazabilidad`, {
      headers: { 'x-access-token': window.token }
    });
    const stockData = await res.json();

    const porProceso = {};
    (Array.isArray(stockData) ? stockData : []).forEach(item => {
      if (!porProceso[item.proceso]) porProceso[item.proceso] = 0;
      porProceso[item.proceso] += item.cantidad;
    });

    const procesoNombres = { 'sucio': 'SUCIO', 'remojo': 'REMOJO', 'lavado': 'LAVADO', 'tendido': 'TENDIDO', 'recogido': 'RECOGIDO', 'reproceso': 'REPROCESO', 'limpio': 'LIMPIO', 'planchado': 'PLANCHADO', 'desmanche': 'DESMANCHE', 'stock': 'STOCK' };
    const procesoColores = { 'sucio': '#e74c3c', 'remojo': '#e67e22', 'lavado': '#f1c40f', 'tendido': '#2ecc71', 'recogido': '#1abc9c', 'reproceso': '#3498db', 'limpio': '#9b59b6', 'planchado': '#34495e', 'desmanche': '#e91e63', 'stock': '#00bcd4' };

    let html = '<table style="width:100%; font-size:13px;"><thead><tr><th>Proceso</th><th>Cantidad</th></tr></thead><tbody>';
    Object.entries(porProceso).forEach(([proceso, cantidad]) => {
      if (cantidad > 0) {
        html += `<tr><td style="color:${procesoColores[proceso] || '#333'}; font-weight:bold;">${procesoNombres[proceso] || proceso.toUpperCase()}</td><td><span style="background:${procesoColores[proceso] || '#999'}; color:white; padding:2px 8px; border-radius:10px;">${cantidad}</span></td></tr>`;
      }
    });
    html += '</tbody></table>';

    const box = document.getElementById('stockProcesos_externa');
    if (box) box.innerHTML = html;
  } catch (err) {
    console.error('Error cargando stock de procesos en lavandería externa:', err);
  }
}

export async function enviarLavanderia_externa() {
  let prendaId = window.prendaId_externa;
  const cantInput = document.getElementById('externaCantidad');
  const cantidad = parseInt(cantInput?.value || '0', 10);
  const autoInput = document.getElementById('externaAutorizado');
  const autorizado = (autoInput?.value || '').trim();

  if (!prendaId) {
    const typed = (document.getElementById('buscarPrenda_externa')?.value || '').trim();
    if (typed) {
      const candidato = resolverCoincidenciaPorNombre(window.prendasCacheGlobal || [], typed);
      if (candidato) {
        seleccionarPrenda_externa(candidato.id, candidato.nombre);
        prendaId = candidato.id;
      }
    }
  }

  if (!prendaId || !cantidad || cantidad < 1) {
    showError('No seleccionó la prenda o la cantidad');
    if (!prendaId) {
      focusField('buscarPrenda_externa', 'No seleccionó la prenda', 'error');
      buscarPrendas_externa();
    } else if (!cantidad || cantidad < 1) {
      focusField('externaCantidad', 'No ingresó una cantidad válida', 'error');
    }
    return;
  }

  try {
    const res = await fetch(`${API}/lavanderia-externa/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({
        prenda_id: prendaId,
        cantidad: cantidad,
        precio: 0,
        autorizado_por: autorizado
      })
    });

    if (res.ok) {
      showSuccess('Prendas enviadas a lavandería externa');
      loadLavanderia_externa();
    } else {
      const err = await res.json();
      showError(err.message || 'Error al enviar prendas');
    }
  } catch (err) {
    console.error('Error al enviar prendas:', err);
    showError('Error de red al enviar prendas');
  }
}

export async function cargarDetalleRetorno() {
  const retornoSelect = document.getElementById('externaRetorno');
  const retornoId = retornoSelect?.value;
  const detalleEl = document.getElementById('detalleRetorno');
  if (!detalleEl) return;

  if (!retornoId) {
    detalleEl.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`${API}/lavanderia-externa/${retornoId}`, {
      headers: { 'x-access-token': window.token }
    });
    const data = await res.json();

    detalleEl.innerHTML = `
      <div style="background:#ecf0f1; padding:15px; border-radius:8px;">
        <p><strong>Prenda:</strong> ${data.prenda_nombre}</p>
        <p><strong>Pendientes:</strong> ${data.cantidad}</p>
        <p><strong>Enviado:</strong> ${formatDate(data.fecha_envio)}</p>
      </div>
    `;
    const retCantInput = document.getElementById('externaRetornoCantidad');
    if (retCantInput) {
      retCantInput.value = data.cantidad;
      retCantInput.max = data.cantidad;
    }
    const retPrecioInput = document.getElementById('externaRetornoPrecio');
    if (retPrecioInput) retPrecioInput.value = '0';
    const retReenviarCheck = document.getElementById('externaRetornoReenviar');
    if (retReenviarCheck) retReenviarCheck.checked = false;
  } catch (err) {
    console.error('Error cargando detalle de retorno:', err);
  }
}

export async function confirmarRetorno() {
  const retornoId = document.getElementById('externaRetorno')?.value;
  const cantidadRetorno = parseInt(document.getElementById('externaRetornoCantidad')?.value || '0', 10);
  const precioReingreso = parseFloat(document.getElementById('externaRetornoPrecio')?.value || '0');
  const reenviar = !!document.getElementById('externaRetornoReenviar')?.checked;

  if (!retornoId) {
    showError('Selecciona un envío para retornar');
    return;
  }
  if (cantidadRetorno < 1) {
    showError('Ingresa una cantidad válida para reingresar');
    return;
  }

  try {
    const res = await fetch(`${API}/lavanderia-externa/${retornoId}/retornar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-access-token': window.token },
      body: JSON.stringify({
        cantidad_retorno: cantidadRetorno,
        precio_reingreso: precioReingreso,
        reenviar
      })
    });

    if (res.ok) {
      showSuccess(reenviar ? 'Reingreso procesado y reenviado' : 'Prendas reingresadas a stock');
      loadLavanderia_externa();
    } else {
      const err = await res.json();
      showError(err.message || 'Error al retornar prendas');
    }
  } catch (err) {
    console.error('Error retornando prendas:', err);
    showError('Error de red al procesar retorno');
  }
}

// Exposición global a window
Object.assign(window, {
  loadLavanderia_externa,
  loadLavanderiaExterna,
  buscarPrendas_externa,
  seleccionarPrenda_externa,
  limpiarPrenda_externa,
  loadHistorialEnviadas,
  loadRetornosSelect,
  loadReporteLavanderia_externa,
  cargarStockProcesos_externa,
  enviarLavanderia_externa,
  cargarDetalleRetorno,
  confirmarRetorno
});
