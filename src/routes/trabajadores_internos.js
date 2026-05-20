const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdmin, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  db.all(
    `SELECT id, nombre, cedula, telefono, activo, created_at
     FROM trabajadores
     WHERE activo = 1 AND es_interno = 1
     ORDER BY nombre`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

router.post('/', verifyToken, requireAdmin, (req, res) => {
  const { nombre, cedula, telefono } = req.body;
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ message: 'El nombre es requerido' });
  }

  db.run(
    'INSERT INTO trabajadores (nombre, cedula, telefono, factura, es_interno, activo) VALUES (?, ?, ?, 0, 1, 1)',
    [String(nombre).trim(), cedula || null, telefono || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Trabajador interno creado' });
    }
  );
});

router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nombre, cedula, telefono, activo } = req.body;

  db.run(
    `UPDATE trabajadores
     SET nombre = COALESCE(?, nombre),
         cedula = COALESCE(?, cedula),
         telefono = COALESCE(?, telefono),
         activo = COALESCE(?, activo)
     WHERE id = ? AND es_interno = 1`,
    [nombre, cedula, telefono, activo, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ message: 'Trabajador interno no encontrado' });
      res.json({ message: 'Trabajador interno actualizado' });
    }
  );
});

router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('UPDATE trabajadores SET activo = 0 WHERE id = ? AND es_interno = 1', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ message: 'Trabajador interno no encontrado' });
    res.json({ message: 'Trabajador interno desactivado' });
  });
});

module.exports = router;
