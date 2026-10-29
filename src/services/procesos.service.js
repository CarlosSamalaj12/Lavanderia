const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const PROCESOS = ['sucio', 'remojo', 'lavado', 'tendido', 'recogido', 'reproceso', 'limpio', 'planchado', 'desmanche', 'stock'];

const procesosService = {
  async listar() {
    const sql = `
      SELECT
        pp.id,
        pp.prenda_id,
        p.nombre as prenda_nombre,
        pp.proceso,
        pp.cantidad,
        pp.departamento_actual,
        d.nombre as departamento_nombre,
        pp.fecha_ingreso,
        pp.fecha_actualizacion
      FROM prendas_proceso pp
      JOIN prendas p ON pp.prenda_id = p.id
      LEFT JOIN departamentos d ON pp.departamento_actual = d.id
      ORDER BY pp.fecha_actualizacion DESC
    `;
    return await dbAsync.all(sql);
  },

  async porProceso(proceso) {
    if (!PROCESOS.includes(proceso)) {
      const err = new Error('Proceso inválido');
      err.status = 400;
      throw err;
    }

    const whereStock = proceso === 'stock' ? ' AND pp.departamento_actual IS NULL' : '';
    const sql = `
      SELECT
        pp.id,
        pp.prenda_id,
        p.nombre as prenda_nombre,
        p.descripcion as prenda_descripcion,
        pp.proceso,
        pp.cantidad,
        pp.fecha_ingreso,
        pp.fecha_actualizacion,
        pp.departamento_actual,
        d.nombre as departamento_nombre,
        u.nombre as usuario_ingreso
      FROM prendas_proceso pp
      JOIN prendas p ON pp.prenda_id = p.id
      LEFT JOIN departamentos d ON pp.departamento_actual = d.id
      LEFT JOIN usuarios u ON pp.usuario_registro = u.id
      WHERE pp.proceso = ?${whereStock}
      ORDER BY pp.fecha_ingreso DESC
    `;
    return await dbAsync.all(sql, [proceso]);
  },

  async verificarDisponibilidad({ prenda_id, cantidad, proceso_actual }) {
    const sql = `
      SELECT SUM(cantidad) as total
      FROM prendas_proceso
      WHERE prenda_id = ? AND proceso = ?
    `;
    const row = await dbAsync.get(sql, [prenda_id, proceso_actual]);
    const total = row ? row.total || 0 : 0;

    if (!total || total < cantidad) {
      return {
        disponible: false,
        cantidad_disponible: total,
        message: `Solo hay ${total} unidades en proceso ${proceso_actual}`
      };
    }

    return { disponible: true, cantidad_disponible: total };
  },

  async mover({ registro_id, proceso_destino, departamento_destino }, userId) {
    if (!registro_id || !proceso_destino) {
      const err = new Error('Registro y proceso destino requeridos');
      err.status = 400;
      throw err;
    }

    const registro = await dbAsync.get('SELECT * FROM prendas_proceso WHERE id = ?', [registro_id]);
    if (!registro) {
      const err = new Error('Registro no encontrado');
      err.status = 404;
      throw err;
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'MOVER_PROCESO',
      tablaAfectada: 'prendas_proceso',
      registroId: registro_id,
      datosAnteriores: { proceso: registro.proceso, cantidad: registro.cantidad },
      datosNuevos: { proceso: proceso_destino, cantidad: registro.cantidad, departamento_destino }
    });

    const updateSql = `
      UPDATE prendas_proceso
      SET proceso = ?, departamento_actual = ?, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await dbAsync.run(updateSql, [proceso_destino, departamento_destino || null, registro_id]);

    return { message: `Prenda movida a ${proceso_destino}` };
  },

  async ingresar({ prenda_id, cantidad, proceso, departamento_origen, estado_prenda }, userId, rawBody) {
    if (!prenda_id || !cantidad || !proceso) {
      const err = new Error('Prenda, cantidad y proceso requeridos');
      err.status = 400;
      throw err;
    }

    const procesoAsignar = PROCESOS.includes(proceso) ? proceso : (estado_prenda === 'limpio' ? 'limpio' : 'sucio');
    const sql = `
      INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
      VALUES (?, ?, ?, ?, ?)
    `;

    const result = await dbAsync.run(sql, [prenda_id, procesoAsignar, cantidad, departamento_origen || null, userId]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'INGRESAR',
      tablaAfectada: 'prendas_proceso',
      registroId: result.lastID,
      datosNuevos: rawBody
    });

    return { id: result.lastID, message: `Prenda ingresada a ${procesoAsignar}` };
  },

  async revertir({ registro_id, proceso_anterior }, userId) {
    if (!registro_id || !proceso_anterior) {
      const err = new Error('Registro y proceso anterior requeridos');
      err.status = 400;
      throw err;
    }

    const registro = await dbAsync.get('SELECT * FROM prendas_proceso WHERE id = ?', [registro_id]);
    if (!registro) {
      const err = new Error('Registro no encontrado');
      err.status = 404;
      throw err;
    }

    const sql = `
      UPDATE prendas_proceso
      SET proceso = ?, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await dbAsync.run(sql, [proceso_anterior, registro_id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'REVERTIR',
      tablaAfectada: 'prendas_proceso',
      registroId: registro_id,
      datosAnteriores: { proceso: registro.proceso }
    });

    return { message: `Prenda revertida a ${proceso_anterior}` };
  },

  async eliminar(id, userId) {
    const registro = await dbAsync.get('SELECT * FROM prendas_proceso WHERE id = ?', [id]);
    if (!registro) {
      const err = new Error('Registro no encontrado');
      err.status = 404;
      throw err;
    }

    await dbAsync.run('DELETE FROM prendas_proceso WHERE id = ?', [id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ELIMINAR',
      tablaAfectada: 'prendas_proceso',
      registroId: id,
      datosAnteriores: registro
    });

    return { message: 'Registro eliminado' };
  },

  async devolver({ prenda_id, cantidad, condicion, departamento_id, motivo }, userId) {
    if (!prenda_id || !cantidad || !condicion || !departamento_id) {
      const err = new Error('Datos requeridos');
      err.status = 400;
      throw err;
    }

    if (!['limpio', 'sucio'].includes(condicion)) {
      const err = new Error('La condicion debe ser limpio o sucio');
      err.status = 400;
      throw err;
    }

    if (cantidad <= 0) {
      const err = new Error('La cantidad debe ser mayor a 0');
      err.status = 400;
      throw err;
    }

    const procesoDestino = condicion === 'limpio' ? 'stock' : 'sucio';
    const checkSql = `
      SELECT id, cantidad FROM prendas_proceso 
      WHERE prenda_id = ? AND proceso = 'stock' AND departamento_actual = ?
    `;
    const stock = await dbAsync.get(checkSql, [prenda_id, departamento_id]);

    if (!stock || stock.cantidad < cantidad) {
      const err = new Error('Stock insuficiente para devolver');
      err.status = 400;
      throw err;
    }

    const nuevaCantidad = stock.cantidad - cantidad;
    if (nuevaCantidad > 0) {
      await dbAsync.run(
        'UPDATE prendas_proceso SET cantidad = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [nuevaCantidad, stock.id]
      );
    } else {
      await dbAsync.run('DELETE FROM prendas_proceso WHERE id = ?', [stock.id]);
    }

    const destinoExistente = await dbAsync.get(
      'SELECT id FROM prendas_proceso WHERE prenda_id = ? AND proceso = ? AND departamento_actual = ? ORDER BY id ASC LIMIT 1',
      [prenda_id, procesoDestino, departamento_id]
    );

    if (destinoExistente) {
      await dbAsync.run(
        'UPDATE prendas_proceso SET cantidad = cantidad + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [cantidad, destinoExistente.id]
      );
    } else {
      const insertSql = `
        INSERT INTO prendas_proceso (prenda_id, proceso, cantidad, departamento_actual, usuario_registro)
        VALUES (?, ?, ?, ?, ?)
      `;
      await dbAsync.run(insertSql, [prenda_id, procesoDestino, cantidad, departamento_id, userId]);
    }

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'DEVOLVER',
      tablaAfectada: 'prendas_proceso',
      registroId: null,
      datosNuevos: {
        prenda_id,
        cantidad,
        condicion,
        departamento_id,
        proceso_destino: procesoDestino,
        motivo: motivo || null,
        responsable: userId,
        fecha: new Date().toISOString()
      }
    });

    return { message: `Prendas devueltas como ${condicion}` };
  },

  async stockDepartamento(departamento_id) {
    const sql = `
      SELECT pp.prenda_id, p.nombre as prenda_nombre, SUM(pp.cantidad) as cantidad
      FROM prendas_proceso pp
      JOIN prendas p ON pp.prenda_id = p.id
      WHERE pp.departamento_actual = ? AND pp.proceso = 'stock'
      GROUP BY pp.prenda_id, p.nombre
    `;
    return await dbAsync.all(sql, [departamento_id]);
  },

  async obtenerTableroKanban() {
    const PROCESOS_LISTA = ['sucio', 'remojo', 'lavado', 'tendido', 'recogido', 'reproceso', 'limpio', 'planchado', 'desmanche', 'stock'];
    const sql = `
      SELECT
        pp.id as registro_id,
        pp.prenda_id,
        p.nombre as prenda_nombre,
        p.descripcion as prenda_descripcion,
        p.requiere_plancha,
        pp.proceso,
        pp.cantidad,
        pp.fecha_ingreso,
        pp.fecha_actualizacion,
        pp.departamento_actual,
        d.nombre as departamento_nombre,
        u.nombre as usuario_nombre,
        t.id as tarea_id,
        t.trabajador_id,
        tr.nombre as trabajador_nombre,
        t.precio_unitario,
        t.total as total_pago,
        t.estado as tarea_estado
      FROM prendas_proceso pp
      JOIN prendas p ON pp.prenda_id = p.id
      LEFT JOIN departamentos d ON pp.departamento_actual = d.id
      LEFT JOIN usuarios u ON pp.usuario_registro = u.id
      LEFT JOIN tareas t ON t.id = (
        SELECT id FROM tareas 
        WHERE prenda_id = pp.prenda_id AND proceso = pp.proceso AND estado IN ('asignada', 'en_proceso') 
        ORDER BY id DESC LIMIT 1
      )
      LEFT JOIN trabajadores tr ON t.trabajador_id = tr.id
      WHERE (pp.proceso != 'stock' OR pp.departamento_actual IS NULL)
      ORDER BY pp.fecha_actualizacion DESC
    `;
    const filas = await dbAsync.all(sql);

    const tablero = {};
    PROCESOS_LISTA.forEach(p => {
      tablero[p] = {
        proceso: p,
        total_prendas: 0,
        total_lotes: 0,
        lotes: []
      };
    });

    (filas || []).forEach(fila => {
      if (tablero[fila.proceso]) {
        tablero[fila.proceso].lotes.push(fila);
        tablero[fila.proceso].total_prendas += Number(fila.cantidad || 0);
        tablero[fila.proceso].total_lotes += 1;
      }
    });

    return tablero;
  }
};

module.exports = procesosService;
