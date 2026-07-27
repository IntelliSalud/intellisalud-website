/**
 * Envío de correo por Microsoft Graph (flujo client credentials).
 *
 * Se usa Graph y no SMTP porque los Workers de Cloudflare no pueden abrir
 * conexiones TCP: solo HTTP. Graph es HTTPS, así que funciona; SMTP no.
 *
 * El dominio ya tiene SPF y DMARC correctos para Microsoft 365, de modo que
 * enviar desde aquí no exige tocar el DNS. Añadir un tercero (Resend,
 * SendGrid) obligaría a editar un SPF que termina en "-all", con el riesgo de
 * romper el correo real del negocio.
 */

const TENANT_ID = '857f552d-f7ba-4bf9-92cb-07a77aa7da85';
const CLIENT_ID = '5d744739-fa3a-440d-a1cc-caa6dba0dea6';
const REMITENTE_POR_DEFECTO = 'jonathan@intellisalud.com';

async function obtenerToken(clientSecret) {
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    // El cuerpo del error de Entra no contiene el secreto, solo el motivo.
    throw new Error(`token ${r.status}: ${t.slice(0, 200)}`);
  }
  return (await r.json()).access_token;
}

function cuerpoHTML({ nombre, puntaje, url }) {
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#f4f8fc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8fc;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;
              font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
              color:#0b1f4a;border:1px solid #e2e8f0">

  <tr><td style="background:linear-gradient(135deg,#1a3a8f,#00c2c7);padding:28px 32px">
    <div style="color:#fff;font-size:19px;font-weight:700">IntelliSalud</div>
    <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px">
      Índice de Visibilidad Médica
    </div>
  </td></tr>

  <tr><td style="padding:32px">
    <p style="margin:0 0 16px;font-size:16px">Estimado/a ${nombre},</p>

    <p style="margin:0 0 20px;line-height:1.7;font-size:15px">
      Su diagnóstico de visibilidad digital está listo. Este es el resultado
      del análisis de diez áreas que determinan si un paciente puede
      encontrarle en buscadores y en asistentes de inteligencia artificial.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f4f8fc;border-radius:12px;margin:0 0 22px">
      <tr><td align="center" style="padding:22px">
        <div style="font-size:44px;font-weight:800;line-height:1;color:#0e6db5">${puntaje}</div>
        <div style="font-size:13px;color:#475569;margin-top:6px">de 100 puntos</div>
      </td></tr>
    </table>

    <p style="margin:0 0 22px;line-height:1.7;font-size:15px">
      En su informe encontrará cuatro áreas con el detalle de lo que hallamos
      y qué hacer al respecto, en orden de impacto.
    </p>

    <p style="margin:0 0 26px">
      <a href="${url}" style="display:inline-block;background:#0e6db5;color:#fff;
         text-decoration:none;padding:13px 26px;border-radius:999px;
         font-weight:700;font-size:15px">Ver mi informe</a>
    </p>

    <p style="margin:0;line-height:1.7;font-size:14px;color:#475569">
      Guarde este enlace: puede volver a consultarlo cuando quiera. Si tiene
      dudas sobre algún punto, responda a este correo — lo leo yo.
    </p>

    <p style="margin:22px 0 0;line-height:1.6;font-size:15px">
      Jonathan L. Aviles<br>
      <span style="color:#475569;font-size:14px">Fundador, IntelliSalud</span>
    </p>
  </td></tr>

  <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;
                 font-size:12px;line-height:1.6;color:#8a99ab">
    Recibe este correo porque solicitó un diagnóstico de visibilidad en
    intellisalud.com. Sus datos se conservan mientras dure la relación
    comercial y hasta 24 meses después del último contacto. Puede solicitar
    acceso, rectificación o eliminación respondiendo a este mensaje, conforme
    a la Ley Orgánica de Protección de Datos Personales del Ecuador.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/**
 * Envía el informe. Devuelve true/false en lugar de lanzar: el correo es
 * secundario respecto a la respuesta que el médico ya está esperando en
 * pantalla, y un fallo aquí no debe convertirse en un error para él.
 */
export async function enviarInforme(env, { destinatario, nombre, puntaje, url }) {
  try {
    if (!env.GRAPH_CLIENT_SECRET) {
      console.error('correo: GRAPH_CLIENT_SECRET no está definida');
      return false;
    }

    const token = await obtenerToken(env.GRAPH_CLIENT_SECRET);
    const remitente = env.GRAPH_SENDER || REMITENTE_POR_DEFECTO;

    const r = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remitente)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: `Su diagnóstico de visibilidad: ${puntaje}/100`,
            body: { contentType: 'HTML', content: cuerpoHTML({ nombre, puntaje, url }) },
            toRecipients: [{ emailAddress: { address: destinatario } }],
          },
          // Queda en Elementos enviados: así el seguimiento comercial vive en
          // el mismo buzón donde llegarán las respuestas.
          saveToSentItems: true,
        }),
      },
    );

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('correo: sendMail', r.status, t.slice(0, 300));
      return false;
    }
    return true;  // Graph responde 202 Accepted
  } catch (e) {
    console.error('correo:', e.message);
    return false;
  }
}
