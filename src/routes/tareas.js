const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireEncargado, requireAdmin } = require('../middleware/auth');

const PROCESOS_PAGADOS = ['remojo', 'lavado', 'desmanche', 'planchado'];
const PROCESOS_SIN_PAGO = ['tendido', 'recogido', 'reproceso'];
const PROCESO_ORIGEN_TAREA = {
  sucio: 'sucio',
  remojo: 'sucio',
  lavado: 'lavado',
  desmanche: 'lavado',
  planchado: 'limpio'
};

function obtenerStock(prendaId, proceso, done) {
  db.get(
    'SELECT COALESCE(SUM(cantidad), 0) as total FROM prendas_proceso WHERE prenda_id = ? AND proceso = ?',
    [prendaId, proceso],
    (err, row) => {
      if (err) return done(err);
      done(null, Number(row && row.total ? row.total : 0));
    }
  );
}

function sumarStock(prendaId, proceso, cantidad, userId, done) {
  db.get(
    `SELECT id FROM prendas_proceso WHERE prenda_id = ? AND proceso = ? ORDER BY id ASC LIMIT 1`,
    [prendaId, proceso],
    (findErr, row) => {
      if (findErr) return done(findErr);
      if (row) {
        db.run(
          `UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
          [cantidad, row.id],
          done
        );
        return;
      }
      db.run(
        `INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, usuario_registro) VALUES (?, ?, ?, ?)`,
        [prendaId, proceso, cantidad, userId],
        done
      );
    }
  );
}

function moverStockProceso(prendaId, procesoOrigen, procesoDestino, cantidad, userId, done) {
  db.run(
    `UPDATE prendas_proceso
     SET cantidad = cantidad - ?
     WHERE prenda_id = ? AND proceso = ? AND cantidad >= ?`,
    [cantidad, prendaId, procesoOrigen, cantidad],
    function(updateErr) {
      if (updateErr) return done(updateErr);
      if (this.changes === 0) return done(new Error(`No hay stock suficiente en ${procesoOrigen}`));

      db.run(
        `DELETE FROM prendas_proceso
         WHERE prenda_id = ? AND proceso = ? AND cantidad <= 0`,
        [prendaId, procesoOrigen],
        (deleteErr) => {
          if (deleteErr) return done(deleteErr);

          db.get(
            `SELECT id, cantidad FROM prendas_proceso
             WHERE prenda_id = ? AND proceso = ?
             ORDER BY id ASC LIMIT 1`,
            [prendaId, procesoDestino],
            (findErr, row) => {
              if (findErr) return done(findErr);

              if (row) {
                db.run(
                  `UPDATE prendas_proceso
                   SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                  [cantidad, row.id],
                  done
                );
                return;
              }

              db.run(
                `INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, usuario_registro)
                 VALUES (?, ?, ?, ?)`,
                [prendaId, procesoDestino, cantidad, userId],
                done
              );
            }
          );
        }
      );
    }
  );
}
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

function obtenerPrecio(trabajador, prenda, proceso) {
  if (trabajador.factura) return obtenerPrecioFactura(prenda, proceso);
  return obtenerPrecioNormal(prenda, proceso);
}

function obtenerPrecioFactura(prenda, proceso) {
  switch(proceso) {
    case 'sucio': return prenda.precio_sucio_factura || 0;
    case 'remojo': return prenda.precio_remojo_factura || 0;
    case 'lavado': return prenda.precio_lavado_factura || 0;
    case 'desmanche': return prenda.precio_desmanche_factura || 0;
    case 'planchado': return prenda.precio_planchado_factura || 0;
    default: return 0;
  }
}

function obtenerPrecioNormal(prenda, proceso) {
  switch(proceso) {
    case 'sucio': return prenda.precio_sucio || 0;
    case 'remojo': return prenda.precio_remojo || 0;
    case 'lavado': return prenda.precio_lavado || 0;
    case 'desmanche': return prenda.precio_desmanche || 0;
    case 'planchado': return prenda.precio_planchado || 0;
    default: return 0;
  }
}

function obtenerPrecioPersonalizado(trabajadorId, proceso) {
  return new Promise((resolve) => {
    db.get('SELECT precio FROM precios_trabajador WHERE trabajador_id = ? AND proceso = ?',
      [trabajadorId, proceso], (err, row) => {
        resolve(row ? row.precio : null);
      });
  });
}

router.get('/', verifyToken, (req, res) => {
  const { trabajador_id, proceso, estado, fecha_inicio, fecha_fin } = req.query;

  let sql = `
    SELECT t.*,
      tr.nombre as trabajador_nombre,
      p.nombre as prenda_nombre,
      CASE
        WHEN t.proceso IN ('tendido', 'recogido') AND COALESCE(t.precio_unitario, 0) = 0 AND COALESCE(t.total, 0) = 0 THEN 1
        ELSE 0
      END as es_automatica
    FROM tareas t
    JOIN trabajadores tr ON t.trabajador_id = tr.id
    JOIN prendas p ON t.prenda_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (trabajador_id) {
    sql += ' AND t.trabajador_id = ?';
    params.push(trabajador_id);
  }
  if (proceso) {
    sql += ' AND t.proceso = ?';
    params.push(proceso);
  }
  if (estado) {
    sql += ' AND t.estado = ?';
    params.push(estado);
  }
  if (fecha_inicio) {
    sql += ' AND t.fecha_asignacion >= ?';
    params.push(fecha_inicio);
  }
  if (fecha_fin) {
    sql += ' AND t.fecha_asignacion <= ?';
    params.push(fecha_fin);
  }

  sql += ' ORDER BY t.fecha_asignacion DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/precios', verifyToken, requireEncargado, (req, res) => {
  const { trabajador_id, proceso, prenda_id } = req.query;

  if (!trabajador_id || !proceso || !prenda_id) {
    return res.status(400).json({ message: 'Trabajador, proceso y prenda requeridos' });
  }

  db.get('SELECT * FROM trabajadores WHERE id = ?', [trabajador_id], (err, trabajador) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!trabajador) return res.status(404).json({ message: 'Trabajador no encontrado' });

    db.get('SELECT * FROM prendas WHERE id = ?', [prenda_id], (err, prenda) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!prenda) return res.status(404).json({ message: 'Prenda no encontrada' });

      db.get('SELECT precio FROM precios_trabajador WHERE trabajador_id = ? AND proceso = ?',
        [trabajador_id, proceso], (err, precioPersonalizado) => {
          const precioBase = obtenerPrecio(trabajador, prenda, proceso);
          const precioFinal = precioPersonalizado ? precioPersonalizado.precio : precioBase;
          res.json({
            precio_factura: obtenerPrecioFactura(prenda, proceso),
            precio_normal: obtenerPrecioNormal(prenda, proceso),
            precio_personalizado: precioPersonalizado ? precioPersonalizado.precio : null,
            precio_final: precioFinal,
            proceso: proceso,
            factura: !!trabajador.factura
          });
        });
    });
  });
});

router.post('/asignar', verifyToken, requireEncargado, (req, res) => {
  const { trabajador_id, proceso, prendas, fecha_asignacion, estado_origen } = req.body;

  if (!trabajador_id || !proceso || !prendas || !prendas.length) {
    return res.status(400).json({ message: 'Trabajador, proceso y prendas requeridos' });
  }

  if (proceso === 'desmanche' && estado_origen && !PROCESO_SIGUIENTE[estado_origen] && estado_origen !== 'stock') {
    return res.status(400).json({ message: 'estado_origen invalido para desmanche' });
  }

  if (!PROCESOS_PAGADOS.includes(proceso) && !PROCESOS_SIN_PAGO.includes(proceso)) {
    return res.status(400).json({ message: `El proceso "${proceso}" no genera pago` });
  }

  db.get('SELECT * FROM trabajadores WHERE id = ?', [trabajador_id], (err, trabajador) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!trabajador) return res.status(404).json({ message: 'Trabajador no encontrado' });

    const tareasCreadas = [];
    const errores = [];

    const crearTarea = (index) => {
      if (index >= prendas.length) {
        if (errores.length > 0) {
          return res.status(400).json({ errores, tareas_creadas: tareasCreadas });
        }
        return res.status(201).json({ message: 'Tareas asignadas', tareas: tareasCreadas });
      }

      const item = prendas[index];
      if (!item || !item.prenda_id || !item.cantidad || Number(item.cantidad) <= 0) {
        errores.push({ prenda_id: item && item.prenda_id ? item.prenda_id : null, error: 'Cada prenda debe incluir prenda_id y cantidad mayor a 0' });
        return crearTarea(index + 1);
      }

      db.get('SELECT * FROM prendas WHERE id = ?', [item.prenda_id], (err, prenda) => {
        if (err || !prenda) {
          errores.push({ prenda_id: item.prenda_id, error: 'Prenda no encontrada' });
          return crearTarea(index + 1);
        }

          if (proceso === 'planchado' && Number(prenda.requiere_plancha) !== 1) {
            errores.push({
              prenda_id: item.prenda_id,
              prenda_nombre: prenda.nombre,
              error: 'La prenda no requiere planchado'
            });
            return crearTarea(index + 1);
          }

          const procesoOrigen = (proceso === 'desmanche' && estado_origen) ? estado_origen : (PROCESO_ORIGEN_TAREA[proceso] || proceso);

          db.get(`
           SELECT SUM(cantidad) as total FROM prendas_proceso
           WHERE prenda_id = ? AND proceso = ?
         `, [item.prenda_id, procesoOrigen], (err, stock) => {
           if (!stock || stock.total < item.cantidad) {
             errores.push({
               prenda_id: item.prenda_id,
               prenda_nombre: prenda.nombre,
               cantidad_solicitada: item.cantidad,
               cantidad_disponible: stock ? stock.total : 0,
               error: `Stock insuficiente en proceso ${procesoOrigen}`
             });
             return crearTarea(index + 1);
           }

          db.get('SELECT precio FROM precios_trabajador WHERE trabajador_id = ? AND proceso = ?',
            [trabajador_id, proceso], (errPrecio, precioPersonalizado) => {
              if (errPrecio) {
                errores.push({ prenda_id: item.prenda_id, error: errPrecio.message });
                return crearTarea(index + 1);
              }

              const precioBase = PROCESOS_SIN_PAGO.includes(proceso) ? 0 : obtenerPrecio(trabajador, prenda, proceso);
              const precio = PROCESOS_SIN_PAGO.includes(proceso) ? 0 : (precioPersonalizado ? precioPersonalizado.precio : precioBase);
              const total = Number(precio) * Number(item.cantidad);

              const sql = `
                INSERT INTO tareas (trabajador_id, proceso, prenda_id, cantidad, precio_unitario, total, fecha_asignacion)
                VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
              `;

              db.run(sql, [trabajador_id, proceso, item.prenda_id, item.cantidad, precio, total, fecha_asignacion || null], function(err) {
                if (err) {
                  errores.push({ prenda_id: item.prenda_id, error: err.message });
                  return crearTarea(index + 1);
                }

                const tareaId = this.lastID;
                tareasCreadas.push({ id: tareaId, prenda: prenda.nombre, cantidad: item.cantidad, total });

                moverStockProceso(item.prenda_id, procesoOrigen, proceso, item.cantidad, req.userId, (moveErr) => {
                  if (moveErr) {
                    db.run('DELETE FROM tareas WHERE id = ?', [tareaId], () => {});
                    errores.push({
                      prenda_id: item.prenda_id,
                      prenda_nombre: prenda.nombre,
                      error: moveErr.message
                    });
                    tareasCreadas.pop();
                    return crearTarea(index + 1);
                  }

                  const bitacoraSql = `
                    INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
                    VALUES (?, ?, ?, ?, ?)
                  `;
                  db.run(bitacoraSql, [req.userId, 'ASIGNAR_TAREA', 'tareas', tareaId, JSON.stringify(req.body)]);

                  crearTarea(index + 1);
                });
              });
            }
          );
        });
      });
    };

    crearTarea(0);
  });
});

router.put('/:id/iniciar', verifyToken, (req, res) => {
  const { id } = req.params;

  const sql = 'UPDATE tareas SET estado = ?, fecha_inicio = CURRENT_TIMESTAMP WHERE id = ? AND estado = ?';
  db.run(sql, ['en_proceso', id, 'asignada'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(400).json({ message: 'Tarea no encontrada o ya iniciada' });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
      VALUES (?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'INICIAR_TAREA', 'tareas', id]);

    res.json({ message: 'Tarea iniciada' });
  });
});

router.put('/:id/completar', verifyToken, (req, res) => {
  const { id } = req.params;
  const { tendedor_nombre, recogedor_nombre } = req.body || {};

  db.get('SELECT * FROM tareas WHERE id = ?', [id], (err, tarea) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada' });

    const procesoSiguiente = PROCESO_SIGUIENTE[tarea.proceso];

    const sql = 'UPDATE tareas SET estado = ?, fecha_fin = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(sql, ['completada', id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const resolverTrabajadorPorNombre = (nombre, done) => {
        if (!nombre || !String(nombre).trim()) return done(null, tarea.trabajador_id);
        db.get('SELECT id FROM trabajadores WHERE LOWER(nombre) = LOWER(?)', [String(nombre).trim()], (findErr, row) => {
          if (findErr) return done(findErr);
          if (!row) return done(new Error(`No se encontro trabajador con nombre: ${nombre}`));
          done(null, row.id);
        });
      };

      const crearTareaAuto = (procesoAuto, trabajadorId, done) => {
        const insertTareaSql = `
          INSERT INTO tareas (trabajador_id, proceso, prenda_id, cantidad, precio_unitario, total, estado)
          VALUES (?, ?, ?, ?, 0, 0, 'asignada')
        `;
        db.run(insertTareaSql, [trabajadorId, procesoAuto, tarea.prenda_id, tarea.cantidad], done);
      };

      // Flujo automatico: al completar LAVADO crea TENDIDO, al completar TENDIDO crea RECOGIDO
      if (tarea.proceso === 'lavado') {
        moverStockProceso(tarea.prenda_id, 'lavado', 'tendido', tarea.cantidad, req.userId, (mvErr) => {
          if (mvErr) return res.status(500).json({ error: mvErr.message });

        resolverTrabajadorPorNombre(tendedor_nombre, (tErr, trabajadorTendido) => {
          if (tErr) return res.status(400).json({ message: tErr.message });
          crearTareaAuto('tendido', trabajadorTendido, (autoErr) => {
            if (autoErr) return res.status(500).json({ error: autoErr.message });

            const bitacoraSql = `
              INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
              VALUES (?, ?, ?, ?, ?)
            `;
            db.run(bitacoraSql, [req.userId, 'COMPLETAR_TAREA', 'tareas', id, JSON.stringify({ proceso_siguiente: 'tendido', auto_tarea: true, trabajador_tendido: trabajadorTendido })]);

            return res.json({ message: 'Tarea completada. Se creo automaticamente la tarea de TENDIDO.' });
          });
        });
        });
        return;
      }

      if (tarea.proceso === 'tendido') {
        moverStockProceso(tarea.prenda_id, 'tendido', 'recogido', tarea.cantidad, req.userId, (mvErr) => {
          if (mvErr) return res.status(500).json({ error: mvErr.message });

        resolverTrabajadorPorNombre(recogedor_nombre, (rErr, trabajadorRecogido) => {
          if (rErr) return res.status(400).json({ message: rErr.message });
          crearTareaAuto('recogido', trabajadorRecogido, (autoErr) => {
            if (autoErr) return res.status(500).json({ error: autoErr.message });

            const bitacoraSql = `
              INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
              VALUES (?, ?, ?, ?, ?)
            `;
            db.run(bitacoraSql, [req.userId, 'COMPLETAR_TAREA', 'tareas', id, JSON.stringify({ proceso_siguiente: 'recogido', auto_tarea: true, trabajador_recogido: trabajadorRecogido })]);

            return res.json({ message: 'Tarea completada. Se creo automaticamente la tarea de RECOGIDO.' });
          });
        });
        });
        return;
      }

      if (tarea.proceso === 'recogido') {
        db.get('SELECT requiere_plancha FROM prendas WHERE id = ?', [tarea.prenda_id], (errPrenda, prenda) => {
          if (errPrenda) return res.status(500).json({ error: errPrenda.message });
          const destino = prenda && Number(prenda.requiere_plancha) === 1 ? 'limpio' : 'stock';

          moverStockProceso(tarea.prenda_id, 'recogido', destino, tarea.cantidad, req.userId, (insErr) => {
            if (insErr) return res.status(500).json({ error: insErr.message });

            const bitacoraSql = `
              INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
              VALUES (?, ?, ?, ?, ?)
            `;
            db.run(bitacoraSql, [req.userId, 'COMPLETAR_TAREA', 'tareas', id, JSON.stringify({ proceso_siguiente: destino })]);

            return res.json({ message: `Tarea completada. Prenda movida a ${destino}` });
          });
        });
        return;
      }

      if (tarea.proceso === 'remojo') {
        moverStockProceso(tarea.prenda_id, 'remojo', 'lavado', tarea.cantidad, req.userId, (mvErr) => {
          if (mvErr) return res.status(500).json({ error: mvErr.message });
          const bitacoraSql = `
            INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
            VALUES (?, ?, ?, ?, ?)
          `;
          db.run(bitacoraSql, [req.userId, 'COMPLETAR_TAREA', 'tareas', id, JSON.stringify({ proceso_siguiente: 'lavado', mueve_stock: true })]);
          return res.json({ message: 'Tarea completada. Prenda movida a LAVADO para su siguiente asignacion.' });
        });
        return;
      }

      if (procesoSiguiente) {
        moverStockProceso(tarea.prenda_id, tarea.proceso, procesoSiguiente, tarea.cantidad, req.userId, (mvErr) => {
          if (mvErr) return res.status(500).json({ error: mvErr.message });

          const bitacoraSql = `
            INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
            VALUES (?, ?, ?, ?, ?)
          `;
          db.run(bitacoraSql, [req.userId, 'COMPLETAR_TAREA', 'tareas', id, JSON.stringify({ proceso_siguiente: procesoSiguiente })]);

          return res.json({ message: `Tarea completada. Prenda movida a ${procesoSiguiente}` });
        });
        return;
      }

      const bitacoraSql = `
        INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(bitacoraSql, [req.userId, 'COMPLETAR_TAREA', 'tareas', id, JSON.stringify({ proceso_siguiente: null })]);

      res.json({ message: `Tarea completada: ${tarea.proceso}` });
    });
  });
});

router.put('/:id/cancelar', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM tareas WHERE id = ?', [id], (err, tarea) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada' });

    const sql = 'UPDATE tareas SET estado = ? WHERE id = ?';
    db.run(sql, ['cancelada', id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      if (PROCESOS_PAGADOS.includes(tarea.proceso) || PROCESOS_SIN_PAGO.includes(tarea.proceso)) {
        const origen = PROCESO_ORIGEN_TAREA[tarea.proceso] || (tarea.proceso === 'tendido' ? 'lavado' : (tarea.proceso === 'recogido' ? 'tendido' : null));
        if (origen) {
          moverStockProceso(tarea.prenda_id, tarea.proceso, origen, tarea.cantidad, req.userId, () => {});
        }
      }

      const bitacoraSql = `
        INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
        VALUES (?, ?, ?, ?)
      `;
      db.run(bitacoraSql, [req.userId, 'CANCELAR_TAREA', 'tareas', id]);

      res.json({ message: 'Tarea cancelada' });
    });
  });
});

module.exports = router;
