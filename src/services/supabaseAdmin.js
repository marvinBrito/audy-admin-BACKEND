const { createClient } = require('@supabase/supabase-js');

// Este cliente usa la SERVICE_ROLE_KEY, NO la anon key.
// Con esta key se saltan las políticas RLS y se pueden crear tablas vía RPC.
// NUNCA exponer esta key al frontend ni a Flutter.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = supabaseAdmin;