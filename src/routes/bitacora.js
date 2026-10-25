const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const bitacoraController = require('../controllers/bitacora.controller');

router.get('/', verifyToken, bitacoraController.listar);
router.get('/ultimos', verifyToken, bitacoraController.ultimos);

module.exports = router;
