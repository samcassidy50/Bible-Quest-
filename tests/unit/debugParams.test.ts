import { describe, expect, it } from 'vitest';
import { parseDebugParams } from '../../src/core/debugParams';

describe('parseDebugParams', () => {
  it('returns safe defaults for an empty query', () => {
    expect(parseDebugParams('')).toEqual({ fast: false, freeze: false, fps: false });
  });

  it('parses all supported params', () => {
    expect(
      parseDebugParams(
        '?scene=battle&encounter=gen-001&seed=42&autoAnswer=correct&fast=1&freeze=true&fps=1',
      ),
    ).toEqual({
      scene: 'battle',
      encounter: 'gen-001',
      seed: 42,
      autoAnswer: 'correct',
      fast: true,
      freeze: true,
      fps: true,
    });
  });

  it('ignores unknown or malformed values', () => {
    expect(
      parseDebugParams('?scene=hacker&encounter=<script>&seed=-5&autoAnswer=maybe&fast=yes'),
    ).toEqual({ fast: false, freeze: false, fps: false });
  });
});
