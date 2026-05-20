const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdmin, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  const sql = 'SELECT * FROM departamentos WHERE activo = 1 ORDER BY nombre';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id', verifyToken, (req, res) => {
  db.get('SELECT * FROM departamentos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: 'Departamento no encontrado' });
    res.json(row);
  });
});

router.post('/', verifyToken, requireAdmin, (req, res) => {
  const { nombre, descripcion } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre es requerido' });
  }

  const sql = 'INSERT INTO departamentos (nombre, descripcion) VALUES (?, ?)';

  db.run(sql, [nombre, descripcion], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ message: 'El departamento ya existe' });
      }
      return res.status(500).json({ error: err.message });
    }

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'CREAR', 'departamentos', this.lastID, JSON.stringify(req.body)]);

    res.status(201).json({ id: this.lastID, message: 'Departamento creado' });
  });
});

router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, activo } = req.body;

  const sql = `
    UPDATE departamentos
    SET nombre = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        activo = COALESCE(?, activo)
    WHERE id = ?
  `;

  db.run(sql, [nombre, descripcion, activo, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ACTUALIZAR', 'departamentos', id, JSON.stringify(req.body)]);

    res.json({ message: 'Departamento actualizado' });
  });
});

router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const sql = 'UPDATE departamentos SET activo = 0 WHERE id = ?';

  db.run(sql, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
      VALUES (?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ELIMINAR', 'departamentos', id]);

    res.json({ message: 'Departamento desactivado' });
  });
});

module.exports = router;