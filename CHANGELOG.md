# Changelog

Older release notes, newest first. The latest release's notes stay in the README.

## What's new in 0.19.0: the Discord tab becomes the call card

- **The Discord tab is gone.** It was a whole copy of Discord's web app living inside Crimson Vault: heavy, needing its own sign in, and redundant next to the real Discord app. Removing it frees memory and one more background web view.
- **Your call, in the guide.** In its place, the guide Home now shows the voice call you are in, read from the Discord desktop app itself: channel name, who is in it with avatars, a green ring around whoever is talking, and working Mute, Deafen and Leave buttons. It also works in the overlay, so you can mute Discord from inside a game.
- **One time setup:** Settings, Connections, Rich Presence now has a client secret field and a Connect voice button. Press it and Discord itself shows an Allow popup once. The approval is stored encrypted on this PC.
- The Pairs with card for Discord now opens the Discord app.

## What's new in 0.18.7: guide and settings polish

- **Downloads in the guide** only appear while bytes are actually moving. Paused, queued and abandoned installs used to sit there forever.
- **Friend profiles open over the guide** and the guide stays put. This also fixes the overlay: clicking a friend used to hide the overlay with the profile stranded inside it.
- **Pairs with** on the Launchers page: SteelSeries Sonar, Apple Music and Spotify, Discord, AniList, Xbox console, the phone remote and LRCLIB lyrics, each with where to open or set it up.
- **Alerts:** every alert has an x to dismiss just that one, and Clear only clears the kind you filtered to.
- **Settings search** (after looking at how Steam, Discord and the usual settings design guides do it): matches are highlighted and counted, the section list narrows to sections with matches, Enter jumps to the first one, Escape clears the search, and Ctrl+F or / search settings while you are on the page.

## What's new in 0.18.6

- **Fixed:** the full screen music view froze on the song it opened with; the sidebar kept up but the big view did not. Title, cover art, background colors and lyrics now follow every song change.

## What's new in 0.18.5: Discord presence everywhere, and your music

- **Music on Discord, like Spotify.** The song you are listening to shows on your profile as "Listening to", with the album art and a progress bar, separately from (and at the same time as) the game you are playing. It uses a second Discord application made just for music, so name that one something like "Music". Choose While music plays, Only in Now Playing, or Off in Settings.
- **Your music.** Crimson Vault now keeps a listening history on this PC only: a song counts after 30 seconds. The Stats page shows your top artists, top songs, play counts, time listening and what is on repeat this month.
- **Presence for everything else.** The Arcade (with the mini game's name), Xbox console play, Remote Play streaming, Surprise me rolls, and the page you are browsing (only if "Show when browsing" is on). A "Get Crimson Vault" button can show on your status; turn it off in Settings.
- **Guide:** Roll a game and Roll an anime from Home, an On Xbox card when a console session is live, click the music bar to jump, filter Alerts by kind, the clock ticks, friends show how long they have been in a game, and the guide reopens on the tab you used last.
- **Quick settings** gains lyrics and Discord toggles.
- Set up: make two applications at discord.com/developers/applications (one named Crimson Vault, one named Music), paste both IDs in Settings, Connections, Rich Presence.

## What's new in 0.18.4: privacy and trust

- **Lyrics are opt in.** Off by default. The first time you press Lyrics, the app explains that they come from LRCLIB (a free community database, not Apple Music or Spotify) and asks before turning them on. There is also a toggle in Settings.
- **Secrets encrypted.** API keys and sign ins in library.json are now encrypted with Windows' protection for your user account. Another Windows user, or a copy of the file, cannot read them. The settings backup still never includes them.
- **Hardened exe.** The built app refuses Node.js code injection (ELECTRON_RUN_AS_NODE, NODE_OPTIONS, debugger flags), encrypts its cookies, and only loads its own packaged code. The main window now runs sandboxed, never navigates away, and camera, microphone and screen capture are blocked for the app's own pages.
- **PRIVACY.md and TERMS.md** spell out what the app reads, stores and sends, what it never does, and that it is not affiliated with any of the services it connects to.
- **MIT license** added to the repo.

## What's new in 0.18.3: the guide from anywhere, for real

- **Controller opens the guide anywhere.** Press the Xbox button, or View + Menu together, with Crimson Vault minimized or in the tray, even on an empty desktop. Pick which in Settings. Crimson Vault reads the controller itself through XInput (built into Windows), so it works without focus, and the controller drives the overlay the same way it drives the app (B closes it).
- **Fixed:** the overlay could close the instant it opened, because Windows sent a focus loss while it was still appearing.
- **Open the guide** from the tray icon's menu.
- If another app already uses the guide shortcut, Crimson Vault says so instead of failing quietly.
- If the Xbox button also opens Xbox Game Bar, turn that off in Windows Settings, Gaming, Game Bar, or use View + Menu.

## What's new in 0.18.2: Sound tab and the guide from anywhere

- **Sound tab in the guide.** Every Sonar channel (Master, Game, Chat, Media, Aux, Mic) with a slider, 5% steps and mute, plus chat mix and Classic or Streamer mode. Updates every 2 seconds while the tab is open. Big mixer opens the full one.
- **The guide while minimized.** Press **Ctrl+Alt+G** anywhere and the guide slides in over whatever you are doing, even with Crimson Vault minimized or in the tray. Click outside it or press Escape to put it away. Picking a page or a game opens the full app; starting a game or changing music and sound stays in the overlay. Change or turn off the shortcut in Settings.
- Games in exclusive full screen draw over everything, so use borderless or windowed to see the overlay.

## What's new in 0.18.1: SteelSeries Sonar

A Sound mixer for SteelSeries Sonar (part of SteelSeries GG). Open it from Now Playing (the sliders button, or S), the Home music card, the guide's Music tab, or Ctrl+K "Sound mixer".

- **Every Sonar channel:** Master, Game, Chat, Media, Aux and Mic, each with a volume slider and a mute button.
- **Chat mix:** the game and chat balance dial (double click to center).
- **Classic or Streamer mode:** switch between them, and in Streamer mode choose Your mix or Stream mix.
- **Live:** changes made in GG or with a headset dial show up within two seconds.
- **Nothing to set up:** Crimson Vault finds Sonar on its own through GG. Everything stays on this PC. If GG is closed or Sonar is off, the mixer says so.

Sonar's control routes are not officially documented by SteelSeries; Crimson Vault uses the same ones as the open source SteelSeries-NET-API and steelseries-sonar-py projects, so a big GG update could change them.

## What's new in 0.18.0: Now Playing

A full screen view of what is playing in Apple Music, Spotify or any player Windows knows about. Open it with **M**, the expand button on the music cards, a click on the cover, or Now Playing in the guide's Music tab.

- **Lyrics that follow the song:** timed lyrics from LRCLIB (a free public lyrics database), looked up while the song plays. The current line is large and bright and fills in word by word as it is sung, the next line waits below, and the view scrolls by itself. Click any line to jump to it. If the words run early or late, nudge them by half a second (remembered per song). Untimed lyrics scroll gently with the song, and instrumentals say so.
- **Art from the album and the artist:** the cover in high resolution (Apple's public iTunes search), and the artist's photo fading in behind the lyrics (Deezer's public search). Album, year and genre under the title.
- **Colors from the cover:** the whole screen takes its colors from the album art, with drifting light, floating specks that rise faster while music plays, and a soft pulse on every new line.
- **Touches:** the cover tilts a little with the mouse and breathes while playing, the controls fade when the mouse rests, a progress bar you can click to jump, and full screen with F.
- **Keys:** Space play or pause, N next, P previous, Left and Right jump 5 seconds, L lyrics on or off, F full screen, Esc close.
- **Small cards:** the sidebar and Home music cards show the line being sung right now.
- **Spotify:** turn on "Spotify and other music apps too" in Settings, Connections.

## What's new in 0.17.3

- **Zoom inside Xbox Remote Play:** Ctrl and + (or =) zoom in, Ctrl and - zoom out, Ctrl+0 resets. Zooming in used to need Shift there.

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
