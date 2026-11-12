# Hero art

`hero-raw/` holds the hero strips as drafted in ChatGPT: one animation per image, frames left to
right, facing right, on a flat magenta (#FF00FF) background. They are AI-drafted source art;
the game only uses the processed sheet.

| File                 | Frames                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| `idle.webp`          | `idle_0`–`idle_3` (breathing loop)                                                 |
| `run.webp`           | `run_0`–`run_5`                                                                    |
| `slash.webp`         | `slash_0`–`slash_5` (ready, anticipation, swing, impact, follow-through, recovery) |
| `slash-powered.webp` | `power_0`–`power_5` (crouch, leap, overhead, strike…)                              |
| `poses.webp`         | (unused idle), `walk`, `thrust`, `hurt`, `victory`                                 |

## Adding or replacing a strip

1. Save the image here and add or edit its entry in `STRIPS` in `scripts/art/process_hero.py`
   (frame names in order, and `rel_scale`: the hero's size in that image relative to `idle.webp`).
2. Run `python3 scripts/art/process_hero.py --preview` (needs Pillow) and check
   `art/hero-preview.png`: every frame should be the same size with its feet on the line.
3. Use the new frames in `src/core/anim/heroClips.ts` and check them at `?scene=rig&clip=<name>`.

Tips for prompts: one animation per request, same chat, re-upload a reference sheet, and ask for
at least 40 px of empty magenta between frames so they never touch.

# Foe art

- These sheets in `src/assets/foes/` are **third-party art** from CraftPix free packs
  (https://craftpix.net), under the CraftPix file licence (https://craftpix.net/file-licenses/):

  | Sheet                        | Pack                                           | Character          |
  | ---------------------------- | ---------------------------------------------- | ------------------ |
  | `slime-blue`, `slime-lava`   | Free Slime Mobs Pixel Art Top-Down Sprite Pack | Slime2, Slime3     |
  | `thorn-plant`, `fire-spirit` | Free Fantasy Enemies Pixel Art Sprite Pack     | Plent, Fire_Spirit |
  | `shadow-wolf`                | Free Werewolf Sprite Sheets Pixel Art          | Black_Werewolf     |
  | `minotaur`                   | Free Minotaur Sprite Sheet Pixel Art Pack      | Minotaur_1         |

  The packs themselves are not kept here; `python3 scripts/art/process_foes.py --help` shows how
  to rebuild the sheets from the unzipped packs. A foe uses one by setting `"sprite"` in its
  encounter JSON. Sizes and frame counts live in `src/scenes/battle/FoeSprite.ts`.

- These sheets are **original**, painted pixel by pixel by
  `python3 scripts/art/paint_foes.py [name…] --preview` (engine in `scripts/art/foe_engine.py`,
  previews in `art/foe-previews/`):

  | Sheet                 | Passage               | Foe                             |
  | --------------------- | --------------------- | ------------------------------- |
  | `hissling`, `serpent` | Gen 3:1–6 (gen-005)   | Hissling, The Serpent (boss)    |
  | `gust`, `storm-cloud` | Gen 6:13–14 (gen-008) | Gust, Storm Cloud (boss)        |
  | `wave`, `flood-surge` | Gen 7:11–12 (gen-009) | Rising Wave, Flood Surge (boss) |
  | `squall`, `tempest`   | Gen 9:12–13 (gen-010) | Squall, Tempest (boss)          |

  Each is a grid of 128px cells, 8 wide, with rows idle, attack, hurt and death (8, 8, 4 and 8
  frames), facing left, the ground line 8px above the bottom of the cell. Shapes are lit round
  primitives quantised to short colour ramps, so change the painter and re-run it rather than
  editing a PNG. `?scene=foes` shows every passage's foes in the game; `art/foe-gallery.jpg` is a
  picture of all of them.

- `demon`, `shade` and `thornbeast` are original too, painted by
  `python3 scripts/art/paint_monsters.py --preview`. They are not used in the game yet.

# Backdrop art

Every passage has its own environment, painted by `python3 scripts/art/paint_backdrops.py`
(previews in `art/backdrop-previews/`): deep, light, shore, garden, grove, wilderness, fields,
shipyard, flood-storm, flood-clearing and babel. See the Backgrounds section of `CLAUDE.md`.
