const bcrypt = require('bcryptjs');
const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const usuariosService = {
  async listar({ rol } = {}) {
    let sql = `
      SELECT id, username, nombre, rol, activo, departamento_id, created_at
      FROM usuarios
      WHERE 1=1
    `;
    const params = [];

    if (rol) {
      sql += ' AND rol = ?';
      params.push(rol);
    }

    sql += ' ORDER BY nombre';
    return await dbAsync.all(sql, params);
  },

  async obtenerPorId(id) {
    const user = await dbAsync.get(
      'SELECT id, username, nombre, rol, activo, departamento_id FROM usuarios WHERE id = ?',
      [id]
    );
    if (!user) {
      const err = new Error('Usuario no encontrado');
      err.status = 404;
      throw err;
    }
    return user;
  },

  async crear({ username, password, nombre, rol, departamento_id }, userRol, userId, rawBody) {
    if (!username || !password || !nombre || !rol) {
      const err = new Error('Todos los campos son requeridos');
      err.status = 400;
      throw err;
    }

    if (userRol !== 'admin' && rol === 'admin') {
      const err = new Error('Solo un administrador puede crear otro administrador');
      err.status = 403;
      throw err;
    }

    const normalizedUsername = String(username || '').trim().toLowerCase();
    const hashedPassword = bcrypt.hashSync(password, 10);

    const sql = `
      INSERT INTO usuarios (username, password, nombre, rol, departamento_id)
      VALUES (?, ?, ?, ?, ?)
    `;

    try {
      const result = await dbAsync.run(sql, [
        normalizedUsername,
        hashedPassword,
        nombre,
        rol,
        departamento_id || null
      ]);

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'CREAR',
        tablaAfectada: 'usuarios',
        registroId: result.lastID,
        datosNuevos: rawBody
      });

      return { id: result.lastID, message: 'Usuario creado exitosamente' };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        const error = new Error('El usuario ya existe');
        error.status = 400;
        throw error;
      }
      throw err;
    }
  },

  async actualizar(id, { nombre, rol, activo, departamento_id, password }, userRol, userId, rawBody) {
    await this.obtenerPorId(id);

    if (userRol !== 'admin' && rol === 'admin') {
      const err = new Error('Solo un administrador puede asignar rol administrador');
      err.status = 403;
      throw err;
    }

    let sql = `
      UPDATE usuarios
      SET nombre = COALESCE(?, nombre),
          rol = COALESCE(?, rol),
          activo = COALESCE(?, activo),
          departamento_id = COALESCE(?, departamento_id)
    `;
    const params = [nombre, rol, activo, departamento_id];

    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      sql += ', password = ?';
      params.push(hashedPassword);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    await dbAsync.run(sql, params);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ACTUALIZAR',
      tablaAfectada: 'usuarios',
      registroId: id,
      datosNuevos: rawBody
    });

    return { message: 'Usuario actualizado' };
  },

  async eliminar(id, userId) {
    await this.obtenerPorId(id);

    await dbAsync.run('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ELIMINAR',
      tablaAfectada: 'usuarios',
      registroId: id
    });

    return { message: 'Usuario desactivado' };
  }
};

module.exports = usuariosService;
