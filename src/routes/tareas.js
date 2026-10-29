const express = require('express');
const router = express.Router();
const tareasController = require('../controllers/tareas.controller');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/', verifyToken, tareasController.listar);
router.get('/precios', verifyToken, requireEncargado, tareasController.obtenerPrecios);
router.post('/asignar', verifyToken, requireEncargado, tareasController.asignar);
router.put('/:id/iniciar', verifyToken, tareasController.iniciar);
router.put('/:id/completar', verifyToken, tareasController.completar);
router.put('/:id/cancelar', verifyToken, requireEncargado, tareasController.cancelar);
router.post('/avanzar-kanban', verifyToken, requireEncargado, tareasController.avanzarKanban);

module.exports = router;
