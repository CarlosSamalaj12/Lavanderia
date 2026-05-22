const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');

router.get('/resumen', verifyToken, (req, res) => {
  const queries = {
    total_prendas: 'SELECT COUNT(*) as total FROM prendas WHERE activo = 1',
    total_trabajadores: 'SELECT COUNT(*) as total FROM trabajadores WHERE activo = 1',
    total_departamentos: 'SELECT COUNT(*) as total FROM departamentos WHERE activo = 1',
    pedidos_pendientes: "SELECT COUNT(*) as total FROM pedidos WHERE estado = 'pendiente'",
    pedidos_hoy: "SELECT COUNT(*) as total FROM pedidos WHERE date(fecha_pedido) = date('now')",
    tareas_activas: "SELECT COUNT(*) as total FROM tareas WHERE estado IN ('asignada', 'en_proceso')"
  };

  const results = {};
  let completed = 0;
  const keys = Object.keys(queries);

  keys.forEach(key => {
    db.get(queries[key], [], (err, row) => {
      results[key] = row ? row.total : 0;
      completed++;
      if (completed === keys.length) {
        res.json(results);
      }
    });
  });
});

router.get('/stock-por-proceso', verifyToken, (req, res) => {
  const sql = `
    SELECT
      proceso,
      SUM(cantidad) as cantidad
    FROM prendas_proceso
    GROUP BY proceso
    ORDER BY proceso
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/tareas-recientes', verifyToken, (req, res) => {
  const sql = `
    SELECT
      t.*,
      tr.nombre as trabajador_nombre,
      p.nombre as prenda_nombre
    FROM tareas t
    JOIN trabajadores tr ON t.trabajador_id = tr.id
    JOIN prendas p ON t.prenda_id = p.id
    ORDER BY t.fecha_asignacion DESC
    LIMIT 10
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/ultimos-movimientos', verifyToken, (req, res) => {
  const sql = `
    SELECT b.*, u.nombre as usuario_nombre
    FROM bitacora b
    JOIN usuarios u ON b.usuario_id = u.id
    ORDER BY b.fecha DESC
    LIMIT 10
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/departamentos-stock', verifyToken, (req, res) => {
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
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/pagos-semana', verifyToken, (req, res) => {
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
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { total: 0, cantidad_tareas: 0 });
  });
});

router.get('/top-procesos', verifyToken, (req, res) => {
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

  db.get(sqlEmpleado, [], (errEmp, empleado) => {
    if (errEmp) return res.status(500).json({ error: errEmp.message });
    db.get(sqlPrenda, [], (errPrenda, prenda) => {
      if (errPrenda) return res.status(500).json({ error: errPrenda.message });
      res.json({
        top_empleado: empleado || null,
        top_prenda: prenda || null
      });
    });
  });
});

module.exports = router;
