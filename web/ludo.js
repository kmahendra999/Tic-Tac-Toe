/* Ludo: 2-4 players race four tokens each around the board and into the centre.
   Roll a 6 to bring a token out; landing on an opponent sends it back (not on star or start squares);
   a 6, a capture or a token reaching home earns another roll; three 6s in a row lose the turn.
   The rules are plain functions (tested by tests/ludo.test.js); the screen is built when window.GameKit exists. */
(function (root) {
  'use strict';

  var COLORS = ['red', 'green', 'yellow', 'blue'];
  var START = { red: 0, green: 13, yellow: 26, blue: 39 };    // where each colour enters the common track
  var SAFE = [0, 8, 13, 21, 26, 34, 39, 47];                   // start and star squares: no captures there
  var DONE = 56;   // token progress: -1 at home base, 0..50 on the track, 51..55 own home column, 56 finished

  // The 52 track squares on the 15x15 board as [row, col], clockwise from red's start square.
  var TRACK = [];
  function seg(r, c, dr, dc, n) { for (var i = 0; i < n; i++) TRACK.push([r + dr * i, c + dc * i]); }
  seg(6, 1, 0, 1, 5); seg(5, 6, -1, 0, 6); seg(0, 7, 0, 1, 2); seg(1, 8, 1, 0, 5);
  seg(6, 9, 0, 1, 6); seg(7, 14, 1, 0, 2); seg(8, 13, 0, -1, 5); seg(9, 8, 1, 0, 6);
  seg(14, 7, 0, -1, 2); seg(13, 6, -1, 0, 5); seg(8, 5, 0, -1, 6); seg(7, 0, -1, 0, 2);

  function line(r, c, dr, dc) { var a = []; for (var i = 0; i < 5; i++) a.push([r + dr * i, c + dc * i]); return a; }
  var HOME = { red: line(7, 1, 0, 1), green: line(1, 7, 1, 0), yellow: line(7, 13, 0, -1), blue: line(13, 7, -1, 0) };
  var BASE = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };   // top-left corner of each 6x6 base

  function newState(colors) {
    var tok = {};
    colors.forEach(function (c) { tok[c] = [-1, -1, -1, -1]; });
    return { colors: colors.slice(), tok: tok };
  }

  // Track index (0..51) of a token, or -1 when it is in its base, home column or finished.
  function abs(color, p) { return p >= 0 && p <= 50 ? (START[color] + p) % 52 : -1; }

  function canMove(p, roll) { return p === -1 ? roll === 6 : p + roll <= DONE; }

  function legal(st, color, roll) {
    var out = [];
    st.tok[color].forEach(function (p, i) { if (p !== DONE && canMove(p, roll)) out.push(i); });
    return out;
  }

  // Opponent tokens that would be sent home if color landed on track square a.
  function victims(st, color, a) {
    var out = [];
    if (a < 0 || SAFE.indexOf(a) >= 0) return out;
    st.colors.forEach(function (c) {
      if (c === color) return;
      st.tok[c].forEach(function (q, j) { if (abs(c, q) === a) out.push({ color: c, i: j }); });
    });
    return out;
  }

  function move(st, color, i, roll) {
    var from = st.tok[color][i], to = from === -1 ? 0 : from + roll;
    var captured = victims(st, color, abs(color, to));
    st.tok[color][i] = to;
    captured.forEach(function (v) { st.tok[v.color][v.i] = -1; });
    return { from: from, to: to, captured: captured, finished: to === DONE };
  }

  function won(st, color) { return st.tok[color].every(function (p) { return p === DONE; }); }

  // An opponent token sits 1-6 squares behind track square a (and could still reach it).
  function threatened(st, color, a) {
    if (a < 0 || SAFE.indexOf(a) >= 0) return false;
    return st.colors.some(function (c) {
      if (c === color) return false;
      return st.tok[c].some(function (q) {
        var b = abs(c, q);
        if (b < 0) return false;
        var d = (a - b + 52) % 52;
        return d >= 1 && d <= 6 && q + d <= 50;
      });
    });
  }

  // An opponent token sits 1-6 squares ahead of track square a: color could capture it next turn.
  function chasing(st, color, a) {
    if (a < 0) return false;
    return st.colors.some(function (c) {
      if (c === color) return false;
      return st.tok[c].some(function (q) {
        var b = abs(c, q), d = (b - a + 52) % 52;
        return b >= 0 && SAFE.indexOf(b) < 0 && d >= 1 && d <= 6;
      });
    });
  }

  // How often the computer just moves any token, per level 1 (Easy) .. 5 (Impossible).
  var RANDOM = [1, 0.6, 0.3, 0.1, 0];

  // The computer's choice among the legal tokens (-1 if none): finish, capture, get out of base, reach safety,
  // run ahead. level 1-5 (see RANDOM); without a level it always takes the best move. rnd: random function.
  function choose(st, color, roll, level, rnd) {
    var moves = legal(st, color, roll);
    if (!moves.length) return -1;
    rnd = rnd || Math.random;
    if (level && rnd() < RANDOM[level - 1]) return moves[Math.floor(rnd() * moves.length)];
    var careful = level === 5 ? 1.6 : 1, best = -1, bestScore = -1e9;
    moves.forEach(function (i) {
      var p = st.tok[color][i], to = p === -1 ? 0 : p + roll, a = abs(color, to), s = to / 10;
      if (to === DONE) s += 100;
      if (p === -1) s += 60;
      s += victims(st, color, a).length * 80;
      if (a >= 0 && SAFE.indexOf(a) >= 0) s += 25;
      if (to > 50 && p <= 50) s += 30;
      if (threatened(st, color, a)) s -= 40 * careful;
      if (p >= 0 && threatened(st, color, abs(color, p))) s += 20 * careful;
      if (level === 5 && chasing(st, color, a)) s += 15;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  // Board position (row, col of the centre, in cells) of token i of color with progress p.
  function where(color, p, i) {
    if (p === -1) { var b = BASE[color]; return { r: b[0] + (i < 2 ? 2 : 4), c: b[1] + (i % 2 ? 4 : 2) }; }
    if (p === DONE) {
      var f = { red: [7.5, 6.55], green: [6.55, 7.5], yellow: [7.5, 8.45], blue: [8.45, 7.5] }[color];
      var j = [-0.25, 0.25][i % 2], k = [-0.25, 0.25][i >> 1];
      return color === 'red' || color === 'yellow' ? { r: f[0] + j, c: f[1] + k * 0.4 } : { r: f[0] + k * 0.4, c: f[1] + j };
    }
    var rc = p <= 50 ? TRACK[abs(color, p)] : HOME[color][p - 51];
    return { r: rc[0] + 0.5, c: rc[1] + 0.5 };
  }

  var LUDO = { COLORS: COLORS, START: START, SAFE: SAFE, DONE: DONE, TRACK: TRACK, HOME: HOME,
    newState: newState, abs: abs, canMove: canMove, legal: legal, move: move, won: won, choose: choose, where: where };
  if (typeof module !== 'undefined' && module.exports) module.exports = LUDO;
  root.LUDO = LUDO;
  if (typeof document === 'undefined' || !root.GameKit) return;

  /* ---------------- screen ---------------- */
  var K = root.GameKit;
  var HEX = { red: '#ff5a5a', green: '#3ccf6e', yellow: '#ffd23f', blue: '#2e86ff' };
  var SEATS = COLORS.map(function (c) { return { name: c.charAt(0).toUpperCase() + c.slice(1), color: HEX[c] }; });

  var css = document.createElement('style');
  css.textContent =
    '.ludo{position:relative;width:var(--bs);height:var(--bs);display:grid;grid-template-columns:repeat(15,1fr);' +
    'grid-template-rows:repeat(15,1fr);background:#0b1019;border-radius:calc(var(--bs)*.03);overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.6)}' +
    '.ludo .c{border:1px solid rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:calc(var(--bs)*.04);color:rgba(0,0,0,.45)}' +
    '.ludo .t{background:#dfe5ee}.ludo .t.star{color:#7a8597}' +
    '.ludo .yard{position:absolute;border-radius:calc(var(--bs)*.02);display:flex;align-items:center;justify-content:center}' +
    '.ludo .yard i{position:absolute;inset:16%;background:#0b1019;border-radius:calc(var(--bs)*.03)}' +
    '.ludo .yard.off{opacity:.35}' +
    '.ludo .mid{position:absolute;left:40%;top:40%;width:20%;height:20%;' +
    'background:conic-gradient(from -45deg,#3ccf6e 0 25%,#ffd23f 0 50%,#2e86ff 0 75%,#ff5a5a 0)}' +
    '.lt{position:absolute;width:5.2%;height:5.2%;border-radius:50%;border:2px solid #fff;transform:translate(-50%,-50%);' +
    'box-shadow:0 3px 7px rgba(0,0,0,.6),inset 0 -3px 0 rgba(0,0,0,.25);transition:left .15s ease-out,top .15s ease-out;z-index:2}' +
    '.lt.small{width:3.8%;height:3.8%}' +
    '.lt.pick{z-index:4;cursor:pointer;animation:pick .7s ease-in-out infinite}' +
    '@keyframes pick{50%{box-shadow:0 0 0 4px #fff,0 0 18px #fff}}';
  document.head.appendChild(css);

  var sec = document.createElement('section');
  sec.id = 'ludo';
  sec.className = 'screen';
  sec.innerHTML =
    '<div class="game-wrap">' +
    '<header class="topbar"><button class="icon-btn" data-act="back">‹ Games</button>' +
    '<div class="gtitle">Ludo · लूडो</div><button class="icon-btn" data-act="sound">🔊</button></header>' +
    '<div class="menu-wrap" data-part="setup"><div class="card" data-part="players"></div><div class="card" data-part="level"></div>' +
    '<button class="primary" data-act="start">START · शुरू करें</button></div>' +
    '<div class="layout hidden" data-part="play">' +
    '<div class="board-area"><div class="status" data-part="status"><span class="dot"></span><span data-part="stext"></span></div>' +
    '<div class="ludo" data-part="board"></div></div>' +
    '<aside class="side"><div class="chips" data-part="chips"></div>' +
    '<button class="die-btn" data-act="roll">' + K.dieHtml() + '<span>ROLL · पासा फेंको</span></button>' +
    '<div class="actions"><button class="btn accent" data-act="restart">↻ New Game</button>' +
    '<button class="btn" data-act="setup">👥 Players</button></div></aside></div></div>';
  document.body.insertBefore(sec, document.querySelector('.toast'));

  function part(n) { return sec.querySelector('[data-part="' + n + '"]'); }
  var dieBtn = sec.querySelector('[data-act="roll"]');
  var die = dieBtn.querySelector('.die');
  var board = part('board');
  var getPlayers = K.players(part('players'), {
    key: 'ludo.players', min: 2, max: 4, def: 2, seats: SEATS, order: { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }
  });
  var getLevel = K.level(part('level'), 'ludo.level', 2);

  var G = { players: [], turn: 0, st: null, busy: false, over: true, pickRoll: 0, sixes: 0, token: 0 };
  var els = {};   // color -> [token elements]

  /* board drawing */
  function drawBoard(active) {
    var kind = {};
    TRACK.forEach(function (rc, a) { kind[rc[0] + ',' + rc[1]] = { t: 't', a: a }; });
    COLORS.forEach(function (c) { HOME[c].forEach(function (rc) { kind[rc[0] + ',' + rc[1]] = { t: 'h', c: c }; }); });
    var html = '';
    for (var r = 0; r < 15; r++) {
      for (var c = 0; c < 15; c++) {
        var k = kind[r + ',' + c];
        if (!k) { html += '<div></div>'; continue; }
        if (k.t === 'h') { html += '<div class="c" style="background:' + HEX[k.c] + '"></div>'; continue; }
        var startOf = COLORS.filter(function (col) { return START[col] === k.a; })[0];
        if (startOf) html += '<div class="c" style="background:' + HEX[startOf] + '">★</div>';
        else html += '<div class="c t' + (SAFE.indexOf(k.a) >= 0 ? ' star">★' : '">') + '</div>';
      }
    }
    COLORS.forEach(function (c) {
      var b = BASE[c];
      html += '<div class="yard' + (active.indexOf(c) < 0 ? ' off' : '') + '" style="left:' + (b[1] / 15 * 100) + '%;top:' + (b[0] / 15 * 100) +
        '%;width:40%;height:40%;background:' + HEX[c] + '"><i></i></div>';
    });
    board.innerHTML = html + '<div class="mid"></div>';
  }

  function placeAll() {
    var spots = {};
    G.st.colors.forEach(function (c) {
      G.st.tok[c].forEach(function (p, i) {
        var w = where(c, p, i), key = p >= 0 && p < DONE ? w.r + ',' + w.c : c + p + i;
        (spots[key] = spots[key] || []).push({ el: els[c][i], w: w });
      });
    });
    Object.keys(spots).forEach(function (key) {
      var list = spots[key], n = list.length;
      list.forEach(function (s, j) {
        var dx = n > 1 ? (j % 2 ? 0.2 : -0.2) : 0, dy = n > 2 ? (j < 2 ? -0.2 : 0.2) : 0;
        s.el.classList.toggle('small', n > 1);
        s.el.style.left = ((s.w.c + dx) / 15 * 100) + '%';
        s.el.style.top = ((s.w.r + dy) / 15 * 100) + '%';
      });
    });
  }

  function cur() { return G.players[G.turn]; }

  function render() {
    var p = cur();
    part('chips').innerHTML = G.players.map(function (q, i) {
      var home = G.st.tok[q.color].filter(function (v) { return v === DONE; }).length;
      return '<div class="chip' + (i === G.turn && !G.over ? ' turn' : '') + '" style="--c:' + HEX[q.color] + '">' +
        '<span class="dot" style="background:' + HEX[q.color] + '"></span><span class="nm">' + (q.cpu ? '🤖 ' : '') + q.name + '</span>' +
        '<span class="val">🏠' + home + '</span></div>';
    }).join('');
    var st = part('status');
    st.style.borderColor = HEX[p.color];
    st.querySelector('.dot').style.cssText = 'display:block;background:' + HEX[p.color];
    part('stext').textContent = G.over ? 'Game over · खेल ख़त्म' : G.pickRoll ? p.name + ': tap a token · गोटी चुनें' :
      p.cpu ? p.name + ' is playing…' : p.name + ': tap ROLL · पासा फेंको';
    var ready = !G.over && !G.busy && !p.cpu && !G.pickRoll;
    dieBtn.disabled = !ready;
    dieBtn.classList.toggle('ready', ready);
  }

  function start() {
    G.token++;
    K.closeWinner();
    G.players = getPlayers().map(function (q) { return { color: COLORS[q.seat], name: q.name, cpu: q.cpu }; });
    G.st = newState(G.players.map(function (q) { return q.color; }));
    G.level = getLevel();
    G.turn = 0; G.over = false; G.busy = false; G.pickRoll = 0; G.sixes = 0;
    drawBoard(G.st.colors);
    els = {};
    G.st.colors.forEach(function (c) {
      els[c] = [0, 1, 2, 3].map(function (i) {
        var el = document.createElement('div');
        el.className = 'lt';
        el.style.background = HEX[c];
        el.setAttribute('data-c', c);
        el.setAttribute('data-i', i);
        board.appendChild(el);
        return el;
      });
    });
    placeAll();
    part('setup').classList.add('hidden');
    part('play').classList.remove('hidden');
    K.setDie(die, 1);
    nextTurn();
  }

  function nextTurn() {
    render();
    var t = G.token;
    if (cur().cpu) setTimeout(function () { if (t === G.token && !G.over) roll(); }, K.wait(800));
  }

  function roll() {
    if (G.busy || G.over || G.pickRoll) return;
    G.busy = true;
    render();
    var t = G.token, n = K.roll();
    K.spinDie(die, n, function () { if (t === G.token) afterRoll(n); });
  }

  function afterRoll(n) {
    var p = cur(), t = G.token;
    if (n === 6 && ++G.sixes === 3) {
      K.toast('Three sixes! Turn over · बारी ख़त्म');
      return setTimeout(function () { if (t === G.token) pass(); }, K.wait(1000));
    }
    var moves = legal(G.st, p.color, n);
    if (!moves.length) {
      K.toast(n === 6 ? 'No move · roll again' : 'No move · चाल नहीं');
      return setTimeout(function () { if (t === G.token) { if (n === 6) again(); else pass(); } }, K.wait(900));
    }
    if (p.cpu) return setTimeout(function () { if (t === G.token) go(choose(G.st, p.color, n, G.level), n); }, K.wait(500));
    if (moves.length === 1) return setTimeout(function () { if (t === G.token) go(moves[0], n); }, K.wait(350));
    G.pickRoll = n;
    G.busy = false;
    moves.forEach(function (i) { els[p.color][i].classList.add('pick'); });
    render();
  }

  board.addEventListener('click', function (e) {
    var el = e.target.closest('.lt.pick');
    if (!el || !G.pickRoll) return;
    var n = G.pickRoll;
    G.pickRoll = 0;
    K.vibe(10);
    go(+el.getAttribute('data-i'), n);
  });

  function go(i, n) {
    var p = cur(), t = G.token, from = G.st.tok[p.color][i];
    G.busy = true;
    Array.prototype.forEach.call(board.querySelectorAll('.lt.pick'), function (el) { el.classList.remove('pick'); });
    render();
    var steps = from === -1 ? [0] : [];
    for (var s = from + 1; from !== -1 && s <= from + n; s++) steps.push(s);
    var k = 0;
    (function step() {
      if (t !== G.token) return;
      if (k < steps.length - 1) {
        G.st.tok[p.color][i] = steps[k++];
        placeAll();
        K.tone(600 + k * 40, 0.05, 'triangle', 0, 0.08);
        return setTimeout(step, K.wait(170));
      }
      G.st.tok[p.color][i] = from;   // apply the last step through the rules (captures)
      var m = move(G.st, p.color, i, n);
      placeAll();
      if (m.captured.length) { K.toast('Captured! Back home · पकड़ लिया'); K.sfx.lose(); K.vibe([60, 40, 60]); }
      else if (m.finished) { K.toast('Home! 🏠'); [523, 659, 784].forEach(function (f, j) { K.tone(f, 0.12, 'triangle', j * 0.08); }); }
      else K.tone(700, 0.06, 'triangle', 0, 0.1);
      setTimeout(function () { if (t === G.token) after(m, n); }, K.wait(m.captured.length || m.finished ? 700 : 250));
    })();
  }

  function after(m, n) {
    var p = cur();
    if (won(G.st, p.color)) {
      G.over = true; G.busy = false;
      render();
      K.sfx.win(); K.vibe([40, 50, 80]);
      K.winner('🏆', p.name.toUpperCase() + ' WINS!', p.cpu ? 'कंप्यूटर जीत गया · फिर कोशिश करें' : 'जीत गए 🎉', HEX[p.color], [
        { text: 'PLAY AGAIN · फिर खेलें', cls: 'primary', fn: start },
        { text: '‹ Games', fn: function () { K.home(); } }
      ]);
      return;
    }
    if (n === 6 || m.captured.length || m.finished) { K.toast('Roll again · फिर से'); again(); }
    else pass();
  }

  function again() { G.busy = false; nextTurn(); }
  function pass() { G.busy = false; G.sixes = 0; G.turn = (G.turn + 1) % G.players.length; nextTurn(); }

  function stop() { G.token++; G.over = true; G.busy = false; G.pickRoll = 0; K.closeWinner(); }
  function showSetup() { stop(); part('play').classList.add('hidden'); part('setup').classList.remove('hidden'); }
  function back() {
    if (!part('play').classList.contains('hidden')) showSetup();
    else { stop(); K.home(); }
  }

  sec.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'roll') { K.vibe(10); roll(); return; }
    K.sfx.click();
    if (a === 'back') back();
    else if (a === 'sound') b.textContent = K.toggleSound() ? '🔊' : '🔇';
    else if (a === 'start' || a === 'restart') start();
    else if (a === 'setup') showSetup();
  });

  K.register('ludo', {
    open: function () {
      sec.querySelector('[data-act="sound"]').textContent = K.sound() ? '🔊' : '🔇';
      showSetup();
      K.show('ludo');
    },
    back: back,
    state: function () { return G; }
  });
})(typeof window !== 'undefined' ? window : this);
