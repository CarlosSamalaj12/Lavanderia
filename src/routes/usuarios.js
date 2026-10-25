const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, requireEncargado, usuariosController.listar);
router.get('/:id', verifyToken, requireEncargado, usuariosController.obtenerPorId);
router.post('/', verifyToken, requireEncargado, usuariosController.crear);
router.put('/:id', verifyToken, requireEncargado, usuariosController.actualizar);
router.delete('/:id', verifyToken, requireEncargado, usuariosController.eliminar);

module.exports = router;
