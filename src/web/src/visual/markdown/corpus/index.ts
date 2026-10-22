import spec from './commonmark/spec.json';

/**
 * The fidelity corpus (research R10): CommonMark examples, GFM and Azure DevOps-style fixtures,
 * and the repository's own Markdown. Test-only; never imported by application code.
 */
export interface CorpusFile {
  name: string;
  text: string;
}

const glob = (files: Record<string, unknown>) => Object.entries(files).map(([name, text]) => ({ name, text: text as string }));

const fixtures = glob(import.meta.glob(['./**/*.md', '!./guard/**'], { query: '?raw', import: 'default', eager: true }));
const repository = glob(
  import.meta.glob('../../../../../../specs/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

export function commonMarkExamples(): CorpusFile[] {
  return (spec as { markdown: string; example: number; section: string }[]).map((ex) => ({
    name: `commonmark #${ex.example} (${ex.section})`,
    text: ex.markdown,
  }));
}

export function corpusFiles(): CorpusFile[] {
  return [...commonMarkExamples(), ...fixtures, ...repository];
}

export function guardFiles(): CorpusFile[] {
  return glob(import.meta.glob('./guard/*.md', { query: '?raw', import: 'default', eager: true }));
}
