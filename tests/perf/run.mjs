// Load check for SC-002 / SC-008: 20 spaces × 5,000 pages, 50 concurrent users, pages < 2 s.
// Usage: node tests/perf/run.mjs [--spaces 20] [--pages 5000] [--users 50] [--seconds 60]
// Requires a built server (dotnet build src/Copernica) and git on PATH.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => (i % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[i + 1]]] : pairs), []),
);
const SPACES = Number(args.spaces ?? 20);
const PAGES = Number(args.pages ?? 5000);
const USERS = Number(args.users ?? 50);
const SECONDS = Number(args.seconds ?? 60);
const PAGE_KB = Number(args.pageKb ?? 4);
const BIG_PAGE_KB = 100;
const PORT = 18090;
const BASE = `http://127.0.0.1:${PORT}`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const work = mkdtempSync(join(tmpdir(), 'copernica-perf-'));

function paragraph(seed) {
  return `Paragraph ${seed} explains how the team handles topic ${seed % 97} in detail, with links and **emphasis**.\n\n`;
}

/** Creates a bare repository with `PAGES` Markdown files in nested folders using git fast-import. */
function createRepository(index) {
  const bare = join(work, `space-${index}.git`);
  spawnSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);
  const chunks = ['commit refs/heads/main\ncommitter Perf <perf@example.test> 1700000000 +0000\ndata 5\nseed\n'];
  for (let p = 0; p < PAGES; p++) {
    const folder = `area-${p % 25}/topic-${p % 200}`;
    const size = p === 0 ? BIG_PAGE_KB : PAGE_KB;
    let body = `# Page ${p} of space ${index}\n\nSee [the first page](/area-0/topic-0/page-0.md).\n\n`;
    while (body.length < size * 1024) body += paragraph(p + body.length);
    const bytes = Buffer.byteLength(body);
    chunks.push(`M 100644 inline ${folder}/page-${p}.md\ndata ${bytes}\n${body}\n`);
  }
  const result = spawnSync('git', ['fast-import', '--quiet'], { cwd: bare, input: chunks.join(''), maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`fast-import failed: ${result.stderr}`);
  return bare;
}

console.log(`Generating ${SPACES} × ${PAGES} pages in ${work} …`);
const started = Date.now();
const repos = Array.from({ length: SPACES }, (_, i) => createRepository(i));
console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)} s`);

const project = join(root, 'src/Copernica');
const hash = spawnSync('dotnet', ['run', '--project', project, '--no-build', '--', 'hash-password'], { input: 'secret\n', encoding: 'utf8' }).stdout.trim();
const env = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: 'Production',
  Logging__LogLevel__Default: 'Warning',
  Copernica__Urls: BASE,
  Copernica__DataDirectory: join(work, 'data'),
  Copernica__Auth__Mode: 'Local',
  Copernica__SyncInterval: '00:10:00',
};
for (let u = 0; u < USERS; u++) {
  env[`Copernica__Auth__Local__Users__${u}__Name`] = `user${u}`;
  env[`Copernica__Auth__Local__Users__${u}__PasswordHash`] = hash;
}
repos.forEach((bare, i) => {
  env[`Copernica__Spaces__${i}__Id`] = `space-${i}`;
  env[`Copernica__Spaces__${i}__RemoteUrl`] = bare;
});

const server = spawn('dotnet', ['run', '--project', project, '--no-build'], { env, stdio: 'ignore' });
process.on('exit', () => server.kill());

async function waitReady() {
  for (let i = 0; i < 600; i++) {
    try {
      const spaces = await fetch(`${BASE}/health/ready`);
      if (spaces.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server not ready');
}

class Session {
  cookies = new Map();
  async request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    if (init.method && init.method !== 'GET') headers.set('X-XSRF-TOKEN', decodeURIComponent(this.cookies.get('XSRF-TOKEN') ?? ''));
    const response = await fetch(`${BASE}${path}`, { ...init, headers });
    for (const c of response.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      this.cookies.set(k, v.join('='));
    }
    return response;
  }
}

await waitReady();
const startup = (Date.now() - started) / 1000;
console.log(`Server ready (${startup.toFixed(1)} s after start of generation). Waiting for first sync …`);

const admin = new Session();
await admin.request('/auth/config');
await admin.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'user0', password: 'secret' }) });
for (;;) {
  const spaces = await (await admin.request('/api/spaces')).json();
  if (spaces.length === SPACES && spaces.every((s) => s.state === 'ready')) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const treeStart = performance.now();
await Promise.all(Array.from({ length: SPACES }, (_, i) => admin.request(`/api/spaces/space-${i}/tree`).then((r) => r.arrayBuffer())));
console.log(`Cold page trees for all spaces: ${((performance.now() - treeStart) / 1000).toFixed(2)} s`);

const latencies = { page: [], bigPage: [], tree: [] };
let errors = 0;
const deadline = Date.now() + SECONDS * 1000;

async function user(u) {
  const s = new Session();
  await s.request('/auth/config');
  await s.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `user${u}`, password: 'secret' }) });
  while (Date.now() < deadline) {
    const space = Math.floor(Math.random() * SPACES);
    const roll = Math.random();
    const p = roll < 0.05 ? 0 : Math.floor(Math.random() * PAGES);
    const path = roll < 0.1 ? `/api/spaces/space-${space}/tree` : `/api/spaces/space-${space}/pages/area-${p % 25}/topic-${p % 200}/page-${p}.md`;
    const t0 = performance.now();
    const response = await s.request(path);
    await response.arrayBuffer();
    const ms = performance.now() - t0;
    if (!response.ok) errors++;
    (roll < 0.05 ? latencies.bigPage : roll < 0.1 ? latencies.tree : latencies.page).push(ms);
  }
}

console.log(`Running ${USERS} users for ${SECONDS} s …`);
await Promise.all(Array.from({ length: USERS }, (_, u) => user(u)));

function stats(name, values) {
  values.sort((a, b) => a - b);
  const pct = (q) => values[Math.min(values.length - 1, Math.floor(values.length * q))]?.toFixed(0) ?? '-';
  console.log(`${name.padEnd(9)} n=${String(values.length).padStart(6)}  p50=${pct(0.5)} ms  p95=${pct(0.95)} ms  p99=${pct(0.99)} ms  max=${pct(1)} ms`);
  return Number(pct(0.95));
}

const p95Page = stats('page', latencies.page);
const p95Big = stats('page100k', latencies.bigPage);
stats('tree', latencies.tree);
console.log(`errors=${errors}`);
const pass = errors === 0 && p95Page < 2000 && p95Big < 2000;
console.log(pass ? 'PASS: SC-002/SC-008 page display under 2 s at p95.' : 'FAIL');
server.kill();
process.exit(pass ? 0 : 1);
