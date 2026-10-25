const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const departamentosService = {
  async listar() {
    return await dbAsync.all('SELECT * FROM departamentos WHERE activo = 1 ORDER BY nombre');
  },

  async obtenerPorId(id) {
    const dep = await dbAsync.get('SELECT * FROM departamentos WHERE id = ?', [id]);
    if (!dep) {
      const err = new Error('Departamento no encontrado');
      err.status = 404;
      throw err;
    }
    return dep;
  },

  async crear({ nombre, descripcion }, userId) {
    if (!nombre) {
      const err = new Error('El nombre es requerido');
      err.status = 400;
      throw err;
    }

    try {
      const result = await dbAsync.run(
        'INSERT INTO departamentos (nombre, descripcion) VALUES (?, ?)',
        [nombre, descripcion]
      );

      await bitacoraService.registrar({
        usuarioId: userId,
        accion: 'CREAR',
        tablaAfectada: 'departamentos',
        registroId: result.lastID,
        datosNuevos: { nombre, descripcion }
      });

      return { id: result.lastID, message: 'Departamento creado' };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        const error = new Error('El departamento ya existe');
        error.status = 400;
        throw error;
      }
      throw err;
    }
  },

  async actualizar(id, { nombre, descripcion, activo }, userId) {
    const actual = await this.obtenerPorId(id);

    const sql = `
      UPDATE departamentos
      SET nombre = COALESCE(?, nombre),
          descripcion = COALESCE(?, descripcion),
          activo = COALESCE(?, activo)
      WHERE id = ?
    `;

    await dbAsync.run(sql, [nombre, descripcion, activo, id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ACTUALIZAR',
      tablaAfectada: 'departamentos',
      registroId: id,
      datosAnteriores: actual,
      datosNuevos: { nombre, descripcion, activo }
    });

    return { message: 'Departamento actualizado' };
  },

  async eliminar(id, userId) {
    await this.obtenerPorId(id);

    await dbAsync.run('UPDATE departamentos SET activo = 0 WHERE id = ?', [id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ELIMINAR',
      tablaAfectada: 'departamentos',
      registroId: id
    });

    return { message: 'Departamento desactivado' };
  }
};

module.exports = departamentosService;
