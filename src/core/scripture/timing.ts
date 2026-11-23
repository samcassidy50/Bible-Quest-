/**
 * Narration timing (docs/DESIGN.md §2.1). TTS engines don't report duration up front, so the
 * ticker scrolls at an estimated pace and catches up when the voice actually finishes.
 */

/** Average adult narration pace at rate 1.0, in words per minute. */
export const BASE_WPM = 150;
/** Extra pause per sentence-ending punctuation mark, in ms. */
export const SENTENCE_PAUSE_MS = 350;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimated narration length in ms for `text` read at `rate` (1 = normal, 0.8 = slower). */
export function estimateNarrationMs(text: string, rate = 1): number {
  if (rate <= 0) throw new RangeError('rate must be positive');
  const words = wordCount(text);
  if (words === 0) return 0;
  const sentences = (text.match(/[.!?;:]/g) ?? []).length;
  const ms = (words / (BASE_WPM * rate)) * 60_000 + sentences * SENTENCE_PAUSE_MS;
  return Math.round(ms);
}

/** A point on the reading timeline: at `t` ms the voice has read `x` px into the ticker text. */
export interface ReadingKnot {
  t: number;
  x: number;
}

/**
 * Reading timeline for a passage read verse by verse: one knot at the end of each verse, so the
 * ticker can be re-synced to the voice whenever a verse finishes. Verse times come from the
 * per-verse estimate (or, for recorded narration, each clip's real length in `verseMs`) scaled to
 * `durationMs`; `verseEndPx[i]` is how far into the ticker text verse `i` ends.
 */
export function readingTimeline(
  verseTexts: readonly string[],
  verseEndPx: readonly number[],
  durationMs: number,
  rate = 1,
  verseMs?: readonly number[],
): ReadingKnot[] {
  const est = verseTexts.map((v, i) => verseMs?.[i] ?? estimateNarrationMs(v, rate));
  const total = est.reduce((a, b) => a + b, 0);
  const knots: ReadingKnot[] = [{ t: 0, x: 0 }];
  let acc = 0;
  for (const [i, e] of est.entries()) {
    acc += e;
    const t = total > 0 ? (acc / total) * durationMs : durationMs;
    knots.push({ t, x: verseEndPx[i] ?? knots[knots.length - 1]!.x });
  }
  return knots;
}

/** How far (px) into the ticker text the voice is at time `t`: linear within each verse. */
export function readingOffset(t: number, knots: readonly ReadingKnot[]): number {
  return interpolate(t, knots, 't', 'x');
}

/** Inverse of `readingOffset`: the time at which the voice reaches `x` px into the text. */
export function timeAtOffset(x: number, knots: readonly ReadingKnot[]): number {
  return interpolate(x, knots, 'x', 't');
}

function interpolate(
  v: number,
  knots: readonly ReadingKnot[],
  from: keyof ReadingKnot,
  to: keyof ReadingKnot,
): number {
  if (knots.length === 0) return 0;
  if (v <= knots[0]![from]) return knots[0]![to];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1]!;
    const b = knots[i]!;
    if (v <= b[from]) {
      const span = b[from] - a[from];
      return span > 0 ? a[to] + ((v - a[from]) / span) * (b[to] - a[to]) : b[to];
    }
  }
  return knots[knots.length - 1]![to];
}

/**
 * Ticker position (left edge of the text, in px) that puts the word being read at `readAtPx`
 * (the middle of the screen), so the text is read as it passes the centre.
 */
export function tickerX(t: number, knots: readonly ReadingKnot[], readAtPx: number): number {
  return readAtPx - readingOffset(t, knots);
}

/**
 * Fraction of the reading (0..1) at which a word at `wordOffsetPx` into the text reaches
 * `anchorPx` on screen (e.g. 72% across) while the spoken word sits at `readAtPx`.
 * Used to time word-anchored orbs.
 */
export function wordAnchorFraction(
  wordOffsetPx: number,
  anchorPx: number,
  readAtPx: number,
  knots: readonly ReadingKnot[],
  durationMs: number,
): number {
  if (durationMs <= 0) return 1;
  const t = timeAtOffset(wordOffsetPx + readAtPx - anchorPx, knots);
  return Math.min(1, Math.max(0, t / durationMs));
}
