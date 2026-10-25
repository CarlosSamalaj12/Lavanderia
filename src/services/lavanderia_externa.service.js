const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const lavanderiaExternaService = {
  async listar() {
    const sql = `
      SELECT le.*, p.nombre as prenda_nombre
      FROM lavanderia_externa le
      JOIN prendas p ON le.prenda_id = p.id
      ORDER BY le.fecha_envio DESC
    `;
    return await dbAsync.all(sql);
  },

  async obtenerPorId(id) {
    const sql = `
      SELECT le.*, p.nombre as prenda_nombre
      FROM lavanderia_externa le
      JOIN prendas p ON le.prenda_id = p.id
      WHERE le.id = ?
    `;
    const item = await dbAsync.get(sql, [id]);
    if (!item) {
      const err = new Error('Envío no encontrado');
      err.status = 404;
      throw err;
    }
    return item;
  },

  async reporte() {
    const sql = `
      SELECT 
        COUNT(*) as total_enviadas,
        SUM(CASE WHEN estado = 'retornado' THEN 1 ELSE 0 END) as total_retornadas,
        SUM(CASE WHEN estado IN ('enviado', 'parcial') THEN 1 ELSE 0 END) as total_pendientes,
        SUM(precio * cantidad) as total_gastado
      FROM lavanderia_externa
    `;
    return await dbAsync.get(sql);
  },

  async enviar({ prenda_id, cantidad, precio, autorizado_por }, userId) {
    if (!prenda_id || !cantidad) {
      const err = new Error('Prenda y cantidad requeridos');
      err.status = 400;
      throw err;
    }

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

    const stocks = await dbAsync.all(buscarSql, [prenda_id]);
    let restante = cantidad;
    const stocksUsados = [];

    for (const stock of stocks) {
      if (restante <= 0) break;
      const usar = Math.min(stock.cantidad, restante);
      stocksUsados.push({ id: stock.id, proceso: stock.proceso, usar });

      const nuevaCantidad = stock.cantidad - usar;
      if (nuevaCantidad > 0) {
        await dbAsync.run(
          'UPDATE prendas_proceso SET cantidad = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
          [nuevaCantidad, stock.id]
        );
      } else {
        await dbAsync.run('DELETE FROM prendas_proceso WHERE id = ?', [stock.id]);
      }

      restante -= usar;
    }

    if (restante > 0) {
      const err = new Error(`Solo se encontraron ${cantidad - restante} prendas disponibles`);
      err.status = 400;
      throw err;
    }

    const insertSql = `
      INSERT INTO lavanderia_externa (prenda_id, cantidad, precio, autorizado_por, usuario_id, fecha_envio)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const result = await dbAsync.run(insertSql, [prenda_id, cantidad, precio || 0, autorizado_por || null, userId]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ENVIAR_EXTERNO',
      tablaAfectada: 'lavanderia_externa',
      registroId: result.lastID,
      datosNuevos: { prenda_id, cantidad, precio, stocks_usados: stocksUsados }
    });

    return { message: 'Prendas enviadas a lavandería externa', id: result.lastID };
  },

  async retornar(id, { cantidad_retorno, precio_reingreso, reenviar }, userId) {
    const cantidadRetorno = parseInt(cantidad_retorno, 10) || 0;
    const precioReingreso = Number(precio_reingreso) || 0;
    const esReenvio = reenviar === true;

    const envio = await dbAsync.get('SELECT * FROM lavanderia_externa WHERE id = ?', [id]);
    if (!envio) {
      const err = new Error('Envío no encontrado');
      err.status = 404;
      throw err;
    }

    if (envio.estado === 'retornado') {
      const err = new Error('Ya fue retornado');
      err.status = 400;
      throw err;
    }

    if (!cantidadRetorno || cantidadRetorno < 1) {
      const err = new Error('Cantidad de reingreso inválida');
      err.status = 400;
      throw err;
    }

    if (cantidadRetorno > envio.cantidad) {
      const err = new Error(`Solo hay ${envio.cantidad} prendas pendientes en este envío`);
      err.status = 400;
      throw err;
    }

    if (precioReingreso < 0) {
      const err = new Error('El precio no puede ser negativo');
      err.status = 400;
      throw err;
    }

    const cantidadRestante = envio.cantidad - cantidadRetorno;
    const nuevoEstado = cantidadRestante === 0 ? 'retornado' : 'parcial';

    const actualizarSql = `
      UPDATE lavanderia_externa
      SET cantidad = ?, precio = ?, estado = ?, fecha_retorno = CASE WHEN ? = 'retornado' THEN CURRENT_TIMESTAMP ELSE fecha_retorno END
      WHERE id = ?
    `;

    await dbAsync.run(actualizarSql, [cantidadRestante, precioReingreso, nuevoEstado, nuevoEstado, id]);

    if (esReenvio) {
      const insertReenvioSql = `
        INSERT INTO lavanderia_externa (prenda_id, cantidad, precio, autorizado_por, usuario_id, fecha_envio)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      await dbAsync.run(insertReenvioSql, [envio.prenda_id, cantidadRetorno, 0, envio.autorizado_por || null, userId]);
    } else {
      const insertStockSql = `
        INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, usuario_registro)
        VALUES (?, 'stock', ?, ?)
      `;
      await dbAsync.run(insertStockSql, [envio.prenda_id, cantidadRetorno, userId]);
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: esReenvio ? 'REENVIAR_EXTERNO' : 'RETORNAR_EXTERNO',
      tablaAfectada: 'lavanderia_externa',
      registroId: id,
      datosNuevos: {
        envio_id: id,
        prenda_id: envio.prenda_id,
        cantidad_retorno: cantidadRetorno,
        cantidad_restante: cantidadRestante,
        precio_reingreso: precioReingreso,
        reenviar: esReenvio
      }
    });

    return {
      message: esReenvio ? 'Prendas reenviadas a lavandería externa' : 'Prendas reingresadas a stock',
      cantidad_reingresada: cantidadRetorno,
      cantidad_pendiente: cantidadRestante
    };
  }
};

module.exports = lavanderiaExternaService;
