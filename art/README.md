# Hero art

`hero-raw/` holds the hero strips as drafted in ChatGPT: one animation per image, frames left to
right, facing right, on a flat magenta (#FF00FF) background. They are AI-drafted source art;
the game only uses the processed sheet.

| File                 | Frames                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| `idle.webp`          | `idle_0`–`idle_3` (breathing loop)                                                 |
| `run.webp`           | `run_0`–`run_7`                                                                    |
| `slash.webp`         | `slash_0`–`slash_5` (ready, anticipation, swing, impact, follow-through, recovery) |
| `slash-powered.webp` | `power_0`–`power_5` (crouch, leap, overhead, strike…)                              |
| `poses.webp`         | (unused idle), `walk`, `thrust`, (old hurt and victory poses, unused)              |
| `victory.webp`       | `win_0`–`win_4` (relief, crouch, jump, land, pose; puff and landing lines erased)  |
| `block.webp`         | `block_0`–`block_3` (brace, guard, take the hit, recover; impact marks erased)     |
| `cast.webp`          | `cast_0`–`cast_4` (ready, bow, raise, power hop, point forward)                    |
| `down.webp`          | `down_0`–`down_4` (stagger, sway, kneel, slump, rest)                              |
| `hurt.webp`          | `hurt_0`–`hurt_2` (flinch, recoil, shake it off)                                   |

## Adding or replacing a strip

1. Save the image here and add or edit its entry in `STRIPS` in `scripts/art/process_hero.py`
   (frame names in order, and `rel_scale`: the hero's size in that image relative to `idle.webp`).
2. Run `python3 scripts/art/process_hero.py --preview` (needs Pillow) and check
   `art/hero-preview.png`: every frame should be the same size with its feet on the line.
3. Use the new frames in `src/core/anim/heroClips.ts` and check them at `?scene=rig&clip=<name>`.

Tips for prompts: one animation per request, same chat, re-upload a reference sheet, and ask for
at least 40 px of empty magenta between frames so they never touch.

# Girl hero art

`hero-girl-raw/` holds the girl hero's strips (ChatGPT-drafted, same format as the boy's).
`python3 scripts/art/process_hero.py --hero girl --preview` builds `src/assets/hero/hero-girl.png`
and `src/core/anim/heroGirlSheet.ts` with exactly the boy's frames in the boy's order, so every
clip plays on either hero. She has every strip the boy has; a strip she lacks can borrow her
other frames for a while (`GIRL_FALLBACKS` in the script) until it is added to `GIRL_STRIPS`.
Her `poses.png` has just two frames, `walk` and `thrust`.
Each strip's `rel_scale` there is her size relative to `idle.png` (check `art/hero-girl-preview.png`).

# Angel art

`angel-raw/` holds the angel strips drafted in ChatGPT, in the same format as the hero strips
(frames left to right, facing right, flat magenta background). `python3 scripts/art/process_angel.py
--preview` cuts them into `src/assets/angel/angel.png` and the generated
`src/scenes/angel/angelSheet.ts` (cell size, robe-hem origin, where the hands are, animation
ranges); never edit those by hand. Each frame is lined up on its robe hem, and the game adds the
hover bob. Check `art/angel-preview.png`: the red dot marks the hands, where the gift sits.

| File         | Frames                                     |
| ------------ | ------------------------------------------ |
| `hover.webp` | 6-frame wing-flap loop (`hover` animation) |

To add a strip (descend, present, depart…), save it here, add it to `STRIPS` in the script and
re-run it.

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

# UI art

- `src/assets/ui/` (parchment panel, blank green buttons, stars) is **third-party art** from the
  CraftPix free pack "Free Basic Pixel Art UI for RPG" (https://craftpix.net), under the CraftPix
  file licence (https://craftpix.net/file-licenses/). Only plain pieces are used, never the
  pack's built-in words. The pack is not kept here; rebuild with
  `python3 scripts/art/process_ui.py --pack <unzipped pack> --preview` (tiles the frame edges so
  they stay crisp; preview in `art/ui-preview.png`). Used by the win/lose screen
  (`ResultPanel.ts`) via `src/scenes/ui/pixelUi.ts`.

# Item art

- `src/assets/items/item-art.png` (large sword, shield, breastplate and sandals pictures, used on
  the Equipment screen) is **original** art drafted in ChatGPT as one sheet,
  `art/items-raw/armor-of-god.webp` (flat magenta background, about 12 screen px per art pixel).
  `python3 scripts/art/process_item_art.py --preview` measures the pixel grid, reads one colour
  per art pixel, keys out the magenta and snaps colours to one palette (preview in
  `art/item-art-preview.png`). Never edit the PNG by hand; redraw the source and re-run it. Small
  UI (action buttons) keeps the painted 20 px icons from `paint_icons.py`.

# Blessing art

- `src/assets/items/runes.png` (the blessing gems) is **third-party art** from the CraftPix free pack
  "Top-Down Crystals Pixel Art" (https://craftpix.net), under the CraftPix file licence
  (https://craftpix.net/file-licenses/). One crystal per item, recoloured to its gem: Red (ruby,
  sword), Blue (sapphire, shield), Green (emerald, breastplate), Yellow (topaz, sandals). The pack
  is not kept here; rebuild with
  `python3 scripts/art/process_runes.py --pack <unzipped pack> --preview` (preview in
  `art/runes-preview.png`). Drawn by `src/scenes/runeIcon.ts`, which adds each blessing's white mark
  on a small badge in code.

# Backdrop art

Every passage has its own environment, painted by `python3 scripts/art/paint_backdrops.py`
(previews in `art/backdrop-previews/`): deep, light, shore, wilds, garden, grove, wilderness,
fields, shipyard, flood-storm, flood-clearing, babel, sodom, plain and brimstone. See the Backgrounds section of `CLAUDE.md`.
