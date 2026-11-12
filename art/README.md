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

- `slime-blue` and `slime-lava` (`src/assets/foes/`) are **third-party art**: Slime2 and Slime3 from
  the CraftPix "Free Slime Mobs Pixel Art Top-Down Sprite Pack" (https://craftpix.net), under the
  CraftPix file licence (https://craftpix.net/file-licenses/). The pack itself is not kept here;
  `python3 scripts/art/process_slimes.py <unzipped pack folder>` rebuilds the two sheets from it.
  A foe uses one by setting `"sprite"` in its encounter JSON; they are shown at twice the hero's
  pixel size.
- `demon`, `serpent`, `shade` and `thornbeast` are original, painted by
  `python3 scripts/art/paint_monsters.py --preview` (previews in `art/foe-previews/`). They are not
  used in the game yet.
