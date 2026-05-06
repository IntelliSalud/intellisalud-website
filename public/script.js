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
   8. Chat messages appear one by one
   ══════════════════════════════════════════════════ */

function countUp(elementId, target, suffix, duration) {
  const el = document.getElementById(elementId);
  if (!el) return;
  let current = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = Math.round(current) + suffix;
    if (current >= target) clearInterval(timer);
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
    countUp('num1', 20, '%', 1100);
  }, 900);

  setTimeout(() => {
    document.getElementById('stat2').classList.add('visible');
    /* Custom counter for minutes */
    const el = document.getElementById('num2');
    let v = 0;
    const t = setInterval(() => {
      v = Math.min(v + 0.35, 8);
      el.textContent = Math.round(v) + ' min';
      if (v >= 8) clearInterval(t);
    }, 40);
  }, 1400);

  setTimeout(() => {
    document.getElementById('stat3').classList.add('visible');
    countUp('num3', 98, '%', 1100);
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

  /* Phase 5 — chat messages appear */
  const chatDelays = {
    'chat-m1':     6300,
    'chat-m2':     7200,
    'chat-typing': 7800,
  };

  Object.entries(chatDelays).forEach(([id, delay]) => showElement(id, delay));

  /* Hide typing indicator, show reply */
  setTimeout(() => {
    hideElement('chat-typing');
    showElement('chat-m3', 100);
  }, 9100);

  showElement('chat-m4', 9800);
  showElement('chat-m5', 10500);
}

/* Start animation when page loads */
window.addEventListener('load', () => {
  setTimeout(runStatsAnimation, 300);
});
