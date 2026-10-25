const reportesService = require('../services/reportes.service');

const reportesController = {
  async pedidos(req, res, next) {
    try {
      const data = await reportesService.pedidos(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async pedidosResumen(req, res, next) {
    try {
      const data = await reportesService.pedidosResumen(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async procesos(req, res, next) {
    try {
      const data = await reportesService.procesos(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async procesosResumen(req, res, next) {
    try {
      const data = await reportesService.procesosResumen();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async pagos(req, res, next) {
    try {
      const data = await reportesService.pagos(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async pagosResumenTrabajador(req, res, next) {
    try {
      const data = await reportesService.pagosResumenTrabajador(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async pagosTotal(req, res, next) {
    try {
      const data = await reportesService.pagosTotal(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async tareasCompletadas(req, res, next) {
    try {
      const data = await reportesService.tareasCompletadas(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = reportesController;
