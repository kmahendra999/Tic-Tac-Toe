# Tic-Tac-Toy : Ads free game by Kunal

A 3x3 Tic Tac Toe game for Android phones and tablets, in black, blue and yellow. No ads, no tracking.

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
| `tools/` | `serve.js` (local preview server), `make-icons.ps1` (launcher + store icons from `art/icon-source.jpg`) |
| `art/` | `icon-source.jpg`, the picture every icon is made from |
| `store/` | Play Store listing images: 512x512 icon, 1024x500 feature graphic |
| `build-apk.ps1` | Builds and signs `dist/TicTacToe.apk` (direct install) and `dist/TicTacToy.aab` (Google Play upload) |

## Build

Needs the Android SDK (build-tools and a platform) and a JDK. For the `.aab`, also put
[bundletool](https://github.com/google/bundletool/releases) (`bundletool-all-<version>.jar`) in `tools/bin/`;
without it the script still builds the APK and skips the `.aab`.

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

Raise `$VersionCode` (and `$VersionName`) in `build-apk.ps1` before every Play Store update.

### Signing key

`android/upload.keystore` and its password file `android/keystore.properties` stay on your PC and are never committed.
**Back up both files somewhere safe** (e.g. a USB stick and a private cloud folder): every Play Store update must be
signed with this same upload key. If both are missing, the script creates a new key with a random password.

## Play in a browser

```bash
node tools/serve.js 5173
```

Then open http://127.0.0.1:5173.
