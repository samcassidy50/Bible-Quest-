import { describe, expect, it } from 'vitest';
import { parseDebugParams } from '../../src/core/debugParams';

describe('parseDebugParams', () => {
  it('returns safe defaults for an empty query', () => {
    expect(parseDebugParams('')).toEqual({
      fast: false,
      freeze: false,
      fps: false,
      narrationOff: false,
      autoCollect: false,
    });
  });

  it('parses all supported params', () => {
    expect(
      parseDebugParams(
        '?scene=battle&encounter=gen-001&seed=42&autoAnswer=correct&fast=1&freeze=true&fps=1&narration=off&autoCollect=1',
      ),
    ).toEqual({
      scene: 'battle',
      encounter: 'gen-001',
      seed: 42,
      autoAnswer: 'correct',
      fast: true,
      freeze: true,
      fps: true,
      narrationOff: true,
      autoCollect: true,
    });
  });

  it('ignores unknown or malformed values', () => {
    expect(
      parseDebugParams(
        '?scene=hacker&encounter=<script>&seed=-5&autoAnswer=maybe&fast=yes&narration=loud',
      ),
    ).toEqual({ fast: false, freeze: false, fps: false, narrationOff: false, autoCollect: false });
  });
});

describe('parseDebugParams: battle params', () => {
  it('parses specials, dropping unknown ids and duplicates', () => {
    expect(parseDebugParams('?specials=sword,laser,shield,sword').specials).toEqual([
      'sword',
      'shield',
    ]);
    expect(parseDebugParams('?specials=').specials).toEqual([]);
  });

  it('parses faith as a small integer only', () => {
    expect(parseDebugParams('?faith=5').faith).toBe(5);
    expect(parseDebugParams('?faith=abc').faith).toBeUndefined();
    expect(parseDebugParams('?faith=999').faith).toBeUndefined();
  });
});

describe('parseDebugParams: hero viewer', () => {
  it('accepts a simple clip name only', () => {
    expect(parseDebugParams('?scene=rig&clip=slash')).toMatchObject({
      scene: 'rig',
      clip: 'slash',
    });
    expect(parseDebugParams('?clip=<b>').clip).toBeUndefined();
  });
});
