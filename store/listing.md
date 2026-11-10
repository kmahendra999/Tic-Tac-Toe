# Google Play listing - Tic-Tac-Toy by Kunal

Copy-paste text for the Play Console. Limits are Google's; character counts are checked.

## Main store listing

**App name** (30 max)

```
Tic-Tac-Toy by Kunal
```

Google Play's metadata policy does not allow price or promo words such as "free", "ad-free" or "no ads" in the
app name, icon, short description, feature graphic or screenshots. "No ads" goes at the top of the full description.

**Short description** (80 max)

```
Tic Tac Toe for the whole family: play a friend or the computer at 5 levels.
```

**Full description** (4000 max)

```
NO ADS. No pop-ups, no tracking - just tap and play!
Tic-Tac-Toy is a simple, colourful Tic Tac Toe game made by Kunal.

THREE WAYS TO PLAY
• You vs Computer - test yourself against the computer
• 2 Players - pass the phone or tablet and play a friend
• Computer vs Computer - sit back and watch two computers battle it out

FIVE DIFFICULTY LEVELS
Easy, Normal, Medium, Hard and Impossible. Start easy and work your way up - can you beat the computer on Hard? On Impossible, the best you can hope for is a draw!
You can change the level from the menu or right in the middle of a game.

MADE FOR EVERYONE
• Bold black, blue and yellow design that is easy on the eyes
• Works on phones and tablets, in portrait and landscape
• Score board for X, O and draws
• Sound and vibration you can switch on or off
• Menu labels in English and Hindi
• Works completely offline - no internet needed

100% ADS-FREE AND PRIVATE
No ads. No in-app purchases. No sign-in. No data collected. The app does not even ask for internet access.

Made with ❤ by Kunal.
```

## Graphics (files in this folder)

| Field | File |
| --- | --- |
| App icon (512x512) | `play-icon-512.png` |
| Feature graphic (1024x500) | `feature-graphic-1024x500.png` |
| Phone screenshots | `screenshots/phone-*.png` |
| 7-inch tablet screenshots | `screenshots/tablet7-*.png` |
| 10-inch tablet screenshots | `screenshots/tablet10-*.png` |

## Store settings

- **App or game:** Game
- **Category:** Board
- **Tags:** Board, Casual, Offline, Single player, Multiplayer (local)
- **Free or paid:** Free
- **Contact email:** k.mahendra999@hotmail.com
- **Privacy policy URL:** https://androidapps.vidiaplus.com/tictactoy/privacy-policy.html
  (served by the game server; `node server/deploy.mjs` publishes the copy from `main`)

## App content answers (Policy > App content)

| Section | Answer |
| --- | --- |
| Privacy policy | URL above |
| Ads | **No**, the app does not contain ads |
| App access | All functionality is available without special access (no login) |
| Content rating | Category: Game. Answer **No** to every violence, fear, sexuality, language, drugs, gambling and user-interaction question. Expected rating: Everyone / PEGI 3 / IARC 3+ |
| Target audience | All ages: 5 and under, 6-8, 9-12, 13-15, 16-17, 18+ (including children means Google's Families policy applies - the app already meets it: no ads, no data collection) |
| Data safety | **Does your app collect or share any of the required user data types? → No.** Settings and scores stay on the device and are never sent anywhere |
| Government apps | No |
| Financial features | No |
| Health | No |
| News app | No |

## Version 1.1 (online play) - update these when releasing it

Version 1.0 is offline; the answers above are for 1.0. When 1.1 goes out, change these in Policy → App content:

| Section | New answer for 1.1 |
| --- | --- |
| Privacy policy | Same URL - the page already describes online play |
| Data safety → collects data? | **Yes**. Encrypted in transit: **Yes**. Users can ask for deletion: **Yes** |
| Data safety → data types | **Personal info → User IDs** (made-up game name + sign-in code) and **App activity → Other user-generated content** (moves, emoji taps). Purpose: **App functionality**. Not shared. Required for online play only |
| Data safety → delete account URL | https://kmahendra999.github.io/Tic-Tac-Toe/delete-account.html |
| Content rating | Re-take: **Users can interact: Yes** (only fixed emoji, no chat, no free text); shares location: No; digital purchases: No |
| Target audience | Unchanged; Families policy: no ads, no personal data, no chat, players pick names from pictures |

Full description - add to "THREE WAYS TO PLAY":

```
• Play Online - invite a friend with a 4-number code, or play anyone. Pick an animal player, no email needed. No chat: just fun emoji 👋👍😮😂🎉
```

## Release

- Upload: `dist/TicTacToy.aab` (built by `build-apk.ps1`)
- App signing: keep **"Let Google manage and protect your app signing key"** (`android/upload.keystore` is the upload key)
- Release name: `1 (1.0)`
- Release notes:

```
First release of Tic-Tac-Toy by Kunal - ads-free Tic Tac Toe with 3 game modes and 5 difficulty levels.
```

- New personal developer accounts: run a **closed test with at least 12 testers for 14 days** before applying for production.
