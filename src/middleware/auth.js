const jwt = require('jsonwebtoken');
const db = require('../config/database');

const verifyToken = (req, res, next) => {
  const token = req.headers['x-access-token'] || (req.headers['authorization'] && req.headers['authorization'].replace(/^Bearer\s+/i, ''));

  if (!token) {
    return res.status(403).json({ message: 'Token no proporcionado' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'lavanderia_secret_key_2024';
    const decoded = jwt.verify(token, secret);
    req.userId = decoded.id;
    req.userRol = decoded.rol;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado', expired: true });
    }
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.userRol !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador' });
  }
  next();
};

const requireEncargado = (req, res, next) => {
  if (req.userRol !== 'admin' && req.userRol !== 'encargado' && req.userRol !== 'reportes') {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de encargado, reportes o administrador' });
  }
  next();
};

const requireAnyRole = (req, res, next) => {
  const allowedRoles = ['admin', 'encargado', 'trabajador', 'solicitante', 'reportes'];
  if (!allowedRoles.includes(req.userRol)) {
    return res.status(403).json({ message: 'Acceso denegado' });
  }
  next();
};

module.exports = { verifyToken, requireAdmin, requireEncargado, requireAnyRole };
