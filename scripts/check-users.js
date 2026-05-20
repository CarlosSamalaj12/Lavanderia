const db = require('sqlite3').verbose();

const dbPath = './lavanderia.db';
const dbConn = new db.Database(dbPath);

dbConn.all('SELECT * FROM usuarios', [], (err, rows) => {
  if (err) {
    console.log('Error:', err.message);
  } else {
    console.log('Usuarios en la base de datos:');
    console.log(JSON.stringify(rows, null, 2));
  }
  dbConn.close();
});