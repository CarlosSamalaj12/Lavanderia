const prendasService = require('../services/prendas.service');

const prendasController = {
  async listar(req, res, next) {
    try {
      const data = await prendasService.listar(req.query.q);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async stock(req, res, next) {
    try {
      const data = await prendasService.stock();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async stockResumen(req, res, next) {
    try {
      const data = await prendasService.stockResumen();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async disponibleDespacho(req, res, next) {
    try {
      const data = await prendasService.disponibleDespacho();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async stockTrazabilidad(req, res, next) {
    try {
      const data = await prendasService.stockTrazabilidad(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede crear prendas' });
      }
      const data = await prendasService.crear(req.body, req.userId, req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async importar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede importar prendas' });
      }
      const data = await prendasService.importar(req.body.prendas);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede editar prendas' });
      }
      const data = await prendasService.actualizar(req.params.id, req.body, req.userId, req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async eliminar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede eliminar prendas' });
      }
      const data = await prendasService.eliminar(req.params.id, req.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = prendasController;
