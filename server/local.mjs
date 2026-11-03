// Runs worker.mjs on this PC for tests and browser previews, with Node's built-in SQLite standing in for Cloudflare D1.
// Usage: node server/local.mjs [port] [database file]   (defaults: 8787, a fresh in-memory database)
import fs from 'node:fs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.mjs';

const port = +process.argv[2] || 8787;
const sqlite = new DatabaseSync(process.argv[3] || ':memory:');
sqlite.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

// the small part of the D1 API the worker uses: prepare().bind().first() / all() / run()
const DB = {
  prepare(sql) {
    const st = sqlite.prepare(sql);
    let args = [];
    const q = {
      bind(...a) { args = a; return q; },
      async first() { return st.get(...args) ?? null; },
      async all() { return { results: st.all(...args) }; },
      async run() {
        const r = st.run(...args);
        return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      }
    };
    return q;
  }
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request('http://' + req.headers.host + req.url, {
    method: req.method,
    headers: { 'Content-Type': req.headers['content-type'] || 'text/plain' },
    body: hasBody ? Buffer.concat(chunks) : undefined
  });
  const out = await worker.fetch(request, { DB }, { waitUntil(p) { p.catch(() => {}); } });
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Tic-Tac-Toy server at http://127.0.0.1:${port}/tictactoy/api`));
