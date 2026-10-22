import { describe, expect, it } from 'vitest';
import { corpusFiles, guardFiles } from './corpus';
import { isRoundTripSafe, serialize } from './index';

describe('load-time guard (research R4, FR-019)', () => {
  it('accepts every corpus file', () => {
    for (const file of corpusFiles()) expect(isRoundTripSafe(file.text), file.name).toBe(true);
  });

  it('rejects a page whose serialization would differ', () => {
    const [unsafe] = guardFiles();
    expect(unsafe).toBeDefined();
    const broken: typeof serialize = (doc, snapshot) => serialize(doc, snapshot).replace(/\n$/, '');
    expect(isRoundTripSafe(unsafe!.text, { serializeOverride: broken })).toBe(false);
  });

  it('rejects when the serializer throws', () => {
    const throwing: typeof serialize = () => {
      throw new Error('boom');
    };
    expect(isRoundTripSafe('text\n', { serializeOverride: throwing })).toBe(false);
  });
});
