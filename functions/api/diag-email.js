/**
 * GET /api/diag-email  — DIAGNÓSTICO TEMPORAL
 *
 * Comprueba la cadena de autenticación con Microsoft Graph y devuelve dónde
 * falla. No envía correo y no revela ningún secreto: solo si la variable está
 * definida, su longitud, y el código de error que devuelve Entra.
 *
 * BORRAR ESTE ARCHIVO cuando el envío quede confirmado.
 */

const TENANT_ID = '857f552d-f7ba-4bf9-92cb-07a77aa7da85';
const CLIENT_ID = '5d744739-fa3a-440d-a1cc-caa6dba0dea6';

export async function onRequestGet({ env }) {
  const salida = {
    secreto_definido: Boolean(env.GRAPH_CLIENT_SECRET),
    secreto_longitud: env.GRAPH_CLIENT_SECRET ? env.GRAPH_CLIENT_SECRET.length : 0,
    remitente: env.GRAPH_SENDER || 'jonathan@intellisalud.com',
    token: null,
    error: null,
  };

  if (!salida.secreto_definido) {
    salida.error = 'GRAPH_CLIENT_SECRET no está disponible para esta Function';
    return new Response(JSON.stringify(salida, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    const cuerpo = await r.text();
    if (!r.ok) {
      // El error de Entra dice exactamente qué falta; no incluye el secreto.
      let detalle = cuerpo.slice(0, 400);
      try {
        const j = JSON.parse(cuerpo);
        detalle = `${j.error}: ${String(j.error_description || '').split('\r')[0]}`;
      } catch { /* se queda el texto crudo */ }
      salida.token = false;
      salida.error = `HTTP ${r.status} — ${detalle}`;
    } else {
      salida.token = true;
      salida.error = null;
    }
  } catch (e) {
    salida.token = false;
    salida.error = `excepción: ${e.message}`;
  }

  return new Response(JSON.stringify(salida, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
