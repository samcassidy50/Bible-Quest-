import Phaser from 'phaser';
import { pixelBox, UI } from '../ui/pixelUi';
import type { ActionId } from '../../core/battle/types';
import type { Question } from '../../core/content/types';
import { Button } from '../ui/Button';
import { FONT_READ, FONT_TITLE, FONT_UI, tweenAsync, wait } from '../util';
import { ACTION_INFO, COLOR } from './actionInfo';

const ANSWER_FILL = 0x3c3366;

/**
 * Question card shown before every hero action except the ultimate (docs/DESIGN.md §2.2).
 * The container is centred on the screen; a full-screen backdrop blocks taps on the battle.
 */
export class QuestionCard extends Phaser.GameObjects.Container {
  readonly answerButtons: Button[] = [];
  continueButton?: Button;
  private readonly cardW: number;
  private readonly cardH: number;
  private answered = false;
  private timerBar?: Phaser.GameObjects.Graphics;
  private timerTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    private readonly question: Question,
    action: ActionId,
    reference: string,
    private readonly onAnswer: (index: number) => void,
  ) {
    const { width: W, height: H } = scene.scale.gameSize;
    super(scene, W / 2, H / 2);
    this.cardW = Math.min(W - 48, 1000);
    this.cardH = Math.min(H - 32, 640);
    const cw = this.cardW;
    const ch = this.cardH;
    const left = -cw / 2 + 36;

    const backdrop = scene.add.rectangle(0, 0, W * 2, H * 2, 0x05030d, 0.6).setInteractive();
    const card = pixelBox(scene, UI.panel, 0, 0, cw, ch);

    const info = ACTION_INFO[action];
    const header = scene.add.text(left, -ch / 2 + 28, `${info.icon}  ${info.name}`, {
      fontFamily: FONT_UI,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#8a5a00',
    });
    const hint = scene.add
      .text(cw / 2 - 36, -ch / 2 + 30, `Answer right to power it up! · ${reference}`, {
        fontFamily: FONT_UI,
        fontSize: '18px',
        color: '#6b5d84',
      })
      .setOrigin(1, 0);
    const prompt = scene.add.text(left, -ch / 2 + 78, question.prompt, {
      fontFamily: FONT_READ,
      fontSize: '34px',
      fontStyle: 'bold',
      color: COLOR.ink,
      wordWrap: { width: cw - 72, useAdvancedWrap: true },
      lineSpacing: 6,
    });

    this.add([backdrop, card, header, hint, prompt]);

    // Answers: 2 columns, large thumb-sized buttons in the lower half of the card.
    const cols = 2;
    const gap = 18;
    const btnW = (cw - 72 - gap) / cols;
    const btnH = 88;
    const rows = Math.ceil(question.choices.length / cols);
    const top = -ch / 2 + 210;
    question.choices.forEach((choice, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + btnW / 2 + col * (btnW + gap);
      const y = top + btnH / 2 + row * (btnH + gap) + (rows === 1 ? 40 : 0);
      const b = new Button(scene, x, y, {
        width: btnW,
        height: btnH,
        label: choice,
        fontSize: 26,
        fontFamily: FONT_READ,
        fill: ANSWER_FILL,
        onTap: () => this.choose(i),
      });
      this.answerButtons.push(b);
      this.add(b);
    });

    this.setDepth(100);
    scene.add.existing(this);
  }

  async slideIn(): Promise<void> {
    const targetY = this.y;
    this.setY(targetY + this.scene.scale.gameSize.height).setAlpha(1);
    await tweenAsync(this.scene, { targets: this, y: targetY, duration: 280, ease: 'Back.out' });
  }

  async slideOut(): Promise<void> {
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

  /** Programmatic answer (used by ?autoAnswer and the timer; -1 = time ran out). */
  choose(index: number): void {
    if (this.answered) return;
    this.answered = true;
    this.timerTween?.stop();
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
    const ch = this.cardH;
    const left = -cw / 2 + 36;
    const fbY = ch / 2 - 150;

    if (correct) {
      const t = this.scene.add
        .text(0, fbY + 40, '✨ Powered up! ✨', {
          fontFamily: FONT_TITLE,
          fontSize: '44px',
          fontStyle: 'bold',
          color: '#b07d00',
        })
        .setOrigin(0.5)
        .setScale(0.5);
      this.add(t);
      await tweenAsync(this.scene, { targets: t, scale: 1, duration: 260, ease: 'Back.out' });
      await wait(this.scene, 650);
      return;
    }

    const answer = q.choices[q.answerIndex];
    const lead = chosen < 0 ? '⏰ Time’s up!' : 'Not quite.';
    const fb = this.scene.add.text(left, fbY, `${lead} The answer is “${answer}”.`, {
      fontFamily: FONT_UI,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#a93226',
      wordWrap: { width: cw - 300, useAdvancedWrap: true },
    });
    const quote = this.scene.add.text(left, fbY + 40, `The verse says: “…${q.highlight}…”`, {
      fontFamily: FONT_TITLE,
      fontSize: '24px',
      fontStyle: 'italic',
      color: COLOR.ink,
      backgroundColor: '#fbe8a6',
      padding: { x: 6, y: 4 },
      wordWrap: { width: cw - 300, useAdvancedWrap: true },
    });
    this.add([fb, quote]);

    if (autoContinue) {
      await wait(this.scene, 900);
      return;
    }
    await new Promise<void>((resolve) => {
      this.continueButton = new Button(this.scene, cw / 2 - 130, ch / 2 - 70, {
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
}
