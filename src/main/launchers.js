// The Launchers tab: which game launchers are installed, open them, or link to their download page.
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const { exists } = require('./util');
const { launchItem } = require('./launch');

const PF = process.env.ProgramFiles || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

// name: regex matched against your Start Menu apps; paths: usual install locations; source: which games it owns.
const LAUNCHERS = [
  { id: 'steam', name: 'Steam', source: 'steam', match: /^steam$/i, paths: [path.join(PF86, 'Steam', 'steam.exe'), path.join(PF, 'Steam', 'steam.exe')], url: 'https://store.steampowered.com/about/' },
  { id: 'epic', name: 'Epic Games Launcher', source: 'epic', match: /^epic games launcher$/i, paths: [path.join(PF86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'), path.join(PF86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win32', 'EpicGamesLauncher.exe')], url: 'https://store.epicgames.com/download' },
  { id: 'xbox', name: 'Xbox', source: 'xbox', aumid: 'Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App', match: /^xbox$/i, url: 'ms-windows-store://pdp/?productid=9MV0B5HZVK9Z' },
  { id: 'ubisoft', name: 'Ubisoft Connect', source: 'ubisoft', match: /^(ubisoft connect|uplay)$/i, paths: [path.join(PF86, 'Ubisoft', 'Ubisoft Game Launcher', 'UbisoftConnect.exe'), path.join(PF86, 'Ubisoft', 'Ubisoft Game Launcher', 'upc.exe')], url: 'https://ubisoftconnect.com/' },
  { id: 'gog', name: 'GOG Galaxy', source: 'gog', match: /^gog galaxy$/i, paths: [path.join(PF86, 'GOG Galaxy', 'GalaxyClient.exe'), path.join(PF, 'GOG Galaxy', 'GalaxyClient.exe')], url: 'https://www.gog.com/galaxy' },
  { id: 'ea', name: 'EA app', source: 'ea', match: /^ea( app)?$/i, paths: [path.join(PF, 'Electronic Arts', 'EA Desktop', 'EA Desktop', 'EADesktop.exe')], url: 'https://www.ea.com/ea-app' },
  { id: 'rockstar', name: 'Rockstar Games Launcher', source: 'rockstar', match: /^rockstar games launcher$/i, paths: [path.join(PF, 'Rockstar Games', 'Launcher', 'Launcher.exe')], url: 'https://www.rockstargames.com/downloads' },
  { id: 'battlenet', name: 'Battle.net', source: 'battlenet', match: /^battle\.net$/i, paths: [path.join(PF86, 'Battle.net', 'Battle.net Launcher.exe'), path.join(PF86, 'Battle.net', 'Battle.net.exe')], url: 'https://download.battle.net/' },
  { id: 'riot', name: 'Riot Client', source: 'riot', match: /^riot client$/i, paths: [path.join('C:\\Riot Games', 'Riot Client', 'RiotClientServices.exe')], url: 'https://www.riotgames.com/en' },
  { id: 'curseforge', name: 'CurseForge', source: 'curseforge', match: /^curseforge$/i, paths: [path.join(LOCAL, 'Programs', 'CurseForge Windows', 'CurseForge.exe')], url: 'https://www.curseforge.com/download/app' },
  { id: 'paradox', name: 'Paradox Launcher', source: 'paradox', match: /^paradox launcher/i, paths: [path.join(LOCAL, 'Programs', 'Paradox Interactive', 'launcher', 'Paradox Launcher.exe')], url: 'https://www.paradoxinteractive.com/games' },
  { id: 'amazon', name: 'Amazon Games', source: 'amazon', match: /^amazon games$/i, paths: [path.join(LOCAL, 'Amazon Games', 'App', 'Amazon Games.exe')], url: 'https://gaming.amazon.com/home' },
  { id: 'minecraft', name: 'Minecraft Launcher', source: 'minecraft', match: /^minecraft launcher$/i, paths: [path.join(PF86, 'Minecraft Launcher', 'MinecraftLauncher.exe')], url: 'https://www.minecraft.net/download' },
];

async function locate(store, registry, l) {
  const items = Object.values(store.data.items).filter((i) => (i.source === 'app' || i.source === 'msstore') && i.installed !== false);
  const item = items.find((i) => l.match.test(i.name) || (l.aumid && i.launch && i.launch.target === l.aumid));
  if (item) return { item };
  const paths = [...(l.paths || [])];
  if (l.id === 'steam' && registry && (registry.steamPath || registry.steamPath2)) paths.unshift(path.join(path.normalize(registry.steamPath || registry.steamPath2), 'steam.exe'));
  for (const p of paths) if (await exists(p)) return { exe: p };
  return null;
}

async function getLaunchers(store, registry, getIcon) {
  const counts = {};
  for (const it of Object.values(store.data.items)) if (it.kind === 'game' && !it.hidden) counts[it.source] = (counts[it.source] || 0) + 1;
  return Promise.all(LAUNCHERS.map(async (l) => {
    const found = await locate(store, registry, l);
    let icon = null;
    const iconPath = found && (found.exe || (found.item && found.item.iconPath));
    if (iconPath) { try { const img = await getIcon(iconPath); if (img && !img.isEmpty()) icon = img.toDataURL(); } catch {} }
    return { id: l.id, name: l.name, installed: !!found, games: counts[l.source] || 0, icon, url: l.url };
  }));
}

async function openLauncher(store, registry, id) {
  const l = LAUNCHERS.find((x) => x.id === id);
  if (!l) return { ok: false };
  const found = await locate(store, registry, l);
  try {
    if (found && found.item) await launchItem(found.item);
    else if (found && found.exe) await launchItem({ launch: { type: 'exe', target: found.exe } });
    else { await shell.openExternal(l.url); return { ok: true, download: true }; }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { getLaunchers, openLauncher, LAUNCHERS };
