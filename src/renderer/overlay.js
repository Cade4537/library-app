/* global api, S, prefs, openGuide, closeGuide, toggleGuide, setView, openDetails, openSettings, launch */
// 0.18.2: the guide overlay. The guide hotkey (Ctrl+Alt+G by default) opens the guide over whatever is on
// screen while Crimson Vault is minimized or in the tray. That window loads this same page with
// ?overlay=1 and shows only the guide; anything that needs the full app is handed to the main window.

const OV = { on: !!(window.library && window.library.isOverlay), open: false };

if (OV.on) {
  document.documentElement.classList.add('overlay-mode');
  document.body.classList.add('overlay-mode');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!OV.on) {
    // ----- main window: commands from the overlay and the guide hotkey -----
    if (api.onCommand) {
      api.onCommand((c) => {
        if (c === 'guide') { toggleGuide(); return; }
        if (!c || typeof c !== 'object') return;
        if (S.guideOpen) closeGuide();
        if (c.view) setView(c.view);
        else if (c.details && S.byId.has(c.details)) openDetails(c.details);
        else if (c.settings) openSettings();
      });
    }
    return;
  }

  // ----- overlay window -----
  // The main window already sends notifications, saves alerts and shows What's new; never twice.
  window.friendAlerts = () => {};
  window.pushAlert = () => {};
  window.whatsNew = () => {};
  const setPref = prefs.set;
  prefs.set = (k, v) => { if (k !== 'seenVersion') setPref(k, v); };

  const realClose = closeGuide;
  window.closeGuide = () => {
    const was = realClose();
    if (OV.open) { OV.open = false; api.overlayHide(); }
    return was;
  };
  // Pages, game details and settings open in the full app.
  const forward = (name, cmd) => {
    const real = window[name];
    if (typeof real !== 'function') return;
    window[name] = (...a) => {
      if (!OV.open) return real(...a);
      const c = cmd(...a);
      if (!c) return real(...a);
      S.guideOpen = false;
      document.body.classList.remove('guide-open');
      OV.open = false;
      api.overlayCommand(c);
      return undefined;
    };
  };
  forward('setView', (v) => (v && typeof v === 'object' ? { view: v } : null));
  forward('openDetails', (id) => (id ? { details: id } : null));
  forward('openSettings', () => ({ settings: true }));
  // Starting a game puts the overlay away.
  if (typeof launch === 'function') {
    const realLaunch = launch;
    window.launch = (...a) => { const r = realLaunch(...a); setTimeout(() => window.closeGuide(), 150); return r; };
  }

  const show = () => {
    OV.open = true;
    // Anything left open from last time (a menu, a dialog) is cleared first.
    document.getElementById('menuRoot')?.replaceChildren();
    if (S.guideOpen) S.guideOpen = false;
    openGuide();
  };
  api.onOverlay((v) => {
    if (v) show();
    else { OV.open = false; if (S.guideOpen) realClose(); }
  });
  // Escape with nothing else open, or a click outside the guide, puts it away.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !OV.open) return;
    if (document.querySelector('#modalRoot .modal-back')) return;
    e.preventDefault();
    window.closeGuide();
  }, true);
});
