const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const PROCESOS_PAGADOS = ['remojo', 'lavado', 'tendido', 'recogido', 'desmanche', 'planchado'];
const PROCESOS_SIN_PAGO = ['reproceso', 'sucio'];
const PROCESO_ORIGEN_TAREA = {
  sucio: 'sucio',
  remojo: 'sucio',
  lavado: 'lavado',
  tendido: 'tendido',
  recogido: 'recogido',
  desmanche: 'lavado',
  planchado: 'limpio'
};

const PROCESO_SIGUIENTE = {
  sucio: 'remojo',
  remojo: 'lavado',
  lavado: 'tendido',
  tendido: 'recogido',
  recogido: 'limpio',
  reproceso: 'sucio',
  limpio: 'planchado',
  planchado: 'stock',
  desmanche: 'lavado'
};

function obtenerPrecioFactura(prenda, proceso) {
  switch (proceso) {
    case 'sucio': return 0;
    case 'remojo': return prenda.precio_remojo_factura || 0;
    case 'lavado': return prenda.precio_lavado_factura || 0;
    case 'tendido': return prenda.precio_tendido_factura || 0;
    case 'recogido': return prenda.precio_recogido_factura || 0;
    case 'desmanche': return prenda.precio_desmanche_factura || 0;
    case 'planchado': return prenda.precio_planchado_factura || 0;
    default: return 0;
  }
}

function obtenerPrecioNormal(prenda, proceso) {
  switch (proceso) {
    case 'sucio': return 0;
    case 'remojo': return prenda.precio_remojo || 0;
    case 'lavado': return prenda.precio_lavado || 0;
    case 'tendido': return prenda.precio_tendido || 0;
    case 'recogido': return prenda.precio_recogido || 0;
    case 'desmanche': return prenda.precio_desmanche || 0;
    case 'planchado': return prenda.precio_planchado || 0;
    default: return 0;
  }
}

function obtenerPrecio(trabajador, prenda, proceso) {
  if (trabajador.factura) return obtenerPrecioFactura(prenda, proceso);
  return obtenerPrecioNormal(prenda, proceso);
}

async function moverStockProceso(prendaId, procesoOrigen, procesoDestino, cantidad, userId) {
  const qty = Number(cantidad || 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Cantidad invalida para mover stock');
  }

  const filtroOrigenStock = procesoOrigen === 'stock' ? ' AND departamento_actual IS NULL' : '';
  const filtroDestinoStock = procesoDestino === 'stock' ? ' AND departamento_actual IS NULL' : '';

  const rows = await dbAsync.all(
    `SELECT id, cantidad FROM prendas_proceso
     WHERE prenda_id = ? AND proceso = ?${filtroOrigenStock}
     ORDER BY id ASC`,
    [prendaId, procesoOrigen]
  );

  const total = (rows || []).reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
  if (total < qty) {
    throw new Error(`No hay stock suficiente en ${procesoOrigen}`);
  }

  let restante = qty;
  for (const row of rows) {
    if (restante <= 0) break;
    const actual = Number(row.cantidad || 0);
    const usar = Math.min(actual, restante);
    const nueva = actual - usar;

    if (nueva > 0) {
      await dbAsync.run(
        'UPDATE prendas_proceso SET cantidad = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [nueva, row.id]
      );
    } else {
      await dbAsync.run('DELETE FROM prendas_proceso WHERE id = ?', [row.id]);
    }
    restante -= usar;
  }

  const destinoRow = await dbAsync.get(
    `SELECT id FROM prendas_proceso
     WHERE prenda_id = ? AND proceso = ?${filtroDestinoStock}
     ORDER BY id ASC LIMIT 1`,
    [prendaId, procesoDestino]
  );

  if (destinoRow) {
    await dbAsync.run(
      'UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
      [qty, destinoRow.id]
    );
  } else {
    await dbAsync.run(
      'INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, usuario_registro) VALUES (?, ?, ?, ?)',
      [prendaId, procesoDestino, qty, userId]
    );
  }
}

const tareasService = {
  async listar({ trabajador_id, proceso, estado, fecha_inicio, fecha_fin }) {
    let sql = `
      SELECT t.*,
        tr.nombre as trabajador_nombre,
        p.nombre as prenda_nombre,
        CASE
          WHEN t.proceso IN ('tendido', 'recogido') AND COALESCE(t.precio_unitario, 0) = 0 AND COALESCE(t.total, 0) = 0 THEN 1
          ELSE 0
        END as es_automatica
      FROM tareas t
      JOIN trabajadores tr ON t.trabajador_id = tr.id
      JOIN prendas p ON t.prenda_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (trabajador_id) {
      sql += ' AND t.trabajador_id = ?';
      params.push(trabajador_id);
    }
    if (proceso) {
      sql += ' AND t.proceso = ?';
      params.push(proceso);
    }
    if (estado) {
      sql += ' AND t.estado = ?';
      params.push(estado);
    }
    if (fecha_inicio) {
      sql += ' AND t.fecha_asignacion >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND t.fecha_asignacion <= ?';
      params.push(fecha_fin);
    }

    sql += ' ORDER BY t.fecha_asignacion DESC';
    return await dbAsync.all(sql, params);
  },

  async obtenerPrecios({ trabajador_id, proceso, prenda_id }) {
    if (!trabajador_id || !proceso || !prenda_id) {
      const err = new Error('Trabajador, proceso y prenda requeridos');
      err.status = 400;
      throw err;
    }

    const trabajador = await dbAsync.get('SELECT * FROM trabajadores WHERE id = ?', [trabajador_id]);
    if (!trabajador) {
      const err = new Error('Trabajador no encontrado');
      err.status = 404;
      throw err;
    }

    const prenda = await dbAsync.get('SELECT * FROM prendas WHERE id = ?', [prenda_id]);
    if (!prenda) {
      const err = new Error('Prenda no encontrada');
      err.status = 404;
      throw err;
    }

    const precioPersonalizado = await dbAsync.get(
      'SELECT precio FROM precios_trabajador WHERE trabajador_id = ? AND proceso = ?',
      [trabajador_id, proceso]
    );

    const precioBase = obtenerPrecio(trabajador, prenda, proceso);
    const precioFinal = precioPersonalizado ? precioPersonalizado.precio : precioBase;

    return {
      precio_factura: obtenerPrecioFactura(prenda, proceso),
      precio_normal: obtenerPrecioNormal(prenda, proceso),
      precio_personalizado: precioPersonalizado ? precioPersonalizado.precio : null,
      precio_final: precioFinal,
      proceso,
      factura: !!trabajador.factura
    };
  },

  async asignar({ trabajador_id, proceso, prendas, fecha_asignacion, estado_origen }, userId, rawBody) {
    if (!trabajador_id || !proceso || !prendas || !prendas.length) {
      const err = new Error('Trabajador, proceso y prendas requeridos');
      err.status = 400;
      throw err;
    }

    if (proceso === 'desmanche' && estado_origen && !PROCESO_SIGUIENTE[estado_origen] && estado_origen !== 'stock') {
      const err = new Error('estado_origen invalido para desmanche');
      err.status = 400;
      throw err;
    }

    if (!PROCESOS_PAGADOS.includes(proceso) && !PROCESOS_SIN_PAGO.includes(proceso)) {
      const err = new Error(`El proceso "${proceso}" no genera pago`);
      err.status = 400;
      throw err;
    }

    const trabajador = await dbAsync.get('SELECT * FROM trabajadores WHERE id = ?', [trabajador_id]);
    if (!trabajador) {
      const err = new Error('Trabajador no encontrado');
      err.status = 404;
      throw err;
    }

    const tareasCreadas = [];
    const errores = [];

    for (const item of prendas) {
      if (!item || !item.prenda_id || !item.cantidad || Number(item.cantidad) <= 0) {
        errores.push({
          prenda_id: item && item.prenda_id ? item.prenda_id : null,
          error: 'Cada prenda debe incluir prenda_id y cantidad mayor a 0'
        });
        continue;
      }

      const prenda = await dbAsync.get('SELECT * FROM prendas WHERE id = ?', [item.prenda_id]);
      if (!prenda) {
        errores.push({ prenda_id: item.prenda_id, error: 'Prenda no encontrada' });
        continue;
      }

      if (proceso === 'planchado' && Number(prenda.requiere_plancha) !== 1) {
        errores.push({
          prenda_id: item.prenda_id,
          prenda_nombre: prenda.nombre,
          error: 'La prenda no requiere planchado'
        });
        continue;
      }

      const procesoOrigen = (proceso === 'desmanche' && estado_origen) ? estado_origen : (PROCESO_ORIGEN_TAREA[proceso] || proceso);
      const filtroStockGeneral = procesoOrigen === 'stock' ? ' AND departamento_actual IS NULL' : '';

      const stock = await dbAsync.get(
        `SELECT SUM(cantidad) as total FROM prendas_proceso WHERE prenda_id = ? AND proceso = ?${filtroStockGeneral}`,
        [item.prenda_id, procesoOrigen]
      );

      const totalStock = stock ? stock.total || 0 : 0;
      if (totalStock < item.cantidad) {
        errores.push({
          prenda_id: item.prenda_id,
          prenda_nombre: prenda.nombre,
          cantidad_solicitada: item.cantidad,
          cantidad_disponible: totalStock,
          error: `Stock insuficiente en proceso ${procesoOrigen}`
        });
        continue;
      }

      const precioPersonalizado = await dbAsync.get(
        'SELECT precio FROM precios_trabajador WHERE trabajador_id = ? AND proceso = ?',
        [trabajador_id, proceso]
      );

      const precioBase = PROCESOS_SIN_PAGO.includes(proceso) ? 0 : obtenerPrecio(trabajador, prenda, proceso);
      const precio = PROCESOS_SIN_PAGO.includes(proceso) ? 0 : (precioPersonalizado ? precioPersonalizado.precio : precioBase);
      const total = Number(precio) * Number(item.cantidad);

      const sql = `
        INSERT INTO tareas (trabajador_id, proceso, prenda_id, cantidad, precio_unitario, total, fecha_asignacion)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      `;

      const result = await dbAsync.run(sql, [
        trabajador_id,
        proceso,
        item.prenda_id,
        item.cantidad,
        precio,
        total,
        fecha_asignacion || null
      ]);

      const tareaId = result.lastID;
      try {
        await moverStockProceso(item.prenda_id, procesoOrigen, proceso, item.cantidad, userId);
        tareasCreadas.push({ id: tareaId, prenda: prenda.nombre, cantidad: item.cantidad, total });

        await bitacoraService.registrar({
          usuarioId: userId,
          accion: 'ASIGNAR_TAREA',
          tablaAfectada: 'tareas',
          registroId: tareaId,
          datosNuevos: rawBody
        });
      } catch (moveErr) {
        await dbAsync.run('DELETE FROM tareas WHERE id = ?', [tareaId]);
        errores.push({
          prenda_id: item.prenda_id,
          prenda_nombre: prenda.nombre,
          error: moveErr.message
        });
      }
    }

    if (errores.length > 0 && tareasCreadas.length === 0) {
      const err = new Error('No se pudieron asignar las tareas');
      err.status = 400;
      err.details = { errores, tareas_creadas: tareasCreadas };
      throw err;
    }

    return {
      message: 'Tareas asignadas',
      tareas: tareasCreadas,
      errores: errores.length > 0 ? errores : undefined
    };
  },

  async iniciar(id, userId) {
    const sql = 'UPDATE tareas SET estado = ?, fecha_inicio = CURRENT_TIMESTAMP WHERE id = ? AND estado = ?';
    const result = await dbAsync.run(sql, ['en_proceso', id, 'asignada']);

    if (result.changes === 0) {
      const err = new Error('Tarea no encontrada o ya iniciada');
      err.status = 400;
      throw err;
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'INICIAR_TAREA',
      tablaAfectada: 'tareas',
      registroId: id
    });

    return { message: 'Tarea iniciada' };
  },

  async completar(id, { tendedor_nombre, recogedor_nombre } = {}, userId) {
    const tarea = await dbAsync.get('SELECT * FROM tareas WHERE id = ?', [id]);
    if (!tarea) {
      const err = new Error('Tarea no encontrada');
      err.status = 404;
      throw err;
    }

    const procesoSiguiente = PROCESO_SIGUIENTE[tarea.proceso];
    const sql = 'UPDATE tareas SET estado = ?, fecha_fin = CURRENT_TIMESTAMP WHERE id = ?';
    await dbAsync.run(sql, ['completada', id]);

    const resolverTrabajadorPorNombre = async (nombre) => {
      if (!nombre || !String(nombre).trim()) return tarea.trabajador_id;
      const row = await dbAsync.get('SELECT id FROM trabajadores WHERE LOWER(nombre) = LOWER(?)', [String(nombre).trim()]);
      if (!row) {
        const err = new Error(`No se encontro trabajador con nombre: ${nombre}`);
        err.status = 400;
        throw err;
      }
      return row.id;
    };

    const crearTareaAuto = async (procesoAuto, trabajadorId) => {
      const insertTareaSql = `
        INSERT INTO tareas (trabajador_id, proceso, prenda_id, cantidad, precio_unitario, total, estado)
        VALUES (?, ?, ?, ?, 0, 0, 'asignada')
      `;
      await dbAsync.run(insertTareaSql, [trabajadorId, procesoAuto, tarea.prenda_id, tarea.cantidad]);
    };

    // Flujo automático: al completar LAVADO crea TENDIDO, al completar TENDIDO crea RECOGIDO
    if (tarea.proceso === 'lavado') {
      await moverStockProceso(tarea.prenda_id, 'lavado', 'tendido', tarea.cantidad, userId);
      const trabajadorTendido = await resolverTrabajadorPorNombre(tendedor_nombre);
      await crearTareaAuto('tendido', trabajadorTendido);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'COMPLETAR_TAREA',
        tablaAfectada: 'tareas',
        registroId: id,
        datosNuevos: { proceso_siguiente: 'tendido', auto_tarea: true, trabajador_tendido: trabajadorTendido }
      });

      return { message: 'Tarea completada. Se creo automaticamente la tarea de TENDIDO.' };
    }

    if (tarea.proceso === 'tendido') {
      await moverStockProceso(tarea.prenda_id, 'tendido', 'recogido', tarea.cantidad, userId);
      const trabajadorRecogido = await resolverTrabajadorPorNombre(recogedor_nombre);
      await crearTareaAuto('recogido', trabajadorRecogido);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'COMPLETAR_TAREA',
        tablaAfectada: 'tareas',
        registroId: id,
        datosNuevos: { proceso_siguiente: 'recogido', auto_tarea: true, trabajador_recogido: trabajadorRecogido }
      });

      return { message: 'Tarea completada. Se creo automaticamente la tarea de RECOGIDO.' };
    }

    if (tarea.proceso === 'recogido') {
      const prenda = await dbAsync.get('SELECT requiere_plancha FROM prendas WHERE id = ?', [tarea.prenda_id]);
      const destino = prenda && Number(prenda.requiere_plancha) === 1 ? 'limpio' : 'stock';

      await moverStockProceso(tarea.prenda_id, 'recogido', destino, tarea.cantidad, userId);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'COMPLETAR_TAREA',
        tablaAfectada: 'tareas',
        registroId: id,
        datosNuevos: { proceso_siguiente: destino }
      });

      return { message: `Tarea completada. Prenda movida a ${destino}` };
    }

    if (tarea.proceso === 'remojo') {
      await moverStockProceso(tarea.prenda_id, 'remojo', 'lavado', tarea.cantidad, userId);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'COMPLETAR_TAREA',
        tablaAfectada: 'tareas',
        registroId: id,
        datosNuevos: { proceso_siguiente: 'lavado', mueve_stock: true }
      });

      return { message: 'Tarea completada. Prenda movida a LAVADO para su siguiente asignacion.' };
    }

    if (procesoSiguiente) {
      let destinoFinal = procesoSiguiente;
      if (procesoSiguiente === 'limpio') {
        const prenda = await dbAsync.get('SELECT requiere_plancha FROM prendas WHERE id = ?', [tarea.prenda_id]);
        destinoFinal = prenda && Number(prenda.requiere_plancha) === 1 ? 'limpio' : 'stock';
      }

      await moverStockProceso(tarea.prenda_id, tarea.proceso, destinoFinal, tarea.cantidad, userId);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'COMPLETAR_TAREA',
        tablaAfectada: 'tareas',
        registroId: id,
        datosNuevos: { proceso_siguiente: destinoFinal }
      });

      return { message: `Tarea completada. Prenda movida a ${destinoFinal}` };
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'COMPLETAR_TAREA',
      tablaAfectada: 'tareas',
      registroId: id,
      datosNuevos: { proceso_siguiente: null }
    });

    return { message: `Tarea completada: ${tarea.proceso}` };
  },

  async cancelar(id, userId) {
    const tarea = await dbAsync.get('SELECT * FROM tareas WHERE id = ?', [id]);
    if (!tarea) {
      const err = new Error('Tarea no encontrada');
      err.status = 404;
      throw err;
    }

    await dbAsync.run('UPDATE tareas SET estado = ? WHERE id = ?', ['cancelada', id]);

    if (PROCESOS_PAGADOS.includes(tarea.proceso) || PROCESOS_SIN_PAGO.includes(tarea.proceso)) {
      const origen = PROCESO_ORIGEN_TAREA[tarea.proceso] || (tarea.proceso === 'tendido' ? 'lavado' : (tarea.proceso === 'recogido' ? 'tendido' : null));
      if (origen) {
        try {
          await moverStockProceso(tarea.prenda_id, tarea.proceso, origen, tarea.cantidad, userId);
        } catch (_) {}
      }
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'CANCELAR_TAREA',
      tablaAfectada: 'tareas',
      registroId: id
    });

    return { message: 'Tarea cancelada' };
  },

  async avanzarKanban({
    prenda_id,
    cantidad,
    proceso_origen,
    proceso_destino,
    trabajador_id,
    tarea_id_origen,
    registro_id
  }, userId) {
    const qty = Number(cantidad || 0);
    if (!prenda_id || !proceso_origen || !proceso_destino || !qty || qty <= 0) {
      const err = new Error('Prenda, cantidad válida (>0), proceso origen y destino son requeridos');
      err.status = 400;
      throw err;
    }

    // 1. Validar prenda existente
    const prenda = await dbAsync.get('SELECT * FROM prendas WHERE id = ?', [prenda_id]);
    if (!prenda) {
      const err = new Error('Prenda no encontrada');
      err.status = 404;
      throw err;
    }

    // 2. Validar regla de planchado
    if (proceso_destino === 'planchado' && Number(prenda.requiere_plancha) !== 1) {
      const err = new Error(`La prenda "${prenda.nombre}" no requiere planchado`);
      err.status = 400;
      throw err;
    }

    // 3. Validar stock disponible en proceso_origen
    const filtroOrigenStock = proceso_origen === 'stock' ? ' AND departamento_actual IS NULL' : '';
    const stockRow = await dbAsync.get(
      `SELECT SUM(cantidad) as total FROM prendas_proceso WHERE prenda_id = ? AND proceso = ?${filtroOrigenStock}`,
      [prenda_id, proceso_origen]
    );
    const stockTotal = stockRow ? Number(stockRow.total || 0) : 0;
    if (stockTotal < qty) {
      const err = new Error(`Stock insuficiente en ${proceso_origen.toUpperCase()}. Disponible: ${stockTotal}, solicitado: ${qty}`);
      err.status = 400;
      throw err;
    }

    // 4. Liquidar / completar etapa previa si hay tarea asignada
    let tareaOrigen = null;
    if (tarea_id_origen) {
      tareaOrigen = await dbAsync.get('SELECT * FROM tareas WHERE id = ?', [tarea_id_origen]);
    } else {
      tareaOrigen = await dbAsync.get(
        `SELECT * FROM tareas WHERE prenda_id = ? AND proceso = ? AND estado IN ('asignada', 'en_proceso') ORDER BY id ASC LIMIT 1`,
        [prenda_id, proceso_origen]
      );
    }

    if (tareaOrigen) {
      const cantTarea = Number(tareaOrigen.cantidad || 0);
      if (qty >= cantTarea) {
        // Se completa la tarea entera del operario anterior
        await dbAsync.run(
          `UPDATE tareas SET estado = 'completada', fecha_fin = CURRENT_TIMESTAMP WHERE id = ?`,
          [tareaOrigen.id]
        );
      } else {
        // Pase parcial: la tarea existente se reduce a lo que queda
        const restante = cantTarea - qty;
        const precioUnit = Number(tareaOrigen.precio_unitario || 0);
        await dbAsync.run(
          `UPDATE tareas SET cantidad = ?, total = ? WHERE id = ?`,
          [restante, restante * precioUnit, tareaOrigen.id]
        );

        // Se inserta una tarea completada por la cantidad transferida para pagarle al operario previo
        await dbAsync.run(
          `INSERT INTO tareas (trabajador_id, proceso, prenda_id, cantidad, precio_unitario, total, fecha_asignacion, fecha_inicio, fecha_fin, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, 'completada')`,
          [
            tareaOrigen.trabajador_id,
            tareaOrigen.proceso,
            prenda_id,
            qty,
            precioUnit,
            qty * precioUnit,
            tareaOrigen.fecha_asignacion,
            tareaOrigen.fecha_inicio
          ]
        );
      }
    }

    // 5. Mover stock físico
    await moverStockProceso(prenda_id, proceso_origen, proceso_destino, qty, userId);

    // 6. Asignar nuevo operario en proceso_destino si aplica
    let nuevaTareaId = null;
    let totalPagoNuevo = 0;
    let trabajadorNombre = null;
    if (trabajador_id && proceso_destino !== 'stock') {
      const trabajador = await dbAsync.get('SELECT * FROM trabajadores WHERE id = ?', [trabajador_id]);
      if (!trabajador) {
        const err = new Error('Trabajador seleccionado no encontrado');
        err.status = 404;
        throw err;
      }
      trabajadorNombre = trabajador.nombre;

      const precioPersonalizado = await dbAsync.get(
        'SELECT precio FROM precios_trabajador WHERE trabajador_id = ? AND proceso = ?',
        [trabajador_id, proceso_destino]
      );

      const precioBase = PROCESOS_SIN_PAGO.includes(proceso_destino) ? 0 : obtenerPrecio(trabajador, prenda, proceso_destino);
      const precioFinal = PROCESOS_SIN_PAGO.includes(proceso_destino) ? 0 : (precioPersonalizado ? Number(precioPersonalizado.precio || 0) : Number(precioBase || 0));
      totalPagoNuevo = precioFinal * qty;

      const sqlInsertTarea = `
        INSERT INTO tareas (trabajador_id, proceso, prenda_id, cantidad, precio_unitario, total, estado, fecha_asignacion)
        VALUES (?, ?, ?, ?, ?, ?, 'asignada', CURRENT_TIMESTAMP)
      `;
      const resNuevaTarea = await dbAsync.run(sqlInsertTarea, [
        trabajador_id,
        proceso_destino,
        prenda_id,
        qty,
        precioFinal,
        totalPagoNuevo
      ]);
      nuevaTareaId = resNuevaTarea.lastID;
    }

    // 7. Registro en bitácora
    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'AVANZAR_KANBAN',
      tablaAfectada: 'prendas_proceso',
      registroId: nuevaTareaId || registro_id || null,
      datosNuevos: {
        prenda_id,
        prenda_nombre: prenda.nombre,
        cantidad: qty,
        proceso_origen,
        proceso_destino,
        trabajador_id: trabajador_id || null,
        trabajador_nombre: trabajadorNombre,
        nueva_tarea_id: nuevaTareaId,
        total_pago: totalPagoNuevo
      }
    });

    return {
      message: `Prendas transferidas exitosamente a ${proceso_destino.toUpperCase()}`,
      prenda: prenda.nombre,
      cantidad: qty,
      proceso_destino,
      nueva_tarea_id: nuevaTareaId,
      total_pago: totalPagoNuevo,
      trabajador_nombre: trabajadorNombre
    };
  }
};

module.exports = tareasService;
