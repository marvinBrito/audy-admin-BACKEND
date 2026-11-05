const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const supabaseAdmin = require('../services/supabaseAdmin');
const soloAdminMaestro = require('../middleware/authAdmin');

const router = express.Router();
// Límite de tamaño y de tipo: el archivo se lee completo en memoria.
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.xls', '.csv'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
      return cb(new Error('Solo se aceptan archivos .xlsx, .xls o .csv'));
    }
    cb(null, true);
  },
});

// Envuelve multer para devolver un 400 legible si el archivo no es válido.
function subirArchivo(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    const mensaje =
      err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite de 10 MB' : err.message;
    return res.status(400).json({ error: mensaje });
  });
}

// Columnas obligatorias que debe traer el Excel
const COLUMNAS_REQUERIDAS = ['codigo', 'descripcion', 'unidad_medida', 'bodega'];

// ── Helper: lee el archivo (xlsx/csv) y devuelve filas normalizadas ──
function parsearArchivo(file) {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(primeraHoja, { defval: '' });

  // Normalizamos encabezados a minúsculas para no depender de mayúsculas
  return filas.map((fila) => {
    const normalizada = {};
    for (const key of Object.keys(fila)) {
      normalizada[key.trim().toLowerCase()] = fila[key];
    }
    return normalizada;
  });
}

// ── Helper: inserta cada fila como producto vía la RPC insertar_producto_catalogo ──
// Usa el cliente del admin maestro (su token), no service_role: la función
// valida el permiso con auth.uid() a través de puede_gestionar_catalogo_cliente_v1.
async function insertarProductos(supabaseUsuario, sufijo, filasNormalizadas) {
  const resultados = { insertados: 0, fallidos: [] };

  for (const fila of filasNormalizadas) {
    const codigo = String(fila.codigo || '').trim();
    const descripcion = String(fila.descripcion || '').trim();
    const unidadMedida = String(fila.unidad_medida || '').trim();
    const detalle = String(fila.detalle || fila.DETALLE || '').trim().toUpperCase();
    const detalleFinal = detalle === 'NO EXISTE' ? 'NO EXISTE' : 'EXISTE';
    const bodegaCruda = String(fila.bodega || '').trim();

    if (!codigo || !descripcion || !unidadMedida || !bodegaCruda) {
      resultados.fallidos.push({ fila: codigo || '(sin código)', motivo: 'Campos vacíos' });
      continue;
    }

    // "1-2-3" -> ["1","2","3"], "GENERAL" -> ["GENERAL"]
    const bodegasSeleccionadas = bodegaCruda
      .split('-')
      .map((b) => b.trim())
      .filter(Boolean);

    const { error: errorInsert } = await supabaseUsuario.rpc('insertar_producto_catalogo', {
      p_sufijo: sufijo,
      p_codigo: codigo,
      p_descripcion: descripcion,
      p_unidad_medida: unidadMedida,
      p_detalle: detalleFinal,
      p_bodegas_seleccionadas: bodegasSeleccionadas,
    });

    if (errorInsert) {
      resultados.fallidos.push({ fila: codigo, motivo: errorInsert.message });
    } else {
      resultados.insertados++;
    }
  }

  return resultados;
}

// POST /clientes/crear
// Header: Authorization: Bearer <token>  -> sesión del admin maestro (middleware)
// FormData esperado:
//   archivo          -> el .xlsx, con nombre "Nombre Comercial_SUFIJO.xlsx"
// La sesión se valida ANTES de recibir el archivo.
router.post('/crear', soloAdminMaestro, subirArchivo, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    // ── PASO 1: Extraer nombre comercial y sufijo del nombre del archivo ──
    const nombreArchivo = path.parse(req.file.originalname).name; // sin extensión
    const partes = nombreArchivo.split('_');

    if (partes.length < 2) {
      return res.status(400).json({
        error: 'El nombre del archivo debe seguir el formato "Nombre Comercial_SUFIJO.xlsx"',
      });
    }

    const sufijo = partes[partes.length - 1].trim().toUpperCase();
    const nombreComercial = partes.slice(0, partes.length - 1).join('_').trim();

    if (!/^[A-Za-z0-9_]{1,50}$/.test(sufijo)) {
      return res.status(400).json({ error: `Sufijo inválido extraído del nombre: "${sufijo}"` });
    }
    if (!nombreComercial) {
      return res.status(400).json({ error: 'No se pudo extraer el nombre comercial del archivo' });
    }

    // ── PASO 2: Leer el Excel/CSV ──
    const filasNormalizadas = parsearArchivo(req.file);

    if (filasNormalizadas.length === 0) {
      return res.status(400).json({ error: 'El archivo no tiene filas de productos' });
    }

    const columnasEncontradas = Object.keys(filasNormalizadas[0]);
    const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !columnasEncontradas.includes(c));
    if (faltantes.length > 0) {
      return res.status(400).json({
        error: `Al archivo le faltan columnas obligatorias: ${faltantes.join(', ')}`,
      });
    }

    // ── PASO 3: Crear cliente + tablas (RPC transaccional en Postgres) ──
    const { data: idCliente, error: errorCrear } = await supabaseAdmin.rpc(
      'crear_cliente_completo',
      {
        p_nombre_comercial: nombreComercial,
        p_sufijo: sufijo,
      }
    );

    if (errorCrear) {
      console.error('Error creando cliente/tablas:', errorCrear);
      return res.status(400).json({ error: errorCrear.message });
    }

    // ── PASO 4: Insertar cada producto ──
    const resultados = await insertarProductos(req.supabaseUsuario, sufijo, filasNormalizadas);

    return res.status(200).json({
      mensaje: 'Cliente creado correctamente',
      cliente: { id: idCliente, nombre_comercial: nombreComercial, sufijo },
      productos: resultados,
    });
  } catch (e) {
    console.error('Error en /clientes/crear:', e);
    return res.status(500).json({ error: `Error interno: ${e.message}` });
  }
});

// POST /clientes/listar
// Header: Authorization: Bearer <token>
// Devuelve todos los clientes activos, para el selector de "Actualizar datos".
router.post('/listar', soloAdminMaestro, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('config_clientes')
      .select('id, nombre_comercial, sufijo')
      .eq('activo', true)
      .order('nombre_comercial', { ascending: true });

    if (error) {
      console.error('Error listando clientes:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ clientes: data });
  } catch (e) {
    console.error('Error en /clientes/listar:', e);
    return res.status(500).json({ error: `Error interno: ${e.message}` });
  }
});

// POST /clientes/actualizar
// Header: Authorization: Bearer <token>  -> sesión del admin maestro
// FormData esperado:
//   sufijo            -> el cliente ya existente elegido en el selector
//   archivo           -> el .xlsx/.csv con el catálogo nuevo completo
// Borra TODOS los registros de inventario y TODOS los productos de ese
// cliente, y los reemplaza por lo que traiga el archivo.
router.post('/actualizar', soloAdminMaestro, subirArchivo, async (req, res) => {
  try {
    const sufijo = String(req.body.sufijo || '').trim().toUpperCase();

    if (!sufijo) {
      return res.status(400).json({ error: 'Falta indicar el cliente (sufijo) a actualizar' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    // ── PASO 1: Leer el Excel/CSV ──
    const filasNormalizadas = parsearArchivo(req.file);

    if (filasNormalizadas.length === 0) {
      return res.status(400).json({ error: 'El archivo no tiene filas de productos' });
    }

    const columnasEncontradas = Object.keys(filasNormalizadas[0]);
    const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !columnasEncontradas.includes(c));
    if (faltantes.length > 0) {
      return res.status(400).json({
        error: `Al archivo le faltan columnas obligatorias: ${faltantes.join(', ')}`,
      });
    }

    // ── PASO 2: Vaciar inventario_registros_<sufijo> y productos_<sufijo> ──
    const { error: errorLimpiar } = await supabaseAdmin.rpc('limpiar_datos_cliente', {
      p_sufijo: sufijo,
    });

    if (errorLimpiar) {
      console.error('Error limpiando datos del cliente:', errorLimpiar);
      return res.status(400).json({ error: errorLimpiar.message });
    }

    // ── PASO 3: Insertar el catálogo nuevo ──
    const resultados = await insertarProductos(req.supabaseUsuario, sufijo, filasNormalizadas);

    return res.status(200).json({
      mensaje: 'Datos del cliente actualizados correctamente',
      cliente: { sufijo },
      productos: resultados,
    });
  } catch (e) {
    console.error('Error en /clientes/actualizar:', e);
    return res.status(500).json({ error: `Error interno: ${e.message}` });
  }
});

module.exports = router;