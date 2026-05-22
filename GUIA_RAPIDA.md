# GUIA RAPIDA - Sistema de Lavanderia

## Inicio

### Windows
1. Abre la carpeta del proyecto.
2. Ejecuta [iniciar.bat](c:/Users/samal/Documents/Lavanderia/iniciar.bat).
3. Abre `http://localhost:3000`.

### PowerShell o CMD
```powershell
cd c:\Users\samal\Documents\Lavanderia
npm.cmd install
npm.cmd start
```

## Estados de la ropa

El sistema trabaja con estos estados:

1. `Sucio`
2. `Remojo`
3. `Desmanche`
4. `Lavado`
5. `Reproceso`
6. `Tendido`
7. `Recogido`
8. `Limpio`
9. `Planchado`
10. `Stock`

Flujo normal:

`Sucio -> Remojo -> Desmanche/Lavado -> Tendido -> Recogido -> Limpio -> Planchado -> Stock`

Si la prenda no se plancha:

`Limpio -> Stock`

Si se manda a reproceso:

`Recogido/Limpio -> Reproceso -> Remojo -> Lavado`

## Que ya maneja el sistema

- CRUD de `prendas`
- CRUD de `areas`
- CRUD de `bodegas`
- CRUD de `usuarios`
- CRUD de `trabajadores`
- CRUD de `estados o tareas`
- Precios por `prenda + estado`
- Doble precio por trabajador: `factura` y `no factura`
- Inventario por estado dentro de lavanderia
- Inventario por bodega
- Pedido por usuario solicitante con bodega asignada
- Devolucion de prendas desde bodega
- Envio a lavanderia externa y retorno
- Edicion y eliminacion de asignaciones con codigo de autorizacion
- Reportes base de asignaciones, tareas, inventario, pedidos, existencias y rendimiento

## Logica operativa actual

### 1. Asignacion de tareas

Cuando asignas una tarea:

- La cantidad se descuenta del `estado origen`
- La cantidad se suma al `estado destino`
- Se registra `trabajador`
- Se calcula `precio unitario` y `precio total`

Ejemplos:

- `Remojo` resta de `Sucio`
- `Lavado` resta de `Remojo`
- `Tendido` resta de `Lavado`
- `Recogido` resta de `Tendido`
- `Planchado` resta de `Limpio`
- `Stock` recibe prendas listas para despacho

### 2. Reproceso

Si una prenda necesita reproceso:

- se mueve a `Reproceso`
- luego vuelve a `Remojo` y `Lavado`
- esas repeticiones quedan con pago `0` segun la cola de reproceso

### 3. Desmanche

Si una prenda esta muy sucia:

- puedes mandarla a `Desmanche`
- el sistema descuenta del estado donde se encontraba
- luego puedes continuar con el siguiente flujo

### 4. Prenda que no se plancha

La prenda tiene un atributo `no_planchar`.

Cuando esa prenda pasa por `Limpio`, el avance rapido la manda a `Stock` sin pasar por `Planchado`.

### 5. Pedidos

Cada usuario:

- tiene `usuario y contrasena`
- tiene una `bodega asignada`
- puede crear pedidos con fecha, horario, observaciones y cantidades

Cuando el pedido se despacha:

- se descuenta del estado `Stock` de lavanderia
- se suma al inventario de la `bodega` del usuario

### 6. Devoluciones y externa

Cuando una bodega devuelve ropa:

- se descuenta de la bodega
- se ingresa a lavanderia en el estado que indiques: `Sucio` o `Limpio`

Cuando envias a lavanderia externa:

- se descuenta del estado actual de lavanderia
- se suma a la bodega externa

Cuando regresa:

- se descuenta de la bodega externa
- se suma al estado que elijas, normalmente `Stock` o `Limpio`

### 7. Validacion de stock

El sistema no deja mover prendas si no existe suficiente cantidad en el estado anterior o en la bodega origen.

## Uso recomendado

### Catalogos
Primero registra:

1. `Areas`
2. `Bodegas`
3. `Trabajadores`
4. `Usuarios`
5. `Prendas`
6. `Precios`

### Operacion
Despues trabaja asi:

1. Ingresa prendas al estado `Sucio`
2. Asigna tareas manualmente o usa `avance rapido`
3. Revisa historial de asignaciones
4. Despacha pedidos desde `Stock`
5. Registra devoluciones o movimientos a externa

## Reportes disponibles

1. Asignaciones por dia, usuario, trabajador y prenda
2. Tareas realizadas con cantidad, precio unitario y precio total
3. Reversiones y cambios autorizados
4. Prendas segun estado
5. Inventario general y stock
6. Pedidos realizados
7. Existencia por bodega
8. Rendimiento por trabajador

## Usuarios demo

- Usuario: `admin`
- Password: `admin`
- Codigo autorizacion demo: `1234`

## Nota importante

Lo mas estable es abrir siempre la app en:

`http://localhost:3000`

Si abres el `index.html` con Live Server en `127.0.0.1:5500`, el backend en `3000` debe estar encendido.
