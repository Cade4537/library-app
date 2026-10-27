// Owned Ubisoft games from Ubisoft Connect's local product cache (the same file Playnite reads).
// Ubisoft Connect must have been opened and signed in at least once on this PC.
const path = require('path');
const os = require('os');
const YAML = require('yaml');
const { fsp } = require('../util');

// Tiny protobuf reader: the cache is a list of { 1: uplay id, 2: install id, 3: product YAML }.
function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80 && pos < buf.length);
  return [result, pos];
}

function* fields(buf) {
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) { let v; [v, pos] = readVarint(buf, pos); yield [field, v]; }
    else if (wire === 2) { let len; [len, pos] = readVarint(buf, pos); yield [field, buf.subarray(pos, pos + len)]; pos += len; }
    else if (wire === 1) { pos += 8; }
    else if (wire === 5) { pos += 4; }
    else break;
  }
}

function parseCache(buf) {
  const out = [];
  for (const [f, v] of fields(buf)) {
    if (f !== 1 || !Buffer.isBuffer(v)) continue;
    const g = {};
    for (const [ff, vv] of fields(v)) {
      if (ff === 1) g.uplayId = vv;
      else if (ff === 2) g.installId = vv;
      else if (ff === 3 && Buffer.isBuffer(vv)) g.yaml = vv.toString('utf8');
    }
    if (g.uplayId && g.yaml) out.push(g);
  }
  return out;
}

function clean(name) {
  return String(name || '').replace(/[™®©]/g, '').trim();
}

async function scanUbisoftOwned(ctx) {
  if (ctx.settings.ubisoftOwned === false) return { skipped: true };
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(local, 'Ubisoft Game Launcher', 'cache', 'configuration', 'configurations'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Ubisoft', 'Ubisoft Game Launcher', 'cache', 'configuration', 'configurations'),
  ];
  let buf = null;
  for (const c of candidates) {
    try { buf = await fsp.readFile(c); break; } catch {}
  }
  if (!buf) return { skipped: true };

  const products = [];
  for (const g of parseCache(buf)) {
    let doc;
    try { doc = YAML.parse(g.yaml, { strict: false, uniqueKeys: false }); } catch { continue; }
    if (!doc || !doc.root) continue;
    products.push({ id: g.uplayId, root: doc.root, loc: (doc.localizations && doc.localizations.default) || {} });
  }
  // Same rules as Playnite: skip DLC, add-ons, and games that really live on Steam or Epic.
  const dlc = new Set();
  for (const p of products) for (const a of p.root.addons || []) if (a && a.id) dlc.add(Number(a.id));
  const out = [];
  for (const p of products) {
    const r = p.root;
    if (r.third_party_platform || r.is_ulc || dlc.has(p.id) || !r.start_game) continue;
    const name = clean(p.loc[r.name] || r.name);
    if (!name || /^[A-Z0-9_]+$/.test(name)) continue;
    out.push({
      id: `ubisoft:${p.id}`,
      source: 'ubisoft',
      name,
      launch: { type: 'url', target: `uplay://launch/${p.id}/0` },
    });
  }
  return { entries: out };
}

module.exports = { scanUbisoftOwned, parseCache };
