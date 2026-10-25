const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const { verifyToken } = require('../middleware/auth');

router.get('/pedidos', verifyToken, reportesController.pedidos);
router.get('/pedidos/resumen', verifyToken, reportesController.pedidosResumen);
router.get('/procesos', verifyToken, reportesController.procesos);
router.get('/procesos/resumen', verifyToken, reportesController.procesosResumen);
router.get('/pagos', verifyToken, reportesController.pagos);
router.get('/pagos/resumen-trabajador', verifyToken, reportesController.pagosResumenTrabajador);
router.get('/pagos/total', verifyToken, reportesController.pagosTotal);
router.get('/tareas/completadas', verifyToken, reportesController.tareasCompletadas);

module.exports = router;
