const trabajadoresService = require('../services/trabajadores.service');

const trabajadoresInternosController = {
  async listar(req, res, next) {
    try {
      const data = await trabajadoresService.listarInternos();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede crear trabajadores internos' });
      }
      const data = await trabajadoresService.crearInterno(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede editar trabajadores internos' });
      }
      const data = await trabajadoresService.actualizarInterno(req.params.id, req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async eliminar(req, res, next) {
    try {
      if (req.userRol === 'reportes') {
        return res.status(403).json({ message: 'El rol reportes no puede eliminar trabajadores internos' });
      }
      const data = await trabajadoresService.eliminarInterno(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = trabajadoresInternosController;
