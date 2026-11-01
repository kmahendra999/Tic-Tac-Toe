/* Tic Tac Toe core logic: board rules + computer player with 5 difficulty levels.
   Works in the browser (window.TTT) and in Node (module.exports) for tests. */
(function (root) {
  'use strict';

  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  var LEVELS = [
    { name: 'Easy', hi: 'आसान' },
    { name: 'Normal', hi: 'सामान्य' },
    { name: 'Medium', hi: 'मध्यम' },
    { name: 'Hard', hi: 'कठिन' },
    { name: 'Impossible', hi: 'असंभव' }
  ];

  function other(p) { return p === 'X' ? 'O' : 'X'; }

  function emptyCells(b) {
    var out = [];
    for (var i = 0; i < 9; i++) if (!b[i]) out.push(i);
    return out;
  }

  // Returns null while the game is running, {winner, line} on a win, {winner: null} on a draw.
  function checkWinner(b) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) {
        return { winner: b[l[0]], line: l };
      }
    }
    for (var j = 0; j < 9; j++) if (!b[j]) return null;
    return { winner: null, line: null };
  }

  function findWinningMove(b, p) {
    var cells = emptyCells(b);
    for (var i = 0; i < cells.length; i++) {
      b[cells[i]] = p;
      var r = checkWinner(b);
      b[cells[i]] = null;
      if (r && r.winner === p) return cells[i];
    }
    return -1;
  }

  // Score from `me`'s point of view; faster wins and slower losses score higher.
  function minimax(b, turn, me, depth, alpha, beta) {
    var r = checkWinner(b);
    if (r) {
      if (r.winner === me) return 10 - depth;
      if (r.winner) return depth - 10;
      return 0;
    }
    var cells = emptyCells(b);
    var best, i, v;
    if (turn === me) {
      best = -Infinity;
      for (i = 0; i < cells.length; i++) {
        b[cells[i]] = turn;
        v = minimax(b, other(turn), me, depth + 1, alpha, beta);
        b[cells[i]] = null;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
      }
    } else {
      best = Infinity;
      for (i = 0; i < cells.length; i++) {
        b[cells[i]] = turn;
        v = minimax(b, other(turn), me, depth + 1, alpha, beta);
        b[cells[i]] = null;
        if (v < best) best = v;
        if (best < beta) beta = best;
        if (beta <= alpha) break;
      }
    }
    return best;
  }

  // All moves with the best minimax score (so the perfect player still varies its games).
  function bestMoves(b, me) {
    var cells = emptyCells(b);
    var best = -Infinity, moves = [];
    for (var i = 0; i < cells.length; i++) {
      b[cells[i]] = me;
      var v = minimax(b, other(me), me, 1, -Infinity, Infinity);
      b[cells[i]] = null;
      if (v > best) { best = v; moves = [cells[i]]; }
      else if (v === best) moves.push(cells[i]);
    }
    return moves;
  }

  /* level 1 Easy       : random, rarely spots its own win
     level 2 Normal     : always takes a win, blocks half the time
     level 3 Medium     : wins, always blocks, likes the centre
     level 4 Hard       : perfect play with an occasional slip
     level 5 Impossible : perfect play, never loses */
  function aiMove(board, me, level, rnd) {
    rnd = rnd || Math.random;
    var b = board.slice();
    var cells = emptyCells(b);
    if (!cells.length) return -1;
    var opp = other(me);
    var pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    var w;

    function medium() {
      var win = findWinningMove(b, me);
      if (win >= 0) return win;
      var block = findWinningMove(b, opp);
      if (block >= 0) return block;
      if (!b[4] && rnd() < 0.7) return 4;
      return pick(cells);
    }

    switch (level) {
      case 1:
        if (rnd() < 0.3) { w = findWinningMove(b, me); if (w >= 0) return w; }
        return pick(cells);
      case 2:
        w = findWinningMove(b, me);
        if (w >= 0) return w;
        if (rnd() < 0.5) { w = findWinningMove(b, opp); if (w >= 0) return w; }
        return pick(cells);
      case 3:
        return medium();
      case 4:
        if (rnd() < 0.2) return medium();
        return pick(bestMoves(b, me));
      default:
        return pick(bestMoves(b, me));
    }
  }

  var api = {
    LINES: LINES,
    LEVELS: LEVELS,
    other: other,
    emptyCells: emptyCells,
    checkWinner: checkWinner,
    findWinningMove: findWinningMove,
    bestMoves: bestMoves,
    aiMove: aiMove
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TTT = api;
})(this);
