const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  const { tabla, accion, usuario_id, fecha_inicio, fecha_fin, limite } = req.query;

  let sql = `
    SELECT b.*, u.nombre as usuario_nombre
    FROM bitacora b
    JOIN usuarios u ON b.usuario_id = u.id
    WHERE b.id > 0
  `;
  const params = [];

  if (tabla) {
    sql += ' AND b.tabla_afectada = ?';
    params.push(tabla);
  }
  if (accion) {
    sql += ' AND b.accion = ?';
    params.push(accion);
  }
  if (usuario_id) {
    sql += ' AND b.usuario_id = ?';
    params.push(usuario_id);
  }
  if (fecha_inicio) {
    sql += ' AND b.fecha >= ?';
    params.push(fecha_inicio);
  }
  if (fecha_fin) {
    sql += ' AND b.fecha <= ?';
    params.push(fecha_fin);
  }

  sql += ' ORDER BY b.fecha DESC';

  if (limite) {
    sql += ' LIMIT ?';
    params.push(parseInt(limite));
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/ultimos', verifyToken, (req, res) => {
  const { limite } = req.query;
  const limit = limite || 20;

  const sql = `
    SELECT b.*, u.nombre as usuario_nombre
    FROM bitacora b
    JOIN usuarios u ON b.usuario_id = u.id
    ORDER BY b.fecha DESC
    LIMIT ?
  `;
  db.all(sql, [parseInt(limit)], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;