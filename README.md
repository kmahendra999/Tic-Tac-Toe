# Tic Tac Toe

A 3x3 Tic Tac Toe game for Android phones and tablets, in black, blue and yellow.

- **Modes:** Player vs Computer, 2 Players, Computer vs Computer
- **Difficulty:** 5 levels (Easy, Normal, Medium, Hard, Impossible), adjustable from the menu or during play
- **Extras:** score tracking, sound, vibration, portrait and landscape layouts

## Install

Download [`dist/TicTacToe.apk`](dist/TicTacToe.apk), open it on the device and allow "Install unknown apps" when asked.

## Project layout

| Path | Contents |
| --- | --- |
| `web/` | The game: `index.html` (UI) and `game.js` (rules and computer player) |
| `android/` | Android wrapper: manifest, resources, `MainActivity.java` (WebView) |
| `tests/` | Logic tests: `node tests/game.test.js` |
| `tools/` | `serve.js` (local preview server), `make-icons.ps1` (launcher icons) |
| `build-apk.ps1` | Builds and signs `dist/TicTacToe.apk` |

## Build

Needs the Android SDK (build-tools and a platform) and a JDK.

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

The signing key `android/release.keystore` is not in the repository. Keep your own backup of it: updates to an installed app must be signed with the same key. If it is missing, the script creates a new one.

## Play in a browser

```bash
node tools/serve.js 5173
```

Then open http://127.0.0.1:5173.
