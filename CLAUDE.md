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

- **Never type, paraphrase, or "fix" Bible text from memory.** Verse text comes only from the vendored public-domain WEB source in `content/source/web/` (see its README for provenance and how to add a book).
- Encounter files (`content/encounters/<book>/<id>.json`) store a passage reference like `"GEN 1:1-2"`, never verse text. The Zod schema rejects a `verses` field. `src/content/index.ts` resolves the text and validates every rule at startup.
- Run `npm run validate:content` after editing content. It checks the schema, that every `highlight` and orb `word` appears in the verse text, unique ids, and canonical order.
- Every question must be answerable from the verse(s) read in that encounter; its `highlight` must appear word for word in the verse text.
- Foes are personified obstacles, chaos, or temptations, never biblical people.
- AI-drafted questions are **drafts**: say so in the PR so a human reviews them.

## Testing and verification

- New `core/` logic ⇒ new Vitest tests in `tests/unit/`.
- New scene/UI behaviour ⇒ a Playwright test in `tests/e2e/` using the debug params and `window.__TEST__` (`services/testHooks.ts`). Add fields to `TestState` instead of scraping pixels.
- Debug URL params (dev and e2e builds only): `?scene= &encounter= &seed= &autoAnswer=correct|wrong &fast=1 &freeze=1 &fps=1`. Parsed in `core/debugParams.ts`.
- For UI changes, look at the screenshot yourself (Playwright `outputPath`, or `adb exec-out screencap -p` on the emulator) before claiming it works, and attach screenshots to the PR.

## Android emulator tips

- If the emulator crashes with `bad color buffer handle`, start it with `-gpu swiftshader_indirect`.
- Debug builds allow WebView devtools: `adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.biblequest.app)` then connect Playwright with `chromium.connectOverCDP('http://localhost:9333')`.
- The emulator window on the Mac also accepts clicks. If state changes unexpectedly, check whether someone was clicking in it.

## Workflow

- Commit directly to `main` once all checks pass, then push (solo project, no PRs for now).
- Don't add dependencies without saying why in the PR. Pin to a major version.
- Don't commit generated native output (`ios/App/App/public`, `android/app/src/main/assets/public` are gitignored); do commit native project config changes.
