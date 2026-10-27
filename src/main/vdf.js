// Minimal parser for Valve's text KeyValues format (.vdf / .acf files).
// All keys are lowercased so lookups do not depend on Valve's casing.
function parseVdf(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let s = '';
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const nx = text[i + 1];
          s += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx;
          i += 2;
        } else {
          s += text[i++];
        }
      }
      i++;
      tokens.push({ t: 's', v: s });
    } else if (c === '{' || c === '}') {
      tokens.push({ t: c });
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      let s = '';
      while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
      tokens.push({ t: 's', v: s });
    }
  }

  let p = 0;
  function parseObject() {
    const obj = {};
    while (p < tokens.length) {
      const tk = tokens[p];
      if (tk.t === '}') { p++; return obj; }
      if (tk.t !== 's') { p++; continue; }
      const key = tk.v.toLowerCase();
      p++;
      const nx = tokens[p];
      if (!nx) break;
      if (nx.t === '{') { p++; obj[key] = parseObject(); }
      else if (nx.t === 's') { obj[key] = nx.v; p++; }
      else p++;
    }
    return obj;
  }
  return parseObject();
}

module.exports = { parseVdf };
