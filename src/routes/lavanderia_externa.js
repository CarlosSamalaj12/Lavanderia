const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireEncargado } = require('../middleware/auth');

// Obtener todas las prendas enviadas a lavandería externa
router.get('/', verifyToken, (req, res) => {
  const sql = `
    SELECT le.*, p.nombre as prenda_nombre
    FROM lavanderia_externa le
    JOIN prendas p ON le.prenda_id = p.id
    ORDER BY le.fecha_envio DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Enviar a lavandería externa
router.post('/enviar', verifyToken, requireEncargado, (req, res) => {
  const { prenda_id, cantidad, precio, autorizado_por } = req.body;
  
  if (!prenda_id || !cantidad) {
    return res.status(400).json({ message: 'Prenda y cantidad requeridos' });
  }
  
  // Buscar stock disponible (cualquier proceso excepto enviado)
  const buscarSql = `
    SELECT id, proceso, cantidad FROM prendas_proceso 
    WHERE prenda_id = ? AND cantidad > 0
    ORDER BY CASE proceso 
      WHEN 'stock' THEN 1 
      WHEN 'limpio' THEN 2 
      WHEN 'planchado' THEN 3 
      ELSE 4 
    END
  `;
  
  db.all(buscarSql, [prenda_id], (err, stocks) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let restante = cantidad;
    let stocksUsados = [];
    
    for (let stock of stocks) {
      if (restante <= 0) break;
      
      const usar = Math.min(stock.cantidad, restante);
      stocksUsados.push({ id: stock.id, proceso: stock.proceso, usar });
      
      // Descontar del stock actual
      const nuevaCantidad = stock.cantidad - usar;
      if (nuevaCantidad > 0) {
        db.run('UPDATE prendas_proceso SET cantidad = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?', 
          [nuevaCantidad, stock.id]);
      } else {
        db.run('DELETE FROM prendas_proceso WHERE id = ?', [stock.id]);
      }
      
      restante -= usar;
    }
    
    if (restante > 0) {
      return res.status(400).json({ message: `Solo se encontraron ${cantidad - restante} prendas disponibles` });
    }
    
    // Registrar envío a lavandería externa
    const insertSql = `
      INSERT INTO lavanderia_externa (prenda_id, cantidad, precio, autorizado_por, usuario_id, fecha_envio)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    db.run(insertSql, [prenda_id, cantidad, precio || 0, autorizado_por || null, req.userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const bitacoraSql = `
        INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(bitacoraSql, [req.userId, 'ENVIAR_EXTERNO', 'lavanderia_externa', this.lastID, 
        JSON.stringify({ prenda_id, cantidad, precio, stocks_usados: stocksUsados })]);
      
      res.json({ message: 'Prendas enviadas a lavandería externa', id: this.lastID });
    });
  });
});

// Retornar prendas (reingresar a stock)
router.put('/:id/retornar', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;
  const cantidadRetorno = parseInt(req.body.cantidad_retorno, 10) || 0;
  const precioReingreso = Number(req.body.precio_reingreso) || 0;
  const reenviar = req.body.reenviar === true;
  
  db.get('SELECT * FROM lavanderia_externa WHERE id = ?', [id], (err, envio) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!envio) return res.status(404).json({ message: 'Envío no encontrado' });
    if (envio.estado === 'retornado') return res.status(400).json({ message: 'Ya fue retornado' });
    if (!cantidadRetorno || cantidadRetorno < 1) return res.status(400).json({ message: 'Cantidad de reingreso inválida' });
    if (cantidadRetorno > envio.cantidad) return res.status(400).json({ message: `Solo hay ${envio.cantidad} prendas pendientes en este envío` });
    if (precioReingreso < 0) return res.status(400).json({ message: 'El precio no puede ser negativo' });

    const cantidadRestante = envio.cantidad - cantidadRetorno;
    const nuevoEstado = cantidadRestante === 0 ? 'retornado' : 'parcial';
    
    const actualizarSql = `
      UPDATE lavanderia_externa
      SET cantidad = ?, precio = ?, estado = ?, fecha_retorno = CASE WHEN ? = 'retornado' THEN CURRENT_TIMESTAMP ELSE fecha_retorno END
      WHERE id = ?
    `;

    db.run(actualizarSql, [cantidadRestante, precioReingreso, nuevoEstado, nuevoEstado, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const insertarStock = () => {
          const insertStockSql = `
            INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, usuario_registro)
            VALUES (?, 'stock', ?, ?)
          `;
          db.run(insertStockSql, [envio.prenda_id, cantidadRetorno, req.userId]);
        };

        const insertarReenvio = (done) => {
          const insertReenvioSql = `
            INSERT INTO lavanderia_externa (prenda_id, cantidad, precio, autorizado_por, usuario_id, fecha_envio)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `;
          db.run(insertReenvioSql, [envio.prenda_id, cantidadRetorno, 0, envio.autorizado_por || null, req.userId], (insertErr) => {
            done(insertErr);
          });
        };

        const terminar = (extra = {}) => {
          const bitacoraSql = `
            INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
            VALUES (?, ?, ?, ?, ?)
          `;
          db.run(bitacoraSql, [req.userId, reenviar ? 'REENVIAR_EXTERNO' : 'RETORNAR_EXTERNO', 'lavanderia_externa', id, JSON.stringify({
            envio_id: id,
            prenda_id: envio.prenda_id,
            cantidad_retorno: cantidadRetorno,
            cantidad_restante: cantidadRestante,
            precio_reingreso: precioReingreso,
            reenviar,
            ...extra
          })]);
          res.json({
            message: reenviar ? 'Prendas reenviadas a lavandería externa' : 'Prendas reingresadas a stock',
            cantidad_reingresada: cantidadRetorno,
            cantidad_pendiente: cantidadRestante
          });
        };

        if (reenviar) {
          insertarReenvio((insertErr) => {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            terminar();
          });
          return;
        }

        insertarStock();
        
        terminar();
      }
    );
  });
});

// Reporte
router.get('/reporte', verifyToken, (req, res) => {
  const sql = `
    SELECT 
      COUNT(*) as total_enviadas,
      SUM(CASE WHEN estado = 'retornado' THEN 1 ELSE 0 END) as total_retornadas,
      SUM(CASE WHEN estado IN ('enviado', 'parcial') THEN 1 ELSE 0 END) as total_pendientes,
      SUM(precio * cantidad) as total_gastado
    FROM lavanderia_externa
  `;
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// Obtener una prenda específica
router.get('/:id', verifyToken, (req, res) => {
  const sql = `
    SELECT le.*, p.nombre as prenda_nombre
    FROM lavanderia_externa le
    JOIN prendas p ON le.prenda_id = p.id
    WHERE le.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

module.exports = router;
