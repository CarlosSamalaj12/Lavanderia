const usuariosService = require('../services/usuarios.service');

const usuariosController = {
  async listar(req, res, next) {
    try {
      const data = await usuariosService.listar(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerPorId(req, res, next) {
    try {
      const data = await usuariosService.obtenerPorId(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede crear usuarios' });
      }
      const data = await usuariosService.crear(req.body, req.userRol, req.userId, req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede editar usuarios' });
      }
      const data = await usuariosService.actualizar(req.params.id, req.body, req.userRol, req.userId, req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async eliminar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede eliminar usuarios' });
      }
      const data = await usuariosService.eliminar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = usuariosController;
