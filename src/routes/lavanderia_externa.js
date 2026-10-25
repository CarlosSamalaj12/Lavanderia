const express = require('express');
const router = express.Router();
const lavanderiaExternaController = require('../controllers/lavanderia_externa.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, lavanderiaExternaController.listar);
router.get('/reporte', verifyToken, lavanderiaExternaController.reporte);
router.get('/:id', verifyToken, lavanderiaExternaController.obtenerPorId);
router.post('/enviar', verifyToken, requireEncargado, lavanderiaExternaController.enviar);
router.put('/:id/retornar', verifyToken, requireEncargado, lavanderiaExternaController.retornar);

module.exports = router;
