const express = require('express');
const router = express.Router();
const departamentosController = require('../controllers/departamentos.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, departamentosController.listar);
router.get('/:id', verifyToken, departamentosController.obtenerPorId);
router.post('/', verifyToken, requireEncargado, departamentosController.crear);
router.put('/:id', verifyToken, requireEncargado, departamentosController.actualizar);
router.delete('/:id', verifyToken, requireEncargado, departamentosController.eliminar);

module.exports = router;
