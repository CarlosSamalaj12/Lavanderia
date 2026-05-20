const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
  }

  db.get('SELECT * FROM usuarios WHERE username = ? AND activo = 1', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Error en el servidor' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado o inactivo' });
    }

    const passwordValid = bcrypt.compareSync(password, user.password);

    if (!passwordValid) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol,
        departamento_id: user.departamento_id
      }
    });
  });
});

router.get('/verify', verifyToken, (req, res) => {
  db.get('SELECT id, username, nombre, rol, departamento_id FROM usuarios WHERE id = ?', [req.userId], (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Error al verificar usuario' });
    }
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ user });
  });
});

module.exports = router;