/**
 * GET /informe/<token>
 *
 * Informe personalizado. El token es la única credencial: quien lo tenga ve
 * el informe. Por eso la página va con noindex, /informe/ está bloqueado en
 * robots.txt y no se enlaza desde ninguna parte del sitio.
 *
 * Muestra las dimensiones 1–3 completas y las 7 restantes bloqueadas. El
 * contenido de las bloqueadas NO se envía al navegador: se recorta aquí, igual
 * que en /api/scan.
 */

import { claveCampo, resumenDimensiones, mensajeDiagnostico } from '../api/_shared.js';

const DIMENSIONES_BLOQUEADAS = [4, 5, 6, 7, 8, 9, 10];
const CAMPO_CACHE_DIAS = 7;  // debe coincidir con scan.js / unlock.js

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function clasePuntaje(p) {
  if (p >= 75) return 'excellent';
  if (p >= 50) return 'good';
  if (p >= 25) return 'fair';
  return 'poor';
}

function lectura(p) {
  if (p >= 75) return 'Tu presencia digital es sólida. Lo que queda es afinamiento.';
  if (p >= 50) return 'Tienes una base construida, con áreas concretas donde ganarías visibilidad rápido.';
  if (p >= 25) return 'Existe algo de presencia, pero está dispersa y en plataformas que no controlas.';
  return 'Hoy es muy difícil que un paciente que no te conoce llegue a ti por internet. '
       + 'Es un punto de partida común entre especialistas y se corrige.';
}

function tarjeta(d) {
  return `<div class="dim">
    <div class="dim-cab">
      <span class="dim-num">${d.id}</span>
      <span class="dim-tit">${esc(d.nombre)}</span>
      <span class="dim-pts">${d.puntos}/10</span>
    </div>
    <p class="dim-ev">${esc(d.evidencia)}</p>
    <p class="dim-rec">${esc(d.recomendacion)}</p>
    ${d.confianza === 'baja'
      ? '<span class="dim-conf">⚠ Confianza baja — conviene verificar manualmente</span>' : ''}
  </div>`;
}

// Sin título: el nombre de la dimensión ya revela qué se evalúa (p.ej.
// "Perfil de Google Business"), y eso es exactamente lo que no queremos
// regalar antes de que el médico hable con nosotros.
const bloqueada = (n) => `<div class="dim bloqueada">
    <div class="dim-cab">
      <span class="dim-num">${n}</span>
      <span class="dim-tit">Área bloqueada</span>
      <span class="dim-lock">🔒 En el informe completo</span>
    </div>
  </div>`;

// El _headers del proyecto NO se aplica a las respuestas de Pages Functions
// (comportamiento documentado de Cloudflare): CORS y clickjacking hay que
// fijarlos aquí, no en public/_headers — esa ruta sí protege /visibilidad
// y el resto del sitio estático, pero no esta página.
const CABECERAS_COMUNES = {
  'Access-Control-Allow-Origin': 'https://intellisalud.com',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
};

function paginaError() {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <meta name="robots" content="noindex, nofollow">
     <title>Informe no encontrado — IntelliSalud</title>
     <link rel="stylesheet" href="/styles.css"></head><body>
     <div style="max-width:620px;margin:0 auto;padding:140px 24px;text-align:center">
       <h1>Este informe no está disponible</h1>
       <p style="line-height:1.75;color:#475569">
         El enlace puede estar incompleto o el informe pudo haber sido eliminado.
         Puedes generar uno nuevo desde el diagnóstico.</p>
       <p><a href="/visibilidad" class="btn btn-primary">Ir al diagnóstico</a></p>
     </div></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CABECERAS_COMUNES } },
  );
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const token = String(params.token || '');

  // Formato estricto antes de tocar la base: 32 hex, nada más.
  if (!/^[0-9a-f]{32}$/.test(token)) return paginaError();

  const fila = await env.DB.prepare(
    `SELECT i.creado_en, s.nombre, s.especialidad, s.ciudad,
            s.puntaje_total, s.resultado
       FROM informes i JOIN scans s ON s.id = i.scan_id
      WHERE i.token = ?`,
  ).bind(token).first();

  if (!fila) return paginaError();

  const completo = JSON.parse(fila.resultado);
  const abiertas = (completo.dimensiones || [])
    .filter((d) => d.id >= 1 && d.id <= 3)
    .sort((a, b) => a.id - b.id);

  // ── Mismo diagnóstico agregado que /api/unlock, recalculado aquí porque
  //    esta página no pasa por ese endpoint (se abre directo desde el correo
  //    o el enlace guardado). Cero llamadas nuevas: mismos datos de D1. ──
  const { solidas, oportunidades } = resumenDimensiones(completo.dimensiones);
  const mensajeDiag = mensajeDiagnostico({
    especialidad: fila.especialidad, ciudad: fila.ciudad, solidas, oportunidades,
  });
  let perfilesCampo = null;
  try {
    const filaCampo = await env.DB.prepare(
      `SELECT perfiles_visibles FROM campo_cache
        WHERE clave = ? AND creado_en > datetime('now', ?)`,
    ).bind(claveCampo(fila.especialidad, fila.ciudad), `-${CAMPO_CACHE_DIAS} days`).first();
    if (filaCampo) perfilesCampo = filaCampo.perfiles_visibles;
  } catch (e) {
    console.error('informe: no se pudo leer campo_cache', e.message);
  }

  const fecha = String(fila.creado_en).slice(0, 10);
  const p = fila.puntaje_total;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Informe de visibilidad — ${esc(fila.nombre)}</title>
<link rel="stylesheet" href="/styles.css" />
<style>
  .rep-hero { background: var(--grad-hero-bg); padding: 90px 24px 56px; text-align: center; }
  .rep-hero .eyebrow { color:#7deaef; }
  .rep-hero h1 { color:#fff; margin-bottom:10px; }
  .rep-hero p { color:rgba(255,255,255,.85); margin:0; }
  .rep { max-width:760px; margin:0 auto; padding:40px 24px 80px; }
  .rep h2 { margin-top:44px; margin-bottom:14px; font-size:1.5rem; }
  .rep p { line-height:1.75; margin-bottom:16px; }
  .puntaje-caja { text-align:center; padding:36px 24px; background:var(--light);
                  border:1px solid var(--border); border-radius:20px; margin-top:-36px; position:relative; }
  .puntaje-num { font-size:4.2rem; font-weight:800; line-height:1; letter-spacing:-.04em; }
  .puntaje-num.poor{color:#c0392b} .puntaje-num.fair{color:#e08a1e}
  .puntaje-num.good{color:#1c9e6b} .puntaje-num.excellent{color:#0e6db5}
  .puntaje-de { color:var(--muted); font-size:.95rem; }
  .barra { height:8px; background:var(--border); border-radius:99px; overflow:hidden; margin:20px auto 0; max-width:420px; }
  .barra span { display:block; height:100%; background:var(--grad); border-radius:99px; }
  .dim { border:1px solid var(--border); border-radius:16px; padding:22px 24px; margin-bottom:14px; }
  .dim-cab { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
  .dim-num { width:26px; height:26px; border-radius:50%; background:var(--grad); color:#fff;
             font-size:.78rem; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .dim-tit { font-weight:700; }
  .dim-pts { margin-left:auto; font-weight:800; color:var(--primary); }
  .dim-ev { color:var(--muted); font-size:.92rem; margin-bottom:10px; }
  .dim-rec { line-height:1.7; }
  .dim-conf { display:inline-block; font-size:.72rem; text-transform:uppercase;
              letter-spacing:.1em; color:var(--muted); margin-top:10px; }
  .dim.bloqueada { background:repeating-linear-gradient(45deg,#f8fafc,#f8fafc 10px,#f1f5f9 10px,#f1f5f9 20px); }
  .dim.bloqueada .dim-tit { color:var(--muted); }
  .dim-lock { margin-left:auto; font-size:.8rem; color:var(--muted); }
  .pie { margin-top:48px; padding-top:24px; border-top:1px solid var(--border);
         font-size:.8rem; color:var(--muted); line-height:1.7; }
  @media print { .rep-hero { background:#fff; } .rep-hero h1, .rep-hero p { color:#000; } .no-print { display:none; } }
</style>
</head>
<body>

<section class="rep-hero">
  <p class="eyebrow">Informe de visibilidad</p>
  <h1>${esc(fila.nombre)}</h1>
  <p>${esc(fila.especialidad)} · ${esc(fila.ciudad)} · ${fecha}</p>
</section>

<div class="rep">
  <div class="puntaje-caja">
    <div class="puntaje-num ${clasePuntaje(p)}">${p}</div>
    <div class="puntaje-de">de 100 puntos</div>
    <div class="barra"><span style="width:${p}%"></span></div>
    <p style="margin-top:18px">${lectura(p)}</p>
  </div>

  <h2>Tus tres áreas</h2>
  ${abiertas.map(tarjeta).join('')}

  <h2>Las siete áreas restantes</h2>
  <p>${esc(mensajeDiag)}</p>
  ${perfilesCampo !== null ? `<p style="color:var(--muted);font-size:.92rem">
    Dato de campo: identificamos al menos ${perfilesCampo} perfiles profesionales
    visibles para «${esc(fila.especialidad)} en ${esc(fila.ciudad)}» en los
    resultados de búsqueda.</p>` : ''}
  ${DIMENSIONES_BLOQUEADAS.map(bloqueada).join('')}

  <div class="no-print" style="text-align:center;margin-top:36px" id="contacto-caja">
    <button type="button" class="btn btn-primary" id="btn-contactar">
      Estoy interesado en el reporte completo
    </button>
    <p id="error-contacto" style="color:#c0392b;font-size:.9rem;margin-top:10px;display:none"></p>
  </div>

  <script>
  (function () {
    var btn = document.getElementById('btn-contactar');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      fetch('/api/contactar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ${JSON.stringify(token)} }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'No pudimos enviar tu solicitud.');
          document.getElementById('contacto-caja').innerHTML = '<p style="color:#475569">'
            + (res.d.ya_solicitado
                ? 'Ya recibimos tu solicitud. Nos pondremos en contacto contigo.'
                : '¡Recibido! Nos pondremos en contacto contigo para mostrarte el reporte completo.')
            + '</p>';
        })
        .catch(function (err) {
          var e = document.getElementById('error-contacto');
          e.textContent = err.message;
          e.style.display = 'block';
          btn.disabled = false;
        });
    });
  })();
  </script>

  <p class="pie">
    Informe generado por IntelliSalud el ${fecha} · Índice de Visibilidad Médica v1.0.
    Este análisis evalúa visibilidad digital, no calidad clínica.
    Tus datos se conservan mientras dure la relación comercial y hasta 24 meses
    después del último contacto. Puedes solicitar acceso, rectificación o
    eliminación escribiendo a <a href="mailto:jonathan@intellisalud.com">jonathan@intellisalud.com</a>,
    conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.
  </p>
</div>

</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // El informe lleva datos de una persona identificada: nada de caché
      // compartida y nada de indexación, por si el noindex se pierde.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...CABECERAS_COMUNES,
    },
  });
}
