const dashboardService = require('../services/dashboard.service');

const dashboardController = {
  async resumen(req, res, next) {
    try {
      const data = await dashboardService.obtenerResumen();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async stockPorProceso(req, res, next) {
    try {
      const data = await dashboardService.stockPorProceso();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async tareasRecientes(req, res, next) {
    try {
      const data = await dashboardService.tareasRecientes();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async ultimosMovimientos(req, res, next) {
    try {
      const data = await dashboardService.ultimosMovimientos();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async departamentosStock(req, res, next) {
    try {
      const data = await dashboardService.departamentosStock();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async pagosSemana(req, res, next) {
    try {
      const data = await dashboardService.pagosSemana();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async topProcesos(req, res, next) {
    try {
      const data = await dashboardService.topProcesos();
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = dashboardController;
