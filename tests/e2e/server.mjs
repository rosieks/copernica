// Starts Copernica for end-to-end tests with two plain git spaces backed by temporary
// bare repositories, and local accounts alice/bob (password "secret").
// Used as Playwright's webServer command; state is written to .e2e-state.json for the specs.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const project = join(root, 'src/Copernica');
const work = mkdtempSync(join(tmpdir(), 'copernica-e2e-'));
const port = process.env.E2E_PORT ?? '8080';
// Optional `dotnet build --artifacts-path <dir>` output to run instead of src/Copernica/bin.
const runArgs = ['run', '--project', project, '--no-build', ...(process.env.E2E_ARTIFACTS ? ['--artifacts-path', process.env.E2E_ARTIFACTS] : [])];

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function createRemote(name, files) {
  const bare = join(work, `${name}.git`);
  const clone = join(work, `${name}-seed`);
  git(work, 'init', '--bare', '--initial-branch=main', bare);
  git(work, 'init', '--initial-branch=main', clone);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(clone, path)), { recursive: true });
    writeFileSync(join(clone, path), content);
  }
  git(clone, 'add', '-A');
  git(clone, '-c', 'user.name=Seed', '-c', 'user.email=seed@example.test', 'commit', '-m', 'Seed');
  git(clone, 'push', bare, 'main');
  return { bare, clone };
}

const handbook = createRemote('handbook', {
  'index.md': '# Team Handbook\n\nWelcome. See [setup](guides/setup.md) and [the API](wiki:service/api.md).\n\n' +
    'This sentence is about onboarding new colleagues.\n\nAnother paragraph about the release process.\n',
  'guides/setup.md': '# Setup\n\nInstall the tools.\n\n![diagram](../img/diagram.svg)\n',
  'guides/unsafe.md': '# Unsafe\n\n<script>window.__xss = true</script><img src=x onerror="window.__xss = true">\n',
  'guides/shared.md': '# Shared\n\nFirst section.\n\nSecond section.\n\nThird section.\n',
  'img/diagram.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#1f5fbf"/></svg>',
  // 002 fixtures: wide content for reflow checks and a page above MaxRenderBytes (set below).
  'guides/wide.md':
    '# Wide\n\n' +
    `| ${Array.from({ length: 12 }, (_, i) => `Column ${i + 1}`).join(' | ')} |\n` +
    `|${' --- |'.repeat(12)}\n` +
    `| ${Array.from({ length: 12 }, () => 'value-without-breaks').join(' | ')} |\n\n` +
    '```\n' +
    'x'.repeat(300) +
    '\n```\n',
  'guides/huge.md': '# Huge\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(9000) + '\n',
});

// 002 fixture: a page with three commits by different authors (page information, history).
for (const [author, text] of [
  ['Ada', 'First draft.'],
  ['Grace', 'Second pass.'],
  ['Linus', 'Final edit.'],
]) {
  writeFileSync(join(handbook.clone, 'guides/history.md'), `# History\n\n${text}\n`);
  git(handbook.clone, 'add', '-A');
  git(handbook.clone, '-c', `user.name=${author}`, '-c', `user.email=${author.toLowerCase()}@example.test`, 'commit', '-m', `${author}: ${text}`);
}
git(handbook.clone, 'push', handbook.bare, 'main');

const service = createRemote('service', {
  'src/Program.cs': 'class P {}',
  'docs/api.md': '# Payments API\n\nEndpoints.\n',
});

const hash = spawnSync('dotnet', [...runArgs, '--', 'hash-password'], {
  input: 'secret\n',
  encoding: 'utf8',
});
if (hash.status !== 0) throw new Error(`hash-password failed: ${hash.stderr}`);

const env = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: 'Production',
  Copernica__DataDirectory: join(work, 'data'),
  Copernica__Urls: `http://127.0.0.1:${port}`,
  Copernica__SyncInterval: '00:00:05',
  Copernica__MaxRenderBytes: '200000',
  Copernica__Auth__Mode: 'Local',
  Copernica__Auth__Local__Users__0__Name: 'alice',
  Copernica__Auth__Local__Users__0__DisplayName: 'Alice Example',
  Copernica__Auth__Local__Users__0__Email: 'alice@example.test',
  Copernica__Auth__Local__Users__0__PasswordHash: hash.stdout.trim(),
  Copernica__Auth__Local__Users__1__Name: 'bob',
  Copernica__Auth__Local__Users__1__DisplayName: 'Bob Example',
  Copernica__Auth__Local__Users__1__PasswordHash: hash.stdout.trim(),
  Copernica__Spaces__0__Id: 'handbook',
  Copernica__Spaces__0__DisplayName: 'Team Handbook',
  Copernica__Spaces__0__RemoteUrl: handbook.bare,
  Copernica__Spaces__1__Id: 'service',
  Copernica__Spaces__1__DisplayName: 'Payments Service',
  Copernica__Spaces__1__RemoteUrl: service.bare,
  Copernica__Spaces__1__Folder: 'docs',
};

writeFileSync(join(here, '.e2e-state.json'), JSON.stringify({ work, handbook, service }, null, 2));

const server = spawn('dotnet', runArgs, { env, stdio: 'inherit' });
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
server.on('exit', (code) => process.exit(code ?? 0));
