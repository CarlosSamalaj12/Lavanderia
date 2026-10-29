const express = require('express');
const router = express.Router();
const procesosController = require('../controllers/procesos.controller');
const { verifyToken, requireEncargado, requireAnyRole } = require('../middleware/auth');

router.get('/', verifyToken, procesosController.listar);
router.get('/kanban', verifyToken, procesosController.obtenerTableroKanban);
router.get('/por-proceso/:proceso', verifyToken, procesosController.porProceso);
router.post('/verificar-disponibilidad', verifyToken, procesosController.verificarDisponibilidad);
router.post('/mover', verifyToken, requireEncargado, procesosController.mover);
router.post('/ingresar', verifyToken, requireEncargado, procesosController.ingresar);
router.post('/revertir', verifyToken, requireEncargado, procesosController.revertir);
router.delete('/:id', verifyToken, requireEncargado, procesosController.eliminar);
router.post('/devolver', verifyToken, requireAnyRole, procesosController.devolver);
router.get('/stock/departamento/:departamento_id', verifyToken, procesosController.stockDepartamento);

module.exports = router;
