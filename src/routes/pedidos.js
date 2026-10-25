const express = require('express');
const router = express.Router();
const pedidosController = require('../controllers/pedidos.controller');
const { verifyToken, requireEncargado, requireAnyRole } = require('../middleware/auth');

router.get('/', verifyToken, pedidosController.listar);
router.get('/:id', verifyToken, pedidosController.obtenerPorId);
router.post('/', verifyToken, requireAnyRole, pedidosController.crear);
router.put('/:id/entregar', verifyToken, requireEncargado, pedidosController.entregar);
router.put('/:id/anular-entrega', verifyToken, requireEncargado, pedidosController.anularEntrega);
router.put('/:id/anular-entrega-item', verifyToken, requireEncargado, pedidosController.anularEntregaItem);
router.put('/:id/anular-item-pendiente', verifyToken, requireEncargado, pedidosController.anularItemPendiente);
router.delete('/:id', verifyToken, requireEncargado, pedidosController.cancelar);

module.exports = router;
