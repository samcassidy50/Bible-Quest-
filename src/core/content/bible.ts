import type { Verse } from './types';

/**
 * Passage text (docs/DESIGN.md §6). Verse text only ever comes from the kid-friendly retelling in
 * content/source/retelling/ — encounter files store a passage reference, never text.
 */

export const BOOK_NAMES: Record<string, string> = {
  GEN: 'Genesis',
};

/** book code → "chapter:verse" → text */
export type Bible = Map<string, Map<string, string>>;

/** Parses verse-per-line text: `GEN 1:1 In the beginning, …` (blank lines ignored). */
export function parseVpl(text: string, into: Bible = new Map()): Bible {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([A-Z0-9]{3}) (\d+):(\d+) (.+)$/.exec(line);
    if (!m) throw new Error(`Malformed source line: "${line.slice(0, 40)}"`);
    const [, book, ch, v, verse] = m as unknown as [string, string, string, string, string];
    let chapters = into.get(book);
    if (!chapters) into.set(book, (chapters = new Map()));
    chapters.set(`${Number(ch)}:${Number(v)}`, verse);
  }
  return into;
}

export interface PassageRef {
  book: string;
  chapter: number;
  from: number;
  to: number;
}

/** Parses `GEN 1:1-2` or `GEN 1:3` (single chapter ranges only). */
export function parsePassage(ref: string): PassageRef {
  const m = /^([A-Z0-9]{3}) (\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) throw new Error(`Invalid passage "${ref}" (expected e.g. "GEN 1:1-2")`);
  const [, book, ch, a, b] = m as unknown as [string, string, string, string, string | undefined];
  const from = Number(a);
  const to = b === undefined ? from : Number(b);
  if (from < 1 || to < from) throw new Error(`Invalid verse range in "${ref}"`);
  return { book, chapter: Number(ch), from, to };
}

/** Human reference with an en dash: `Genesis 1:1–2`. */
export function formatReference(p: PassageRef): string {
  const name = BOOK_NAMES[p.book] ?? p.book;
  return `${name} ${p.chapter}:${p.from}${p.to > p.from ? `–${p.to}` : ''}`;
}

/** Looks up every verse of a passage; throws if any is missing from the source. */
export function resolvePassage(bible: Bible, ref: string): Verse[] {
  const p = parsePassage(ref);
  const chapters = bible.get(p.book);
  if (!chapters) throw new Error(`No source text for book ${p.book}`);
  const verses: Verse[] = [];
  for (let v = p.from; v <= p.to; v++) {
    const key = `${p.chapter}:${v}`;
    const text = chapters.get(key);
    if (text === undefined) throw new Error(`Verse ${p.book} ${key} not found in source`);
    verses.push({ ref: key, text });
  }
  return verses;
}
