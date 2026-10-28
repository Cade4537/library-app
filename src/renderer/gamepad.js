// Spatial navigation (arrow keys and controller) plus Gamepad API polling.
// app.js sets window.padActions = { a, b, x, y, lb, rb, menu, view } handlers.
(function () {
  function activeLayer() {
    const menu = document.querySelector('#menuRoot .menu');
    if (menu) return menu;
    const modals = document.querySelectorAll('#modalRoot .modal');
    if (modals.length) return modals[modals.length - 1];
    const guide = document.getElementById('guide');
    if (guide && document.body.classList.contains('guide-open')) return guide;
    const tv = document.getElementById('tv');
    if (tv && !tv.hidden) return tv;
    return document.getElementById('app');
  }

  function focusables(layer) {
    return [...layer.querySelectorAll('button:not([disabled]), input:not([type=hidden]), [tabindex="0"]')].filter((el) => {
      if (el.closest('[hidden]')) return false;
      if (el.classList.contains('more-btn')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function focusEl(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  function focusDefault() {
    const layer = activeLayer();
    const hub = layer.querySelector && layer.querySelector('#guide .gd-page.active, #hubView:not([hidden]) [data-k="hero:play"], #hubView:not([hidden]) .hub-tile, #libraryView:not([hidden]) .lr-card, #libraryView:not([hidden]) .hub-tile');
    const first = hub || layer.querySelector('.card') || layer.querySelector('.tile') || layer.querySelector('.hero .btn') || focusables(layer)[0];
    focusEl(first);
  }

  function move(dir) {
    const layer = activeLayer();
    const els = focusables(layer);
    if (!els.length) return;
    const cur = document.activeElement;
    if (!cur || !els.includes(cur)) return focusDefault();
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const x = q.left + q.width / 2;
      const y = q.top + q.height / 2;
      let primary;
      let cross;
      if (dir === 'left' || dir === 'right') {
        const d = dir === 'left' ? cx - x : x - cx;
        if (d <= 4) continue;
        primary = dir === 'left' ? Math.max(0, r.left - q.right) : Math.max(0, q.left - r.right);
        cross = Math.max(0, q.top - r.bottom, r.top - q.bottom) * 3 + Math.abs(y - cy) * 0.3;
      } else {
        const d = dir === 'up' ? cy - y : y - cy;
        if (d <= 4) continue;
        primary = dir === 'up' ? Math.max(0, r.top - q.bottom) : Math.max(0, q.top - r.bottom);
        cross = Math.max(0, q.left - r.right, r.left - q.right) * 3 + Math.abs(x - cx) * 0.3;
      }
      const score = primary + cross * 2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) focusEl(best);
  }

  window.spatial = { move, focusDefault, focusEl, activeLayer };

  // ---------- keyboard ----------
  const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  document.addEventListener('keydown', (e) => {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    const t = e.target;
    const typing = t && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'button';
    if (typing && (dir === 'left' || dir === 'right')) return;
    if (t && t.type === 'range') return;
    e.preventDefault();
    move(dir);
  });

  // ---------- controller ----------
  const BUTTONS = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'view', 9: 'menu' };
  const prev = {};
  const hold = {};
  let announced = false;

  function setPadMode(on) {
    document.body.classList.toggle('pad', on);
    const hints = document.getElementById('padHints');
    if (hints) hints.hidden = !on;
  }

  let lastMouse = null;
  window.addEventListener('mousemove', (e) => {
    const p = `${e.screenX},${e.screenY}`;
    if (lastMouse && lastMouse !== p) setPadMode(false);
    lastMouse = p;
  });

  window.addEventListener('gamepadconnected', (e) => {
    if (!announced && window.showToast) window.showToast(`Controller connected: ${e.gamepad.id.replace(/\(.*\)/, '').trim() || 'Gamepad'}`);
    announced = true;
  });

  function repeat(name, on, now, fn) {
    if (!on) { delete hold[name]; return; }
    if (!hold[name]) { hold[name] = now + 380; fn(); return; }
    if (now >= hold[name]) { hold[name] = now + 85; fn(); }
  }

  function poll(now) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (pads.length && document.hasFocus()) {
      const pressed = (i) => pads.some((g) => g.buttons[i] && g.buttons[i].pressed);
      const axis = (i) => {
        for (const g of pads) { const v = g.axes[i] || 0; if (Math.abs(v) > 0.5) return v; }
        return 0;
      };
      const dirs = {
        up: pressed(12) || axis(1) < -0.5,
        down: pressed(13) || axis(1) > 0.5,
        left: pressed(14) || axis(0) < -0.5,
        right: pressed(15) || axis(0) > 0.5,
      };
      // A mini game in the Arcade takes the controller while it is open.
      if (window.arcadeInput) {
        for (const [d, on] of Object.entries(dirs)) {
          const first = on && !hold[d];
          repeat(d, on, now, () => window.arcadeInput(d, !first));
        }
        for (const [i, name] of Object.entries(BUTTONS)) {
          const on = pressed(+i);
          if (on && !prev[name]) window.arcadeInput(name, false);
          prev[name] = on;
        }
        requestAnimationFrame(poll);
        return;
      }
      for (const [d, on] of Object.entries(dirs)) {
        repeat(d, on, now, () => {
          if (!document.body.classList.contains('pad')) { setPadMode(true); if (!document.activeElement || document.activeElement === document.body) return focusDefault(); }
          move(d);
        });
      }
      for (const [i, name] of Object.entries(BUTTONS)) {
        const on = pressed(+i);
        if (on && !prev[name]) {
          setPadMode(true);
          const fn = window.padActions && window.padActions[name];
          if (fn) fn();
        }
        prev[name] = on;
      }
      // Right stick scrolls the page.
      let ry = 0;
      for (const g of pads) { const v = g.axes[3] || 0; if (Math.abs(v) > 0.25) ry = v; }
      if (ry) {
        const tv = document.getElementById('tv');
        const scroller = document.querySelector('#modalRoot .modal-body') || document.getElementById('content');
        scroller.scrollBy({ top: ry * 22, behavior: 'auto' });
      }
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
})();
