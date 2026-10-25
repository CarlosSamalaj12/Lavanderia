const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbAsync = require('../utils/db-async');

const authService = {
  async login(username, password) {
    if (!username || !password) {
      const err = new Error('Usuario y contraseña requeridos');
      err.status = 400;
      throw err;
    }

    const normalizedUsername = String(username || '').trim();

    const user = await dbAsync.get(
      'SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?) AND activo = 1',
      [normalizedUsername]
    );

    if (!user) {
      const err = new Error('Usuario no encontrado o inactivo');
      err.status = 401;
      throw err;
    }

    const passwordValid = bcrypt.compareSync(password, user.password);
    if (!passwordValid) {
      const err = new Error('Contraseña incorrecta');
      err.status = 401;
      throw err;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET || 'lavanderia_secret_key_2024',
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol,
        departamento_id: user.departamento_id
      }
    };
  },

  async verify(userId) {
    const user = await dbAsync.get(
      'SELECT id, username, nombre, rol, departamento_id FROM usuarios WHERE id = ?',
      [userId]
    );

    if (!user) {
      const err = new Error('Usuario no encontrado');
      err.status = 404;
      throw err;
    }

    return user;
  }
};

module.exports = authService;
