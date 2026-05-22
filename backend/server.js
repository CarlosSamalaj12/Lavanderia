require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const parseAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
const allowAllOrigins = allowedOrigins.length === 0;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowAllOrigins || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin no permitido por CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
};

const io = socketIo(server, {
  cors: corsOptions
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

function asBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

async function logEvent(modulo, accion, referenciaId, usuarioId, detalle) {
  await db.run(
    `INSERT INTO bitacora (modulo, accion, referencia_id, usuario_id, detalle)
     VALUES (?, ?, ?, ?, ?)`,
    [modulo, accion, referenciaId || null, usuarioId || null, detalle || '']
  );
}

async function emitRefresh() {
  const payload = await buildBootstrapPayload();
  io.emit('datos-actualizados', payload);
}

async function getStateMap() {
  const rows = await db.all(`SELECT * FROM estados ORDER BY orden`);
  return {
    rows,
    byId: Object.fromEntries(rows.map((row) => [row.id, row])),
    byCode: Object.fromEntries(rows.map((row) => [row.codigo, row]))
  };
}

async function ensureLaundryInventory(prendaId, estadoId) {
  await db.run(
    `INSERT OR IGNORE INTO inventario_lavanderia (prenda_id, estado_id, cantidad)
     VALUES (?, ?, 0)`,
    [prendaId, estadoId]
  );
}

async function ensureWarehouseInventory(bodegaId, prendaId) {
  await db.run(
    `INSERT OR IGNORE INTO inventario_bodega (bodega_id, prenda_id, cantidad)
     VALUES (?, ?, 0)`,
    [bodegaId, prendaId]
  );
}

async function adjustLaundryInventory(prendaId, estadoId, delta) {
  await ensureLaundryInventory(prendaId, estadoId);
  const current = await db.get(
    `SELECT cantidad FROM inventario_lavanderia WHERE prenda_id = ? AND estado_id = ?`,
    [prendaId, estadoId]
  );

  const nextValue = (current?.cantidad || 0) + delta;
  if (nextValue < 0) {
    throw new Error('No hay suficiente stock en el estado de origen.');
  }

  await db.run(
    `UPDATE inventario_lavanderia SET cantidad = ? WHERE prenda_id = ? AND estado_id = ?`,
    [nextValue, prendaId, estadoId]
  );
}

async function adjustWarehouseInventory(bodegaId, prendaId, delta) {
  await ensureWarehouseInventory(bodegaId, prendaId);
  const current = await db.get(
    `SELECT cantidad FROM inventario_bodega WHERE bodega_id = ? AND prenda_id = ?`,
    [bodegaId, prendaId]
  );

  const nextValue = (current?.cantidad || 0) + delta;
  if (nextValue < 0) {
    throw new Error('La bodega no cuenta con stock suficiente.');
  }

  await db.run(
    `UPDATE inventario_bodega SET cantidad = ? WHERE bodega_id = ? AND prenda_id = ?`,
    [nextValue, bodegaId, prendaId]
  );
}

async function getAuthUserByCode(code) {
  if (!code) {
    return null;
  }

  return db.get(
    `SELECT * FROM usuarios WHERE codigo_autorizacion = ? AND activo = 1`,
    [code]
  );
}

async function getUserById(id) {
  if (!id) {
    return null;
  }

  return db.get(
    `SELECT * FROM usuarios WHERE id = ? AND activo = 1`,
    [id]
  );
}

function canManageTaskBoard(user) {
  return ['admin', 'encargado'].includes(String(user?.rol || '').toLowerCase());
}

async function getPriceForAssignment(prendaId, estadoId, trabajadorId, cantidad) {
  const trabajador = trabajadorId
    ? await db.get(`SELECT * FROM trabajadores WHERE id = ?`, [trabajadorId])
    : null;

  const precio = await db.get(
    `SELECT * FROM precios_prenda_estado WHERE prenda_id = ? AND estado_id = ?`,
    [prendaId, estadoId]
  );

  let precioUnitario = trabajador?.factura
    ? (precio?.precio_factura || 0)
    : (precio?.precio_no_factura || 0);

  let gratisPorReproceso = 0;
  const state = await db.get(`SELECT codigo FROM estados WHERE id = ?`, [estadoId]);
  if (state && ['remojo', 'lavado'].includes(state.codigo)) {
    await db.run(
      `INSERT OR IGNORE INTO cola_reproceso (prenda_id, remojo_pendiente, lavado_pendiente)
       VALUES (?, 0, 0)`,
      [prendaId]
    );

    const cola = await db.get(
      `SELECT * FROM cola_reproceso WHERE prenda_id = ?`,
      [prendaId]
    );

    if (state.codigo === 'remojo' && cola?.remojo_pendiente > 0) {
      gratisPorReproceso = Math.min(cola.remojo_pendiente, cantidad);
      await db.run(
        `UPDATE cola_reproceso
         SET remojo_pendiente = remojo_pendiente - ?, actualizado_en = CURRENT_TIMESTAMP
         WHERE prenda_id = ?`,
        [gratisPorReproceso, prendaId]
      );
    }

    if (state.codigo === 'lavado' && cola?.lavado_pendiente > 0) {
      gratisPorReproceso = Math.min(cola.lavado_pendiente, cantidad);
      await db.run(
        `UPDATE cola_reproceso
         SET lavado_pendiente = lavado_pendiente - ?, actualizado_en = CURRENT_TIMESTAMP
         WHERE prenda_id = ?`,
        [gratisPorReproceso, prendaId]
      );
    }
  }

  if (gratisPorReproceso === cantidad) {
    precioUnitario = 0;
  }

  const pagables = Math.max(cantidad - gratisPorReproceso, 0);
  return {
    precioUnitario,
    precioTotal: precioUnitario * pagables,
    gratisPorReproceso
  };
}

async function buildCatalogs() {
  const [areas, bodegas, estados, prendas, trabajadores, usuarios, precios] = await Promise.all([
    db.all(`SELECT * FROM areas ORDER BY nombre`),
    db.all(`SELECT * FROM bodegas ORDER BY tipo, nombre`),
    db.all(`SELECT * FROM estados ORDER BY orden`),
    db.all(`
      SELECT p.*, a.nombre AS area_nombre
      FROM prendas p
      LEFT JOIN areas a ON a.id = p.area_uso_id
      ORDER BY p.nombre
    `),
    db.all(`SELECT * FROM trabajadores ORDER BY nombre`),
    db.all(`
      SELECT u.*, b.nombre AS bodega_nombre
      FROM usuarios u
      LEFT JOIN bodegas b ON b.id = u.bodega_id
      ORDER BY u.nombre
    `),
    db.all(`
      SELECT ppe.*, pr.nombre AS prenda_nombre, e.nombre AS estado_nombre
      FROM precios_prenda_estado ppe
      JOIN prendas pr ON pr.id = ppe.prenda_id
      JOIN estados e ON e.id = ppe.estado_id
      ORDER BY pr.nombre, e.orden
    `)
  ]);

  return { areas, bodegas, estados, prendas, trabajadores, usuarios, precios };
}

async function buildInventory() {
  const [lavanderia, bodegas] = await Promise.all([
    db.all(`
      SELECT il.id, il.prenda_id, il.estado_id, il.cantidad,
             p.nombre AS prenda_nombre, p.no_planchar,
             e.codigo AS estado_codigo, e.nombre AS estado_nombre, e.orden AS estado_orden
      FROM inventario_lavanderia il
      JOIN prendas p ON p.id = il.prenda_id
      JOIN estados e ON e.id = il.estado_id
      WHERE il.cantidad > 0
      ORDER BY e.orden, p.nombre
    `),
    db.all(`
      SELECT ib.id, ib.bodega_id, ib.prenda_id, ib.cantidad,
             b.nombre AS bodega_nombre, b.tipo AS bodega_tipo,
             p.nombre AS prenda_nombre
      FROM inventario_bodega ib
      JOIN bodegas b ON b.id = ib.bodega_id
      JOIN prendas p ON p.id = ib.prenda_id
      WHERE ib.cantidad > 0
      ORDER BY b.nombre, p.nombre
    `)
  ]);

  return { lavanderia, bodegas };
}

async function buildAssignments() {
    return db.all(`
      SELECT a.*,
             p.nombre AS prenda_nombre,
           eo.nombre AS estado_origen_nombre,
           eo.codigo AS estado_origen_codigo,
           ed.nombre AS estado_destino_nombre,
             ed.codigo AS estado_destino_codigo,
             t.nombre AS trabajador_nombre,
             u.nombre AS usuario_nombre,
             au.nombre AS autorizado_por,
             CASE
               WHEN a.cantidad_realizada >= a.cantidad THEN 0
               ELSE a.cantidad - a.cantidad_realizada
             END AS cantidad_pendiente
      FROM asignaciones a
      JOIN prendas p ON p.id = a.prenda_id
    LEFT JOIN estados eo ON eo.id = a.estado_origen_id
    LEFT JOIN estados ed ON ed.id = a.estado_destino_id
      LEFT JOIN trabajadores t ON t.id = a.trabajador_id
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      LEFT JOIN usuarios au ON au.id = a.autorizacion_usuario_id
      WHERE a.eliminada = 0
      ORDER BY a.fecha_asignacion DESC, a.id DESC
      LIMIT 1000
    `);
  }

async function buildOrders() {
  const pedidos = await db.all(`
    SELECT p.*, u.nombre AS usuario_nombre, b.nombre AS bodega_nombre
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    JOIN bodegas b ON b.id = p.bodega_id
    ORDER BY p.fecha_creacion DESC
  `);

  for (const pedido of pedidos) {
    pedido.detalles = await db.all(`
      SELECT pd.*, pr.nombre AS prenda_nombre
      FROM pedido_detalles pd
      JOIN prendas pr ON pr.id = pd.prenda_id
      WHERE pd.pedido_id = ?
      ORDER BY pr.nombre
    `, [pedido.id]);
  }

  return pedidos;
}

async function buildDashboard() {
  const [porEstado, topTrabajadores, pedidosPendientes, stockTotal] = await Promise.all([
    db.all(`
      SELECT e.nombre, e.codigo, COALESCE(SUM(il.cantidad), 0) AS cantidad
      FROM estados e
      LEFT JOIN inventario_lavanderia il ON il.estado_id = e.id
      GROUP BY e.id
      ORDER BY e.orden
    `),
    db.all(`
      SELECT t.nombre, COUNT(a.id) AS tareas, COALESCE(SUM(a.precio_total), 0) AS total_generado
      FROM trabajadores t
      LEFT JOIN asignaciones a ON a.trabajador_id = t.id AND a.eliminada = 0
      GROUP BY t.id
      ORDER BY total_generado DESC, tareas DESC
      LIMIT 5
    `),
    db.get(`SELECT COUNT(*) AS total FROM pedidos WHERE estado = 'pendiente'`),
    db.get(`
      SELECT COALESCE(SUM(il.cantidad), 0) AS total
      FROM inventario_lavanderia il
      JOIN estados e ON e.id = il.estado_id
      WHERE e.codigo = 'stock'
    `)
  ]);

  return {
    porEstado,
    topTrabajadores,
    pedidosPendientes: pedidosPendientes?.total || 0,
    stockDespacho: stockTotal?.total || 0
  };
}

async function buildReports() {
  const [asignacionesDia, tareasPorUsuario, reversiones, prendasPorEstado, inventario, pedidos, existenciaBodega, rendimiento] = await Promise.all([
    db.all(`
      SELECT date(fecha_asignacion) AS fecha, usuario_nombre, trabajador_nombre, prenda_nombre, cantidad, estado_destino_nombre
      FROM (
        SELECT a.fecha_asignacion, u.nombre AS usuario_nombre, t.nombre AS trabajador_nombre,
               p.nombre AS prenda_nombre, a.cantidad, e.nombre AS estado_destino_nombre
        FROM asignaciones a
        LEFT JOIN usuarios u ON u.id = a.usuario_id
        LEFT JOIN trabajadores t ON t.id = a.trabajador_id
        JOIN prendas p ON p.id = a.prenda_id
        JOIN estados e ON e.id = a.estado_destino_id
        WHERE a.eliminada = 0
      )
      ORDER BY fecha DESC
      LIMIT 50
    `),
    db.all(`
      SELECT t.nombre AS trabajador, e.nombre AS tarea, SUM(a.cantidad) AS cantidad,
             AVG(a.precio_unitario) AS precio_unitario, SUM(a.precio_total) AS precio_total
      FROM asignaciones a
      LEFT JOIN trabajadores t ON t.id = a.trabajador_id
      JOIN estados e ON e.id = a.estado_destino_id
      WHERE a.eliminada = 0
      GROUP BY t.id, e.id
      ORDER BY precio_total DESC, cantidad DESC
    `),
    db.all(`
      SELECT b.fecha_evento, b.detalle, u.nombre AS usuario
      FROM bitacora b
      LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.accion IN ('eliminar_asignacion', 'editar_asignacion')
      ORDER BY b.fecha_evento DESC
      LIMIT 50
    `),
    db.all(`
      SELECT e.nombre AS estado, COALESCE(SUM(il.cantidad), 0) AS cantidad
      FROM estados e
      LEFT JOIN inventario_lavanderia il ON il.estado_id = e.id
      GROUP BY e.id
      ORDER BY e.orden
    `),
    db.all(`
      SELECT p.nombre AS prenda, e.nombre AS estado, il.cantidad
      FROM inventario_lavanderia il
      JOIN prendas p ON p.id = il.prenda_id
      JOIN estados e ON e.id = il.estado_id
      WHERE il.cantidad > 0
      ORDER BY p.nombre, e.orden
    `),
    db.all(`
      SELECT p.id, p.fecha_creacion, p.fecha_solicitada, p.horario_solicitado, p.estado,
             u.nombre AS usuario, b.nombre AS bodega
      FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id
      JOIN bodegas b ON b.id = p.bodega_id
      ORDER BY p.fecha_creacion DESC
      LIMIT 50
    `),
    db.all(`
      SELECT b.nombre AS bodega, pr.nombre AS prenda, ib.cantidad
      FROM inventario_bodega ib
      JOIN bodegas b ON b.id = ib.bodega_id
      JOIN prendas pr ON pr.id = ib.prenda_id
      WHERE ib.cantidad > 0
      ORDER BY b.nombre, pr.nombre
    `),
    db.all(`
      SELECT t.nombre AS trabajador, COUNT(a.id) AS tareas_realizadas, SUM(a.cantidad) AS prendas,
             COALESCE(SUM(a.precio_total), 0) AS generado
      FROM trabajadores t
      LEFT JOIN asignaciones a ON a.trabajador_id = t.id AND a.eliminada = 0
      GROUP BY t.id
      ORDER BY generado DESC, prendas DESC
    `)
  ]);

  return {
    asignacionesDia,
    tareasPorUsuario,
    reversiones,
    prendasPorEstado,
    inventario,
    pedidos,
    existenciaBodega,
    rendimiento
  };
}

async function buildBootstrapPayload() {
  const [catalogos, inventario, asignaciones, pedidos, dashboard, reportes] = await Promise.all([
    buildCatalogs(),
    buildInventory(),
    buildAssignments(),
    buildOrders(),
    buildDashboard(),
    buildReports()
  ]);

  return {
    catalogos,
    inventario,
    asignaciones,
    pedidos,
    dashboard,
    reportes
  };
}

async function getNextState(currentCode, noPlanchar) {
  const sequence = {
    sucio: 'remojo',
    remojo: 'lavado',
    lavado: 'tendido',
    tendido: 'recogido',
    recogido: 'limpio',
    limpio: noPlanchar ? 'stock' : 'planchado',
    planchado: 'stock',
    stock: 'stock'
  };

  return sequence[currentCode] || null;
}

async function getInventoryQuantity(prendaId, estadoId) {
  const row = await db.get(
    `SELECT cantidad FROM inventario_lavanderia WHERE prenda_id = ? AND estado_id = ?`,
    [prendaId, estadoId]
  );
  return row?.cantidad || 0;
}

async function resolveAssignmentRoute(prendaId, taskStateId, explicitOriginId = null) {
  const stateMap = await getStateMap();
  const prenda = await db.get(`SELECT * FROM prendas WHERE id = ?`, [prendaId]);
  const taskState = stateMap.byId[taskStateId];

  if (!taskState) {
    throw new Error('La tarea seleccionada no existe.');
  }

  const flowMap = {
    remojo: { sourceCandidates: ['reproceso', 'sucio'], inventoryTarget: 'remojo' },
    desmanche: { sourceCandidates: ['remojo'], inventoryTarget: 'desmanche' },
    lavado: { sourceCandidates: ['desmanche', 'remojo'], inventoryTarget: 'lavado' },
    reproceso: { sourceCandidates: ['limpio', 'recogido'], inventoryTarget: 'reproceso' },
    tendido: { sourceCandidates: ['lavado'], inventoryTarget: 'tendido' },
    recogido: { sourceCandidates: ['tendido'], inventoryTarget: 'limpio' },
    limpio: { sourceCandidates: ['recogido'], inventoryTarget: 'limpio' },
    planchado: { sourceCandidates: ['limpio'], inventoryTarget: 'stock' },
    stock: { sourceCandidates: [prenda?.no_planchar ? 'limpio' : 'planchado'], inventoryTarget: 'stock' },
    sucio: { sourceCandidates: [], inventoryTarget: 'sucio' }
  };

  const route = flowMap[taskState.codigo];
  if (!route) {
    throw new Error('No hay una ruta configurada para esta tarea.');
  }

  let inventoryOriginState = explicitOriginId ? stateMap.byId[explicitOriginId] : null;

  if (!inventoryOriginState && route.sourceCandidates.length) {
    for (const candidateCode of route.sourceCandidates) {
      const candidateState = stateMap.byCode[candidateCode];
      const candidateStock = candidateState ? await getInventoryQuantity(prendaId, candidateState.id) : 0;
      if (candidateStock > 0) {
        inventoryOriginState = candidateState;
        break;
      }
    }
  }

  if (!inventoryOriginState && route.sourceCandidates.length) {
    inventoryOriginState = stateMap.byCode[route.sourceCandidates[0]];
  }

  return {
    taskState,
    inventoryOriginState,
    inventoryTargetState: stateMap.byCode[route.inventoryTarget],
    route
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lavanderia-backend' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'lavanderia-api' });
});

app.get('/api/bootstrap', async (req, res) => {
  try {
    res.json(await buildBootstrapPayload());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reportes/resumen', async (req, res) => {
  try {
    res.json(await buildReports());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/catalogos/:tipo', async (req, res) => {
  try {
    const tipo = req.params.tipo;
    const allowed = ['areas', 'bodegas', 'estados', 'prendas', 'trabajadores', 'usuarios'];
    if (!allowed.includes(tipo)) {
      res.status(400).json({ error: 'Catalogo no soportado.' });
      return;
    }

    const rows = await db.all(`SELECT * FROM ${tipo} ORDER BY id DESC`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/areas', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    const result = await db.run(
      `INSERT INTO areas (nombre, descripcion) VALUES (?, ?)`,
      [nombre, descripcion || '']
    );
    await logEvent('areas', 'crear', result.id, null, `Area creada: ${nombre}`);
    await emitRefresh();
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/areas/:id', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    await db.run(
      `UPDATE areas SET nombre = ?, descripcion = ? WHERE id = ?`,
      [nombre, descripcion || '', req.params.id]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/areas/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM areas WHERE id = ?`, [req.params.id]);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bodegas', async (req, res) => {
  try {
    const { nombre, tipo, descripcion } = req.body;
    const result = await db.run(
      `INSERT INTO bodegas (nombre, tipo, descripcion) VALUES (?, ?, ?)`,
      [nombre, tipo || 'interna', descripcion || '']
    );
    await emitRefresh();
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/bodegas/:id', async (req, res) => {
  try {
    const { nombre, tipo, descripcion } = req.body;
    await db.run(
      `UPDATE bodegas SET nombre = ?, tipo = ?, descripcion = ? WHERE id = ?`,
      [nombre, tipo || 'interna', descripcion || '', req.params.id]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bodegas/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM bodegas WHERE id = ?`, [req.params.id]);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/estados', async (req, res) => {
  try {
    const { codigo, nombre, orden, cobra, es_final, color, descripcion } = req.body;
    const result = await db.run(
      `INSERT INTO estados (codigo, nombre, orden, cobra, es_final, color, descripcion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [codigo, nombre, orden, asBoolean(cobra) ? 1 : 0, asBoolean(es_final) ? 1 : 0, color || '#2f855a', descripcion || '']
    );
    await emitRefresh();
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/estados/:id', async (req, res) => {
  try {
    const { codigo, nombre, orden, cobra, es_final, color, descripcion } = req.body;
    await db.run(
      `UPDATE estados
       SET codigo = ?, nombre = ?, orden = ?, cobra = ?, es_final = ?, color = ?, descripcion = ?
       WHERE id = ?`,
      [codigo, nombre, orden, asBoolean(cobra) ? 1 : 0, asBoolean(es_final) ? 1 : 0, color || '#2f855a', descripcion || '', req.params.id]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/estados/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM estados WHERE id = ?`, [req.params.id]);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/prendas', async (req, res) => {
  try {
    const { nombre, sku, area_uso_id, no_planchar, descripcion, precios } = req.body;
    const result = await db.run(
      `INSERT INTO prendas (nombre, sku, area_uso_id, no_planchar, descripcion)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, sku || '', area_uso_id || null, asBoolean(no_planchar) ? 1 : 0, descripcion || '']
    );

    const estados = await db.all(`SELECT id FROM estados`);
    const pricesByState = new Map(
      Array.isArray(precios)
        ? precios.map((item) => [
          Number(item.estado_id),
          {
            factura: Number(item.precio_factura || 0),
            noFactura: Number(item.precio_no_factura || 0)
          }
        ])
        : []
    );

    for (const estado of estados) {
      const assignedPrices = pricesByState.get(Number(estado.id)) || { factura: 0, noFactura: 0 };
      await db.run(
        `INSERT OR IGNORE INTO precios_prenda_estado (prenda_id, estado_id, precio_factura, precio_no_factura)
         VALUES (?, ?, ?, ?)`,
        [result.id, estado.id, assignedPrices.factura, assignedPrices.noFactura]
      );
    }

    await emitRefresh();
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/prendas/:id', async (req, res) => {
  try {
    const { nombre, sku, area_uso_id, no_planchar, activa, descripcion } = req.body;
    await db.run(
      `UPDATE prendas
       SET nombre = ?, sku = ?, area_uso_id = ?, no_planchar = ?, activa = ?, descripcion = ?
       WHERE id = ?`,
      [nombre, sku || '', area_uso_id || null, asBoolean(no_planchar) ? 1 : 0, asBoolean(activa) ? 1 : 0, descripcion || '', req.params.id]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/prendas/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM prendas WHERE id = ?`, [req.params.id]);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trabajadores', async (req, res) => {
  try {
    const { nombre, telefono, factura, activo, observaciones } = req.body;
    const result = await db.run(
      `INSERT INTO trabajadores (nombre, telefono, factura, activo, observaciones)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, telefono || '', asBoolean(factura) ? 1 : 0, asBoolean(activo ?? true) ? 1 : 0, observaciones || '']
    );
    await emitRefresh();
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/trabajadores/:id', async (req, res) => {
  try {
    const { nombre, telefono, factura, activo, observaciones } = req.body;
    await db.run(
      `UPDATE trabajadores
       SET nombre = ?, telefono = ?, factura = ?, activo = ?, observaciones = ?
       WHERE id = ?`,
      [nombre, telefono || '', asBoolean(factura) ? 1 : 0, asBoolean(activo) ? 1 : 0, observaciones || '', req.params.id]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/trabajadores/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM trabajadores WHERE id = ?`, [req.params.id]);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const { nombre, username, password, rol, bodega_id, codigo_autorizacion, activo } = req.body;
    const result = await db.run(
      `INSERT INTO usuarios (nombre, username, password, rol, bodega_id, codigo_autorizacion, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, username, password, rol || 'solicitante', bodega_id || null, codigo_autorizacion || '', asBoolean(activo ?? true) ? 1 : 0]
    );
    await emitRefresh();
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const { nombre, username, password, rol, bodega_id, codigo_autorizacion, activo } = req.body;
    await db.run(
      `UPDATE usuarios
       SET nombre = ?, username = ?, password = ?, rol = ?, bodega_id = ?, codigo_autorizacion = ?, activo = ?
       WHERE id = ?`,
      [nombre, username, password, rol || 'solicitante', bodega_id || null, codigo_autorizacion || '', asBoolean(activo) ? 1 : 0, req.params.id]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM usuarios WHERE id = ?`, [req.params.id]);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/precios', async (req, res) => {
  try {
    const { prenda_id, estado_id, precio_factura, precio_no_factura } = req.body;
    await db.run(
      `INSERT INTO precios_prenda_estado (prenda_id, estado_id, precio_factura, precio_no_factura)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(prenda_id, estado_id)
       DO UPDATE SET precio_factura = excluded.precio_factura, precio_no_factura = excluded.precio_no_factura`,
      [prenda_id, estado_id, precio_factura || 0, precio_no_factura || 0]
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventario/ingreso', async (req, res) => {
  try {
    const { prenda_id, estado_id, cantidad, usuario_id, detalle } = req.body;
    if (!prenda_id || !estado_id || !cantidad) {
      throw new Error('Debes indicar prenda, estado y cantidad.');
    }

    await adjustLaundryInventory(prenda_id, estado_id, Number(cantidad));
    const movimiento = await db.run(
      `INSERT INTO movimientos_inventario (tipo, prenda_id, cantidad, estado_destino_id, usuario_id, detalle)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['ingreso', prenda_id, cantidad, estado_id, usuario_id || null, detalle || 'Ingreso manual']
    );
    await logEvent('inventario', 'ingreso', movimiento.id, usuario_id, detalle || 'Ingreso manual');
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/asignaciones', async (req, res) => {
  try {
    const { prenda_id, estado_origen_id, estado_destino_id, trabajador_id, usuario_id, cantidad, observaciones } = req.body;
    if (!prenda_id || !estado_destino_id || !cantidad) {
      throw new Error('Faltan campos requeridos para la asignacion.');
    }

    const qty = Number(cantidad);
    if (qty <= 0) {
      throw new Error('La cantidad debe ser mayor a cero.');
    }

    const assignmentRoute = await resolveAssignmentRoute(prenda_id, estado_destino_id, estado_origen_id || null);
    const inventoryOriginId = assignmentRoute.inventoryOriginState?.id || null;
    const inventoryTargetId = assignmentRoute.inventoryTargetState?.id || estado_destino_id;

    if (inventoryOriginId) {
      await adjustLaundryInventory(prenda_id, inventoryOriginId, -qty);
    }
    await adjustLaundryInventory(prenda_id, inventoryTargetId, qty);

    const priceInfo = await getPriceForAssignment(prenda_id, estado_destino_id, trabajador_id, qty);
    const result = await db.run(
      `INSERT INTO asignaciones (
        prenda_id, estado_origen_id, estado_destino_id, trabajador_id, usuario_id,
        cantidad, precio_unitario, precio_total, gratis_por_reproceso, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prenda_id,
        inventoryOriginId,
        estado_destino_id,
        trabajador_id || null,
        usuario_id || null,
        qty,
        priceInfo.precioUnitario,
        priceInfo.precioTotal,
        priceInfo.gratisPorReproceso,
        observaciones || ''
      ]
    );

    if (assignmentRoute.taskState.codigo === 'reproceso') {
      await db.run(
        `INSERT OR IGNORE INTO cola_reproceso (prenda_id, remojo_pendiente, lavado_pendiente)
         VALUES (?, 0, 0)`,
        [prenda_id]
      );
      await db.run(
        `UPDATE cola_reproceso
         SET remojo_pendiente = remojo_pendiente + ?, lavado_pendiente = lavado_pendiente + ?, actualizado_en = CURRENT_TIMESTAMP
         WHERE prenda_id = ?`,
        [qty, qty, prenda_id]
      );
    }

    await db.run(
      `INSERT INTO movimientos_inventario (
         tipo, prenda_id, cantidad, estado_origen_id, estado_destino_id, asignacion_id, usuario_id, detalle
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['asignacion', prenda_id, qty, inventoryOriginId, inventoryTargetId, result.id, usuario_id || null, observaciones || '']
    );

    await logEvent('asignaciones', 'crear', result.id, usuario_id, `Asignacion creada por cantidad ${qty}`);
    await emitRefresh();
    res.json({
      ok: true,
      id: result.id,
      route: {
        origen: assignmentRoute.inventoryOriginState?.codigo || null,
        tarea: assignmentRoute.taskState.codigo,
        destinoInventario: assignmentRoute.inventoryTargetState?.codigo || null
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/asignaciones/:id', async (req, res) => {
  try {
    const { trabajador_id, observaciones, codigo_autorizacion, estado_revision, cantidad_realizada, revisada, usuario_id } = req.body;
    let authUser = await getAuthUserByCode(codigo_autorizacion);
    if (!authUser && usuario_id) {
      const sessionUser = await getUserById(usuario_id);
      if (canManageTaskBoard(sessionUser)) {
        authUser = sessionUser;
      }
    }
    if (!authUser) {
      throw new Error('Codigo de autorizacion invalido.');
    }

    const asignacion = await db.get(`SELECT * FROM asignaciones WHERE id = ? AND eliminada = 0`, [req.params.id]);
    if (!asignacion) {
      throw new Error('Asignacion no encontrada.');
    }

    const reviewState = ['pendiente', 'parcial', 'cumplida'].includes(estado_revision) ? estado_revision : (asignacion.estado_revision || 'pendiente');
    const completedQty = Number.isFinite(Number(cantidad_realizada))
      ? Math.max(0, Math.min(Number(cantidad_realizada), asignacion.cantidad))
      : (asignacion.cantidad_realizada || 0);
    const reviewed = revisada ? 1 : 0;

    await db.run(
      `UPDATE asignaciones
       SET trabajador_id = ?, observaciones = ?, estado_revision = ?, cantidad_realizada = ?,
           revisada = ?, fecha_revision = CURRENT_TIMESTAMP, fecha_edicion = CURRENT_TIMESTAMP,
           autorizacion_usuario_id = ?, autorizacion_codigo = ?
       WHERE id = ?`,
      [trabajador_id || null, observaciones || '', reviewState, completedQty, reviewed, authUser.id, codigo_autorizacion || '', req.params.id]
    );

    await logEvent(
      'asignaciones',
      'editar_asignacion',
      req.params.id,
      authUser.id,
      `Asignacion editada: revision ${reviewState}, realizado ${completedQty}/${asignacion.cantidad}, revisada ${reviewed ? 'si' : 'no'}`
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/asignaciones/:id', async (req, res) => {
  try {
    const { codigo_autorizacion } = req.body;
    const authUser = await getAuthUserByCode(codigo_autorizacion);
    if (!authUser) {
      throw new Error('Codigo de autorizacion invalido.');
    }

    const asignacion = await db.get(`SELECT * FROM asignaciones WHERE id = ? AND eliminada = 0`, [req.params.id]);
    if (!asignacion) {
      throw new Error('Asignacion no encontrada.');
    }

    const movimiento = await db.get(
      `SELECT * FROM movimientos_inventario WHERE asignacion_id = ? ORDER BY id DESC LIMIT 1`,
      [req.params.id]
    );

    const inventoryTargetId = movimiento?.estado_destino_id || asignacion.estado_destino_id;
    const inventoryOriginId = movimiento?.estado_origen_id || asignacion.estado_origen_id;

    if (inventoryTargetId) {
      await adjustLaundryInventory(asignacion.prenda_id, inventoryTargetId, -asignacion.cantidad);
    }
    if (inventoryOriginId) {
      await adjustLaundryInventory(asignacion.prenda_id, inventoryOriginId, asignacion.cantidad);
    }

    await db.run(
      `UPDATE asignaciones
       SET eliminada = 1, fecha_eliminacion = CURRENT_TIMESTAMP,
           autorizacion_usuario_id = ?, autorizacion_codigo = ?
       WHERE id = ?`,
      [authUser.id, codigo_autorizacion, req.params.id]
    );

    await logEvent('asignaciones', 'eliminar_asignacion', req.params.id, authUser.id, `Asignacion eliminada con codigo ${codigo_autorizacion}`);
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/asignaciones/avance-rapido', async (req, res) => {
  try {
    const { prenda_id, estado_origen_id, trabajador_id, usuario_id, cantidad, observaciones } = req.body;
    const prenda = await db.get(`SELECT * FROM prendas WHERE id = ?`, [prenda_id]);
    const stateMap = await getStateMap();
    const estadoOrigen = stateMap.byId[estado_origen_id];

    if (!prenda || !estadoOrigen) {
      throw new Error('Prenda o estado de origen invalido.');
    }

    const siguienteCodigo = await getNextState(estadoOrigen.codigo, prenda.no_planchar === 1);
    if (!siguienteCodigo) {
      throw new Error('Este estado no forma parte del avance automatico. Usa una asignacion manual para mover esta prenda.');
    }
    const estadoDestino = stateMap.byCode[siguienteCodigo];
    const qty = Number(cantidad);
    const assignmentRoute = await resolveAssignmentRoute(prenda_id, estadoDestino.id, estado_origen_id);
    const inventoryOriginId = assignmentRoute.inventoryOriginState?.id || estado_origen_id;
    const inventoryTargetId = assignmentRoute.inventoryTargetState?.id || estadoDestino.id;

    await adjustLaundryInventory(prenda_id, inventoryOriginId, -qty);
    await adjustLaundryInventory(prenda_id, inventoryTargetId, qty);

    const priceInfo = await getPriceForAssignment(prenda_id, estadoDestino.id, trabajador_id, qty);
    const result = await db.run(
      `INSERT INTO asignaciones (
        prenda_id, estado_origen_id, estado_destino_id, trabajador_id, usuario_id,
        cantidad, precio_unitario, precio_total, gratis_por_reproceso, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [prenda_id, inventoryOriginId, estadoDestino.id, trabajador_id || null, usuario_id || null, qty, priceInfo.precioUnitario, priceInfo.precioTotal, priceInfo.gratisPorReproceso, observaciones || 'Avance rapido']
    );

    await db.run(
      `INSERT INTO movimientos_inventario (
         tipo, prenda_id, cantidad, estado_origen_id, estado_destino_id, asignacion_id, usuario_id, detalle
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['avance_rapido', prenda_id, qty, inventoryOriginId, inventoryTargetId, result.id, usuario_id || null, observaciones || '']
    );

    await logEvent('asignaciones', 'avance_rapido', result.id, usuario_id, `Cambio a ${estadoDestino.codigo}`);
    await emitRefresh();
    res.json({ ok: true, estado_destino: estadoDestino });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/pedidos', async (req, res) => {
  try {
    const { usuario_id, fecha_solicitada, horario_solicitado, observaciones, items } = req.body;
    const usuario = await db.get(`SELECT * FROM usuarios WHERE id = ?`, [usuario_id]);
    if (!usuario || !usuario.bodega_id) {
      throw new Error('El usuario debe tener una bodega asignada.');
    }

    const result = await db.run(
      `INSERT INTO pedidos (usuario_id, bodega_id, fecha_solicitada, horario_solicitado, observaciones)
       VALUES (?, ?, ?, ?, ?)`,
      [usuario_id, usuario.bodega_id, fecha_solicitada, horario_solicitado, observaciones || '']
    );

    for (const item of items || []) {
      if (!item.prenda_id || !item.cantidad) {
        continue;
      }
      await db.run(
        `INSERT INTO pedido_detalles (pedido_id, prenda_id, cantidad) VALUES (?, ?, ?)`,
        [result.id, item.prenda_id, item.cantidad]
      );
    }

    await logEvent('pedidos', 'crear', result.id, usuario_id, 'Pedido creado');
    await emitRefresh();
    res.json({ ok: true, id: result.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/pedidos/:id/despachar', async (req, res) => {
  try {
    const { usuario_id } = req.body;
    const pedido = await db.get(`SELECT * FROM pedidos WHERE id = ?`, [req.params.id]);
    if (!pedido) {
      throw new Error('Pedido no encontrado.');
    }
    if (pedido.estado === 'despachado') {
      throw new Error('El pedido ya fue despachado.');
    }

    const stateMap = await getStateMap();
    const stockState = stateMap.byCode.stock;
    const detalles = await db.all(`SELECT * FROM pedido_detalles WHERE pedido_id = ?`, [req.params.id]);

    for (const detalle of detalles) {
      const pendiente = Number(detalle.cantidad || 0) - Number(detalle.cantidad_despachada || 0);
      if (pendiente <= 0) {
        continue;
      }

      await adjustLaundryInventory(detalle.prenda_id, stockState.id, -pendiente);
      await adjustWarehouseInventory(pedido.bodega_id, detalle.prenda_id, pendiente);
      await db.run(
        `UPDATE pedido_detalles SET cantidad_despachada = cantidad_despachada + ? WHERE id = ?`,
        [pendiente, detalle.id]
      );
      await db.run(
        `INSERT INTO movimientos_inventario (
           tipo, prenda_id, cantidad, estado_origen_id, bodega_destino_id, pedido_id, usuario_id, detalle
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['despacho_bodega', detalle.prenda_id, pendiente, stockState.id, pedido.bodega_id, pedido.id, usuario_id || null, 'Despacho de pedido']
      );
    }

    await db.run(
      `UPDATE pedidos SET estado = 'despachado', fecha_despacho = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );

    await logEvent('pedidos', 'despachar', pedido.id, usuario_id, 'Pedido despachado');
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/pedidos/:id/anular-despacho', async (req, res) => {
  try {
    const { usuario_id } = req.body;
    const pedido = await db.get(`SELECT * FROM pedidos WHERE id = ?`, [req.params.id]);
    if (!pedido) {
      throw new Error('Pedido no encontrado.');
    }
    if (!['despachado', 'parcial'].includes(String(pedido.estado))) {
      throw new Error('El pedido no tiene despacho para anular.');
    }

    const stateMap = await getStateMap();
    const stockState = stateMap.byCode.stock;
    const detalles = await db.all(`SELECT * FROM pedido_detalles WHERE pedido_id = ?`, [req.params.id]);

    let totalRevertido = 0;
    for (const detalle of detalles) {
      const despachada = Number(detalle.cantidad_despachada || 0);
      if (despachada <= 0) {
        continue;
      }

      await adjustWarehouseInventory(pedido.bodega_id, detalle.prenda_id, -despachada);
      await adjustLaundryInventory(detalle.prenda_id, stockState.id, despachada);
      await db.run(
        `UPDATE pedido_detalles SET cantidad_despachada = 0 WHERE id = ?`,
        [detalle.id]
      );
      await db.run(
        `INSERT INTO movimientos_inventario (
           tipo, prenda_id, cantidad, estado_destino_id, bodega_origen_id, pedido_id, usuario_id, detalle
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['anulacion_despacho_bodega', detalle.prenda_id, despachada, stockState.id, pedido.bodega_id, pedido.id, usuario_id || null, 'Anulacion total de despacho']
      );
      totalRevertido += despachada;
    }

    if (totalRevertido <= 0) {
      throw new Error('No hay cantidades despachadas para anular.');
    }

    await db.run(
      `UPDATE pedidos SET estado = 'pendiente', fecha_despacho = NULL WHERE id = ?`,
      [req.params.id]
    );

    await logEvent('pedidos', 'anular_despacho_total', pedido.id, usuario_id, 'Despacho completo anulado');
    await emitRefresh();
    res.json({ ok: true, message: 'Despacho completo anulado' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/pedidos/:id/anular-despacho-item', async (req, res) => {
  try {
    const { usuario_id, detalle_id, cantidad } = req.body;
    const pedido = await db.get(`SELECT * FROM pedidos WHERE id = ?`, [req.params.id]);
    if (!pedido) {
      throw new Error('Pedido no encontrado.');
    }

    const detalle = await db.get(
      `SELECT * FROM pedido_detalles WHERE id = ? AND pedido_id = ?`,
      [detalle_id, req.params.id]
    );
    if (!detalle) {
      throw new Error('Detalle de pedido no encontrado.');
    }

    const despachada = Number(detalle.cantidad_despachada || 0);
    if (despachada <= 0) {
      throw new Error('Ese detalle no tiene despacho aplicado.');
    }

    const qty = Number(cantidad || despachada);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error('La cantidad a anular debe ser un entero mayor a 0.');
    }
    if (qty > despachada) {
      throw new Error(`No puedes anular ${qty}. Despachado actual: ${despachada}.`);
    }

    const stateMap = await getStateMap();
    const stockState = stateMap.byCode.stock;

    await adjustWarehouseInventory(pedido.bodega_id, detalle.prenda_id, -qty);
    await adjustLaundryInventory(detalle.prenda_id, stockState.id, qty);
    await db.run(
      `UPDATE pedido_detalles SET cantidad_despachada = cantidad_despachada - ? WHERE id = ?`,
      [qty, detalle.id]
    );
    await db.run(
      `INSERT INTO movimientos_inventario (
         tipo, prenda_id, cantidad, estado_destino_id, bodega_origen_id, pedido_id, usuario_id, detalle
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['anulacion_despacho_item', detalle.prenda_id, qty, stockState.id, pedido.bodega_id, pedido.id, usuario_id || null, `Anulacion de despacho detalle ${detalle.id}`]
    );

    const resumen = await db.get(
      `SELECT COALESCE(SUM(cantidad), 0) AS total, COALESCE(SUM(cantidad_despachada), 0) AS despachado
       FROM pedido_detalles WHERE pedido_id = ?`,
      [req.params.id]
    );

    let nuevoEstado = 'pendiente';
    let fechaDespacho = null;
    if (Number(resumen.despachado) > 0 && Number(resumen.despachado) < Number(resumen.total)) {
      nuevoEstado = 'parcial';
      fechaDespacho = pedido.fecha_despacho || new Date().toISOString();
    } else if (Number(resumen.total) > 0 && Number(resumen.despachado) === Number(resumen.total)) {
      nuevoEstado = 'despachado';
      fechaDespacho = pedido.fecha_despacho || new Date().toISOString();
    }

    await db.run(
      `UPDATE pedidos SET estado = ?, fecha_despacho = ? WHERE id = ?`,
      [nuevoEstado, fechaDespacho, req.params.id]
    );

    await logEvent('pedidos', 'anular_despacho_item', pedido.id, usuario_id, `Detalle ${detalle.id}, cantidad ${qty}`);
    await emitRefresh();
    res.json({ ok: true, message: 'Despacho de prenda anulado', estado: nuevoEstado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/traslados/bodega-a-lavanderia', async (req, res) => {
  try {
    const { bodega_id, prenda_id, cantidad, estado_destino_id, usuario_id, detalle } = req.body;
    await adjustWarehouseInventory(bodega_id, prenda_id, -Number(cantidad));
    await adjustLaundryInventory(prenda_id, estado_destino_id, Number(cantidad));
    await db.run(
      `INSERT INTO movimientos_inventario (
         tipo, prenda_id, cantidad, estado_destino_id, bodega_origen_id, usuario_id, detalle
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['devolucion_bodega', prenda_id, cantidad, estado_destino_id, bodega_id, usuario_id || null, detalle || 'Devolucion desde bodega']
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/traslados/a-externa', async (req, res) => {
  try {
    const { bodega_externa_id, prenda_id, cantidad, estado_origen_id, usuario_id, detalle } = req.body;
    await adjustLaundryInventory(prenda_id, estado_origen_id, -Number(cantidad));
    await adjustWarehouseInventory(bodega_externa_id, prenda_id, Number(cantidad));
    await db.run(
      `INSERT INTO movimientos_inventario (
         tipo, prenda_id, cantidad, estado_origen_id, bodega_destino_id, usuario_id, detalle
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['salida_externa', prenda_id, cantidad, estado_origen_id, bodega_externa_id, usuario_id || null, detalle || 'Salida a lavanderia externa']
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/traslados/externa-a-lavanderia', async (req, res) => {
  try {
    const { bodega_externa_id, prenda_id, cantidad, estado_destino_id, usuario_id, detalle } = req.body;
    await adjustWarehouseInventory(bodega_externa_id, prenda_id, -Number(cantidad));
    await adjustLaundryInventory(prenda_id, estado_destino_id, Number(cantidad));
    await db.run(
      `INSERT INTO movimientos_inventario (
         tipo, prenda_id, cantidad, estado_destino_id, bodega_origen_id, usuario_id, detalle
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['retorno_externo', prenda_id, cantidad, estado_destino_id, bodega_externa_id, usuario_id || null, detalle || 'Retorno desde lavanderia externa']
    );
    await emitRefresh();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

io.on('connection', async (socket) => {
  socket.emit('datos-actualizados', await buildBootstrapPayload());
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor de Lavanderia ejecutandose en http://System.Management.Automation.Internal.Host.InternalHost:`);
  console.log(`Base de datos: ${path.join(__dirname, '../lavanderia.db')}`);
});


