const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireEncargado, requireAnyRole } = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  const { estado, fecha_inicio, fecha_fin, departamento_id } = req.query;

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

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const pedidosConDetalle = rows.map(pedido => {
      return new Promise((resolve) => {
        db.all(`
          SELECT pd.*, pr.nombre as prenda_nombre
          FROM pedidos_detalle pd
          JOIN prendas pr ON pd.prenda_id = pr.id
          WHERE pd.pedido_id = ?
        `, [pedido.id], (err, detalles) => {
          resolve({ ...pedido, detalles });
        });
      });
    });

    Promise.all(pedidosConDetalle).then(result => res.json(result));
  });
});

router.get('/:id', verifyToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT p.*, d.nombre as departamento_nombre, u.nombre as usuario_nombre
    FROM pedidos p
    JOIN departamentos d ON p.departamento_id = d.id
    JOIN usuarios u ON p.usuario_id = u.id
    WHERE p.id = ?
  `, [id], (err, pedido) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' });

    db.all(`
      SELECT pd.*, pr.nombre as prenda_nombre, pr.descripcion
      FROM pedidos_detalle pd
      JOIN prendas pr ON pd.prenda_id = pr.id
      WHERE pd.pedido_id = ?
    `, [id], (err, detalles) => {
      res.json({ ...pedido, detalles });
    });
  });
});

router.post('/', verifyToken, requireAnyRole, (req, res) => {
  const { departamento_id, observaciones, detalles, fecha_entrega } = req.body;

  if (!departamento_id || !detalles || !detalles.length) {
    return res.status(400).json({ message: 'Departamento y detalles requeridos' });
  }

  const sql = 'INSERT INTO pedidos (departamento_id, usuario_id, observaciones, fecha_entrega) VALUES (?, ?, ?, ?)';

  db.run(sql, [departamento_id, req.userId, observaciones || null, fecha_entrega || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const pedidoId = this.lastID;

    const detalleSql = 'INSERT INTO pedidos_detalle (pedido_id, prenda_id, cantidad) VALUES (?, ?, ?)';
    detalles.forEach(d => {
      db.run(detalleSql, [pedidoId, d.prenda_id, d.cantidad]);
    });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'CREAR', 'pedidos', pedidoId, JSON.stringify(req.body)]);

    res.status(201).json({ id: pedidoId, message: 'Pedido creado' });
  });
});

router.put('/:id/entregar', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;
  const { entregas } = req.body;

  if (!entregas || !entregas.length) {
    return res.status(400).json({ message: 'Detalles de entrega requeridos' });
  }

  db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err, pedido) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' });

    const updateSql = 'UPDATE pedidos SET estado = ?, fecha_entrega = CURRENT_TIMESTAMP WHERE id = ?';
      db.run(updateSql, ['entregado', id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

      const procesarEntrega = (index) => {
        if (index >= entregas.length) {
          const bitacoraSql = `
            INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
            VALUES (?, ?, ?, ?, ?)
          `;
          db.run(bitacoraSql, [req.userId, 'ENTREGAR', 'pedidos', id, JSON.stringify({ entregas })]);

          return res.json({ message: 'Pedido entregado' });
        }

        const e = entregas[index];
        if (!e || !e.detalle_id || !e.prenda_id || !e.cantidad_entregada || Number(e.cantidad_entregada) <= 0) {
          return res.status(400).json({ message: 'Cada entrega debe incluir detalle_id, prenda_id y cantidad_entregada > 0' });
        }

        db.get(
          'SELECT id, pedido_id, prenda_id, cantidad, cantidad_entregada FROM pedidos_detalle WHERE id = ?',
          [e.detalle_id],
          (detalleErr, detalle) => {
            if (detalleErr) return res.status(500).json({ error: detalleErr.message });
            if (!detalle || Number(detalle.pedido_id) !== Number(id)) {
              return res.status(400).json({ message: `El detalle ${e.detalle_id} no pertenece al pedido` });
            }
            if (Number(detalle.prenda_id) !== Number(e.prenda_id)) {
              return res.status(400).json({ message: `La prenda no coincide para el detalle ${e.detalle_id}` });
            }

            const nuevaCantidad = Number(detalle.cantidad_entregada || 0) + Number(e.cantidad_entregada);
            if (nuevaCantidad > Number(detalle.cantidad)) {
              return res.status(400).json({ message: `La cantidad entregada supera lo solicitado para el detalle ${e.detalle_id}` });
            }

            db.all(
              `SELECT id, cantidad FROM prendas_proceso
               WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual IS NULL
               ORDER BY id ASC`,
              [e.prenda_id],
              (stockGeneralErr, stockGeneralRows) => {
                if (stockGeneralErr) return res.status(500).json({ error: stockGeneralErr.message });

                const totalGeneral = (stockGeneralRows || []).reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
                if (totalGeneral < Number(e.cantidad_entregada)) {
                  return res.status(400).json({ message: `Stock general insuficiente para la prenda ${e.prenda_id}. Disponible: ${totalGeneral}` });
                }

                const consumirStockGeneral = (rows, restante, done) => {
                  if (restante <= 0) return done(null);
                  if (!rows.length) return done(new Error('No fue posible descontar stock general'));
                  const row = rows[0];
                  const usar = Math.min(Number(row.cantidad || 0), restante);
                  const nueva = Number(row.cantidad || 0) - usar;
                  const next = () => consumirStockGeneral(rows.slice(1), restante - usar, done);
                  if (nueva > 0) {
                    db.run(
                      'UPDATE prendas_proceso SET cantidad = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
                      [nueva, row.id],
                      (uErr) => {
                        if (uErr) return done(uErr);
                        next();
                      }
                    );
                  } else {
                    db.run('DELETE FROM prendas_proceso WHERE id = ?', [row.id], (dErr) => {
                      if (dErr) return done(dErr);
                      next();
                    });
                  }
                };

                consumirStockGeneral(stockGeneralRows, Number(e.cantidad_entregada), (consumirErr) => {
                  if (consumirErr) return res.status(500).json({ error: consumirErr.message });

                  db.run('UPDATE pedidos_detalle SET cantidad_entregada = ? WHERE id = ?', [nuevaCantidad, e.detalle_id], (updErr) => {
                    if (updErr) return res.status(500).json({ error: updErr.message });

                    db.get(
                      `SELECT id FROM prendas_proceso
                       WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual = ?
                       ORDER BY id ASC LIMIT 1`,
                      [e.prenda_id, pedido.departamento_id],
                      (stockErr, stockRow) => {
                        if (stockErr) return res.status(500).json({ error: stockErr.message });

                        if (stockRow) {
                          db.run(
                            `UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                            [e.cantidad_entregada, stockRow.id],
                            (sumErr) => {
                              if (sumErr) return res.status(500).json({ error: sumErr.message });
                              procesarEntrega(index + 1);
                            }
                          );
                          return;
                        }

                        const prendasProcesoSql = `
                          INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
                          VALUES (?, 'stock', ?, ?, ?)
                        `;
                        db.run(prendasProcesoSql, [e.prenda_id, e.cantidad_entregada, pedido.departamento_id, req.userId], (insertErr) => {
                          if (insertErr) return res.status(500).json({ error: insertErr.message });
                          procesarEntrega(index + 1);
                        });
                      }
                    );
                  });
                });
              }
            );
          }
        );
      };

      procesarEntrega(0);
    });
  });
});

router.delete('/:id', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;

  const sql = 'UPDATE pedidos SET estado = ? WHERE id = ?';

  db.run(sql, ['cancelado', id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
      VALUES (?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'CANCELAR', 'pedidos', id]);

    res.json({ message: 'Pedido cancelado' });
  });
});

module.exports = router;
