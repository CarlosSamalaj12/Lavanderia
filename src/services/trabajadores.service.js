const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const trabajadoresService = {
  async listar() {
    const sql = `
      SELECT t.*,
        (SELECT COUNT(*) FROM tareas WHERE trabajador_id = t.id AND estado != 'completada') as tareas_activas
      FROM trabajadores t
      WHERE t.activo = 1
      ORDER BY t.nombre
    `;
    return await dbAsync.all(sql);
  },

  async obtenerPrecios(id) {
    return await dbAsync.all('SELECT * FROM precios_trabajador WHERE trabajador_id = ?', [id]);
  },

  async crear({ nombre, cedula, telefono, factura, precios }, userId, rawBody) {
    if (!nombre) {
      const err = new Error('El nombre es requerido');
      err.status = 400;
      throw err;
    }

    const sql = 'INSERT INTO trabajadores (nombre, cedula, telefono, factura) VALUES (?, ?, ?, ?)';
    const result = await dbAsync.run(sql, [nombre, cedula || null, telefono || null, factura ? 1 : 0]);
    const trabajadorId = result.lastID;

    if (precios && Array.isArray(precios)) {
      const precioSql = 'INSERT INTO precios_trabajador (trabajador_id, proceso, precio) VALUES (?, ?, ?)';
      for (const p of precios) {
        await dbAsync.run(precioSql, [trabajadorId, p.proceso, p.precio]);
      }
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'CREAR',
      tablaAfectada: 'trabajadores',
      registroId: trabajadorId,
      datosNuevos: rawBody
    });

    return { id: trabajadorId, message: 'Trabajador creado' };
  },

  async actualizar(id, { nombre, cedula, telefono, factura, activo }, userId, rawBody) {
    const sql = `
      UPDATE trabajadores SET
        nombre = COALESCE(?, nombre),
        cedula = COALESCE(?, cedula),
        telefono = COALESCE(?, telefono),
        factura = COALESCE(?, factura),
        activo = COALESCE(?, activo)
      WHERE id = ?
    `;

    await dbAsync.run(sql, [nombre, cedula, telefono, factura, activo, id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ACTUALIZAR',
      tablaAfectada: 'trabajadores',
      registroId: id,
      datosNuevos: rawBody
    });

    return { message: 'Trabajador actualizado' };
  },

  async actualizarPrecios(id, precios, userId) {
    await dbAsync.run('DELETE FROM precios_trabajador WHERE trabajador_id = ?', [id]);

    if (precios && Array.isArray(precios)) {
      const precioSql = 'INSERT INTO precios_trabajador (trabajador_id, proceso, precio) VALUES (?, ?, ?)';
      for (const p of precios) {
        await dbAsync.run(precioSql, [id, p.proceso, p.precio]);
      }
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ACTUALIZAR',
      tablaAfectada: 'precios_trabajador',
      registroId: id,
      datosNuevos: { precios }
    });

    return { message: 'Precios actualizados' };
  },

  async eliminar(id, userId) {
    await dbAsync.run('UPDATE trabajadores SET activo = 0 WHERE id = ?', [id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ELIMINAR',
      tablaAfectada: 'trabajadores',
      registroId: id
    });

    return { message: 'Trabajador desactivado' };
  },

  // Trabajadores internos (Tendido / Recogido)
  async listarInternos() {
    const sql = `
      SELECT id, nombre, cedula, telefono, activo, created_at
      FROM trabajadores
      WHERE activo = 1 AND es_interno = 1
      ORDER BY nombre
    `;
    return await dbAsync.all(sql);
  },

  async crearInterno({ nombre, cedula, telefono }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error('El nombre es requerido');
      err.status = 400;
      throw err;
    }

    const sql = 'INSERT INTO trabajadores (nombre, cedula, telefono, factura, es_interno, activo) VALUES (?, ?, ?, 0, 1, 1)';
    const result = await dbAsync.run(sql, [String(nombre).trim(), cedula || null, telefono || null]);
    return { id: result.lastID, message: 'Trabajador interno creado' };
  },

  async actualizarInterno(id, { nombre, cedula, telefono, activo }) {
    const sql = `
      UPDATE trabajadores
      SET nombre = COALESCE(?, nombre),
          cedula = COALESCE(?, cedula),
          telefono = COALESCE(?, telefono),
          activo = COALESCE(?, activo)
      WHERE id = ? AND es_interno = 1
    `;
    const result = await dbAsync.run(sql, [nombre, cedula, telefono, activo, id]);
    if (result.changes === 0) {
      const err = new Error('Trabajador interno no encontrado');
      err.status = 404;
      throw err;
    }
    return { message: 'Trabajador interno actualizado' };
  },

  async eliminarInterno(id) {
    const result = await dbAsync.run('UPDATE trabajadores SET activo = 0 WHERE id = ? AND es_interno = 1', [id]);
    if (result.changes === 0) {
      const err = new Error('Trabajador interno no encontrado');
      err.status = 404;
      throw err;
    }
    return { message: 'Trabajador interno desactivado' };
  }
};

module.exports = trabajadoresService;
