const bitacoraService = require('../services/bitacora.service');

const bitacoraController = {
  async listar(req, res, next) {
    try {
      const logs = await bitacoraService.obtener(req.query);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  },

  async ultimos(req, res, next) {
    try {
      const logs = await bitacoraService.obtenerUltimos(req.query.limite);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = bitacoraController;
