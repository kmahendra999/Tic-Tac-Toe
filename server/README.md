# Online server (cPanel)

`api.php` is the whole game server: players (guest, or animal + colour + number + 4-digit PIN), friend codes,
random matches, moves, emoji and rematches. The app checks it about once a second during a game.
It needs **PHP 7.4 or newer** with **pdo_mysql** and a **MySQL/MariaDB** database - standard on cPanel hosting.

## Set up on cPanel

1. **Address.** cPanel → *Domains* (or *Subdomains*): create e.g. `games.yourdomain.com`, or use a folder such as
   `public_html/tictactoy` on an existing site.
2. **HTTPS.** cPanel → *SSL/TLS Status* → run AutoSSL so the address works with `https://`.
   Android only allows the app to talk to `https://` addresses.
3. **Database.** cPanel → *MySQL Databases*:
   - create a database, e.g. `tictactoy` (cPanel names it `<cpaneluser>_tictactoy`)
   - create a user with a strong password, e.g. `ttt`
   - *Add User To Database* → tick **ALL PRIVILEGES**
4. **PHP.** cPanel → *MultiPHP Manager*: choose PHP 8.1 or newer for that domain.
5. **Upload.** cPanel → *File Manager* → open the folder from step 1 and upload:
   - `api.php`
   - `.htaccess` (turn on *Show Hidden Files* in File Manager settings to see it)
6. **Config.** In the same folder, create `config.php` from `config.sample.php` and fill in the database
   name, user and password from step 3. It never goes into git.
7. **Check.** Open `https://<your address>/api.php` in a browser. You should see
   `{"ok":true,"service":"tic-tac-toy"}`. The tables (`ttt_users`, `ttt_games`) are created on the first game request.
8. **Point the app at it.** Put the address in `SERVER` at the top of `web/online.js`, then rebuild with `build-apk.ps1`.

## Test on your PC

```bash
node tests/server.test.js
```

Runs the server on PHP's built-in web server with a throw-away SQLite database (`PHP` can point at php.exe).
To try the online screens in a browser, run the server with `php -S 127.0.0.1:8080 -t server` (with `server/config.php`
using SQLite) and open the game as `http://localhost:5173/?server=http://127.0.0.1:8080/api.php`.

## Housekeeping

The server tidies itself up: finished games are deleted after a day, unanswered invites after 2 minutes,
and guests who have not played for 90 days. Five wrong PINs lock a player for 15 minutes.
