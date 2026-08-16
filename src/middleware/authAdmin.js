const bcrypt = require('bcrypt');
const supabaseAdmin = require('../services/supabaseAdmin');

// Valida que quien llama sea EXACTAMENTE el admin maestro.
// Espera en el body: { email, password }
// (Las mismas credenciales que Flutter guarda en SharedPreferences)
async function soloAdminMaestro(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    if (email.trim().toLowerCase() !== process.env.ADMIN_EMAIL_MAESTRO.toLowerCase()) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data: usuario, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, contrasena, rol, email')
      .ilike('email', email.trim())
      .maybeSingle();

    if (error || !usuario) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const passwordValida = await bcrypt.compare(password.trim(), usuario.contrasena);

    if (!passwordValida) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (usuario.rol?.toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Guardamos el usuario validado por si la ruta lo necesita
    req.adminMaestro = usuario;
    next();
  } catch (e) {
    console.error('Error en soloAdminMaestro:', e);
    return res.status(500).json({ error: 'Error validando credenciales' });
  }
}

module.exports = soloAdminMaestro;