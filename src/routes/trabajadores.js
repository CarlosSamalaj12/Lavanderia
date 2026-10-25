const express = require('express');
const router = express.Router();
const trabajadoresController = require('../controllers/trabajadores.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, trabajadoresController.listar);
router.get('/:id/precios', verifyToken, trabajadoresController.obtenerPrecios);
router.post('/', verifyToken, requireEncargado, trabajadoresController.crear);
router.put('/:id', verifyToken, requireEncargado, trabajadoresController.actualizar);
router.put('/:id/precios', verifyToken, requireEncargado, trabajadoresController.actualizarPrecios);
router.delete('/:id', verifyToken, requireEncargado, trabajadoresController.eliminar);

module.exports = router;
