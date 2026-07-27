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

export async function onRequestGet({ env, request }) {
  const enviar = new URL(request.url).searchParams.get('send') === '1';

  const salida = {
    secreto_definido: Boolean(env.GRAPH_CLIENT_SECRET),
    secreto_longitud: env.GRAPH_CLIENT_SECRET ? env.GRAPH_CLIENT_SECRET.length : 0,
    remitente: env.GRAPH_SENDER || 'jonathan@intellisalud.com',
    token: null,
    envio: null,
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

      // Con ?send=1 hace un envío real y devuelve el resultado exacto de
      // Graph. Así el error llega aquí en vez de tener que buscarlo en una
      // bandeja de entrada.
      if (enviar) {
        const acceso = JSON.parse(cuerpo).access_token;
        const destino = env.GRAPH_SENDER || 'jonathan@intellisalud.com';
        const s = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(destino)}/sendMail`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                subject: 'Prueba de envío — IntelliSalud',
                body: { contentType: 'Text', content: 'Prueba de la cadena de envío por Microsoft Graph.' },
                toRecipients: [{ emailAddress: { address: destino } }],
              },
              saveToSentItems: true,
            }),
          },
        );
        const t = await s.text().catch(() => '');
        salida.envio = { status: s.status, ok: s.ok, detalle: t.slice(0, 400) || '(vacío)' };
      }
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
