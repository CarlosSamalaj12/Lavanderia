const db = require('sqlite3').verbose();

const dbPath = './lavanderia.db';
const dbConn = new db.Database(dbPath);

dbConn.run('ALTER TABLE usuarios ADD COLUMN departamento_id INTEGER', (err) => {
  if (err && !err.message.includes('duplicate')) {
    console.log('Error:', err.message);
  } else {
    console.log('Columna departamento_id agregada a usuarios');
  }
  dbConn.close();
});