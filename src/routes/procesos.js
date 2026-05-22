const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireEncargado, requireAnyRole } = require('../middleware/auth');

const PROCESOS = ['sucio', 'remojo', 'lavado', 'tendido', 'recogido', 'reproceso', 'limpio', 'planchado', 'desmanche', 'stock'];

const PROCESO_SIGUIENTE = {
  'sucio': 'remojo',
  'remojo': 'lavado',
  'lavado': 'tendido',
  'tendido': 'recogido',
  'recogido': 'limpio',
  'reproceso': 'sucio',
  'limpio': 'planchado',
  'planchado': 'stock',
  'desmanche': 'lavado'
};

const PROCESOS_PAGADOS = ['sucio', 'remojo', 'lavado', 'desmanche', 'planchado'];

router.get('/', verifyToken, (req, res) => {
  const sql = `
    SELECT
      pp.id,
      pp.prenda_id,
      p.nombre as prenda_nombre,
      pp.proceso,
      pp.cantidad,
      pp.departamento_actual,
      d.nombre as departamento_nombre,
      pp.fecha_ingreso,
      pp.fecha_actualizacion
    FROM prendas_proceso pp
    JOIN prendas p ON pp.prenda_id = p.id
    LEFT JOIN departamentos d ON pp.departamento_actual = d.id
    ORDER BY pp.fecha_actualizacion DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/por-proceso/:proceso', verifyToken, (req, res) => {
  const { proceso } = req.params;

  if (!PROCESOS.includes(proceso)) {
    return res.status(400).json({ message: 'Proceso inválido' });
  }

  const whereStock = proceso === 'stock' ? ' AND pp.departamento_actual IS NULL' : '';

  const sql = `
    SELECT
      pp.id,
      pp.prenda_id,
      p.nombre as prenda_nombre,
      pp.proceso,
      pp.cantidad,
      pp.fecha_ingreso,
      u.nombre as usuario_ingreso
    FROM prendas_proceso pp
    JOIN prendas p ON pp.prenda_id = p.id
    LEFT JOIN usuarios u ON pp.usuario_registro = u.id
    WHERE pp.proceso = ?${whereStock}
    ORDER BY pp.fecha_ingreso DESC
  `;
  db.all(sql, [proceso], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/verificar-disponibilidad', verifyToken, (req, res) => {
  const { prenda_id, cantidad, proceso_actual } = req.body;

  const sql = `
    SELECT SUM(cantidad) as total
    FROM prendas_proceso
    WHERE prenda_id = ? AND proceso = ?
  `;

  db.get(sql, [prenda_id, proceso_actual], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row.total || row.total < cantidad) {
      return res.json({
        disponible: false,
        cantidad_disponible: row.total || 0,
        message: `Solo hay ${row.total || 0} unidades en proceso ${proceso_actual}`
      });
    }

    res.json({ disponible: true, cantidad_disponible: row.total });
  });
});

router.post('/mover', verifyToken, requireEncargado, (req, res) => {
  const { registro_id, proceso_destino, departamento_destino } = req.body;

  if (!registro_id || !proceso_destino) {
    return res.status(400).json({ message: 'Registro y proceso destino requeridos' });
  }

  db.get('SELECT * FROM prendas_proceso WHERE id = ?', [registro_id], (err, registro) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!registro) return res.status(404).json({ message: 'Registro no encontrado' });

    const movimientoSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_anteriores, datos_nuevos)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(movimientoSql, [
      req.userId,
      'MOVER_PROCESO',
      'prendas_proceso',
      registro_id,
      JSON.stringify({ proceso: registro.proceso, cantidad: registro.cantidad }),
      JSON.stringify({ proceso: proceso_destino, cantidad: registro.cantidad, departamento_destino })
    ]);

    const updateSql = `
      UPDATE prendas_proceso
      SET proceso = ?, departamento_actual = ?, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(updateSql, [proceso_destino, departamento_destino || null, registro_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Prenda movida a ${proceso_destino}` });
    });
  });
});

router.post('/ingresar', verifyToken, requireEncargado, (req, res) => {
  const { prenda_id, cantidad, proceso, departamento_origen, estado_prenda } = req.body;

  if (!prenda_id || !cantidad || !proceso) {
    return res.status(400).json({ message: 'Prenda, cantidad y proceso requeridos' });
  }

  const procesoAsignar = estado_prenda === 'limpio' ? 'limpio' : 'sucio';

  const sql = `
    INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [prenda_id, procesoAsignar, cantidad, departamento_origen || null, req.userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'INGRESAR', 'prendas_proceso', this.lastID, JSON.stringify(req.body)]);

    res.status(201).json({ id: this.lastID, message: `Prenda ingresada a ${procesoAsignar}` });
  });
});

router.post('/revertir', verifyToken, requireEncargado, (req, res) => {
  const { registro_id, proceso_anterior } = req.body;

  if (!registro_id || !proceso_anterior) {
    return res.status(400).json({ message: 'Registro y proceso anterior requeridos' });
  }

  db.get('SELECT * FROM prendas_proceso WHERE id = ?', [registro_id], (err, registro) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!registro) return res.status(404).json({ message: 'Registro no encontrado' });

    const sql = `
      UPDATE prendas_proceso
      SET proceso = ?, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(sql, [proceso_anterior, registro_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const bitacoraSql = `
        INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_anteriores)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(bitacoraSql, [req.userId, 'REVERTIR', 'prendas_proceso', registro_id, JSON.stringify({ proceso: registro.proceso })]);

      res.json({ message: `Prenda revertida a ${proceso_anterior}` });
    });
  });
});

router.delete('/:id', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM prendas_proceso WHERE id = ?', [id], (err, registro) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!registro) return res.status(404).json({ message: 'Registro no encontrado' });

    const sql = 'DELETE FROM prendas_proceso WHERE id = ?';
    db.run(sql, [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const bitacoraSql = `
        INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_anteriores)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(bitacoraSql, [req.userId, 'ELIMINAR', 'prendas_proceso', id, JSON.stringify(registro)]);

      res.json({ message: 'Registro eliminado' });
    });
  });
});

// Devolver prendas del departamento
router.post('/devolver', verifyToken, requireAnyRole, (req, res) => {
  const { prenda_id, cantidad, condicion, departamento_id, motivo } = req.body;
  
  if (!prenda_id || !cantidad || !condicion || !departamento_id) {
    return res.status(400).json({ message: 'Datos requeridos' });
  }

  if (!['limpio', 'sucio'].includes(condicion)) {
    return res.status(400).json({ message: 'La condicion debe ser limpio o sucio' });
  }
  
  if (cantidad <= 0) {
    return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
  }
  
  const procesoDestino = condicion === 'limpio' ? 'stock' : 'sucio';
  
  // Verificar stock disponible del departamento
  const checkSql = `
    SELECT id, cantidad FROM prendas_proceso 
    WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual = ?
  `;
  
  db.get(checkSql, [prenda_id, departamento_id], (err, stock) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (!stock || stock.cantidad < cantidad) {
      return res.status(400).json({ message: 'Stock insuficiente para devolver' });
    }
    
    // Descontar del stock actual
    const nuevaCantidad = stock.cantidad - cantidad;
    if (nuevaCantidad > 0) {
      db.run('UPDATE prendas_proceso SET cantidad = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?', 
        [nuevaCantidad, stock.id]);
    } else {
      db.run('DELETE FROM prendas_proceso WHERE id = ?', [stock.id]);
    }
    
    db.get(
      'SELECT id FROM prendas_proceso WHERE prenda_id = ? AND proceso = ? AND departamento_actual = ? ORDER BY id ASC LIMIT 1',
      [prenda_id, procesoDestino, departamento_id],
      (findErr, destinoExistente) => {
        if (findErr) return res.status(500).json({ error: findErr.message });

        const registrarBitacora = () => {
          const bitacoraSql = `
            INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
            VALUES (?, ?, ?, ?, ?)
          `;
          db.run(bitacoraSql, [req.userId, 'DEVOLVER', 'prendas_proceso', null,
            JSON.stringify({
              prenda_id,
              cantidad,
              condicion,
              departamento_id,
              proceso_destino: procesoDestino,
              motivo: motivo || null,
              responsable: req.userId,
              fecha: new Date().toISOString()
            })
          ]);

          res.json({ message: `Prendas devueltas como ${condicion}` });
        };

        if (destinoExistente) {
          db.run(
            'UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
            [cantidad, destinoExistente.id],
            (updateErr) => {
              if (updateErr) return res.status(500).json({ error: updateErr.message });
              registrarBitacora();
            }
          );
          return;
        }

        const insertSql = `
          INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
          VALUES (?, ?, ?, ?, ?)
        `;
        db.run(insertSql, [prenda_id, procesoDestino, cantidad, departamento_id, req.userId], (insertErr) => {
          if (insertErr) return res.status(500).json({ error: insertErr.message });
          registrarBitacora();
        });
      }
    );
  });
});

// Stock por departamento
router.get('/stock/departamento/:departamento_id', verifyToken, (req, res) => {
  const { departamento_id } = req.params;
  
  const sql = `
    SELECT pp.prenda_id, p.nombre as prenda_nombre, SUM(pp.cantidad) as cantidad
    FROM prendas_proceso pp
    JOIN prendas p ON pp.prenda_id = p.id
    WHERE pp.departamento_actual = ? AND pp.proceso = 'stock'
    GROUP BY pp.prenda_id, p.nombre
  `;
  
  db.all(sql, [departamento_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;
