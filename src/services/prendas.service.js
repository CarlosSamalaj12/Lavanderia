const dbAsync = require('../utils/db-async');
const bitacoraService = require('./bitacora.service');

const prendasService = {
  async listar(q) {
    let sql, params;
    if (q) {
      sql = `
        SELECT p.*,
          (SELECT SUM(cantidad) FROM prendas_proceso WHERE prenda_id = p.id) as total_stock
        FROM prendas p
        WHERE p.activo = 1 AND p.nombre LIKE ?
        ORDER BY p.nombre
      `;
      params = [`%${q}%`];
    } else {
      sql = `
        SELECT p.*,
          (SELECT SUM(cantidad) FROM prendas_proceso WHERE prenda_id = p.id) as total_stock
        FROM prendas p
        WHERE p.activo = 1
        ORDER BY p.nombre
      `;
      params = [];
    }
    return await dbAsync.all(sql, params);
  },

  async stock() {
    const sql = `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        pr.proceso,
        COALESCE(SUM(pr.cantidad), 0) as cantidad,
        d.nombre as departamento_nombre
      FROM prendas p
      LEFT JOIN prendas_proceso pr ON p.id = pr.prenda_id
      LEFT JOIN departamentos d ON pr.departamento_actual = d.id
      WHERE p.activo = 1
      GROUP BY p.id, pr.proceso
      ORDER BY p.nombre, pr.proceso
    `;
    return await dbAsync.all(sql);
  },

  async stockResumen() {
    const sql = `
      SELECT
        proceso,
        SUM(cantidad) as cantidad
      FROM prendas_proceso
      WHERE proceso != 'stock' OR departamento_actual IS NULL
      GROUP BY proceso
    `;
    return await dbAsync.all(sql);
  },

  async disponibleDespacho() {
    const sql = `
      SELECT
        p.id as prenda_id,
        p.nombre as prenda,
        COALESCE(SUM(pp.cantidad), 0) as cantidad
      FROM prendas p
      LEFT JOIN prendas_proceso pp
        ON pp.prenda_id = p.id
        AND pp.proceso = 'stock'
        AND pp.departamento_actual IS NULL
      WHERE p.activo = 1
      GROUP BY p.id, p.nombre
      ORDER BY p.nombre
    `;
    return await dbAsync.all(sql);
  },

  async stockTrazabilidad(prendaId) {
    const sql = `
      SELECT 
        pp.proceso,
        pp.cantidad,
        pp.departamento_actual,
        COALESCE(d.nombre, 'Lavanderia') as departamento_nombre
      FROM prendas_proceso pp
      LEFT JOIN departamentos d ON pp.departamento_actual = d.id
      WHERE pp.prenda_id = ?
      ORDER BY pp.proceso
    `;
    return await dbAsync.all(sql, [prendaId]);
  },

  async crear(data, userId, rawBody) {
    const {
      nombre, descripcion,
      precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
      precio_tendido_factura, precio_recogido_factura,
      precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
      precio_tendido, precio_recogido,
      requiere_plancha
    } = data;

    if (!nombre) {
      const err = new Error('El nombre es requerido');
      err.status = 400;
      throw err;
    }

    const sql = `
      INSERT INTO prendas (nombre, descripcion, 
        precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
        precio_tendido_factura, precio_recogido_factura,
        precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
        precio_tendido, precio_recogido,
        requiere_plancha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await dbAsync.run(sql, [
      nombre, descripcion || null,
      precio_remojo_factura || 0, precio_lavado_factura || 0, precio_desmanche_factura || 0, precio_planchado_factura || 0,
      precio_tendido_factura || 0, precio_recogido_factura || 0,
      precio_remojo || 0, precio_lavado || 0, precio_desmanche || 0, precio_planchado || 0,
      precio_tendido || 0, precio_recogido || 0,
      requiere_plancha !== undefined ? requiere_plancha : 1
    ]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'CREAR',
      tablaAfectada: 'prendas',
      registroId: result.lastID,
      datosNuevos: rawBody
    });

    return { id: result.lastID, message: 'Prenda creada' };
  },

  async importar(prendas) {
    if (!Array.isArray(prendas) || !prendas.length) {
      const err = new Error('No se recibieron prendas para importar');
      err.status = 400;
      throw err;
    }

    let creadas = 0;
    let actualizadas = 0;
    let errores = 0;

    for (const item of prendas) {
      const nombre = String(item.nombre || '').trim();
      if (!nombre) {
        errores++;
        continue;
      }

      const descripcion = String(item.descripcion || '').trim();
      const requiere_plancha = Number(item.requiere_plancha) === 0 ? 0 : 1;
      const precio_remojo_factura = Number(item.precio_remojo_factura || 0);
      const precio_lavado_factura = Number(item.precio_lavado_factura || 0);
      const precio_desmanche_factura = Number(item.precio_desmanche_factura || 0);
      const precio_planchado_factura = Number(item.precio_planchado_factura || 0);
      const precio_remojo = Number(item.precio_remojo || 0);
      const precio_lavado = Number(item.precio_lavado || 0);
      const precio_desmanche = Number(item.precio_desmanche || 0);
      const precio_planchado = Number(item.precio_planchado || 0);

      try {
        const existente = await dbAsync.get('SELECT id FROM prendas WHERE LOWER(nombre) = LOWER(?)', [nombre]);

        if (existente) {
          const sqlUpd = `
            UPDATE prendas SET
              descripcion = ?,
              precio_remojo_factura = ?,
              precio_lavado_factura = ?,
              precio_desmanche_factura = ?,
              precio_planchado_factura = ?,
              precio_remojo = ?,
              precio_lavado = ?,
              precio_desmanche = ?,
              precio_planchado = ?,
              requiere_plancha = ?,
              activo = 1
            WHERE id = ?
          `;
          await dbAsync.run(sqlUpd, [
            descripcion || null,
            precio_remojo_factura,
            precio_lavado_factura,
            precio_desmanche_factura,
            precio_planchado_factura,
            precio_remojo,
            precio_lavado,
            precio_desmanche,
            precio_planchado,
            requiere_plancha,
            existente.id
          ]);
          actualizadas++;
        } else {
          const sqlIns = `
            INSERT INTO prendas (
              nombre, descripcion,
              precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
              precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
              requiere_plancha
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          await dbAsync.run(sqlIns, [
            nombre,
            descripcion || null,
            precio_remojo_factura,
            precio_lavado_factura,
            precio_desmanche_factura,
            precio_planchado_factura,
            precio_remojo,
            precio_lavado,
            precio_desmanche,
            precio_planchado,
            requiere_plancha
          ]);
          creadas++;
        }
      } catch (e) {
        errores++;
      }
    }

    return { message: 'Importacion completada', creadas, actualizadas, errores };
  },

  async actualizar(id, data, userId, rawBody) {
    const {
      nombre, descripcion,
      precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
      precio_tendido_factura, precio_recogido_factura,
      precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
      precio_tendido, precio_recogido,
      requiere_plancha, activo
    } = data;

    const sql = `
      UPDATE prendas SET
        nombre = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        precio_remojo_factura = COALESCE(?, precio_remojo_factura),
        precio_lavado_factura = COALESCE(?, precio_lavado_factura),
        precio_desmanche_factura = COALESCE(?, precio_desmanche_factura),
        precio_planchado_factura = COALESCE(?, precio_planchado_factura),
        precio_tendido_factura = COALESCE(?, precio_tendido_factura),
        precio_recogido_factura = COALESCE(?, precio_recogido_factura),
        precio_remojo = COALESCE(?, precio_remojo),
        precio_lavado = COALESCE(?, precio_lavado),
        precio_desmanche = COALESCE(?, precio_desmanche),
        precio_planchado = COALESCE(?, precio_planchado),
        precio_tendido = COALESCE(?, precio_tendido),
        precio_recogido = COALESCE(?, precio_recogido),
        requiere_plancha = COALESCE(?, requiere_plancha),
        activo = COALESCE(?, activo)
      WHERE id = ?
    `;

    await dbAsync.run(sql, [
      nombre, descripcion,
      precio_remojo_factura, precio_lavado_factura, precio_desmanche_factura, precio_planchado_factura,
      precio_tendido_factura, precio_recogido_factura,
      precio_remojo, precio_lavado, precio_desmanche, precio_planchado,
      precio_tendido, precio_recogido,
      requiere_plancha, activo, id
    ]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ACTUALIZAR',
      tablaAfectada: 'prendas',
      registroId: id,
      datosNuevos: rawBody
    });

    return { message: 'Prenda actualizada' };
  },

  async eliminar(id, userId) {
    await dbAsync.run('UPDATE prendas SET activo = 0 WHERE id = ?', [id]);

    await bitacoraService.registrar({
      usuarioId: userId,
      accion: 'ELIMINAR',
      tablaAfectada: 'prendas',
      registroId: id
    });

    return { message: 'Prenda desactivada' };
  }
};

module.exports = prendasService;
