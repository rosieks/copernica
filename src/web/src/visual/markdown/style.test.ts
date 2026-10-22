import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, detectStyle } from './style';
import { parse } from './parse';

describe('detectStyle (research R6)', () => {
  it('uses the defaults for an empty file', () => {
    expect(detectStyle('')).toEqual(DEFAULT_STYLE);
  });

  it('detects bullet markers by majority', () => {
    expect(detectStyle('* a\n* b\n\n- c\n').bullet).toBe('*');
    expect(detectStyle('+ a\n').bullet).toBe('+');
  });

  it('keeps the default on a tie', () => {
    expect(detectStyle('* a\n\ntext\n\n+ b\n').bullet).toBe('-');
  });

  it('detects ordered list delimiter and numbering', () => {
    expect(detectStyle('1) a\n2) b\n').ordered).toEqual({ delimiter: ')', increment: true });
    expect(detectStyle('1. a\n1. b\n1. c\n').ordered).toEqual({ delimiter: '.', increment: false });
  });

  it('detects emphasis and strong markers', () => {
    const style = detectStyle('_a_ and __b__ and _c_\n');
    expect(style.emphasis).toBe('_');
    expect(style.strong).toBe('__');
  });

  it('detects the fence', () => {
    expect(detectStyle('~~~~js\nx\n~~~~\n').fence).toEqual({ char: '~', length: 4 });
    expect(detectStyle('```\nx\n```\n').fence).toEqual({ char: '`', length: 3 });
  });

  it('detects heading style and closing hashes', () => {
    expect(detectStyle('Title\n=====\n\nSub\n---\n').heading).toBe('setext');
    expect(detectStyle('# A #\n\n## B ##\n').closingHashes).toBe(true);
  });

  it('detects the rule, list indent and table pipes', () => {
    const style = detectStyle('***\n\n-   a\n-   b\n\na | b\n--|--\n1 | 2\n');
    expect(style.rule).toBe('***');
    expect(style.listIndent).toBe(3);
    expect(style.tablePipes).toEqual({ leading: false, trailing: false });
  });

  it('detects line endings and the final newline from the original text', () => {
    const crlf = parse('a\r\n\r\nb\r\n').snapshot.style;
    expect(crlf.eol).toBe('\r\n');
    expect(crlf.finalNewline).toBe(true);
    const bare = parse('a\n\nb').snapshot.style;
    expect(bare.eol).toBe('\n');
    expect(bare.finalNewline).toBe(false);
  });
});
