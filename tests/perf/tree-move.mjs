// Check for 005 SC-006: moving a folder of 500 pages in a 5,000-page space, with 200 pages
// linking into it, completes within 10 s (dry run and commit).
// Usage: node tests/perf/tree-move.mjs [--pages 5000] [--moved 500] [--linking 200]
// Requires a built server (dotnet build src/Copernica) and git on PATH.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => (i % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[i + 1]]] : pairs), []),
);
const PAGES = Number(args.pages ?? 5000);
const MOVED = Number(args.moved ?? 500);
const LINKING = Number(args.linking ?? 200);
const LIMIT_MS = 10_000;
const PORT = 18091;
const BASE = `http://127.0.0.1:${PORT}`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const work = mkdtempSync(join(tmpdir(), 'copernica-perf-move-'));

function paragraph(seed) {
  return `Paragraph ${seed} explains how the team handles topic ${seed % 97} in detail, with links and **emphasis**.\n\n`;
}

/** One space: MOVED pages under `moving/`, the rest elsewhere; the first LINKING others link into `moving/`. */
function createRepository() {
  const bare = join(work, 'space.git');
  spawnSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);
  const chunks = ['commit refs/heads/main\ncommitter Perf <perf@example.test> 1700000000 +0000\ndata 5\nseed\n'];
  for (let p = 0; p < PAGES; p++) {
    const moving = p < MOVED;
    const path = moving ? `moving/topic-${p % 20}/page-${p}.md` : `area-${p % 25}/topic-${p % 200}/page-${p}.md`;
    let body = `# Page ${p}\n\n`;
    if (moving) body += `Back to [the area](../../area-0/topic-0/page-${MOVED}.md).\n\n`;
    else if (p < MOVED + LINKING) body += `See [moved](/moving/topic-${p % 20}/page-${p % MOVED}.md) and [relative](../../moving/topic-0/page-0.md).\n\n`;
    while (body.length < 4096) body += paragraph(p + body.length);
    chunks.push(`M 100644 inline ${path}\ndata ${Buffer.byteLength(body)}\n${body}\n`);
  }
  const result = spawnSync('git', ['fast-import', '--quiet'], { cwd: bare, input: chunks.join(''), maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`fast-import failed: ${result.stderr}`);
  return bare;
}

console.log(`Generating ${PAGES} pages (${MOVED} to move, ${LINKING} linking) in ${work} …`);
const bare = createRepository();

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
  Copernica__Auth__Local__Users__0__Name: 'alice',
  Copernica__Auth__Local__Users__0__PasswordHash: hash,
  Copernica__Spaces__0__Id: 'space',
  Copernica__Spaces__0__RemoteUrl: bare,
};
const server = spawn('dotnet', ['run', '--project', project, '--no-build'], { env, stdio: 'ignore' });
process.on('exit', () => server.kill());

const cookies = new Map();
async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
  if (init.method && init.method !== 'GET') headers.set('X-XSRF-TOKEN', decodeURIComponent(cookies.get('XSRF-TOKEN') ?? ''));
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  for (const c of response.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const [k, ...v] = pair.split('=');
    cookies.set(k, v.join('='));
  }
  return response;
}

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/health/ready`)).ok) break;
  } catch {}
  if (i > 600) throw new Error('server not ready');
  await new Promise((r) => setTimeout(r, 500));
}

await request('/auth/config');
await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'secret' }) });
for (;;) {
  const [space] = await (await request('/api/spaces')).json();
  if (space?.state === 'ready') break;
  await new Promise((r) => setTimeout(r, 1000));
}

const tree = await request('/api/spaces/space/tree');
const base = tree.headers.get('X-Copernica-Commit');
const move = (dryRun) =>
  request('/api/spaces/space/tree/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base, kind: 'folder', from: 'moving', to: 'archive/moved', message: 'Move the folder', dryRun }),
  });

let t0 = performance.now();
const preview = await move(true);
const previewMs = performance.now() - t0;
const effects = await preview.json();
console.log(`Dry run: ${previewMs.toFixed(0)} ms — ${effects.pageCount} pages, ${effects.linkingPages?.length} linking pages`);

t0 = performance.now();
const committed = await move(false);
const commitMs = performance.now() - t0;
const result = await committed.json();
console.log(`Commit:  ${commitMs.toFixed(0)} ms — status ${committed.status}, ${result.updatedPages?.length} pages updated`);

const pass = preview.ok && committed.ok && effects.pageCount === MOVED && result.updatedPages?.length === LINKING && previewMs < LIMIT_MS && commitMs < LIMIT_MS;
console.log(pass ? `PASS: SC-006 folder move under ${LIMIT_MS / 1000} s.` : 'FAIL');
server.kill();
process.exit(pass ? 0 : 1);
