# Online server (Cloudflare)

Live at **https://androidapps.vidiaplus.com/tictactoy/api** (Cloudflare account *Mahendrakumardevops@gmail.com's Account*).

| File | What it is |
| --- | --- |
| `worker.mjs` | The whole game server as a Cloudflare Worker: players (guest, or animal + colour + number + 4-digit PIN), friend codes, random matches, moves, emoji, rematches |
| `schema.sql` | The two tables (`ttt_users`, `ttt_games`) in the D1 database `tictactoy` |
| `deploy.mjs` | Creates or updates everything on Cloudflare: D1 database + schema, Worker `tictactoy`, DNS name, route `androidapps.vidiaplus.com/tictactoy/*` |
| `local.mjs` | Runs `worker.mjs` on this PC with Node's built-in SQLite instead of D1 (tests and browser previews) |

The app checks the server about once a second during a game. The free Workers and D1 plans are plenty for this.

## Deploy a change

Needs an API token that can edit Workers, D1, DNS and Workers Routes for the account and `vidiaplus.com`.
The token is never stored in this repository - set it for the one command:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<token>'; $env:CLOUDFLARE_ACCOUNT_ID = '<account id>'
node server/deploy.mjs
```

Running it again is safe: it keeps the database and only uploads the new Worker code.

After Google Play approves a new app version, raise `LATEST_APP` in `worker.mjs` to its version code and deploy.
Older online-capable apps (1.1 and later) then show "Update available" with Update and Skip on start.

## Test

```bash
node tests/server.test.js
```

Runs 42 checks against `local.mjs` with a fresh in-memory database. To check the live server instead
(it deletes its test players afterwards):

```powershell
$env:TTT_URL = 'https://androidapps.vidiaplus.com/tictactoy/api'; node tests/server.test.js
```

To try the online screens against a local server: `node server/local.mjs 8080`, `node tools/serve.js 5173`, then open
`http://localhost:5173/?server=http://127.0.0.1:8080/tictactoy/api` (the address is remembered; open with the live
address to switch back).

## Housekeeping

The server tidies itself up: finished games are deleted after a day, unanswered invites after 2 minutes,
and guests who have not played for 90 days. Five wrong PINs lock a player for 15 minutes.
