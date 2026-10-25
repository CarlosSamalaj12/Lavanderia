const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken } = require('../middleware/auth');

router.get('/resumen', verifyToken, dashboardController.resumen);
router.get('/stock-por-proceso', verifyToken, dashboardController.stockPorProceso);
router.get('/tareas-recientes', verifyToken, dashboardController.tareasRecientes);
router.get('/ultimos-movimientos', verifyToken, dashboardController.ultimosMovimientos);
router.get('/departamentos-stock', verifyToken, dashboardController.departamentosStock);
router.get('/pagos-semana', verifyToken, dashboardController.pagosSemana);
router.get('/top-procesos', verifyToken, dashboardController.topProcesos);

module.exports = router;
