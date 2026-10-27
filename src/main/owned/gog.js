// Reads the GOG library from GOG Galaxy's local database (no sign in needed).
const path = require('path');
const { fsp, exists } = require('../util');

let sqlPromise = null;
function loadSql() {
  if (!sqlPromise) {
    const initSqlJs = require('sql.js');
    const dist = path.dirname(require.resolve('sql.js'));
    sqlPromise = initSqlJs({ locateFile: (f) => path.join(dist, f) });
  }
  return sqlPromise;
}

function rows(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

function parse(v) {
  try { return JSON.parse(v); } catch { return null; }
}

async function scanGogOwned(ctx) {
  if (ctx.settings.gogOwned === false) return { skipped: true };
  const dbPath = path.join(process.env.ProgramData || 'C:\\ProgramData', 'GOG.com', 'Galaxy', 'storage', 'galaxy-2.0.db');
  if (!(await exists(dbPath))) return { skipped: true };
  const SQL = await loadSql();
  const db = new SQL.Database(await fsp.readFile(dbPath));
  try {
    const keys = rows(db, "SELECT DISTINCT releaseKey FROM LibraryReleases WHERE releaseKey LIKE 'gog\\_%' ESCAPE '\\'").map((r) => r.releaseKey);
    if (!keys.length) return { entries: [] };
    let dlc = new Set();
    try {
      dlc = new Set(rows(db, 'SELECT releaseKey FROM ReleaseProperties WHERE isDlc = 1').map((r) => r.releaseKey));
    } catch {}
    const pieces = rows(
      db,
      `SELECT gp.releaseKey AS k, gpt.type AS t, gp.value AS v FROM GamePieces gp JOIN GamePieceTypes gpt ON gp.gamePieceTypeId = gpt.id
       WHERE gpt.type IN ('title', 'originalTitle', 'originalImages', 'allGameReleases') AND gp.releaseKey LIKE 'gog\\_%' ESCAPE '\\'`
    );
    const info = new Map();
    for (const p of pieces) {
      if (!info.has(p.k)) info.set(p.k, {});
      info.get(p.k)[p.t] = parse(p.v);
    }
    const out = [];
    for (const k of keys) {
      if (dlc.has(k)) continue;
      const i = info.get(k) || {};
      const name = (i.title && i.title.title) || (i.originalTitle && i.originalTitle.title);
      if (!name) continue;
      const id = k.slice(4);
      const imgs = i.originalImages || {};
      out.push({
        id: `gog:${id}`,
        source: 'gog',
        name,
        launch: { type: 'url', target: `goggalaxy://openGameView/${k}` },
        coverHint: imgs.verticalCover || null,
      });
    }
    return { entries: out };
  } finally {
    db.close();
  }
}

module.exports = { scanGogOwned };
