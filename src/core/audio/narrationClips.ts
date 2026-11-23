/**
 * Recorded verse narration (docs/DESIGN.md §2.1). `scripts/audio/narrate.py` records one clip per
 * verse and writes a manifest of the exact text each clip reads. A clip is only used while that
 * text still matches the verse, so an edited verse falls back to the device voice until it is
 * recorded again.
 */

export interface ClipEntry {
  /** File name in src/assets/narration/, e.g. "GEN-1-1.mp3". */
  file: string;
  /** The verse text the clip reads. */
  text: string;
  /** Clip length at normal speed, in ms. */
  ms: number;
}

/** Verse key ("GEN 1:1") → clip. */
export type ClipManifest = Readonly<Record<string, ClipEntry>>;

/** The manifest key for a verse: book code plus "chapter:verse". */
export function clipKey(book: string, ref: string): string {
  return `${book} ${ref}`;
}

/** The clip for a verse, or undefined when there is none or it reads different text. */
export function findClip(
  manifest: ClipManifest,
  book: string,
  ref: string,
  text: string,
): ClipEntry | undefined {
  const entry = manifest[clipKey(book, ref)];
  return entry && entry.text === text ? entry : undefined;
}
