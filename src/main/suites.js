// Groups apps that belong together (DaVinci and its Blackmagic tools, Adobe, Office...).
// "merge" suites show one main card; the rest become Related apps under it.
// "folder" suites get their own category; real apps stay visible, helpers go under the suite's main app.
const path = require('path');
const { similarity } = require('./util');

const HELPER_WORDS = /\b(player|viewer|helper|server|monitor|updater|update|settings|config(uration)?|control panels?|setup|utility|utilities|tools?|service|agent|crash|report(er)?|diagnos\w*|benchmark|manager|uninstall\w*|repair|license|activation|proxy|render node|daemon|console|command prompt|safe mode|debug|logs?|documentation|readme|sdk|samples?|compare|telemetry|cleaner|invoker|genuine)\b/i;

const KNOWN = [
  {
    id: 'davinci',
    name: 'DaVinci Resolve',
    mode: 'merge',
    category: 'Apps/Creative/Video',
    test: (e) => /davinci|blackmagic|fairlight|fusion (render|studio)/i.test(e.name) || /\\blackmagic design\\/i.test(e.target) || /^blackmagic design/i.test(e.folder),
    main: (e) => /\\resolve\.exe$/i.test(e.target) || (/davinci resolve/i.test(e.name) && !HELPER_WORDS.test(e.name) && !/project server|remote|monitor|panels|keyboard|speed editor/i.test(e.name)),
  },
  {
    id: 'adobe',
    name: 'Adobe',
    mode: 'folder',
    category: 'Apps/Creative/Adobe',
    test: (e) => /\badobe\b/i.test(e.name) || /\\adobe\\/i.test(e.target) || /^creative cloud/i.test(e.name) || /^adobe/i.test(e.folder),
    helper: /(gc invoker|gc client|genuine|crash|cef ?helper|uninstall|cleaner|core ?sync|ipc broker|desktop service|application manager|updater|log transport|notification|acrobat distiller|ccx|collab|uxp|unlicensed|adobe installer)/i,
    main: (e) => /^(adobe )?creative cloud( desktop)?$/i.test(e.name),
  },
  {
    id: 'office',
    name: 'Microsoft Office',
    mode: 'folder',
    category: 'Apps/Productivity/Microsoft Office',
    test: (e) => /\\microsoft office\\/i.test(e.target) || /^microsoft office/i.test(e.folder) || /^(word|excel|powerpoint|outlook( \(classic\))?|onenote|access|publisher|project|visio)( \d{4})?$/i.test(e.name),
    helper: /(office tools|telemetry|database compare|spreadsheet compare|language preferences|upload center|picture manager|recording manager|skype for business|lync|office language|send to onenote)/i,
    isHelperFolder: /office tools/i,
    main: (e) => /^word( \d{4})?$/i.test(e.name),
  },
  {
    id: 'aitum',
    name: 'Aitum',
    mode: 'folder',
    category: 'Apps/Streaming/Aitum',
    test: (e) => /aitum|vertical canvas/i.test(e.name) || /^(aitum|vertical-canvas)/i.test(e.folder),
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    mode: 'merge',
    category: 'Apps/Development',
    test: (e) => /^node\.js/i.test(e.folder) || /^node\.js/i.test(e.name) || /additional tools for node/i.test(e.name),
    main: (e) => /^node\.js command prompt$/i.test(e.name),
    fallbackMain: (e) => /^node\.js$/i.test(e.name),
  },
  {
    id: 'java',
    name: 'Java',
    mode: 'merge',
    category: 'Apps/Development',
    test: (e) => /^java/i.test(e.folder),
    main: () => false,
  },
];

const info = (e) => ({ name: e.name, target: (e.meta && e.meta.target) || '', folder: (e.meta && e.meta.folder) || '' });

function setHelper(e, main, suiteName) {
  e.parentId = main.id;
  e.suiteName = suiteName;
}

function pickMain(group, suite) {
  const by = (fn) => fn && group.find((e) => fn(info(e)));
  return by(suite.main) || by(suite.fallbackMain) || null;
}

function applyKnown(entries) {
  const used = new Set();
  for (const suite of KNOWN) {
    const group = entries.filter((e) => !used.has(e) && suite.test(info(e)));
    if (!group.length) continue;
    group.forEach((e) => used.add(e));
    for (const e of group) {
      e.defaultCategory = suite.category;
      e.suiteId = suite.id;
    }
    let main = pickMain(group, suite);
    if (suite.mode === 'merge') {
      if (!main) {
        // No known main app: pick the one that is not a helper and best matches the suite name.
        const cands = group.filter((e) => !HELPER_WORDS.test(e.name));
        main = (cands.length ? cands : group).slice().sort((a, b) => similarity(b.name, suite.name) - similarity(a.name, suite.name) || a.name.length - b.name.length)[0];
      }
      for (const e of group) if (e !== main) setHelper(e, main, suite.name);
    } else {
      const isHelper = (e) => {
        const i = info(e);
        return (suite.helper && suite.helper.test(e.name)) || (suite.isHelperFolder && suite.isHelperFolder.test(i.folder));
      };
      const parent = main || group.find((e) => !isHelper(e));
      if (parent) for (const e of group) if (e !== parent && isHelper(e)) setHelper(e, parent, suite.name);
    }
  }
  return used;
}

// For Start Menu folders without a rule: keep real apps, tuck helper tools under the main one.
function applyAuto(entries, used) {
  const byFolder = new Map();
  for (const e of entries) {
    if (used.has(e) || e.source !== 'app') continue;
    const folder = info(e).folder.split(/[\\/]/)[0];
    if (!folder) continue;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(e);
  }
  for (const [folder, group] of byFolder) {
    if (group.length < 2) continue;
    const helpers = group.filter((e) => HELPER_WORDS.test(e.name));
    const apps = group.filter((e) => !HELPER_WORDS.test(e.name));
    if (!helpers.length) continue; // several real apps from one vendor stay separate
    let main;
    if (apps.length === 1) main = apps[0];
    else if (apps.length > 1) {
      main = apps.slice().sort((a, b) => similarity(b.name, folder) - similarity(a.name, folder) || a.name.length - b.name.length)[0];
    } else {
      main = helpers.slice().sort((a, b) => similarity(b.name, folder) - similarity(a.name, folder) || a.name.length - b.name.length)[0];
    }
    for (const e of helpers) if (e !== main) setHelper(e, main, folder);
  }
}

function applySuites(appEntries) {
  const used = applyKnown(appEntries);
  applyAuto(appEntries, used);
  return appEntries;
}

module.exports = { applySuites };
