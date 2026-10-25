const pedidosService = require('../services/pedidos.service');

const pedidosController = {
  async listar(req, res, next) {
    try {
      const data = await pedidosService.listar(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async obtenerPorId(req, res, next) {
    try {
      const data = await pedidosService.obtenerPorId(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      const data = await pedidosService.crear(req.body, req.userId, req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async entregar(req, res, next) {
    try {
      const data = await pedidosService.entregar(req.params.id, req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async anularEntrega(req, res, next) {
    try {
      const data = await pedidosService.anularEntrega(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async anularEntregaItem(req, res, next) {
    try {
      const data = await pedidosService.anularEntregaItem(req.params.id, req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async anularItemPendiente(req, res, next) {
    try {
      const data = await pedidosService.anularItemPendiente(req.params.id, req.body, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async cancelar(req, res, next) {
    try {
      const data = await pedidosService.cancelar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = pedidosController;
