import type { Encounter } from '../../core/content/types';

/**
 * Genesis 1:1–2 (World English Bible, public domain).
 *
 * PLACEHOLDER SCRIPTURE: this verse text was entered by hand for the Phase 1 slice. Phase 3
 * replaces it with text imported from the vendored WEB source and checked word for word in CI.
 *
 * QUESTIONS ARE AI-DRAFTED and need human review (docs/DESIGN.md §6).
 */
export const GEN_001: Encounter = {
  id: 'gen-001',
  book: 'Genesis',
  reference: 'Genesis 1:1–2',
  translation: 'WEB',
  verses: [
    { ref: '1:1', text: 'In the beginning, God created the heavens and the earth.' },
    {
      ref: '1:2',
      text: 'The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.',
    },
  ],
  waves: [
    { id: 'wisp-1', name: 'Shadow Wisp', maxHp: 40, attack: 9, color: 0x4b3b78, size: 0.8 },
    { id: 'wisp-2', name: 'Shadow Wisp', maxHp: 50, attack: 10, color: 0x3d2f66, size: 0.9 },
    { id: 'shade', name: 'Shade of the Deep', maxHp: 70, attack: 12, color: 0x241a45, size: 1.25 },
  ],
  orbs: [{ special: 'sword', word: 'created' }],
  questions: [
    {
      id: 'gen-001-q1',
      type: 'multiple_choice',
      difficulty: 'easy',
      prompt: 'What did God create in the beginning?',
      choices: ['The heavens and the earth', 'The sun and the moon', 'The animals', 'A garden'],
      answerIndex: 0,
      highlight: 'God created the heavens and the earth',
    },
    {
      id: 'gen-001-q2',
      type: 'true_false',
      difficulty: 'easy',
      prompt: 'True or false: at the start, the earth was full of light.',
      choices: ['True', 'False'],
      answerIndex: 1,
      highlight: 'Darkness was on the surface of the deep',
    },
    {
      id: 'gen-001-q3',
      type: 'fill_blank',
      difficulty: 'medium',
      prompt: 'God’s Spirit was hovering over the surface of the ____.',
      choices: ['waters', 'mountains', 'garden', 'sky'],
      answerIndex: 0,
      highlight: 'hovering over the surface of the waters',
    },
    {
      id: 'gen-001-q4',
      type: 'multiple_choice',
      difficulty: 'medium',
      prompt: 'How does the verse describe the earth at first?',
      choices: ['Full of animals', 'Formless and empty', 'Covered in trees', 'Bright and sunny'],
      answerIndex: 1,
      highlight: 'formless and empty',
    },
    {
      id: 'gen-001-q5',
      type: 'multiple_choice',
      difficulty: 'easy',
      prompt: 'Who was hovering over the waters?',
      choices: ['An angel', 'A dove', 'God’s Spirit', 'Adam'],
      answerIndex: 2,
      highlight: 'God’s Spirit was hovering',
    },
    {
      id: 'gen-001-q6',
      type: 'multiple_choice',
      difficulty: 'easy',
      prompt: 'When did God create the heavens and the earth?',
      choices: ['After the flood', 'On the seventh day', 'In the garden', 'In the beginning'],
      answerIndex: 3,
      highlight: 'In the beginning',
    },
  ],
};
