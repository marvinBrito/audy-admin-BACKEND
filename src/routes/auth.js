const express = require('express');
const soloAdminMaestro = require('../middleware/authAdmin');

const router = express.Router();

// POST /auth/verificar-admin
// Header: Authorization: Bearer <token de Supabase Auth>
// El middleware soloAdminMaestro hace todo el trabajo real:
//   - valida el token con Supabase Auth
//   - busca el perfil ligado a esa cuenta
//   - exige que esté activo, sea admin y sea el admin maestro
// Si algo no coincide, el middleware responde 401/403 y esta ruta ni se ejecuta.
router.post('/verificar-admin', soloAdminMaestro, (req, res) => {
  res.status(200).json({ ok: true, email: req.adminMaestro.email });
});

module.exports = router;
