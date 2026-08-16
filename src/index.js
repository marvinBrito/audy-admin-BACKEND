require('dotenv').config();
const express = require('express');
const cors = require('cors');
const clientesRouter = require('./routes/clientes');
const authRouter = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

// 🔍 [DEBUG] Log temporal: imprime TODA petición que llegue, sin excepción
app.use((req, res, next) => {
  console.log(`🔍 [DEBUG] Petición recibida → ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', servicio: 'audy-admin-backend' });
});

// Ruta de prueba: solo confirma que el servidor está vivo y respondiendo
app.get('/ping', (req, res) => {
  res.json({ mensaje: 'pong', hora: new Date().toISOString() });
});

app.use('/clientes', clientesRouter);
app.use('/auth', authRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});