const db = require('sqlite3').verbose();

const dbPath = './lavanderia.db';
const dbConn = new db.Database(dbPath);

const columns = [
  'precio_sucio_factura REAL DEFAULT 0',
  'precio_remojo_factura REAL DEFAULT 0',
  'precio_lavado_factura REAL DEFAULT 0',
  'precio_desmanche_factura REAL DEFAULT 0',
  'precio_planchado_factura REAL DEFAULT 0'
];

let i = 0;
const addColumn = () => {
  if (i >= columns.length) {
    console.log('✓ Columnas de precios para factura agregadas');
    dbConn.close();
    return;
  }
  dbConn.run(`ALTER TABLE prendas ADD COLUMN ${columns[i]}`, (err) => {
    if (err && !err.message.includes('duplicate')) {
      console.log('Error:', err.message);
    }
    i++;
    addColumn();
  });
};

addColumn();