import { parse } from './parse';
import { serialize } from './serialize';

export { parse, parsedNodes, type SourceSnapshot } from './parse';
export { serialize, sameContent } from './serialize';
export { detectStyle, DEFAULT_STYLE, type FileStyle } from './style';
export { schema } from './schema';
export * from './urls';

export interface RoundTripOptions {
  /** Test hook: replaces the serializer to simulate a page shape the editor cannot keep. */
  serializeOverride?: typeof serialize;
}

/**
 * Load-time guard (research R4): the visual editor opens a page only when parsing and writing
 * it back without changes gives exactly the same text.
 */
export function isRoundTripSafe(markdown: string, opts: RoundTripOptions = {}): boolean {
  try {
    const { doc, snapshot } = parse(markdown);
    return (opts.serializeOverride ?? serialize)(doc, snapshot) === markdown;
  } catch {
    return false;
  }
}
