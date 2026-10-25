const dbAsync = require('../utils/db-async');

const bitacoraService = {
  async registrar({ usuarioId, accion, tablaAfectada, registroId = null, datosNuevos = null, datosAnteriores = null }) {
    try {
      const sql = `
        INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos, datos_anteriores)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const serializedNuevos = datosNuevos && typeof datosNuevos === 'object' ? JSON.stringify(datosNuevos) : datosNuevos;
      const serializedAnteriores = datosAnteriores && typeof datosAnteriores === 'object' ? JSON.stringify(datosAnteriores) : datosAnteriores;

      return await dbAsync.run(sql, [
        usuarioId,
        accion,
        tablaAfectada,
        registroId,
        serializedNuevos,
        serializedAnteriores
      ]);
    } catch (err) {
      console.error('Error al registrar en bitácora:', err.message);
      // No frenar la operación principal si falla la bitácora
      return null;
    }
  },

  async obtener({ tabla, accion, usuario_id, fecha_inicio, fecha_fin, limite }) {
    let sql = `
      SELECT b.*, u.nombre as usuario_nombre
      FROM bitacora b
      JOIN usuarios u ON b.usuario_id = u.id
      WHERE b.id > 0
    `;
    const params = [];

    if (tabla) {
      sql += ' AND b.tabla_afectada = ?';
      params.push(tabla);
    }
    if (accion) {
      sql += ' AND b.accion = ?';
      params.push(accion);
    }
    if (usuario_id) {
      sql += ' AND b.usuario_id = ?';
      params.push(usuario_id);
    }
    if (fecha_inicio) {
      sql += ' AND b.fecha >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      sql += ' AND b.fecha <= ?';
      params.push(fecha_fin);
    }

    sql += ' ORDER BY b.fecha DESC';

    if (limite) {
      sql += ' LIMIT ?';
      params.push(parseInt(limite, 10));
    }

    return await dbAsync.all(sql, params);
  },

  async obtenerUltimos(limite = 20) {
    const sql = `
      SELECT b.*, u.nombre as usuario_nombre
      FROM bitacora b
      JOIN usuarios u ON b.usuario_id = u.id
      ORDER BY b.fecha DESC
      LIMIT ?
    `;
    return await dbAsync.all(sql, [parseInt(limite, 10)]);
  }
};

module.exports = bitacoraService;
