// Run: node tests/game.test.js
'use strict';
const assert = require('assert');
const T = require('../web/game.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function playGame(levelX, levelO, starter) {
  const b = Array(9).fill(null);
  let turn = starter || 'X';
  for (;;) {
    const lvl = turn === 'X' ? levelX : levelO;
    const m = lvl === 0 ? T.emptyCells(b)[Math.floor(Math.random() * T.emptyCells(b).length)] : T.aiMove(b, turn, lvl);
    assert.ok(m >= 0 && m < 9 && !b[m], 'move must be an empty cell, got ' + m);
    b[m] = turn;
    const r = T.checkWinner(b);
    if (r) return r.winner; // 'X' | 'O' | null
    turn = T.other(turn);
  }
}

function tally(levelX, levelO, games) {
  const res = { X: 0, O: 0, D: 0 };
  for (let i = 0; i < games; i++) {
    const w = playGame(levelX, levelO, i % 2 ? 'O' : 'X');
    res[w || 'D']++;
  }
  return res;
}

test('checkWinner detects all 8 lines', () => {
  T.LINES.forEach(line => {
    const b = Array(9).fill(null);
    line.forEach(i => { b[i] = 'O'; });
    const r = T.checkWinner(b);
    assert.strictEqual(r.winner, 'O');
    assert.deepStrictEqual(r.line, line);
  });
});

test('checkWinner: running game -> null, full board -> draw', () => {
  assert.strictEqual(T.checkWinner(Array(9).fill(null)), null);
  const draw = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
  assert.deepStrictEqual(T.checkWinner(draw), { winner: null, line: null });
});

test('every level takes an immediate win when it sees one (levels 2-5)', () => {
  const b = ['O', 'O', null, 'X', 'X', null, null, null, null]; // O to move wins at 2
  for (let lvl = 2; lvl <= 5; lvl++) {
    for (let k = 0; k < 50; k++) assert.strictEqual(T.aiMove(b, 'O', lvl), 2, 'level ' + lvl);
  }
});

test('Medium/Impossible always block an immediate threat', () => {
  const b = ['X', 'X', null, null, 'O', null, null, null, null]; // O must block at 2
  for (const lvl of [3, 5]) {
    for (let k = 0; k < 50; k++) assert.strictEqual(T.aiMove(b, 'O', lvl), 2, 'level ' + lvl);
  }
});

test('aiMove returns -1 on a full board', () => {
  assert.strictEqual(T.aiMove(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'], 'X', 5), -1);
});

test('Impossible never loses to a random player (2000 games)', () => {
  const r1 = tally(5, 0, 1000);
  const r2 = tally(0, 5, 1000);
  assert.strictEqual(r1.O, 0);
  assert.strictEqual(r2.X, 0);
});

test('Impossible never loses to Hard or Medium (1000 games)', () => {
  assert.strictEqual(tally(5, 4, 500).O, 0);
  assert.strictEqual(tally(3, 5, 500).X, 0);
});

test('Impossible vs Impossible is always a draw (200 games)', () => {
  const r = tally(5, 5, 200);
  assert.strictEqual(r.D, 200);
});

test('higher level = stronger: loss rate vs random drops with level', () => {
  const lossRate = lvl => { const r = tally(lvl, 0, 1500); return r.O / 1500; };
  const rates = [1, 2, 3, 4, 5].map(lossRate);
  console.log('      loss rate vs random by level 1..5: ' + rates.map(x => (x * 100).toFixed(1) + '%').join(', '));
  assert.ok(rates[0] > rates[2], 'Easy should lose more than Medium');
  assert.ok(rates[2] > rates[4] || rates[4] === 0, 'Medium should lose more than Impossible');
  assert.strictEqual(rates[4], 0);
});

test('Impossible move is fast enough on an empty board', () => {
  const t = Date.now();
  for (let i = 0; i < 20; i++) T.aiMove(Array(9).fill(null), 'X', 5);
  const per = (Date.now() - t) / 20;
  console.log('      ~' + per.toFixed(1) + ' ms per first move');
  assert.ok(per < 150);
});

console.log('\nAll ' + passed + ' tests passed.');
