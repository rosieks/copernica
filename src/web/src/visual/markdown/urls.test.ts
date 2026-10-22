import { describe, expect, it } from 'vitest';
import sanitizerSource from '../../../../Copernica/Rendering/HtmlSanitizerFactory.cs?raw';
import { ALLOWED_SCHEMES, isAllowedUrl, normalizeDestination, resolveImageSrc, resolvePageHref } from './urls';

describe('isAllowedUrl (contracts/fidelity.md §5)', () => {
  it.each([
    ['https://example.com', 'link', true],
    ['http://example.com', 'link', true],
    ['mailto:team@example.com', 'link', true],
    ['team@example.com', 'link', true],
    ['guides/setup.md', 'link', true],
    ['../setup.md#vpn', 'link', true],
    ['/guides/faq.md', 'link', true],
    ['wiki:service/runbook.md', 'link', true],
    ['#section', 'link', true],
    ['<docs/my page.md>', 'link', true],
    ['javascript:alert(1)', 'link', false],
    [' JavaScript:alert(1)', 'link', false],
    ['<javascript:alert(1)>', 'link', false],
    ['vbscript:msgbox', 'link', false],
    ['file:///etc/passwd', 'link', false],
    ['data:text/html,<script>', 'link', false],
    ['data:image/png;base64,AAAA', 'image', true],
    ['data:image/png;base64,AAAA', 'link', false],
    ['data:text/html,x', 'image', false],
  ] as const)('%s as %s → %s', (url, kind, expected) => {
    expect(isAllowedUrl(url, kind)).toBe(expected);
  });
});

describe('normalizeDestination', () => {
  it('removes angle brackets and resolves backslash escapes', () => {
    expect(normalizeDestination('<my page.md>')).toBe('my page.md');
    expect(normalizeDestination('foo\\(bar\\)')).toBe('foo(bar)');
  });
});

describe('resolvePageHref', () => {
  it('resolves relative, space-root and wiki: links like WikiLinkRewriter', () => {
    expect(resolvePageHref('setup.md', 'handbook', 'guides/index.md')).toBe('/s/handbook/guides/setup.md');
    expect(resolvePageHref('../reference/api.md#auth', 'handbook', 'guides/index.md')).toBe('/s/handbook/reference/api.md#auth');
    expect(resolvePageHref('/faq.md', 'handbook', 'guides/index.md')).toBe('/s/handbook/faq.md');
    expect(resolvePageHref('wiki:service/runbook.md', 'handbook', 'x.md')).toBe('/s/service/runbook.md');
    expect(resolvePageHref('my%20page.md', 'handbook', 'x.md')).toBe('/s/handbook/my%20page.md');
    expect(resolvePageHref('files/report.pdf', 'handbook', 'x.md')).toBe('/api/spaces/handbook/files/files/report.pdf');
  });

  it('keeps allowed external links and fragments, and turns emails into mailto', () => {
    expect(resolvePageHref('https://example.com', 's', 'x.md')).toBe('https://example.com');
    expect(resolvePageHref('#top', 's', 'x.md')).toBe('#top');
    expect(resolvePageHref('a@example.com', 's', 'x.md')).toBe('mailto:a@example.com');
  });

  it('rejects disallowed schemes and paths outside the space', () => {
    expect(resolvePageHref('javascript:alert(1)', 's', 'x.md')).toBeNull();
    expect(resolvePageHref('../../outside.md', 's', 'guides/x.md')).toBeNull();
  });
});

describe('resolveImageSrc', () => {
  const pending = [{ repositoryPath: '.attachments/new-1a2b.png', previewUrl: '/api/uploads/u1' }];

  it('serves internal images from the files API and pending uploads from their preview', () => {
    expect(resolveImageSrc('/.attachments/logo.png', 'h', 'guides/x.md')).toBe('/api/spaces/h/files/.attachments/logo.png');
    expect(resolveImageSrc('../.attachments/new-1a2b.png', 'h', 'guides/x.md', pending)).toBe('/api/uploads/u1');
    expect(resolveImageSrc('images/screen%20shot.png', 'h', 'x.md')).toBe('/api/spaces/h/files/images/screen%20shot.png');
  });

  it('allows data images and never loads external ones', () => {
    expect(resolveImageSrc('data:image/png;base64,AAAA', 'h', 'x.md')).toBe('data:image/png;base64,AAAA');
    expect(resolveImageSrc('https://example.com/logo.png', 'h', 'x.md')).toBeNull();
    expect(resolveImageSrc('//cdn.example.com/x.png', 'h', 'x.md')).toBeNull();
    expect(resolveImageSrc('javascript:alert(1)', 'h', 'x.md')).toBeNull();
    expect(resolveImageSrc('../../x.png', 'h', 'x.md')).toBeNull();
  });
});

describe('scheme list', () => {
  it('equals the server sanitizer allow-list', () => {
    const match = /AllowedSchemes = new HashSet<string>\(\[([^\]]*)\]/.exec(sanitizerSource);
    expect(match).not.toBeNull();
    const server = [...match![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(server).toEqual(ALLOWED_SCHEMES);
  });
});
