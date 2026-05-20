const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdmin, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  const sql = `
    SELECT t.*,
      (SELECT COUNT(*) FROM tareas WHERE trabajador_id = t.id AND estado != 'completada') as tareas_activas
    FROM trabajadores t
    WHERE t.activo = 1
    ORDER BY t.nombre
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id/precios', verifyToken, (req, res) => {
  const { id } = req.params;

  const sql = 'SELECT * FROM precios_trabajador WHERE trabajador_id = ?';
  db.all(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', verifyToken, requireAdmin, (req, res) => {
  const { nombre, cedula, telefono, factura, precios } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre es requerido' });
  }

  const sql = 'INSERT INTO trabajadores (nombre, cedula, telefono, factura) VALUES (?, ?, ?, ?)';

  db.run(sql, [nombre, cedula || null, telefono || null, factura ? 1 : 0], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const trabajadorId = this.lastID;

    if (precios && Array.isArray(precios)) {
      const precioSql = 'INSERT INTO precios_trabajador (trabajador_id, proceso, precio) VALUES (?, ?, ?)';
      precios.forEach(p => {
        db.run(precioSql, [trabajadorId, p.proceso, p.precio]);
      });
    }

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'CREAR', 'trabajadores', trabajadorId, JSON.stringify(req.body)]);

    res.status(201).json({ id: trabajadorId, message: 'Trabajador creado' });
  });
});

router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nombre, cedula, telefono, factura, activo } = req.body;

  const sql = `
    UPDATE trabajadores SET
      nombre = COALESCE(?, nombre),
      cedula = COALESCE(?, cedula),
      telefono = COALESCE(?, telefono),
      factura = COALESCE(?, factura),
      activo = COALESCE(?, activo)
    WHERE id = ?
  `;

  db.run(sql, [nombre, cedula, telefono, factura, activo, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ACTUALIZAR', 'trabajadores', id, JSON.stringify(req.body)]);

    res.json({ message: 'Trabajador actualizado' });
  });
});

router.put('/:id/precios', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { precios } = req.body;

  db.run('DELETE FROM precios_trabajador WHERE trabajador_id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (precios && Array.isArray(precios)) {
      const precioSql = 'INSERT INTO precios_trabajador (trabajador_id, proceso, precio) VALUES (?, ?, ?)';
      precios.forEach(p => {
        db.run(precioSql, [id, p.proceso, p.precio]);
      });
    }

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ACTUALIZAR', 'precios_trabajador', id, JSON.stringify({ precios })]);

    res.json({ message: 'Precios actualizados' });
  });
});

router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const sql = 'UPDATE trabajadores SET activo = 0 WHERE id = ?';

  db.run(sql, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
      VALUES (?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ELIMINAR', 'trabajadores', id]);

    res.json({ message: 'Trabajador desactivado' });
  });
});

module.exports = router;