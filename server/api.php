<?php
// Tic-Tac-Toy online server: one JSON endpoint for players, friend codes, random matches and moves.
// Clients POST {"action": "...", "token": "...", ...} as text/plain (no CORS preflight) and poll about once a second.
// Works with MySQL/MariaDB (cPanel) or SQLite (local testing); tables are created on first use.
// Needs PHP 7.4+.
declare(strict_types=1);

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'];
const ANIMALS = ['tiger', 'lion', 'panda', 'puppy', 'kitty', 'bunny', 'fox', 'frog', 'monkey', 'elephant', 'unicorn', 'penguin'];
const EMOJI_COUNT = 5;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const AWAY = 25;          // seconds without a poll before a player counts as gone
const MAX_FAILS = 5;      // wrong PINs in a row before the player is locked
const LOCK_SECONDS = 900;

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(['ok' => true, 'service' => 'tic-tac-toy']);

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fail(string $error, int $code = 400, array $extra = []): void
{
    out(['ok' => false, 'error' => $error] + $extra, $code);
}

/* ---------- database ---------- */

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $cfg = require __DIR__ . '/config.php';
    $pdo = new PDO($cfg['dsn'], $cfg['user'] ?? null, $cfg['pass'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    ensureSchema($pdo);
    return $pdo;
}

function ensureSchema(PDO $pdo): void
{
    try {
        $pdo->query('SELECT 1 FROM ttt_games LIMIT 1');
        return;
    } catch (PDOException $e) {
        // first run: create the tables below
    }
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $id = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $tail = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS ttt_users (
        id $id,
        color VARCHAR(10) NOT NULL, animal VARCHAR(12) NOT NULL, num INT NOT NULL,
        pin_hash VARCHAR(255) NULL, token_hash CHAR(64) NULL, guest SMALLINT NOT NULL DEFAULT 0,
        wins INT NOT NULL DEFAULT 0, losses INT NOT NULL DEFAULT 0, draws INT NOT NULL DEFAULT 0,
        fails INT NOT NULL DEFAULT 0, locked_until INT NOT NULL DEFAULT 0,
        created INT NOT NULL, seen INT NOT NULL,
        UNIQUE (color, animal, num))$tail");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ttt_games (
        id $id,
        kind VARCHAR(6) NOT NULL, code CHAR(4) NULL,
        x_id INT NOT NULL, o_id INT NULL,
        board CHAR(9) NOT NULL DEFAULT '.........', turn CHAR(1) NOT NULL DEFAULT 'X',
        status VARCHAR(8) NOT NULL, winner CHAR(1) NULL, line VARCHAR(8) NULL, ver INT NOT NULL DEFAULT 0,
        x_seen INT NOT NULL DEFAULT 0, o_seen INT NOT NULL DEFAULT 0,
        emo_x SMALLINT NOT NULL DEFAULT -1, emo_x_n INT NOT NULL DEFAULT 0,
        emo_o SMALLINT NOT NULL DEFAULT -1, emo_o_n INT NOT NULL DEFAULT 0,
        again_x SMALLINT NOT NULL DEFAULT 0, again_o SMALLINT NOT NULL DEFAULT 0,
        next_id INT NULL, created INT NOT NULL, updated INT NOT NULL)$tail");
    foreach ([
        'CREATE INDEX ttt_users_token ON ttt_users (token_hash)',
        'CREATE INDEX ttt_games_find ON ttt_games (status, kind)',
        'CREATE INDEX ttt_games_code ON ttt_games (code)',
    ] as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // index already there (another request created it first)
        }
    }
}

function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function isDuplicate(PDOException $e): bool
{
    return $e->getCode() === '23000' || stripos($e->getMessage(), 'UNIQUE') !== false;
}

/* ---------- players ---------- */

function newToken(int $uid): string
{
    $t = bin2hex(random_bytes(24));
    q('UPDATE ttt_users SET token_hash = ? WHERE id = ?', [hash('sha256', $t), $uid]);
    return $t;
}

function auth(array $in): array
{
    $t = (string)($in['token'] ?? '');
    if ($t === '') fail('login', 401);
    $u = q('SELECT * FROM ttt_users WHERE token_hash = ?', [hash('sha256', $t)])->fetch();
    if (!$u) fail('login', 401);
    if ((int)$u['seen'] < time() - 30) q('UPDATE ttt_users SET seen = ? WHERE id = ?', [time(), $u['id']]);
    return $u;
}

function player(array $u): array
{
    return [
        'color' => $u['color'], 'animal' => $u['animal'], 'num' => (int)$u['num'], 'guest' => (bool)$u['guest'],
        'wins' => (int)$u['wins'], 'losses' => (int)$u['losses'], 'draws' => (int)$u['draws'],
    ];
}

function userById($id): ?array
{
    if (!$id) return null;
    $u = q('SELECT * FROM ttt_users WHERE id = ?', [$id])->fetch();
    return $u ?: null;
}

function pickName(array $in): array
{
    $color = (string)($in['color'] ?? '');
    $animal = (string)($in['animal'] ?? '');
    if (!in_array($color, COLORS, true) || !in_array($animal, ANIMALS, true)) fail('bad');
    return [$color, $animal];
}

function checkPin($pin): string
{
    $pin = (string)$pin;
    if (!preg_match('/^\d{4}$/', $pin)) fail('bad');
    return $pin;
}

/** Runs $write($number) with free numbers until the UNIQUE(color, animal, num) index accepts one. */
function withFreeNumber(callable $write, bool $short): int
{
    for ($i = 0; $i < 60; $i++) {
        // registered players get easy numbers (1-99) while there are free ones
        $n = ($short && $i < 40) ? random_int(1, 99) : random_int(100, 9999);
        try {
            $write($n);
            return $n;
        } catch (PDOException $e) {
            if (!isDuplicate($e)) throw $e;
        }
    }
    fail('busy', 503);
    return 0;
}

/* ---------- games ---------- */

function loadGame(array $in, array $u): array
{
    $g = q('SELECT * FROM ttt_games WHERE id = ?', [(int)($in['game'] ?? 0)])->fetch();
    if (!$g || ((int)$g['x_id'] !== (int)$u['id'] && (int)$g['o_id'] !== (int)$u['id'])) fail('nogame', 404);
    return $g;
}

function mark(array $g, array $u): string
{
    return (int)$g['x_id'] === (int)$u['id'] ? 'X' : 'O';
}

function view(array $g, array $u): array
{
    $me = mark($g, $u);
    $op = $me === 'X' ? 'o' : 'x';
    $opp = userById($me === 'X' ? $g['o_id'] : $g['x_id']);
    return [
        'id' => (int)$g['id'], 'kind' => $g['kind'], 'code' => $g['code'], 'status' => $g['status'],
        'board' => $g['board'], 'turn' => $g['turn'], 'winner' => $g['winner'],
        'line' => $g['line'] ? array_map('intval', explode(',', $g['line'])) : null,
        'ver' => (int)$g['ver'], 'you' => $me,
        'opp' => $opp ? ['color' => $opp['color'], 'animal' => $opp['animal'], 'num' => (int)$opp['num']] : null,
        'emo' => ['i' => (int)$g["emo_$op"], 'n' => (int)$g["emo_{$op}_n"]],
        'again' => ['you' => (bool)$g['again_' . strtolower($me)], 'opp' => (bool)$g["again_$op"]],
        'next' => (int)$g['next_id'] > 0 ? (int)$g['next_id'] : null,
    ];
}

function newGame(string $kind, int $x, ?int $o, ?string $code): int
{
    $now = time();
    q('INSERT INTO ttt_games (kind, code, x_id, o_id, status, x_seen, o_seen, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$kind, $code, $x, $o, $o ? 'playing' : 'waiting', $now, $o ? $now : 0, $now, $now]);
    return (int)db()->lastInsertId();
}

/** A waiting game becomes a match when this player takes the O seat (only one joiner can win the race). */
function takeSeat(int $gid, int $uid): bool
{
    $now = time();
    return q("UPDATE ttt_games SET o_id = ?, status = 'playing', o_seen = ?, x_seen = ?, updated = ?, ver = ver + 1
              WHERE id = ? AND status = 'waiting' AND o_id IS NULL AND x_id <> ?",
        [$uid, $now, $now, $now, $gid, $uid])->rowCount() === 1;
}

function endWaiting(int $uid): void
{
    q("UPDATE ttt_games SET status = 'gone', updated = ? WHERE x_id = ? AND status = 'waiting'", [time(), $uid]);
}

function result(array $b): ?array
{
    foreach (LINES as $l) {
        if ($b[$l[0]] !== '.' && $b[$l[0]] === $b[$l[1]] && $b[$l[0]] === $b[$l[2]]) return [$b[$l[0]], implode(',', $l)];
    }
    return in_array('.', $b, true) ? null : ['D', null];
}

function cleanup(): void
{
    $now = time();
    q("DELETE FROM ttt_games WHERE status IN ('over', 'gone') AND updated < ?", [$now - 86400]);
    q("UPDATE ttt_games SET status = 'gone', updated = ? WHERE status = 'waiting' AND x_seen < ?", [$now, $now - 120]);
    q("UPDATE ttt_games SET status = 'gone', updated = ? WHERE status = 'playing' AND updated < ?", [$now, $now - 3600]);
    q('DELETE FROM ttt_users WHERE guest = 1 AND seen < ?', [$now - 90 * 86400]);
}

/* ---------- actions ---------- */

function handle(array $in): array
{
    $now = time();
    switch ($in['action'] ?? '') {
        case 'guest': {
            $color = COLORS[random_int(0, count(COLORS) - 1)];
            $animal = ANIMALS[random_int(0, count(ANIMALS) - 1)];
            withFreeNumber(function ($n) use ($color, $animal, $now) {
                q('INSERT INTO ttt_users (color, animal, num, guest, created, seen) VALUES (?, ?, ?, 1, ?, ?)',
                    [$color, $animal, $n, $now, $now]);
            }, false);
            $uid = (int)db()->lastInsertId();
            return ['token' => newToken($uid), 'me' => player(userById($uid))];
        }

        case 'signup': {
            [$color, $animal] = pickName($in);
            $hash = password_hash(checkPin($in['pin'] ?? ''), PASSWORD_DEFAULT);
            $guest = null;
            if (!empty($in['token'])) {
                $t = q('SELECT * FROM ttt_users WHERE token_hash = ?', [hash('sha256', (string)$in['token'])])->fetch();
                if ($t && $t['guest']) $guest = $t;
            }
            if ($guest) {
                // a guest who makes a player keeps their wins
                withFreeNumber(function ($n) use ($color, $animal, $hash, $guest) {
                    q('UPDATE ttt_users SET color = ?, animal = ?, num = ?, pin_hash = ?, guest = 0 WHERE id = ?',
                        [$color, $animal, $n, $hash, $guest['id']]);
                }, true);
                $uid = (int)$guest['id'];
            } else {
                withFreeNumber(function ($n) use ($color, $animal, $hash, $now) {
                    q('INSERT INTO ttt_users (color, animal, num, pin_hash, guest, created, seen) VALUES (?, ?, ?, ?, 0, ?, ?)',
                        [$color, $animal, $n, $hash, $now, $now]);
                }, true);
                $uid = (int)db()->lastInsertId();
            }
            return ['token' => newToken($uid), 'me' => player(userById($uid))];
        }

        case 'login': {
            [$color, $animal] = pickName($in);
            $pin = checkPin($in['pin'] ?? '');
            $u = q('SELECT * FROM ttt_users WHERE color = ? AND animal = ? AND num = ? AND guest = 0',
                [$color, $animal, (int)($in['num'] ?? 0)])->fetch();
            if (!$u) fail('wrong');
            if ((int)$u['locked_until'] > $now) fail('locked', 429, ['wait' => (int)$u['locked_until'] - $now]);
            if (!password_verify($pin, (string)$u['pin_hash'])) {
                $fails = (int)$u['fails'] + 1;
                if ($fails >= MAX_FAILS) {
                    q('UPDATE ttt_users SET fails = 0, locked_until = ? WHERE id = ?', [$now + LOCK_SECONDS, $u['id']]);
                    fail('locked', 429, ['wait' => LOCK_SECONDS]);
                }
                q('UPDATE ttt_users SET fails = ? WHERE id = ?', [$fails, $u['id']]);
                fail('wrong');
            }
            q('UPDATE ttt_users SET fails = 0, seen = ? WHERE id = ?', [$now, $u['id']]);
            return ['token' => newToken((int)$u['id']), 'me' => player(userById($u['id']))];
        }

        case 'me':
            return ['me' => player(auth($in))];

        case 'logout': {
            $u = auth($in);
            endWaiting((int)$u['id']);
            if ($u['guest']) q('DELETE FROM ttt_users WHERE id = ?', [$u['id']]);
            else q('UPDATE ttt_users SET token_hash = NULL WHERE id = ?', [$u['id']]);
            return [];
        }

        case 'delete': {
            $u = auth($in);
            q("UPDATE ttt_games SET status = 'gone', updated = ? WHERE (x_id = ? OR o_id = ?) AND status IN ('waiting', 'playing')",
                [$now, $u['id'], $u['id']]);
            q('DELETE FROM ttt_users WHERE id = ?', [$u['id']]);
            return [];
        }

        case 'friend': {
            $u = auth($in);
            endWaiting((int)$u['id']);
            for ($i = 0; $i < 30; $i++) {
                $code = (string)random_int(1000, 9999);
                $taken = q("SELECT 1 FROM ttt_games WHERE code = ? AND status = 'waiting'", [$code])->fetch();
                if (!$taken) {
                    $gid = newGame('friend', (int)$u['id'], null, $code);
                    return ['game' => view(q('SELECT * FROM ttt_games WHERE id = ?', [$gid])->fetch(), $u)];
                }
            }
            fail('busy', 503);
        }

        case 'join': {
            $u = auth($in);
            $code = (string)($in['code'] ?? '');
            if (!preg_match('/^\d{4}$/', $code)) fail('nocode');
            $g = q("SELECT * FROM ttt_games WHERE code = ? AND kind = 'friend' AND status = 'waiting' ORDER BY id DESC",
                [$code])->fetch();
            if (!$g) fail('nocode');
            if ((int)$g['x_id'] === (int)$u['id']) fail('own');
            if (!takeSeat((int)$g['id'], (int)$u['id'])) fail('nocode');
            endWaiting((int)$u['id']);
            return ['game' => view(q('SELECT * FROM ttt_games WHERE id = ?', [$g['id']])->fetch(), $u)];
        }

        case 'random': {
            $u = auth($in);
            $uid = (int)$u['id'];
            $mine = q("SELECT * FROM ttt_games WHERE x_id = ? AND kind = 'random' AND status = 'waiting'", [$uid])->fetch();
            if ($mine) return ['game' => view($mine, $u)];
            $open = q("SELECT id FROM ttt_games WHERE kind = 'random' AND status = 'waiting' AND x_id <> ? AND x_seen >= ?
                       ORDER BY id LIMIT 5", [$uid, $now - 8])->fetchAll();
            foreach ($open as $row) {
                if (takeSeat((int)$row['id'], $uid)) {
                    endWaiting($uid);
                    return ['game' => view(q('SELECT * FROM ttt_games WHERE id = ?', [$row['id']])->fetch(), $u)];
                }
            }
            endWaiting($uid);
            $gid = newGame('random', $uid, null, null);
            return ['game' => view(q('SELECT * FROM ttt_games WHERE id = ?', [$gid])->fetch(), $u)];
        }

        case 'poll': {
            $u = auth($in);
            $g = loadGame($in, $u);
            $me = strtolower(mark($g, $u));
            $op = $me === 'x' ? 'o' : 'x';
            q("UPDATE ttt_games SET {$me}_seen = ? WHERE id = ?", [$now, $g['id']]);
            if ($g['status'] === 'playing' && (int)$g["{$op}_seen"] < $now - AWAY) {
                q("UPDATE ttt_games SET status = 'gone', updated = ?, ver = ver + 1 WHERE id = ? AND status = 'playing'", [$now, $g['id']]);
            }
            return ['game' => view(q('SELECT * FROM ttt_games WHERE id = ?', [$g['id']])->fetch(), $u)];
        }

        case 'move': {
            $u = auth($in);
            $g = loadGame($in, $u);
            $me = mark($g, $u);
            $cell = (int)($in['cell'] ?? -1);
            $b = str_split($g['board']);
            if ($g['status'] !== 'playing' || $g['turn'] !== $me || $cell < 0 || $cell > 8 || $b[$cell] !== '.') {
                return ['game' => view($g, $u)];
            }
            $b[$cell] = $me;
            $r = result($b);
            $done = q('UPDATE ttt_games SET board = ?, turn = ?, status = ?, winner = ?, line = ?, ver = ver + 1, updated = ?, '
                . strtolower($me) . '_seen = ? WHERE id = ? AND ver = ?',
                [implode('', $b), $me === 'X' ? 'O' : 'X', $r ? 'over' : 'playing', $r ? $r[0] : null, $r ? $r[1] : null,
                 $now, $now, $g['id'], $g['ver']])->rowCount() === 1;
            if ($done && $r) {
                if ($r[0] === 'D') {
                    q('UPDATE ttt_users SET draws = draws + 1 WHERE id IN (?, ?)', [$g['x_id'], $g['o_id']]);
                } else {
                    $winner = $r[0] === 'X' ? $g['x_id'] : $g['o_id'];
                    $loser = $r[0] === 'X' ? $g['o_id'] : $g['x_id'];
                    q('UPDATE ttt_users SET wins = wins + 1 WHERE id = ?', [$winner]);
                    q('UPDATE ttt_users SET losses = losses + 1 WHERE id = ?', [$loser]);
                }
            }
            return ['game' => view(q('SELECT * FROM ttt_games WHERE id = ?', [$g['id']])->fetch(), $u)];
        }

        case 'emoji': {
            $u = auth($in);
            $g = loadGame($in, $u);
            $i = (int)($in['i'] ?? -1);
            if ($i < 0 || $i >= EMOJI_COUNT) fail('bad');
            $me = strtolower(mark($g, $u));
            q("UPDATE ttt_games SET emo_$me = ?, emo_{$me}_n = emo_{$me}_n + 1 WHERE id = ?", [$i, $g['id']]);
            return [];
        }

        case 'again': {
            $u = auth($in);
            $g = loadGame($in, $u);
            if ($g['status'] !== 'over') return ['game' => view($g, $u)];
            $me = strtolower(mark($g, $u));
            q("UPDATE ttt_games SET again_$me = 1, updated = ? WHERE id = ?", [$now, $g['id']]);
            $g = q('SELECT * FROM ttt_games WHERE id = ?', [$g['id']])->fetch();
            // both said yes: whoever claims next_id first starts the new game, with X and O swapped
            if ($g['again_x'] && $g['again_o']
                && q('UPDATE ttt_games SET next_id = -1 WHERE id = ? AND next_id IS NULL', [$g['id']])->rowCount() === 1) {
                $next = newGame($g['kind'], (int)$g['o_id'], (int)$g['x_id'], null);
                q('UPDATE ttt_games SET next_id = ? WHERE id = ?', [$next, $g['id']]);
                $g = q('SELECT * FROM ttt_games WHERE id = ?', [$g['id']])->fetch();
            }
            return ['game' => view($g, $u)];
        }

        case 'leave': {
            $u = auth($in);
            $g = loadGame($in, $u);
            if ($g['status'] !== 'gone') {
                q("UPDATE ttt_games SET status = 'gone', updated = ?, ver = ver + 1 WHERE id = ?", [$now, $g['id']]);
            }
            return [];
        }
    }
    fail('bad');
    return [];
}

try {
    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) fail('bad');
    $res = handle($in);
    if (random_int(1, 50) === 1) cleanup();
    out(['ok' => true] + $res);
} catch (Throwable $e) {
    error_log('tic-tac-toy: ' . $e->getMessage());
    fail('server', 500);
}
