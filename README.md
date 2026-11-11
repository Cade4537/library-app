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

- **Guide:** the menu button at the top left, G on the keyboard, or View on a controller slides out the guide over any page. It has four tabs (LB / RB, or Q / E on the keyboard): **Home** (the game you are playing with Back to game, your 5 recent games to launch, and every main page), **Friends** (everyone online and what they are playing), **Music** (Apple Music with big art, progress and controls) and **Quick settings** (Search, Controller mode, Full screen, friend alerts, Reduce motion, accent color, and Sleep, Lock, Restart, Shut down). B or Esc closes it.

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

Steam, Xbox and Epic friends, sorted into Playing, Online, Away and Offline, with counts at the top, a search box (names, accounts or games) and filters by status and platform. Long names and long game titles are cut off neatly with the full text on hover. A friend playing a game you own shows its cover and a Join (or Install) button. Epic only shares when someone was last online. The same person on more than one platform is matched by name automatically.

Click a friend for their profile: status, what they are playing and for how long, when they were last seen playing, every linked account with an Open profile button, and the games Crimson Vault has seen them play. Favorite a friend to pin them to the top, or mute their alerts, from the profile or the right click menu (which also has link, unlink, copy name and remove). Friends without a profile picture get one made from their initials. On the page, / or Ctrl+F jumps to the search and Esc clears it.

Friend alerts only fire when a friend starts a different game, so changing modes or rich presence text inside the same game does not count. The same friend and game never alert twice within 3 hours, friends who start the same game together share one alert, and you can choose alerts for games you own or any game in Settings.

## Anime (AniList)

Your anime list from AniList, on its own page (Home, the guide, or the Anime tile).

- **Tabs:** Watching, Planned, Completed, Paused, Dropped and All, with search (titles and genres) and sorting (recently updated, title, your score, AniList score, progress, next episode, newest).
- **Surprise me:** choose to pick from Planned, Watching, Completed or All, optionally only shows of 13 episodes or less and one genre. It opens the same full screen reel as the games' Surprise me (spinning covers with motion blur, ticking sound, the backdrop changing as it slows, sparks and a chord when it lands, then the show's banner) and shows how long it takes to watch, with Watch on, Spin again and Details. Space or X spins again, Esc or B closes.
- **Next episodes:** shows you are watching that are still airing, with a countdown, plus a pop up when a new episode comes out (Settings, Connections, AniList).
- **Details:** banner, cover, synopsis, genres, studio, AniList score and where to watch.
- **Editing (signed in):** +1 episode straight from a card, change status, episodes and score in the details, move shows between lists from the right click menu, and Add anime to search AniList and add a show.

To set it up, type your AniList user name on the Anime page. That is enough to read a public list. To edit from Crimson Vault (or see a private list), sign in once: Settings, Connections, AniList has the steps (AniList asks every app to use its own free API client).

## Xbox console play

Crimson Vault reads your own Xbox presence (Microsoft sign in or OpenXBL key) every minute or two, so it knows when you play on an Xbox console, through Xbox Remote Play or cloud gaming. Each session is saved with the game, the console, how long you played and the achievements you unlocked during it, and a pop up sums it up when you stop. You see it at the top of the Friends page, on the Home Xbox tile, on the Remote Play page and in each game's play history ("on Xbox"). It only works while Crimson Vault is running (the tray is fine), and sessions under 2 minutes are skipped. Turn it off in Settings, Quality of life.

## Arcade

Two mini games in the Arcade tab, for mouse, keyboard or controller:

- **Vault Blocks:** a falling block puzzle. Clear lines to score; the level and speed go up every 10 lines. Hold, next pieces, ghost piece and a best score. Keys: A / D move, S soft drops, Space hard drops, Q / E rotate, C holds, Esc or P pauses (arrow keys work too). Controller: stick or D-pad, A / B rotate, Y hard drops, LB holds, Menu pauses. Pause and Quit buttons are on screen, and the pause menu has Resume, Restart and Quit.
- **Peg Drop:** drop balls through rows of pegs into slots. Set the bet per ball (type any amount like 500, 2.5M or 1Dc for a decillion, or use Min, ½, ×2, ×10, Max), drop 1 to 100 balls at once, and pick a risk level: Low, Medium, High or Extreme (bigger edge payouts, smaller middle). The balls are light, bouncy and a bit unpredictable, and move at half speed so they are easy to follow. Pause menu with Resume, Reset points and Quit; Reset points starts over at 1,000. Pretend points only; nothing is real money.

- **Blackjack:** six decks, dealer stands on 17, blackjack pays 3 to 2, double down and one split. Its own pretend points, starting at 10,000 (Reset to 10,000 any time), separate from Peg Drop. Cards slide in from the shoe and the dealer's card flips over. Keys: Space deal, H hit, S stand, D double, P split. Controller: A hit or deal, B stand, X double, Y split.
- **Block Breaker:** bounce the ball off your paddle to smash the bricks; top rows take two hits, later levels are faster. Catch falling W for a wide paddle and + for an extra ball. A / D or the mouse move, Space launches.
- **Snake:** eat to grow, speed goes up as you go, gold food is worth 5 and fades. W A S D or arrows to turn.
- **Paddle Duel:** paddle tennis to 7 against the computer (Easy, Normal, Hard) or a friend on the same keyboard (W / S and ↑ / ↓).
- **Gem Merge:** slide the board to merge matching gems into bigger ones. Arrows, W A S D or the stick.
- **Vault Sweeper:** find every hidden trap on the grid using the number clues. Click to open, right click or F to flag; opening a number that has all its flags opens the squares around it.
- **Ember Flight:** tap Space or click to keep the ember flying through the gaps.
- **Sky Raiders:** waves of raiders march down; A / D to move, Space to fire, and clear each wave before it reaches you.
- **Vault Runner:** an endless runner. Jump with Space or W (twice for a double jump) over crates, and duck drones with S.
- **Vault Words:** guess the five letter word in six tries. Green means the right letter in the right spot, gold means it is in the word somewhere else, grey means it is not in the word. A new daily word every day (once per day, it stays solved), plus unlimited free play. Tracks your streak and wins by number of guesses. Type, or click the keys on screen; on a controller the stick picks a key, A presses it, B deletes and X guesses.
- **Vault Crossword:** a new crossword built every game from a few hundred words and clues. Type to fill in, arrows to move, Space switches across and down, Tab jumps to the next word, and the clue list in the side panel is clickable. Check marks wrong letters, and Reveal letter or Reveal word help when you are stuck. Controller: stick moves, LB / RB change the letter, A switches direction, Y checks.
- **Vault Sudoku:** Easy, Medium or Hard puzzles, always with exactly one answer. Number keys place, N switches to notes (which clear themselves when you place a number), U undoes, H gives a hint, and wrong numbers show in red. Matching numbers and the row, column and box light up, and the number bar shows how many of each are left. Best times per difficulty. Controller: LB / RB pick the number, A places, Y notes, X undoes.
- **Vault Word Search:** find the hidden words by dragging across them. Eight themes (Gaming, Animals, Space, Food, Sports, Nature, Music, Photography) or Random. Easy uses across, down and diagonal; Hard is a bigger grid with every direction and backwards words. Keyboard and controller: move, then Space or A at each end.
- **Vault Maze:** walk to the flag; each level is a bigger maze, with gems to pick up on the way. Fog mode only shows what is near you. Arrows or W A S D, hold to keep going, or click beside the dot.
- **Memory Vault:** flip cards to find the pairs, using your own game covers when you have enough of them. Fewer moves is better.

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

## What's new in 0.17.3

- **Zoom inside Xbox Remote Play and the Discord tab:** Ctrl and + (or =) zoom in, Ctrl and - zoom out, Ctrl+0 resets. Zooming in used to need Shift there.

## What's new in 0.17.2

- **Background programs no longer count as playing:** a game now only counts while one of its programs has a window open. Some games, Roblox above all, leave a process running in the background after you close them, which used to show as Playing now and add hours. Each game's details have a "Counts as playing" switch: Automatic (the default), Only with its window open, or Any of its programs. Microsoft Store and Xbox app games keep the old way automatically, because their windows belong to a Windows helper.

## What's new in 0.17.0: a hundred improvements

**Anime (21)**
1. Watch sites: your own list of sites, in order (Settings, Connections, AniList).
2. Exact pages when AniList links the show on that site.
3. Built in searches for Crunchyroll, HIDIVE, Netflix, Hulu, Prime Video, Disney+, Max, YouTube, Tubi and RetroCrush.
4. Any other site works through a web search limited to that site that opens the first result.
5. Your own search link per site, with {title}.
6. Search by the English or the Japanese title.
7. Watch on button with a menu of every other site.
8. Where to watch shows which links are exact pages and which are searches.
9. Undo after +1 episode.
10. + and - keys change episodes on the focused card.
11. W opens your first watch site for the focused card.
12. Genres in the details are clickable and filter your list.
13. Stats strip: completed, episodes, days watched, mean score, top genre.
14. Next episodes say Today, Tomorrow or the weekday, with the time.
15. Sort by shortest left.
16. Rewatching badge with how many times.
17. Copy title in the right click menu.
18. / or Ctrl+F jumps to the anime search.
19. The header says when the list was last updated.
20. Your list is kept on disk, so the page opens instantly and works offline.
21. When AniList is busy, Crimson Vault waits and tries again.

**Library and details (17)**
22. Copy name. 23. Copy folder path. 24. Reset a renamed game. 25. Find guides online. 26. Steam store page (all in the right click menu).
27. Play something random from a category.
28. Details say where the game ranks among your most played.
29. Sessions, 30. longest session, 31. this week and 32. time on Xbox in the details.
33. Achievement filter: all, unlocked, locked. 34. Newest unlocks first.
35. [ and ] move to the previous and next game. 36. Enter plays.
37. Hover a card for hours and when you last played. 38. Middle click a card to play.

**Keyboard and window (12)**
39. F2 renames. 40. Delete hides (with undo). 41. Ctrl+D favorites. 42. Ctrl+1 to 9 for the main pages. 43. Ctrl+, opens Settings. 44. Alt+Left goes back. 45. The mouse back button goes back.
46. Ctrl and + / - / 0 zoom. 47. Zoom is remembered and has a setting.
48. ? shows every shortcut. 49. The window title follows the page. 50. The window reopens at the size and place you left it, maximized too.

**Toasts, Home, guide and search (10)**
51. Hovering a toast keeps it. 52. Toasts can be clicked.
53. Home shows what you played today. 54. Click the clock for 24 hour time. 55. Favorite friends first on Home. 56. How many more friends are online.
57. The guide shows your next anime episode.
58. Ctrl+K finds Settings sections, 59. your anime and 60. the shortcut list.

**Deals and news (5)**
61. Read news posts dim. 62. Mark a free game as claimed to hide it. 63. Copy a free game's link. 64. Right click a wishlist deal to search its price history. 65. News shows how many posts are new.

**Statistics (5)**
66. Play streak and your best streak. 67. Longest session. 68. Hours on Xbox. 69. Anime hours. 70. Export your play history to a spreadsheet.

**Friends (5)**
71. Sort by who just started playing. 72. Offline friends fold away. 73. Offline cards say what they last played. 74. Message on Steam. 75. Games you both have, with covers.

**Arcade (12)**
76. Games pause when you switch windows. 77. A setting for that. 78. Each tile says when you last played it. 79. Total games played. 80. Continue your last game.
81. Vault Words: Copy result (without the word). 82. Vault Words hard mode.
83. Word Search hint. 84. Maze: show the way. 85. Crossword jumps to the next unfinished word. 86. Crossword Reveal all. 87. Sudoku: right click clears a square.

**Settings and reliability (13)**
88. Back up your settings to a file. 89. Restore a backup (passwords, keys and sign ins are never included).
90. Settings search highlights what matches. 91. Settings reopens at the section you were reading.
92. Reduce animations. 93. A short What's new after each update.
94. Health: Restart now. 95. Health shows how long the app has been running.
96. Tray menu: Anime. 97. Clicking a new episode alert opens that show.
98. Search waits a moment while you type in big libraries.
99. A running game's right click menu says Back to game.
100. News: Mark all read.

## What's new in 0.16.6

- **Anime Surprise me uses the full games reel:** spinning covers, sound, sparks and the show's banner when it lands.

## What's new in 0.16.5

- **Anime page with AniList:** Watching, Planned, Completed, Paused, Dropped and All, a Surprise me picker, next episode countdowns and alerts, and editing when signed in. See Anime above.

## What's new in 0.16.4

- **Background mode, for leaving Crimson Vault open for days:**
  - Minimized or in the tray, every part of the app runs at below normal priority, and the page stops its timers and animations.
  - After 3 minutes in the tray the window closes to free memory and graphics resources. Alerts, hours tracking, Xbox play, music and the phone remote keep working, and the window opens again from the tray icon. Alerts that came in meanwhile show up in the Alerts tab.
  - The Discord tab closes after an hour in the tray.
  - Once a day, or if Windows handles or memory start to build up, Crimson Vault restarts itself quietly in the tray when nothing is going on (never during a game, a console session, a stream or a download).
  - Drive space is read straight from the disk instead of starting PowerShell every few minutes.
  - Settings, Health shows Windows handle and graphics counts, logs them every 30 minutes, and has a switch to stop using the graphics card if the screen, wallpaper or taskbar act up.

## What's new in 0.16.3

- **Four puzzle games in the Arcade:** Vault Crossword, Vault Sudoku, Vault Word Search and Vault Maze.

## What's new in 0.16.2

- **Vault Words:** a daily five letter word game in the Arcade, with free play and streaks.

## What's new in 0.16.1

- **Friend alerts fixed:** only when a friend changes games, never repeats for the same game within 3 hours, and one alert for friends who start together.
- **Made up profile pictures** for friends without one, or when theirs fails to load.
- **Friends:** favorites pinned to the top, mute alerts per friend, "playing for" times, last seen playing, friends in the same game grouped together, copy name, search shortcuts, and the page only redraws when something changes.
- **Alert setting:** games you own or any game.
- **Home and guide:** clicking a friend opens their profile; so does clicking a friend pop up.
- **Covers:** a cover link that stops working falls back to the made up cover.
- **Xbox play:** the session in progress is saved when Crimson Vault closes, and console time counts toward a game's hours.
- **Smaller things:** Ctrl+S saves Settings, repeated toasts merge into one, and the same alert is not saved twice within 30 minutes.

## What's new in 0.16

- **Six new arcade games:** Gem Merge, Vault Sweeper, Ember Flight, Sky Raiders, Vault Runner and Memory Vault.
- **Settings is a page:** a section list on the left, a search box, and a save bar with Undo changes. Leaving the page saves.
- **Better covers for apps and games without art:** Crimson Vault pulls the big Windows icon from the app or its shortcut and builds a cover in that icon's color; anything without an icon gets a clean name card.
- **Friends page and profiles:** see Friends above.
- **Xbox console play tracking:** see above.

## What's new in 0.15

- **Guide Alerts tab:** friend activity, session summaries, price drops, finished downloads and storage warnings are kept so you can read the ones you missed. A red badge counts new ones.
- **Ready to play:** a pop up when a Steam download finishes.
- **Game details:** your play history (sessions, average and longest session, last time, first seen, and a 30 day chart) and "More like this" from the same genre in your library.
- **Friends:** a Join button on a friend who is playing a game you own launches it (or installs it).
- **Deals:** search your wishlist, filter by On sale, $10 or less or Don't own, and see "Owned on …" when you already have a wishlist game on another launcher.
- **Surprise me:** skips your last 5 picks and gives backlog and never played games a better chance (both can be turned off on the page).
- **Home:** greets you by gamertag and shows your next 3 recent games in the corner of the banner.
- **Stats:** hours by genre and this month's most played.

## Quality of life

- **Find anything (Ctrl+K):** type to launch a game, open a page or run an action (settings, controller mode, rescan, sleep, restart and more). Enter opens, Shift+Enter shows details.
- **Undo:** hiding, moving, favorites, status and game or app changes show Undo on the pop up. Ctrl+Z works too.
- **Pick several cards:** Ctrl+click or Shift+click cards, then Favorite, Move, Status or Hide them together. Esc clears.
- **Back keeps your place:** going back returns to where you had scrolled.
- **New installs show up by themselves:** Steam and Epic folders are watched, and a quiet rescan runs every 2 hours.
- **Session summary:** when a game closes you see how long you played and any achievements you unlocked. Stats has a "Your week" recap.
- **Do not disturb while playing:** friend and deal pop ups wait until you close the game, then show together.
- **Downloads:** Steam downloads and updates (and unfinished Epic installs) show in the guide with progress.
- **Controller battery** in the guide header for Xbox controllers.
- **Play time reminders:** an optional nudge after 1 to 4 hours in one sitting.
- **Auto controller mode:** picking up a controller switches to controller mode; moving the mouse switches back.
- **Your screenshots:** Steam and Xbox Game Bar captures show in each game's details.
- **Low space warning:** a pop up when a drive drops under the amount you choose.

All of these can be changed in Settings > Quality of life.

## Speed

Big libraries open fast: lists are sorted once and remembered, cards far down the page are drawn when you scroll near them, off screen cards are skipped by the browser, and library updates are drawn at most once per frame. With 1,700 items, switching pages went from about 85 ms to about 3 ms and opening Everything from about 220 ms to about 11 ms.

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
