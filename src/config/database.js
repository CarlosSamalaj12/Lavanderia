const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../lavanderia.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite');
    initializeTables();
  }
});

function initializeTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nombre TEXT NOT NULL,
        rol TEXT NOT NULL CHECK(rol IN ('admin', 'encargado', 'trabajador', 'solicitante')),
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS departamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE NOT NULL,
        descripcion TEXT,
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS prendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio_sucio_factura REAL DEFAULT 0,
        precio_remojo_factura REAL DEFAULT 0,
        precio_lavado_factura REAL DEFAULT 0,
        precio_desmanche_factura REAL DEFAULT 0,
        precio_planchado_factura REAL DEFAULT 0,
        precio_sucio REAL DEFAULT 0,
        precio_remojo REAL DEFAULT 0,
        precio_lavado REAL DEFAULT 0,
        precio_desmanche REAL DEFAULT 0,
        precio_planchado REAL DEFAULT 0,
        requiere_plancha INTEGER DEFAULT 1,
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS trabajadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        cedula TEXT,
        telefono TEXT,
        factura INTEGER DEFAULT 0,
        es_interno INTEGER DEFAULT 0,
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS precios_trabajador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trabajador_id INTEGER NOT NULL,
        proceso TEXT NOT NULL,
        precio REAL DEFAULT 0,
        FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id),
        UNIQUE(trabajador_id, proceso)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        departamento_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'entregado', 'cancelado')),
        fecha_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_entrega DATETIME,
        observaciones TEXT,
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pedidos_detalle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        prenda_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        cantidad_entregada INTEGER DEFAULT 0,
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
        FOREIGN KEY (prenda_id) REFERENCES prendas(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS prendas_proceso (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenda_id INTEGER NOT NULL,
        proceso TEXT NOT NULL CHECK(proceso IN ('sucio', 'remojo', 'lavado', 'tendido', 'recogido', 'reproceso', 'limpio', 'planchado', 'desmanche', 'stock')),
        cantidad INTEGER NOT NULL,
        departamento_actual INTEGER,
        usuario_registro INTEGER NOT NULL,
        fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prenda_id) REFERENCES prendas(id),
        FOREIGN KEY (departamento_actual) REFERENCES departamentos(id),
        FOREIGN KEY (usuario_registro) REFERENCES usuarios(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS tareas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trabajador_id INTEGER NOT NULL,
        proceso TEXT NOT NULL,
        prenda_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        precio_unitario REAL NOT NULL,
        total REAL NOT NULL,
        fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_inicio DATETIME,
        fecha_fin DATETIME,
        estado TEXT DEFAULT 'asignada' CHECK(estado IN ('asignada', 'en_proceso', 'completada', 'cancelada')),
        FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id),
        FOREIGN KEY (prenda_id) REFERENCES prendas(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trabajador_id INTEGER NOT NULL,
        tarea_id INTEGER NOT NULL,
        monto REAL NOT NULL,
        fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
        observaciones TEXT,
        FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id),
        FOREIGN KEY (tarea_id) REFERENCES tareas(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS bitacora (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        accion TEXT NOT NULL,
        tabla_afectada TEXT NOT NULL,
        registro_id INTEGER,
        datos_anteriores TEXT,
        datos_nuevos TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS lavanderia_externa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenda_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        precio REAL DEFAULT 0,
        autorizado_por TEXT,
        usuario_id INTEGER NOT NULL,
        estado TEXT DEFAULT 'enviado' CHECK(estado IN ('enviado', 'parcial', 'retornado')),
        fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_retorno DATETIME,
        FOREIGN KEY (prenda_id) REFERENCES prendas(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);

    db.run('ALTER TABLE usuarios ADD COLUMN departamento_id INTEGER', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error al agregar columna departamento_id en usuarios:', err.message);
      }
    });

    const columnasPrecioFactura = [
      'precio_sucio_factura',
      'precio_remojo_factura',
      'precio_lavado_factura',
      'precio_desmanche_factura',
      'precio_planchado_factura'
    ];

    columnasPrecioFactura.forEach((columna) => {
      db.run(`ALTER TABLE prendas ADD COLUMN ${columna} REAL DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error(`Error al agregar columna ${columna} en prendas:`, err.message);
        }
      });
    });

    db.run('ALTER TABLE trabajadores ADD COLUMN es_interno INTEGER DEFAULT 0', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error al agregar columna es_interno en trabajadores:', err.message);
      }
    });

    console.log('Tablas creadas correctamente');
  });
}

module.exports = db;
