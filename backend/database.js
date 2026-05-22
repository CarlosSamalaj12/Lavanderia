const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envDbPath = (process.env.DB_PATH || '').trim();
const dbPath = envDbPath
  ? (path.isAbsolute(envDbPath) ? envDbPath : path.resolve(projectRoot, envDbPath))
  : path.join(projectRoot, 'lavanderia.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error abriendo la base de datos', err);
        return;
      }

      console.log('Base de datos conectada en:', dbPath);
      this.initializeTables().catch((error) => {
        console.error('Error inicializando tablas', error);
      });
    });
  }

  async initializeTables() {
    await this.exec('PRAGMA foreign_keys = ON');

    await this.exec(`
      CREATE TABLE IF NOT EXISTS areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT DEFAULT '',
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bodegas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        tipo TEXT NOT NULL DEFAULT 'interna',
        descripcion TEXT DEFAULT '',
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS estados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        orden INTEGER NOT NULL,
        cobra INTEGER NOT NULL DEFAULT 1,
        es_final INTEGER NOT NULL DEFAULT 0,
        color TEXT DEFAULT '#2f855a',
        descripcion TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS prendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        sku TEXT DEFAULT '',
        area_uso_id INTEGER,
        no_planchar INTEGER NOT NULL DEFAULT 0,
        activa INTEGER NOT NULL DEFAULT 1,
        descripcion TEXT DEFAULT '',
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(area_uso_id) REFERENCES areas(id)
      );

      CREATE TABLE IF NOT EXISTS trabajadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT DEFAULT '',
        factura INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1,
        observaciones TEXT DEFAULT '',
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'solicitante',
        bodega_id INTEGER,
        codigo_autorizacion TEXT DEFAULT '',
        activo INTEGER NOT NULL DEFAULT 1,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bodega_id) REFERENCES bodegas(id)
      );

      CREATE TABLE IF NOT EXISTS precios_prenda_estado (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenda_id INTEGER NOT NULL,
        estado_id INTEGER NOT NULL,
        precio_factura REAL NOT NULL DEFAULT 0,
        precio_no_factura REAL NOT NULL DEFAULT 0,
        UNIQUE(prenda_id, estado_id),
        FOREIGN KEY(prenda_id) REFERENCES prendas(id),
        FOREIGN KEY(estado_id) REFERENCES estados(id)
      );

      CREATE TABLE IF NOT EXISTS inventario_lavanderia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenda_id INTEGER NOT NULL,
        estado_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 0,
        UNIQUE(prenda_id, estado_id),
        FOREIGN KEY(prenda_id) REFERENCES prendas(id),
        FOREIGN KEY(estado_id) REFERENCES estados(id)
      );

      CREATE TABLE IF NOT EXISTS inventario_bodega (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bodega_id INTEGER NOT NULL,
        prenda_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 0,
        UNIQUE(bodega_id, prenda_id),
        FOREIGN KEY(bodega_id) REFERENCES bodegas(id),
        FOREIGN KEY(prenda_id) REFERENCES prendas(id)
      );

      CREATE TABLE IF NOT EXISTS cola_reproceso (
        prenda_id INTEGER PRIMARY KEY,
        remojo_pendiente INTEGER NOT NULL DEFAULT 0,
        lavado_pendiente INTEGER NOT NULL DEFAULT 0,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(prenda_id) REFERENCES prendas(id)
      );

      CREATE TABLE IF NOT EXISTS asignaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenda_id INTEGER NOT NULL,
        estado_origen_id INTEGER,
        estado_destino_id INTEGER NOT NULL,
        trabajador_id INTEGER,
        usuario_id INTEGER,
        cantidad INTEGER NOT NULL,
        precio_unitario REAL NOT NULL DEFAULT 0,
        precio_total REAL NOT NULL DEFAULT 0,
        gratis_por_reproceso INTEGER NOT NULL DEFAULT 0,
        observaciones TEXT DEFAULT '',
        autorizacion_usuario_id INTEGER,
        autorizacion_codigo TEXT DEFAULT '',
        fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_edicion DATETIME,
        fecha_eliminacion DATETIME,
        eliminada INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(prenda_id) REFERENCES prendas(id),
        FOREIGN KEY(estado_origen_id) REFERENCES estados(id),
        FOREIGN KEY(estado_destino_id) REFERENCES estados(id),
        FOREIGN KEY(trabajador_id) REFERENCES trabajadores(id),
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY(autorizacion_usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        bodega_id INTEGER NOT NULL,
        fecha_solicitada TEXT NOT NULL,
        horario_solicitado TEXT NOT NULL,
        observaciones TEXT DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'pendiente',
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_despacho DATETIME,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY(bodega_id) REFERENCES bodegas(id)
      );

      CREATE TABLE IF NOT EXISTS pedido_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        prenda_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        FOREIGN KEY(pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
        FOREIGN KEY(prenda_id) REFERENCES prendas(id)
      );

      CREATE TABLE IF NOT EXISTS movimientos_inventario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        prenda_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        estado_origen_id INTEGER,
        estado_destino_id INTEGER,
        bodega_origen_id INTEGER,
        bodega_destino_id INTEGER,
        asignacion_id INTEGER,
        pedido_id INTEGER,
        usuario_id INTEGER,
        detalle TEXT DEFAULT '',
        fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(prenda_id) REFERENCES prendas(id),
        FOREIGN KEY(estado_origen_id) REFERENCES estados(id),
        FOREIGN KEY(estado_destino_id) REFERENCES estados(id),
        FOREIGN KEY(bodega_origen_id) REFERENCES bodegas(id),
        FOREIGN KEY(bodega_destino_id) REFERENCES bodegas(id),
        FOREIGN KEY(asignacion_id) REFERENCES asignaciones(id),
        FOREIGN KEY(pedido_id) REFERENCES pedidos(id),
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS bitacora (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modulo TEXT NOT NULL,
        accion TEXT NOT NULL,
        referencia_id INTEGER,
        usuario_id INTEGER,
        detalle TEXT DEFAULT '',
        fecha_evento DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      );
    `);

    await this.ensureColumn('asignaciones', 'estado_revision', "TEXT NOT NULL DEFAULT 'pendiente'");
    await this.ensureColumn('asignaciones', 'cantidad_realizada', 'INTEGER NOT NULL DEFAULT 0');
    await this.ensureColumn('asignaciones', 'fecha_revision', 'DATETIME');
    await this.ensureColumn('asignaciones', 'revisada', 'INTEGER NOT NULL DEFAULT 0');
    await this.ensureColumn('pedido_detalles', 'cantidad_despachada', 'INTEGER NOT NULL DEFAULT 0');

    await this.seedDefaults();
    console.log('Tablas inicializadas correctamente');
  }

  async seedDefaults() {
    await this.exec(`
      INSERT OR IGNORE INTO areas (nombre, descripcion) VALUES
        ('Cocina', 'Area de cocina'),
        ('Buffet', 'Area de buffet'),
        ('Camareria', 'Area de habitaciones'),
        ('Recepcion', 'Area de recepcion'),
        ('Restaurante', 'Area de restaurante');

      INSERT OR IGNORE INTO bodegas (nombre, tipo, descripcion) VALUES
        ('Lavanderia Principal', 'principal', 'Bodega central de lavanderia'),
        ('Cocina', 'interna', 'Bodega solicitante de cocina'),
        ('Buffet', 'interna', 'Bodega solicitante de buffet'),
        ('Camareria', 'interna', 'Bodega solicitante de camareria'),
        ('Recepcion', 'interna', 'Bodega solicitante de recepcion'),
        ('Restaurante', 'interna', 'Bodega solicitante de restaurante'),
        ('Lavanderia Externa', 'externa', 'Proveedor externo');

      INSERT OR IGNORE INTO estados (codigo, nombre, orden, cobra, es_final, color, descripcion) VALUES
        ('sucio', 'Sucio', 1, 0, 0, '#9f7aea', 'Ingreso de ropa sucia'),
        ('remojo', 'Remojo', 2, 1, 0, '#3182ce', 'Proceso de remojo'),
        ('desmanche', 'Desmanche', 3, 1, 0, '#dd6b20', 'Lavado profundo por manchas'),
        ('lavado', 'Lavado', 4, 1, 0, '#2b6cb0', 'Proceso de lavado'),
        ('reproceso', 'Reproceso', 5, 0, 0, '#c53030', 'Reproceso sin pago'),
        ('tendido', 'Tendido', 6, 0, 0, '#38a169', 'Tendido de prenda'),
        ('recogido', 'Recogido', 7, 0, 0, '#2f855a', 'Recogido de prenda'),
        ('limpio', 'Limpio', 8, 0, 0, '#319795', 'Prenda limpia'),
        ('planchado', 'Planchado', 9, 1, 0, '#d69e2e', 'Proceso de planchado'),
        ('stock', 'Stock', 10, 0, 1, '#4a5568', 'Disponible para despacho');
    `);

    const lavanderia = await this.get(`SELECT id FROM bodegas WHERE nombre = 'Lavanderia Principal'`);
    const cocina = await this.get(`SELECT id FROM areas WHERE nombre = 'Cocina'`);
    const estadoRows = await this.all(`SELECT id, codigo FROM estados`);
    const estados = Object.fromEntries(estadoRows.map((row) => [row.codigo, row.id]));

    await this.run(
      `INSERT OR IGNORE INTO usuarios (nombre, username, password, rol, bodega_id, codigo_autorizacion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Administrador General', 'admin', 'admin', 'admin', lavanderia?.id || null, '1234']
    );

    const trabajadorDemo = await this.get(
      `SELECT id FROM trabajadores WHERE nombre = ? AND observaciones = ?`,
      ['Operario Demo', 'Trabajador de ejemplo']
    );
    if (!trabajadorDemo) {
      await this.run(
        `INSERT INTO trabajadores (nombre, telefono, factura, observaciones)
         VALUES (?, ?, ?, ?)`,
        ['Operario Demo', '', 0, 'Trabajador de ejemplo']
      );
    }

    await this.run(
      `INSERT OR IGNORE INTO prendas (nombre, sku, area_uso_id, no_planchar, descripcion)
       VALUES (?, ?, ?, ?, ?)`,
      ['Toalla de Playa', 'TOA-PLAYA', cocina?.id || null, 0, 'Prenda de ejemplo']
    );

    await this.run(
      `INSERT OR IGNORE INTO prendas (nombre, sku, area_uso_id, no_planchar, descripcion)
       VALUES (?, ?, ?, ?, ?)`,
      ['Uniforme Ligero', 'UNI-LIG', cocina?.id || null, 1, 'Ejemplo de prenda que no se plancha']
    );

    const prendas = await this.all(`SELECT id, nombre FROM prendas`);
    for (const prenda of prendas) {
      for (const estado of estadoRows) {
        const factura = ['remojo', 'desmanche', 'lavado', 'planchado'].includes(estado.codigo) ? 1.25 : 0;
        const noFactura = ['remojo', 'desmanche', 'lavado', 'planchado'].includes(estado.codigo) ? 1 : 0;
        await this.run(
          `INSERT OR IGNORE INTO precios_prenda_estado (prenda_id, estado_id, precio_factura, precio_no_factura)
           VALUES (?, ?, ?, ?)`,
          [prenda.id, estado.id, factura, noFactura]
        );
      }
    }

    const toalla = prendas.find((item) => item.nombre === 'Toalla de Playa');
    if (toalla && estados.sucio) {
      await this.run(
        `INSERT OR IGNORE INTO inventario_lavanderia (prenda_id, estado_id, cantidad)
         VALUES (?, ?, ?)`,
        [toalla.id, estados.sucio, 20]
      );
    }
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(rows);
      });
    });
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  async ensureColumn(tableName, columnName, definition) {
    const columns = await this.all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      await this.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }
}

module.exports = new Database();
