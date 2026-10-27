// Small visual touches: covers tilt toward the mouse with a light sheen.
// One listener for the whole page, so nothing piles up as cards come and go.
(function () {
  let cur = null;
  let raf = 0;
  let pos = null;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  function reset(card) {
    if (!card) return;
    const art = card.querySelector('.art');
    if (art) { art.style.transform = ''; art.style.removeProperty('--mx'); art.style.removeProperty('--my'); }
  }
  function apply() {
    raf = 0;
    if (!cur || !pos) return;
    const art = cur.querySelector('.art');
    if (!art) return;
    const r = art.getBoundingClientRect();
    const x = (pos.x - r.left) / r.width - 0.5;
    const y = (pos.y - r.top) / r.height - 0.5;
    art.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px) scale(1.03)`;
    art.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    art.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  }
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('#grid .card, .tv-card');
    if (card !== cur) { reset(cur); cur = card; }
    if (!cur) return;
    pos = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { reset(cur); cur = null; });
  window.addEventListener('blur', () => { reset(cur); cur = null; });
})();
