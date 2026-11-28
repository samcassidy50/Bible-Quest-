import Phaser from 'phaser';
import { pixelBox, UI } from '../ui/pixelUi';
import type { Question } from '../../core/content/types';
import { Button } from '../ui/Button';
import { FONT_READ, FONT_VERSE, tweenAsync, wait } from '../util';
import { COLOR } from './actionInfo';

const ANSWER_FILL = 0x3c3366;
const SELECTED_FILL = 0xc98a1a;
/** Height of the strip at the bottom of the card that holds Confirm / Continue (80 px button). */
const BOTTOM_ROW = 120;

/** Read-aloud mode (settings → Read questions aloud): speaks text; the card owns when. */
export interface CardVoice {
  say(text: string): void;
  stop(): void;
}

/** What the voice reads for a question: true/false statements get a lead-in. */
export function spokenPrompt(q: Pick<Question, 'type' | 'prompt'>): string {
  return q.type === 'true_false' ? `True or false? ${q.prompt}` : q.prompt;
}

/**
 * Question card shown before every hero action except the ultimate (docs/DESIGN.md §2.2).
 * The container is centred on the screen; a full-screen backdrop blocks taps on the battle.
 */
export class QuestionCard extends Phaser.GameObjects.Container {
  readonly answerButtons: Button[] = [];
  continueButton?: Button;
  /** Read-aloud mode only: locks in the selected answer. */
  confirmButton?: Button;
  /** Read-aloud mode: the answer tapped but not yet confirmed. */
  selected: number | null = null;
  private readonly cardW: number;
  private readonly cardH: number;
  /** Where the wrong-answer message starts: just under the answers. */
  private readonly feedbackTop: number;
  private card: Phaser.GameObjects.Image;
  private answered = false;
  private timerBar?: Phaser.GameObjects.Graphics;
  private timerTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    private readonly question: Question,
    private readonly onAnswer: (index: number) => void,
    /** Set in read-aloud mode: tapping an answer reads it and selects it; Confirm answers. */
    private readonly voice?: CardVoice,
  ) {
    const { width: W, height: H } = scene.scale.gameSize;
    super(scene, W / 2, H / 2);
    this.cardW = Math.min(W - 48, 1000);
    const cw = this.cardW;
    const left = -cw / 2 + 36;

    // The card is as tall as its content: prompt, answers and (read-aloud mode) the
    // Confirm button. A wrong answer grows it to fit the message and Continue.
    const prompt = scene.add.text(left, 0, question.prompt, {
      fontFamily: FONT_READ,
      fontSize: '34px',
      fontStyle: 'bold',
      color: COLOR.ink,
      wordWrap: { width: cw - 72, useAdvancedWrap: true },
      lineSpacing: 6,
    });
    const cols = 2;
    const gap = 18;
    const btnW = (cw - 72 - gap) / cols;
    const btnH = 88;
    const rows = Math.ceil(question.choices.length / cols);
    const answersH = rows * btnH + (rows - 1) * gap;
    // Room above the prompt for the optional timer bar.
    const PROMPT_TOP = 40;
    const FOOTER = voice ? 18 + BOTTOM_ROW : 30;
    this.cardH = Math.min(H - 32, PROMPT_TOP + prompt.height + 24 + answersH + FOOTER);
    const ch = this.cardH;
    prompt.setY(-ch / 2 + PROMPT_TOP);
    const top = prompt.y + prompt.height + 24;
    this.feedbackTop = top + answersH + 18;

    const backdrop = scene.add.rectangle(0, 0, W * 2, H * 2, 0x05030d, 0.6).setInteractive();
    const card = pixelBox(scene, UI.panel, 0, 0, cw, ch);
    this.card = card;

    this.add([backdrop, card, prompt]);
    // Tap the question to hear it again.
    if (voice)
      prompt.setInteractive({ useHandCursor: true }).on('pointerup', () => this.readQuestion());

    // Answers: 2 columns of large thumb-sized buttons, right under the prompt.
    question.choices.forEach((choice, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + btnW / 2 + col * (btnW + gap);
      const y = top + btnH / 2 + row * (btnH + gap);
      const b = new Button(scene, x, y, {
        width: btnW,
        height: btnH,
        label: choice,
        fontSize: 26,
        fontFamily: FONT_READ,
        fill: ANSWER_FILL,
        onTap: () => (voice ? this.select(i) : this.choose(i)),
      });
      this.answerButtons.push(b);
      this.add(b);
    });

    if (voice) {
      this.confirmButton = new Button(scene, cw / 2 - 130, ch / 2 - BOTTOM_ROW / 2, {
        width: 200,
        height: 80,
        radius: 40,
        label: 'Confirm',
        fontSize: 26,
        // The pixel UI font draws "fi" as a broken ligature.
        fontFamily: FONT_READ,
        fill: COLOR.correct,
        onTap: () => {
          if (this.selected !== null) this.choose(this.selected);
        },
      }).setEnabled(false);
      this.add(this.confirmButton);
    }

    this.setDepth(100);
    scene.add.existing(this);
  }

  async slideIn(): Promise<void> {
    const targetY = this.y;
    this.setY(targetY + this.scene.scale.gameSize.height).setAlpha(1);
    await tweenAsync(this.scene, { targets: this, y: targetY, duration: 280, ease: 'Back.out' });
  }

  async slideOut(): Promise<void> {
    this.voice?.stop();
    await tweenAsync(this.scene, {
      targets: this,
      y: this.y + this.scene.scale.gameSize.height,
      duration: 220,
      ease: 'Quad.in',
    });
    this.destroy();
  }

  /**
   * Optional countdown (settings → question timer). A gold bar drains along the top of the card;
   * running out counts as a wrong answer (index -1), which then shows the right answer.
   */
  startTimer(ms: number): void {
    const cw = this.cardW;
    const y = -this.cardH / 2 + 18;
    this.timerBar = this.scene.add.graphics();
    this.add(this.timerBar);
    const draw = (k: number) => {
      this.timerBar
        ?.clear()
        .fillStyle(k > 0.25 ? COLOR.gold : 0xe74c3c, 1)
        .fillRoundedRect(-cw / 2 + 28, y, (cw - 56) * k, 8, 4);
    };
    draw(1);
    this.timerTween = this.scene.tweens.addCounter({
      from: 1,
      to: 0,
      duration: ms,
      onUpdate: (t) => draw(t.getValue() ?? 0),
      onComplete: () => this.choose(-1),
    });
  }

  /** Read-aloud mode: reads the question (after the card slides in, or when it is tapped). */
  readQuestion(): void {
    if (!this.answered) this.voice?.say(spokenPrompt(this.question));
  }

  /** Read-aloud mode: highlights the tapped answer and reads it; Confirm locks it in. */
  select(index: number): void {
    if (this.answered || !this.voice) return;
    this.selected = index;
    this.answerButtons.forEach((b, i) => b.setFill(i === index ? SELECTED_FILL : ANSWER_FILL));
    this.confirmButton?.setEnabled(true);
    this.voice.say(this.question.choices[index]!);
    this.scene.events.emit('card-selected', index);
  }

  /** Answers (taps without read-aloud, Confirm, ?autoAnswer and the timer; -1 = time ran out). */
  choose(index: number): void {
    if (this.answered) return;
    this.answered = true;
    this.timerTween?.stop();
    this.voice?.stop();
    this.confirmButton?.destroy();
    this.confirmButton = undefined;
    this.answerButtons.forEach((b) => b.setFill(ANSWER_FILL));
    this.answerButtons.forEach((b) => b.setEnabled(false).setAlpha(1));
    this.onAnswer(index);
  }

  /**
   * Shows right/wrong. A correct answer continues on its own; a wrong one shows the verse phrase
   * and waits for Continue so the player can read it.
   */
  async showFeedback(chosen: number, autoContinue: boolean): Promise<void> {
    const q = this.question;
    const correct = chosen === q.answerIndex;
    this.answerButtons[q.answerIndex]?.setFill(COLOR.correct);
    if (!correct) this.answerButtons[chosen]?.setFill(COLOR.wrong);

    const cw = this.cardW;
    const left = -cw / 2 + 36;

    if (correct) {
      // Just a moment on the green answer; the battle scene shows the POWER UP burst.
      await wait(this.scene, 300);
      return;
    }

    const answer = q.choices[q.answerIndex];
    const lead = chosen < 0 ? '⏰ Time’s up!' : 'Not quite.';
    const fb = this.scene.add.text(left, this.feedbackTop, `${lead} The answer is “${answer}”.`, {
      fontFamily: FONT_READ,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#a93226',
      wordWrap: { width: cw - 300, useAdvancedWrap: true },
    });
    // The quote goes under the message, however many lines that took.
    const quote = this.scene.add.text(
      left,
      fb.y + fb.height + 10,
      `The verse says: “…${q.highlight}…”`,
      {
        fontFamily: FONT_VERSE,
        fontSize: '24px',
        fontStyle: 'italic',
        color: COLOR.ink,
        backgroundColor: '#fbe8a6',
        padding: { x: 6, y: 4 },
        wordWrap: { width: cw - 300, useAdvancedWrap: true },
      },
    );
    this.add([fb, quote]);
    const bottom = this.growTo(Math.max(quote.y + quote.height + 24, this.feedbackTop + 102));

    if (autoContinue) {
      await wait(this.scene, 900);
      return;
    }
    await new Promise<void>((resolve) => {
      this.continueButton = new Button(this.scene, cw / 2 - 130, bottom - BOTTOM_ROW / 2, {
        width: 200,
        height: 80,
        radius: 40,
        label: 'Continue',
        fontSize: 26,
        fill: 0x2e86de,
        onTap: () => resolve(),
      });
      this.add(this.continueButton);
      this.scene.events.emit('card-continue-ready');
    });
  }

  /**
   * Stretches the card down so its bottom edge is at least at `bottom` (card coordinates), and
   * lifts it so it stays centred on screen. Returns the bottom edge.
   */
  private growTo(bottom: number): number {
    const top = -this.cardH / 2;
    const end = Math.max(this.cardH / 2, bottom);
    const extra = end - this.cardH / 2;
    if (extra <= 0) return end;
    const box = pixelBox(this.scene, UI.panel, 0, (top + end) / 2, this.cardW, end - top);
    this.addAt(box, this.getIndex(this.card));
    this.card.destroy();
    this.card = box;
    const H = this.scene.scale.gameSize.height;
    this.setY(Math.max(H / 2 - extra / 2, 16 - top));
    return end;
  }
}
