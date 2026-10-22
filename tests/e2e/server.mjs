// Starts Copernica for end-to-end tests with two plain git spaces backed by temporary
// bare repositories, and local accounts alice/bob (password "secret").
// Used as Playwright's webServer command; state is written to .e2e-state.json for the specs.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
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
  // Fixtures are committed byte for byte (007 tests CRLF files and byte order marks).
  git(clone, 'config', 'core.autocrlf', 'false');
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
  // 004 fixtures (specs/004-mermaid-diagrams/quickstart.md, Setup).
  'visuals/all-types.md': '# All diagram types\n\nThis text comes before the diagrams.\n\n' + [
    'flowchart LR\n  accTitle: Order flow\n  accDescr: From cart to delivery\n  A[Cart] --> B[Payment] --> C[Delivery]\n  click A "../guides/setup.md" "Setup"',
    'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
    'classDiagram\n  class Order {\n    +id: string\n  }\n  Order --> Customer',
    'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Published\n  Published --> [*]',
    'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
    'gantt\n  title Release plan\n  dateFormat YYYY-MM-DD\n  section Build\n  Code :a1, 2026-01-01, 5d\n  Test :after a1, 3d',
    'pie title Pets\n  "Dogs" : 3\n  "Cats" : 2',
    'gitGraph\n  commit\n  branch feature\n  commit\n  checkout main\n  merge feature',
  ].map((source) => '```mermaid\n' + source + '\n```\n').join('\n') + '\nThis sentence follows the diagrams.\n',
  'visuals/ado.md': '# Azure DevOps diagram\n\n::: mermaid\nflowchart LR\n  A[Cart] --> B[Payment]\n:::\n',
  'visuals/broken.md': '# Broken\n\n```mermaid\nflowchart LR\n  A --> --> B ((\n```\n\n```mermaid\nflowchart LR\n  C --> D\n```\n\nThe rest of the page is normal.\n',
  'visuals/huge.md': '# Huge diagram\n\n```mermaid\nflowchart TD\n' +
    Array.from({ length: 1300 }, (_, i) => `  N${i}[Node ${i}] --> N${i + 1}\n`).join('') + '```\n',
  'visuals/wide.md': '# Wide diagram\n\n```mermaid\nflowchart LR\n  ' +
    Array.from({ length: 40 }, (_, i) => `W${i}[Step number ${i}]`).join(' --> ') + '\n```\n',
  'visuals/evil.md': '# Hostile diagrams\n\n' + [
    'flowchart LR\n  A["<script>window.__xss = true</script>"] --> B',
    'flowchart LR\n  A --> B\n  click A call alert(1)',
    'flowchart LR\n  A --> B\n  click B "javascript:window.__xss = true"',
    '%%{init: {"securityLevel": "loose", "htmlLabels": true}}%%\nflowchart LR\n  A["<img src=x onerror=window.__xss=true>"] --> B',
    'flowchart LR\n  A["<img src=\'https://example.com/x.png\'>"] --> B',
    'flowchart LR\n  A --> B\n  classDef ext font-family:url(https://example.com/f)\n  class A ext',
  ].map((source) => '```mermaid\n' + source + '\n```\n').join('\n'),
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

// 005 fixture (specs/005-page-tree-management/quickstart.md, Setup): a space of its own, so
// moves and deletes do not disturb the other specs.
const tree = createRemote('tree', {
  'index.md': '# Tree Home\n\nSee [Setup](guides/setup.md), [the API](/reference/api.md) and [FAQ](wiki:tree/guides/faq.md).\n',
  'guides/setup.md': '# Setup\n\nInstall the tools described in [the API](../reference/api.md).\n\n![shot](../.attachments/s.svg)\n\n' +
    'This sentence is long enough to comment on.\n',
  'guides/faq.md': '# FAQ\n\nRead [install steps](setup.md#install). Inline code `setup.md` stays.\n',
  'guides/tiny.md': '[s](setup.md)\n',
  'reference/api.md': '# API\n\nEndpoints.\n',
  'reference/.order': 'api\n',
  '.attachments/s.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
  ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`archive/2019/page-${String(i).padStart(2, '0')}.md`, `# Archived ${i}\n`])),
  'archive/2019/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'archive/2019/b.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
});

// 007 fixture (specs/007-wysiwyg-editor/quickstart.md): the visual editor's Azure DevOps-style
// corpus pages, copied as bytes so CRLF line endings and byte order marks survive.
const corpus = join(root, 'src/web/src/visual/markdown/corpus/azure-devops');
const largeSections = Array.from({ length: 120 }, (_, i) =>
  `## Section ${i + 1}\n\n` +
  `This is paragraph ${i + 1} of a large page. It has enough words to wrap over several lines in the editor, ` +
  `so that typing and scrolling are measured on realistic content.\n\n` +
  `- first point of section ${i + 1}\n- second point with **bold** text\n- third point with a [link](target-page.md)\n\n` +
  (i % 10 === 0 ? '| Name | Value |\n|------|-------|\n| a | 1 |\n| b | 2 |\n\n' : ''),
).join('');
const visual = createRemote('visual', {
  ...Object.fromEntries(readdirSync(corpus).map((name) => [name, readFileSync(join(corpus, name))])),
  'index.md': '# Visual Lab\n\nPages for the visual editor tests.\n',
  'guides/target-page.md': '# Target page\n\nLinked from other pages.\n',
  'plain.md': '# Plain page\n\nFirst paragraph of a plain page.\n\nSecond paragraph.\n',
  'large.md': `# Large page\n\n${largeSections}`,
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
  // 003: per-space image locations; `notes` keeps its repository only on the data volume.
  Copernica__Spaces__1__Attachments__Path: 'images',
  Copernica__Spaces__2__Id: 'notes',
  Copernica__Spaces__2__DisplayName: 'Notes',
  Copernica__Spaces__2__Attachments__Path: '{page}.assets',
  Copernica__Spaces__3__Id: 'tree',
  Copernica__Spaces__3__DisplayName: 'Tree Lab',
  Copernica__Spaces__3__RemoteUrl: tree.bare,
  Copernica__Spaces__4__Id: 'visual',
  Copernica__Spaces__4__DisplayName: 'Visual Lab',
  Copernica__Spaces__4__RemoteUrl: visual.bare,
};

writeFileSync(join(here, '.e2e-state.json'), JSON.stringify({ work, handbook, service, tree, visual }, null, 2));

const server = spawn('dotnet', runArgs, { env, stdio: 'inherit' });
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
server.on('exit', (code) => process.exit(code ?? 0));
