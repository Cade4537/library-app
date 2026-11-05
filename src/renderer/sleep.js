/* global prefs, pushAlert, loadDrives */
// 0.16.4: background mode for the page. Loaded before everything else.
// While Crimson Vault is minimized or in the tray, the page's own timers (clocks, music progress,
// drive space, guide refresh) skip their work and animations stop, so it uses almost nothing.
(() => {
  window.__asleep = false;
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...args) => realSetInterval(() => { if (!window.__asleep) fn(...args); }, ms);
  document.addEventListener('DOMContentLoaded', () => {
    const api = window.library;
    if (!api) return;
    if (api.onBackground) api.onBackground((v) => {
      window.__asleep = !!v;
      document.body.classList.toggle('cv-asleep', !!v);
      // Waking up: bring the drive space and clocks up to date straight away.
      if (!v) { try { if (typeof loadDrives === 'function') loadDrives(); } catch {} }
    });
    // Alerts that came in while the window was closed in the tray.
    if (api.pendingAlerts) setTimeout(() => api.pendingAlerts().then((list) => { for (const a of list || []) try { pushAlert(a); } catch {} }).catch(() => {}), 1500);
    // Friend alert settings go to the main process too, which sends the alerts while the window is closed.
    if (api.syncAlerts && typeof prefs !== 'undefined') {
      const sync = () => api.syncAlerts({ on: prefs.get('friendAlerts', true), mode: prefs.get('friendAlertMode', 'owned'), muted: prefs.get('mutedFriends', []) }).catch(() => {});
      const set = prefs.set.bind(prefs);
      prefs.set = (k, v) => { set(k, v); if (['friendAlerts', 'friendAlertMode', 'mutedFriends'].includes(k)) sync(); };
      sync();
    }
  });
})();
