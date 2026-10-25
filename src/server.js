require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const usuarioRoutes = require('./routes/usuarios');
const departamentoRoutes = require('./routes/departamentos');
const prendaRoutes = require('./routes/prendas');
const trabajadorRoutes = require('./routes/trabajadores');
const trabajadorInternoRoutes = require('./routes/trabajadores_internos');
const pedidoRoutes = require('./routes/pedidos');
const procesoRoutes = require('./routes/procesos');
const tareaRoutes = require('./routes/tareas');
const reporteRoutes = require('./routes/reportes');
const bitacoraRoutes = require('./routes/bitacora');
const dashboardRoutes = require('./routes/dashboard');
const lavanderiaExternaRoutes = require('./routes/lavanderia_externa');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();

const parseAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*');

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowAllOrigins) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Localhost o 127.0.0.1 en cualquier puerto
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Redes locales privadas (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    console.warn(`[CORS REJECTED] Origin no permitido: ${origin}`);
    callback(new Error(`Origin no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/departamentos', departamentoRoutes);
app.use('/api/prendas', prendaRoutes);
app.use('/api/trabajadores', trabajadorRoutes);
app.use('/api/trabajadores-internos', trabajadorInternoRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/procesos', procesoRoutes);
app.use('/api/tareas', tareaRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/lavanderia-externa', lavanderiaExternaRoutes);

app.get('/api', (req, res) => {
  res.json({ message: 'Sistema de Lavandería API', version: '1.0.0' });
});


app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lavanderia-backend' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'lavanderia-api' });
});
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
  });
}

module.exports = app;
