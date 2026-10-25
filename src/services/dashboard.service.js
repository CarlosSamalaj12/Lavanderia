const dbAsync = require('../utils/db-async');

const dashboardService = {
  async obtenerResumen() {
    const [prendas, trabajadores, departamentos, pedidosPend, pedidosHoy, tareasActivas] = await Promise.all([
      dbAsync.get('SELECT COUNT(*) as total FROM prendas WHERE activo = 1'),
      dbAsync.get('SELECT COUNT(*) as total FROM trabajadores WHERE activo = 1'),
      dbAsync.get('SELECT COUNT(*) as total FROM departamentos WHERE activo = 1'),
      dbAsync.get("SELECT COUNT(*) as total FROM pedidos WHERE estado = 'pendiente'"),
      dbAsync.get("SELECT COUNT(*) as total FROM pedidos WHERE date(fecha_pedido) = date('now')"),
      dbAsync.get("SELECT COUNT(*) as total FROM tareas WHERE estado IN ('asignada', 'en_proceso')")
    ]);

    return {
      total_prendas: prendas ? prendas.total : 0,
      total_trabajadores: trabajadores ? trabajadores.total : 0,
      total_departamentos: departamentos ? departamentos.total : 0,
      pedidos_pendientes: pedidosPend ? pedidosPend.total : 0,
      pedidos_hoy: pedidosHoy ? pedidosHoy.total : 0,
      tareas_activas: tareasActivas ? tareasActivas.total : 0
    };
  },

  async stockPorProceso() {
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

  async tareasRecientes(limite = 10) {
    const sql = `
      SELECT
        t.*,
        tr.nombre as trabajador_nombre,
        p.nombre as prenda_nombre
      FROM tareas t
      JOIN trabajadores tr ON t.trabajador_id = tr.id
      JOIN prendas p ON t.prenda_id = p.id
      ORDER BY t.fecha_asignacion DESC
      LIMIT ?
    `;
    return await dbAsync.all(sql, [limite]);
  },

  async ultimosMovimientos(limite = 10) {
    const sql = `
      SELECT b.*, u.nombre as usuario_nombre
      FROM bitacora b
      JOIN usuarios u ON b.usuario_id = u.id
      ORDER BY b.fecha DESC
      LIMIT ?
    `;
    return await dbAsync.all(sql, [limite]);
  },

  async departamentosStock() {
    const sql = `
      SELECT
        d.id,
        d.nombre,
        COALESCE(SUM(CASE WHEN pp.proceso = 'stock' THEN pp.cantidad ELSE 0 END), 0) as stock,
        COALESCE(SUM(CASE WHEN pp.proceso = 'sucio' THEN pp.cantidad ELSE 0 END), 0) as en_sucio
      FROM departamentos d
      LEFT JOIN prendas_proceso pp ON d.id = pp.departamento_actual
      WHERE d.activo = 1
      GROUP BY d.id, d.nombre
      ORDER BY d.nombre
    `;
    return await dbAsync.all(sql);
  },

  async pagosSemana() {
    const sql = `
      WITH semana AS (
        SELECT
          date('now', '-' || ((CAST(strftime('%w','now') AS INTEGER) + 6) % 7) || ' days') AS inicio,
          date(date('now', '-' || ((CAST(strftime('%w','now') AS INTEGER) + 6) % 7) || ' days'), '+6 days') AS fin
      )
      SELECT
        COALESCE(SUM(t.total), 0) as total,
        COUNT(t.id) as cantidad_tareas,
        (SELECT inicio FROM semana) as semana_inicio,
        (SELECT fin FROM semana) as semana_fin
      FROM tareas t
      WHERE t.estado = 'completada'
        AND date(t.fecha_fin) >= (SELECT inicio FROM semana)
        AND date(t.fecha_fin) <= (SELECT fin FROM semana)
    `;
    const row = await dbAsync.get(sql);
    return row || { total: 0, cantidad_tareas: 0 };
  },

  async topProcesos() {
    const sqlEmpleado = `
      SELECT
        tr.id as trabajador_id,
        tr.nombre as trabajador_nombre,
        COUNT(t.id) as total_procesos,
        COALESCE(SUM(t.cantidad), 0) as total_prendas
      FROM tareas t
      JOIN trabajadores tr ON t.trabajador_id = tr.id
      WHERE t.estado = 'completada'
      GROUP BY tr.id, tr.nombre
      ORDER BY total_procesos DESC, total_prendas DESC
      LIMIT 1
    `;

    const sqlPrenda = `
      SELECT
        p.id as prenda_id,
        p.nombre as prenda_nombre,
        COUNT(t.id) as total_procesos,
        COALESCE(SUM(t.cantidad), 0) as total_prendas
      FROM tareas t
      JOIN prendas p ON t.prenda_id = p.id
      WHERE t.estado = 'completada'
      GROUP BY p.id, p.nombre
      ORDER BY total_procesos DESC, total_prendas DESC
      LIMIT 1
    `;

    const [empleado, prenda] = await Promise.all([
      dbAsync.get(sqlEmpleado),
      dbAsync.get(sqlPrenda)
    ]);

    return {
      top_empleado: empleado || null,
      top_prenda: prenda || null
    };
  }
};

module.exports = dashboardService;
