# Library (name TBD)

One launcher for every game and app on this PC.

## Run it

Needs Node.js installed. In this folder:

```
npm install
npm start
```

That runs it straight from the code. To install it like a normal program, see Build the installer below.

The first launch scans everything automatically. Press the refresh button (or F5) to scan again after installing something.

## What it finds

| Source | How |
|---|---|
| Steam | Every library folder from `libraryfolders.vdf` |
| Epic | Launcher manifests in `C:\ProgramData\Epic` |
| GOG | Registry |
| Ubisoft Connect | Registry |
| Xbox / Game Pass | Store packages that contain `MicrosoftGame.config` |
| Rockstar | Registry (Steam and Epic copies show under those launchers) |
| Riot | `C:\ProgramData\Riot Games` |
| CurseForge | Minecraft instances (each modpack becomes a card that opens CurseForge) |
| Apps | Start Menu, Desktop and Microsoft Store apps |

Paradox Launcher games bought on Steam show up under Steam. The Paradox Launcher itself shows under Apps > Launchers.

## Cover art

Covers come from Steam first (your local Steam cache, then Steam's servers). For other games and apps, add a free SteamGridDB API key in Settings:

1. Sign in at https://www.steamgriddb.com (Steam login works)
2. Go to Preferences > API and generate a key
3. Paste it into Settings and save

Without a key, non Steam games still try to match against the Steam store. Anything without art gets a generated card with its icon. Right click any card and choose Change cover to search for another one or pick your own image.

## Controls

| Action | Mouse / keyboard | Controller |
|---|---|---|
| Play | Click a card | A |
| Back / close | Esc | B |
| Surprise me | Button in top bar | X |
| Favorite | Right click menu | Y |
| Card options | Right click | Menu |
| Switch view | Sidebar | LB / RB |
| Search | Ctrl+F or / | View |
| Scroll | Wheel | Right stick, LT / RT |
| Fullscreen | F11 | |

Drag cards onto a category in the sidebar to move them, or onto Favorites / Hidden. Drag categories onto each other to nest them, or onto the top quarter of a category to reorder.

## Games you own but haven't installed

Settings > Owned games:

- **Steam**: paste a free Steam Web API key. Settings > Help walks through it and has the Domain Name to paste. Your SteamID is picked up from the Steam app automatically. Your Steam profile's privacy setting for Game details has to be Public.
- **GOG**: read from GOG Galaxy on this PC. Nothing to set up.

Use the Installed / All owned switch above the cards to show them. Clicking a game that isn't installed opens Steam or GOG Galaxy to install it. Surprise me can pick from all owned games using the arrow next to it.

## Connections

Settings > Connections. Settings > Help has step by step guides for each one.

| Service | What it adds | How |
|---|---|---|
| Steam | Owned games, hours played, achievements, friends | Free Steam Web API key |
| Steam Family | Games shared with you | Sign in to the Steam store once |
| Xbox | PC games you own, hours played, achievements, friends | Sign in with Microsoft (or an OpenXBL key) |
| Ubisoft | Owned Ubisoft games | Automatic from Ubisoft Connect on this PC |
| Epic Games | Every game on your account, hours played, friends | Sign in on Epic's page |
| GOG | Owned GOG games, hours played | Automatic from GOG Galaxy |
| SteamGridDB | Cover art for everything else | Free API key |

## Sorting

Games has basic categories (Action, Adventure, RPG, Shooter, Strategy, Simulation, Racing, Sports, Puzzle, Horror, Survival, MMO, Casual, Indie, Demos). Under Games, the "By launcher" folders show every game from one launcher without moving anything. Sort by Name, Category, Last played, Date added or Hours played, and flip the order with the button next to Sort. Sorting by Category groups the cards under headings.

Games you have not placed yourself are sorted automatically: demos and playtests go to Games > Demos and the rest go by genre. Steam collections are not turned into categories. Empty genre folders stay hidden until a game lands in them. Moving a game by hand always wins.

## Hours played and achievements

Hours come from Steam, Epic, GOG Galaxy and Xbox when connected. For every other game, the app checks every 30 seconds which programs are running and counts time while a game's files are in use. Click a game's card to see hours, last played and achievements (Steam and Xbox).

## Friends

The Friends page shows Steam, Xbox and Epic friends (Epic only shares when someone was last online), whether they are online, and what they are playing. Friends with the same name on both are shown as one person. Click a friend to link or unlink accounts by hand. Discord is not included because Discord does not let apps read friends lists.

## Storage

The Storage tab shows free space on every drive (with how much your games take) and every installed game by size. Steam and Epic report sizes themselves; other games are measured in the background. Uninstall (also in a game's details and right click menu) starts the launcher's own uninstall: Steam asks to confirm, GOG, Ubisoft, Rockstar and Riot run their uninstaller, Xbox opens Windows Installed apps, and Epic opens its launcher, since Epic only uninstalls from there.

## Launchers tab

Shows which game launchers are installed. Click one to open it, or to go to its download page if it is not installed.

## Xbox Remote Play

The Xbox Remote Play button in the sidebar opens the Xbox app so you can stream games from your console to this PC. Right click it to open remote play in a browser instead.

## Data

Everything is saved in `%APPDATA%\library-app` (`library.json` plus cached covers). Settings > Open data folder opens it. A backup of the library file is made each session.

## Build the installer

```
npm install
npm run dist
```

The installer lands in `dist\Library-Setup-<version>.exe`. Run it to install. It adds Start Menu and Desktop shortcuts.

The exe is not code signed, so the first time Windows may show "Windows protected your PC". Click More info, then Run anyway.

## Updates

Installed copies check GitHub for a new version on launch and every 4 hours, download it in the background, and show a red "Restart to update" button. Settings also has a Check for updates button.

One time setup:

1. Create a **public** GitHub repo named `library-app` under Cade4537 (releases have to be public so the app can download them without signing in). If you rename it, change `owner` and `repo` under `build.publish` in package.json.
2. Create a GitHub token: Settings > Developer settings > Personal access tokens > Tokens (classic), with the `repo` scope.
3. Save it on this PC: `setx GH_TOKEN "your_token_here"`, then open a new terminal.

Every release after that:

1. Raise `version` in package.json (for example 0.2.0 to 0.2.1)
2. Run `npm run release`

That builds the installer and publishes it as a GitHub release. Every installed copy picks it up on its next check.

## Apple Music

The sidebar player reads what is playing from Windows media controls, the same ones the volume flyout uses. Apple Music for Windows reports there, so no Apple account or setup is needed. It shows the song, artist, album art and progress, and has previous, play/pause and next buttons. When nothing is playing it offers to open Apple Music (or its Microsoft Store page if it is not installed).

Settings can turn the player off, or let it fall back to other players like Spotify or a browser when Apple Music is closed.

Browsing your Apple Music library or playlists inside this app would need Apple's MusicKit, which requires a paid Apple Developer account, so that is not included.
