// Captures the Play Store screenshots (phone, 7" and 10" tablet) into store/screenshots/.
// Drives headless Chrome or Edge over the DevTools protocol - no npm packages needed (Node 22+).
// Usage:  node tools/screenshots.js
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'screenshots');
const PAGE = 'file:///' + path.join(ROOT, 'web', 'index.html').replace(/\\/g, '/');
const PORT = 9333;

// width x height in CSS px, times scale = saved image size
const DEVICES = [
  { name: 'phone', width: 400, height: 800, scale: 2.7 },   // 1080x2160
  { name: 'tablet7', width: 600, height: 960, scale: 2 },   // 1200x1920
  { name: 'tablet10', width: 800, height: 1280, scale: 2 }  // 1600x2560
];

const click = (sel, i = 0) => `document.querySelectorAll(${JSON.stringify(sel)})[${i}].click()`;
const cell = (i) => click('.cell', i);

// Each scene: saved settings, then steps (JS to run, or a number = wait ms).
const SCENES = [
  { file: '1-menu', store: { mode: 'pvc', levels: { cpu: 3, cpuX: 2, cpuO: 5 } }, steps: [400] },
  {
    file: '2-vs-computer',
    store: { mode: 'pvc', levels: { cpu: 3, cpuX: 2, cpuO: 5 }, scores: { pvc: [3, 1, 2], pvp: [0, 0, 0], cvc: [0, 0, 0] } },
    steps: [click('#startBtn'), 300, cell(4), 900, () => firstEmpty([0, 2, 6, 8]), 1100]
  },
  {
    file: '3-two-players-win',
    store: { mode: 'pvp', scores: { pvc: [0, 0, 0], pvp: [2, 1, 1], cvc: [0, 0, 0] } },
    steps: [click('#startBtn'), 300, cell(0), 150, cell(1), 150, cell(4), 150, cell(2), 150, cell(8), 1800]
  },
  {
    file: '4-computer-vs-computer',
    store: { mode: 'cvc', levels: { cpu: 3, cpuX: 2, cpuO: 5 }, scores: { pvc: [0, 0, 0], pvp: [0, 0, 0], cvc: [1, 2, 4] } },
    steps: [click('#startBtn'), 2350]
  }
];

function firstEmpty(order) {
  return `(function(){var c=document.querySelectorAll('.cell');var o=${JSON.stringify(order)};` +
    `for(var k=0;k<o.length;k++){if(c[o[k]].classList.contains('empty')){c[o[k]].click();return;}}})()`;
}

function findBrowser() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const local = process.env.LOCALAPPDATA || '';
  const list = [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const found = list.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome or Edge not found');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* browser still starting */ }
    await sleep(200);
  }
  throw new Error('could not reach the headless browser');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      waiters.filter((w) => w.method === msg.method).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg.params); });
    }
  };
  return new Promise((resolve) => {
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        pending.set(++id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      once: (method) => new Promise((res) => waiters.push({ method, resolve: res })),
      close: () => ws.close()
    });
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ttt-shots-'));
  const browser = spawn(findBrowser(), [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'
  ], { stdio: 'ignore' });

  try {
    const c = await cdp(await connect());
    await c.send('Page.enable');
    const run = (expr) => c.send('Runtime.evaluate', { expression: expr, awaitPromise: true });
    const load = async (url) => { const done = c.once('Page.loadEventFired'); await c.send('Page.navigate', { url }); await done; };

    for (const d of DEVICES) {
      await c.send('Emulation.setDeviceMetricsOverride', {
        width: d.width, height: d.height, deviceScaleFactor: d.scale, mobile: d.name === 'phone'
      });
      for (const s of SCENES) {
        await load(PAGE);
        const seed = Object.entries({ sound: true, vibrate: true, scores: { pvc: [0, 0, 0], pvp: [0, 0, 0], cvc: [0, 0, 0] }, ...s.store })
          .map(([k, v]) => `localStorage.setItem('ttt.${k}', ${JSON.stringify(JSON.stringify(v))});`).join('');
        await run('localStorage.clear();' + seed);
        await load(PAGE);
        for (const step of s.steps) {
          if (typeof step === 'number') await sleep(step);
          else await run(typeof step === 'function' ? step() : step);
        }
        const shot = await c.send('Page.captureScreenshot', { format: 'png' });
        const file = path.join(OUT, `${d.name}-${s.file}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        console.log(`${path.relative(ROOT, file)}  ${d.width * d.scale}x${d.height * d.scale}`);
      }
    }
    c.close();
  } finally {
    browser.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
