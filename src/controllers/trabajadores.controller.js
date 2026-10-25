const trabajadoresService = require('../services/trabajadores.service');

const trabajadoresController = {
  async listar(req, res, next) {
    try {
      const data = await trabajadoresService.listar();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerPrecios(req, res, next) {
    try {
      const data = await trabajadoresService.obtenerPrecios(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede crear trabajadores' });
      }
      const data = await trabajadoresService.crear(req.body, req.userId, req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede editar trabajadores' });
      }
      const data = await trabajadoresService.actualizar(req.params.id, req.body, req.userId, req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async actualizarPrecios(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede editar precios de trabajadores' });
      }
      const data = await trabajadoresService.actualizarPrecios(req.params.id, req.body.precios, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async eliminar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede eliminar trabajadores' });
      }
      const data = await trabajadoresService.eliminar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = trabajadoresController;
