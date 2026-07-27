/**
 * POST /api/unlock
 *
 * Recibe los datos del profesional, guarda el lead y devuelve las
 * dimensiones 3 y 4. Las dimensiones 5–10 siguen sin salir del servidor.
 */

import { validarNombre, json } from './_shared.js';
import { enviarInforme } from './_email.js';

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  let cuerpo;
  try { cuerpo = await request.json(); }
  catch { return json({ error: 'Solicitud inválida.' }, 400); }

  const { scan_id, nombre, especialidad, lugar_trabajo, email,
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

  const scan = await env.DB.prepare(
    'SELECT id, resultado FROM scans WHERE id = ?',
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
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare(
    'INSERT INTO informes (token, scan_id, lead_id, creado_en) VALUES (?, ?, ?, datetime(\'now\'))',
  ).bind(token, scan_id, insLead.meta.last_row_id).run();

  const completo = JSON.parse(scan.resultado);
  const desbloqueadas = (completo.dimensiones || [])
    .filter((d) => d.id === 3 || d.id === 4)
    .map(({ id, nombre: n, puntos, banda, evidencia, recomendacion, confianza }) =>
      ({ id, nombre: n, puntos, banda, evidencia, recomendacion, confianza }));

  const urlInforme = `${new URL(request.url).origin}/informe/${token}`;

  // El correo se envía en segundo plano con waitUntil: el médico ya está
  // esperando su resultado en pantalla y no debe quedarse mirando un spinner
  // mientras hablamos con Microsoft. Si el envío falla, el lead ya está
  // guardado y el enlace ya se le mostró — no pierde nada.
  waitUntil(enviarInforme(env, {
    destinatario: correo,
    nombre: v.nombre,
    puntaje: JSON.parse(scan.resultado).puntaje_total,
    url: urlInforme,
  }));

  return json({
    ok: true,
    dimensiones: desbloqueadas,
    informe_url: `/informe/${token}`,
    mensaje: `Tus dos áreas adicionales están abajo. También te enviamos el informe a ${correo}.`,
  });
}
