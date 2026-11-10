# Bible Quest

A mobile RPG that walks through the Bible starting in Genesis. Each encounter reads a verse or two while the hero runs, then a turn-based battle where answering questions about the verse powers up your attacks.

- Design doc: [docs/DESIGN.md](docs/DESIGN.md)
- Rules for AI agents working on this repo: [CLAUDE.md](CLAUDE.md)

## Getting started

Requires Node 22+, Android Studio (Android SDK + emulator), and Xcode 16+ with CocoaPods for iOS.

```bash
npm install
npm run dev          # browser at http://localhost:5173 (use a phone-landscape viewport)
npm test             # unit tests
npm run test:e2e     # Playwright (first run: npx playwright install chromium webkit)
npm run android      # build + run on Android emulator/device
npm run ios          # build + run on iOS simulator (needs full Xcode)
```

Debug params (dev builds): `?scene=title&seed=42&freeze=1&fast=1`
