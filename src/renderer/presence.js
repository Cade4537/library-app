/* global api, ARCADE */
// 0.18.5: tells the main process what you are doing in the app, so Discord Rich Presence can show
// the Arcade game you are playing, a Surprise me roll, the page you are browsing, and whether the
// full screen music view is open. Only names of things inside Crimson Vault are sent; the main
// process decides what (if anything) goes to Discord, following your Settings.
(() => {
  if (!window.library || window.library.isOverlay || !window.library.presenceHint) return;
  const hint = { arcade: null, roll: null, view: null, npx: false };
  let last = '';
  const send = () => {
    const k = JSON.stringify(hint);
    if (k !== last) { last = k; window.library.presenceHint({ ...hint }).catch(() => {}); }
  };
  // Clears a hint when its element leaves the page (a game closed, the reel finished).
  const until = (sel, key, off) => {
    const t = setInterval(() => { if (!document.querySelector(sel)) { clearInterval(t); hint[key] = off; send(); } }, 2000);
  };
  const VIEW_NAMES = {
    deals: 'deals and news', stats: 'statistics', arcade: 'the Arcade', anime: 'anime',
    friends: 'friends', storage: 'storage', remoteplay: 'Xbox Remote Play', launchers: 'launchers',
    discord: 'Discord', backlog: 'the backlog',
  };
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = (name, after) => {
      const real = window[name];
      if (typeof real !== 'function') return;
      window[name] = (...a) => { const r = real(...a); try { after(...a); } catch {} return r; };
    };
    wrap('openGame', (id) => {
      setTimeout(() => {
        if (!document.querySelector('.game')) return;
        const g = (typeof ARCADE !== 'undefined' ? ARCADE : []).find((x) => x.id === id);
        hint.arcade = (g && g.name) || 'a mini game';
        send();
        until('.game', 'arcade', null);
      }, 120);
    });
    wrap('spinOverlay', (_pool, _from, ad) => {
      setTimeout(() => {
        if (!document.querySelector('.spin')) return;
        hint.roll = ad ? 'anime' : 'game';
        send();
        until('.spin', 'roll', null);
      }, 120);
    });
    wrap('openNowPlaying', () => {
      setTimeout(() => {
        if (!document.querySelector('.npx')) return;
        hint.npx = true;
        send();
        until('.npx', 'npx', false);
      }, 120);
    });
    wrap('setView', (v) => { hint.view = (v && VIEW_NAMES[v.type]) || null; send(); });
    send();
  });
})();
