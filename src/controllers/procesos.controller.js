const procesosService = require('../services/procesos.service');

const procesosController = {
  async listar(req, res, next) {
    try {
      const data = await procesosService.listar();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async porProceso(req, res, next) {
    try {
      const data = await procesosService.porProceso(req.params.proceso);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async verificarDisponibilidad(req, res, next) {
    try {
      const data = await procesosService.verificarDisponibilidad(req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async mover(req, res, next) {
    try {
      const data = await procesosService.mover(req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async ingresar(req, res, next) {
    try {
      const data = await procesosService.ingresar(req.body, req.userId, req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async revertir(req, res, next) {
    try {
      const data = await procesosService.revertir(req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async eliminar(req, res, next) {
    try {
      const data = await procesosService.eliminar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async devolver(req, res, next) {
    try {
      const data = await procesosService.devolver(req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async stockDepartamento(req, res, next) {
    try {
      const data = await procesosService.stockDepartamento(req.params.departamento_id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerTableroKanban(req, res, next) {
    try {
      const data = await procesosService.obtenerTableroKanban();
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = procesosController;
