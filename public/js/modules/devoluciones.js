/**
 * Módulo de Devoluciones de Bodega
 * Módulo ES6 con compatibilidad global
 */

import { API } from '../core/api.js';
import { showError, showSuccess } from '../core/ui.js';

let deptoDevolucionActual = null;
let devolucionActual = null;

export async function loadDevoluciones() {
  const token = window.token;
  const user = window.user || {};

  try {
    const resDeptos = await fetch(`${API}/departamentos`, { headers: { 'x-access-token': token } });
    const deptos = await resDeptos.json();

    const esAdminEncargado = user.rol === 'admin' || user.rol === 'encargado';
    const selectorWrap = document.getElementById('selectorDepartamentoDevolucion');
    const selectEl = document.getElementById('deptoDevolucionSelect');

    if (esAdminEncargado) {
      if (selectorWrap) selectorWrap.style.display = 'block';
      if (selectEl) {
        selectEl.innerHTML = '<option value="">Seleccionar departamento...</option>' +
          (Array.isArray(deptos) ? deptos : []).map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');

        if (user.departamento_id) {
          selectEl.value = user.departamento_id;
        }
        deptoDevolucionActual = selectEl.value || null;
      }
    } else {
      if (selectorWrap) selectorWrap.style.display = 'none';
      deptoDevolucionActual = user.departamento_id;
    }

    const inventarioEl = document.getElementById('inventarioDepartamento');
    if (!deptoDevolucionActual) {
      if (inventarioEl) {
        inventarioEl.innerHTML = `
          <div style="padding:40px; text-align:center; color:#e74c3c;">
            <span class="mi xl">warning</span>
            <p>Selecciona un departamento para ver su inventario.</p>
          </div>
        `;
      }
      return;
    }

    cargarInventarioDevolucion();
  } catch (err) {
    console.error('Error cargando devoluciones:', err);
  }
}

export async function cargarInventarioDevolucion() {
  const token = window.token;
  const user = window.user || {};
  const selectVal = document.getElementById('deptoDevolucionSelect')?.value;
  const deptId = selectVal || deptoDevolucionActual;
  if (!deptId) return;

  deptoDevolucionActual = deptId;

  try {
    const resDeptos = await fetch(`${API}/departamentos`, { headers: { 'x-access-token': token } });
    const deptos = await resDeptos.json();
    const deptNombre = (Array.isArray(deptos) ? deptos : []).find(d => d.id == deptId)?.nombre || '';
    const tituloEl = document.getElementById('tituloInventarioDevolucion');
    if (tituloEl) tituloEl.innerHTML = `<span class="mi">inventory_2</span>Inventario: ${deptNombre}`;

    const resStock = await fetch(`${API}/procesos/stock/departamento/${deptId}`, { headers: { 'x-access-token': token } });
    const stockData = await resStock.json();

    const inventarioArray = (Array.isArray(stockData) ? stockData : []).map(s => ({
      prenda_id: s.prenda_id,
      nombre: s.prenda_nombre,
      cantidad: s.cantidad
    }));

    const inventarioEl = document.getElementById('inventarioDepartamento');
    if (!inventarioEl) return;

    if (inventarioArray.length === 0) {
      inventarioEl.innerHTML = `
        <div style="padding:40px; text-align:center; color:#95a5a6;">
          <span class="mi xl">inventory_2</span>
          <p>No tienes prendas en inventario.</p>
        </div>
      `;
      return;
    }

    inventarioEl.innerHTML = `
      <table style="width:100%;">
        <thead style="background:#f8f9fa; position:sticky; top:0;">
          <tr style="border-bottom:2px solid #dee2e6;">
            <th style="padding:12px; text-align:left;">Prenda</th>
            <th style="padding:12px; text-align:center;">En Stock</th>
            <th style="padding:12px; text-align:center;">Devolver</th>
          </tr>
        </thead>
        <tbody>
          ${inventarioArray.map(p => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px;"><strong>${p.nombre}</strong></td>
            <td style="padding:10px; text-align:center;"><span style="background:${p.cantidad > 0 ? '#27ae60' : '#e74c3c'}; color:white; padding:3px 10px; border-radius:10px;">${p.cantidad}</span></td>
            <td style="padding:10px; text-align:center;">
              <div style="display:flex; justify-content:center; gap:5px;">
                <button class="btn btn-success btn-table" title="Devolver Limpia" onclick="devolverPrenda(${p.prenda_id}, '${p.nombre.replace(/'/g, "\\'")}', ${p.cantidad}, 'limpio')"><span class="mi">check</span></button>
                <button class="btn btn-warning btn-table" title="Devolver Sucia" onclick="devolverPrenda(${p.prenda_id}, '${p.nombre.replace(/'/g, "\\'")}', ${p.cantidad}, 'sucio')"><span class="mi">soap</span></button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:15px; padding:15px; background:#e8f5e9; border-radius:8px;">
        <strong><span class="mi">info</span>Instrucciones:</strong><br>
        <span class="mi">check</span><strong>Limpia:</strong> La prenda vuelve al stock directamente<br>
        <span class="mi">soap</span><strong>Sucia:</strong> La prenda pasa al proceso SUCIO para reproceso
      </div>
    `;
  } catch (err) {
    console.error('Error cargando inventario de devolución:', err);
  }
}

export async function devolverPrenda(prendaId, nombre, cantidad, condicion) {
  if (cantidad <= 0) {
    showError('No hay prendas en stock para devolver');
    return;
  }

  devolucionActual = { prendaId, nombre, cantidad, condicion };

  const infoEl = document.getElementById('infoDevolucion');
  if (infoEl) {
    infoEl.innerHTML = `
      <div style="background:#e8f5e9; padding:15px; border-radius:8px;">
        <strong>${nombre}</strong><br>
        <span style="color:#7f8c8d;">Stock disponible: <strong>${cantidad}</strong></span>
      </div>
    `;
  }

  const cantInput = document.getElementById('cantidadDevolver');
  if (cantInput) {
    cantInput.value = 1;
    cantInput.max = cantidad;
  }

  document.querySelectorAll('input[name="condicionDevolucion"]').forEach(radio => {
    radio.checked = (radio.value === condicion);
  });

  const modal = document.getElementById('modalDevolucion');
  if (modal) modal.classList.add('show');
}

export function closeDevolucionModal() {
  const modal = document.getElementById('modalDevolucion');
  if (modal) modal.classList.remove('show');
  devolucionActual = null;
}

export async function confirmarDevolucion() {
  if (!devolucionActual) return;
  const token = window.token;
  const user = window.user || {};

  const cantidadInput = document.getElementById('cantidadDevolver');
  const cantidadInt = parseInt(cantidadInput?.value || '0', 10);
  const checkedCond = document.querySelector('input[name="condicionDevolucion"]:checked');
  const condicion = checkedCond ? checkedCond.value : 'limpio';

  if (!cantidadInt || cantidadInt <= 0) {
    showError('Ingresa una cantidad válida');
    return;
  }

  if (cantidadInt > devolucionActual.cantidad) {
    showError('No puedes devolver más de las que tienes en stock');
    return;
  }

  try {
    const res = await fetch(`${API}/procesos/devolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-token': token },
      body: JSON.stringify({
        prenda_id: devolucionActual.prendaId,
        cantidad: cantidadInt,
        condicion: condicion,
        departamento_id: deptoDevolucionActual || user.departamento_id
      })
    });

    if (res.ok) {
      showSuccess(`${cantidadInt} prendas devueltas como ${condicion === 'limpio' ? 'LIMPIAS' : 'SUCIAS'}`);
      closeDevolucionModal();
      loadDevoluciones();
    } else {
      showError('Error al registrar la devolución');
    }
  } catch (err) {
    console.error('Error confirmando devolución:', err);
    showError('Error de red al procesar devolución');
  }
}

// Exposición global a window
Object.assign(window, {
  loadDevoluciones,
  cargarInventarioDevolucion,
  devolverPrenda,
  closeDevolucionModal,
  confirmarDevolucion
});
