const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_TREE } = require('./categorize');

const DEFAULT_SETTINGS = {
  steamGridDbKey: '',
  curseforgeInstancesPath: '',
  includeApps: true,
  musicEnabled: true,
  musicAnyApp: false,
  steamApiKey: '',
  steamId: '',
  gogOwned: true,
  openXblKey: '',
  steamFamily: false,
  ubisoftOwned: true,
  genreSort: true,
  steamCollections: true,
};

const ITEM_PATCH_FIELDS = ['customName', 'favorite', 'hidden', 'categoryId', 'kind', 'ungrouped', 'suiteMain'];

const newId = () => crypto.randomUUID();

class Store {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.onChange = () => {};
    this._timer = null;
    this._backedUp = false;
  }

  load() {
    let d = null;
    try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    if (!d || typeof d !== 'object') d = {};
    d.version = 1;
    d.items = d.items && typeof d.items === 'object' ? d.items : {};
    d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    d.coverEpoch = d.coverEpoch || 1;
    d.ensuredPaths = Array.isArray(d.ensuredPaths) ? d.ensuredPaths : [];
    this.data = d;
    if (!Array.isArray(d.categories)) {
      d.categories = [];
      this.createTree(DEFAULT_TREE, null);
    }
  }

  changed() {
    this.saveSoon();
    this.onChange();
  }

  saveSoon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    clearTimeout(this._timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (!this._backedUp && fs.existsSync(this.file)) {
        fs.copyFileSync(this.file, this.file.replace(/\.json$/, '.backup.json'));
        this._backedUp = true;
      }
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('Saving library failed', e);
    }
  }

  // ---------- categories ----------
  createTree(nodes, parentId) {
    for (const node of nodes) {
      const [name, children] = Array.isArray(node) ? node : [node, []];
      const c = this.addCategory(name, parentId);
      this.createTree(children, c.id);
    }
  }

  cat(id) {
    return this.data.categories.find((c) => c.id === id) || null;
  }

  addCategory(name, parentId = null) {
    const siblings = this.data.categories.filter((c) => c.parentId === parentId);
    const c = { id: newId(), name: String(name).trim() || 'New category', parentId, order: siblings.length };
    this.data.categories.push(c);
    return c;
  }

  renameCategory(id, name) {
    const c = this.cat(id);
    if (c && String(name).trim()) c.name = String(name).trim();
  }

  deleteCategory(id) {
    const c = this.cat(id);
    if (!c) return;
    for (const ch of this.data.categories) if (ch.parentId === id) ch.parentId = c.parentId;
    for (const it of Object.values(this.data.items)) if (it.categoryId === id) it.categoryId = c.parentId;
    this.data.categories = this.data.categories.filter((x) => x.id !== id);
    this.reorder(c.parentId);
  }

  isDescendant(id, ancestorId) {
    let cur = this.cat(id);
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? this.cat(cur.parentId) : null;
    }
    return false;
  }

  moveCategory(id, newParentId, beforeId = null) {
    const c = this.cat(id);
    if (!c) return false;
    if (newParentId && this.isDescendant(newParentId, id)) return false; // no loops
    const oldParent = c.parentId;
    c.parentId = newParentId || null;
    const sibs = this.data.categories.filter((x) => x.parentId === c.parentId && x.id !== id).sort((a, b) => a.order - b.order);
    const idx = beforeId ? sibs.findIndex((s) => s.id === beforeId) : -1;
    if (idx >= 0) sibs.splice(idx, 0, c); else sibs.push(c);
    sibs.forEach((s, i) => (s.order = i));
    this.reorder(oldParent);
    return true;
  }

  reorder(parentId) {
    this.data.categories
      .filter((x) => x.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach((s, i) => (s.order = i));
  }

  rootOf(id) {
    let cur = this.cat(id);
    while (cur && cur.parentId) cur = this.cat(cur.parentId);
    return cur;
  }

  // Resolves "Apps/Creative/Photography" to the deepest category that still exists.
  resolveCategoryPath(p) {
    if (!p) return null;
    let parent = null;
    let found = null;
    for (const part of p.split('/')) {
      const c = this.data.categories.find((x) => x.parentId === parent && x.name.toLowerCase() === part.toLowerCase());
      if (!c) break;
      found = c.id;
      parent = c.id;
    }
    return found;
  }

  // Creates a category path (like "Apps/Creative/Adobe") the first time a suite needs it.
  // If the user deletes it later it is not recreated.
  ensureCategoryPath(p) {
    if (!p || this.data.ensuredPaths.includes(p)) return;
    this.data.ensuredPaths.push(p);
    let parent = null;
    for (const part of p.split('/')) {
      let c = this.data.categories.find((x) => x.parentId === parent && x.name.toLowerCase() === part.toLowerCase());
      if (!c) c = this.addCategory(part, parent);
      parent = c.id;
    }
  }

  kindForCategory(catId, fallback) {
    const root = this.rootOf(catId);
    if (!root) return fallback;
    if (/^games$/i.test(root.name)) return 'game';
    if (/^apps$/i.test(root.name)) return 'app';
    return fallback;
  }

  // ---------- items ----------
  // owned: games found in account libraries (Steam, GOG) that may or may not be installed.
  // ownedSources: which account libraries were read successfully this time.
  mergeScan(entries, scannedSources, owned = [], ownedSources = new Set()) {
    const now = Date.now();
    const seen = new Set();
    const installedIds = new Set(entries.map((e) => e.id));
    for (const e of entries) if (e.suiteId && e.defaultCategory) this.ensureCategoryPath(e.defaultCategory);
    for (const e of entries) {
      seen.add(e.id);
      const ex = this.data.items[e.id];
      if (ex) {
        // Items the user never moved follow the latest automatic rules.
        if (ex.catAuto !== false && !ex.manual) {
          const cat = this.resolveCategoryPath(e.defaultCategory || (e.kind === 'game' ? 'Games' : 'Apps'));
          if (cat && cat !== ex.categoryId) {
            ex.categoryId = cat;
            ex.kind = this.kindForCategory(cat, ex.kind);
          }
        }
        ex.defaultCategory = e.defaultCategory || (e.kind === 'game' ? 'Games' : 'Apps');
        ex.parentId = e.parentId || null;
        ex.suiteName = e.suiteName || null;
        ex.suiteId = e.suiteId || null;
        Object.assign(ex, {
          name: e.name,
          launch: e.launch,
          installDir: e.installDir || null,
          iconPath: e.iconPath || null,
          steamAppId: e.steamAppId || ex.steamAppId || null,
          coverHint: e.coverHint || null,
          coverHintFit: e.coverHintFit || null,
          meta: e.meta || {},
          installed: true,
          missing: false,
        });
      } else {
        const categoryId = this.resolveCategoryPath(e.defaultCategory || (e.kind === 'game' ? 'Games' : 'Apps'));
        this.data.items[e.id] = {
          id: e.id,
          source: e.source,
          kind: e.kind,
          name: e.name,
          customName: null,
          launch: e.launch,
          installDir: e.installDir || null,
          iconPath: e.iconPath || null,
          steamAppId: e.steamAppId || null,
          coverHint: e.coverHint || null,
          coverHintFit: e.coverHintFit || null,
          meta: e.meta || {},
          installed: true,
          missing: false,
          manual: false,
          categoryId,
          catAuto: true,
          defaultCategory: e.defaultCategory || (e.kind === 'game' ? 'Games' : 'Apps'),
          parentId: e.parentId || null,
          suiteName: e.suiteName || null,
          suiteId: e.suiteId || null,
          ungrouped: false,
          favorite: false,
          hidden: false,
          addedAt: now,
          lastPlayed: 0,
          playCount: 0,
          cover: null,
          coverFit: 'cover',
          coverLocked: false,
          coverTried: 0,
          icon: null,
        };
      }
    }
    const ownedIds = new Set();
    for (const o of owned) {
      ownedIds.add(o.id);
      const ex = this.data.items[o.id];
      if (ex) {
        ex.owned = true;
        if (o.meta) ex.meta = { ...(ex.meta || {}), ...o.meta };
        if (o.lastPlayed && o.lastPlayed > (ex.lastPlayed || 0)) ex.lastPlayed = o.lastPlayed;
        if (!installedIds.has(o.id) && (scannedSources.has(o.source) || !ex.installed)) {
          // Owned but not installed: clicking it opens the store's install page.
          Object.assign(ex, { name: ex.name || o.name, launch: o.launch, installed: false, missing: false });
          if (o.coverHint && !ex.coverHint) ex.coverHint = o.coverHint;
          if (o.steamAppId) ex.steamAppId = o.steamAppId;
        }
        continue;
      }
      const categoryId = this.resolveCategoryPath('Games');
      this.data.items[o.id] = {
        id: o.id, source: o.source, kind: 'game', name: o.name, customName: null,
        launch: o.launch, installDir: null, iconPath: null,
        steamAppId: o.steamAppId || null, coverHint: o.coverHint || null, coverHintFit: o.coverHintFit || null,
        meta: o.meta || {}, installed: false, owned: true, missing: false, manual: false,
        categoryId, catAuto: true, defaultCategory: 'Games', parentId: null, suiteName: null, suiteId: null, ungrouped: false,
        favorite: false, hidden: false, addedAt: now, lastPlayed: o.lastPlayed || 0, playCount: 0,
        cover: null, coverFit: 'cover', coverLocked: false, coverTried: 0, icon: null,
      };
    }
    for (const it of Object.values(this.data.items)) {
      if (it.manual) continue;
      if (ownedSources.has(it.source)) it.owned = ownedIds.has(it.id);
      if (scannedSources.has(it.source) && !seen.has(it.id)) {
        it.installed = false;
        it.missing = !it.owned;
      }
    }
    this.applyPromotions();
  }

  // Moves games the user has not placed into Demos, a Steam collection, or a genre.
  applyAutoCategories(fn) {
    let changed = false;
    for (const it of Object.values(this.data.items)) {
      if (it.manual || it.catAuto === false || it.kind !== 'game') continue;
      if ((it.defaultCategory || 'Games') !== 'Games') continue;
      const target = fn(it);
      if (!target) continue;
      if (target !== 'Games') this.ensureCategoryPath(target);
      const cat = this.resolveCategoryPath(target);
      if (cat && cat !== it.categoryId) { it.categoryId = cat; changed = true; }
    }
    return changed;
  }

  // The user can pick which app in a group is the main one (for example DaVinci Resolve over its tools).
  applyPromotions() {
    const items = Object.values(this.data.items);
    for (const it of items) {
      if (!it.suiteMain || !it.parentId) continue;
      const oldMain = it.parentId;
      for (const other of items) if (other.parentId === oldMain && other !== it) other.parentId = it.id;
      const om = this.data.items[oldMain];
      if (om) { om.parentId = it.id; om.suiteName = it.suiteName; }
      it.parentId = null;
      it.ungrouped = false;
    }
  }

  updateItem(id, patch) {
    const it = this.data.items[id];
    if (!it) return null;
    for (const k of ITEM_PATCH_FIELDS) {
      if (k in patch) it[k] = patch[k];
    }
    if ('categoryId' in patch) it.catAuto = false;
    if (patch.suiteMain) this.applyPromotions();
    if ('categoryId' in patch && !('kind' in patch)) it.kind = this.kindForCategory(patch.categoryId, it.kind);
    if (it.customName !== null && !String(it.customName || '').trim()) it.customName = null;
    return it;
  }

  addManual({ name, target, type, categoryId, kind }) {
    const id = `manual:${newId()}`;
    const isUrl = type === 'url';
    const it = {
      id,
      source: 'manual',
      kind: kind || this.kindForCategory(categoryId, 'game'),
      name: String(name || '').trim() || path.basename(target, path.extname(target)),
      customName: null,
      launch: isUrl ? { type: 'url', target } : { type: 'path', target },
      installDir: isUrl ? null : path.dirname(target),
      iconPath: isUrl ? null : target,
      steamAppId: null,
      meta: {},
      installed: true,
      missing: false,
      manual: true,
      categoryId: categoryId || null,
      favorite: false,
      hidden: false,
      addedAt: Date.now(),
      lastPlayed: 0,
      playCount: 0,
      cover: null,
      coverFit: 'cover',
      coverLocked: false,
      coverTried: 0,
      icon: null,
    };
    this.data.items[id] = it;
    return it;
  }

  removeItem(id) {
    const it = this.data.items[id];
    if (!it) return;
    if (it.manual) delete this.data.items[id];
    else it.hidden = true; // scanned items would come back on the next scan, so hide them instead
  }
}

module.exports = { Store };
