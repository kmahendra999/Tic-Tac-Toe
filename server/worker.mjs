// Tic-Tac-Toy online server: a Cloudflare Worker with a D1 database bound as DB (tables in schema.sql).
// Clients POST {"action": "...", "token": "...", ...} as text/plain (no CORS preflight) and poll about once a second.
// Players are guests or animal + colour + number + 4-digit PIN; friend codes, random matches, moves, emoji, rematch.

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'];
const ANIMALS = ['tiger', 'lion', 'panda', 'puppy', 'kitty', 'bunny', 'fox', 'frog', 'monkey', 'elephant', 'unicorn', 'penguin'];
const EMOJI_COUNT = 5;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const AWAY = 25;          // seconds without a poll before a player counts as gone
const MAX_FAILS = 5;      // wrong PINs in a row before the player is locked
const LOCK_SECONDS = 900;
const PIN_ROUNDS = 2000;  // PBKDF2 rounds; kept small to fit the Workers CPU limit (the lock is the real guard)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

class Fail {
  constructor(error, status, extra) {
    this.error = error;
    this.status = status || 400;
    this.extra = extra || {};
  }
}
function fail(error, status, extra) { throw new Fail(error, status, extra); }

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ ok: true, service: 'tic-tac-toy' });
    let input;
    try { input = await request.json(); } catch (e) { input = null; }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ ok: false, error: 'bad' }, 400);
    const db = wrap(env.DB);
    try {
      const res = await handle(db, input);
      if (randInt(1, 50) === 1 && ctx) ctx.waitUntil(cleanup(db).catch(() => {}));
      return json({ ok: true, ...res });
    } catch (e) {
      if (e instanceof Fail) return json({ ok: false, error: e.error, ...e.extra }, e.status);
      console.error('tic-tac-toy', e && e.stack ? e.stack : e);
      return json({ ok: false, error: 'server' }, 500);
    }
  }
};

/* ---------- helpers ---------- */

function wrap(D1) {
  return {
    one: (sql, ...a) => D1.prepare(sql).bind(...a).first(),
    all: async (sql, ...a) => (await D1.prepare(sql).bind(...a).all()).results,
    run: async (sql, ...a) => (await D1.prepare(sql).bind(...a).run()).meta
  };
}

function randInt(lo, hi) {
  const v = crypto.getRandomValues(new Uint32Array(1))[0];
  return lo + (v % (hi - lo + 1));
}

function hex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function unhex(s) { return new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16))); }

async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

async function pbkdf2(pin, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256);
  return hex(new Uint8Array(bits));
}

async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PIN_ROUNDS}$${hex(salt)}$${await pbkdf2(pin, salt, PIN_ROUNDS)}`;
}

async function pinMatches(pin, stored) {
  const [kind, rounds, salt, want] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !want) return false;
  const got = await pbkdf2(pin, unhex(salt), +rounds);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length && i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

const isDuplicate = (e) => /UNIQUE/i.test(String(e && e.message));
const now = () => Math.floor(Date.now() / 1000);

/* ---------- players ---------- */

async function newToken(db, uid) {
  const t = hex(crypto.getRandomValues(new Uint8Array(24)));
  await db.run('UPDATE ttt_users SET token_hash = ? WHERE id = ?', await sha256(t), uid);
  return t;
}

async function auth(db, input) {
  const t = String(input.token || '');
  if (!t) fail('login', 401);
  const u = await db.one('SELECT * FROM ttt_users WHERE token_hash = ?', await sha256(t));
  if (!u) fail('login', 401);
  if (u.seen < now() - 30) await db.run('UPDATE ttt_users SET seen = ? WHERE id = ?', now(), u.id);
  return u;
}

function player(u) {
  return {
    color: u.color, animal: u.animal, num: u.num, guest: !!u.guest,
    wins: u.wins, losses: u.losses, draws: u.draws
  };
}

const userById = (db, id) => (id ? db.one('SELECT * FROM ttt_users WHERE id = ?', id) : null);

function pickName(input) {
  const color = String(input.color || '');
  const animal = String(input.animal || '');
  if (!COLORS.includes(color) || !ANIMALS.includes(animal)) fail('bad');
  return [color, animal];
}

function checkPin(pin) {
  pin = String(pin == null ? '' : pin);
  if (!/^\d{4}$/.test(pin)) fail('bad');
  return pin;
}

/** Calls write(number) with free numbers until the UNIQUE(color, animal, num) index accepts one. */
async function withFreeNumber(write, short) {
  for (let i = 0; i < 60; i++) {
    // registered players get easy numbers (1-99) while there are free ones
    const n = short && i < 40 ? randInt(1, 99) : randInt(100, 9999);
    try {
      await write(n);
      return n;
    } catch (e) {
      if (!isDuplicate(e)) throw e;
    }
  }
  fail('busy', 503);
}

/* ---------- games ---------- */

const gameById = (db, id) => db.one('SELECT * FROM ttt_games WHERE id = ?', id);

async function loadGame(db, input, u) {
  const g = await gameById(db, Number(input.game) || 0);
  if (!g || (g.x_id !== u.id && g.o_id !== u.id)) fail('nogame', 404);
  return g;
}

const mark = (g, u) => (g.x_id === u.id ? 'X' : 'O');

async function view(db, g, u) {
  const me = mark(g, u);
  const op = me === 'X' ? 'o' : 'x';
  const opp = await userById(db, me === 'X' ? g.o_id : g.x_id);
  return {
    id: g.id, kind: g.kind, code: g.code, status: g.status,
    board: g.board, turn: g.turn, winner: g.winner,
    line: g.line ? g.line.split(',').map(Number) : null,
    ver: g.ver, you: me,
    opp: opp ? { color: opp.color, animal: opp.animal, num: opp.num } : null,
    emo: { i: g['emo_' + op], n: g['emo_' + op + '_n'] },
    again: { you: !!g['again_' + me.toLowerCase()], opp: !!g['again_' + op] },
    next: g.next_id > 0 ? g.next_id : null
  };
}

async function newGame(db, kind, x, o, code) {
  const t = now();
  const meta = await db.run(
    'INSERT INTO ttt_games (kind, code, x_id, o_id, status, x_seen, o_seen, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    kind, code, x, o, o ? 'playing' : 'waiting', t, o ? t : 0, t, t);
  return meta.last_row_id;
}

/** A waiting game becomes a match when this player takes the O seat (only one joiner can win the race). */
async function takeSeat(db, gid, uid) {
  const t = now();
  const meta = await db.run(
    "UPDATE ttt_games SET o_id = ?, status = 'playing', o_seen = ?, x_seen = ?, updated = ?, ver = ver + 1 " +
    "WHERE id = ? AND status = 'waiting' AND o_id IS NULL AND x_id <> ?", uid, t, t, t, gid, uid);
  return meta.changes === 1;
}

const endWaiting = (db, uid) =>
  db.run("UPDATE ttt_games SET status = 'gone', updated = ? WHERE x_id = ? AND status = 'waiting'", now(), uid);

function result(b) {
  for (const l of LINES) {
    if (b[l[0]] !== '.' && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return [b[l[0]], l.join(',')];
  }
  return b.includes('.') ? null : ['D', null];
}

async function cleanup(db) {
  const t = now();
  await db.run("DELETE FROM ttt_games WHERE status IN ('over', 'gone') AND updated < ?", t - 86400);
  await db.run("UPDATE ttt_games SET status = 'gone', updated = ? WHERE status = 'waiting' AND x_seen < ?", t, t - 120);
  await db.run("UPDATE ttt_games SET status = 'gone', updated = ? WHERE status = 'playing' AND updated < ?", t, t - 3600);
  await db.run('DELETE FROM ttt_users WHERE guest = 1 AND seen < ?', t - 90 * 86400);
}

/* ---------- actions ---------- */

async function handle(db, input) {
  const t = now();
  switch (input.action) {
    case 'guest': {
      const color = COLORS[randInt(0, COLORS.length - 1)];
      const animal = ANIMALS[randInt(0, ANIMALS.length - 1)];
      let uid = 0;
      await withFreeNumber(async (n) => {
        uid = (await db.run('INSERT INTO ttt_users (color, animal, num, guest, created, seen) VALUES (?, ?, ?, 1, ?, ?)',
          color, animal, n, t, t)).last_row_id;
      }, false);
      return { token: await newToken(db, uid), me: player(await userById(db, uid)) };
    }

    case 'signup': {
      const [color, animal] = pickName(input);
      const hash = await hashPin(checkPin(input.pin));
      let guest = null;
      if (input.token) {
        const g = await db.one('SELECT * FROM ttt_users WHERE token_hash = ?', await sha256(String(input.token)));
        if (g && g.guest) guest = g;
      }
      let uid;
      if (guest) {
        // a guest who makes a player keeps their wins
        await withFreeNumber((n) => db.run('UPDATE ttt_users SET color = ?, animal = ?, num = ?, pin_hash = ?, guest = 0 WHERE id = ?',
          color, animal, n, hash, guest.id), true);
        uid = guest.id;
      } else {
        await withFreeNumber(async (n) => {
          uid = (await db.run('INSERT INTO ttt_users (color, animal, num, pin_hash, guest, created, seen) VALUES (?, ?, ?, ?, 0, ?, ?)',
            color, animal, n, hash, t, t)).last_row_id;
        }, true);
      }
      return { token: await newToken(db, uid), me: player(await userById(db, uid)) };
    }

    case 'login': {
      const [color, animal] = pickName(input);
      const pin = checkPin(input.pin);
      const u = await db.one('SELECT * FROM ttt_users WHERE color = ? AND animal = ? AND num = ? AND guest = 0',
        color, animal, Number(input.num) || 0);
      if (!u) fail('wrong');
      if (u.locked_until > t) fail('locked', 429, { wait: u.locked_until - t });
      if (!(await pinMatches(pin, u.pin_hash))) {
        const fails = u.fails + 1;
        if (fails >= MAX_FAILS) {
          await db.run('UPDATE ttt_users SET fails = 0, locked_until = ? WHERE id = ?', t + LOCK_SECONDS, u.id);
          fail('locked', 429, { wait: LOCK_SECONDS });
        }
        await db.run('UPDATE ttt_users SET fails = ? WHERE id = ?', fails, u.id);
        fail('wrong');
      }
      await db.run('UPDATE ttt_users SET fails = 0, seen = ? WHERE id = ?', t, u.id);
      return { token: await newToken(db, u.id), me: player(await userById(db, u.id)) };
    }

    case 'me':
      return { me: player(await auth(db, input)) };

    case 'logout': {
      const u = await auth(db, input);
      await endWaiting(db, u.id);
      if (u.guest) await db.run('DELETE FROM ttt_users WHERE id = ?', u.id);
      else await db.run('UPDATE ttt_users SET token_hash = NULL WHERE id = ?', u.id);
      return {};
    }

    case 'delete': {
      const u = await auth(db, input);
      await db.run("UPDATE ttt_games SET status = 'gone', updated = ? WHERE (x_id = ? OR o_id = ?) AND status IN ('waiting', 'playing')",
        t, u.id, u.id);
      await db.run('DELETE FROM ttt_users WHERE id = ?', u.id);
      return {};
    }

    case 'friend': {
      const u = await auth(db, input);
      await endWaiting(db, u.id);
      for (let i = 0; i < 30; i++) {
        const code = String(randInt(1000, 9999));
        if (!(await db.one("SELECT 1 AS x FROM ttt_games WHERE code = ? AND status = 'waiting'", code))) {
          const gid = await newGame(db, 'friend', u.id, null, code);
          return { game: await view(db, await gameById(db, gid), u) };
        }
      }
      fail('busy', 503);
      break;
    }

    case 'join': {
      const u = await auth(db, input);
      const code = String(input.code || '');
      if (!/^\d{4}$/.test(code)) fail('nocode');
      const g = await db.one("SELECT * FROM ttt_games WHERE code = ? AND kind = 'friend' AND status = 'waiting' ORDER BY id DESC", code);
      if (!g) fail('nocode');
      if (g.x_id === u.id) fail('own');
      if (!(await takeSeat(db, g.id, u.id))) fail('nocode');
      await endWaiting(db, u.id);
      return { game: await view(db, await gameById(db, g.id), u) };
    }

    case 'random': {
      const u = await auth(db, input);
      const mine = await db.one("SELECT * FROM ttt_games WHERE x_id = ? AND kind = 'random' AND status = 'waiting'", u.id);
      if (mine) return { game: await view(db, mine, u) };
      const open = await db.all("SELECT id FROM ttt_games WHERE kind = 'random' AND status = 'waiting' AND x_id <> ? AND x_seen >= ? " +
        'ORDER BY id LIMIT 5', u.id, t - 8);
      for (const row of open) {
        if (await takeSeat(db, row.id, u.id)) {
          await endWaiting(db, u.id);
          return { game: await view(db, await gameById(db, row.id), u) };
        }
      }
      await endWaiting(db, u.id);
      const gid = await newGame(db, 'random', u.id, null, null);
      return { game: await view(db, await gameById(db, gid), u) };
    }

    case 'poll': {
      const u = await auth(db, input);
      const g = await loadGame(db, input, u);
      const me = mark(g, u).toLowerCase();
      const op = me === 'x' ? 'o' : 'x';
      await db.run(`UPDATE ttt_games SET ${me}_seen = ? WHERE id = ?`, t, g.id);
      if (g.status === 'playing' && g[op + '_seen'] < t - AWAY) {
        await db.run("UPDATE ttt_games SET status = 'gone', updated = ?, ver = ver + 1 WHERE id = ? AND status = 'playing'", t, g.id);
      }
      return { game: await view(db, await gameById(db, g.id), u) };
    }

    case 'move': {
      const u = await auth(db, input);
      const g = await loadGame(db, input, u);
      const me = mark(g, u);
      const cell = Number.isInteger(input.cell) ? input.cell : -1;
      const b = g.board.split('');
      if (g.status !== 'playing' || g.turn !== me || cell < 0 || cell > 8 || b[cell] !== '.') {
        return { game: await view(db, g, u) };
      }
      b[cell] = me;
      const r = result(b);
      const meta = await db.run(
        `UPDATE ttt_games SET board = ?, turn = ?, status = ?, winner = ?, line = ?, ver = ver + 1, updated = ?, ${me.toLowerCase()}_seen = ? ` +
        'WHERE id = ? AND ver = ?',
        b.join(''), me === 'X' ? 'O' : 'X', r ? 'over' : 'playing', r ? r[0] : null, r ? r[1] : null, t, t, g.id, g.ver);
      if (meta.changes === 1 && r) {
        if (r[0] === 'D') {
          await db.run('UPDATE ttt_users SET draws = draws + 1 WHERE id IN (?, ?)', g.x_id, g.o_id);
        } else {
          await db.run('UPDATE ttt_users SET wins = wins + 1 WHERE id = ?', r[0] === 'X' ? g.x_id : g.o_id);
          await db.run('UPDATE ttt_users SET losses = losses + 1 WHERE id = ?', r[0] === 'X' ? g.o_id : g.x_id);
        }
      }
      return { game: await view(db, await gameById(db, g.id), u) };
    }

    case 'emoji': {
      const u = await auth(db, input);
      const g = await loadGame(db, input, u);
      const i = Number.isInteger(input.i) ? input.i : -1;
      if (i < 0 || i >= EMOJI_COUNT) fail('bad');
      const me = mark(g, u).toLowerCase();
      await db.run(`UPDATE ttt_games SET emo_${me} = ?, emo_${me}_n = emo_${me}_n + 1 WHERE id = ?`, i, g.id);
      return {};
    }

    case 'again': {
      const u = await auth(db, input);
      let g = await loadGame(db, input, u);
      if (g.status !== 'over') return { game: await view(db, g, u) };
      const me = mark(g, u).toLowerCase();
      await db.run(`UPDATE ttt_games SET again_${me} = 1, updated = ? WHERE id = ?`, t, g.id);
      g = await gameById(db, g.id);
      // both said yes: whoever claims next_id first starts the new game, with X and O swapped
      if (g.again_x && g.again_o &&
          (await db.run('UPDATE ttt_games SET next_id = -1 WHERE id = ? AND next_id IS NULL', g.id)).changes === 1) {
        const next = await newGame(db, g.kind, g.o_id, g.x_id, null);
        await db.run('UPDATE ttt_games SET next_id = ? WHERE id = ?', next, g.id);
        g = await gameById(db, g.id);
      }
      return { game: await view(db, g, u) };
    }

    case 'leave': {
      const u = await auth(db, input);
      const g = await loadGame(db, input, u);
      if (g.status !== 'gone') {
        await db.run("UPDATE ttt_games SET status = 'gone', updated = ?, ver = ver + 1 WHERE id = ?", t, g.id);
      }
      return {};
    }
  }
  fail('bad');
}
