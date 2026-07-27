/* ═══════════════════════════════════════════════════
   IntelliSalud — script.js
   ═══════════════════════════════════════════════════ */

/* ── Mobile menu toggle ── */
const menuToggle = document.getElementById('menuToggle');
const navLinks   = document.getElementById('navLinks');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}

/* ══════════════════════════════════════════════════
   NOTA — código retirado en el rediseño (julio 2026)

   Se eliminaron dos bloques que ya no tienen elementos en el DOM:

   1. runStatsAnimation() — animaba la sección de estadísticas de burnout
      médico y, al terminar, añadía la clase .visible al hero. El hero ahora
      es visible por CSS, sin depender de JavaScript.

   2. startAmbientSceneCycle() — rotaba las 4 escenas de la animación de
      Ambient AI en el hero.

   Si en el futuro se añade una nueva sección de estadísticas, la regla que
   causó el error anterior sigue vigente: el valor final SIEMPRE va escrito
   en el HTML y la animación parte de ese valor. Nunca contar desde 0 hacia
   un número definido en JavaScript — un rastreador que capture la página a
   mitad de la animación registra e imprime el número equivocado.
   ══════════════════════════════════════════════════ */
