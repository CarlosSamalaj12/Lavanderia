const lavanderiaExternaService = require('../services/lavanderia_externa.service');

const lavanderiaExternaController = {
  async listar(req, res, next) {
    try {
      const data = await lavanderiaExternaService.listar();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async reporte(req, res, next) {
    try {
      const data = await lavanderiaExternaService.reporte();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerPorId(req, res, next) {
    try {
      const data = await lavanderiaExternaService.obtenerPorId(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async enviar(req, res, next) {
    try {
      const data = await lavanderiaExternaService.enviar(req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async retornar(req, res, next) {
    try {
      const data = await lavanderiaExternaService.retornar(req.params.id, req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = lavanderiaExternaController;
