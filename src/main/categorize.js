// Default category tree and keyword rules for sorting apps automatically.
// Each node is a name or [name, children].
const DEFAULT_TREE = [
  ['Games', ['Minecraft Modpacks']],
  ['Apps', [
    'Launchers',
    ['Creative', ['Photography', 'Video', 'Audio', 'Design']],
    'Streaming',
    'Development',
    'Social',
    'Media',
    'Browsers',
    'Productivity',
    'Utilities',
  ]],
];

// First match wins. Tested against the app name and its exe file name.
const RULES = [
  ['Games', /\b(minecraft|roblox|fortnite|league of legends|valorant|solitaire|osu!?)\b/i],
  ['Apps/Launchers', /\b(steam|epic games|ubisoft connect|uplay|xbox|gog galaxy|rockstar games launcher|riot client|curseforge|paradox launcher|battle\.net|ea app|ea desktop|origin|overwolf|modrinth|prism launcher|amazon games|itch|playnite|heroic)\b/i],
  ['Apps/Creative/Photography', /\b(lightroom|photoshop|capture one|darktable|luminar|affinity photo|bridge|dxo|topaz photo|topaz gigapixel|on1|nik collection|imaging edge|digital photo professional|eos utility|nx studio|fujifilm|rawtherapee|photomechanic|photo mechanic)\b/i],
  ['Apps/Creative/Video', /\b(premiere|after effects|davinci|resolve|vegas|handbrake|capcut|shotcut|kdenlive|media encoder|filmora|clipchamp|topaz video|avidemux)\b/i],
  ['Apps/Creative/Audio', /\b(audacity|fl studio|ableton|reaper|audition|cubase|pro tools|bitwig|studio one)\b/i],
  ['Apps/Creative/Design', /\b(illustrator|indesign|figma|canva|blender|gimp|krita|inkscape|affinity designer|affinity publisher|substance|cinema 4d|aseprite|paint\.net|clip studio|zbrush|maya|3ds max)\b/i],
  ['Apps/Creative', /\b(creative cloud|adobe express)\b/i],
  ['Apps/Streaming', /\b(obs|streamlabs|aitum|streamer\.?bot|elgato|stream deck|camera hub|voicemeeter|nvidia broadcast|twitch|restream|vtube|voicemod|mix ?it ?up|sammi|touch portal|xsplit)\b/i],
  ['Apps/Development', /\b(visual studio|vs ?code|code|github|git|git bash|node(\.js)?|python|powershell|terminal|docker|postman|android studio|intellij|pycharm|webstorm|notepad\+\+|sublime|cursor|windsurf|wsl|ubuntu|putty|winscp|filezilla|mongodb|mysql|unity|unreal|godot|insomnia|bruno)\b/i],
  ['Apps/Social', /\b(discord|teamspeak|whatsapp|telegram|slack|zoom|teams|messenger|signal|skype|guilded|revolt)\b/i],
  ['Apps/Media', /\b(spotify|vlc|netflix|plex|jellyfin|itunes|apple music|apple tv|youtube|media player|prime video|disney\+?|hulu|mpc-hc|potplayer|foobar|tidal|deezer|crunchyroll|movies (&|and) tv|photos|kodi)\b/i],
  ['Apps/Browsers', /\b(chrome|firefox|microsoft edge|edge|opera|brave|vivaldi|tor browser|zen browser|arc)\b/i],
  ['Apps/Productivity', /\b(word|excel|powerpoint|outlook|onenote|notion|obsidian|libreoffice|acrobat|adobe reader|evernote|todoist|chatgpt|claude|copilot|calendar|mail|onedrive|dropbox|google drive|trello|access|publisher)\b/i],
  ['Apps/Utilities', /\b(nvidia|geforce|amd|radeon|logitech|g hub|razer|synapse|corsair|icue|steelseries|msi|afterburner|asus|armoury|rustdesk|7-?zip|winrar|everything|ccleaner|malwarebytes|cpu-?z|gpu-?z|hwmonitor|hwinfo|crystaldisk|rufus|ventoy|powertoys|calculator|snipping|notepad|paint|file explorer|task manager|anydesk|teamviewer|parsec|vpn|wallpaper engine|lossless scaling|soundpad|sharex|greenshot|bitwarden|1password|keepass|revo|wiztree|treesize)\b/i],
];

function categorize(name, exeName = '') {
  const text = `${name} ${exeName}`;
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'Apps';
}

module.exports = { DEFAULT_TREE, categorize };
