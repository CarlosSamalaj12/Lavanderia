const express = require('express');
const router = express.Router();
const prendasController = require('../controllers/prendas.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, prendasController.listar);
router.get('/stock', verifyToken, prendasController.stock);
router.get('/stock/resumen', verifyToken, prendasController.stockResumen);
router.get('/stock/disponible-despacho', verifyToken, prendasController.disponibleDespacho);
router.get('/:id/stock-trazabilidad', verifyToken, prendasController.stockTrazabilidad);
router.post('/', verifyToken, requireEncargado, prendasController.crear);
router.post('/importar', verifyToken, requireEncargado, prendasController.importar);
router.put('/:id', verifyToken, requireEncargado, prendasController.actualizar);
router.delete('/:id', verifyToken, requireEncargado, prendasController.eliminar);

module.exports = router;
