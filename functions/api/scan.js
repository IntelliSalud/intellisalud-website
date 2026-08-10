/**
 * POST /api/scan
 *
 * Recibe nombre + especialidad + ciudad, busca en la web, puntúa con la
 * rúbrica v1.0 y devuelve ÚNICAMENTE la dimensión 1.
 *
 * ► Las dimensiones 2–10 se calculan aquí y se guardan en D1, pero NUNCA
 *   salen en esta respuesta. Recortar del lado del servidor es lo único que
 *   sostiene los niveles del embudo: si viajan al navegador y solo se ocultan
 *   con CSS, cualquiera las lee abriendo las herramientas de desarrollo.
 */

import {
  validarNombre, validarEspecialidad, validarCiudad,
  claveCache, json, hashIP, generarToken,
  claveCampo, contarPerfilesCampo, mensajeCampo,
} from './_shared.js';

const MODELO = 'claude-haiku-4-5';
const CACHE_DIAS = 30;
const CAMPO_CACHE_DIAS = 7;  // un campo cambia más lento que un solo médico
const LIMITE_DIARIO = 5;   // escaneos con coste, por IP y día

/** La rúbrica v1.0, condensada para el modelo. */
const SISTEMA = `Eres el motor de puntuación del Índice de Visibilidad Médica de IntelliSalud.

Evalúas la VISIBILIDAD DIGITAL de un profesional de la salud a partir de resultados de búsqueda web. Nunca evalúas su calidad clínica ni su competencia profesional.

Diez dimensiones, 10 puntos cada una, todas con el mismo peso:
1. Visibilidad en buscadores — ¿aparece al buscar su especialidad y ciudad?
2. Visibilidad en asistentes de IA — ¿hay información corroborada que un asistente pueda citar?
3. Presencia en redes profesionales — LinkedIn, Instagram, Facebook: existencia, completitud, actividad.
4. Consistencia de identidad — ¿nombre, credenciales, dirección y teléfono coinciden entre fuentes?
5. Sitio web propio — ¿existe? ¿es suyo o de una clínica?
6. Perfil de Google Business — ficha, verificación, datos.
7. Datos estructurados — schema.org en su sitio.
8. Acceso para rastreadores de IA — robots.txt, contenido servido.
9. Directorios médicos y corroboración externa — Doctoralia y similares, menciones independientes.
10. Reseñas y contenido propio — reseñas, respuestas, artículos.

BANDAS: 0-3 ausente · 4-6 parcial · 7-10 sólido.
Si la evidencia no alcanza para decidir, usa banda "no_evaluable" y puntos 0.

REGLAS DE REDACCIÓN — obligatorias:
- Reporta lo que ENCONTRASTE, nunca afirmes que algo "no existe".
  Correcto: "No encontramos un sitio web propio asociado a su nombre en estos resultados."
  Incorrecto: "Usted no tiene sitio web."
- Nunca prometas posiciones ni resultados.
- Nunca sugieras generar reseñas: es contrario a las políticas de las plataformas.
- Nunca infieras calidad médica a partir del puntaje.
- Escribe en español, dirigiéndote al profesional de usted.
- Cada "evidencia" cita qué se encontró concretamente. Si no hallaste nada para una
  dimensión, dilo así y baja la confianza — no inventes.

IMPORTANTE: la ausencia de huella digital es un resultado válido y esperado.
Muchos profesionales excelentes tienen puntajes bajos. Puntúa con honestidad;
un puntaje bajo es información útil, no un error.

"puntaje_total" es la suma de los diez valores de "puntos".`;

/** Error con código corto para diagnóstico. El código sí se devuelve al
 *  cliente; el detalle solo se registra. Ningún secreto entra en ninguno. */
class FalloEtapa extends Error {
  constructor(codigo, detalle) {
    super(detalle);
    this.codigo = codigo;
  }
}

async function buscar(consulta, apiKey) {
  if (!apiKey) throw new FalloEtapa('busqueda_sin_clave', 'BRAVE_API_KEY no está definida');

  // Parámetros mínimos a propósito: los planes gratuitos de Brave rechazan
  // varios filtros opcionales, y un 422 por un parámetro que no necesitamos
  // es un fallo que cuesta tiempo encontrar.
  const url = 'https://api.search.brave.com/res/v1/web/search'
    + `?q=${encodeURIComponent(consulta)}&count=20`;

  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '');
    console.error('Brave', r.status, cuerpo.slice(0, 500));
    throw new FalloEtapa(`busqueda_${r.status}`, cuerpo.slice(0, 200));
  }

  const data = await r.json();
  return (data.web?.results || []).map((x) => ({
    titulo: x.title,
    url: x.url,
    extracto: x.description,
  }));
}

/**
 * Cuenta cuántos perfiles profesionales distintos son visibles hoy para
 * "especialidad en ciudad", SIN el nombre del médico — es la vara de
 * comparación de campo, no el escaneo de una persona. Cacheada aparte de
 * "scans" (ver CAMPO_CACHE_DIAS) para amortizar el costo entre todos los
 * médicos de esa especialidad+ciudad. Si Brave falla aquí, no se rompe el
 * escaneo principal: se devuelve null y el llamador simplemente omite el
 * dato de campo para esta respuesta.
 */
async function obtenerCampo(env, especialidad, ciudad) {
  const clave = claveCampo(especialidad, ciudad);

  const cache = await env.DB.prepare(
    `SELECT perfiles_visibles FROM campo_cache
      WHERE clave = ? AND creado_en > datetime('now', ?)`,
  ).bind(clave, `-${CAMPO_CACHE_DIAS} days`).first();

  if (cache) return cache.perfiles_visibles;

  let perfilesVisibles;
  try {
    const resultados = await buscar(`${especialidad} en ${ciudad} Ecuador`, env.BRAVE_API_KEY);
    perfilesVisibles = contarPerfilesCampo(resultados);
  } catch (e) {
    console.error('campo: búsqueda falló', e.codigo || e.message);
    return null;
  }

  await env.DB.prepare(
    `INSERT INTO campo_cache (clave, especialidad, ciudad, perfiles_visibles, creado_en)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT (clave) DO UPDATE SET perfiles_visibles = excluded.perfiles_visibles,
       creado_en = excluded.creado_en`,
  ).bind(clave, especialidad, ciudad, perfilesVisibles).run();

  return perfilesVisibles;
}

const ESQUEMA = {
  type: 'object',
  properties: {
    puntaje_total: { type: 'integer' },
    dimensiones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nombre: { type: 'string' },
          puntos: { type: 'integer' },
          banda: { type: 'string', enum: ['ausente', 'parcial', 'solido', 'no_evaluable'] },
          evidencia: { type: 'string' },
          recomendacion: { type: 'string' },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['id', 'nombre', 'puntos', 'banda', 'evidencia', 'recomendacion', 'confianza'],
        additionalProperties: false,
      },
    },
  },
  required: ['puntaje_total', 'dimensiones'],
  additionalProperties: false,
};

async function puntuar(nombre, especialidad, ciudad, resultados, apiKey) {
  if (!apiKey) throw new FalloEtapa('puntuacion_sin_clave', 'ANTHROPIC_API_KEY no está definida');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4000,
      system: SISTEMA,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{
        role: 'user',
        content: `Profesional: ${nombre}\nEspecialidad: ${especialidad}\nCiudad: ${ciudad}\n`
          + `Fecha: ${new Date().toISOString().slice(0, 10)}\n\n`
          + `Resultados de búsqueda (${resultados.length}):\n`
          + JSON.stringify(resultados, null, 1)
          + `\n\nPuntúa las diez dimensiones según la rúbrica.`,
      }],
    }),
  });

  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '');
    console.error('Anthropic', r.status, cuerpo.slice(0, 500));
    throw new FalloEtapa(`puntuacion_${r.status}`, cuerpo.slice(0, 200));
  }

  const data = await r.json();

  // Los clasificadores pueden declinar: hay que comprobarlo antes de leer content.
  if (data.stop_reason === 'refusal') {
    throw new FalloEtapa('puntuacion_rechazada', 'stop_reason=refusal');
  }

  const texto = data.content.find((b) => b.type === 'text')?.text;
  if (!texto) throw new FalloEtapa('puntuacion_vacia', JSON.stringify(data).slice(0, 200));

  try {
    return JSON.parse(texto);
  } catch (e) {
    console.error('JSON inválido', texto.slice(0, 500));
    throw new FalloEtapa('puntuacion_json', texto.slice(0, 200));
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let cuerpo;
  try { cuerpo = await request.json(); }
  catch { return json({ error: 'Solicitud inválida.' }, 400); }

  // ── Capa 0/1: validación de formato. Coste de un rechazo: cero. ──
  const v = validarNombre(cuerpo.nombre);
  if (!v.ok) return json({ error: v.motivo }, 400);
  if (!validarEspecialidad(cuerpo.especialidad)) {
    return json({ error: 'Selecciona una especialidad de la lista.' }, 400);
  }
  if (!validarCiudad(cuerpo.ciudad)) {
    return json({ error: 'Selecciona una ciudad de la lista.' }, 400);
  }

  const { nombre } = v;
  const especialidad = cuerpo.especialidad.trim();
  const ciudad = cuerpo.ciudad.trim();
  const clave = claveCache(nombre, especialidad, ciudad);

  // ── Capa 2: caché. Un reescaneo no vuelve a pagar. ──
  const cache = await env.DB.prepare(
    `SELECT id, puntaje_total, resultado FROM scans
      WHERE clave = ? AND creado_en > datetime('now', ?)
      ORDER BY creado_en DESC LIMIT 1`,
  ).bind(clave, `-${CACHE_DIAS} days`).first();

  let scanId, completo;

  if (cache) {
    // Un escaneo servido desde caché no cuesta nada, así que no consume cuota.
    scanId = cache.id;
    completo = JSON.parse(cache.resultado);
  } else {
    // ── Límite por IP: solo se aplica al camino que sí gasta dinero. ──
    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    const ipHash = await hashIP(ip);
    const hoy = new Date().toISOString().slice(0, 10);

    const usoActual = await env.DB.prepare(
      'SELECT conteo FROM limites WHERE ip_hash = ? AND dia = ?',
    ).bind(ipHash, hoy).first();

    if (usoActual && usoActual.conteo >= LIMITE_DIARIO) {
      return json({
        error: `Has alcanzado el máximo de ${LIMITE_DIARIO} análisis por día. `
          + 'Vuelve mañana, o escríbenos por WhatsApp si necesitas más.',
        codigo: 'limite_diario',
      }, 429);
    }

    // Se incrementa ANTES de gastar: si el escaneo falla después, la cuota ya
    // se consumió. Es lo correcto — si no, un fallo repetido permitiría
    // llamadas ilimitadas a las APIs de pago.
    await env.DB.prepare(
      `INSERT INTO limites (ip_hash, dia, conteo) VALUES (?, ?, 1)
       ON CONFLICT (ip_hash, dia) DO UPDATE SET conteo = conteo + 1`,
    ).bind(ipHash, hoy).run();

    // ── Capa 3: la búsqueda cuesta ~$0.001; la puntuación ~$0.007.
    //    Se busca primero para no pagar la cara si la barata no devuelve nada. ──
    let resultados;
    try {
      resultados = await buscar(`"${nombre}" ${especialidad} ${ciudad} Ecuador`, env.BRAVE_API_KEY);
    } catch (e) {
      return json({
        error: 'No pudimos completar la búsqueda. Intenta de nuevo en unos minutos.',
        codigo: e.codigo || 'busqueda_desconocido',
      }, 502);
    }

    // Cero resultados NO significa "no es médico": significa que es invisible,
    // que es justamente nuestro cliente. Se continúa y se puntúa bajo.
    try {
      completo = await puntuar(nombre, especialidad, ciudad, resultados, env.ANTHROPIC_API_KEY);
    } catch (e) {
      return json({
        error: 'No pudimos completar el análisis. Intenta de nuevo en unos minutos.',
        codigo: e.codigo || 'puntuacion_desconocido',
      }, 502);
    }

    const ins = await env.DB.prepare(
      `INSERT INTO scans (clave, nombre, especialidad, ciudad, puntaje_total, resultado, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(clave, nombre, especialidad, ciudad, completo.puntaje_total,
      JSON.stringify(completo)).run();
    scanId = ins.meta.last_row_id;
  }

  // ── Token de desbloqueo: es la única credencial que /api/unlock acepta
  //    para saber a qué escaneo se refiere. No basta con enviar el scan_id
  //    (es un entero autoincremental, adivinable por fuerza bruta) — sin este
  //    token, cualquiera podría iterar IDs y leer las dimensiones 3–4 de
  //    escaneos ajenos. Un escaneo cacheado que no tenga token aún (creado
  //    antes de este cambio) recibe uno la primera vez que se vuelve a pedir. ──
  let scanToken = (await env.DB.prepare(
    'SELECT token FROM scan_tokens WHERE scan_id = ?',
  ).bind(scanId).first())?.token;

  if (!scanToken) {
    // ON CONFLICT DO NOTHING por si dos peticiones concurrentes llegan aquí a
    // la vez para el mismo escaneo cacheado; la relectura evita devolver un
    // token que perdió la carrera y no quedó guardado.
    await env.DB.prepare(
      `INSERT INTO scan_tokens (scan_id, token, creado_en) VALUES (?, ?, datetime('now'))
       ON CONFLICT (scan_id) DO NOTHING`,
    ).bind(scanId, generarToken()).run();
    scanToken = (await env.DB.prepare(
      'SELECT token FROM scan_tokens WHERE scan_id = ?',
    ).bind(scanId).first()).token;
  }

  // ── Recorte del lado del servidor: solo dimensión 1. ──
  const libres = (completo.dimensiones || [])
    .filter((d) => d.id === 1)
    .map(({ id, nombre: n, puntos, banda, evidencia, recomendacion, confianza }) =>
      ({ id, nombre: n, puntos, banda, evidencia, recomendacion, confianza }));

  // ── Comparativa de campo: agregada, sin nombrar a nadie (ver _shared.js).
  //    Un fallo aquí no debe tumbar el escaneo — el médico ya pagó el costo
  //    de Brave+Haiku y está esperando su puntaje; el campo es un adicional. ──
  let campo = null;
  try {
    const dim1 = (completo.dimensiones || []).find((d) => d.id === 1);
    const perfilesVisibles = await obtenerCampo(env, especialidad, ciudad);
    if (perfilesVisibles !== null) {
      const apareceEnCampo = dim1 ? dim1.banda !== 'ausente' : false;
      campo = {
        perfiles_visibles: perfilesVisibles,
        apareces: apareceEnCampo,
        mensaje: mensajeCampo({
          especialidad, ciudad, perfilesVisibles, apareceEnCampo,
        }),
      };
    }
  } catch (e) {
    console.error('campo: no se pudo anexar', e.message);
  }

  return json({
    scan_id: scanId,
    scan_token: scanToken,
    nombre,
    especialidad,
    ciudad,
    puntaje_total: completo.puntaje_total,
    dimensiones_evaluadas: (completo.dimensiones || []).length,
    dimensiones: libres,
    bloqueadas: 9,
    campo,
  });
}
