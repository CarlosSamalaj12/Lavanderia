const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { verifyToken, requireEncargado } = require('../middleware/auth');

router.get('/:id', verifyToken, requireEncargado, (req, res) => {
  db.get('SELECT id, username, nombre, rol, activo, departamento_id FROM usuarios WHERE id = ?', [req.params.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  });
});

router.get('/', verifyToken, requireEncargado, (req, res) => {
  const { rol } = req.query;
  
  let sql = `
    SELECT id, username, nombre, rol, activo, departamento_id, created_at
    FROM usuarios
    WHERE 1=1
  `;
  const params = [];
  
  if (rol) {
    sql += ' AND rol = ?';
    params.push(rol);
  }
  
  sql += ' ORDER BY nombre';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', verifyToken, requireEncargado, (req, res) => {
  const { username, password, nombre, rol, departamento_id } = req.body;

  if (req.userRol === 'reportes') {
    return res.status(403).json({ message: 'El rol reportes no puede crear usuarios' });
  }

  if (!username || !password || !nombre || !rol) {
    return res.status(400).json({ message: 'Todos los campos son requeridos' });
  }

  if (req.userRol !== 'admin' && rol === 'admin') {
    return res.status(403).json({ message: 'Solo un administrador puede crear otro administrador' });
  }

  const normalizedUsername = String(username || '').trim().toLowerCase();

  const hashedPassword = bcrypt.hashSync(password, 10);

  const sql = `
    INSERT INTO usuarios (username, password, nombre, rol, departamento_id)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [normalizedUsername, hashedPassword, nombre, rol, departamento_id || null], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ message: 'El usuario ya existe' });
      }
      return res.status(500).json({ error: err.message });
    }

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'CREAR', 'usuarios', this.lastID, JSON.stringify(req.body)]);

    res.status(201).json({ id: this.lastID, message: 'Usuario creado exitosamente' });
  });
});

router.put('/:id', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;
  const { nombre, rol, activo, departamento_id, password } = req.body;

  if (req.userRol === 'reportes') {
    return res.status(403).json({ message: 'El rol reportes no puede editar usuarios' });
  }

  if (req.userRol !== 'admin' && rol === 'admin') {
    return res.status(403).json({ message: 'Solo un administrador puede asignar rol administrador' });
  }

  let sql = `
    UPDATE usuarios
    SET nombre = COALESCE(?, nombre),
        rol = COALESCE(?, rol),
        activo = COALESCE(?, activo),
        departamento_id = COALESCE(?, departamento_id)
  `;
  let params = [nombre, rol, activo, departamento_id];
  
  if (password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    sql += ', password = ?';
    params.push(hashedPassword);
  }
  
  sql += ' WHERE id = ?';
  params.push(id);

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ACTUALIZAR', 'usuarios', id, JSON.stringify(req.body)]);

    res.json({ message: 'Usuario actualizado' });
  });
});

router.delete('/:id', verifyToken, requireEncargado, (req, res) => {
  const { id } = req.params;

  if (req.userRol === 'reportes') {
    return res.status(403).json({ message: 'El rol reportes no puede eliminar usuarios' });
  }

  const sql = 'UPDATE usuarios SET activo = 0 WHERE id = ?';

  db.run(sql, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const bitacoraSql = `
      INSERT INTO bitacora (usuario_id, accion, tabla_afectada, registro_id)
      VALUES (?, ?, ?, ?)
    `;
    db.run(bitacoraSql, [req.userId, 'ELIMINAR', 'usuarios', id]);

    res.json({ message: 'Usuario desactivado' });
  });
});

module.exports = router;
