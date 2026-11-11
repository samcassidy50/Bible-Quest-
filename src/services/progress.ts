import { Capacitor } from '@capacitor/core';
import { loadSave, newSave, type SaveData } from '../core/progress/progress';
import { sfx } from './sfx';
import { updateTestState } from './testHooks';

const KEY = 'bible-quest-save';

/** Where saves live: native key-value storage on phones, localStorage on the web. */
interface Storage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

const nativeStorage: Storage = {
  async get() {
    const { Preferences } = await import('@capacitor/preferences');
    return (await Preferences.get({ key: KEY })).value;
  },
  async set(value) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: KEY, value });
  },
};

const webStorage: Storage = {
  async get() {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null; // private mode or blocked storage: play without saving
    }
  },
  async set(value) {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
  },
};

/**
 * The player's save (docs/DESIGN.md §2.5). Load once at startup, read `progress.save`, and change
 * it only through `progress.update(fn)` with the pure helpers in core/progress — every update is
 * written to storage straight away.
 */
class ProgressStore {
  private data: SaveData = newSave();
  private storage: Storage = Capacitor.isNativePlatform() ? nativeStorage : webStorage;
  private writing: Promise<void> = Promise.resolve();

  get save(): SaveData {
    return this.data;
  }

  async load(): Promise<void> {
    this.data = loadSave(await this.storage.get());
    this.applySideEffects();
  }

  update(fn: (save: SaveData) => SaveData): SaveData {
    this.data = fn(this.data);
    this.applySideEffects();
    const json = JSON.stringify(this.data);
    this.writing = this.writing.then(() => this.storage.set(json));
    return this.data;
  }

  /** Resolves when every pending write has finished (tests). */
  flushed(): Promise<void> {
    return this.writing;
  }

  private applySideEffects(): void {
    sfx.setMuted(!this.data.settings.sound);
    updateTestState({ save: this.data });
  }
}

export const progress = new ProgressStore();
