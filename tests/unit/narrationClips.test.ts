import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clipKey, findClip, type ClipManifest } from '../../src/core/audio/narrationClips';
import manifest from '../../src/assets/narration/manifest.json';
import { ENCOUNTERS } from '../../src/content';

describe('narration clips', () => {
  const m: ClipManifest = {
    'GEN 1:1': { file: 'GEN-1-1.mp3', text: 'In the beginning.', ms: 2000 },
  };

  it('finds the clip for a verse whose text matches', () => {
    expect(clipKey('GEN', '1:1')).toBe('GEN 1:1');
    expect(findClip(m, 'GEN', '1:1', 'In the beginning.')?.file).toBe('GEN-1-1.mp3');
  });

  it('ignores a clip recorded for different text, and missing verses', () => {
    expect(findClip(m, 'GEN', '1:1', 'In the beginning, God.')).toBeUndefined();
    expect(findClip(m, 'GEN', '1:2', 'Anything')).toBeUndefined();
  });

  it('has an up-to-date recording of every verse the game reads (re-run scripts/audio/narrate.py)', () => {
    const recorded = manifest as ClipManifest;
    for (const e of ENCOUNTERS)
      for (const v of e.verses) {
        const clip = findClip(recorded, e.book, v.ref, v.text);
        expect(clip, `${e.id} ${v.ref}`).toBeDefined();
        expect(existsSync(resolve(__dirname, '../../src/assets/narration', clip!.file))).toBe(true);
        expect(clip!.ms).toBeGreaterThan(1000);
      }
  });
});
