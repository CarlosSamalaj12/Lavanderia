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

app.use(cors());
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

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
