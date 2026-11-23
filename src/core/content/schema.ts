import { z } from 'zod';
import { RUNE_IDS } from '../battle/runes';
import { SPECIAL_IDS } from '../battle/types';

/** Shape of an encounter file in content/encounters/ (docs/DESIGN.md §3.2). */

const id = z.string().regex(/^[a-z0-9-]{1,40}$/, 'lowercase letters, digits and dashes');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like "#4b3b78"');

const choiceQuestion = z.object({
  id,
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  prompt: z.string().min(5),
  choices: z.array(z.string().min(1)),
  answerIndex: z.number().int().min(0),
  highlight: z.string().min(2),
});

export const questionSchema = z.discriminatedUnion('type', [
  choiceQuestion.extend({
    type: z.literal('multiple_choice'),
    choices: z.array(z.string().min(1)).length(4),
  }),
  choiceQuestion.extend({
    type: z.literal('fill_blank'),
    choices: z.array(z.string().min(1)).length(4),
  }),
  choiceQuestion.extend({
    type: z.literal('true_false'),
    choices: z.tuple([z.literal('True'), z.literal('False')]),
  }),
]);

/** Foes that have sprite art; the rest are drawn as coloured placeholder shapes. */
export const FOE_SPRITES = [
  'slime-blue',
  'slime-lava',
  'thorn-plant',
  'fire-spirit',
  'shadow-wolf',
  'minotaur',
  'hissling',
  'serpent',
  'gust',
  'storm-cloud',
  'wave',
  'flood-surge',
  'squall',
  'tempest',
] as const;
export type FoeSpriteId = (typeof FOE_SPRITES)[number];

export const foeSchema = z.object({
  id,
  name: z.string().min(1),
  maxHp: z.number().int().positive(),
  attack: z.number().int().positive(),
  color: hexColor,
  size: z.number().min(0.5).max(2),
  sprite: z.enum(FOE_SPRITES).optional(),
});

/** The environments a passage can be set in (docs/DESIGN.md §2.1), in story order. */
export const SETTINGS = [
  'deep',
  'light',
  'shore',
  'garden',
  'grove',
  'wilderness',
  'fields',
  'shipyard',
  'flood',
  'babel',
] as const;
export type Setting = (typeof SETTINGS)[number];

export const encounterFileSchema = z
  .object({
    id,
    title: z.string().min(1),
    /** Reference into the vendored source, e.g. "GEN 1:1-2". Never verse text. */
    passage: z.string(),
    /** Environment drawn behind the reading and the battle. */
    setting: z.enum(SETTINGS),
    /** Flood only: a storm, or the storm clearing with a rainbow. */
    weather: z.enum(['storm', 'clearing']).optional(),
    /** Each wave is one foe, or a pair: a foe with a `partner` standing behind it. */
    waves: z
      .array(foeSchema.extend({ partner: foeSchema.optional() }).strict())
      .min(1)
      .max(3),
    /** Energy orbs in the reading, each +1 energy. */
    orbs: z.array(z.object({ word: z.string().optional() }).strict()).max(6),
    /** Armor awarded when this passage is first won. */
    unlocks: z.enum([...SPECIAL_IDS, 'ultimate']).optional(),
    /** Blessing awarded when this passage is first won (core/battle/runes.ts). */
    rune: z.enum(RUNE_IDS).optional(),
    questions: z.array(questionSchema).min(6),
  })
  .strict();

export type EncounterFile = z.infer<typeof encounterFileSchema>;
