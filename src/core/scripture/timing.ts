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

/**
 * Ticker position (left edge of the text, in px) at time `t`. The text starts just off the right
 * edge and finishes just off the left edge after `durationMs`.
 */
export function tickerX(
  t: number,
  durationMs: number,
  viewWidth: number,
  textWidth: number,
): number {
  if (durationMs <= 0) return -textWidth;
  const p = Math.min(1, Math.max(0, t / durationMs));
  return viewWidth - p * (viewWidth + textWidth);
}

/**
 * Fraction of the reading (0..1) at which a word at `wordOffsetPx` into the text reaches
 * `anchorPx` on screen (e.g. 70% across). Used to time word-anchored orbs.
 */
export function wordAnchorFraction(
  wordOffsetPx: number,
  anchorPx: number,
  viewWidth: number,
  textWidth: number,
): number {
  const f = (viewWidth - anchorPx + wordOffsetPx) / (viewWidth + textWidth);
  return Math.min(1, Math.max(0, f));
}
