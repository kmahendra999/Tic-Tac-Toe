/* Online server tests: starts server/api.php on PHP's built-in web server with a throw-away SQLite
   database and plays through accounts, friend codes, random matches, wins, rematches and leaving.
   Run: node tests/server.test.js   (needs PHP 7.4+ with pdo_sqlite; set PHP=path\to\php.exe if not on PATH) */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PHP = process.env.PHP || 'php';
const PORT = 8765;
const URL = `http://127.0.0.1:${PORT}/api.php`;
const DB = path.join(os.tmpdir(), `ttt-test-${process.pid}.sqlite`);

let failures = 0, passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

async function api(action, body = {}) {
  const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...body }) });
  const json = await res.json();
  json.status = res.status;
  return json;
}

async function play(game, moves) {
  // moves: [[token, cell], ...] alternating; returns the last game view
  let g;
  for (const [token, cell] of moves) g = (await api('move', { token, game, cell })).game;
  return g;
}

async function main() {
  // PHP on Windows needs its SQLite driver switched on explicitly when there is no php.ini
  const ext = path.join(path.dirname(PHP), 'ext');
  const args = fs.existsSync(ext) ? ['-d', `extension_dir=${ext}`, '-d', 'extension=pdo_sqlite'] : [];
  const server = spawn(PHP, [...args, '-S', `127.0.0.1:${PORT}`, '-t', path.join(__dirname, '..', 'server')],
    { env: { ...process.env, TTT_SQLITE: DB }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(URL); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }

    console.log('players');
    const g1 = await api('guest');
    check('guest gets a token and a fun name', g1.ok && g1.token && g1.me.guest && g1.me.num >= 100, g1);
    const up = await api('signup', { token: g1.token, color: 'blue', animal: 'tiger', pin: '1234' });
    check('guest becomes a player with an easy number', up.ok && !up.me.guest && up.me.num >= 1 && up.me.num <= 99, up);
    const old = await api('me', { token: g1.token });
    check('old guest token stops working after sign-up', old.status === 401, old);
    const A = up.token, aNum = up.me.num;

    const b = await api('signup', { color: 'pink', animal: 'bunny', pin: '4321' });
    check('new player sign-up', b.ok && b.me.color === 'pink' && b.me.animal === 'bunny', b);
    const B = b.token;
    check('bad PIN rejected at sign-up', (await api('signup', { color: 'pink', animal: 'bunny', pin: '12a4' })).error === 'bad');
    check('unknown animal rejected', (await api('signup', { color: 'pink', animal: 'dragon', pin: '1111' })).error === 'bad');

    const login = await api('login', { color: 'blue', animal: 'tiger', num: aNum, pin: '1234' });
    check('log in with animal + colour + number + PIN', login.ok && login.token, login);
    check('logging in again replaces the old token', (await api('me', { token: A })).status === 401);
    const A2 = login.token;
    check('wrong PIN says wrong', (await api('login', { color: 'blue', animal: 'tiger', num: aNum, pin: '0000' })).error === 'wrong');
    for (let i = 0; i < 3; i++) await api('login', { color: 'blue', animal: 'tiger', num: aNum, pin: '0000' });
    const locked = await api('login', { color: 'blue', animal: 'tiger', num: aNum, pin: '0000' });
    check('5 wrong PINs lock the player', locked.error === 'locked' && locked.wait > 0, locked);
    check('even the right PIN waits while locked',
      (await api('login', { color: 'blue', animal: 'tiger', num: aNum, pin: '1234' })).error === 'locked');
    check('existing session keeps working while locked', (await api('me', { token: A2 })).ok);

    console.log('friend code');
    const inv = await api('friend', { token: A2 });
    check('invite makes a 4-digit code', inv.ok && /^\d{4}$/.test(inv.game.code) && inv.game.status === 'waiting', inv);
    check('cannot join your own code', (await api('join', { token: A2, code: inv.game.code })).error === 'own');
    check('wrong code says nocode', (await api('join', { token: B, code: inv.game.code === '1000' ? '1001' : '1000' })).error === 'nocode');
    const j = await api('join', { token: B, code: inv.game.code });
    check('friend joins with the code as O', j.ok && j.game.status === 'playing' && j.game.you === 'O' && j.game.opp.animal === 'tiger', j);
    const gid = j.game.id;
    const pa = await api('poll', { token: A2, game: gid });
    check('inviter sees the friend arrive', pa.game.status === 'playing' && pa.game.you === 'X' && pa.game.opp.animal === 'bunny', pa);
    check('code cannot be used twice', (await api('join', { token: (await api('guest')).token, code: inv.game.code })).error === 'nocode');

    console.log('moves');
    let g = (await api('move', { token: B, game: gid, cell: 0 })).game;
    check('O cannot move on X turn', g.board === '.........', g);
    g = (await api('move', { token: A2, game: gid, cell: 4 })).game;
    check('X moves', g.board === '....X....' && g.turn === 'O', g);
    g = (await api('move', { token: B, game: gid, cell: 4 })).game;
    check('taken cell refused', g.board === '....X....', g);
    g = await play(gid, [[B, 0], [A2, 2], [B, 1], [A2, 6]]);
    check('X wins with a diagonal', g.status === 'over' && g.winner === 'X' && g.line.join() === '2,4,6', g);
    g = (await api('move', { token: B, game: gid, cell: 8 })).game;
    check('no moves after the game is over', g.board.charAt(8) === '.', g);
    const meA = (await api('me', { token: A2 })).me, meB = (await api('me', { token: B })).me;
    check('win and loss counted', meA.wins === 1 && meB.losses === 1, [meA, meB]);

    console.log('emoji + play again');
    await api('emoji', { token: B, game: gid, i: 3 });
    const e = (await api('poll', { token: A2, game: gid })).game.emo;
    check('emoji reaches the other player', e.i === 3 && e.n === 1, e);
    check('emoji outside the list refused', (await api('emoji', { token: B, game: gid, i: 9 })).error === 'bad');
    let r = (await api('again', { token: A2, game: gid })).game;
    check('one player asking does not start yet', r.again.you && !r.again.opp && r.next === null, r);
    r = (await api('again', { token: B, game: gid })).game;
    check('both asking starts a new game', r.next > 0, r);
    const n = (await api('poll', { token: B, game: r.next })).game;
    check('new game swaps X and O', n.you === 'X' && n.status === 'playing' && n.board === '.........', n);
    g = await play(n.id, [[B, 0], [A2, 1], [B, 2], [A2, 4], [B, 3], [A2, 5], [B, 7], [A2, 6], [B, 8]]);
    check('full board is a draw', g.status === 'over' && g.winner === 'D', g);
    check('draw counted for both', (await api('me', { token: A2 })).me.draws === 1 && (await api('me', { token: B })).me.draws === 1);

    console.log('random match + leaving');
    const r1 = await api('random', { token: A2 });
    check('first random player waits', r1.game.status === 'waiting' && r1.game.kind === 'random', r1);
    check('asking again keeps the same waiting game', (await api('random', { token: A2 })).game.id === r1.game.id);
    const r2 = await api('random', { token: B });
    check('second random player is matched', r2.game.id === r1.game.id && r2.game.status === 'playing', r2);
    await api('leave', { token: B, game: r1.game.id });
    check('leaving tells the other player', (await api('poll', { token: A2, game: r1.game.id })).game.status === 'gone');
    const other = await api('guest');
    check('players cannot peek at other games', (await api('poll', { token: other.token, game: r1.game.id })).error === 'nogame');

    console.log('logout + delete');
    const gst = await api('guest');
    await api('logout', { token: gst.token });
    check('guest logout removes the guest', (await api('me', { token: gst.token })).status === 401);
    await api('logout', { token: A2 });
    check('player logout ends the session', (await api('me', { token: A2 })).status === 401);
    const del = await api('delete', { token: B });
    check('delete my player', del.ok && (await api('me', { token: B })).status === 401, del);
    check('deleted player cannot log in',
      (await api('login', { color: 'pink', animal: 'bunny', num: b.me.num, pin: '4321' })).error === 'wrong');
    check('junk request refused', (await api('nothing')).error === 'bad');
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { fs.unlinkSync(DB); } catch (e) { /* already gone */ }
  }
  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
