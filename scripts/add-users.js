const bcrypt = require('bcryptjs');
const db = require('sqlite3').verbose();

const dbPath = './lavanderia.db';
const dbConn = new db.Database(dbPath);

const hashPassword = (password) => bcrypt.hashSync(password, 10);

const usuarios = [
  { username: 'admin', password: hashPassword('admin123'), nombre: 'Administrador', rol: 'admin' },
  { username: 'encargado', password: hashPassword('trabajo123'), nombre: 'Juan Encargado', rol: 'encargado' },
  { username: 'trabajador', password: hashPassword('pedro123'), nombre: 'Pedro Trabajador', rol: 'trabajador' },
  { username: 'solicitante', password: hashPassword('solicita123'), nombre: 'Maria Solicitante', rol: 'solicitante' }
];

usuarios.forEach(u => {
  dbConn.run(
    'INSERT OR REPLACE INTO usuarios (username, password, nombre, rol) VALUES (?, ?, ?, ?)',
    [u.username, u.password, u.nombre, u.rol],
    (err) => {
      if (err) console.log('Error:', err.message);
      else console.log('Usuario creado:', u.username);
    }
  );
});

setTimeout(() => {
  dbConn.close();
  console.log('Base de datos actualizada');
}, 1000);