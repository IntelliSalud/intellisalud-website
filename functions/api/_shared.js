/**
 * Validación y datos compartidos entre /api/scan y /api/unlock.
 *
 * Archivos que empiezan con "_" no se enrutan como endpoints en Pages
 * Functions, así que este módulo no queda expuesto públicamente.
 */

/** Especialidades aceptadas. El formulario las presenta como lista desplegable:
 *  eso elimina la mayor parte del ruido antes de gastar un solo centavo. */
export const ESPECIALIDADES = [
  'Medicina General', 'Medicina Interna', 'Medicina Familiar',
  'Ginecología y Obstetricia', 'Pediatría', 'Cardiología', 'Dermatología',
  'Traumatología', 'Oftalmología', 'Otorrinolaringología', 'Neurología',
  'Psiquiatría', 'Endocrinología', 'Gastroenterología', 'Urología',
  'Nefrología', 'Neumología', 'Oncología', 'Cirugía General',
  'Cirugía Plástica', 'Anestesiología', 'Reumatología', 'Hematología',
  'Infectología', 'Geriatría', 'Fisiatría', 'Nutrición', 'Odontología',
];

/** Ciudades del Ecuador con consultorios médicos de volumen relevante. */
export const CIUDADES = [
  'Guayaquil', 'Quito', 'Cuenca', 'Santo Domingo', 'Machala', 'Durán',
  'Manta', 'Portoviejo', 'Loja', 'Ambato', 'Esmeraldas', 'Quevedo',
  'Riobamba', 'Milagro', 'Ibarra', 'Babahoyo', 'Latacunga', 'Tulcán',
  'Daule', 'Samborondón', 'Salinas', 'La Libertad', 'Playas',
];

/** Patrones de relleno típicos de una prueba o de un bot. */
const BASURA = [
  'test', 'prueba', 'asdf', 'qwerty', 'aaaa', 'xxxx', 'nombre',
  'ejemplo', 'sample', 'foo', 'bar', 'lorem', 'ipsum', 'admin', 'null',
  'undefined', 'doctor doctor', 'nose', 'nada',
];

/** Honoríficos que se aceptan al escribir pero se retiran antes de buscar. */
const HONORIFICOS = /^(dr|dra|doctor|doctora|lic|licda|md|prof)\.?\s+/i;

export function limpiarNombre(entrada) {
  let n = String(entrada || '').trim().replace(/\s+/g, ' ');
  // Puede venir con más de un honorífico ("Dra. Dra. X" al pegar texto).
  while (HONORIFICOS.test(n)) n = n.replace(HONORIFICOS, '');
  return n.trim();
}

/**
 * Valida el nombre SIN juzgar la huella digital del profesional.
 *
 * Esta distinción es la que sostiene el negocio: un médico con presencia
 * casi nula es exactamente el cliente que buscamos — su puntaje bajo es el
 * producto. Aquí solo se rechaza una entrada que no parece un nombre de
 * persona. Nunca se rechaza a alguien por tener poca visibilidad.
 */
export function validarNombre(entrada) {
  const nombre = limpiarNombre(entrada);

  if (nombre.length < 4 || nombre.length > 80) {
    return { ok: false, motivo: 'Escribe tu nombre profesional completo.' };
  }
  if (/\d/.test(nombre)) {
    return { ok: false, motivo: 'El nombre no puede contener números.' };
  }
  // Letras (con tildes y ñ), espacios, guiones y apóstrofes. Nada más.
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(nombre)) {
    return { ok: false, motivo: 'El nombre solo puede contener letras.' };
  }

  const partes = nombre.split(' ').filter((p) => p.length > 1);
  if (partes.length < 2) {
    return {
      ok: false,
      motivo: 'Necesitamos nombre y apellido para poder buscarte.',
    };
  }

  const minus = nombre.toLowerCase();
  if (BASURA.some((b) => minus.includes(b))) {
    return { ok: false, motivo: 'Escribe tu nombre profesional real.' };
  }
  // "aaa", "bbbb": la misma letra repetida cuatro o más veces.
  if (/(.)\1{3,}/.test(minus)) {
    return { ok: false, motivo: 'Escribe tu nombre profesional real.' };
  }

  return { ok: true, nombre };
}

export function validarEspecialidad(v) {
  return ESPECIALIDADES.includes(String(v || '').trim());
}

export function validarCiudad(v) {
  return CIUDADES.includes(String(v || '').trim());
}

/** Clave de caché: misma persona = mismo escaneo, sin volver a pagar. */
export function claveCache(nombre, especialidad, ciudad) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita tildes
      .replace(/[^a-z ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(nombre)}|${norm(especialidad)}|${norm(ciudad)}`;
}

/** El _headers del proyecto NO se aplica a las respuestas de Pages
 *  Functions (es un comportamiento documentado de Cloudflare, no un
 *  descuido): cualquier cabecera para /api/* tiene que fijarse aquí, en el
 *  código de la Function. */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://intellisalud.com',
    },
  });
}

/**
 * Hash de la IP. Nunca se guarda la dirección en claro: una IP es dato
 * personal bajo la LOPDP, y para contar peticiones el hash sirve igual.
 * Compartido entre /api/scan y /api/unlock: ambos limitan por IP y día.
 */
export async function hashIP(ip) {
  const datos = new TextEncoder().encode(`intellisalud:${ip}`);
  const buf = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(buf)].slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 128 bits de aleatoriedad criptográfica, en hex. Mismo formato que el
 *  token de /informe/<token>: suficiente para no ser adivinable. */
export function generarToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ── Comparativa de campo (agregada, sin nombrar a nadie) ──
 *
 * Deliberadamente NO identifica médicos rivales por nombre ni les asigna un
 * puntaje: eso exigiría auto-scrapear y perfilar a terceros que nunca dieron
 * su consentimiento, con el mismo motor de inferencia (Haiku sobre snippets)
 * que ya sabemos que se equivoca a veces. Lo que sí es seguro de mostrar:
 * cuántos perfiles profesionales *distintos* aparecen en una búsqueda real
 * para la especialidad+ciudad, y si el propio perfil del médico está entre
 * ellos. Es evidencia real, agregada, no atribuible a una persona.
 */

/** Clave de caché para la búsqueda de campo: no lleva nombre, es por
 *  especialidad+ciudad, así que el costo se amortiza entre todos los
 *  médicos que compartan esa combinación. */
export function claveCampo(especialidad, ciudad) {
  const norm = (s) =>
    String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return `${norm(especialidad)}|${norm(ciudad)}`;
}

/** Dominios que no cuentan como "un perfil profesional más": directorios
 *  (agregan muchos médicos bajo un solo dominio, contarían de menos) y redes
 *  sociales/genéricos (no son un perfil dedicado). Lista deliberadamente
 *  corta y conservadora — mejor subcontar que sobrecontar. */
const DOMINIOS_EXCLUIDOS_CAMPO = new Set([
  'doctoralia.com', 'doctoralia.com.ec', 'doctoranytime.ec', 'doctoranytime.com',
  'medicos.com.ec', 'medicos-ecuador.com', 'citamedica.ec', 'ecuamedical.com',
  'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'twitter.com',
  'x.com', 'tiktok.com', 'wikipedia.org', 'wa.me', 'whatsapp.com',
  'google.com', 'maps.google.com', 'goo.gl',
]);

function raizDominio(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const partes = h.split('.');
    return partes.length > 2 ? partes.slice(-2).join('.') : h;
  } catch {
    return null;
  }
}

/** Cuenta dominios distintos, no-directorio, en una lista de resultados de
 *  búsqueda de campo (sin nombre). Es una cota inferior a propósito: cuenta
 *  "al menos N", nunca pretende ser el total real de médicos visibles. */
export function contarPerfilesCampo(resultados) {
  const dominios = new Set();
  for (const r of resultados || []) {
    const d = raizDominio(r.url);
    if (d && !DOMINIOS_EXCLUIDOS_CAMPO.has(d)) dominios.add(d);
  }
  return dominios.size;
}

/** Mensaje de campo para el escaneo gratuito (nivel 1), en texto plano — sin
 *  comillas alrededor de especialidad/ciudad (no aportan nada y rompen la
 *  lectura), cifra real, sin nombrar a nadie, sin prometer una posición
 *  exacta ("al menos N"). Es el texto que viaja en el JSON de /api/scan;
 *  la página web lo re-renderiza con negrita (ver visibilidad.html) porque
 *  este valor es texto plano, no HTML. */
export function mensajeCampo({ especialidad, ciudad, perfilesVisibles, apareceEnCampo }) {
  if (perfilesVisibles <= 0) {
    return `Para ${especialidad} en ${ciudad} no identificamos otros perfiles `
      + 'profesionales claramente visibles en esta búsqueda — es un campo con poca '
      + 'competencia digital todavía.';
  }
  if (apareceEnCampo) {
    return `Para ${especialidad} en ${ciudad} identificamos al menos `
      + `${perfilesVisibles} perfiles profesionales visibles en los resultados de `
      + 'búsqueda. El suyo es uno de ellos, pero no el único.';
  }
  return `Para ${especialidad} en ${ciudad} identificamos al menos `
    + `${perfilesVisibles} perfiles profesionales visibles en los resultados de `
    + 'búsqueda. Hoy, el suyo no está entre ellos.';
}

/** Resume las diez dimensiones ya calculadas (no cuesta una sola llamada
 *  adicional: viven en D1 desde /api/scan) en sólidas vs. con oportunidad. */
export function resumenDimensiones(dimensiones) {
  const solidas = (dimensiones || []).filter((d) => d.banda === 'solido').length;
  const total = (dimensiones || []).length || 10;
  return { solidas, oportunidades: total - solidas, total };
}

/**
 * Mensaje del nivel 2 (tras desbloquear). Regla dura: nunca afirma qué hace
 * un competidor específico — no lo sabemos y afirmarlo sería fabricar. Solo
 * combina evidencia real ya calculada: el conteo agregado de áreas propias
 * con oportunidad, y el conteo agregado de campo (mismo dato del nivel 1).
 * La generalización ("estas áreas suelen estar resueltas en perfiles con
 * mejor visibilidad") describe la rúbrica, no una observación sobre una
 * persona concreta.
 */
export function mensajeDiagnostico({ especialidad, ciudad, solidas, oportunidades }) {
  if (oportunidades <= 0) {
    return 'Las diez áreas que evaluamos están sólidas. Lo que queda es mantenimiento '
      + 'y adelantarse a los cambios en cómo los pacientes buscan — para eso sirve el '
      + 'monitoreo continuo del reporte completo.';
  }
  return `De las diez áreas que evaluamos, hoy tiene ${solidas} sólidas y `
    + `${oportunidades} con oportunidad clara de mejora. En los perfiles con mejor `
    + `visibilidad dentro de ${especialidad} en ${ciudad}, estas son precisamente las `
    + 'áreas que suelen estar resueltas — es lo que marca la diferencia en quién '
    + 'aparece primero cuando un paciente busca. Si quiere ver exactamente cuáles son '
    + 'esas áreas y cómo cerrarlas, puede solicitar el reporte completo.';
}
