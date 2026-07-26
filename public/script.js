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
   STATS INTRO ANIMATION
   Sequence:
   1. Eyebrow fades in             (0.0s)
   2. Subtitle fades in            (0.4s)
   3. Stat 1 counts up + slides    (0.9s)
   4. Stat 2 counts up + slides    (1.4s)
   5. Stat 3 counts up + slides    (1.9s)
   6. Transition bar fills         (4.8s)
   7. Hero section fades in        (5.8s)
   8. Ambient AI scene cycle starts
   ══════════════════════════════════════════════════ */

/* Animating the digits themselves means the DOM briefly holds a WRONG number
   (e.g. "1%" instead of "62%"). AI crawlers that execute JS and snapshot mid-
   animation ingest that wrong value and attribute it to the cited source.
   In a health context that's a credibility liability, so the digits are static
   by default. Set ANIMATE_NUMBERS = true to restore the count-up. */
const ANIMATE_NUMBERS = false;

const prefersReducedMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The HTML is the source of truth for every statistic — never a JS literal. */
function countUp(elementId, duration) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const finalText = el.textContent.trim();
  if (!ANIMATE_NUMBERS || prefersReducedMotion) return;

  const target = parseFloat(finalText.replace(',', '.'));
  if (isNaN(target)) return;

  let current = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    if (current >= target) {
      clearInterval(timer);
      el.textContent = finalText;   // restore exact formatting: "9 min", "62%"
    } else {
      el.textContent = finalText.replace(String(target), String(Math.round(current)));
    }
  }, 16);
}

function showElement(id, delay) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.classList.add('visible');
  }, delay);
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('visible');
}

function runStatsAnimation() {
  /* Phase 1 — eyebrow + subtitle */
  showElement('statsEyebrow',  0);
  showElement('statsSubtitle', 400);

  /* Phase 2 — stat blocks count up, staggered */
  setTimeout(() => {
    document.getElementById('stat1').classList.add('visible');
    countUp('num1', 1100);
  }, 900);

  setTimeout(() => {
    document.getElementById('stat2').classList.add('visible');
    countUp('num2', 1100);
  }, 1400);

  setTimeout(() => {
    document.getElementById('stat3').classList.add('visible');
    countUp('num3', 1100);
  }, 1900);

  /* Phase 3 — transition bar fills */
  setTimeout(() => {
    const bar = document.getElementById('transitionBar');
    if (bar) bar.classList.add('animate');
  }, 4800);

  /* Phase 4 — hero fades in */
  setTimeout(() => {
    const hero = document.getElementById('heroSection');
    if (hero) hero.classList.add('visible');
  }, 5800);

  /* Phase 5 — ambient AI scene cycle starts after hero is visible */
  setTimeout(() => {
    startAmbientSceneCycle();
  }, 6000);
}

/* ══════════════════════════════════════════════════
   AMBIENT AI SCENE CYCLE
   4 scenes, each ~6 seconds, loops continuously.
   Scene 1: Consultation (doctor + patient)
   Scene 2: Phone transcript
   Scene 3: Clinical summary card
   Scene 4: Web portal / laptop
   ══════════════════════════════════════════════════ */

const SCENE_DURATION = 6000; // ms per scene
const SCENES = ['ascene1','ascene2','ascene3','ascene4'];
const SLABELS = ['slabel1','slabel2','slabel3','slabel4'];
let currentScene = 0;

function startAmbientSceneCycle() {
  showScene(0);
  setInterval(() => {
    currentScene = (currentScene + 1) % SCENES.length;
    showScene(currentScene);
  }, SCENE_DURATION);
}

function showScene(index) {
  SCENES.forEach((id, i) => {
    const el = document.getElementById(id);
    const lbl = document.getElementById(SLABELS[i]);
    if (!el) return;
    if (i === index) {
      el.classList.add('scene-active');
      el.classList.remove('scene-exit');
      if (lbl) lbl.classList.add('sl-active');
    } else {
      el.classList.remove('scene-active');
      if (lbl) lbl.classList.remove('sl-active');
    }
  });
}

/* Start animation when page loads */
window.addEventListener('load', () => {
  setTimeout(runStatsAnimation, 300);
});
