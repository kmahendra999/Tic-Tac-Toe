// Run: node tests/boardgames.test.js
// Rules of Snakes & Ladders (web/snakes.js), Ludo (web/ludo.js) and Color Cards (web/cards.js),
// plus thousands of complete computer-only games with fixed random seeds.
'use strict';
const assert = require('assert');
const SNL = require('../web/snakes.js');
const LUDO = require('../web/ludo.js');
const CARDS = require('../web/cards.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok  ' + name); }

// Small seeded random generator so failures can be replayed.
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const die = (r) => 1 + Math.floor(r() * 6);

console.log('snakes & ladders');

test('board has no square that is both a ladder and a snake, and nothing on 1 or 100', () => {
  Object.keys(SNL.LADDERS).forEach((a) => {
    assert(!SNL.SNAKES[a], 'ladder foot is a snake head: ' + a);
    assert(SNL.LADDERS[a] > +a);
    assert(!SNL.SNAKES[SNL.LADDERS[a]], 'ladder top is a snake head: ' + a);
  });
  Object.keys(SNL.SNAKES).forEach((h) => {
    assert(SNL.SNAKES[h] < +h);
    assert(!SNL.LADDERS[SNL.SNAKES[h]], 'snake tail is a ladder foot: ' + h);
  });
  [1, 100].forEach((n) => assert(!SNL.LADDERS[n] && !SNL.SNAKES[n]));
});

test('squares zig-zag up from the bottom-left', () => {
  assert.deepStrictEqual(SNL.cell(1), { row: 9, col: 0 });
  assert.deepStrictEqual(SNL.cell(10), { row: 9, col: 9 });
  assert.deepStrictEqual(SNL.cell(11), { row: 8, col: 9 });
  assert.deepStrictEqual(SNL.cell(100), { row: 0, col: 0 });
  const seen = new Set();
  for (let n = 1; n <= 100; n++) seen.add(SNL.cell(n).row * 10 + SNL.cell(n).col);
  assert.strictEqual(seen.size, 100);
});

test('walks square by square, climbs ladders, slides down snakes', () => {
  assert.deepStrictEqual(SNL.move(0, 3), { to: 3, steps: [1, 2, 3], jump: null, stuck: false });
  assert.strictEqual(SNL.move(0, 4).to, 25);
  assert.strictEqual(SNL.move(0, 4).jump.kind, 'ladder');
  assert.strictEqual(SNL.move(95, 2).to, 78);
  assert.strictEqual(SNL.move(95, 2).jump.kind, 'snake');
});

test('needs an exact roll to reach 100', () => {
  assert.deepStrictEqual(SNL.move(98, 3), { to: 98, steps: [], jump: null, stuck: true });
  assert.strictEqual(SNL.move(98, 2).to, 100);
  assert.strictEqual(SNL.move(94, 6).to, 100);
});

test('1000 four-player games all finish with one winner on 100', () => {
  for (let g = 0; g < 1000; g++) {
    const r = rng(g + 1), pos = [0, 0, 0, 0];
    let turn = 0, rolls = 0, winner = -1;
    while (winner < 0) {
      assert(++rolls < 5000, 'game ' + g + ' never ends');
      const n = die(r), m = SNL.move(pos[turn], n);
      pos[turn] = m.to;
      assert(pos[turn] >= 0 && pos[turn] <= 100);
      if (pos[turn] === 100) winner = turn;
      else if (n !== 6) turn = (turn + 1) % 4;
    }
  }
});

console.log('ludo');

test('the track is 52 different squares, each next to the one before', () => {
  assert.strictEqual(LUDO.TRACK.length, 52);
  assert.strictEqual(new Set(LUDO.TRACK.map((rc) => rc.join(','))).size, 52);
  LUDO.TRACK.forEach((rc, i) => {
    const nx = LUDO.TRACK[(i + 1) % 52], d = Math.abs(rc[0] - nx[0]) + Math.abs(rc[1] - nx[1]);
    assert(d === 1 || (d === 2 && rc[0] !== nx[0] && rc[1] !== nx[1]), 'gap after square ' + i);
  });
});

test('each colour reaches its own home column from the square before its start', () => {
  LUDO.COLORS.forEach((c) => {
    const last = LUDO.TRACK[LUDO.abs(c, 50)], first = LUDO.HOME[c][0];
    assert.strictEqual(Math.abs(last[0] - first[0]) + Math.abs(last[1] - first[1]), 1, c);
    assert.strictEqual(LUDO.START[c] % 13, 0);
  });
});

test('a 6 is needed to leave the base; an exact roll to finish', () => {
  assert(!LUDO.canMove(-1, 5) && LUDO.canMove(-1, 6));
  assert(LUDO.canMove(50, 6) && !LUDO.canMove(52, 5) && LUDO.canMove(52, 4));
  const st = LUDO.newState(['red', 'yellow']);
  assert.deepStrictEqual(LUDO.legal(st, 'red', 3), []);
  assert.deepStrictEqual(LUDO.legal(st, 'red', 6), [0, 1, 2, 3]);
  assert.deepStrictEqual(LUDO.move(st, 'red', 0, 6), { from: -1, to: 0, captured: [], finished: false });
});

test('landing on an opponent sends it home, but not on a star or start square', () => {
  const st = LUDO.newState(['red', 'green']);
  st.tok.red[0] = 1;                          // red on track square 1
  st.tok.green[0] = 40;                       // green on (13 + 40) % 52 = 1
  const m = LUDO.move(st, 'red', 1, 6);       // red token 2 leaves base onto square 0: nothing there
  assert.deepStrictEqual(m.captured, []);
  st.tok.red[1] = 0;
  const hit = LUDO.move(st, 'red', 1, 1);     // red token 2 moves to square 1 where green sits
  assert.deepStrictEqual(hit.captured, [{ color: 'green', i: 0 }]);
  assert.strictEqual(st.tok.green[0], -1);
  st.tok.green[1] = 47;                       // green on (13 + 47) % 52 = 8, a star square
  st.tok.red[2] = 3;
  assert.deepStrictEqual(LUDO.move(st, 'red', 2, 5).captured, []);
  assert.strictEqual(st.tok.green[1], 47);
});

test('home column and finished tokens cannot be captured', () => {
  const st = LUDO.newState(['red', 'blue']);
  st.tok.blue[0] = 53;
  st.tok.red[0] = 30;
  assert.strictEqual(LUDO.abs('blue', 53), -1);
  assert.deepStrictEqual(LUDO.move(st, 'red', 0, 5).captured, []);
});

test('computer prefers a capture, then leaving base', () => {
  const st = LUDO.newState(['red', 'green']);
  st.tok.red[0] = 10;
  st.tok.green[0] = 0;                        // green on square 13 = red progress 13
  assert.strictEqual(LUDO.choose(st, 'red', 3), 0);
  const st2 = LUDO.newState(['red', 'green']);
  st2.tok.red[0] = 20;
  assert.notStrictEqual(LUDO.choose(st2, 'red', 6), 0);
});

test('token positions on the board are inside it and never shared by two base or home spots', () => {
  LUDO.COLORS.forEach((c) => {
    const spots = new Set();
    for (let i = 0; i < 4; i++) {
      [-1, LUDO.DONE].forEach((p) => {
        const w = LUDO.where(c, p, i);
        assert(w.r > 0 && w.r < 15 && w.c > 0 && w.c < 15);
        spots.add(p + ':' + w.r + ',' + w.c);
      });
    }
    assert.strictEqual(spots.size, 8, c);
  });
});

function playLudo(colors, seed, levels) {
  const r = rng(seed), st = LUDO.newState(colors);
  let turn = 0, rolls = 0, sixes = 0;
  for (;;) {
    assert(++rolls < 20000, 'ludo game ' + seed + ' never ends');
    const c = colors[turn], n = die(r);
    if (n === 6 && ++sixes === 3) { sixes = 0; turn = (turn + 1) % colors.length; continue; }
    const moves = LUDO.legal(st, c, n);
    let again = n === 6;
    if (moves.length) {
      const i = LUDO.choose(st, c, n, levels && levels[c], r);
      assert(moves.indexOf(i) >= 0, 'computer picked an illegal token');
      const m = LUDO.move(st, c, i, n);
      if (m.captured.length || m.finished) again = true;
      if (LUDO.won(st, c)) return { winner: c, rolls };
    }
    colors.forEach((k) => st.tok[k].forEach((p) => assert(p >= -1 && p <= LUDO.DONE)));
    if (!again) { sixes = 0; turn = (turn + 1) % colors.length; }
  }
}

test('600 computer games with 2, 3 and 4 players all finish', () => {
  const sets = [['red', 'yellow'], ['red', 'green', 'yellow'], ['red', 'green', 'yellow', 'blue']];
  const wins = {};
  for (let g = 0; g < 600; g++) {
    const res = playLudo(sets[g % 3], g + 7);
    wins[res.winner] = (wins[res.winner] || 0) + 1;
  }
  assert(Object.keys(wins).length >= 3, 'every colour should win sometimes');
});

test('Ludo levels: every level plays legal moves, Impossible beats Easy most of the time', () => {
  let strong = 0;
  for (let g = 0; g < 800; g++) {
    const levels = g % 2 ? { red: 5, yellow: 1 } : { red: 1, yellow: 5 };
    const res = playLudo(['red', 'yellow'], g + 1000, levels);
    if (levels[res.winner] === 5) strong++;
  }
  console.log('        Impossible beat Easy in ' + Math.round(strong / 8) + '% of 800 games');
  assert(strong > 800 * 0.6);
  for (let lv = 1; lv <= 5; lv++) playLudo(['red', 'green', 'yellow', 'blue'], lv, { red: lv, green: lv, yellow: lv, blue: lv });
});

console.log('color cards');

test('deck has 100 cards: 72 numbers, 24 action cards, 4 rainbows', () => {
  const d = CARDS.makeDeck();
  assert.strictEqual(d.length, 100);
  assert.strictEqual(d.filter((c) => typeof c.v === 'number').length, 72);
  assert.strictEqual(d.filter((c) => c.v === 'wild').length, 4);
  assert.strictEqual(new Set(d.map((c) => c.id)).size, 100);
});

test('deal: 7 cards each and a number card on the table', () => {
  for (let n = 2; n <= 4; n++) {
    const s = CARDS.newGame(n, rng(n));
    s.hands.forEach((h) => assert.strictEqual(h.length, 7));
    assert.strictEqual(typeof CARDS.top(s).v, 'number');
    assert.strictEqual(s.draw.length + s.discard.length + 7 * n, 100);
  }
});

function setup(n, hands, topCard, color) {
  const s = CARDS.newGame(n, rng(99));
  s.hands = hands;
  s.discard = [topCard];
  s.color = color || topCard.c;
  return s;
}

test('matching: same colour, same number or symbol, or a rainbow', () => {
  const s = setup(2, [[], []], { c: 'red', v: 5 });
  assert(CARDS.canPlay(s, { c: 'red', v: 9 }));
  assert(CARDS.canPlay(s, { c: 'blue', v: 5 }));
  assert(CARDS.canPlay(s, { c: 'wild', v: 'wild' }));
  assert(!CARDS.canPlay(s, { c: 'blue', v: 4 }));
  assert(!CARDS.canPlay(s, { c: 'green', v: 'skip' }));
});

test('skip, +2 and turn-back act on the right player', () => {
  let s = setup(3, [[{ c: 'red', v: 'skip' }, { c: 'red', v: 1 }], [{ c: 'red', v: 2 }], [{ c: 'red', v: 3 }]], { c: 'red', v: 5 });
  let ev = CARDS.play(s, 0, 0);
  assert.strictEqual(ev.victim, 1);
  assert.strictEqual(s.turn, 2);

  s = setup(3, [[{ c: 'red', v: 'plus2' }, { c: 'red', v: 1 }], [{ c: 'red', v: 2 }], [{ c: 'red', v: 3 }]], { c: 'red', v: 5 });
  ev = CARDS.play(s, 0, 0);
  assert.strictEqual(ev.victim, 1);
  assert.strictEqual(s.hands[1].length, 3);
  assert.strictEqual(s.turn, 2);

  s = setup(3, [[{ c: 'red', v: 'turn' }, { c: 'red', v: 1 }], [{ c: 'red', v: 2 }], [{ c: 'red', v: 3 }]], { c: 'red', v: 5 });
  ev = CARDS.play(s, 0, 0);
  assert(ev.reversed);
  assert.strictEqual(s.turn, 2);

  s = setup(2, [[{ c: 'red', v: 'turn' }, { c: 'red', v: 1 }], [{ c: 'red', v: 2 }]], { c: 'red', v: 5 });
  CARDS.play(s, 0, 0);
  assert.strictEqual(s.turn, 0, 'with two players turn-back works like skip');
});

test('a rainbow sets the chosen colour; an empty hand wins', () => {
  const s = setup(2, [[{ c: 'wild', v: 'wild' }, { c: 'blue', v: 1 }], [{ c: 'red', v: 2 }]], { c: 'red', v: 5 });
  CARDS.play(s, 0, 0, 'green');
  assert.strictEqual(s.color, 'green');
  s.color = 'blue';
  s.turn = 0;
  CARDS.play(s, 0, 0);
  assert.strictEqual(s.winner, 0);
});

test('the computer keeps rainbows for later and names its biggest colour', () => {
  const s = setup(2, [[{ c: 'wild', v: 'wild' }, { c: 'red', v: 3 }], [{ c: 'red', v: 2 }]], { c: 'red', v: 5 });
  assert.strictEqual(CARDS.choose(s, 0).i, 1);
  const s2 = setup(2, [[{ c: 'wild', v: 'wild' }, { c: 'blue', v: 3 }, { c: 'blue', v: 4 }, { c: 'green', v: 1 }], [{ c: 'red', v: 2 }]], { c: 'red', v: 5 });
  assert.deepStrictEqual(CARDS.choose(s2, 0), { i: 0, color: 'blue' });
});

test('drawing reshuffles the played cards when the pile is empty', () => {
  const s = CARDS.newGame(2, rng(5));
  s.discard = s.discard.concat(s.draw.splice(0, s.draw.length));
  const topCard = CARDS.top(s), c = CARDS.draw(s, 0);
  assert(c);
  assert.strictEqual(CARDS.top(s), topCard);
  assert.strictEqual(s.discard.length, 1);
});

test('2000 computer games with 2-4 players all finish and never lose or copy a card', () => {
  for (let g = 0; g < 2000; g++) {
    const n = 2 + (g % 3), s = CARDS.newGame(n, rng(g + 3));
    let moves = 0;
    while (s.winner < 0) {
      assert(++moves < 5000, 'card game ' + g + ' never ends');
      const p = s.turn, m = CARDS.choose(s, p);
      if (m) CARDS.play(s, p, m.i, m.color);
      else {
        const c = CARDS.draw(s, p);
        if (c && CARDS.canPlay(s, c)) {
          const i = s.hands[p].indexOf(c);
          CARDS.play(s, p, i, c.v === 'wild' ? CARDS.bestColor(s.hands[p].filter((h, k) => k !== i)) : null);
        } else CARDS.pass(s);
      }
      const all = s.draw.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0);
      assert.strictEqual(all, 100, 'card count changed in game ' + g);
    }
  }
  const ids = new Set();
  const s = CARDS.newGame(4, rng(1));
  [s.draw, s.discard].concat(s.hands).forEach((pile) => pile.forEach((c) => ids.add(c.id)));
  assert.strictEqual(ids.size, 100);
});

function playCards(levels, seed) {
  const r = rng(seed), s = CARDS.newGame(levels.length, r);
  let moves = 0;
  while (s.winner < 0) {
    assert(++moves < 5000, 'card game ' + seed + ' never ends');
    const p = s.turn, m = CARDS.choose(s, p, levels[p], r);
    if (m) {
      assert(CARDS.canPlay(s, s.hands[p][m.i]), 'level ' + levels[p] + ' played a card that does not match');
      if (s.hands[p][m.i].v === 'wild') assert(CARDS.COLORS.indexOf(m.color) >= 0);
      CARDS.play(s, p, m.i, m.color);
    } else {
      const c = CARDS.draw(s, p);
      if (c && CARDS.canPlay(s, c)) {
        const i = s.hands[p].indexOf(c);
        CARDS.play(s, p, i, c.v === 'wild' ? CARDS.bestColor(s.hands[p].filter((h, k) => k !== i)) : null);
      } else CARDS.pass(s);
    }
  }
  return s.winner;
}

test('Color Cards levels: every level plays matching cards, Impossible beats Easy more often', () => {
  let strong = 0;
  for (let g = 0; g < 3000; g++) {
    const levels = g % 2 ? [5, 1] : [1, 5];
    if (levels[playCards(levels, g + 50)] === 5) strong++;
  }
  console.log('        Impossible beat Easy in ' + Math.round(strong / 30) + '% of 3000 games');
  assert(strong > 3000 * 0.5);
  for (let lv = 1; lv <= 5; lv++) playCards([lv, lv, lv, lv], lv + 77);
});

console.log(`\nAll ${passed} tests passed.`);
