import { Capacitor } from '@capacitor/core';
import { estimateNarrationMs } from '../core/scripture/timing';

/**
 * Reads Scripture aloud (docs/DESIGN.md §2.1, §3). Implementations:
 *  - NativeNarration: device TTS through @capacitor-community/text-to-speech (iOS/Android apps)
 *  - WebSpeechNarration: browser speechSynthesis (web dev build)
 *  - SilentNarration: no audio, waits the estimated time (tests, narration off)
 * Phase 4 adds pre-generated audio files.
 */
export interface Narration {
  /** Starts reading; resolves when the voice finishes (or is stopped). */
  speak(text: string): Promise<void>;
  stop(): void;
  /** Speech rate passed to the engine (1 = normal). Used for the duration estimate too. */
  readonly rate: number;
}

/** Reading pace for young listeners; slightly slower than default. */
export const NARRATION_RATE = 0.9;

/** Never wait for a voice longer than this multiple of the estimate (engines can hang). */
const TIMEOUT_FACTOR = 1.6;

export class SilentNarration implements Narration {
  private cancel?: () => void;

  /** `wait` lets the caller use scene time so `?fast=1` speeds it up. */
  constructor(
    private readonly wait: (ms: number) => Promise<void>,
    readonly rate = NARRATION_RATE,
  ) {}

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.cancel = resolve;
      void this.wait(estimateNarrationMs(text, this.rate)).then(() => resolve());
    });
  }

  stop(): void {
    this.cancel?.();
  }
}

export class WebSpeechNarration implements Narration {
  constructor(readonly rate = NARRATION_RATE) {}
  private finish?: () => void;

  static available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text: string): Promise<void> {
    window.speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.rate;
      u.lang = 'en-US';
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'));
      if (voice) u.voice = voice;
      const timer = setTimeout(() => done(), estimateNarrationMs(text, this.rate) * TIMEOUT_FACTOR);
      const done = () => {
        clearTimeout(timer);
        this.finish = undefined;
        resolve();
      };
      this.finish = done;
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }

  stop(): void {
    window.speechSynthesis.cancel();
    this.finish?.();
  }
}

export class NativeNarration implements Narration {
  constructor(readonly rate = NARRATION_RATE) {}
  private finish?: () => void;

  async speak(text: string): Promise<void> {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => done(), estimateNarrationMs(text, this.rate) * TIMEOUT_FACTOR);
      const done = () => {
        clearTimeout(timer);
        this.finish = undefined;
        resolve();
      };
      this.finish = done;
      TextToSpeech.speak({ text, lang: 'en-US', rate: this.rate, category: 'playback' }).then(
        done,
        done,
      );
    });
  }

  stop(): void {
    void import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) =>
      TextToSpeech.stop(),
    );
    this.finish?.();
  }
}

export function createNarration(opts: {
  enabled: boolean;
  wait: (ms: number) => Promise<void>;
  /** Reading speed (settings); also sets the silent reading's pace. */
  rate?: number;
}): Narration {
  const rate = opts.rate ?? NARRATION_RATE;
  if (!opts.enabled) return new SilentNarration(opts.wait, rate);
  if (Capacitor.isNativePlatform()) return new NativeNarration(rate);
  if (WebSpeechNarration.available()) return new WebSpeechNarration(rate);
  return new SilentNarration(opts.wait, rate);
}
