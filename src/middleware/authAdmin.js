const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = require('../services/supabaseAdmin');

// Valida que quien llama sea el admin maestro, usando la sesión de Supabase Auth.
//
// El panel manda el access token de Supabase en el header:
//   Authorization: Bearer <token>
// Ya no viajan correo ni contraseña en ninguna petición.
//
// Comprobaciones, en orden:
//   1. El token es válido y no venció (lo verifica Supabase Auth).
//   2. Existe un perfil en public.usuarios ligado a esa cuenta Auth.
//   3. El perfil está activo, es admin y es el admin maestro.
async function soloAdminMaestro(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const token = match ? match[1].trim() : '';

    if (!token) {
      return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'La sesión no es válida o venció. Vuelve a iniciar sesión.' });
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, rol, es_admin_maestro, activo')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();

    if (perfilError) {
      console.error('Error leyendo el perfil del admin:', perfilError.message);
      return res.status(500).json({ error: 'No se pudo validar la cuenta.' });
    }

    const esMaestro =
      perfil &&
      perfil.activo !== false &&
      perfil.es_admin_maestro === true &&
      String(perfil.rol || '').toLowerCase() === 'admin';

    // Capa extra opcional: si ADMIN_EMAIL_MAESTRO está configurado, también debe coincidir.
    const emailEsperado = (process.env.ADMIN_EMAIL_MAESTRO || '').trim().toLowerCase();
    const emailCoincide =
      !emailEsperado || String(perfil?.email || '').trim().toLowerCase() === emailEsperado;

    if (!esMaestro || !emailCoincide) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    req.adminMaestro = perfil;

    // Cliente que actúa COMO el admin maestro (no como service_role).
    // Se usa para las RPC que validan permisos con auth.uid(), como
    // insertar_producto_catalogo; así la base aplica sus propias reglas.
    req.supabaseUsuario = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    next();
  } catch (e) {
    console.error('Error en soloAdminMaestro:', e);
    return res.status(500).json({ error: 'Error validando la sesión' });
  }
}

module.exports = soloAdminMaestro;
