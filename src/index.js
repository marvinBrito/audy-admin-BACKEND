require('dotenv').config();
const express = require('express');
const cors = require('cors');
const clientesRouter = require('./routes/clientes');
const authRouter = require('./routes/auth');

// Variables obligatorias. Si falta alguna, el servidor no arranca
// (mejor un fallo visible en Render que un panel que no funciona).
const VARIABLES_REQUERIDAS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const faltantes = VARIABLES_REQUERIDAS.filter((nombre) => !process.env[nombre]);
if (faltantes.length > 0) {
  console.error(`❌ Faltan variables de entorno: ${faltantes.join(', ')}`);
  process.exit(1);
}

const app = express();

// Solo el panel puede llamar a este backend desde un navegador.
// CORS_ORIGINS acepta varios orígenes separados por coma.
const origenesPermitidos = (
  process.env.CORS_ORIGINS || 'https://audy-admin-panel.vercel.app,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origenesPermitidos,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
);
app.use(express.json({ limit: '100kb' }));

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