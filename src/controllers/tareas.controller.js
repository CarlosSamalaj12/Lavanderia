const tareasService = require('../services/tareas.service');

const tareasController = {
  async listar(req, res, next) {
    try {
      const data = await tareasService.listar(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerPrecios(req, res, next) {
    try {
      const data = await tareasService.obtenerPrecios(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async asignar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede asignar tareas' });
      }
      const data = await tareasService.asignar(req.body, req.userId, req.body);
      res.status(201).json(data);
    } catch (err) {
      if (err.details) {
        return res.status(err.status || 400).json(err.details);
      }
      next(err);
    }
  },

  async iniciar(req, res, next) {
    try {
      const data = await tareasService.iniciar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async completar(req, res, next) {
    try {
      const data = await tareasService.completar(req.params.id, req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async cancelar(req, res, next) {
    try {
      const data = await tareasService.cancelar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async avanzarKanban(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede mover tareas en Kanban' });
      }
      const data = await tareasService.avanzarKanban(req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = tareasController;
