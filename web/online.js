/* Tic-Tac-Toy online play: guest or animal players, friend codes and random matches.
   Talks to server/worker.mjs; the board itself is drawn by index.html through window.TTTUI.
   Pages use big pictures and few words so small children can find their way. */
(function () {
  'use strict';

  // The online server (server/worker.mjs on Cloudflare). For testing, open the game once with ?server=<url> (it is remembered).
  var SERVER = 'https://androidapps.vidiaplus.com/tictactoy/api';

  var ANIMALS = [
    ['tiger', '🐯', 'Tiger'], ['lion', '🦁', 'Lion'], ['panda', '🐼', 'Panda'], ['puppy', '🐶', 'Puppy'],
    ['kitty', '🐱', 'Kitty'], ['bunny', '🐰', 'Bunny'], ['fox', '🦊', 'Fox'], ['frog', '🐸', 'Frog'],
    ['monkey', '🐵', 'Monkey'], ['elephant', '🐘', 'Elephant'], ['unicorn', '🦄', 'Unicorn'], ['penguin', '🐧', 'Penguin']
  ];
  var COLORS = [
    ['red', '#ff5a5a', 'Red'], ['blue', '#2e86ff', 'Blue'], ['green', '#3ccf6e', 'Green'], ['yellow', '#ffd23f', 'Yellow'],
    ['purple', '#a66bff', 'Purple'], ['orange', '#ff9a3c', 'Orange'], ['pink', '#ff6fb5', 'Pink']
  ];
  var UI = window.TTTUI;
  var root = document.getElementById('onlinePage');

  function load(key, def) {
    try { var v = localStorage.getItem('ttt.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function save(key, val) { try { localStorage.setItem('ttt.' + key, JSON.stringify(val)); } catch (e) {} }

  (function () {
    var m = /[?&]server=([^&]+)/.exec(location.search);
    if (m) save('server', decodeURIComponent(m[1]));
    SERVER = load('server', '') || SERVER;
  })();

  var P = { token: load('token', ''), me: null };   // this device's player
  var cur = null;                                   // current page: { acts, back, isHome }
  var timer = null;                                 // polling timer (waiting or playing)
  var W = null;                                     // game we are waiting in (random or friend code)
  var G = null;                                     // game being played

  /* ---------- server ---------- */

  function api(action, body) {
    body = body || {};
    body.action = action;
    if (!('token' in body)) body.token = P.token;
    return fetch(SERVER, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { throw { error: 'net' }; })
      .then(function (j) {
        if (!j.ok) {
          if (j.error === 'login') setToken('');
          throw j;
        }
        return j;
      });
  }

  function setToken(t) { P.token = t; save('token', t); }

  function errorText(e) {
    switch (e && e.error) {
      case 'net': return '📶 No internet. Check Wi-Fi and try again.';
      case 'wrong': return '🙈 Oops! That is not right. Try again.';
      case 'locked': return '⏳ Too many tries. Please wait ' + Math.ceil((e.wait || 900) / 60) + ' minutes.';
      case 'nocode': return '🤔 No game with that code. Check the code and try again.';
      case 'own': return '😄 That is your own code! Give it to a friend.';
      default: return '😵 Something went wrong. Try again.';
    }
  }

  /* ---------- small builders ---------- */

  function find(list, k) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === k) return list[i];
    return list[0];
  }
  function fullName(p) { return find(COLORS, p.color)[2] + ' ' + find(ANIMALS, p.animal)[2] + ' ' + p.num; }
  function ava(p, size) {
    return '<span class="ava" style="--c:' + find(COLORS, p.color)[1] + ';--s:' + (size || 56) + 'px">' +
      find(ANIMALS, p.animal)[1] + '</span>';
  }
  function head(title) {
    return '<div class="on-head"><button class="icon-btn" data-act="back">‹ Back</button><b>' + title + '</b></div>';
  }
  function bigBtn(act, icon, title, sub, color) {
    return '<button class="big-btn ' + (color || '') + '" data-act="' + act + '"><span>' + icon + '</span>' +
      '<span><b>' + title + '</b><small>' + sub + '</small></span></button>';
  }
  function oops(msg) { return msg ? '<div class="oops">' + msg + '</div>' : ''; }

  function page(html, acts, back) {
    root.innerHTML = html;
    cur = { acts: acts || {}, back: back || menu, isHome: false };
    root.parentNode.scrollTop = 0;
  }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !cur) return;
    var act = b.getAttribute('data-act');
    UI.sfx.click();
    if (act === 'back') cur.back();
    else if (cur.acts[act]) cur.acts[act](b.getAttribute('data-v'));
  });

  function stop() {
    clearTimeout(timer);
    timer = null;
    W = null;
    G = null;
  }

  function menu() { stop(); UI.menu(); }

  function loading() { page('<div class="spin">⏳</div>', {}, menu); }

  function offline(retry) {
    page(head('Play Online · ऑनलाइन') + '<div class="hero">📶</div><div class="on-title">No internet</div>' +
      '<div class="on-sub">Check Wi-Fi and try again · इंटरनेट चालू करें</div>' +
      bigBtn('retry', '🔄', 'Try again', 'फिर कोशिश करें', 'blue'), { retry: retry }, menu);
  }

  /* ---------- who are you? ---------- */

  function open() {
    stop();
    UI.show('online');
    if (!SERVER) {
      page(head('Play Online · ऑनलाइन') + '<div class="hero">🚧</div><div class="on-title">Online play is coming soon!</div>' +
        '<div class="on-sub">जल्द आ रहा है</div>', {}, menu);
      return;
    }
    if (!P.token) { who(); return; }
    loading();
    api('me').then(function (j) { P.me = j.me; home(); }, function (e) {
      if (e.error === 'login') who();
      else offline(open);
    });
  }

  function who(msg) {
    page(head('Play Online · ऑनलाइन') + '<div class="hero">🌍</div>' + oops(msg) +
      bigBtn('guest', '▶️', 'Play now', 'as a guest · मेहमान बनकर', 'green') +
      bigBtn('make', '⭐', 'Make my player', 'pick an animal · अपना जानवर चुनें', 'blue') +
      bigBtn('login', '🔑', 'I have a player', 'log in · लॉग इन', 'yellow'), {
      guest: function () {
        loading();
        api('guest', { token: '' }).then(function (j) { setToken(j.token); P.me = j.me; home(); },
          function (e) { who(errorText(e)); });
      },
      make: function () { pickAnimal({ mode: 'make' }); },
      login: function () { pickAnimal({ mode: 'login' }); }
    }, menu);
  }

  // F carries the choices through the make-a-player / log-in pages: { mode, animal, color, num }
  function pickAnimal(F) {
    var grid = ANIMALS.map(function (a) {
      return '<button class="pick" data-act="pick" data-v="' + a[0] + '" aria-label="' + a[2] + '">' + a[1] + '</button>';
    }).join('');
    page(head(F.mode === 'login' ? 'I have a player' : 'Make my player') +
      '<div class="on-title">' + (F.mode === 'login' ? 'Which animal are you?' : 'Pick your animal') + '</div>' +
      '<div class="on-sub">जानवर चुनें</div><div class="pick-grid">' + grid + '</div>',
      { pick: function (v) { F.animal = v; pickColor(F); } },
      P.me ? function () { home(); } : function () { who(); });
  }

  function pickColor(F) {
    var face = find(ANIMALS, F.animal)[1];
    var grid = COLORS.map(function (c) {
      return '<button class="pick color" style="--c:' + c[1] + '" data-act="pick" data-v="' + c[0] + '" aria-label="' + c[2] + '">' + face + '</button>';
    }).join('');
    page(head(F.mode === 'login' ? 'I have a player' : 'Make my player') +
      '<div class="on-title">' + (F.mode === 'login' ? 'Which colour are you?' : 'Pick your colour') + '</div>' +
      '<div class="on-sub">रंग चुनें</div><div class="pick-grid">' + grid + '</div>',
      { pick: function (v) { F.color = v; if (F.mode === 'login') numberPage(F); else pinPage(F); } },
      function () { pickAnimal(F); });
  }

  /** A number pad page. opts: { top, len, secret, auto, done(value), back, msg } */
  function keypad(opts) {
    var val = '';
    var keys = '';
    for (var d = 1; d <= 9; d++) keys += '<button data-act="k" data-v="' + d + '">' + d + '</button>';
    keys += '<button data-act="del" aria-label="Delete">⌫</button><button data-act="k" data-v="0">0</button>' +
      (opts.auto ? '<span></span>' : '<button class="ok" data-act="ok" aria-label="OK">✓</button>');
    page(opts.top + oops(opts.msg) + '<div class="digits" id="kpShow"></div><div class="keypad">' + keys + '</div>', {
      k: function (v) {
        if (val.length >= opts.len) return;
        val += v;
        draw();
        if (opts.auto && val.length === opts.len) setTimeout(function () { opts.done(val); }, 180);
      },
      del: function () { val = val.slice(0, -1); draw(); },
      ok: function () { if (val) opts.done(val); }
    }, opts.back);
    function draw() {
      var h = '';
      for (var i = 0; i < opts.len; i++) {
        var c = val.charAt(i);
        h += '<span class="' + (c ? 'on' : '') + '">' + (c ? (opts.secret ? '●' : c) : '') + '</span>';
      }
      document.getElementById('kpShow').innerHTML = h;
    }
    draw();
  }

  function numberPage(F, msg) {
    keypad({
      top: head('I have a player') + '<div style="text-align:center">' + ava({ color: F.color, animal: F.animal }, 72) + '</div>' +
        '<div class="on-title">What is your number?</div><div class="on-sub">आपका नंबर</div>',
      len: 4, secret: false, auto: false, msg: msg,
      done: function (v) { F.num = +v; pinPage(F); },
      back: function () { pickColor(F); }
    });
  }

  function pinPage(F, msg) {
    var login = F.mode === 'login';
    keypad({
      top: head(login ? 'I have a player' : 'Make my player') +
        '<div class="on-title">' + (login ? 'Your secret number' : 'Make a secret number') + '</div>' +
        '<div class="on-sub">' + (login ? 'गुप्त नंबर डालें' : '4 numbers only you know · गुप्त नंबर बनाएँ') + '</div>',
      len: 4, secret: login, auto: true, msg: msg,
      done: function (pin) {
        loading();
        var req = login
          ? api('login', { token: '', color: F.color, animal: F.animal, num: F.num, pin: pin })
          : api('signup', { token: P.me && P.me.guest ? P.token : '', color: F.color, animal: F.animal, pin: pin });
        req.then(function (j) {
          setToken(j.token);
          P.me = j.me;
          if (login) home(); else youCard(pin);
        }, function (e) {
          // a wrong log-in could be the number or the PIN, so start again from the number
          if (login && e.error === 'wrong') numberPage(F, errorText(e));
          else pinPage(F, errorText(e));
        });
      },
      back: function () { if (login) numberPage(F); else pickColor(F); }
    });
  }

  function youCard(pin) {
    page('<div class="you-card card"><div class="on-title">This is you! · यह आप हैं</div>' + ava(P.me, 110) +
      '<div class="nm">' + fullName(P.me) + '</div>' +
      '<div class="secret">Secret number: <b>' + pin + '</b></div>' +
      '<div class="on-sub" style="margin:0">📝 Ask a grown-up to write this down<br>किसी बड़े से इसे लिखवा लें</div></div>' +
      '<button class="primary" data-act="go">LET\'S PLAY ▶ · खेलें</button>', { go: function () { home(); } }, function () { home(); });
  }

  /* ---------- online home ---------- */

  function home(msg) {
    stop();
    var me = P.me;
    page(head('Play Online · ऑनलाइन') +
      '<div class="card me-card">' + ava(me, 64) + '<div><div class="nm">' + fullName(me) +
      (me.guest ? ' <span class="tag">Guest</span>' : '') + '</div>' +
      '<div class="stats">🏆 ' + me.wins + ' · 🤝 ' + me.draws + '</div></div></div>' + oops(msg) +
      bigBtn('random', '🎲', 'Play anyone', 'find a player · कोई भी खिलाड़ी', 'green') +
      bigBtn('invite', '💌', 'Invite a friend', 'get a code · दोस्त को बुलाएँ', 'blue') +
      bigBtn('join', '🔢', 'Join a friend', 'type the code · कोड डालें', 'yellow') +
      '<div class="links">' + (me.guest ? '<button class="link" data-act="make">⭐ Save my player</button>' : '') +
      '<button class="link" data-act="logout">👋 ' + (me.guest ? 'Stop playing' : 'Log out') + '</button>' +
      '<button class="link" data-act="del">🗑 Delete my player</button></div>', {
      random: findRandom,
      invite: invite,
      join: function () { joinPage(); },
      make: function () { pickAnimal({ mode: 'make' }); },
      logout: function () {
        if (me.guest) confirmPage('👋', 'Stop playing?', 'Your guest player and wins will be gone.', 'Yes, stop', logout);
        else logout();
      },
      del: function () {
        confirmPage('🗑', 'Delete ' + fullName(me) + '?', 'All wins will be gone forever. · सब मिट जाएगा', 'Yes, delete', function () {
          loading();
          api('delete').then(function () { setToken(''); P.me = null; who('👋 Your player was deleted.'); },
            function (e) { home(errorText(e)); });
        });
      }
    }, menu);
    cur.isHome = true;
  }

  function refreshMe() {
    api('me').then(function (j) {
      P.me = j.me;
      if (cur && cur.isHome) home();
    }, function () {});
  }

  function logout() {
    loading();
    api('logout').then(done, done);
    function done() { setToken(''); P.me = null; who(); }
  }

  function confirmPage(icon, title, sub, yes, onYes) {
    page('<div class="hero">' + icon + '</div><div class="on-title">' + title + '</div><div class="on-sub">' + sub + '</div>' +
      bigBtn('yes', '✅', yes, 'हाँ', 'yellow') + bigBtn('no', '↩️', 'No, go back', 'नहीं', 'blue'),
      { yes: onYes, no: function () { home(); } }, function () { home(); });
  }

  /* ---------- finding a game ---------- */

  function findRandom() {
    page(head('Play anyone') + '<div class="spin">🎲</div><div class="on-title">Looking for a player…</div>' +
      '<div class="on-sub">कोई खिलाड़ी ढूँढ रहे हैं</div><div id="nobody"></div>', {
      computer: function () { cancelWait(); UI.playComputer(); }
    }, cancelWait);
    var started = Date.now();
    api('random').then(function (j) { wait(j.game, started); }, function (e) { home(errorText(e)); });
  }

  function invite() {
    loading();
    api('friend').then(function (j) {
      var code = j.game.code;
      page(head('Invite a friend') + '<div class="on-title">Tell your friend this code</div>' +
        '<div class="on-sub">यह कोड दोस्त को बताएँ</div><div class="code-big">' + code + '</div>' +
        bigBtn('share', '📤', 'Send the code', 'WhatsApp, SMS… · भेजें', 'blue') +
        '<div class="spin" style="font-size:40px">⏳</div><div class="on-sub" style="margin:0">Waiting for your friend… · इंतज़ार</div>',
        { share: function () { share(code); } }, cancelWait);
      wait(j.game, 0);
    }, function (e) { home(errorText(e)); });
  }

  function share(code) {
    var text = "Let's play Tic-Tac-Toy! 🎮 Open the game, tap Play Online → Join a friend, and type this code: " + code;
    if (window.AndroidApp && window.AndroidApp.share) window.AndroidApp.share(text);
    else if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
  }

  function joinPage(msg) {
    keypad({
      top: head('Join a friend') + '<div class="on-title">Type the code</div><div class="on-sub">दोस्त का कोड डालें</div>',
      len: 4, secret: false, auto: true, msg: msg,
      done: function (code) {
        loading();
        api('join', { code: code }).then(function (j) { play(j.game, false); }, function (e) { joinPage(errorText(e)); });
      },
      back: function () { home(); }
    });
  }

  // Polls a waiting game until someone joins. started > 0 means a random match (offer the computer after a while).
  function wait(game, started) {
    if (game.status === 'playing') { play(game, false); return; }
    W = { id: game.id };
    var id = game.id;
    (function tick() {
      timer = setTimeout(function () {
        if (!W || W.id !== id) return;
        api('poll', { game: id }).then(function (j) {
          if (!W || W.id !== id) return;
          if (j.game.status === 'playing') play(j.game, false);
          else if (j.game.status === 'gone') home('⏰ Nobody came. Try again!');
          else tick();
        }, function (e) {
          if (!W || W.id !== id) return;
          if (e.error === 'login') who(); else tick();
        });
        if (started && Date.now() - started > 40000) {
          var box = document.getElementById('nobody');
          if (box && !box.innerHTML) {
            box.innerHTML = '<div class="on-sub" style="margin:8px 0">😴 Not many players right now</div>' +
              bigBtn('computer', '🤖', 'Play the computer', 'कंप्यूटर से खेलें', 'yellow');
          }
        }
      }, 1200);
    })();
  }

  function cancelWait() {
    if (W) api('leave', { game: W.id }).catch(function () {});
    home();
  }

  /* ---------- playing ---------- */

  function oppName(g) { return g.opp ? fullName(g.opp) : 'Friend'; }

  function play(game, keepScore) {
    stop();
    G = { id: game.id, game: game, me: game.you, emoN: game.emo.n, busy: false, fails: 0, lastEmoji: 0, switching: false };
    var names = {};
    names[game.you] = 'You · आप';
    names[game.you === 'X' ? 'O' : 'X'] = oppName(game);
    G.oppName = oppName(game);
    UI.onlineOpen({ me: game.you, names: names, keepScore: keepScore, title: game.kind === 'friend' ? 'Friend game · दोस्त' : 'Online · ऑनलाइन' });
    UI.onlineRender(game);
    UI.vibe([20, 40, 20]);
    tick();
  }

  function tick() {
    clearTimeout(timer);
    timer = setTimeout(pollGame, 1000);
  }

  function pollGame() {
    if (!G) return;
    var id = G.id;
    api('poll', { game: id }).then(function (j) {
      if (!G || G.id !== id) return;
      G.fails = 0;
      apply(j.game);
    }, function (e) {
      if (!G || G.id !== id) return;
      if (e.error === 'login' || e.error === 'nogame') { G = null; open(); return; }
      if (++G.fails >= 3) UI.onlineNet(false);
    }).then(function () {
      if (G && G.id === id && !G.switching && G.game.status !== 'gone') tick();
    });
  }

  function apply(game) {
    if (G.busy || game.ver < G.game.ver) return; // our own move is still on its way
    G.game = game;
    if (game.emo.n > G.emoN) {
      G.emoN = game.emo.n;
      if (game.emo.i >= 0) UI.showEmoji(UI.emoji[game.emo.i], G.oppName);
    }
    UI.onlineRender(game);
    if (game.status === 'over' && game.next && !G.switching) {
      G.switching = true;
      var id = G.id;
      api('poll', { game: game.next }).then(function (j) { play(j.game, true); }, function () {
        if (G && G.id === id) { G.switching = false; tick(); }
      });
    }
  }

  function tap(i) {
    if (!G || G.busy) return;
    var g = G.game;
    if (g.status !== 'playing' || g.turn !== G.me || g.board.charAt(i) !== '.') return;
    G.busy = true;
    var id = G.id;
    var mine = JSON.parse(JSON.stringify(g)); // show the move straight away, the server confirms it
    mine.board = g.board.slice(0, i) + G.me + g.board.slice(i + 1);
    mine.turn = G.me === 'X' ? 'O' : 'X';
    UI.onlineRender(mine);
    api('move', { game: id, cell: i }).then(function (j) {
      if (!G || G.id !== id) return;
      G.busy = false;
      apply(j.game);
    }, function () {
      if (!G || G.id !== id) return;
      G.busy = false;
      UI.onlineRender(G.game); // take the move back
      UI.onlineNet(false);
    });
  }

  function again() {
    if (!G || G.game.status !== 'over' || G.game.again.you) return;
    var id = G.id;
    G.game.again.you = true;
    UI.onlineRender(G.game);
    api('again', { game: id }).then(function (j) { if (G && G.id === id) apply(j.game); }, function () {});
  }

  function emoji(i) {
    if (!G || Date.now() - G.lastEmoji < 1200) return;
    G.lastEmoji = Date.now();
    UI.showEmoji(UI.emoji[i], 'You · आप');
    api('emoji', { game: G.id, i: i }).catch(function () {});
  }

  function leave() {
    if (G) api('leave', { game: G.id }).catch(function () {});
    stop();
    UI.show('online');
    if (P.me) { home(); refreshMe(); } else open();
  }

  window.Online = {
    open: open,
    tap: tap,
    again: again,
    leave: leave,
    emoji: emoji,
    back: function () { if (cur && cur.back) cur.back(); else menu(); }
  };
})();
