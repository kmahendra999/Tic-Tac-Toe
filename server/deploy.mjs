// Deploys the Tic-Tac-Toy online server to Cloudflare: D1 database + schema, Worker, DNS name and route.
// Safe to run again: it finds what already exists and only updates the Worker code.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (never stored in this repository).
// Usage: node server/deploy.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const WORKER = 'tictactoy';
const DATABASE = 'tictactoy';
const ZONE = 'vidiaplus.com';
const HOST = 'androidapps.vidiaplus.com';
const ROUTE = `${HOST}/tictactoy/*`;
const COMPATIBILITY_DATE = '2026-10-01';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first.');
  process.exit(1);
}

async function cf(method, path, body, raw) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(raw ? {} : { 'Content-Type': 'application/json' }) },
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${method} ${path}: ${JSON.stringify(json.errors)}`);
  return json.result;
}

const read = (name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');

// 1. database
let db = (await cf('GET', `/accounts/${account}/d1/database?name=${DATABASE}`)).find((d) => d.name === DATABASE);
if (!db) {
  db = await cf('POST', `/accounts/${account}/d1/database`, { name: DATABASE });
  console.log(`created D1 database ${DATABASE}`);
}
const dbId = db.uuid;
await cf('POST', `/accounts/${account}/d1/database/${dbId}/query`, { sql: read('./schema.sql') });
console.log(`schema applied to ${DATABASE} (${dbId})`);

// 2. worker code, with the database bound as DB
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({
  main_module: 'worker.mjs',
  compatibility_date: COMPATIBILITY_DATE,
  bindings: [{ type: 'd1', name: 'DB', id: dbId }]
})], { type: 'application/json' }));
// the policy on main is the one that matches the released app
const policy = execSync('git show main:docs/privacy-policy.html', { encoding: 'utf8' });
const code = read('./worker.mjs').replace('const PAGES = {};',
  () => `const PAGES = ${JSON.stringify({ '/tictactoy/privacy-policy.html': policy })};`);
form.append('worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'worker.mjs');
await cf('PUT', `/accounts/${account}/workers/scripts/${WORKER}`, form, true);
console.log(`worker ${WORKER} uploaded`);

// 3. DNS name (proxied placeholder address: Cloudflare answers it with the Worker route)
const zone = (await cf('GET', `/zones?name=${ZONE}`))[0];
if (!zone) throw new Error(`zone ${ZONE} not found`);
const records = await cf('GET', `/zones/${zone.id}/dns_records?name=${HOST}`);
if (!records.length) {
  await cf('POST', `/zones/${zone.id}/dns_records`, {
    type: 'AAAA', name: HOST, content: '100::', proxied: true, comment: 'Tic-Tac-Toy online server (Worker route)'
  });
  console.log(`DNS record added for ${HOST}`);
}

// 4. route
const routes = await cf('GET', `/zones/${zone.id}/workers/routes`);
const route = routes.find((r) => r.pattern === ROUTE);
if (!route) {
  await cf('POST', `/zones/${zone.id}/workers/routes`, { pattern: ROUTE, script: WORKER });
  console.log(`route ${ROUTE} -> ${WORKER}`);
} else if (route.script !== WORKER) {
  throw new Error(`route ${ROUTE} already points at ${route.script}`);
}

console.log(`\nLive at https://${HOST}/tictactoy/api`);
