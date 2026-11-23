import { Capacitor } from '@capacitor/core';
import { estimateNarrationMs } from '../core/scripture/timing';
import { findClip, type ClipManifest } from '../core/audio/narrationClips';
import clipManifest from '../assets/narration/manifest.json';

const CLIP_URLS = import.meta.glob('../assets/narration/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/**
 * Reads Scripture aloud (docs/DESIGN.md §2.1, §3). Implementations:
 *  - NativeNarration: device TTS through @capacitor-community/text-to-speech (iOS/Android apps)
 *  - WebSpeechNarration: browser speechSynthesis (web dev build)
 *  - SilentNarration: no audio, waits the estimated time (tests, narration off)
 *  - RecordedNarration: plays the recorded clip of a verse (scripts/audio/narrate.py) and uses one
 *    of the above for any verse without an up-to-date clip
 */
export interface Narration {
  /** Starts reading; resolves when the voice finishes (or is stopped). `clip` plays a recording. */
  speak(text: string, clip?: VerseClip): Promise<void>;
  stop(): void;
  /** Speech rate passed to the engine (1 = normal). Used for the duration estimate too. */
  readonly rate: number;
}

/** Reading pace for young listeners; slightly slower than default. */
export const NARRATION_RATE = 0.9;

/**
 * Never wait for a voice longer than this (engines can hang): a multiple of the estimate plus a
 * fixed allowance for the engine warming up, so a slow but working voice is never cut off.
 */
const TIMEOUT_FACTOR = 1.6;
const TIMEOUT_EXTRA_MS = 4000;
export function narrationTimeoutMs(text: string, rate: number): number {
  return estimateNarrationMs(text, rate) * TIMEOUT_FACTOR + TIMEOUT_EXTRA_MS;
}

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
      const timer = setTimeout(() => done(), narrationTimeoutMs(text, this.rate));
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
      const timer = setTimeout(() => done(), narrationTimeoutMs(text, this.rate));
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

/** A recorded verse ready to play. */
export interface VerseClip {
  url: string;
  /** Length at normal speed, in ms. */
  ms: number;
}

/** The recorded clip for a verse, if one matches its current text. */
export function verseClip(book: string, ref: string, text: string): VerseClip | undefined {
  const entry = findClip(clipManifest as ClipManifest, book, ref, text);
  const url = entry && CLIP_URLS[`../assets/narration/${entry.file}`];
  return entry && url ? { url, ms: entry.ms } : undefined;
}

/** Plays recorded clips; reads anything without one through `fallback`. */
export class RecordedNarration implements Narration {
  private audio?: HTMLAudioElement;
  private finish?: () => void;

  constructor(
    private readonly fallback: Narration,
    readonly rate = NARRATION_RATE,
  ) {}

  /** Clips are recorded at NARRATION_RATE; other reading speeds play them faster or slower. */
  get playbackRate(): number {
    return this.rate / NARRATION_RATE;
  }

  /** How long a clip takes at the current reading speed. */
  clipMs(clip: VerseClip): number {
    return clip.ms / this.playbackRate;
  }

  speak(text: string, clip?: VerseClip): Promise<void> {
    if (!clip) return this.fallback.speak(text);
    this.stopAudio();
    return new Promise((resolve) => {
      const audio = new Audio(clip.url);
      audio.playbackRate = this.playbackRate;
      this.audio = audio;
      const limit = this.clipMs(clip) * TIMEOUT_FACTOR + TIMEOUT_EXTRA_MS;
      const timer = setTimeout(() => done(), limit);
      const done = () => {
        clearTimeout(timer);
        audio.onended = audio.onerror = null;
        if (this.audio === audio) this.audio = undefined;
        this.finish = undefined;
        resolve();
      };
      this.finish = done;
      audio.onended = done;
      // A clip that can't load or isn't allowed to play is read by the device voice instead.
      const viaFallback = () => {
        if (this.finish !== done) return;
        clearTimeout(timer);
        audio.onended = audio.onerror = null;
        this.finish = undefined;
        void this.fallback.speak(text).then(resolve);
      };
      audio.onerror = viaFallback;
      audio.play().catch(viaFallback);
    });
  }

  stop(): void {
    this.stopAudio();
    this.fallback.stop();
    this.finish?.();
  }

  private stopAudio(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio = undefined;
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
  const voice = Capacitor.isNativePlatform()
    ? new NativeNarration(rate)
    : WebSpeechNarration.available()
      ? new WebSpeechNarration(rate)
      : new SilentNarration(opts.wait, rate);
  return new RecordedNarration(voice, rate);
}
