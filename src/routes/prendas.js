const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdmin, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  const { q } = req.query;
  
  let sql, params;
  
  if (q) {
    sql = `
      SELECT p.*,
        (SELECT SUM(cantidad) FROM prendas_proceso WHERE prenda_id = p.id) as total_stock
      FROM prendas p
      WHERE p.activo = 1 AND p.nombre LIKE ?
      ORDER BY p.nombre
    `;
    params = [`%${q}%`];
  } else {
    sql = `
      SELECT p.*,
        (SELECT SUM(cantidad) FROM prendas_proceso WHERE prenda_id = p.id) as total_stock
      FROM prendas p
      WHERE p.activo = 1
      ORDER BY p.nombre
    `;
    params = [];
  }
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/stock', verifyToken, (req, res) => {
  const sql = `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      pr.proceso,
      COALESCE(SUM(pr.cantidad), 0) as cantidad,
      d.nombre as departamento_nombre
    FROM prendas p
    LEFT JOIN prendas_proceso pr ON p.id = pr.prenda_id
    LEFT JOIN departamentos d ON pr.departamento_actual = d.id
    WHERE p.activo = 1
    GROUP BY p.id, pr.proceso
    ORDER BY p.nombre, pr.proceso
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/stock/resumen', verifyToken, (req, res) => {
  const sql = `
    SELECT
      proceso,
      SUM(cantidad) as cantidad
    FROM prendas_proceso
    GROUP BY proceso
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Stock y trazabilidad por prenda
router.get('/:id/stock-trazabilidad', verifyToken, (req, res) => {
  const { id } = req.params;
  
  const sql = `
    SELECT 
      pp.proceso,
      pp.cantidad,
      pp.departamento_actual,
      COALESCE(d.nombre, 'Lavanderia') as departamento_nombre
    FROM prendas_proceso pp
    LEFT JOIN departamentos d ON pp.departamento_actual = d.id
    WHERE pp.prenda_id = ?
    ORDER BY pp.proceso
  `;
  
  db.all(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', verifyToken, requireAdmin, (req, res) => {
  const {
    nombre, descripcion,
    precio_sucio_factura, precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
    precio_sucio, precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
    requiere_plancha
  } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre es requerido' });
  }

  const sql = `
    INSERT INTO prendas (nombre, descripcion, 
      precio_sucio_factura, precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
      precio_sucio, precio_remojo, precio_lavado, precio_desmanche, precio_planchado, 
      requiere_plancha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    nombre, descripcion || null,
    precio_sucio_factura || 0, precio_remojo_factura || 0, precio_lavado_factura || 0, precio_desmanche_factura || 0, precio_planchado_factura || 0,
    precio_sucio || 0, precio_remojo || 0, precio_lavado || 0, precio_desmanche || 0, precio_planchado || 0,
    requiere_plancha !== undefined ? requiere_plancha : 1
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'CREAR', 'prendas', this.lastID, JSON.stringify(req.body)]);

    res.status(201).json({ id: this.lastID, message: 'Prenda creada' });
  });
});

router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const {
    nombre, descripcion,
    precio_sucio_factura, precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
    precio_sucio, precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
    requiere_plancha, activo
  } = req.body;

  const sql = `
    UPDATE prendas SET
      nombre = COALESCE(?, nombre),
      descripcion = COALESCE(?, descripcion),
      precio_sucio_factura = COALESCE(?, precio_sucio_factura),
      precio_remojo_factura = COALESCE(?, precio_remojo_factura),
      precio_lavado_factura = COALESCE(?, precio_lavado_factura),
      precio_desmanche_factura = COALESCE(?, precio_desmanche_factura),
      precio_planchado_factura = COALESCE(?, precio_planchado_factura),
      precio_sucio = COALESCE(?, precio_sucio),
      precio_remojo = COALESCE(?, precio_remojo),
      precio_lavado = COALESCE(?, precio_lavado),
      precio_desmanche = COALESCE(?, precio_desmanche),
      precio_planchado = COALESCE(?, precio_planchado),
      requiere_plancha = COALESCE(?, requiere_plancha),
      activo = COALESCE(?, activo)
    WHERE id = ?
  `;

  db.run(sql, [
    nombre, descripcion,
    precio_sucio_factura, precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
    precio_sucio, precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
    requiere_plancha, activo, id
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ACTUALIZAR', 'prendas', id, JSON.stringify(req.body)]);

    res.json({ message: 'Prenda actualizada' });
  });
});

router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const sql = 'UPDATE prendas SET activo = 0 WHERE id = ?';

  db.run(sql, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
      VALUES (?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ELIMINAR', 'prendas', id]);

    res.json({ message: 'Prenda desactivada' });
  });
});

module.exports = router;
