const express = require('express');
const router = express.Router();
const trabajadoresInternosController = require('../controllers/trabajadores_internos.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, trabajadoresInternosController.listar);
router.post('/', verifyToken, requireEncargado, trabajadoresInternosController.crear);
router.put('/:id', verifyToken, requireEncargado, trabajadoresInternosController.actualizar);
router.delete('/:id', verifyToken, requireEncargado, trabajadoresInternosController.eliminar);

module.exports = router;
