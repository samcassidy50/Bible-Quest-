# Bible Quest — instructions for AI agents

Mobile-first (iOS + Android) Bible RPG built with **Phaser 3 + TypeScript + Vite**, packaged with **Capacitor 7**.
The design doc is the source of truth: `docs/DESIGN.md`. Read the relevant section before starting a task.

## Commands

| Task                                    | Command                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| Dev server (phone on LAN can open it)   | `npm run dev`                                           |
| Unit tests / with coverage              | `npm test` / `npm run test:coverage`                    |
| E2E (phone-landscape Chromium + WebKit) | `npm run test:e2e`                                      |
| Lint / typecheck / format               | `npm run lint` / `npm run typecheck` / `npm run format` |
| Validate encounter content              | `npm run validate:content`                              |
| Build web + copy into native projects   | `npm run cap:sync`                                      |
| Run on Android emulator / iOS simulator | `npm run android` / `npm run ios`                       |
| Android debug APK                       | `cd android && ./gradlew assembleDebug`                 |

Before saying a task is done, run: `npm run lint && npm run typecheck && npm run test:coverage && npm run test:e2e`.

## Architecture rules (enforced by ESLint where possible)

- `src/core/` = **pure TypeScript game rules**. No Phaser, no `@capacitor/*`, no imports from `scenes/` or `services/`. Everything in `core/` must be unit-tested (coverage thresholds in `vite.config.ts`).
- `src/scenes/` only render and forward input. No game rules in scenes.
- `src/services/` wrap platform/native features behind small interfaces. Native calls must be guarded with `Capacitor.isNativePlatform()` so the web build and tests still work.
- All randomness goes through `core/rng.ts` (`createRng(seed)`). Never call `Math.random()` in gameplay code.
- Design resolution 1280×720, `Scale.EXPAND`. Lay out from `this.scale.gameSize` and respect safe-area insets (`services/safeArea.ts`). Never hard-code positions near screen edges.
- Landscape only. System bars are hidden natively (Android `MainActivity`, iOS `Info.plist`), never from JS.

## Scripture and content rules (non-negotiable)

- Verse text is a **kid-friendly retelling** in `content/source/retelling/` (one verse per line; see its README). Retell from a public-domain translation open beside you, never from memory: simple words, same meaning, nothing added or left out that changes the passage. Each retold passage is a **draft** until a human reviews it; say so when you commit.
- After changing any retold verse, re-record its narration: `.venv-narration/bin/python scripts/audio/narrate.py` (Bella voice, Kokoro, setup in the script's header). A unit test fails while a verse has no up-to-date clip.
- Encounter files (`content/encounters/<book>/<id>.json`) store a passage reference like `"GEN 1:1-2"`, never verse text. The Zod schema rejects a `verses` field. `src/content/index.ts` resolves the text and validates every rule at startup.
- Run `npm run validate:content` after editing content. It checks the schema, that every `highlight` and orb `word` appears in the verse text, unique ids, and canonical order.
- Every question must be answerable from the verse(s) read in that encounter; its `highlight` must appear word for word in the verse text.
- Foes are personified obstacles, chaos, or temptations, never biblical people.
- AI-drafted questions are **drafts**: say so in the PR so a human reviews them.

## Testing and verification

- New `core/` logic ⇒ new Vitest tests in `tests/unit/`.
- New scene/UI behaviour ⇒ a Playwright test in `tests/e2e/` using the debug params and `window.__TEST__` (`services/testHooks.ts`). Add fields to `TestState` instead of scraping pixels.
- Debug URL params (dev and e2e builds only): `?scene= &encounter= &seed= &autoAnswer=correct|wrong &fast=1 &freeze=1 &fps=1 &specials= &faith= &narration=off &autoCollect=1 &unlockAll=1 &oneShot=1` (`oneShot`: every damaging hit defeats the foe). Parsed in `core/debugParams.ts`.
- Hero animation viewer: `?scene=rig` (tap a clip to play it) or `?scene=rig&clip=slash` (contact sheet of frames). Check new or changed hero clips here before using them in scenes.
- Foe gallery: `?scene=foes` (one passage per screen with its three foes in its backdrop; tap or → for the next, `&encounter=gen-005` to start on one, `&freeze=1` for still screenshots).

## Hero art

- The hero is original pixel art (`src/scenes/hero/HeroSprite.ts`), drafted as strips in ChatGPT and kept in `art/hero-raw/` (see `art/README.md`). `python3 scripts/art/process_hero.py --preview` rebuilds `src/assets/hero/hero.png` and the generated `src/core/anim/heroSheet.ts`; never edit those by hand.
- A girl hero (`art/hero-girl-raw/`, built with `process_hero.py --hero girl`) shares every clip; the player picks on the Choose your hero screen (`?scene=heroSelect`, saved as `settings.hero`), `?hero=girl` forces one in dev.
- Clips are frame sequences in `src/core/anim/heroClips.ts` (frame name + ms). Some clips are placeholders that borrow other frames until their own art arrives (listed at the top of that file).
- Attack clips must have `swing` and `impact` events; the battle plays the whoosh on `swing` and lands damage and the hit sound on `impact`.

## Foe art

- A foe shows sprite art by naming a sheet in `"sprite"` in its encounter JSON (ids in `FOE_SPRITES`, `src/core/content/schema.ts`; layouts in `src/scenes/battle/FoeSprite.ts`). Every sheet has one row per state: idle, attack, hurt, death, facing left.
- Original foes (hissling, serpent, gust, storm-cloud, wave, flood-surge, squall, tempest) are pixel art painted by `python3 scripts/art/paint_foes.py [name…] [--preview]` (engine in `scripts/art/foe_engine.py`, needs Pillow) into `src/assets/foes/<name>.png`; never edit those PNGs by hand. They share one layout (`PAINTED` in `FoeSprite.ts`: 128px cells, 8 columns).
- The slimes (slime-blue, slime-lava) are ChatGPT-drafted sheets in `art/foes-raw/`, cut by `python3 scripts/art/process_drafted_foes.py [--preview]` (it clears the painted checkerboard background and prints the numbers for `FoeSprite.ts`); never edit the PNGs by hand.
- The other sheets are third-party packs cut by `scripts/art/process_foes.py` (credits in `art/README.md`).

## Armor, energy and the angel

- Armor is earned along the map: an encounter's `unlocks` field awards a special (or `ultimate`) on its first win; `ownedArmor()` in `core/progress` derives what the hero owns. The angel (`src/scenes/angel/Angel.ts`, original character) presents it before the win screen.
- Action-button icons and the energy bolt are pixel art painted by `python3 scripts/art/paint_icons.py [--preview]` into `src/assets/items/icons.png` (`src/scenes/icons.ts`); never edit the PNG by hand.
- Reading orbs are energy (+1 each); specials cost energy (`TUNING.energy` in `core/battle/tuning.ts`). Debug: `?specials=` grants armor and the ultimate, `?energy=N` sets starting energy.

## Backgrounds

- Ten original environments (`src/scenes/backdrop/Backdrop.ts`), one per passage: deep, light, shore, garden, grove, wilderness, fields, shipyard, flood (weather `storm` or `clearing`), babel. Each passage picks one with `setting` (and `weather` for flood) in its encounter JSON; a unit test checks no two passages share a backdrop.
- Their layers are pixel art painted by `python3 scripts/art/paint_backdrops.py [env…] [--preview]` (needs Pillow) into `src/assets/backdrops/<env>-<layer>.png` (sky, far, mid, ground, optional landmark). Never edit those PNGs by hand; change the painter and re-run it. It checks that strips tile seamlessly. Default `--res 2` (2 screen px per painted pixel) is the chosen look. Any layer without a PNG is drawn in code instead, and the code effects (mist, rays, rain…) always play on top.
- Text-free viewer: `?scene=backdrops` (tap or → for the next, `&env=garden` to start on one, `&freeze=1` for still screenshots).

## Sound

- All sound effects are synthesized in code (`src/core/audio/synth.ts`, recipes in `sfxRecipes.ts`); no effect audio files. The only audio files are the recorded verse narration in `src/assets/narration/` (generated by `scripts/audio/narrate.py`; never edit by hand).
- Play cues with `sfx.play(name)` from `src/services/sfx.ts`; it records every cue in `window.__TEST__.sounds` for tests.
- Sound board for listening: `?scene=sounds`. Keep wrong-answer feedback gentle (a unit test checks it is quieter than the powered-up cue).
- For UI changes, look at the screenshot yourself (Playwright `outputPath`, or `adb exec-out screencap -p` on the emulator) before claiming it works, and attach screenshots to the PR.

## Android emulator tips

- If the emulator crashes with `bad color buffer handle`, start it with `-gpu swiftshader_indirect`.
- Debug builds allow WebView devtools: `adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.biblequest.app)` then connect Playwright with `chromium.connectOverCDP('http://localhost:9333')`.
- The emulator window on the Mac also accepts clicks. If state changes unexpectedly, check whether someone was clicking in it.

## Workflow

- Commit directly to `main` once all checks pass, then push (solo project, no PRs for now).
- Don't add dependencies without saying why in the PR. Pin to a major version.
- Don't commit generated native output (`ios/App/App/public`, `android/app/src/main/assets/public` are gitignored); do commit native project config changes.
