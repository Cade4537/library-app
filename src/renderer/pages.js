/* global S, $, h, icon, fillEl, showToast, norm, render */
// 0.16.0: Settings as a full page, with a section list, a search box and a save bar.

// Draws the settings content (built by buildSettingsPage in app.js) into the Settings page.
function showSettingsPage({ body, actions }) {
  const box = $('#settingsView');
  if (!box) return;
  S.settingsDirty = false;
  // Give every section an anchor for the list on the left.
  const labels = [...body.querySelectorAll('.section-label')];
  labels.forEach((l, i) => { l.id = `set-${i}`; });
  const icons = { connections: 'link', look: 'image', app: 'gear', alerts: 'bell', 'phone remote': 'monitor', 'quality of life': 'sparkle', health: 'chart', music: 'music', discord: 'chat', updates: 'refresh' };
  const navBtns = labels.map((l) => h('button', { class: 'set-nav-btn', 'data-for': l.id, onclick: () => { l.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    icon(icons[l.textContent.trim().toLowerCase()] || 'gear'), h('span', {}, l.textContent)));
  const search = h('input', { class: 'text-input set-search', placeholder: 'Search settings', spellcheck: 'false', type: 'search' });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  search.addEventListener('input', () => {
    const q = norm(search.value);
    let shown = 0;
    // Each section label and the fields after it, until the next label.
    let section = null, sectionHas = false;
    const finish = () => { if (section) section.hidden = !!q && !sectionHas; };
    for (const el of body.children) {
      if (el.classList.contains('section-label')) { finish(); section = el; sectionHas = false; continue; }
      const hit = !q || norm(el.textContent).includes(q);
      el.hidden = !hit;
      if (hit) { sectionHas = true; shown++; }
    }
    finish();
    empty.hidden = shown > 0;
  });
  const empty = h('div', { class: 'set-empty', hidden: true }, 'No settings match that search.');
  const status = h('span', { class: 'set-status' }, 'All changes saved');
  const mk = (a) => h('button', { class: 'btn' + (a.primary ? ' primary' : ''), onclick: async () => {
    if (a.label === 'Cancel') { buildSettingsPage(); showToast('Changes undone'); return; }
    const r = a.run ? await a.run() : undefined;
    if (a.primary && r !== false) { S.settingsDirty = false; bar.classList.remove('dirty'); status.textContent = 'All changes saved'; }
  } }, a.label === 'Cancel' ? 'Undo changes' : a.label);
  const save = actions.find((a) => a.primary);
  S.settingsSave = async (quiet) => { if (save && save.run) { await save.run(); S.settingsDirty = false; if (!quiet) showToast('Settings saved'); } };
  const bar = h('div', { class: 'set-bar' },
    h('div', { class: 'set-bar-left' }, actions.filter((a) => a.left).map(mk)),
    status,
    h('div', { class: 'set-bar-right' }, actions.filter((a) => !a.left).map(mk)));
  const markDirty = () => { if (!S.settingsDirty) { S.settingsDirty = true; bar.classList.add('dirty'); status.textContent = 'Unsaved changes'; } };
  body.addEventListener('input', (e) => { if (e.target !== search) markDirty(); });
  body.addEventListener('click', (e) => { if (e.target.closest('.toggle, .seg button, .size-ctl')) markDirty(); });
  const nav = h('nav', { class: 'set-nav' }, search, navBtns);
  fillEl(box, h('div', { class: 'set-layout' }, nav, h('div', { class: 'set-main' }, body, empty)), bar);
  body.classList.add('set-body');
  // Highlight the section you are reading.
  const content = $('#content');
  const spy = () => {
    if (S.view.type !== 'settings') return;
    let cur = labels[0];
    for (const l of labels) if (l.getBoundingClientRect().top < 160) cur = l;
    for (const b of navBtns) b.classList.toggle('on', cur && b.dataset.for === cur.id);
  };
  content.removeEventListener('scroll', S.settingsSpy || (() => {}));
  S.settingsSpy = spy;
  content.addEventListener('scroll', spy, { passive: true });
  spy();
}
