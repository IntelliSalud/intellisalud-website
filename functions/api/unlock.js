/**
 * POST /api/unlock
 *
 * Recibe los datos del profesional, guarda el lead y devuelve las
 * dimensiones 2 y 3. Las dimensiones 4–10 siguen sin salir del servidor.
 *
 * ► El escaneo que se desbloquea NO se identifica por el scan_id que manda
 *   el cliente: ese id es un entero autoincremental y adivinarlo permitiría
 *   leer las dimensiones 3–4 de escaneos ajenos. La credencial real es
 *   scan_token, el valor de 128 bits que /api/scan entregó junto al
 *   resultado — igual de inadivinable que el token de /informe/<token>.
 */

import { validarNombre, json, hashIP, generarToken } from './_shared.js';
import { enviarInforme, notificarLead } from './_email.js';

const LIMITE_DIARIO = 10; // desbloqueos por IP y día — no cuestan API, pero sí frenan enumeración y correo abusivo

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  let cuerpo;
  try { cuerpo = await request.json(); }
  catch { return json({ error: 'Solicitud inválida.' }, 400); }

  const { scan_token, nombre, especialidad, lugar_trabajo, email,
    consentimiento_lopdp, es_titular } = cuerpo;

  // ── LOPDP: sin base legal no se guarda nada. ──
  if (consentimiento_lopdp !== true) {
    return json({ error: 'Necesitamos tu autorización para tratar tus datos.' }, 400);
  }
  if (es_titular !== true) {
    return json({ error: 'Confirma que eres este profesional o que cuentas con su autorización.' }, 400);
  }

  const v = validarNombre(nombre);
  if (!v.ok) return json({ error: v.motivo }, 400);

  const correo = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 120) {
    return json({ error: 'Escribe un correo electrónico válido.' }, 400);
  }
  const trabajo = String(lugar_trabajo || '').trim().slice(0, 160);
  if (trabajo.length < 2) {
    return json({ error: 'Indica dónde atiendes.' }, 400);
  }
  if (typeof scan_token !== 'string' || !/^[0-9a-f]{32}$/.test(scan_token)) {
    return json({ error: 'No encontramos ese análisis. Vuelve a buscar tu nombre.' }, 404);
  }

  // ── Límite por IP: independiente del de /api/scan. Este camino no gasta
  //    en Brave/Anthropic, pero sí envía un correo real y permite iterar
  //    tokens si alguien lo automatiza — hay que frenarlo igual. ──
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await hashIP(ip);
  const hoy = new Date().toISOString().slice(0, 10);

  const usoActual = await env.DB.prepare(
    'SELECT conteo FROM limites_unlock WHERE ip_hash = ? AND dia = ?',
  ).bind(ipHash, hoy).first();

  if (usoActual && usoActual.conteo >= LIMITE_DIARIO) {
    return json({
      error: `Has alcanzado el máximo de ${LIMITE_DIARIO} solicitudes por día. `
        + 'Vuelve mañana, o escríbenos por WhatsApp si necesitas más.',
      codigo: 'limite_diario',
    }, 429);
  }

  await env.DB.prepare(
    `INSERT INTO limites_unlock (ip_hash, dia, conteo) VALUES (?, ?, 1)
     ON CONFLICT (ip_hash, dia) DO UPDATE SET conteo = conteo + 1`,
  ).bind(ipHash, hoy).run();

  const filaToken = await env.DB.prepare(
    'SELECT scan_id FROM scan_tokens WHERE token = ?',
  ).bind(scan_token).first();

  if (!filaToken) {
    return json({ error: 'No encontramos ese análisis. Vuelve a buscar tu nombre.' }, 404);
  }

  const scan_id = filaToken.scan_id;
  // Se traen especialidad y ciudad además del resultado: el aviso interno los
  // necesita, y la ciudad no viaja en el cuerpo de /api/unlock.
  const scan = await env.DB.prepare(
    'SELECT id, especialidad, ciudad, puntaje_total, resultado FROM scans WHERE id = ?',
  ).bind(scan_id).first();

  if (!scan) {
    return json({ error: 'No encontramos ese análisis. Vuelve a buscar tu nombre.' }, 404);
  }

  const insLead = await env.DB.prepare(
    `INSERT INTO leads (scan_id, nombre, especialidad, lugar_trabajo, email,
                        consentimiento_lopdp, es_titular, creado_en)
     VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'))`,
  ).bind(scan_id, v.nombre, String(especialidad || '').slice(0, 80), trabajo, correo).run();

  // Token de 128 bits: es la única credencial que protege el informe.
  const token = generarToken();

  await env.DB.prepare(
    'INSERT INTO informes (token, scan_id, lead_id, creado_en) VALUES (?, ?, ?, datetime(\'now\'))',
  ).bind(token, scan_id, insLead.meta.last_row_id).run();

  const completo = JSON.parse(scan.resultado);
  const desbloqueadas = (completo.dimensiones || [])
    .filter((d) => d.id === 2 || d.id === 3)
    .map(({ id, nombre: n, puntos, banda, evidencia, recomendacion, confianza }) =>
      ({ id, nombre: n, puntos, banda, evidencia, recomendacion, confianza }));

  const urlInforme = `${new URL(request.url).origin}/informe/${token}`;

  // Los dos correos salen en segundo plano con waitUntil: el médico ya está
  // esperando su resultado en pantalla y no debe quedarse mirando un spinner
  // mientras hablamos con Microsoft. Si un envío falla, el lead ya está
  // guardado en D1 y el enlace ya se le mostró — no se pierde nada.
  waitUntil(enviarInforme(env, {
    destinatario: correo,
    nombre: v.nombre,
    especialidad: scan.especialidad,
    ciudad: scan.ciudad,
    puntaje: scan.puntaje_total,
    url: urlInforme,
  }));

  // Aviso interno: mientras no haya CRM, este correo ES el CRM. Lleva los
  // datos de contacto y las diez dimensiones, incluidas las seis que el
  // médico no vio — que son el argumento de venta.
  waitUntil(notificarLead(env, {
    nombre: v.nombre,
    especialidad: scan.especialidad,
    ciudad: scan.ciudad,
    lugarTrabajo: trabajo,
    correo,
    puntaje: scan.puntaje_total,
    dimensiones: (completo.dimensiones || []).slice().sort((a, b) => a.id - b.id),
    url: urlInforme,
    fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
  }));

  return json({
    ok: true,
    dimensiones: desbloqueadas,
    informe_url: `/informe/${token}`,
    mensaje: `Tus dos áreas adicionales están abajo. También te enviamos el informe a ${correo}.`,
  });
}
