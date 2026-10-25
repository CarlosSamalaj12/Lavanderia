const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const pedidosService = {
  async listar({ estado, fecha_inicio, fecha_fin, departamento_id }) {
    let sql = `
      SELECT p.*, d.nombre as departamento_nombre, u.nombre as usuario_nombre
      FROM pedidos p
      JOIN departamentos d ON p.departamento_id = d.id
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      sql += ' AND p.estado = ?';
      params.push(estado);
    }
    if (departamento_id) {
      sql += ' AND p.departamento_id = ?';
      params.push(departamento_id);
    }
    if (fecha_inicio) {
      sql += ' AND p.fecha_pedido >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND p.fecha_pedido <= ?';
      params.push(fecha_fin);
    }

    sql += ' ORDER BY p.fecha_pedido DESC';
    const rows = await dbAsync.all(sql, params);

    return await Promise.all(
      rows.map(async (pedido) => {
        const detalles = await dbAsync.all(
          `SELECT pd.*, pr.nombre as prenda_nombre
           FROM pedidos_detalle pd
           JOIN prendas pr ON pd.prenda_id = pr.id
           WHERE pd.pedido_id = ?`,
          [pedido.id]
        );
        return { ...pedido, detalles };
      })
    );
  },

  async obtenerPorId(id) {
    const pedido = await dbAsync.get(
      `SELECT p.*, d.nombre as departamento_nombre, u.nombre as usuario_nombre
       FROM pedidos p
       JOIN departamentos d ON p.departamento_id = d.id
       JOIN usuarios u ON p.usuario_id = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (!pedido) {
      const err = new Error('Pedido no encontrado');
      err.status = 404;
      throw err;
    }

    const detalles = await dbAsync.all(
      `SELECT pd.*, pr.nombre as prenda_nombre, pr.descripcion
       FROM pedidos_detalle pd
       JOIN prendas pr ON pd.prenda_id = pr.id
       WHERE pd.pedido_id = ?`,
      [id]
    );

    return { ...pedido, detalles };
  },

  async crear({ departamento_id, observaciones, detalles, fecha_entrega }, userId, rawBody) {
    if (!departamento_id || !detalles || !detalles.length) {
      const err = new Error('Departamento y detalles requeridos');
      err.status = 400;
      throw err;
    }

    const sql = 'INSERT INTO pedidos (departamento_id, usuario_id, observaciones, fecha_entrega) VALUES (?, ?, ?, ?)';
    const result = await dbAsync.run(sql, [departamento_id, userId, observaciones || null, fecha_entrega || null]);
    const pedidoId = result.lastID;

    const detalleSql = 'INSERT INTO pedidos_detalle (pedido_id, prenda_id, cantidad) VALUES (?, ?, ?)';
    for (const d of detalles) {
      await dbAsync.run(detalleSql, [pedidoId, d.prenda_id, d.cantidad]);
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'CREAR',
      tablaAfectada: 'pedidos',
      registroId: pedidoId,
      datosNuevos: rawBody
    });

    return { id: pedidoId, message: 'Pedido creado' };
  },

  async entregar(id, { entregas }, userId) {
    if (!entregas || !entregas.length) {
      const err = new Error('Detalles de entrega requeridos');
      err.status = 400;
      throw err;
    }

    const pedido = await dbAsync.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) {
      const err = new Error('Pedido no encontrado');
      err.status = 404;
      throw err;
    }

    const updateSql = 'UPDATE pedidos SET estado = ?, fecha_entrega = CURRENT_TIMESTAMP WHERE id = ?';
    await dbAsync.run(updateSql, ['entregado', id]);

    for (const e of entregas) {
      if (!e || !e.detalle_id || !e.prenda_id || !e.cantidad_entregada || Number(e.cantidad_entregada) <= 0) {
        const err = new Error('Cada entrega debe incluir detalle_id, prenda_id y cantidad_entregada > 0');
        err.status = 400;
        throw err;
      }

      const detalle = await dbAsync.get(
        'SELECT id, pedido_id, prenda_id, cantidad, cantidad_entregada FROM pedidos_detalle WHERE id = ?',
        [e.detalle_id]
      );

      if (!detalle || Number(detalle.pedido_id) !== Number(id)) {
        const err = new Error(`El detalle ${e.detalle_id} no pertenece al pedido`);
        err.status = 400;
        throw err;
      }
      if (Number(detalle.prenda_id) !== Number(e.prenda_id)) {
        const err = new Error(`La prenda no coincide para el detalle ${e.detalle_id}`);
        err.status = 400;
        throw err;
      }

      const nuevaCantidad = Number(detalle.cantidad_entregada || 0) + Number(e.cantidad_entregada);
      if (nuevaCantidad > Number(detalle.cantidad)) {
        const err = new Error(`La cantidad entregada supera lo solicitado para el detalle ${e.detalle_id}`);
        err.status = 400;
        throw err;
      }

      const stockGeneralRows = await dbAsync.all(
        `SELECT id, cantidad FROM prendas_proceso
         WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual IS NULL
         ORDER BY id ASC`,
        [e.prenda_id]
      );

      const totalGeneral = (stockGeneralRows || []).reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
      if (totalGeneral < Number(e.cantidad_entregada)) {
        const err = new Error(`Stock general insuficiente para la prenda ${e.prenda_id}. Disponible: ${totalGeneral}`);
        err.status = 400;
        throw err;
      }

      let restante = Number(e.cantidad_entregada);
      for (const row of stockGeneralRows) {
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

      await dbAsync.run('UPDATE pedidos_detalle SET cantidad_entregada = ? WHERE id = ?', [nuevaCantidad, e.detalle_id]);

      const stockRow = await dbAsync.get(
        `SELECT id FROM prendas_proceso
         WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual = ?
         ORDER BY id ASC LIMIT 1`,
        [e.prenda_id, pedido.departamento_id]
      );

      if (stockRow) {
        await dbAsync.run(
          'UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
          [e.cantidad_entregada, stockRow.id]
        );
      } else {
        const prendasProcesoSql = `
          INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
          VALUES (?, 'stock', ?, ?, ?)
        `;
        await dbAsync.run(prendasProcesoSql, [e.prenda_id, e.cantidad_entregada, pedido.departamento_id, userId]);
      }
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ENTREGAR',
      tablaAfectada: 'pedidos',
      registroId: id,
      datosNuevos: { entregas }
    });

    return { message: 'Pedido entregado' };
  },

  async anularEntrega(id, userId) {
    const pedido = await dbAsync.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) {
      const err = new Error('Pedido no encontrado');
      err.status = 404;
      throw err;
    }
    if (pedido.estado !== 'entregado') {
      const err = new Error('Solo se puede anular un pedido entregado');
      err.status = 400;
      throw err;
    }

    const detalles = await dbAsync.all(
      'SELECT id, prenda_id, cantidad_entregada FROM pedidos_detalle WHERE pedido_id = ?',
      [id]
    );

    for (const d of detalles) {
      const qty = Number(d.cantidad_entregada || 0);
      if (qty <= 0) continue;

      const stockDeptRows = await dbAsync.all(
        `SELECT id, cantidad FROM prendas_proceso
         WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual = ?
         ORDER BY id ASC`,
        [d.prenda_id, pedido.departamento_id]
      );

      const totalDept = (stockDeptRows || []).reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
      if (totalDept < qty) {
        const err = new Error(`Stock insuficiente en departamento para anular detalle ${d.id}`);
        err.status = 400;
        throw err;
      }

      let restante = qty;
      for (const row of stockDeptRows) {
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

      const stockGeneralRow = await dbAsync.get(
        `SELECT id FROM prendas_proceso
         WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual IS NULL
         ORDER BY id ASC LIMIT 1`,
        [d.prenda_id]
      );

      if (stockGeneralRow) {
        await dbAsync.run(
          'UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
          [qty, stockGeneralRow.id]
        );
      } else {
        const sqlInsert = `
          INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
          VALUES (?, 'stock', ?, NULL, ?)
        `;
        await dbAsync.run(sqlInsert, [d.prenda_id, qty, userId]);
      }

      await dbAsync.run('UPDATE pedidos_detalle SET cantidad_entregada = 0 WHERE id = ?', [d.id]);
    }

    await dbAsync.run('UPDATE pedidos SET estado = ?, fecha_entrega = NULL WHERE id = ?', ['pendiente', id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ANULAR_ENTREGA_TOTAL',
      tablaAfectada: 'pedidos',
      registroId: id,
      datosNuevos: { pedido_id: id }
    });

    return { message: 'Entrega del pedido anulada' };
  },

  async anularEntregaItem(id, { detalle_id, cantidad }, userId) {
    const qty = Number(cantidad);
    if (!detalle_id || !Number.isInteger(qty) || qty <= 0) {
      const err = new Error('detalle_id y cantidad (>0) son requeridos');
      err.status = 400;
      throw err;
    }

    const pedido = await dbAsync.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) {
      const err = new Error('Pedido no encontrado');
      err.status = 404;
      throw err;
    }
    if (pedido.estado !== 'entregado') {
      const err = new Error('Solo se puede anular sobre pedidos entregados');
      err.status = 400;
      throw err;
    }

    const detalle = await dbAsync.get(
      'SELECT id, pedido_id, prenda_id, cantidad, cantidad_entregada FROM pedidos_detalle WHERE id = ?',
      [detalle_id]
    );

    if (!detalle || Number(detalle.pedido_id) !== Number(id)) {
      const err = new Error('El detalle no pertenece al pedido');
      err.status = 400;
      throw err;
    }
    if (Number(detalle.cantidad_entregada || 0) < qty) {
      const err = new Error(`Solo hay ${detalle.cantidad_entregada || 0} entregadas en ese detalle`);
      err.status = 400;
      throw err;
    }

    const stockDeptRows = await dbAsync.all(
      `SELECT id, cantidad FROM prendas_proceso
       WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual = ?
       ORDER BY id ASC`,
      [detalle.prenda_id, pedido.departamento_id]
    );

    const totalDept = (stockDeptRows || []).reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
    if (totalDept < qty) {
      const err = new Error('Stock insuficiente en departamento para anular esa cantidad');
      err.status = 400;
      throw err;
    }

    let restante = qty;
    for (const row of stockDeptRows) {
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

    const stockGeneralRow = await dbAsync.get(
      `SELECT id FROM prendas_proceso
       WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual IS NULL
       ORDER BY id ASC LIMIT 1`,
      [detalle.prenda_id]
    );

    if (stockGeneralRow) {
      await dbAsync.run(
        'UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [qty, stockGeneralRow.id]
      );
    } else {
      const sqlInsert = `
        INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
        VALUES (?, 'stock', ?, NULL, ?)
      `;
      await dbAsync.run(sqlInsert, [detalle.prenda_id, qty, userId]);
    }

    await dbAsync.run(
      'UPDATE pedidos_detalle SET cantidad_entregada = cantidad_entregada - ? WHERE id = ?',
      [qty, detalle.id]
    );

    const resumen = await dbAsync.get(
      'SELECT SUM(cantidad) as total, SUM(cantidad_entregada) as total_entregado FROM pedidos_detalle WHERE pedido_id = ?',
      [id]
    );

    const estado = Number(resumen?.total_entregado || 0) >= Number(resumen?.total || 0) ? 'entregado' : 'pendiente';
    const fechaEntrega = estado === 'entregado' ? pedido.fecha_entrega : null;

    await dbAsync.run('UPDATE pedidos SET estado = ?, fecha_entrega = ? WHERE id = ?', [estado, fechaEntrega, id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ANULAR_ENTREGA_ITEM',
      tablaAfectada: 'pedidos',
      registroId: id,
      datosNuevos: { detalle_id, cantidad: qty }
    });

    return { message: 'Entrega de prenda anulada', estado };
  },

  async anularItemPendiente(id, { detalle_id, cantidad }, userId) {
    const qty = Number(cantidad);
    if (!detalle_id || !Number.isInteger(qty) || qty <= 0) {
      const err = new Error('detalle_id y cantidad (>0) son requeridos');
      err.status = 400;
      throw err;
    }

    const pedido = await dbAsync.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) {
      const err = new Error('Pedido no encontrado');
      err.status = 404;
      throw err;
    }
    if (pedido.estado !== 'pendiente') {
      const err = new Error('Solo se pueden anular prendas en pedidos pendientes');
      err.status = 400;
      throw err;
    }

    const detalle = await dbAsync.get(
      'SELECT id, pedido_id, prenda_id, cantidad, cantidad_entregada FROM pedidos_detalle WHERE id = ?',
      [detalle_id]
    );

    if (!detalle || Number(detalle.pedido_id) !== Number(id)) {
      const err = new Error('El detalle no pertenece al pedido');
      err.status = 400;
      throw err;
    }
    if (Number(detalle.cantidad_entregada || 0) > 0) {
      const err = new Error('No se puede anular este detalle porque ya tiene entrega registrada');
      err.status = 400;
      throw err;
    }
    if (qty > Number(detalle.cantidad || 0)) {
      const err = new Error(`Cantidad invalida. Solicitado en detalle: ${detalle.cantidad}`);
      err.status = 400;
      throw err;
    }

    const restante = Number(detalle.cantidad) - qty;
    if (restante > 0) {
      await dbAsync.run('UPDATE pedidos_detalle SET cantidad = ? WHERE id = ?', [restante, detalle_id]);
    } else {
      await dbAsync.run('DELETE FROM pedidos_detalle WHERE id = ?', [detalle_id]);
    }

    const row = await dbAsync.get('SELECT COUNT(*) as total FROM pedidos_detalle WHERE pedido_id = ?', [id]);
    if (Number(row?.total || 0) === 0) {
      const marca = '[ANULADO] Pedido sin detalles pendientes';
      const obs = (pedido.observaciones || '').trim();
      const observaciones = obs ? `${obs}\n${marca}` : marca;
      await dbAsync.run('UPDATE pedidos SET estado = ?, observaciones = ? WHERE id = ?', ['cancelado', observaciones, id]);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'ANULAR_ITEM_PENDIENTE',
        tablaAfectada: 'pedidos',
        registroId: id,
        datosNuevos: { detalle_id, cantidad: qty, cancelado: true }
      });

      return { message: 'Prenda anulada y pedido marcado como cancelado' };
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ANULAR_ITEM_PENDIENTE',
      tablaAfectada: 'pedidos',
      registroId: id,
      datosNuevos: { detalle_id, cantidad: qty, cancelado: false }
    });

    return { message: 'Prenda anulada del pedido pendiente' };
  },

  async cancelar(id, userId) {
    const pedido = await dbAsync.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) {
      const err = new Error('Pedido no encontrado');
      err.status = 404;
      throw err;
    }
    if (pedido.estado !== 'pendiente') {
      const err = new Error('Solo se pueden anular pedidos pendientes');
      err.status = 400;
      throw err;
    }

    const obs = (pedido.observaciones || '').trim();
    const marca = '[ANULADO] Pedido no entregado';
    const observaciones = obs ? `${obs}\n${marca}` : marca;

    await dbAsync.run('UPDATE pedidos SET estado = ?, observaciones = ? WHERE id = ?', ['cancelado', observaciones, id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'CANCELAR',
      tablaAfectada: 'pedidos',
      registroId: id
    });

    return { message: 'Pedido anulado (no entregado)' };
  }
};

module.exports = pedidosService;
