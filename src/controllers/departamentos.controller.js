const departamentosService = require('../services/departamentos.service');

const departamentosController = {
  async listar(req, res, next) {
    try {
      const data = await departamentosService.listar();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerPorId(req, res, next) {
    try {
      const data = await departamentosService.obtenerPorId(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede crear departamentos' });
      }
      const data = await departamentosService.crear(req.body, req.userId);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede editar departamentos' });
      }
      const data = await departamentosService.actualizar(req.params.id, req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async eliminar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede eliminar departamentos' });
      }
      const data = await departamentosService.eliminar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = departamentosController;
