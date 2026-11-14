import { resolvePassage, formatReference, parsePassage, type Bible } from './bible';
import { encounterFileSchema } from './schema';
import { encounterText, type Encounter } from './types';

/**
 * Turns a raw encounter file into a playable Encounter: validates the shape with Zod, pulls the
 * verse text from the vendored source, then checks every content rule (docs/DESIGN.md §3.2, §6).
 * Throws with every problem listed, so CI shows all mistakes at once.
 */
export function buildEncounter(raw: unknown, bible: Bible, source = 'encounter'): Encounter {
  const parsed = encounterFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`${source}: invalid file\n${issues.join('\n')}`);
  }
  const f = parsed.data;
  const ref = parsePassage(f.passage);
  const encounter: Encounter = {
    id: f.id,
    title: f.title,
    book: ref.book,
    passage: f.passage,
    reference: formatReference(ref),
    setting: f.setting,
    ...(f.weather ? { weather: f.weather } : {}),
    translation: 'BSB',
    verses: resolvePassage(bible, f.passage),
    waves: f.waves.map(({ partner, ...w }) => ({
      ...w,
      color: parseInt(w.color.slice(1), 16),
      ...(partner ? { partner: { ...partner, color: parseInt(partner.color.slice(1), 16) } } : {}),
    })),
    orbs: f.orbs,
    ...(f.unlocks ? { unlocks: f.unlocks } : {}),
    questions: f.questions,
  };

  const errors = validateEncounter(encounter);
  if (errors.length > 0)
    throw new Error(`${source} (${f.id}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  return encounter;
}

/** Content rules that need the resolved verse text. Returns human-readable problems. */
export function validateEncounter(e: Encounter): string[] {
  const errors: string[] = [];
  const text = encounterText(e);
  const qids = new Set<string>();
  for (const q of e.questions) {
    if (qids.has(q.id)) errors.push(`duplicate question id "${q.id}"`);
    qids.add(q.id);
    if (!q.id.startsWith(`${e.id}-`))
      errors.push(`question id "${q.id}" should start with "${e.id}-"`);
    if (!text.includes(q.highlight))
      errors.push(`${q.id}: highlight "${q.highlight}" is not in the verse text`);
    if (q.answerIndex >= q.choices.length)
      errors.push(`${q.id}: answerIndex ${q.answerIndex} is out of range`);
    if (new Set(q.choices).size !== q.choices.length) errors.push(`${q.id}: duplicate choices`);
  }
  const words = new Set<string>();
  for (const o of e.orbs) {
    if (!o.word) continue;
    if (words.has(o.word)) errors.push(`duplicate orb word "${o.word}"`);
    words.add(o.word);
    if (!text.includes(o.word)) errors.push(`orb word "${o.word}" is not in the verse text`);
  }
  const foeIds = new Set<string>();
  for (const w of e.waves) {
    for (const f of w.partner ? [w, w.partner] : [w]) {
      if (foeIds.has(f.id)) errors.push(`duplicate foe id "${f.id}"`);
      foeIds.add(f.id);
    }
  }
  return errors;
}

/** Cross-file checks: unique ids and canonical order. */
export function validateCollection(encounters: readonly Encounter[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const qids = new Set<string>();
  for (const e of encounters) {
    if (ids.has(e.id)) errors.push(`duplicate encounter id "${e.id}"`);
    ids.add(e.id);
    for (const q of e.questions) {
      if (qids.has(q.id)) errors.push(`question id "${q.id}" is used in more than one encounter`);
      qids.add(q.id);
    }
  }
  const unlocks = new Map<string, string>();
  for (const e of encounters) {
    if (!e.unlocks) continue;
    const prev = unlocks.get(e.unlocks);
    if (prev) errors.push(`"${e.unlocks}" is awarded by both ${prev} and ${e.id}`);
    unlocks.set(e.unlocks, e.id);
  }
  return errors;
}

/** Sorts encounters in canonical order (book order as given, then chapter, then verse). */
export function canonicalOrder(
  encounters: readonly Encounter[],
  bookOrder: readonly string[],
): Encounter[] {
  const key = (e: Encounter) => {
    const p = parsePassage(e.passage);
    return [bookOrder.indexOf(p.book), p.chapter, p.from] as const;
  };
  return [...encounters].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}
