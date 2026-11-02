// Finds cover art and icons for items and keeps them in a local cache folder.
// Order for games: launcher hint, local Steam cache, Steam CDN, SteamGridDB, Steam store search.
const path = require('path');
const { fsp, exists, listDir, hash, similarity, runPowerShell } = require('./util');

const SGDB = 'https://www.steamgriddb.com/api/v2';
const STEAM_ASSETS = [
  (id) => `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900_2x.jpg`,
  (id) => `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`,
  (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`,
  (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
];
const steamHeader = (id) => `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`;
const steamPortraitUrl = STEAM_ASSETS[0];

class CoverService {
  constructor({ store, cacheDir, getFileIcon }) {
    this.store = store;
    this.dir = path.join(cacheDir, 'covers');
    this.iconDir = path.join(cacheDir, 'icons');
    this.getFileIcon = getFileIcon;
    this.queue = [];
    this.queued = new Set();
    this.active = 0;
    this.keyError = false;
  }

  get key() {
    return String(this.store.data.settings.steamGridDbKey || '').trim();
  }

  async init() {
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.mkdir(this.iconDir, { recursive: true });
  }

  queueAll() {
    for (const id of Object.keys(this.store.data.items)) this.enqueue(id);
  }

  enqueue(id) {
    if (this.queued.has(id)) return;
    this.queued.add(id);
    this.queue.push(id);
    this.pump();
  }

  pump() {
    while (this.active < 4 && this.queue.length) {
      const id = this.queue.shift();
      this.active++;
      this.process(id)
        .catch((e) => console.error('cover', id, e.message))
        .finally(() => {
          this.active--;
          this.queued.delete(id);
          this.pump();
        });
    }
  }

  async process(id) {
    const it = this.store.data.items[id];
    if (!it) return;
    let changed = false;
    if (it.iconPath && it.icon == null) {
      it.icon = (await this.makeIcon(it.iconPath, it.id)) || '';
      changed = true;
    }
    if (it.cover && !(await exists(it.cover))) {
      it.cover = null;
      changed = true;
    }
    if (!it.cover && !it.coverLocked && (it.coverTried || 0) < this.store.data.coverEpoch) {
      const r = await this.findCover(it);
      it.coverTried = this.store.data.coverEpoch;
      if (r) {
        it.cover = r.file;
        it.coverFit = r.fit || 'cover';
      }
      changed = true;
    }
    // No art anywhere: take the big icon from the program, shortcut or Store app instead.
    if (!it.cover && !it.iconXlTried && process.platform === 'win32' && (it.iconPath || (it.launch && it.launch.type === 'aumid' && it.launch.target))) this.queueXl(it);
    if (changed) this.store.changed();
  }

  // Windows hands out large icons (up to 256 px) for any file, shortcut or Store app.
  // They are collected and read in one PowerShell run, to keep things light.
  queueXl(it) {
    this.xlQueue = this.xlQueue || new Map();
    this.xlQueue.set(it.id, it);
    clearTimeout(this.xlTimer);
    this.xlTimer = setTimeout(() => this.runXl().catch(() => {}), 2500);
  }
  async runXl() {
    if (this.xlBusy) { this.xlTimer = setTimeout(() => this.runXl().catch(() => {}), 3000); return; }
    const batch = [...this.xlQueue.values()].slice(0, 40);
    if (!batch.length) return;
    this.xlBusy = true;
    for (const it of batch) this.xlQueue.delete(it.id);
    const jobs = batch.map((it) => ({ id: it.id, src: it.launch && it.launch.type === 'aumid' ? `shell:AppsFolder\\${it.launch.target}` : it.iconPath, out: path.join(this.iconDir, `${hash(it.id)}_xl.png`) }));
    const list = jobs.map((j) => `@('${String(j.src).replace(/'/g, "''")}','${j.out.replace(/'/g, "''")}')`).join(',');
    const out = await runPowerShell(`${XL_SCRIPT}
$jobs = @(${list})
foreach ($j in $jobs) { try { $c = [CvIcon]::Save($j[0], $j[1], 256); Write-Output "$($j[1])|$c" } catch { Write-Output "$($j[1])|" } }`, 90000);
    if (out == null) { this.xlBusy = false; return; }
    const res = new Map(String(out || '').split(/\r?\n/).filter((l) => l.includes('|')).map((l) => { const [f, c] = l.trim().split('|'); return [f, c]; }));
    for (const j of jobs) {
      const it = this.store.data.items[j.id];
      if (!it) continue;
      it.iconXlTried = true;
      const color = res.get(j.out);
      if (color && await exists(j.out)) { it.iconXl = j.out; it.iconColor = color; }
    }
    this.xlBusy = false;
    this.store.changed();
    if (this.xlQueue.size) this.runXl().catch(() => {});
  }

  // ---------- finding art ----------
  async findCover(it) {
    const name = it.customName || it.name;
    if (it.coverHint) {
      const f = await this.fromHint(it.coverHint, it.id);
      if (f) return { file: f, fit: it.coverHintFit || 'cover' };
    }
    if (it.steamAppId) {
      const f = (await this.steamLocal(it.steamAppId, it.meta && it.meta.steamPath, it.id)) || (await this.steamCdn(it.steamAppId, it.id));
      if (f) return { file: f };
    }
    if (this.key) {
      try {
        if (it.steamAppId) {
          const grids = await this.sgdbGrids(it.steamAppId, 'steam');
          if (grids[0]) {
            const f = await this.download(grids[0].url, it.id);
            if (f) return { file: f };
          }
        }
        const f = await this.sgdbByName(name, it.id, it.kind === 'game' ? 0.34 : 0.6);
        if (f) return { file: f };
      } catch (e) {
        if (e.message === 'badkey') this.keyError = true;
      }
    }
    if (it.kind === 'game' && !it.steamAppId) {
      const appid = await this.steamSearch(name);
      if (appid) {
        const f = await this.steamCdn(appid, it.id);
        if (f) return { file: f };
      }
    }
    if (it.steamAppId) {
      const f = await this.download(steamHeader(it.steamAppId), it.id);
      if (f) return { file: f, fit: 'contain' };
    }
    return null;
  }

  async fromHint(hint, id) {
    if (/^https?:\/\//i.test(hint)) return this.download(hint, id);
    if (await exists(hint)) return this.copyIn(hint, id);
    return null;
  }

  async steamLocal(appid, steamPath, id) {
    if (!steamPath) return null;
    const lc = path.join(steamPath, 'appcache', 'librarycache');
    const direct = [path.join(lc, `${appid}_library_600x900.jpg`), path.join(lc, String(appid), 'library_600x900.jpg')];
    for (const c of direct) if (await exists(c)) return this.copyIn(c, id);
    // Newer Steam clients keep art in hashed subfolders.
    const base = path.join(lc, String(appid));
    for (const e of await listDir(base)) {
      if (e.isDirectory()) {
        for (const f of await listDir(path.join(base, e.name))) {
          if (/^library_600x900(_2x)?\.jpg$/i.test(f.name)) return this.copyIn(path.join(base, e.name, f.name), id);
        }
      }
    }
    return null;
  }

  async steamCdn(appid, id) {
    for (const u of STEAM_ASSETS) {
      const f = await this.download(u(appid), id);
      if (f) return f;
    }
    return null;
  }

  async steamSearchList(term) {
    try {
      const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j.items) ? j.items : [];
    } catch {
      return [];
    }
  }

  async steamSearch(name) {
    const items = await this.steamSearchList(name);
    let best = null;
    let score = 0;
    for (const x of items) {
      const s = similarity(name, x.name);
      if (s > score) { score = s; best = x; }
    }
    return best && score >= 0.75 ? best.id : null;
  }

  async sgdb(q) {
    const res = await fetch(SGDB + q, {
      headers: { Authorization: `Bearer ${this.key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) throw new Error('badkey');
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.success ? j.data : null;
  }

  async sgdbGrids(gameId, by = 'game') {
    const d = await this.sgdb(`/grids/${by}/${gameId}?dimensions=600x900,342x482,660x930&types=static&nsfw=false&humor=false`);
    return Array.isArray(d) ? d : [];
  }

  async sgdbByName(name, id, minScore) {
    const games = await this.sgdb(`/search/autocomplete/${encodeURIComponent(name)}`);
    if (!Array.isArray(games) || !games.length) return null;
    let best = games[0];
    let score = similarity(name, best.name);
    for (const g of games.slice(1, 5)) {
      const s = similarity(name, g.name);
      if (s > score) { score = s; best = g; }
    }
    if (score < minScore) return null;
    const grids = await this.sgdbGrids(best.id);
    return grids[0] ? this.download(grids[0].url, id) : null;
  }

  // ---------- picking art by hand ----------
  async options(itemId, term) {
    const it = this.store.data.items[itemId];
    const q = String(term || (it && (it.customName || it.name)) || '').trim();
    const result = { term: q, sgdb: [], steam: [], keyMissing: !this.key, error: null };
    if (!q) return result;
    const steamP = this.steamSearchList(q).then((items) =>
      items.slice(0, 8).map((x) => ({ url: steamPortraitUrl(x.id), thumb: steamPortraitUrl(x.id).replace('_2x', ''), label: x.name }))
    );
    if (this.key) {
      try {
        const games = (await this.sgdb(`/search/autocomplete/${encodeURIComponent(q)}`)) || [];
        const lists = await Promise.all(games.slice(0, 3).map((g) => this.sgdbGrids(g.id).then((gr) => gr.slice(0, 15).map((x) => ({ url: x.url, thumb: x.thumb || x.url, label: g.name })))));
        result.sgdb = lists.flat();
      } catch (e) {
        result.error = e.message === 'badkey' ? 'Your SteamGridDB key was rejected. Check it in Settings.' : 'SteamGridDB could not be reached.';
      }
    }
    if (it && it.steamAppId) {
      result.steam.push({ url: steamPortraitUrl(it.steamAppId), thumb: steamPortraitUrl(it.steamAppId).replace('_2x', ''), label: 'This game on Steam' });
    }
    result.steam.push(...(await steamP));
    return result;
  }

  async apply(itemId, url) {
    const it = this.store.data.items[itemId];
    if (!it) return false;
    const f = await this.download(url, itemId);
    if (!f) return false;
    await this.setCover(it, f, 'cover', true);
    return true;
  }

  async applyFile(itemId, filePath) {
    const it = this.store.data.items[itemId];
    if (!it || !filePath) return false;
    const f = await this.copyIn(filePath, itemId);
    if (!f) return false;
    await this.setCover(it, f, 'cover', true);
    return true;
  }

  async reset(itemId) {
    const it = this.store.data.items[itemId];
    if (!it) return;
    await this.removeFile(it.cover);
    it.cover = null;
    it.coverLocked = false;
    it.coverTried = 0;
    this.store.changed();
    this.enqueue(itemId);
  }

  refetchMissing() {
    this.store.data.coverEpoch += 1;
    this.store.changed();
    this.queueAll();
  }

  async setCover(it, file, fit, locked) {
    if (it.cover && it.cover !== file) await this.removeFile(it.cover);
    it.cover = file;
    it.coverFit = fit;
    it.coverLocked = !!locked;
    this.store.changed();
  }

  async removeFile(f) {
    if (f && path.resolve(f).startsWith(path.resolve(this.dir))) {
      try { await fsp.unlink(f); } catch {}
    }
  }

  // ---------- files ----------
  async download(url, id) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'LibraryApp/0.1' } });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) return null;
      const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
      return this.write(id, buf, ext);
    } catch {
      return null;
    }
  }

  async copyIn(src, id) {
    try {
      const buf = await fsp.readFile(src);
      const ext = (path.extname(src) || '.jpg').toLowerCase();
      return this.write(id, buf, ext);
    } catch {
      return null;
    }
  }

  async write(id, buf, ext) {
    const f = path.join(this.dir, `${hash(id)}-${Date.now().toString(36)}${ext}`);
    await fsp.writeFile(f, buf);
    return f;
  }

  async makeIcon(iconPath, id) {
    try {
      const img = await this.getFileIcon(iconPath, { size: 'large' });
      if (!img || img.isEmpty()) return null;
      const f = path.join(this.iconDir, `${hash(id)}.png`);
      await fsp.writeFile(f, img.toPNG());
      return f;
    } catch {
      return null;
    }
  }
}

// C#: asks the Windows shell for a big icon, keeps its transparency, saves it as PNG,
// and returns the icon's main color (for the card background).
const XL_SCRIPT = String.raw`
Add-Type -ReferencedAssemblies System.Drawing @'
using System; using System.Runtime.InteropServices; using System.Drawing; using System.Drawing.Imaging;
[ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ICvImageFactory { [PreserveSig] int GetImage(CvSize size, int flags, out IntPtr phbm); }
[StructLayout(LayoutKind.Sequential)] public struct CvSize { public int cx; public int cy; }
public static class CvIcon {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out ICvImageFactory ppv);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  public static string Save(string src, string dst, int px) {
    ICvImageFactory f;
    SHCreateItemFromParsingName(src, IntPtr.Zero, typeof(ICvImageFactory).GUID, out f);
    IntPtr hb;
    if (f.GetImage(new CvSize { cx = px, cy = px }, 4, out hb) != 0) return "";
    try {
      using (Bitmap raw = Image.FromHbitmap(hb)) {
        BitmapData d = raw.LockBits(new Rectangle(0, 0, raw.Width, raw.Height), ImageLockMode.ReadOnly, raw.PixelFormat);
        try {
          using (Bitmap argb = new Bitmap(d.Width, d.Height, d.Stride, PixelFormat.Format32bppArgb, d.Scan0)) {
            long r = 0, g = 0, b = 0, n = 0;
            for (int y = 0; y < argb.Height; y += 4) for (int x = 0; x < argb.Width; x += 4) {
              Color c = argb.GetPixel(x, y);
              if (c.A < 200) continue;
              int mx = Math.Max(c.R, Math.Max(c.G, c.B)), mn = Math.Min(c.R, Math.Min(c.G, c.B));
              if (mx - mn < 30 || mx < 50) continue;
              r += c.R; g += c.G; b += c.B; n++;
            }
            argb.Save(dst, ImageFormat.Png);
            if (n == 0) return "#3a3a42";
            return String.Format("#{0:x2}{1:x2}{2:x2}", r / n, g / n, b / n);
          }
        } finally { raw.UnlockBits(d); }
      }
    } finally { DeleteObject(hb); }
  }
}
'@
`;

module.exports = { CoverService };
