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

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
