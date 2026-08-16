const express = require('express');
const soloAdminMaestro = require('../middleware/authAdmin');

const router = express.Router();

// POST /auth/verificar-admin
// Body: { email, password }
// El middleware soloAdminMaestro ya hace TODO el trabajo real:
//   - compara el email contra ADMIN_EMAIL_MAESTRO
//   - busca el usuario en Supabase
//   - compara el password en texto plano contra el hash con bcrypt.compare
// Si algo no coincide, el middleware responde 403 y esta ruta ni se ejecuta.
router.post('/verificar-admin', soloAdminMaestro, (req, res) => {
  res.status(200).json({ ok: true });
});

module.exports = router;