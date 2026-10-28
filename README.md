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
| Ubisoft | Owned Ubisoft games, hours played and last played (including console time) | Owned games are automatic from Ubisoft Connect on this PC. For hours, sign in on Ubisoft's page in Settings; Crimson Vault reads your account's Games activity every 6 hours. Ubisoft friends are not available (Ubisoft only shows them inside its own app) |
| GOG | Owned GOG games, hours played | Automatic from GOG Galaxy |
| SteamGridDB | Cover art for everything else | Free API key |

Owned games that are not installed show when the Installed / All owned switch above the cards is set to All owned. They are greyed out with a Not installed tag, and clicking Install opens the right launcher.

## Home

Home is a menu of big tiles that works with a mouse, keyboard or controller. Each tile opens its own page.

- **Guide:** the menu button at the top left, G on the keyboard, or View on a controller slides out the guide over any page: the game you are playing with Back to game, Apple Music, every main page, friends online, and Search, Settings, Controller mode and Power. B or Esc closes it.

- **Jump back in:** your last game (or the one running) with Play or Back to game, hours and achievement progress.
- **Friends and music:** who is online and what they are playing, plus Apple Music with play, pause and skip.
- **Tiles:** Library, Deals & News, Social, Statistics, Surprise me and Xbox Remote Play.
- **Free to keep:** this week's free games from Epic, Steam, GOG and Ubisoft.
- **News:** the latest posts from your 3 most played games.
- **Bottom row:** Search, Storage, Launchers, Settings, Controller mode and Power (sleep, lock, restart, shut down, quit).
- **Library:** tabs for Overview (your 5 most recent games plus Games, Apps, Arcade, Backlog, Favorites, Recently added, Surprise me and Everything), Games, Apps, Collections (smart collections and genres), Categories (every folder; right click to edit, drag games onto them), Launchers and Manage (Storage, Launchers, Uncategorized, Hidden, add a game, rescan, find covers). LB / RB switch tabs.
- **Surprise me:** its own page. Pick from installed or all owned games, only never played, backlog, favorites or small games, a genre or a launcher, then Spin. Past picks are listed below.
- **Deals & News:** wishlist and free games on top, news from your most played games and more news below.
- **Social:** Friends and Discord as tabs, with switches for friend alerts and your Discord status.
- **Back:** Esc, the B button or the mouse back button goes to the page before. Typing in search from Home jumps to results.

## Details and cards

- **Continue playing:** the top of Home shows your last game as a big banner with its art, hours and achievement progress, plus the next four as tiles.
- **Details:** clicking a card opens its page with the game's wide art, description, release date, developer, genres and screenshots from the Steam store (click a screenshot to see it full size), plus hours, size and achievements.
- **Collections:** big tiles for each genre folder on Home, with a mosaic of covers (Hide removes them; Settings > Look brings them back).
- **Trailers:** a game's details plays its Steam trailer, muted, behind the top of the page (Sound on in the corner; Settings > Look turns trailers off).
- **Wide banners:** the switch next to Sort changes the cards from covers to wide banners with the art blurred behind.
- **Back to game:** while a game runs, a small bar at the bottom brings its window back to the front.
- **Stats:** hours played, games, achievements, a 14 day chart of play time (from when Crimson Vault saw games running), most played, hours by launcher, and the games closest to 100%.
- **Startup animation:** the crimson gem intro when the app opens (click or press a key to skip; Settings > Look turns it off).
- **Cards:** hover a card to see hours played and achievement progress. A green tag shows when a friend is playing that game. Covers shimmer while they load.

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
- **Surprise me:** a reel of covers spins, slows down and lands on a random game from the current view, with sound, sparks and the game's art filling the screen. Play, Spin again (X) or Details from there; the sound can be turned off in the corner. The arrow next to the button switches between installed games and all owned games.
- **Launching:** starting a game shows a short splash with its art.
- **One card per game:** a game you have on two launchers (say Steam and Xbox) shows as one card with small launcher dots. Hours are added together, and its details have a Play via button for the other copy. Split copies brings back separate cards.
- **Launch options:** in a game's details. Add launch arguments, plus things to do before playing (start an OBS recording, switch to the High performance power plan, close programs like Discord or Chrome, run a program) and after the game closes. A power plan switched before playing goes back by itself.
- **Move:** in a game's details. Opens the right place in Steam, Windows or the launcher to move the game to another drive.

## Backlog, smart collections and deals

- **Backlog:** set a status on any game (Backlog, Playing, Beaten, 100%, Dropped), give it stars and keep notes, all in its details. The Backlog page lists them with a filter per status, and cards show their status. "How long to beat?" opens HowLongToBeat for the game.
- **Smart collections:** folders that fill themselves from rules: status, hours played, played or never played, played in the last X days, installed, size, launcher, folder and your rating. Add them under the categories in the sidebar; right click to edit or delete.
- **Deals:** your Steam wishlist with current prices, sales and the lowest price seen, plus free to keep games on Epic, Steam, GOG and Ubisoft. Store pages open in Steam, Epic or GOG Galaxy by default; Settings > App can switch that to the browser or ask each time. Checked every 6 hours, with a pop up when a wishlist game drops in price or new free games appear. The wishlist needs your SteamID and a public wishlist.
- **News:** Steam news for the games you played last shows on Home and in each Steam game's details. Click a post to read it in Crimson Vault, then open the original in Steam or the browser.
- **Friend alerts:** a pop up when a friend starts playing a game you own.

## Tray, startup and shortcut

Closing the window keeps Crimson Vault in the tray so tracking, alerts and the phone remote keep working (Quit from the tray icon closes it fully). Settings > App can start it with Windows, quietly in the tray, and sets a shortcut that shows or hides it from anywhere (Ctrl+Alt+Space by default).

## Phone remote

Settings > Phone remote turns it on and shows a QR code. Scan it with your phone on the same Wi-Fi and add the page to your home screen. From the phone you can browse your library, start games on the PC, install games you own, and see your drives with installed games by size and uninstall them (it asks first). When Windows asks to allow Crimson Vault on networks, allow private networks. Only devices on your home network with the pairing code can use it; Unpair all phones makes a new code.

## Hours played and achievements

Hours come from Steam, Epic, GOG Galaxy, Xbox and Ubisoft when connected. For every other game the app checks every 30 seconds which programs are running and counts time while a game's files are in use; a running game shows "Playing now". Achievements show in a game's details for Steam, Xbox and Epic games.

## Friends

Steam, Xbox and Epic friends, sorted into Playing, Online, Away and Offline. Epic only shares when someone was last online. The same person on more than one platform is matched by name automatically; click a friend to link or unlink accounts by hand.

## Arcade

Two mini games in the Arcade tab, for mouse, keyboard or controller:

- **Vault Blocks:** a falling block puzzle. Clear lines to score; the level and speed go up every 10 lines. Hold, next pieces, ghost piece and a best score. Keys: A / D move, S soft drops, Space hard drops, Q / E rotate, C holds, Esc or P pauses (arrow keys work too). Controller: stick or D-pad, A / B rotate, Y hard drops, LB holds, Menu pauses. Pause and Quit buttons are on screen, and the pause menu has Resume, Restart and Quit.
- **Peg Drop:** drop balls through rows of pegs into slots. Set the bet per ball (type any amount like 500, 2.5M or 1Dc for a decillion, or use Min, ½, ×2, ×10, Max), drop 1 to 100 balls at once, and pick a risk level: Low, Medium, High or Extreme (bigger edge payouts, smaller middle). The balls are light, bouncy and a bit unpredictable, and move at half speed so they are easy to follow. Pause menu with Resume, Reset points and Quit; Reset points starts over at 1,000. Pretend points only; nothing is real money.

- **Blackjack:** six decks, dealer stands on 17, blackjack pays 3 to 2, double down and one split. Its own pretend points, starting at 10,000 (Reset to 10,000 any time), separate from Peg Drop. Cards slide in from the shoe and the dealer's card flips over. Keys: Space deal, H hit, S stand, D double, P split. Controller: A hit or deal, B stand, X double, Y split.
- **Block Breaker:** bounce the ball off your paddle to smash the bricks; top rows take two hits, later levels are faster. Catch falling W for a wide paddle and + for an extra ball. A / D or the mouse move, Space launches.
- **Snake:** eat to grow, speed goes up as you go, gold food is worth 5 and fades. W A S D or arrows to turn.
- **Paddle Duel:** paddle tennis to 7 against the computer (Easy, Normal, Hard) or a friend on the same keyboard (W / S and ↑ / ↓).

Every game has Pause and Quit buttons on screen and a pause menu, plus controller support. The action games count down 3, 2, 1 before play, and all games have sparks, screen shake on big moments, banners for combos, levels and big wins, and numbers that pop when they change.

## Discord

- **Discord tab:** Discord's own web app in the sidebar, signed in once and kept. Voice calls keep going while you switch pages, and screen share asks which screen or window to share. Turn the tab off in Settings > Discord.
- **Rich Presence:** shows the game you are playing on your Discord profile with its cover, for every launcher (including Xbox and Epic games Discord does not detect). Needs a free Discord Application ID; Settings > Help > Discord walks through it in a minute.

## Controller mode

The TV button in the top bar, the Controller mode button on Home, or Menu on a controller opens Home full screen with bigger tiles. The D-pad or left stick moves between tiles, A opens, B goes back, LB / RB switch tabs and pages, View opens the guide, X is Surprise me, Y favorites a game, and Esc on Home leaves. Settings can open it on start.

## Look

Settings > Look has six accent colors and the card size. The button left of the logo shrinks the sidebar to icons.

## Storage

The Storage tab shows free space on every drive (and how much your games use) and every installed game by size. Steam and Epic report sizes themselves; other games are measured in the background. Uninstall starts the launcher's own uninstall: Steam asks to confirm, GOG, Ubisoft, Rockstar and Riot run their uninstaller, Xbox opens Windows Installed apps, and Epic games use their Windows uninstaller when one exists, otherwise the Epic launcher opens so you can uninstall there.

## Launchers tab

Shows which game launchers are installed and how many games each has. Click one to open it, or to go to its download page if it is not installed.

## Xbox Remote Play

The sidebar button (or Stream from console in an Xbox game's details) opens Remote Play right inside Crimson Vault, next to the sidebar, signed in with your Xbox connection. Your console connects by itself. The stream keeps going while you look at other pages (a green dot shows on the button), Full screen fills the screen (F11 too), and End stream closes it and frees its memory.

Other ways (Other ways button, right click, or Menu on a controller): play in its own window, open the Xbox app and let Crimson Vault press its remote play buttons for you, open the Xbox app only, or open remote play in your browser.

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
| Switch page | Sidebar | LB / RB (stops at the first and last page) |
| Controller mode | TV button | Menu (no card selected); View leaves |
| Search | Ctrl+F or / | View |
| Scroll | Wheel | Right stick, LT / RT |
| Fullscreen | F11 | |

## Memory

Crimson Vault keeps its memory use flat over long sessions: its PowerShell helpers restart themselves every few hours, song artwork and achievement caches are capped, cards for removed games are dropped, and the music player only sends updates when something changes. The Discord tab and the Remote Play stream are the heavy parts; Close tab and End stream free them.

## Health and safety

- **Health:** Settings > Health shows how much memory Crimson Vault uses (window, GPU, helpers), how long it has been running, and any recent crashes or hangs. Copy report copies it for troubleshooting. Everything is also written to `diagnostics.log` in the data folder, with a memory check every 30 minutes.
- **Never stuck full screen:** if the window crashes or hangs, or is hidden to the tray, it leaves full screen first so the taskbar and desktop come back. The show / hide shortcut (Ctrl+Alt+Space) also leaves full screen. Xbox Remote Play no longer takes over Windows keys, so Alt+Tab and the Windows key always work.
- **Background:** animations and trailers pause while another app (like a game) has focus.

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

1. Raise `version` in package.json (for example 0.10.0 to 0.10.1, or 0.10.0 to 0.11.0 for bigger updates. Use three numbers only; a fourth number (like 0.9.4.5) breaks updates). Releasing the same version again only overwrites it, and installed copies will not update.
2. Commit and push in GitHub Desktop.
3. Run `npm run release` in a terminal opened after `GH_TOKEN` was set.
