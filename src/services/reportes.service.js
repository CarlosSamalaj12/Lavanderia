const dbAsync = require('../utils/db-async');

const PROCESOS_PAGADOS = ['remojo', 'lavado', 'desmanche', 'planchado'];

const reportesService = {
  async pedidos({ fecha_inicio, fecha_fin, departamento_id, estado, pedido_id }) {
    let sql = `
      SELECT p.*, d.nombre as departamento_nombre
      FROM pedidos p
      JOIN departamentos d ON p.departamento_id = d.id
      WHERE p.id > 0
    `;
    const params = [];

    if (fecha_inicio) {
      sql += ' AND p.fecha_pedido >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND p.fecha_pedido <= ?';
      params.push(fecha_fin);
    }
    if (departamento_id) {
      sql += ' AND p.departamento_id = ?';
      params.push(departamento_id);
    }
    if (estado) {
      sql += ' AND p.estado = ?';
      params.push(estado);
    }
    if (pedido_id) {
      sql += ' AND p.id = ?';
      params.push(Number(pedido_id));
    }

    sql += ' ORDER BY p.fecha_pedido DESC';
    const rows = await dbAsync.all(sql, params);

    return await Promise.all(
      rows.map(async (pedido) => {
        const detalles = await dbAsync.all(
          `SELECT pd.cantidad, pd.cantidad_entregada, pr.nombre
           FROM pedidos_detalle pd
           JOIN prendas pr ON pd.prenda_id = pr.id
           WHERE pd.pedido_id = ?`,
          [pedido.id]
        );
        return { ...pedido, detalles };
      })
    );
  },

  async pedidosResumen({ fecha_inicio, fecha_fin, departamento_id }) {
    let sql = `
      SELECT
        d.nombre as departamento,
        COUNT(p.id) as total_pedidos,
        SUM(CASE WHEN p.estado = 'entregado' THEN 1 ELSE 0 END) as pedidos_entregados,
        SUM(CASE WHEN p.estado = 'pendiente' THEN 1 ELSE 0 END) as pedidos_pendientes,
        SUM(CASE WHEN p.estado = 'cancelado' THEN 1 ELSE 0 END) as pedidos_cancelados
      FROM pedidos p
      JOIN departamentos d ON p.departamento_id = d.id
      WHERE p.id > 0
    `;
    const params = [];

    if (fecha_inicio) {
      sql += ' AND p.fecha_pedido >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND p.fecha_pedido <= ?';
      params.push(fecha_fin);
    }
    if (departamento_id) {
      sql += ' AND p.departamento_id = ?';
      params.push(departamento_id);
    }

    sql += ' GROUP BY d.id, d.nombre ORDER BY d.nombre';
    return await dbAsync.all(sql, params);
  },

  async procesos({ fecha_inicio, fecha_fin, proceso }) {
    let sql = `
      SELECT
        p.nombre as prenda,
        pp.proceso,
        SUM(pp.cantidad) as cantidad,
        pp.fecha_ingreso
      FROM prendas_proceso pp
      JOIN prendas p ON pp.prenda_id = p.id
      WHERE pp.id > 0
    `;
    const params = [];

    if (fecha_inicio) {
      sql += ' AND pp.fecha_ingreso >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND pp.fecha_ingreso <= ?';
      params.push(fecha_fin);
    }
    if (proceso) {
      sql += ' AND pp.proceso = ?';
      params.push(proceso);
    }

    sql += ' GROUP BY pp.prenda_id, pp.proceso ORDER BY pp.proceso, p.nombre';
    return await dbAsync.all(sql, params);
  },

  async procesosResumen() {
    const sql = `
      SELECT
        proceso,
        SUM(cantidad) as cantidad
      FROM prendas_proceso
      GROUP BY proceso
      ORDER BY proceso
    `;
    return await dbAsync.all(sql);
  },

  async pagos({ fecha_inicio, fecha_fin, trabajador_id }) {
    let sql = `
      SELECT
        t.id as tarea_id,
        t.proceso,
        t.cantidad,
        t.precio_unitario,
        t.total,
        t.fecha_asignacion,
        t.fecha_fin,
        tr.id as trabajador_id,
        tr.nombre as trabajador_nombre,
        tr.factura,
        p.nombre as prenda_nombre
      FROM tareas t
      JOIN trabajadores tr ON t.trabajador_id = tr.id
      JOIN prendas p ON t.prenda_id = p.id
      WHERE t.estado = 'completada'
      AND t.proceso IN (${PROCESOS_PAGADOS.map(() => '?').join(',')})
    `;
    const params = [...PROCESOS_PAGADOS];

    if (fecha_inicio) {
      sql += ' AND t.fecha_fin >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND t.fecha_fin <= ?';
      params.push(fecha_fin);
    }
    if (trabajador_id) {
      sql += ' AND t.trabajador_id = ?';
      params.push(trabajador_id);
    }

    sql += ' ORDER BY t.fecha_fin DESC';
    return await dbAsync.all(sql, params);
  },

  async pagosResumenTrabajador({ fecha_inicio, fecha_fin, trabajador_id }) {
    let sql = `
      SELECT
        tr.id as trabajador_id,
        tr.nombre as trabajador_nombre,
        tr.factura,
        COUNT(t.id) as total_tareas,
        SUM(t.total) as total_pagar
      FROM tareas t
      JOIN trabajadores tr ON t.trabajador_id = tr.id
      WHERE t.estado = 'completada'
      AND t.proceso IN (${PROCESOS_PAGADOS.map(() => '?').join(',')})
    `;
    const params = [...PROCESOS_PAGADOS];

    if (fecha_inicio) {
      sql += ' AND t.fecha_fin >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND t.fecha_fin <= ?';
      params.push(fecha_fin);
    }
    if (trabajador_id) {
      sql += ' AND t.trabajador_id = ?';
      params.push(trabajador_id);
    }

    sql += ' GROUP BY tr.id ORDER BY tr.nombre';
    return await dbAsync.all(sql, params);
  },

  async pagosTotal({ fecha_inicio, fecha_fin }) {
    let sql = `
      SELECT
        SUM(total) as total_pagar,
        COUNT(*) as total_tareas
      FROM tareas
      WHERE estado = 'completada'
      AND proceso IN (${PROCESOS_PAGADOS.map(() => '?').join(',')})
    `;
    const params = [...PROCESOS_PAGADOS];

    if (fecha_inicio) {
      sql += ' AND fecha_fin >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND fecha_fin <= ?';
      params.push(fecha_fin);
    }

    return await dbAsync.get(sql, params);
  },

  async tareasCompletadas({ fecha_inicio, fecha_fin, trabajador_id, proceso }) {
    let sql = `
      SELECT
        t.id,
        t.proceso,
        t.cantidad,
        t.precio_unitario,
        t.total,
        t.fecha_asignacion,
        t.fecha_fin,
        tr.nombre as trabajador_nombre,
        p.nombre as prenda_nombre
      FROM tareas t
      JOIN trabajadores tr ON t.trabajador_id = tr.id
      JOIN prendas p ON t.prenda_id = p.id
      WHERE t.estado = 'completada'
    `;
    const params = [];

    if (fecha_inicio) {
      sql += ' AND t.fecha_fin >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND t.fecha_fin <= ?';
      params.push(fecha_fin);
    }
    if (trabajador_id) {
      sql += ' AND t.trabajador_id = ?';
      params.push(trabajador_id);
    }
    if (proceso) {
      sql += ' AND t.proceso = ?';
      params.push(proceso);
    }

    sql += ' ORDER BY t.fecha_fin DESC';
    return await dbAsync.all(sql, params);
  }
};

module.exports = reportesService;
