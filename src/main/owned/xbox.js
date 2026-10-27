// Xbox games played on the account, from OpenXBL title history. Only titles that run on PC are kept.

const isPc = (devices) => (devices || []).some((d) => /^(pc|win32|windows)/i.test(d));

async function scanXboxOwned(ctx) {
  if (!ctx.xbox || !ctx.xbox.configured) return { skipped: true };
  const j = await ctx.xbox.titleHistory();
  const titles = j.titles || [];
  const out = [];
  for (const t of titles) {
    if (t.type && !/game/i.test(t.type)) continue;
    if (!isPc(t.devices)) continue;
    const pfn = t.pfn || null;
    if (!pfn) continue; // PC titles without a package are usually Steam or Epic copies, already listed there
    const a = t.achievement || {};
    out.push({
      // Installed Xbox games use the package family name as their id, so the two line up.
      id: `xbox:${pfn}`,
      source: 'xbox',
      name: t.name,
      launch: { type: 'url', target: `ms-windows-store://pdp/?PFN=${encodeURIComponent(pfn)}` },
      coverHint: t.displayImage || null,
      coverHintFit: 'contain',
      lastPlayed: t.titleHistory && t.titleHistory.lastTimePlayed ? Date.parse(t.titleHistory.lastTimePlayed) || 0 : 0,
      meta: {
        xboxTitleId: String(t.titleId),
        achievements: a.totalAchievements ? { have: a.currentAchievements || 0, total: a.totalAchievements, gamerscore: a.currentGamerscore || 0, totalGamerscore: a.totalGamerscore || 0 } : null,
      },
    });
  }
  return { entries: out };
}

module.exports = { scanXboxOwned, isPc };
