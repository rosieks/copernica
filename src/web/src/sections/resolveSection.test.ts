import { describe, expect, it } from 'vitest';
import slugs from '../../../../tests/fixtures/sections/slugs.json';
import { decodeFragment, gfmSlug, resolveSection, sectionHash } from './resolveSection';

function page(html: string, comments = ''): HTMLElement {
  document.body.innerHTML = `<aside>${comments}</aside><article>${html}</article>`;
  return document.querySelector('article')!;
}

describe('gfmSlug matches the server (tests/fixtures/sections/slugs.json)', () => {
  for (const { text, id } of slugs) {
    it(text, () => expect(gfmSlug(text)).toBe(id));
  }
});

describe('resolveSection', () => {
  const article = () =>
    page(
      '<h2 id="user-content-setup">Setup</h2><h2 id="user-content-setup-1">Setup</h2>' +
        '<h2 id="user-content-zażółć-gęślą-jaźń">Zażółć gęślą jaźń</h2>' +
        '<h2 id="user-content-interface-version-10">Interface Version 1.0</h2>' +
        '<h2 id="user-content-design--process">Design &amp; Process</h2>' +
        '<h2 id="user-content-a.b">Literal</h2><h2 id="user-content-ab">Slugged</h2>',
      '<h2 id="user-content-elsewhere">In a comment</h2>',
    );

  it('finds the exact id', () => {
    expect(resolveSection(article(), '#setup-1')?.textContent).toBe('Setup');
    expect(resolveSection(article(), '#setup-1')?.id).toBe('user-content-setup-1');
  });

  it('decodes the fragment', () => {
    expect(resolveSection(article(), sectionHash('zażółć-gęślą-jaźń'))?.id).toBe('user-content-zażółć-gęślą-jaźń');
    expect(sectionHash('zażółć')).toBe('#za%C5%BC%C3%B3%C5%82%C4%87');
  });

  it('accepts Azure DevOps fragments that keep punctuation', () => {
    expect(resolveSection(article(), '#interface-version-1.0')?.id).toBe('user-content-interface-version-10');
    expect(resolveSection(article(), '#design-%26-process')?.id).toBe('user-content-design--process');
  });

  it('prefers the exact id over the slug', () => {
    expect(resolveSection(article(), '#a.b')?.textContent).toBe('Literal');
  });

  it('uses a malformed fragment as typed', () => {
    expect(decodeFragment('#%E0%A4%A')).toBe('%E0%A4%A');
    expect(resolveSection(article(), '#%E0%A4%A')).toBeNull();
  });

  it('returns null for unknown or empty fragments and outside the article', () => {
    expect(resolveSection(article(), '#gone')).toBeNull();
    expect(resolveSection(article(), '#')).toBeNull();
    expect(resolveSection(article(), '')).toBeNull();
    expect(resolveSection(article(), '#elsewhere')).toBeNull();
  });
});
