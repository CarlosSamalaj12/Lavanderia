/* eslint-disable no-console */
const BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
const USERNAME = process.env.API_USER || 'admin';
const PASSWORD = process.env.API_PASS || 'admin123';

let token = null;

async function request(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['x-access-token'] = token;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

function logResult(name, passed, detail) {
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function runCase(name, testFn) {
  try {
    await testFn();
    logResult(name, true);
    return true;
  } catch (err) {
    logResult(name, false, err.message);
    return false;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function login() {
  const res = await request('POST', '/auth/login', { username: USERNAME, password: PASSWORD }, false);
  expect(res.ok, `Login fallo (${res.status})`);
  expect(res.data && res.data.token, 'Login no devolvio token');
  token = res.data.token;
}

async function getAnyPrendaId() {
  const res = await request('GET', '/prendas');
  expect(res.ok, 'No se pudo obtener prendas');
  expect(Array.isArray(res.data) && res.data.length > 0, 'No hay prendas para pruebas');
  return res.data[0].id;
}

async function getAnyTrabajadorId() {
  const res = await request('GET', '/trabajadores');
  expect(res.ok, 'No se pudo obtener trabajadores');
  expect(Array.isArray(res.data) && res.data.length > 0, 'No hay trabajadores para pruebas');
  return res.data[0].id;
}

async function getAnyDepartamentoId() {
  const res = await request('GET', '/departamentos');
  expect(res.ok, 'No se pudo obtener departamentos');
  expect(Array.isArray(res.data) && res.data.length > 0, 'No hay departamentos para pruebas');
  return res.data[0].id;
}

async function ensureStock(prendaId, proceso, cantidad) {
  const res = await request('POST', '/procesos/ingresar', {
    prenda_id: prendaId,
    cantidad,
    proceso,
    estado_prenda: proceso === 'limpio' ? 'limpio' : 'sucio'
  });
  expect(res.ok, `No se pudo preparar stock en ${proceso}`);
}

async function run() {
  console.log(`Certificacion API en ${BASE_URL}`);
  await login();

  const prendaId = await getAnyPrendaId();
  const trabajadorId = await getAnyTrabajadorId();
  const departamentoId = await getAnyDepartamentoId();
  let passed = 0;
  let total = 0;

  const cases = [
    ['Health API', async () => {
      const res = await request('GET', '', null, false);
      expect(res.ok, 'API no responde');
    }],
    ['Error login invalido', async () => {
      const res = await request('POST', '/auth/login', { username: USERNAME, password: 'mal-password' }, false);
      expect(!res.ok && res.status === 401, `Se esperaba 401 y vino ${res.status}`);
    }],
    ['Error asignar tarea sin stock', async () => {
      const res = await request('POST', '/tareas/asignar', {
        trabajador_id: trabajadorId,
        proceso: 'lavado',
        prendas: [{ prenda_id: prendaId, cantidad: 999999 }]
      });
      expect(!res.ok && res.status === 400, `Se esperaba 400 y vino ${res.status}`);
    }],
    ['Flujo feliz remojo', async () => {
      await ensureStock(prendaId, 'sucio', 5);
      const asignar = await request('POST', '/tareas/asignar', {
        trabajador_id: trabajadorId,
        proceso: 'remojo',
        prendas: [{ prenda_id: prendaId, cantidad: 2 }]
      });
      expect(asignar.ok, `No asigno remojo (${asignar.status})`);
      const tareaId = asignar.data && asignar.data.tareas && asignar.data.tareas[0] && asignar.data.tareas[0].id;
      expect(tareaId, 'No devolvio tarea creada');
      const completar = await request('PUT', `/tareas/${tareaId}/completar`, {});
      expect(completar.ok, `No completo tarea remojo (${completar.status})`);
    }],
    ['Error devolucion con condicion invalida', async () => {
      const res = await request('POST', '/procesos/devolver', {
        prenda_id: prendaId,
        cantidad: 1,
        condicion: 'mojado',
        departamento_id: departamentoId
      });
      expect(!res.ok && res.status === 400, `Se esperaba 400 y vino ${res.status}`);
    }],
    ['Flujo feliz pedido y entrega', async () => {
      const crear = await request('POST', '/pedidos', {
        departamento_id: departamentoId,
        observaciones: 'Pedido de prueba API',
        detalles: [{ prenda_id: prendaId, cantidad: 2 }]
      });
      expect(crear.ok, `No creo pedido (${crear.status})`);
      const pedidoId = crear.data && crear.data.id;
      expect(pedidoId, 'No devolvio id de pedido');

      const detalle = await request('GET', `/pedidos/${pedidoId}`);
      expect(detalle.ok, `No obtuvo pedido (${detalle.status})`);
      const detalleId = detalle.data && detalle.data.detalles && detalle.data.detalles[0] && detalle.data.detalles[0].id;
      expect(detalleId, 'Pedido sin detalle');

      const entregar = await request('PUT', `/pedidos/${pedidoId}/entregar`, {
        entregas: [{ detalle_id: detalleId, prenda_id: prendaId, cantidad_entregada: 2 }]
      });
      expect(entregar.ok, `No entrego pedido (${entregar.status})`);
    }],
    ['Error sobreentrega de pedido', async () => {
      const crear = await request('POST', '/pedidos', {
        departamento_id: departamentoId,
        observaciones: 'Pedido para error de sobreentrega',
        detalles: [{ prenda_id: prendaId, cantidad: 1 }]
      });
      expect(crear.ok, `No creo pedido (${crear.status})`);
      const pedidoId = crear.data.id;
      const detalle = await request('GET', `/pedidos/${pedidoId}`);
      const detalleId = detalle.data.detalles[0].id;
      const entregar = await request('PUT', `/pedidos/${pedidoId}/entregar`, {
        entregas: [{ detalle_id: detalleId, prenda_id: prendaId, cantidad_entregada: 2 }]
      });
      expect(!entregar.ok && entregar.status === 400, `Se esperaba 400 y vino ${entregar.status}`);
    }]
  ];

  for (const [name, fn] of cases) {
    total += 1;
    // eslint-disable-next-line no-await-in-loop
    const ok = await runCase(name, fn);
    if (ok) passed += 1;
  }

  console.log(`\nResultado: ${passed}/${total} casos aprobados`);
  if (passed !== total) process.exitCode = 1;
}

run().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
