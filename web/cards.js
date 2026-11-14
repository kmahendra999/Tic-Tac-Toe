/* Color Cards: our own match-the-colour-or-number card game (in the family of the traditional "Crazy Eights").
   Deck of 100: numbers 1-9 twice in four colours, two Skip, Turn and +2 cards per colour, and four Rainbow cards
   that can go on anything and pick the next colour. First player with no cards left wins.
   The rules are plain functions (tested by tests/cards.test.js); the screen is built when window.GameKit exists. */
(function (root) {
  'use strict';

  var COLORS = ['red', 'yellow', 'green', 'blue'];
  var ACTIONS = ['skip', 'turn', 'plus2'];
  var HAND = 7;

  function makeDeck() {
    var d = [], id = 0;
    COLORS.forEach(function (c) {
      for (var n = 1; n <= 9; n++) { d.push({ id: id++, c: c, v: n }); d.push({ id: id++, c: c, v: n }); }
      ACTIONS.forEach(function (v) { d.push({ id: id++, c: c, v: v }); d.push({ id: id++, c: c, v: v }); });
    });
    for (var w = 0; w < 4; w++) d.push({ id: id++, c: 'wild', v: 'wild' });
    return d;
  }

  function shuffle(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  var ORDER = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
  function sortHand(h) {
    h.sort(function (a, b) {
      var va = typeof a.v === 'number' ? a.v : 10 + ACTIONS.indexOf(a.v), vb = typeof b.v === 'number' ? b.v : 10 + ACTIONS.indexOf(b.v);
      return ORDER[a.c] - ORDER[b.c] || va - vb;
    });
    return h;
  }

  // n players, seat 0 starts. rnd: random function (Math.random in the game, seeded in tests).
  function newGame(n, rnd) {
    rnd = rnd || Math.random;
    var deck = shuffle(makeDeck(), rnd), hands = [];
    for (var p = 0; p < n; p++) hands.push([]);
    for (var k = 0; k < HAND * n; k++) hands[k % n].push(deck.pop());
    hands.forEach(sortHand);
    var first = 0;
    while (typeof deck[first].v !== 'number') first++;   // the game starts on a number card
    var top = deck.splice(first, 1)[0];
    return { n: n, hands: hands, draw: deck, discard: [top], color: top.c, turn: 0, dir: 1, winner: -1, quiet: 0, rnd: rnd };
  }

  function top(s) { return s.discard[s.discard.length - 1]; }
  function canPlay(s, card) { return card.v === 'wild' || card.c === s.color || card.v === top(s).v; }
  function playable(s, p) {
    var out = [];
    s.hands[p].forEach(function (c, i) { if (canPlay(s, c)) out.push(i); });
    return out;
  }
  function seat(s, k) { return (((s.turn + s.dir * (k === undefined ? 1 : k)) % s.n) + s.n) % s.n; }

  // Takes one card for player p (the discard pile is reshuffled when the draw pile runs out). null if none left.
  function draw(s, p) {
    if (!s.draw.length && s.discard.length > 1) {
      var t = s.discard.pop();
      s.draw = shuffle(s.discard, s.rnd);
      s.discard = [t];
    }
    if (!s.draw.length) return null;
    var c = s.draw.pop();
    s.hands[p].push(c);
    sortHand(s.hands[p]);
    return c;
  }

  // Player p plays card number idx of their hand (color: the colour chosen for a Rainbow card).
  function play(s, p, idx, color) {
    var card = s.hands[p].splice(idx, 1)[0], ev = { card: card, victim: -1, drew: 0, reversed: false };
    s.discard.push(card);
    s.color = card.v === 'wild' ? color : card.c;
    s.quiet = 0;
    if (!s.hands[p].length) { s.winner = p; return ev; }
    var steps = 1;
    if (card.v === 'skip' || (card.v === 'turn' && s.n === 2)) { ev.victim = seat(s); steps = 2; }
    else if (card.v === 'turn') { s.dir = -s.dir; ev.reversed = true; }
    else if (card.v === 'plus2') {
      ev.victim = seat(s);
      for (var k = 0; k < 2; k++) if (draw(s, ev.victim)) ev.drew++;
      steps = 2;
    }
    s.turn = seat(s, steps);
    return ev;
  }

  // The player could not (or chose not to) play. If nobody can play for two whole rounds with no cards
  // left to draw, the player holding the fewest cards wins.
  function pass(s) {
    s.quiet++;
    s.turn = seat(s);
    if (s.quiet >= s.n * 2 && !s.draw.length && s.discard.length <= 1) {
      var best = 0;
      s.hands.forEach(function (h, i) { if (h.length < s.hands[best].length) best = i; });
      s.winner = best;
    }
  }

  // Colour the computer names for a Rainbow card: the one it holds most of.
  function bestColor(hand) {
    var count = { red: 0, yellow: 0, green: 0, blue: 0 };
    hand.forEach(function (c) { if (c.c !== 'wild') count[c.c]++; });
    return COLORS.reduce(function (a, b) { return count[b] > count[a] ? b : a; });
  }

  // How often the computer just plays any matching card, per level 1 (Easy) .. 5 (Impossible).
  var RANDOM = [1, 0.6, 0.3, 0.1, 0];

  // The computer's move: { i, color } or null when it has nothing to play. level 1-5 (see RANDOM); without a
  // level it always plays its best card. rnd: random function.
  function choose(s, p, level, rnd) {
    var opts = playable(s, p), hand = s.hands[p];
    if (!opts.length) return null;
    rnd = rnd || Math.random;
    if (level && rnd() < RANDOM[level - 1]) {
      var r = opts[Math.floor(rnd() * opts.length)];
      return { i: r, color: hand[r].v === 'wild' ? COLORS[Math.floor(rnd() * 4)] : null };
    }
    // Impossible also watches every other player, not only the next one.
    var small = level === 5 ? s.hands.some(function (h, k) { return k !== p && h.length <= 3; }) : s.hands[seat(s)].length <= 2;
    var best = opts[0], bestScore = -1e9;
    opts.forEach(function (i) {
      var c = hand[i], sc = 0;
      if (c.v === 'wild') sc = opts.length === 1 ? 0 : -30;           // keep the Rainbow for when it is needed
      else {
        sc = c.c === s.color ? 10 : 6;
        if (typeof c.v !== 'number') sc += small ? 40 : 4;           // hurt a player who is about to win
        sc += hand.filter(function (h) { return h.c === c.c; }).length;
      }
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    var rest = hand.filter(function (c, k) { return k !== best; });
    return { i: best, color: hand[best].v === 'wild' ? bestColor(rest) : null };
  }

  var CARDS = { COLORS: COLORS, makeDeck: makeDeck, newGame: newGame, top: top, canPlay: canPlay, playable: playable,
    draw: draw, play: play, pass: pass, choose: choose, bestColor: bestColor, seat: seat };
  if (typeof module !== 'undefined' && module.exports) module.exports = CARDS;
  root.CARDS = CARDS;
  if (typeof document === 'undefined' || !root.GameKit) return;

  /* ---------------- screen ---------------- */
  var K = root.GameKit;
  var HEX = { red: '#ff5a5a', yellow: '#ffd23f', green: '#3ccf6e', blue: '#2e86ff' };
  var HINDI = { red: 'लाल', yellow: 'पीला', green: 'हरा', blue: 'नीला' };
  var SEATS = [
    { name: 'You', color: '#2e86ff' }, { name: 'Tiger 🐯', color: '#ff9a3c' },
    { name: 'Panda 🐼', color: '#a66bff' }, { name: 'Frog 🐸', color: '#3ccf6e' }
  ];
  var SYM = { skip: '⊘', turn: '⇄', plus2: '+2', wild: '🌈' };

  var css = document.createElement('style');
  css.textContent =
    '.cc-play{flex:1;width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px;min-height:0}' +
    '.cc-table{flex:1;display:flex;align-items:center;justify-content:center;gap:26px;min-height:170px}' +
    '.cc{position:relative;width:64px;height:96px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;' +
    'border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.5);color:#0b0d12;font-weight:900;transition:transform .15s,opacity .15s}' +
    '.cc b{width:76%;height:56%;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font-size:30px}' +
    '.cc s{position:absolute;text-decoration:none;font-size:13px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)}' +
    '.cc s:first-of-type{left:6px;top:3px}.cc s:last-of-type{right:6px;bottom:3px}' +
    '.cc.wild{background:conic-gradient(#ff5a5a 0 25%,#ffd23f 0 50%,#3ccf6e 0 75%,#2e86ff 0)}' +
    '.cc.back{background:repeating-linear-gradient(45deg,#1f3557 0 8px,#2a456e 8px 16px);border-color:#ffd23f}' +
    '.cc.back b{background:#ffd23f;font-size:20px}' +
    '.cc.big{width:96px;height:144px}.cc.big b{font-size:44px}' +
    '.cc-pile{display:flex;flex-direction:column;align-items:center;gap:8px;font-weight:800;font-size:13px;color:var(--muted)}' +
    '.cc-pile button.ready .cc{animation:pick .7s ease-in-out infinite}' +
    '.cc-ring{width:22px;height:22px;border-radius:50%;border:3px solid #fff}' +
    '.cc-hand{display:flex;gap:6px;overflow-x:auto;padding:18px 6px 8px;min-height:130px;align-items:flex-end}' +
    '.cc-hand .cc.can{transform:translateY(-14px);box-shadow:0 0 0 3px #fff,0 0 18px rgba(255,255,255,.6)}' +
    '.cc-hand .cc.no{opacity:.45}' +
    '.cc-opps .chip .val{color:var(--text)}' +
    '.cc-pick{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.cc-pick button{height:70px;border-radius:16px;border:3px solid #fff;font-weight:900;font-size:18px;color:#0b0d12}' +
    '@keyframes pick{50%{box-shadow:0 0 0 4px #fff,0 0 18px #fff}}';
  document.head.appendChild(css);

  var sec = document.createElement('section');
  sec.id = 'cards';
  sec.className = 'screen';
  sec.innerHTML =
    '<div class="game-wrap">' +
    '<header class="topbar"><button class="icon-btn" data-act="back">‹ Games</button>' +
    '<div class="gtitle">Color Cards · रंगों के पत्ते</div><button class="icon-btn" data-act="sound">🔊</button></header>' +
    '<div class="menu-wrap" data-part="setup"><div class="card" data-part="players"></div><div class="card" data-part="level"></div>' +
    '<div class="card"><div class="label">How to play · कैसे खेलें</div><div style="color:var(--muted);font-size:14px;line-height:1.5">' +
    'Put down a card with the same <b>colour</b> or the same <b>number</b>. ⊘ skips the next player, ⇄ turns back, ' +
    '+2 makes the next player take 2 cards, 🌈 goes on anything and you pick the colour. No card to play? Take one from the pile. ' +
    'First to get rid of all cards wins!</div></div>' +
    '<button class="primary" data-act="start">START · शुरू करें</button></div>' +
    '<div class="cc-play hidden" data-part="play">' +
    '<div class="chips cc-opps" data-part="opps"></div>' +
    '<div class="status" data-part="status" style="align-self:center"><span class="dot"></span><span data-part="stext"></span></div>' +
    '<div class="cc-table"><div class="cc-pile"><button data-act="draw"><div class="cc back"><b>🃏</b></div></button><span>DRAW · पत्ता लो</span></div>' +
    '<div class="cc-pile"><div data-part="top"></div><span data-part="color"></span></div></div>' +
    '<div class="cc-hand" data-part="hand"></div>' +
    '<div class="actions"><button class="btn warn hidden" data-act="pass">Keep it · Pass ➜</button>' +
    '<button class="btn accent" data-act="restart">↻ New Game</button><button class="btn" data-act="setup">👥 Players</button></div>' +
    '</div></div>';
  document.body.insertBefore(sec, document.querySelector('.toast'));

  function part(n) { return sec.querySelector('[data-part="' + n + '"]'); }
  var drawBtn = sec.querySelector('[data-act="draw"]');
  var passBtn = sec.querySelector('[data-act="pass"]');
  var getPlayers = K.players(part('players'), { key: 'cards.players', min: 2, max: 4, def: 2, seats: SEATS, youFirst: true });
  var getLevel = K.level(part('level'), 'cards.level', 2);

  var G = { players: [], s: null, busy: false, over: true, drewCard: null, token: 0 };

  function cardHtml(c, cls) {
    var sym = typeof c.v === 'number' ? c.v : SYM[c.v];
    return '<div class="cc ' + (c.v === 'wild' ? 'wild ' : '') + (cls || '') + '"' +
      (c.v === 'wild' ? '' : ' style="background:' + HEX[c.c] + '"') + '><s>' + sym + '</s><b>' + sym + '</b><s>' + sym + '</s></div>';
  }

  function myTurn() { return !G.over && G.s.turn === 0; }

  function render() {
    var s = G.s, p = G.players[s.turn];
    part('opps').innerHTML = G.players.map(function (q, i) {
      if (!i) return '';
      return '<div class="chip' + (i === s.turn && !G.over ? ' turn' : '') + '" style="--c:' + q.color + '">' +
        '<span class="dot" style="background:' + q.color + '"></span><span class="nm">' + q.name + '</span>' +
        '<span class="val">🂠 ' + s.hands[i].length + '</span></div>';
    }).join('');
    part('top').innerHTML = cardHtml(top(s), 'big');
    part('color').innerHTML = '<span style="display:flex;align-items:center;gap:6px"><span class="cc-ring" style="background:' + HEX[s.color] +
      '"></span>' + HINDI[s.color] + ' ' + (s.dir > 0 ? '↻' : '↺') + '</span>';
    var st = part('status');
    st.style.borderColor = p.color;
    st.querySelector('.dot').style.cssText = 'display:block;background:' + p.color;
    part('stext').textContent = G.over ? 'Game over · खेल ख़त्म' : s.turn === 0 ?
      (G.drewCard ? 'Play the new card or keep it' : 'Your turn · आपकी बारी') : p.name + ' is playing…';
    var can = myTurn() && !G.busy ? (G.drewCard ? [s.hands[0].indexOf(G.drewCard)].filter(function (i) { return canPlay(s, s.hands[0][i]); }) : playable(s, 0)) : [];
    part('hand').innerHTML = s.hands[0].map(function (c, i) {
      return '<button data-card="' + i + '">' + cardHtml(c, myTurn() && !G.busy ? (can.indexOf(i) >= 0 ? 'can' : 'no') : '') + '</button>';
    }).join('');
    drawBtn.classList.toggle('ready', myTurn() && !G.busy && !G.drewCard && !can.length);
    passBtn.classList.toggle('hidden', !(myTurn() && G.drewCard && !G.busy));
  }

  function start() {
    G.token++;
    K.closeWinner();
    G.players = getPlayers();
    G.s = newGame(G.players.length);
    G.level = getLevel();
    G.over = false; G.busy = false; G.drewCard = null;
    part('setup').classList.add('hidden');
    part('play').classList.remove('hidden');
    turn();
  }

  function turn() {
    G.drewCard = null;
    render();
    if (G.s.turn === 0) return;
    var t = G.token;
    G.busy = true;
    setTimeout(function () { if (t === G.token) cpuMove(); }, K.wait(1000));
  }

  function cpuMove() {
    var s = G.s, p = s.turn, m = choose(s, p, G.level), t = G.token;
    if (m) return doPlay(p, m.i, m.color);
    var c = draw(s, p);
    K.tone(380, 0.06, 'triangle', 0, 0.08);
    render();
    if (c && canPlay(s, c)) {
      return setTimeout(function () {
        if (t !== G.token) return;
        var i = s.hands[p].indexOf(c);
        doPlay(p, i, c.v === 'wild' ? bestColor(s.hands[p].filter(function (h, k) { return k !== i; })) : null);
      }, K.wait(600));
    }
    setTimeout(function () { if (t === G.token) doPass(); }, K.wait(500));
  }

  function doPlay(p, idx, color) {
    var s = G.s, name = G.players[p].name, t = G.token;
    var ev = play(s, p, idx, color);
    G.busy = true;
    G.drewCard = null;
    K.tone(p ? 440 : 620, 0.08, 'triangle', 0, 0.12);
    if (!p) K.vibe(12);
    render();
    if (s.winner >= 0) return finish();
    var msg = '';
    if (ev.card.v === 'wild') msg = '🌈 ' + name + ' picks ' + s.color.toUpperCase() + ' · ' + HINDI[s.color];
    else if (ev.card.v === 'plus2') msg = '+2! ' + G.players[ev.victim].name + ' takes 2';
    else if (ev.card.v === 'skip' || (ev.card.v === 'turn' && s.n === 2)) msg = '⊘ ' + G.players[ev.victim].name + ' misses a turn';
    else if (ev.reversed) msg = '⇄ Turn back!';
    if (s.hands[p].length === 1) msg = (msg ? msg + ' · ' : '') + '🔔 ' + name + ': LAST CARD!';
    if (msg) K.toast(msg);
    setTimeout(function () { if (t === G.token) { G.busy = false; turn(); } }, K.wait(msg ? 1100 : 500));
  }

  function doPass() {
    pass(G.s);
    G.busy = false;
    if (G.s.winner >= 0) return finish();
    turn();
  }

  function finish() {
    var w = G.players[G.s.winner];
    G.over = true; G.busy = false;
    render();
    if (G.s.winner === 0) { K.sfx.win(); K.vibe([40, 50, 80]); } else K.sfx.lose();
    K.winner(G.s.winner === 0 ? '🏆' : '🃏', G.s.winner === 0 ? 'YOU WIN!' : w.name.toUpperCase() + ' WINS!',
      G.s.winner === 0 ? 'आप जीत गए 🎉' : 'फिर कोशिश करें · try again', w.color, [
        { text: 'PLAY AGAIN · फिर खेलें', cls: 'primary', fn: start },
        { text: '‹ Games', fn: function () { K.home(); } }
      ]);
  }

  // Rainbow card: ask the child which colour.
  function pickColor(done) {
    var box = document.createElement('div');
    box.className = 'cc-pick';
    K.winner('🌈', 'Pick a colour', 'रंग चुनें', '#ffd23f', []);
    var card = document.querySelector('#winPop .btns');
    card.appendChild(box);
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.style.background = HEX[c];
      b.textContent = HINDI[c];
      b.setAttribute('data-color', c);
      b.addEventListener('click', function () { K.closeWinner(); K.sfx.click(); done(c); });
      box.appendChild(b);
    });
  }

  part('hand').addEventListener('click', function (e) {
    var b = e.target.closest('[data-card]');
    if (!b || !myTurn() || G.busy) return;
    var i = +b.getAttribute('data-card'), c = G.s.hands[0][i];
    if ((G.drewCard && c !== G.drewCard) || !canPlay(G.s, c)) { K.tone(200, 0.1, 'sawtooth', 0, 0.06); K.vibe(40); return; }
    if (c.v === 'wild') pickColor(function (col) { doPlay(0, G.s.hands[0].indexOf(c), col); });
    else doPlay(0, i, null);
  });

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
    if (a === 'draw') {
      if (!myTurn() || G.busy || G.drewCard) return;
      var c = draw(G.s, 0);
      K.tone(380, 0.06, 'triangle', 0, 0.1); K.vibe(10);
      if (c && canPlay(G.s, c)) { G.drewCard = c; render(); return; }
      K.toast(c ? 'No match · बारी आगे' : 'No cards left · बारी आगे');
      G.busy = true;
      render();
      var t = G.token;
      setTimeout(function () { if (t === G.token) doPass(); }, K.wait(700));
      return;
    }
    K.sfx.click();
    if (a === 'pass') { if (myTurn() && G.drewCard) doPass(); }
    else if (a === 'back') back();
    else if (a === 'sound') b.textContent = K.toggleSound() ? '🔊' : '🔇';
    else if (a === 'start' || a === 'restart') start();
    else if (a === 'setup') showSetup();
  });

  K.register('cards', {
    open: function () {
      sec.querySelector('[data-act="sound"]').textContent = K.sound() ? '🔊' : '🔇';
      showSetup();
      K.show('cards');
    },
    back: back,
    state: function () { return G; }
  });
})(typeof window !== 'undefined' ? window : this);
