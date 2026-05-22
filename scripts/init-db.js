require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

console.log('Inicializando base de datos...');

const hashPassword = (password) => bcrypt.hashSync(password, 10);

const queries = [
  {
    name: 'Crear usuarios',
    sql: `
      INSERT OR IGNORE INTO usuarios (username, password, nombre, rol)
      VALUES
        ('admin', ?, 'Administrador', 'admin'),
        ('encargado', ?, 'Juan Encargado', 'encargado'),
        ('trabajador', ?, 'Pedro Trabajador', 'trabajador'),
        ('solicitante', ?, 'Maria Solicitante', 'solicitante')
    `,
    params: [hashPassword('admin123'), hashPassword('trabajo123'), hashPassword('pedro123'), hashPassword('solicita123')]
  },
  {
    name: 'Crear departamentos',
    sql: `
      INSERT OR IGNORE INTO departamentos (nombre, descripcion)
      VALUES
        ('Cocina', 'Área de cocina del restaurante'),
        ('Habitaciones', 'Área de limpieza de habitaciones'),
        ('Restaurante', 'Área del restaurante'),
        ('Recepción', 'Área de recepción')
    `
  },
  {
    name: 'Crear prendas',
    sql: `
      INSERT OR IGNORE INTO prendas (nombre, descripcion, precio_remojo, precio_lavado, precio_desmanche, precio_planchado, requiere_plancha)
      VALUES
        ('Camisa blanca', 'Camisa de empleado branca', 40, 60, 80, 30, 1),
        ('Camisa negra', 'Camisa de empleado negra', 40, 60, 80, 30, 1),
        ('Pantalón negro', 'Pantalón de uniforme', 35, 55, 75, 25, 1),
        ('Delantal', 'Delantal de trabajo', 25, 40, 50, 15, 1),
        ('Toalla grande', 'Toalla de baño', 30, 45, 55, 20, 1),
        ('Toalla pequeña', 'Toalla de mano', 15, 25, 35, 10, 1),
        ('Sábanas queen', 'Sábana para cama queen', 50, 70, 90, 35, 1),
        ('Sábanas king', 'Sábana para cama king', 60, 80, 100, 40, 1),
        ('Funda almohada', 'Funda de almohada', 10, 20, 25, 10, 1),
        ('Uniforme chef', 'Uniforme completo de chef', 70, 90, 120, 50, 1),
        ('Bata laboratorio', 'Bata de laboratorio', 35, 50, 65, 25, 0)
    `
  },
  {
    name: 'Crear trabajadores',
    sql: `
      INSERT OR IGNORE INTO trabajadores (nombre, cedula, telefono, factura)
      VALUES
        ('Ana López', '12345678', '3001234567', 1),
        ('Carlos Pérez', '87654321', '3007654321', 0),
        ('María García', '11223344', '3001122334', 1),
        ('Luis Martínez', '55667788', '3005567788', 0)
    `
  },
  {
    name: 'Crear precios personalizados para trabajadores',
    sql: `
      INSERT OR IGNORE INTO precios_trabajador (trabajador_id, proceso, precio)
      VALUES
        (2, 'sucio', 45),
        (2, 'lavado', 55),
        (4, 'remojo', 35),
        (4, 'lavado', 50)
    `
  },
  {
    name: 'Crear stock inicial de prendas',
    sql: `
      INSERT OR IGNORE INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
      VALUES
        (1, 'stock', 20, 1, 1),
        (1, 'sucio', 15, 1, 1),
        (2, 'stock', 18, 2, 1),
        (2, 'limpio', 12, 2, 1),
        (3, 'stock', 25, 1, 1),
        (4, 'stock', 30, 3, 1),
        (5, 'stock', 50, 2, 1),
        (6, 'stock', 60, 2, 1),
        (7, 'stock', 40, 2, 1),
        (8, 'stock', 30, 2, 1),
        (9, 'stock', 100, 2, 1),
        (10, 'stock', 10, 1, 1),
        (1, 'lavado', 8, NULL, 1)
    `
  }
];

db.serialize(() => {
  let current = 0;

  const runNext = () => {
    if (current >= queries.length) {
      console.log('\n✅ Base de datos inicializada correctamente');
      console.log('\n📋 Credenciales de acceso:');
      console.log('   Admin: admin / admin123');
      console.log('   Encargado: encargado / trabajo123');
      console.log('   Trabajador: trabajador / pedro123');
      console.log('   Solicitante: solicitante / solicita123');
      process.exit(0);
    }

    const q = queries[current];
    console.log(`Ejecutando: ${q.name}...`);

    try {
      if (q.params) {
        db.run(q.sql, q.params);
      } else {
        db.run(q.sql);
      }
      current++;
      runNext();
    } catch (err) {
      console.error(`Error en ${q.name}:`, err.message);
      current++;
      runNext();
    }
  };

  runNext();
});
