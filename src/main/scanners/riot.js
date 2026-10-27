const path = require('path');
const { readJson, listDir, exists, fsp } = require('../util');

const NAMES = {
  league_of_legends: 'League of Legends',
  valorant: 'VALORANT',
  bacon: 'Legends of Runeterra',
  lion: '2XKO',
};

async function scanRiot() {
  const base = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games');
  const installs = await readJson(path.join(base, 'RiotClientInstalls.json'));
  const client = installs && (installs.rc_default || installs.rc_live);
  if (!client || !(await exists(client))) return [];
  const out = [];
  const metaDir = path.join(base, 'Metadata');
  for (const e of await listDir(metaDir)) {
    if (!e.isDirectory()) continue;
    const [product, patchline = 'live'] = e.name.split('.');
    if (!product || product === 'riot_client') continue;
    let installPath = null;
    try {
      const yaml = await fsp.readFile(path.join(metaDir, e.name, `${e.name}.product_settings.yaml`), 'utf8');
      const m = yaml.match(/product_install_full_path:\s*"?([^"\r\n]+)"?/);
      if (m) installPath = path.normalize(m[1]);
    } catch {}
    if (!installPath || !(await exists(installPath))) continue;
    out.push({
      id: `riot:${e.name}`,
      source: 'riot',
      kind: 'game',
      name: NAMES[product] || product.replace(/_/g, ' '),
      launch: { type: 'exe', target: client, args: [`--launch-product=${product}`, `--launch-patchline=${patchline}`] },
      installDir: installPath,
      defaultCategory: 'Games',
    });
  }
  return out;
}

module.exports = { scanRiot };
