import { resolvePassage, formatReference, parsePassage, type Bible } from './bible';
import { encounterFileSchema } from './schema';
import {
  encounterText,
  textUpToSection,
  type Encounter,
  type EncounterFoe,
  type EncounterSection,
} from './types';

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
  const fail = (msg: string) => {
    throw new Error(`${source} (${f.id}): ${msg}`);
  };

  // Sections must cover the passage in order, with no gaps or overlaps.
  let nextVerse = ref.from;
  const sections: EncounterSection[] = f.sections.map((sec, i) => {
    const [a, b = a] = sec.verses.split('-').map(Number) as [number, number?];
    if (a !== nextVerse || b < a || b > ref.to)
      fail(
        `section ${i + 1} reads verses ${sec.verses}; expected it to start at verse ${nextVerse} and stay within ${ref.from}-${ref.to}`,
      );
    nextVerse = b + 1;
    const sub = `${ref.book} ${ref.chapter}:${a}-${b}`;
    return {
      reference: formatReference(parsePassage(sub)),
      verses: resolvePassage(bible, sub),
      foe: toFoe(sec.foe),
      orbs: sec.orbs,
    };
  });
  if (nextVerse !== ref.to + 1) fail(`sections end at verse ${nextVerse - 1}, not ${ref.to}`);

  const encounter: Encounter = {
    id: f.id,
    title: f.title,
    book: ref.book,
    passage: f.passage,
    reference: formatReference(ref),
    setting: f.setting,
    ...(f.weather ? { weather: f.weather } : {}),
    sections,
    verses: resolvePassage(bible, f.passage),
    waves: sections.map((s) => s.foe),
    orbs: sections.flatMap((s) => s.orbs),
    ...(f.unlocks ? { unlocks: f.unlocks } : {}),
    ...(f.rune ? { rune: f.rune } : {}),
    questions: f.questions,
  };

  const errors = validateEncounter(encounter);
  if (errors.length > 0)
    throw new Error(`${source} (${f.id}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  return encounter;
}

type RawFoe = { color: string; partner?: RawFoe } & Omit<EncounterFoe, 'color' | 'partner'>;

function toFoe({ partner, ...w }: RawFoe): EncounterFoe {
  return {
    ...w,
    color: parseInt(w.color.slice(1), 16),
    ...(partner ? { partner: toFoe(partner) } : {}),
  };
}

/** Each section needs at least this many questions of its own. */
export const MIN_QUESTIONS_PER_SECTION = 2;

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
    else if (q.section > e.sections.length)
      errors.push(`${q.id}: section ${q.section}, but the passage has ${e.sections.length}`);
    else if (!textUpToSection(e, q.section).includes(q.highlight))
      errors.push(
        `${q.id}: highlight "${q.highlight}" is not read by section ${q.section} (questions may only ask about what has been read so far)`,
      );
    if (q.answerIndex >= q.choices.length)
      errors.push(`${q.id}: answerIndex ${q.answerIndex} is out of range`);
    if (new Set(q.choices).size !== q.choices.length) errors.push(`${q.id}: duplicate choices`);
  }
  e.sections.forEach((sec, i) => {
    const own = e.questions.filter((q) => q.section === i + 1).length;
    if (own < MIN_QUESTIONS_PER_SECTION)
      errors.push(
        `section ${i + 1} has ${own} question(s); it needs at least ${MIN_QUESTIONS_PER_SECTION}`,
      );
    const secText = sec.verses.map((v) => v.text).join(' ');
    for (const o of sec.orbs)
      if (o.word && !secText.includes(o.word))
        errors.push(`orb word "${o.word}" is not in section ${i + 1}`);
  });
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
