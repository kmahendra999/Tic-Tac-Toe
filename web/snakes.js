/* Snakes & Ladders: race from square 1 to 100 with one die. Ladders lift you up, snakes slide you down.
   The rules are plain functions (tested by tests/snakes.test.js); the screen is built when window.GameKit exists. */
(function (root) {
  'use strict';

  // Our own board: bottom of each ladder -> top, head of each snake -> tail.
  var LADDERS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
  var SNAKES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 97: 78 };

  // Where a roll takes a token from pos (0 = not on the board yet): the squares it walks through, then any
  // ladder or snake at the end. Past 100 the token stays put - an exact roll is needed to finish.
  function move(pos, roll) {
    if (pos + roll > 100) return { to: pos, steps: [], jump: null, stuck: true };
    var steps = [];
    for (var i = pos + 1; i <= pos + roll; i++) steps.push(i);
    var end = pos + roll, jump = null;
    if (LADDERS[end]) jump = { kind: 'ladder', from: end, to: LADDERS[end] };
    else if (SNAKES[end]) jump = { kind: 'snake', from: end, to: SNAKES[end] };
    return { to: jump ? jump.to : end, steps: steps, jump: jump, stuck: false };
  }

  // Square n (1..100) -> row (0 = top) and column; the numbers zig-zag up from the bottom-left corner.
  function cell(n) {
    var r = Math.floor((n - 1) / 10), c = (n - 1) % 10;
    if (r % 2 === 1) c = 9 - c;
    return { row: 9 - r, col: c };
  }

  var SNL = { LADDERS: LADDERS, SNAKES: SNAKES, move: move, cell: cell };
  if (typeof module !== 'undefined' && module.exports) module.exports = SNL;
  root.SNL = SNL;
  if (typeof document === 'undefined' || !root.GameKit) return;

  /* ---------------- screen ---------------- */
  var K = root.GameKit;
  var SEATS = [
    { name: 'Blue', color: '#2e86ff' }, { name: 'Yellow', color: '#ffd23f' },
    { name: 'Green', color: '#3ccf6e' }, { name: 'Red', color: '#ff5a5a' }
  ];
  var SNAKE_COLORS = ['#3ccf6e', '#ff6fb5', '#a66bff', '#ff9a3c'];

  var css = document.createElement('style');
  css.textContent =
    '.snl-board{position:relative;width:var(--bs);height:var(--bs);border-radius:calc(var(--bs)*.03);overflow:hidden;' +
    'box-shadow:0 10px 40px rgba(0,0,0,.6);display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr)}' +
    '.snl-board .sq{display:flex;align-items:flex-start;justify-content:flex-start;padding:3%;font-size:calc(var(--bs)*.026);' +
    'font-weight:800;color:rgba(255,255,255,.55)}' +
    '.snl-board .sq.a{background:#111a29}.snl-board .sq.b{background:#1a2538}' +
    '.snl-board .sq.goal{background:linear-gradient(135deg,#4a3b08,#1f3557);color:#ffe27a}' +
    '.snl-board svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}' +
    '.snl-tok{position:absolute;width:7%;height:7%;border-radius:50%;border:2px solid #fff;transform:translate(-50%,-50%);' +
    'transition:left .16s ease-out,top .16s ease-out;box-shadow:0 3px 8px rgba(0,0,0,.6);z-index:2}' +
    '.snl-tok.slide{transition:left .7s ease-in-out,top .7s ease-in-out}' +
    '.snl-tok.now{animation:hop .8s ease-in-out infinite}' +
    '@keyframes hop{50%{transform:translate(-50%,-62%)}}';
  document.head.appendChild(css);

  var sec = document.createElement('section');
  sec.id = 'snakes';
  sec.className = 'screen';
  sec.innerHTML =
    '<div class="game-wrap">' +
    '<header class="topbar"><button class="icon-btn" data-act="back">‹ Games</button>' +
    '<div class="gtitle">Snakes &amp; Ladders · साँप सीढ़ी</div><button class="icon-btn" data-act="sound">🔊</button></header>' +
    '<div class="menu-wrap" data-part="setup"><div class="card" data-part="players"></div>' +
    '<button class="primary" data-act="start">START · शुरू करें</button></div>' +
    '<div class="layout hidden" data-part="play">' +
    '<div class="board-area"><div class="status" data-part="status"><span class="dot"></span><span data-part="stext"></span></div>' +
    '<div class="snl-board" data-part="board"></div></div>' +
    '<aside class="side"><div class="chips" data-part="chips"></div>' +
    '<button class="die-btn" data-act="roll">' + K.dieHtml() + '<span>ROLL · पासा फेंको</span></button>' +
    '<div class="actions"><button class="btn accent" data-act="restart">↻ New Game</button>' +
    '<button class="btn" data-act="setup">👥 Players</button></div></aside></div></div>';
  document.body.insertBefore(sec, document.querySelector('.toast'));

  function part(n) { return sec.querySelector('[data-part="' + n + '"]'); }
  var dieBtn = sec.querySelector('[data-act="roll"]');
  var die = dieBtn.querySelector('.die');
  var board = part('board');
  var getPlayers = K.players(part('players'), { key: 'snl.players', min: 2, max: 4, def: 2, seats: SEATS });

  var G = { players: [], turn: 0, busy: false, over: true, token: 0 };
  var toks = [];

  /* board drawing */
  (function drawBoard() {
    var html = '';
    for (var row = 0; row < 10; row++) {
      for (var col = 0; col < 10; col++) {
        var r = 9 - row, n = r * 10 + (r % 2 ? 9 - col : col) + 1;
        html += '<div class="sq ' + (n === 100 ? 'goal' : (row + col) % 2 ? 'b' : 'a') + '">' + (n === 100 ? '🏆' : n) + '</div>';
      }
    }
    var svg = '<svg viewBox="0 0 100 100">';
    Object.keys(LADDERS).forEach(function (a) { svg += ladderSvg(+a, LADDERS[a]); });
    Object.keys(SNAKES).forEach(function (h, i) { svg += snakeSvg(+h, SNAKES[h], SNAKE_COLORS[i % SNAKE_COLORS.length]); });
    board.innerHTML = html + svg + '</svg>';
  })();

  function center(n) { var c = cell(n); return { x: c.col * 10 + 5, y: c.row * 10 + 5 }; }

  function ladderSvg(from, to) {
    var a = center(from), b = center(to);
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    var px = -dy / len * 1.8, py = dx / len * 1.8;
    var s = '<g stroke="#e0a948" stroke-width="1.1" stroke-linecap="round" opacity=".95">' +
      '<line x1="' + (a.x + px) + '" y1="' + (a.y + py) + '" x2="' + (b.x + px) + '" y2="' + (b.y + py) + '"/>' +
      '<line x1="' + (a.x - px) + '" y1="' + (a.y - py) + '" x2="' + (b.x - px) + '" y2="' + (b.y - py) + '"/>';
    for (var t = 0.1; t < 0.95; t += 3.4 / len) {
      var x = a.x + dx * t, y = a.y + dy * t;
      s += '<line x1="' + (x + px) + '" y1="' + (y + py) + '" x2="' + (x - px) + '" y2="' + (y - py) + '"/>';
    }
    return s + '</g>';
  }

  function snakeSvg(head, tail, color) {
    var a = center(head), b = center(tail);
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    var px = -dy / len, py = dx / len, d = 'M' + a.x + ' ' + a.y, waves = Math.max(2, Math.round(len / 12));
    for (var i = 1; i <= 24; i++) {
      var t = i / 24, w = Math.sin(t * Math.PI * waves) * 2.6 * (1 - t * 0.5);
      d += ' L' + (a.x + dx * t + px * w).toFixed(2) + ' ' + (a.y + dy * t + py * w).toFixed(2);
    }
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>' +
      '<circle cx="' + a.x + '" cy="' + a.y + '" r="2.4" fill="' + color + '"/>' +
      '<circle cx="' + (a.x - 0.9) + '" cy="' + (a.y - 0.6) + '" r=".55" fill="#fff"/><circle cx="' + (a.x + 0.9) + '" cy="' + (a.y - 0.6) + '" r=".55" fill="#fff"/>';
  }

  /* tokens */
  function placeTok(i, slide) {
    var p = G.players[i], el = toks[i];
    el.classList.toggle('slide', !!slide);
    if (p.pos === 0) { el.style.visibility = 'hidden'; return; }   // not on the board until the first roll
    el.style.visibility = 'visible';
    var c = center(p.pos), same = 0, idx = 0;
    G.players.forEach(function (q, j) { if (q.pos === p.pos) { if (j < i) idx++; same++; } });
    var off = same > 1 ? [[-2, -2], [2, -2], [-2, 2], [2, 2]][idx] : [0, 0];
    el.style.left = (c.x + off[0]) + '%';
    el.style.top = (c.y + off[1]) + '%';
  }

  function render() {
    var p = G.players[G.turn];
    part('chips').innerHTML = G.players.map(function (q, i) {
      return '<div class="chip' + (i === G.turn && !G.over ? ' turn' : '') + '" style="--c:' + q.color + '">' +
        '<span class="dot" style="background:' + q.color + '"></span><span class="nm">' + (q.cpu ? '🤖 ' : '') + q.name + '</span>' +
        '<span class="val">' + (q.pos || '–') + '</span></div>';
    }).join('');
    toks.forEach(function (el, i) { el.classList.toggle('now', i === G.turn && !G.over); });
    var st = part('status');
    st.style.borderColor = p.color;
    st.querySelector('.dot').style.cssText = 'display:block;background:' + p.color;
    part('stext').textContent = G.over ? 'Game over · खेल ख़त्म' :
      p.cpu ? p.name + ' is rolling…' : p.name + ': tap ROLL · पासा फेंको';
    var ready = !G.over && !G.busy && !p.cpu;
    dieBtn.disabled = !ready;
    dieBtn.classList.toggle('ready', ready);
  }

  function start() {
    G.token++;
    K.closeWinner();
    G.players = getPlayers().map(function (q) { return { name: q.name, color: q.color, cpu: q.cpu, pos: 0 }; });
    G.turn = 0; G.over = false; G.busy = false;
    Array.prototype.forEach.call(board.querySelectorAll('.snl-tok'), function (t) { t.remove(); });
    toks = G.players.map(function (q) {
      var el = document.createElement('div');
      el.className = 'snl-tok';
      el.style.background = q.color;
      board.appendChild(el);
      return el;
    });
    toks.forEach(function (el, i) { placeTok(i); });
    part('setup').classList.add('hidden');
    part('play').classList.remove('hidden');
    K.setDie(die, 1);
    render();
    nextTurn();
  }

  function nextTurn() {
    render();
    var p = G.players[G.turn], t = G.token;
    if (p.cpu) setTimeout(function () { if (t === G.token && !G.over) roll(); }, K.wait(800));
  }

  function roll() {
    if (G.busy || G.over) return;
    G.busy = true;
    render();
    var t = G.token, n = K.roll();
    K.spinDie(die, n, function () {
      if (t !== G.token) return;
      var p = G.players[G.turn], m = move(p.pos, n);
      if (m.stuck) {
        K.toast('Need ' + (100 - p.pos) + ' to finish · ' + (100 - p.pos) + ' चाहिए');
        return setTimeout(function () { if (t === G.token) endMove(n, p); }, K.wait(900));
      }
      walk(m.steps, function () {
        if (!m.jump) return endMove(n, p);
        var up = m.jump.kind === 'ladder';
        if (up) { K.toast('Ladder! Up you go ⬆️'); [523, 659, 784].forEach(function (f, i) { K.tone(f, 0.12, 'triangle', i * 0.08); }); }
        else { K.toast('Oh no, a snake! 🐍'); [520, 420, 320, 240].forEach(function (f, i) { K.tone(f, 0.14, 'sawtooth', i * 0.09, 0.07); }); }
        K.vibe(up ? 30 : [60, 40, 60]);
        setTimeout(function () {
          if (t !== G.token) return;
          p.pos = m.jump.to;
          placeTok(G.turn, true);
          setTimeout(function () { if (t === G.token) endMove(n, p); }, K.wait(800));
        }, K.wait(350));
      });
    });
  }

  function walk(steps, done) {
    var t = G.token, i = 0, p = G.players[G.turn];
    (function step() {
      if (t !== G.token) return;
      if (i >= steps.length) return done();
      p.pos = steps[i++];
      placeTok(G.turn);
      K.tone(600 + i * 40, 0.05, 'triangle', 0, 0.08);
      setTimeout(step, K.wait(190));
    })();
  }

  function endMove(n, p) {
    G.players.forEach(function (q, i) { placeTok(i); });
    if (p.pos === 100) {
      G.over = true; G.busy = false;
      render();
      K.sfx.win(); K.vibe([40, 50, 80]);
      K.winner('🏆', p.name.toUpperCase() + ' WINS!', p.cpu ? 'कंप्यूटर जीत गया · फिर कोशिश करें' : 'जीत गए 🎉', p.color, [
        { text: 'PLAY AGAIN · फिर खेलें', cls: 'primary', fn: start },
        { text: '‹ Games', fn: function () { K.home(); } }
      ]);
      return;
    }
    G.busy = false;
    if (n === 6) K.toast('Six! Roll again · फिर से');
    else G.turn = (G.turn + 1) % G.players.length;
    nextTurn();
  }

  function stop() { G.token++; G.over = true; G.busy = false; K.closeWinner(); }

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

  K.register('snakes', {
    open: function () {
      sec.querySelector('[data-act="sound"]').textContent = K.sound() ? '🔊' : '🔇';
      showSetup();
      K.show('snakes');
    },
    back: back,
    state: function () { return G; }
  });
})(typeof window !== 'undefined' ? window : this);
