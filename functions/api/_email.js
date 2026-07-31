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

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Las 4 etapas del modelo de bandas (0–40 / 40–60 / 60–80 / 80+), no las
 * bandas de 0–3/4–6/7–10 por dimensión que usa el escáner. Cortes y textos
 * tomados de "Modelo de Bandas de Visibilidad Digital" (IntelliSalud,
 * 2026-07-30) para que el correo hable el mismo idioma que ese documento.
 */
function etapaDePuntaje(p) {
  if (p < 40) {
    return {
      nombre: 'Fundamentos', color: '#c0392b', plazo: 'hasta 3 meses',
      foco: 'construir la base que buscadores e IA puedan leer y citar: sitio propio, '
        + 'datos estructurados, Google Business Profile y consistencia de identidad.',
    };
  }
  if (p < 60) {
    return {
      nombre: 'Autoridad y prueba social', color: '#e08a1e', plazo: '2–3 meses adicionales',
      foco: 'construir confianza donde lo buscan sus pacientes: reseñas, directorios '
        + 'médicos y redes profesionales activas.',
    };
  }
  if (p < 80) {
    return {
      nombre: 'Contenido y GEO', color: '#0e6db5', plazo: '3–6 meses adicionales',
      foco: 'convertirse en la fuente que los asistentes de IA citan: contenido de '
        + 'autoridad, schema profundo y medición de visibilidad en IA.',
    };
  }
  return {
    nombre: 'Dominio y mantenimiento', color: '#1c9e6b', plazo: 'continuo',
    foco: 'defender y ampliar el liderazgo: cadencia de contenido, monitoreo mensual y '
      + 'actualización constante.',
  };
}

const WHATSAPP_URL = 'https://wa.me/593998286930?text='
  + encodeURIComponent('Hola IntelliSalud, tengo una pregunta sobre mi diagnóstico de visibilidad.');

function cuerpoHTML({ nombre, especialidad, ciudad, puntaje, url }) {
  const etapa = etapaDePuntaje(puntaje);
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#f4f8fc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8fc;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;
              font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
              color:#0b1f4a;border:1px solid #e2e8f0">

  <tr><td align="center" bgcolor="#1a3a8f"
          style="background-color:#1a3a8f;background:linear-gradient(135deg,#1a3a8f,#00c2c7);
                 padding:28px 32px">
    <img src="https://intellisalud.com/assets/logo.jpg" width="44" height="44" alt="IntelliSalud"
         style="display:block;margin:0 auto 10px;border-radius:10px;object-fit:cover;background:#fff">
    <div style="color:#fff;font-size:19px;font-weight:700">IntelliSalud</div>
    <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px;line-height:1.5">
      ¿Qué tan preparada está tu marca profesional para la era de la IA?
    </div>
  </td></tr>

  <tr><td style="padding:32px">
    <p style="margin:0 0 16px;font-size:16px">Estimado/a ${esc(nombre)},</p>

    <p style="margin:0 0 20px;line-height:1.7;font-size:15px">
      Su diagnóstico de visibilidad digital está listo. Analizamos su presencia
      como <strong>${esc(especialidad)}</strong> en <strong>${esc(ciudad)}</strong>
      sobre diez áreas que determinan si un paciente puede encontrarle en
      buscadores y en asistentes de inteligencia artificial.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f4f8fc;border-radius:12px;margin:0 0 18px">
      <tr><td align="center" style="padding:22px">
        <div style="font-size:44px;font-weight:800;line-height:1;color:#0e6db5">${puntaje}<span
          style="font-size:20px;font-weight:700;color:#94a3b8">/100</span></div>
        <div style="display:inline-block;margin-top:12px;padding:5px 14px;border-radius:999px;
                    background:${etapa.color};color:#fff;font-size:12px;font-weight:700;
                    letter-spacing:.02em">${etapa.nombre.toUpperCase()}</div>
      </td></tr>
    </table>

    <p style="margin:0 0 8px;line-height:1.7;font-size:14px;color:#475569">
      Medimos diez áreas organizadas en cuatro etapas acumulativas — cada una
      construye sobre la anterior: <strong>Fundamentos</strong> (0–40),
      <strong>Autoridad y prueba social</strong> (40–60),
      <strong>Contenido y GEO</strong> (60–80) y
      <strong>Dominio y mantenimiento</strong> (80+).
    </p>
    <p style="margin:0 0 22px;line-height:1.7;font-size:14px;color:#475569">
      Su puntaje lo ubica en <strong>${etapa.nombre}</strong>: el trabajo aquí es
      ${etapa.foco} Un plan típico en esta etapa toma ${etapa.plazo}
      — los plazos son referenciales y dependen del punto de partida y la
      ejecución; no garantizamos posiciones específicas en buscadores ni en IA.
    </p>

    <p style="margin:0 0 22px;line-height:1.7;font-size:15px">
      En su informe encontrará tres áreas con el detalle de lo que hallamos y
      qué hacer al respecto, en orden de impacto.
    </p>

    <p style="margin:0 0 30px">
      <a href="${url}" style="display:inline-block;background:#0e6db5;color:#fff;
         text-decoration:none;padding:13px 26px;border-radius:999px;
         font-weight:700;font-size:15px">Ver mi informe</a>
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f4f8fc;border-radius:12px;margin:0 0 26px">
      <tr><td style="padding:18px 20px">
        <p style="margin:0;line-height:1.7;font-size:13.5px;color:#334155">
          IntelliSalud ayuda a médicos y clínicas en Ecuador a ser encontrados
          por sus pacientes — en Google y en los asistentes de inteligencia
          artificial que cada vez más pacientes usan para elegir un
          especialista. Somos pioneros en Ecuador y Latinoamérica en preparar
          perfiles médicos para esta nueva forma de búsqueda.
        </p>
      </td></tr>
    </table>

    <p style="margin:0;line-height:1.7;font-size:14px;color:#475569">
      Guarde este enlace: puede volver a consultarlo cuando quiera.
    </p>

    <p style="margin:22px 0 0;line-height:1.6;font-size:15px">
      Jonathan L. Aviles<br>
      <span style="color:#475569;font-size:14px">Fundador, IntelliSalud</span>
    </p>
  </td></tr>

  <tr><td style="padding:22px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.6">
      ¿Preguntas sobre su diagnóstico? Responda a este correo — lo leo yo — o
      escríbanos por WhatsApp.
    </p>
    <p style="margin:0 0 18px">
      <a href="${WHATSAPP_URL}" style="display:inline-block;background:#1ea952;color:#fff;
         text-decoration:none;padding:9px 18px;border-radius:999px;
         font-weight:700;font-size:13px">Hablar por WhatsApp</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#8a99ab">
      Recibe este correo porque solicitó un diagnóstico de visibilidad en
      intellisalud.com. Sus datos se conservan mientras dure la relación
      comercial y hasta 24 meses después del último contacto. Puede solicitar
      acceso, rectificación o eliminación respondiendo a este mensaje, conforme
      a la Ley Orgánica de Protección de Datos Personales del Ecuador.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/**
 * Aviso interno de lead nuevo. Sustituye al "BCC" que parecería la solución
 * obvia: una copia oculta del correo al médico NO sirve, porque ese mensaje
 * solo lleva su nombre, el puntaje y un enlace — no su correo, ni dónde
 * atiende, ni los hallazgos. Aquí va todo lo que hace falta para llamarle.
 *
 * Incluye las DIEZ dimensiones, no solo las cuatro que ve el médico: las seis
 * bloqueadas son precisamente el argumento de venta.
 */
function cuerpoNotificacion({ nombre, especialidad, ciudad, lugarTrabajo,
  correo, puntaje, dimensiones, url, fecha }) {
  const fila = (d) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:26px">
        <strong>${d.id}</strong></td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top">
        <strong>${esc(d.nombre)}</strong> — ${d.puntos}/10
        <span style="color:#8a99ab">(${esc(d.banda)}${d.confianza === 'baja' ? ', confianza baja' : ''})</span>
        <div style="color:#475569;font-size:13px;margin-top:4px">${esc(d.evidencia)}</div>
      </td>
    </tr>`;

  return `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f4f8fc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;
         font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1f4a">

 <tr><td style="padding:20px 26px;background:#0b1f4a;border-radius:14px 14px 0 0">
   <div style="color:#fff;font-size:17px;font-weight:700">Nuevo lead — ${esc(nombre)}</div>
   <div style="color:rgba(255,255,255,.75);font-size:13px;margin-top:3px">
     ${esc(especialidad)} · ${esc(ciudad)} · ${fecha}</div>
 </td></tr>

 <tr><td style="padding:22px 26px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
     <tr><td style="padding:5px 0;color:#475569;width:120px">Puntaje</td>
         <td style="padding:5px 0"><strong style="font-size:19px">${puntaje}/100</strong></td></tr>
     <tr><td style="padding:5px 0;color:#475569">Correo</td>
         <td style="padding:5px 0"><a href="mailto:${esc(correo)}">${esc(correo)}</a></td></tr>
     <tr><td style="padding:5px 0;color:#475569">Trabaja en</td>
         <td style="padding:5px 0">${esc(lugarTrabajo)}</td></tr>
     <tr><td style="padding:5px 0;color:#475569">Informe</td>
         <td style="padding:5px 0"><a href="${url}">${url}</a></td></tr>
   </table>

   <p style="margin:20px 0 8px;font-size:14px;color:#475569">
     <strong>Las diez dimensiones</strong> — las 5–10 no las vio el médico.
   </p>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
     ${(dimensiones || []).map(fila).join('')}
   </table>

   <p style="margin:22px 0 0">
     <a href="mailto:${esc(correo)}?subject=${encodeURIComponent('Sobre su diagnóstico de visibilidad')}"
        style="display:inline-block;background:#0e6db5;color:#fff;text-decoration:none;
               padding:11px 22px;border-radius:999px;font-weight:700;font-size:14px">
       Responder al médico</a>
   </p>
 </td></tr>

</table></td></tr></table></body></html>`;
}

/**
 * Aviso de "quiero que me contacten". Lo dispara /api/contactar cuando el
 * médico, en vez de escribir por WhatsApp y esperar horas, pide contacto
 * directo desde su informe. Lleva la urgencia explícita en el asunto: es la
 * ventana en la que el médico todavía recuerda por qué buscó esto.
 */
function cuerpoSolicitudContacto({ nombre, especialidad, ciudad, lugarTrabajo,
  correo, puntaje, fecha }) {
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f4f8fc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;
         font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1f4a">

 <tr><td style="padding:20px 26px;background:#c0392b;border-radius:14px 14px 0 0">
   <div style="color:#fff;font-size:17px;font-weight:700">⏱ Solicitud de contacto — responder en 48h</div>
   <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:3px">
     ${esc(nombre)} · ${esc(especialidad)} · ${esc(ciudad)} · ${fecha}</div>
 </td></tr>

 <tr><td style="padding:22px 26px">
   <p style="margin:0 0 16px;font-size:15px;line-height:1.7">
     El médico pidió explícitamente ser contactado para el resto del informe.
     Agenda la llamada dentro de las próximas 48 horas — es la ventana en la
     que todavía recuerda por qué buscó esto.
   </p>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
     <tr><td style="padding:5px 0;color:#475569;width:120px">Puntaje</td>
         <td style="padding:5px 0"><strong style="font-size:19px">${puntaje}/100</strong></td></tr>
     <tr><td style="padding:5px 0;color:#475569">Correo</td>
         <td style="padding:5px 0"><a href="mailto:${esc(correo)}">${esc(correo)}</a></td></tr>
     <tr><td style="padding:5px 0;color:#475569">Trabaja en</td>
         <td style="padding:5px 0">${esc(lugarTrabajo)}</td></tr>
   </table>
   <p style="margin:22px 0 0">
     <a href="mailto:${esc(correo)}?subject=${encodeURIComponent('Sobre tu diagnóstico de visibilidad')}"
        style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;
               padding:11px 22px;border-radius:999px;font-weight:700;font-size:14px">
       Contactar ahora</a>
   </p>
 </td></tr>

</table></td></tr></table></body></html>`;
}

/** Envío común. Centraliza token + llamada a Graph para los dos correos. */
async function enviarMensaje(env, { para, asunto, html }) {
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
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: asunto,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: para } }],
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
}

/**
 * Envía el informe al médico. Devuelve true/false en lugar de lanzar: el
 * correo es secundario respecto a la respuesta que ya está esperando en
 * pantalla, y un fallo aquí no debe convertirse en un error para él.
 */
export async function enviarInforme(env, { destinatario, nombre, especialidad, ciudad, puntaje, url }) {
  try {
    return await enviarMensaje(env, {
      para: destinatario,
      asunto: `Su diagnóstico de visibilidad: ${puntaje}/100`,
      html: cuerpoHTML({ nombre, especialidad, ciudad, puntaje, url }),
    });
  } catch (e) {
    console.error('correo informe:', e.message);
    return false;
  }
}

/** Aviso interno. Falla en silencio por separado del correo al médico: que no
 *  llegue el aviso no debe impedir que el médico reciba su informe. */
export async function notificarLead(env, datos) {
  try {
    return await enviarMensaje(env, {
      para: env.GRAPH_SENDER || REMITENTE_POR_DEFECTO,
      asunto: `Nuevo lead: ${datos.nombre} — ${datos.puntaje}/100 — ${datos.especialidad}, ${datos.ciudad}`,
      html: cuerpoNotificacion(datos),
    });
  } catch (e) {
    console.error('correo aviso:', e.message);
    return false;
  }
}

/** Aviso de solicitud de contacto directo. Falla en silencio, igual que
 *  notificarLead: el botón ya le confirmó al médico que su solicitud entró. */
export async function notificarSolicitudContacto(env, datos) {
  try {
    return await enviarMensaje(env, {
      para: env.GRAPH_SENDER || REMITENTE_POR_DEFECTO,
      asunto: `⏱ Contactar en 48h: ${datos.nombre} — ${datos.puntaje}/100`,
      html: cuerpoSolicitudContacto(datos),
    });
  } catch (e) {
    console.error('correo solicitud contacto:', e.message);
    return false;
  }
}
