# Google Play listing - Tic-Tac-Toy by Kunal

Copy-paste text for the Play Console. Limits are Google's; character counts are checked.

## Main store listing

**App name** (30 max)

```
Tic-Tac-Toy: Games by Kunal
```

Google Play's metadata policy does not allow price or promo words such as "free", "ad-free" or "no ads" in the
app name, icon, short description, feature graphic or screenshots. "No ads" goes at the top of the full description.

**Short description** (80 max)

```
Tic Tac Toe, Snakes & Ladders, Ludo and Color Cards for the whole family.
```

**Full description** (4000 max)

```
NO ADS. No pop-ups, no tracking - just tap and play!
Tic-Tac-Toy is a box of four classic games made by Kunal, for kids, parents and grandparents.

FOUR GAMES IN ONE
• Tic Tac Toe - play the computer, a friend, or watch two computers play
• Snakes & Ladders - climb the ladders, dodge the snakes, first to 100 wins
• Ludo - roll a 6 to come out, capture the others and race your four tokens home
• Color Cards - match the colour or the number, use the Rainbow card, and be the first with no cards left

PLAY YOUR WAY
• 2 to 4 players on one phone or tablet, or play against the computer
• Computer levels from Easy to Impossible - gentle for a 5-year-old, a real challenge for grown-ups
• Big buttons, bright colours and simple words in English and Hindi

MADE FOR EVERYONE
• Works on phones and tablets, in portrait and landscape
• Sound and vibration you can switch on or off
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
  (served by the game server; `node server/deploy.mjs` on the online-play branch publishes the copy from `main`)

## App content answers (Policy > App content)

| Section | Answer |
| --- | --- |
| Privacy policy | URL above |
| Ads | **No**, the app does not contain ads |
| App access | All functionality is available without special access (no login) |
| Content rating | Category: Game. Answer **No** to every violence, fear, sexuality, language, drugs, gambling and user-interaction question. Expected rating: Everyone / PEGI 3 / IARC 3+ |
| Target audience | Ages 6-8, 9-12, 13-15, 16-17, 18+ (including children means Google's Families policy applies - the app already meets it: no ads, no data collection) |
| Data safety | **Does your app collect or share any of the required user data types? → No.** Settings and scores stay on the device and are never sent anywhere |
| Government apps | No |
| Financial features | No |
| Health | No |
| News app | No |

## Release

- Upload: `dist/TicTacToy.aab` (built by `build-apk.ps1`)
- App signing: keep **"Let Google manage and protect your app signing key"** (`android/upload.keystore` is the upload key)
- Release name: `1 (1.0)`
- Release notes:

```
First release of Tic-Tac-Toy by Kunal - ads-free Tic Tac Toe with 3 game modes and 5 difficulty levels.
```

- New personal developer accounts: run a **closed test with at least 12 testers for 14 days** before applying for production.
