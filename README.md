# 🧺 Sistema de Gestión de Lavandería Industrial

Sistema modular de gestión de lavandería construido con **Node.js**, **Express**, **SQLite** y arquitectura por capas (**Rutas $\to$ Controladores $\to$ Servicios**), con interfaz optimizada para operarios móviles y tablets de planta (diseño industrial Stitch).

---

## 🚀 Inicio Rápido

### Requisitos previos
- **Node.js** (v16 o superior) - [nodejs.org](https://nodejs.org/)
- Navegador web moderno con soporte para PWA

### Pasos para iniciar

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Iniciar en modo desarrollo / producción**
   ```bash
   npm run dev
   # o bien:
   npm start
   ```

3. **Abrir en el navegador**
   - URL: **http://localhost:3100**
   - Usuario administrador por defecto: `admin` / `admin`

4. **Ejecutar suite de pruebas de servicios**
   ```bash
   npm run test:services
   ```

---

## 🏗️ Arquitectura del Proyecto

```
├── public/                     # Frontend modular nativo (sin bundlers)
│   ├── css/
│   │   ├── main.css            # Estilos base, layout, cards, tablas y alertas
│   │   ├── modals.css          # Estilos de diálogos y overlays
│   │   └── mobile.css          # Sistema responsive, Bottom Nav y Bottom Sheets
│   ├── js/
│   │   ├── core/               # Núcleo (state.js, api.js, ui.js)
│   │   ├── modules/            # Módulos desacoplados (auth, tareas, pedidos, etc.)
│   │   └── app.js              # Inicialización y ciclo de vida
│   ├── index.html              # Shell HTML semántico y ligero (1,144 líneas)
│   ├── sw.js                   # Service Worker PWA con caché v4
│   └── manifest.webmanifest    # Manifiesto de aplicación web instalable
│
├── src/                        # Backend modular por capas
│   ├── config/
│   │   └── database.js         # Conexión e inicialización de SQLite
│   ├── controllers/            # Controladores HTTP (12 módulos)
│   ├── services/               # Lógica de negocio pura (12 módulos)
│   ├── routes/                 # Enrutadores delegadores delgados
│   ├── middleware/             # Auth JWT, error-handler, async-handler
│   ├── utils/                  # Consultas asíncronas seguras (db-async.js)
│   └── server.js               # Servidor Express centralizado
│
├── scripts/
│   ├── init-db.js              # Sembrador inicial de base de datos
│   └── test-services.js        # Suite de pruebas automatizadas
│
├── lavanderia.db               # Base de datos SQLite activa
├── .env                        # Variables de entorno (PORT=3100, HOST=0.0.0.0)
└── package.json
```

---

## 📋 Módulos Principales

1. **Dashboard & KPIs:** Telemetría en tiempo real de lotes en proceso, prendas limpias y urgencias.
2. **Procesos:** Seguimiento del flujo de lavado (Sucio $\to$ Remojo $\to$ Lavado $\to$ Tendido $\to$ Recogido $\to$ Planchado $\to$ Stock).
3. **Tareas Operativas:** Creación, asignación de trabajadores de planta y registro de tiempos.
4. **Pedidos & Despacho:** Carrito de requisiciones por departamento, control de stock y confirmación de entrega.
5. **Devoluciones:** Registro y trazabilidad de prendas devueltas o reprocesadas.
6. **Lavandería Externa:** Control de lotes enviados a maquila externa, fechas de retorno y costos.
7. **Catálogos & Configuración:** Administración de Prendas, Trabajadores, Departamentos y Usuarios con roles.
8. **Reportes:** Exportación de resúmenes operativos por período, trabajador y departamento.
9. **Experiencia Móvil:** Barra inferior fija ergonómica para el pulgar (**Bottom Navigation Bar**) y paneles deslizables (**Bottom Sheets**).
