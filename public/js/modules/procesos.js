/**
 * Módulo de Procesos y Estados de Ropa
 * Módulo ES6 con compatibilidad global
 */

import { API } from '../core/api.js';
import { formatDateTime } from '../core/ui.js';

export async function loadProcesos() {
  const token = window.token;
  try {
    const res = await fetch(`${API}/prendas/stock/resumen`, { headers: { 'x-access-token': token } });
    const data = await res.json();
    (Array.isArray(data) ? data : []).forEach(p => {
      const el = document.getElementById(`count-${p.proceso}`);
      if (el) el.textContent = p.cantidad;
    });
  } catch (err) {
    console.error('Error cargando procesos:', err);
  }
}

export async function verProceso(proceso) {
  const token = window.token;
  try {
    const res = await fetch(`${API}/procesos/por-proceso/${proceso}`, { headers: { 'x-access-token': token } });
    const data = await res.json();

    const procesoLabels = {
      'sucio': 'SUCIO', 'remojo': 'REMOJO', 'lavado': 'LAVADO', 'tendido': 'TENDIDO',
      'recogido': 'RECOGIDO', 'reproceso': 'REPROCESO', 'limpio': 'LIMPIO',
      'planchado': 'PLANCHADO', 'desmanche': 'DESMANCHE', 'stock': 'STOCK'
    };

    const procesoColors = {
      'sucio': '#e74c3c', 'remojo': '#3498db', 'lavado': '#27ae60', 'tendido': '#f39c12',
      'recogido': '#9b59b6', 'reproceso': '#e67e22', 'limpio': '#1abc9c',
      'planchado': '#34495e', 'desmanche': '#c0392b', 'stock': '#2ecc71'
    };

    const procesoTextColors = {
      'sucio': '#ffffff', 'remojo': '#ffffff', 'lavado': '#ffffff', 'tendido': '#1f2937',
      'recogido': '#ffffff', 'reproceso': '#ffffff', 'limpio': '#ffffff',
      'planchado': '#ffffff', 'desmanche': '#ffffff', 'stock': '#0f172a'
    };

    const headerTextColor = procesoTextColors[proceso] || '#ffffff';
    const detailEl = document.getElementById('procesoDetail');
    if (!detailEl) return;

    if (!Array.isArray(data) || data.length === 0) {
      detailEl.innerHTML = `
        <div class="card" style="margin-top:20px;">
          <div class="card-header" style="background:${procesoColors[proceso]}; color:${headerTextColor}; display:flex; justify-content:center; align-items:center; text-align:center; margin-bottom:0; padding:14px 16px; border-bottom:none; min-height:56px;">
            <h3 style="margin:0; color:${headerTextColor};"><span class="mi">checklist</span>${procesoLabels[proceso]}</h3>
          </div>
          <div style="padding:40px; text-align:center; color:#95a5a6;">
            <span class="mi xl">inventory_2</span>
            <p>No hay prendas en este proceso</p>
          </div>
        </div>
      `;
      return;
    }

    detailEl.innerHTML = `
      <div class="card" style="margin-top:20px;">
        <div class="card-header" style="background:${procesoColors[proceso]}; color:${headerTextColor}; display:flex; justify-content:center; align-items:center; gap:14px; text-align:center; margin-bottom:0; padding:14px 16px; border-bottom:none; min-height:56px;">
          <h3 style="margin:0; color:${headerTextColor};"><span class="mi">view_list</span>Prendas en ${procesoLabels[proceso]}</h3>
          <span style="background:rgba(255,255,255,0.92); color:#111827; padding:5px 15px; border-radius:20px; font-weight:bold; border:1px solid rgba(0,0,0,0.08);">${data.length} registros</span>
        </div>
        <div style="max-height:400px; overflow-y:auto;">
          <table style="width:100%;">
            <thead style="background:#f8f9fa; position:sticky; top:0;">
              <tr style="border-bottom:2px solid #dee2e6;">
                <th style="padding:12px; text-align:left;">Prenda</th>
                <th style="padding:12px; text-align:center;">Cantidad</th>
                <th style="padding:12px; text-align:left;">Usuario</th>
                <th style="padding:12px; text-align:center;">Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(p => `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px;"><strong>${p.prenda_nombre}</strong></td>
                <td style="padding:10px; text-align:center; vertical-align:middle; line-height:1;"><span style="background:${procesoColors[proceso]}; color:${headerTextColor}; min-width:42px; height:28px; padding:0 10px; border-radius:999px; font-weight:700; display:flex; align-items:center; justify-content:center; line-height:1; margin:0 auto;">${p.cantidad}</span></td>
                <td style="padding:10px;">${p.usuario_ingreso || '-'}</td>
                <td style="padding:10px; text-align:center; color:#7f8c8d;">${formatDateTime(p.fecha_ingreso)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error cargando detalle de proceso:', err);
  }
}

const procesoMeta = {
  sucio: { paso: 1, color: '#e74c3c', nombre: 'Sucio' },
  remojo: { paso: 2, color: '#e67e22', nombre: 'Remojo' },
  lavado: { paso: 3, color: '#f1c40f', nombre: 'Lavado' },
  tendido: { paso: 4, color: '#2ecc71', nombre: 'Tendido' },
  recogido: { paso: 5, color: '#1abc9c', nombre: 'Recogido' },
  limpio: { paso: 6, color: '#9b59b6', nombre: 'Limpio' },
  planchado: { paso: 7, color: '#34495e', nombre: 'Planchado' },
  stock: { paso: 8, color: '#00bcd4', nombre: 'Stock' },
  desmanche: { paso: 9, color: '#e91e63', nombre: 'Desmanche' },
  reproceso: { paso: 10, color: '#3498db', nombre: 'Reproceso' }
};

const procesoOrigenMeta = {
  remojo: 'Sucio',
  lavado: 'Lavado',
  desmanche: 'Lavado',
  planchado: 'Limpio',
  tendido: 'Lavado',
  recogido: 'Tendido',
  reproceso: 'Sucio'
};

export function updateProcesoStatusBar() {
  const proceso = document.getElementById('tareaProceso')?.value;
  const fill = document.getElementById('procesoEstadoFill');
  const label = document.getElementById('procesoEstadoLabel');
  const origen = document.getElementById('procesoEstadoOrigen');
  if (!fill || !label || !origen) return;

  if (!proceso || !procesoMeta[proceso]) {
    fill.style.width = '0%';
    fill.style.backgroundColor = '#95a5a6';
    label.textContent = 'Sin seleccionar';
    origen.textContent = 'Selecciona un proceso para ver el estado de origen requerido.';
    return;
  }

  const meta = procesoMeta[proceso];
  const width = Math.max(8, (meta.paso / 10) * 100);
  fill.style.width = `${width}%`;
  fill.style.backgroundColor = meta.color;
  label.textContent = `${meta.nombre} (Paso ${meta.paso}/10)`;
  const origenNecesario = procesoOrigenMeta[proceso];
  if (origenNecesario) {
    origen.innerHTML = `<strong>Requiere origen:</strong> ${origenNecesario}. Si no hay stock disponible en ese estado, no se puede asignar.`;
  } else {
    origen.innerHTML = `<strong>Proceso especial:</strong> ${meta.nombre}. Verifica reglas del flujo antes de asignar.`;
  }
}

// Exposición global a window
Object.assign(window, {
  loadProcesos,
  verProceso,
  updateProcesoStatusBar
});
