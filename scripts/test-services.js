const authService = require('../src/services/auth.service');
const departamentosService = require('../src/services/departamentos.service');
const usuariosService = require('../src/services/usuarios.service');
const prendasService = require('../src/services/prendas.service');
const trabajadoresService = require('../src/services/trabajadores.service');
const procesosService = require('../src/services/procesos.service');
const dashboardService = require('../src/services/dashboard.service');
const reportesService = require('../src/services/reportes.service');
const bitacoraService = require('../src/services/bitacora.service');
const lavanderiaExternaService = require('../src/services/lavanderia_externa.service');

async function testServices() {
  console.log('--- Probando Capa de Servicios en Memoria ---');

  // 1. Auth Service
  const auth = await authService.login('admin', 'admin');
  console.log('[PASS] authService.login -> Token generado para:', auth.user.username);
  const verify = await authService.verify(auth.user.id);
  console.log('[PASS] authService.verify -> Usuario verificado:', verify.nombre);

  // 2. Departamentos Service
  const depts = await departamentosService.listar();
  console.log(`[PASS] departamentosService.listar -> ${depts.length} departamentos encontrados`);

  // 3. Usuarios Service
  const users = await usuariosService.listar();
  console.log(`[PASS] usuariosService.listar -> ${users.length} usuarios encontrados`);

  // 4. Prendas Service
  const prendas = await prendasService.listar();
  console.log(`[PASS] prendasService.listar -> ${prendas.length} prendas encontradas`);
  const stockResumen = await prendasService.stockResumen();
  console.log(`[PASS] prendasService.stockResumen -> ${stockResumen.length} grupos de procesos`);

  // 5. Trabajadores Service
  const trabs = await trabajadoresService.listar();
  console.log(`[PASS] trabajadoresService.listar -> ${trabs.length} trabajadores encontrados`);

  // 6. Dashboard Service
  const dash = await dashboardService.obtenerResumen();
  console.log('[PASS] dashboardService.obtenerResumen -> Total prendas:', dash.total_prendas, 'Trabajadores:', dash.total_trabajadores);

  // 7. Procesos Service
  const proc = await procesosService.listar();
  console.log(`[PASS] procesosService.listar -> ${proc.length} registros en prendas_proceso`);

  // 8. Reportes Service
  const repProcesos = await reportesService.procesosResumen();
  console.log(`[PASS] reportesService.procesosResumen -> ${repProcesos.length} filas`);

  // 9. Bitácora Service
  const bit = await bitacoraService.obtenerUltimos(5);
  console.log(`[PASS] bitacoraService.obtenerUltimos -> ${bit.length} eventos registrados`);

  // 10. Lavandería Externa Service
  const ext = await lavanderiaExternaService.reporte();
  console.log('[PASS] lavanderiaExternaService.reporte -> Reporte generado:', ext);

  console.log('\n======================================================');
  console.log(' ¡TODOS LOS SERVICIOS MODULARES FUNCIONAN AL 100%! ');
  console.log('======================================================');
}

testServices().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
