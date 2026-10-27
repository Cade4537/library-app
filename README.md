# Crimson Vault

One launcher for every game and app on this PC: installed and owned games from every store, cover art, genre categories, friends, hours played, achievements, storage and an Apple Music player. Red and black, works with mouse, keyboard or controller.

## Run it

Needs Node.js. In this folder:

```
npm install
npm start
```

That runs it from the code. To install it like a normal program, see Build the installer.

The first launch scans everything automatically. Press the refresh button (or F5) to scan again after installing something.

## What it finds on this PC

| Source | How |
|---|---|
| Steam | Every library folder from `libraryfolders.vdf` |
| Epic | Launcher manifests in `C:\ProgramData\Epic` |
| GOG | Registry |
| Ubisoft Connect | Registry |
| Xbox / Game Pass | Store packages that contain `MicrosoftGame.config` (PC games only) |
| Rockstar | Registry (Steam and Epic copies show under those launchers) |
| Riot | `C:\ProgramData\Riot Games` |
| CurseForge | Minecraft instances (each modpack is a card that opens CurseForge) |
| Apps | Start Menu, Desktop and Microsoft Store apps |

## Connections

Settings > Connections. Settings > Help has step by step guides, including the Domain Name to paste for the Steam key.

| Service | What it adds | How |
|---|---|---|
| Steam | Owned games, hours played, achievements, friends | Free Steam Web API key. Game details and Friends list must be Public in Steam privacy settings |
| Steam Family | Games shared with you | Sign in to the Steam store once |
| Xbox | PC games you own, hours played, achievements, friends | Sign in with Microsoft (or an OpenXBL key) |
| Epic Games | Every game on your account, hours played, achievements, friends | Sign in on Epic's page |
| Ubisoft | Owned Ubisoft games | Automatic from Ubisoft Connect on this PC (sign in there once) |
| GOG | Owned GOG games, hours played | Automatic from GOG Galaxy |
| SteamGridDB | Cover art for everything else | Free API key |

Owned games that are not installed show when the Installed / All owned switch above the cards is set to All owned. They are greyed out with a Not installed tag, and clicking Install opens the right launcher.

## Library

- **Cards:** clicking a card opens its details (hours, last played, size, achievements, Play, Change cover, Open folder, Uninstall). The Play button on a card launches straight away.
- **Categories:** Games has basic genre folders (Action, Adventure, RPG, Shooter, Strategy, Simulation, Racing, Sports, Puzzle, Horror, Survival, MMO, Casual, Indie, Demos). Games are sorted into them using Steam store genres and SteamSpy community tags; empty ones stay hidden. Demos and playtests always go to Demos. Steam collections are not turned into categories. Moving a game by hand always wins.
- **By launcher:** under Games, filter folders show every game from one launcher without moving anything.
- **Apps:** sorted into Launchers, Creative (Photography, Video, Audio, Design, Adobe), Streaming, Development, Social, Media, Browsers, Productivity and Utilities.
- **App suites:** helper tools are tucked under their main app (DaVinci Resolve's Blackmagic tools, Adobe's background tools, Office tools). A card with helpers shows "+N related apps". Right click to show a helper as its own card or to make it the main app.
- **Sorting:** Name, Category (grouped under headings), Last played, Date added or Hours played, with a button to flip the order.
- **Search:** Ctrl+F or /. Search also finds helper apps.
- **Drag and drop:** drag cards onto a category, Favorites or Hidden. Drag categories onto each other to nest them, or onto the top quarter of one to reorder.
- **Cover art:** from Steam, then SteamGridDB, then a Steam store match. Right click > Change cover to pick another or use your own image.
- **Add by hand:** the + button adds any program, shortcut or link.
- **Surprise me:** picks a random game from the current view. The arrow next to it switches between installed games and all owned games.

## Hours played and achievements

Hours come from Steam, Epic, GOG Galaxy and Xbox when connected. For every other game the app checks every 30 seconds which programs are running and counts time while a game's files are in use; a running game shows "Playing now". Achievements show in a game's details for Steam, Xbox and Epic games.

## Friends

Steam, Xbox and Epic friends, sorted into Playing, Online, Away and Offline. Epic only shares when someone was last online. The same person on more than one platform is matched by name automatically; click a friend to link or unlink accounts by hand.

## Storage

The Storage tab shows free space on every drive (and how much your games use) and every installed game by size. Steam and Epic report sizes themselves; other games are measured in the background. Uninstall starts the launcher's own uninstall: Steam asks to confirm, GOG, Ubisoft, Rockstar and Riot run their uninstaller, Xbox opens Windows Installed apps, and Epic games use their Windows uninstaller when one exists, otherwise the Epic launcher opens so you can uninstall there.

## Launchers tab

Shows which game launchers are installed and how many games each has. Click one to open it, or to go to its download page if it is not installed.

## Xbox Remote Play

The sidebar button opens the Xbox app so you can stream games from your console to this PC. Right click it to open remote play in a browser instead.

## Apple Music

The player at the bottom of the sidebar reads what is playing from Windows media controls, so no Apple account is needed. It shows the song, artist, album art (from Apple Music or Apple's public iTunes search) and progress, with previous, play/pause and next. Settings can turn it off or let it fall back to other players like Spotify.

## Controls

| Action | Mouse / keyboard | Controller |
|---|---|---|
| Open details | Click a card | A |
| Play | Play button on the card or in details | A in details |
| Back / close | Esc | B |
| Surprise me | Button in top bar | X |
| Favorite | Right click menu | Y |
| Card options | Right click | Menu |
| Switch view | Sidebar | LB / RB |
| Search | Ctrl+F or / | View |
| Scroll | Wheel | Right stick, LT / RT |
| Fullscreen | F11 | |

## Data

Everything is saved in `%APPDATA%\library-app` (library, covers, settings and sign-ins). Settings > Open data folder opens it. A backup of the library file is made each session.

## Build the installer

```
npm install
npm run dist
```

The installer lands in `dist\Crimson-Vault-Setup-<version>.exe`. The exe is not code signed, so Windows may show "Windows protected your PC" the first time: click More info, then Run anyway. If the build fails with "Cannot create symbolic link", turn on Developer Mode in Windows settings once.

## Updates

Installed copies check GitHub for a new version on launch and every 4 hours, download it in the background, and show a red Restart to update button. Settings also has Check for updates.

One time setup (already done): the public repo `Cade4537/library-app` and a GitHub token saved with `setx GH_TOKEN "..."`.

Every release:

1. Raise `version` in package.json (for example 0.9.1 to 0.9.2). Releasing the same version again only overwrites it, and installed copies will not update.
2. Commit and push in GitHub Desktop.
3. Run `npm run release` in a terminal opened after `GH_TOKEN` was set.
