/**
 * POST /api/contactar
 *
 * El médico ya tiene su informe (el token de /informe/<token> es la única
 * credencial) y pide que alguien lo contacte para el resto, en vez de
 * escribir por WhatsApp y esperar horas. Dispara un correo interno con
 * urgencia de 48h.
 *
 * ► No hay límite por IP aparte del que ya impuso /api/unlock al crear el
 *   lead: la protección real es que el token es de 128 bits e inadivinable,
 *   y "solicitudes_contacto" se deduplica por scan_id para no reenviar el
 *   correo si el médico hace clic dos veces (recarga, doble tap).
 */

import { json } from './_shared.js';
import { notificarSolicitudContacto } from './_email.js';

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  let cuerpo;
  try { cuerpo = await request.json(); }
  catch { return json({ error: 'Solicitud inválida.' }, 400); }

  const token = String(cuerpo.token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return json({ error: 'Enlace de informe inválido.' }, 400);
  }

  const fila = await env.DB.prepare(
    `SELECT i.scan_id, s.nombre, s.especialidad, s.ciudad, s.puntaje_total,
            l.email, l.lugar_trabajo
       FROM informes i
       JOIN scans s ON s.id = i.scan_id
       LEFT JOIN leads l ON l.id = i.lead_id
      WHERE i.token = ?`,
  ).bind(token).first();

  if (!fila || !fila.email) {
    return json({ error: 'No encontramos tu informe. Vuelve a generar tu diagnóstico.' }, 404);
  }

  // ON CONFLICT DO NOTHING: si ya existía una solicitud para este scan, no se
  // reenvía el correo. meta.changes distingue "insertó" de "ya existía".
  const ins = await env.DB.prepare(
    `INSERT INTO solicitudes_contacto (scan_id, creado_en) VALUES (?, datetime('now'))
     ON CONFLICT (scan_id) DO NOTHING`,
  ).bind(fila.scan_id).run();

  const yaSolicitado = ins.meta.changes === 0;

  if (!yaSolicitado) {
    waitUntil(notificarSolicitudContacto(env, {
      nombre: fila.nombre,
      especialidad: fila.especialidad,
      ciudad: fila.ciudad,
      lugarTrabajo: fila.lugar_trabajo,
      correo: fila.email,
      puntaje: fila.puntaje_total,
      fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
    }));
  }

  return json({ ok: true, ya_solicitado: yaSolicitado });
}
