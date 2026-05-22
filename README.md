# 🧺 Sistema de Gestión de Lavandería - Documento de Instalación

## Descripción del Sistema

Sistema moderno de gestión de lavandería construido con **Node.js**, **Express**, **Socket.io** y **SQLite**. Diseñado para:

- **Gestión de prendas** por estados (remojo, lavado, tendido, recogido, planchado, reproceso)
- **Asignación de personas** para cada tarea
- **Control de precios** por estado y tipo de prenda
- **Seguimiento en tiempo real** con Socket.io
- **Historial completo** de cada prenda
- **Dashboard de estadísticas** y costos

---

## 🚀 Instalación

### Requisitos previos
- **Node.js** (v14 o superior) - Descargar de https://nodejs.org/
- **Git** (opcional)
- Un navegador web moderno (Chrome, Firefox, Edge, Safari)

### Pasos de instalación

1. **Abrir PowerShell o CMD en la carpeta del proyecto**
   ```powershell
   cd c:\Users\samal\Documents\Lavanderia
   ```

2. **Instalar dependencias**
   ```powershell
   npm install
   ```
   
   Esto descargará e instalará:
   - express (servidor web)
   - socket.io (comunicación en tiempo real)
   - sqlite3 (base de datos)
   - cors (seguridad)
   - body-parser (pars de JSON)

3. **Iniciar el servidor**
   ```powershell
   npm start
   ```

   Deberías ver:
   ```
   ⏺️ Servidor de Lavandería ejecutándose en http://localhost:3000
   📊 Base de datos: C:\Users\samal\Documents\Lavanderia\lavanderia.db
   ```

4. **Abrir en navegador**
   - Ir a: **http://localhost:3000**
   - La base de datos se creará automáticamente en la primera ejecución

---

## 📋 Funcionalidades

### Dashboard
- Vista general de estados
- Cantidad de prendas en cada estado
- Costo acumulado por estado
- Total de costos

### Crear Prenda
- Tipo de prenda (Toalla de Playa, Sábana, Ropa de Cama, Uniforme)
- Descripción personalizada
- Cantidad
- Se registra automáticamente con precios configurados

### Prendas en Proceso
- Listar todas las prendas
- Filtrar por estado
- Ver detalles de la prenda
- Asignar tarea a persona
- Ver historial completo

### Personas
- Registrar trabajadores
- Teléfono y correo (opcionales)
- Lista de personas disponibles para asignar

### Estadísticas
- Tabla de costos por estado
- Cantidad de operaciones completadas
- Costo promedio por tarea

---

## 💰 Configuración de Precios

Los precios por defecto para "Toalla de Playa":

| Estado | Precio |
|--------|--------|
| Remojo | $0.10 |
| Lavado | $0.75 |
| Tendido | $0.00 |
| Recogido | $0.00 |
| Planchado | $0.50 |
| Reproceso | $0.25 |

**Para modificar precios**, edita en `backend/database.js` la sección de precios por defecto (líneas 51-56).

---

## 🔄 Flujo de Trabajo

1. **Crear Prenda**: Registra el tipo y cantidad de prendas
2. **Asignar a Remojo**: Selecciona persona, se asigna el precio ($0.10)
3. **Completar → Siguiente Estado**: 
   - Remojo → Lavado
   - Lavado → Tendido
   - Tendido → Recogido
   - Recogido → Planchado
   - Planchado → Completado o Reproceso

4. **Si está sucio**: Puede pasar a **Reproceso** ($0.25) y regresa a cualquier estado anterior

---

## 🗂️ Estructura del Proyecto

```
Lavanderia/
├── backend/
│   ├── server.js          (Servidor Express + Socket.io)
│   └── database.js        (Gestión de SQLite)
├── frontend/
│   ├── index.html         (Interfaz)
│   ├── css/
│   │   └── styles.css     (Estilos)
│   └── js/
│       └── app.js         (Lógica de cliente)
├── package.json           (Dependencias)
├── lavanderia.db          (Base de datos - se crea automáticamente)
└── README.md              (Este archivo)
```

---

## 🔇 Detener el servidor

- En PowerShell/CMD: Presiona **Ctrl + C**

---

## 🐛 Solución de Problemas

### "npm: No se reconoce el comando"
- Node.js no está instalado
- Solución: Descargar e instalar desde https://nodejs.org/

### "Error: EADDRINUSE :::3000"
- El puerto 3000 ya está en uso
- Solución: Cambiar puerto en `backend/server.js` línea 8

### "No puedo abrir http://localhost:3000"
- Verificar que el servidor está corriendo (ver el mensaje ⏺️)
- Esperar 2-3 segundos después de iniciar
- Probar en navegador diferente

### "Base de datos vacía"
- Es normal en la primera ejecución
- Crear una prenda para ver todas las funcionalidades

---

## 📝 APIs Disponibles

### GET `/api/prendas`
Obtiene todas gaseosas las prendas con su estado actual

### POST `/api/prendas`
Crea una nueva prenda

### POST `/api/asignar-tarea`
Asigna una persona a una tarea y cambia el estado

### POST `/api/completar-tarea`
Marca tarea como completada y avanza al siguiente estado

### GET `/api/personas`
Obtiene todas las personas registradas

### POST `/api/personas`
Crea una nueva persona

### GET `/api/prendas/:id/historial`
Obtiene el historial completo de una prenda

### GET `/api/estadisticas`
Obtiene estadísticas de costos

---

## 💡 Consejos de Uso

- **Registra personas primero**: Para que estén disponibles al asignar tareas
- **Usa descripciones claras**: En "Descripción" de prendas para identificarlas fácilmente
- **Revisa el historial**: Para auditar el proceso de una prenda
- **Dashboard actualiza en tiempo real**: Los datos se sincronizan automáticamente

---

## 📞 Notas Importantes

- La base de datos es local (SQLite), no requiere servidor externo
- Socket.io proporciona actualizaciones en tiempo real
- Los datos se guardan permanentemente en `lavanderia.db`
- Es seguro desconectar/reconectar clientes - los datos persisten

---

**Versión**: 1.0.0  
**Última actualización**: Abril 2026
