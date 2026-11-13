# Privacy

Crimson Vault is a hobby project that runs on your PC. It has no account, no servers of its own, no analytics, no ads and no tracking. The developer never receives anything from your copy of the app.

This page lists everything it reads, stores and sends, so you can check for yourself. The source code is public in this repository.

## What it reads on your PC

- **Installed games and apps:** launcher folders and settings files (Steam, Epic, GOG, Ubisoft, EA, Battle.net, Xbox and Microsoft Store, Riot, Rockstar, CurseForge and others), the Windows list of installed programs, and Start menu shortcuts.
- **Running programs:** which game is running and whether it has a visible window, to count hours played. It only checks programs in your library.
- **Now playing:** the song title, artist, album art and position that Windows itself shows for media apps (Apple Music, Spotify, browsers).
- **Your controller:** button presses from Xbox style controllers, read through Windows (XInput), so the guide can open from the controller. Only the controller is read.
- **SteelSeries Sonar** (only if you use it): Sonar's volume settings, through GG's local control server on this PC (127.0.0.1).
- **Drive space and game folder sizes,** for the Storage page.

## What it never does

- No keyboard logging. The only keys watched outside the app are the two shortcuts you set (show or hide, and the guide), registered through Windows. Inside its own windows it only reacts to its own shortcuts.
- No screen recording or screenshots.
- No camera or microphone. The app's own pages are blocked from both.
- No reading your clipboard. It only writes to it when you press a Copy button.
- No reading your files, browser history, passwords or other apps' data beyond the launcher files above.
- No selling, sharing or uploading your library, playtime or activity anywhere.
- No hidden network connections. Every service it talks to is listed below.

## What it stores, and where

Everything stays in `%APPDATA%\Crimson Vault` on your PC:

- `library.json`: your library, categories, notes, ratings, hours played and settings. Keys, tokens and sign ins in it are **encrypted** with Windows' protection for your user account, so another Windows user or a copy of the file on another PC cannot read them.
- `covers` and `icons`: cached cover art.
- `diagnostics.log`: start, crash and memory notes for troubleshooting (kept under 1 MB, never sent anywhere).
- Sign in sessions for Steam, Epic, Xbox, AniList, Ubisoft and Xbox Remote Play, each in its own separate browser storage.

Uninstalling and deleting that folder removes everything. **Settings, Backup** exports your settings without any keys or sign ins.

## What it sends, and to whom

Only when the related feature is on. Each request goes straight from your PC to that service, under that service's own privacy policy.

| Service | What is sent | When |
|---|---|---|
| Steam (store and Web API) | Your Steam ID and API key, game IDs | Owned games, friends, achievements, store info, if you add a key |
| Epic Games | Your Epic sign in | Owned games and friends, if you sign in |
| GOG | Game IDs | Store info, and owned games from GOG Galaxy's own file |
| Microsoft / Xbox Live | Your Microsoft sign in | Xbox friends, achievements and console play, if you sign in |
| OpenXBL (xbl.io) | Your OpenXBL key | Xbox friends, only if you add that key |
| Ubisoft | Your Ubisoft sign in | Friend activity, if you turn it on |
| Discord | Nothing leaves this PC except Discord's own sign in exchange | Rich Presence, and (with your one time approval inside Discord) your current voice channel and who is in it, read locally from the Discord app. Mute, deafen and leave send those commands to the Discord app on this PC |
| AniList | Your AniList sign in or user name | The Anime page |
| SteamGridDB | Your SteamGridDB key, game names | Cover art, if you add a key |
| Steam image servers | Game IDs | Cover art for Steam games |
| LRCLIB (lrclib.net) | Song name, artist, album and length | Lyrics, **only if you turn lyrics on** (off by default) |
| Apple iTunes search, Deezer | Song name and artist | Album and artist pictures on Now Playing |
| SteamSpy, GamerPower, Steam and Epic store pages | Game IDs or nothing | Deals, free games and genre info |
| GitHub | Nothing personal | Checking for and downloading updates |

Links you click (store pages, guides, watch sites) open in your normal browser.

## The phone remote

Off by default. When you turn it on, it only answers devices on your home network (private addresses), needs the pairing code from the QR code, and blocks a device after too many wrong tries. **Unpair all phones** makes a new code. It never opens to the internet.

## Children

Crimson Vault does not collect anything from anyone, so it collects nothing from children either. The services above have their own age rules.

## Changes

Changes to this page are listed in the README under What's new. Questions: open an issue on GitHub.
