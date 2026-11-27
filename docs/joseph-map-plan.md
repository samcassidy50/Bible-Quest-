# Map 2: Joseph in Egypt (plan)

Status (2026-11-27): **built, as drafts for review.** All 44 passages are playable: the map,
the nine environments, the retelling (from the World English Bible) with narration, and the
encounter files. The retelling and the questions are AI drafts that still need a human review.
The built questions follow this plan closely but not word for word (see the encounter files).
Foes use only sprite sheets that are committed (serpent, gust, shadow-wolf, storm-cloud…), not
the newer wisp, hound, bat and slime sheets named below; swap those in once they are committed.

## What it is

- The 44 Arc 4 (Joseph) passages that stayed ticked in the Genesis picker: #118–120, #124–161,
  #166–168. Left out: #121–123 (Judah and Tamar), #162–165 (Jacob's blessings), #169 (Joseph's
  last promise).
- A **second map** with its own parchment and look: Canaan in the top-left corner, the caravan
  road down to Egypt, then the Nile, the palace, the storehouses and Goshen.
- **Unlocks** when the player finishes the main line of Act 1: the Beginnings trail **and** the
  Noah path (wins `gen-027`, which can only be reached after `gen-011`). Babel and Sodom stay
  optional side paths and don't gate it. The Act 1 map stays as it is and stays playable. A gate
  or signpost ("To Egypt") appears past the rainbow at the end of the Noah path (`gen-027`, far
  east on the Act 1 map), and the map screen gets a
  way to switch between maps.
- **One trail** of 44 locations. Joseph's story is one continuous story, so there's no choice of
  path. It's about twice as long as Act 1, so it winds in two bands (top band out, bottom band
  back) instead of one very wide strip.
- Ids are the plan numbers, as now: `gen-118` … `gen-168`.

### Code changes this needs (summary)

1. `core/map/worldMap.ts`: from one map to a list of maps (`id`, size, regions, trail, an unlock
   rule). `nodeStates` / `focusNode` work per map. The Act 1 data doesn't change.
2. `MapScene`: draw whichever map is active, switch between them, and show the new map
   appearing the first time it unlocks.
3. 9 new backdrop environments (below) in `paint_backdrops.py` + `SETTINGS`.
4. Content: retelling of the 44 passages, narration, 44 encounter JSONs.
5. Tests: unit (map unlock, per-map states), e2e (unlock after `gen-027`, open a Joseph
   encounter).

### Armor

All four specials and the ultimate are already earned on the Act 1 trunk. So the Joseph map
gives **blessings (runes) only**, rotating the existing eight as Act 1 does. (Option: save the
belt and helmet for later maps.)

## Environments

9 new environments and 2 reused. Each new one is painted by `paint_backdrops.py` (sky, far, mid,
ground, landmark).

| Setting      | New?  | Look                                                                         | Landmark                   | Used by                          |
| ------------ | ----- | ---------------------------------------------------------------------------- | -------------------------- | -------------------------------- |
| `canaan`     | new   | Jacob's tents on rolling hills, olive trees, sheep, warm afternoon           | Jacob's big tent           | 118, 140, 141, 152               |
| `dothan`     | new   | Wide dry pasture with flocks far off, a lone acacia, hot sky                 | Stone-rimmed dry cistern   | 119                              |
| `caravan`    | new   | Desert trade road at dusk, dunes, a line of camels far off                   | Loaded camel and palm      | 120, 142, 145, 146, 154          |
| `estate`     | new   | Egyptian villa courtyard: painted columns, pool, palms, linen awnings        | Lotus-column doorway       | 124, 125, 143, 144, 147–150      |
| `prison`     | new   | Stone cell block, torches, one shaft of light from a high barred window      | Barred window + light beam | 126–129                          |
| `nile`       | new   | Riverbank with reeds and marsh grass, papyrus boats, pyramids on the horizon | Reed bank                  | 130, 132                         |
| `palace`     | new   | Pharaoh's throne hall: gold and blue columns, banners, a tiled floor         | Throne on steps            | 131, 133–135, 138, 139, 151, 156 |
| `granary`    | new   | Rows of domed grain stores, sacks, carts, a city wall                        | Tall domed storehouse      | 136, 137, 157, 158               |
| `goshen`     | new   | Green delta pasture with canals, flocks, mud-brick farmhouses, soft light    | Family homestead           | 155, 159–161, 166, 168           |
| `wilderness` | reuse | (existing) dusky open land, for Jacob's night at Beersheba                   |                            | 153                              |
| `plain`      | reuse | (existing) Jordan plain, for the mourning at Atad and the burial             |                            | 167                              |

Optional extra: a `famine` weather for `canaan` and `granary` (cracked ground, bleached sky,
empty stores), like `flood` has `storm`/`clearing`. It would show the change from the 7 good years
to the 7 hungry ones (136 plenty → 137, 140, 141, 157 famine).

## Foes

Foes are personified obstacles, never people. This map's foes come from the feelings and troubles
in the story: jealousy, despair, temptation, lies, being forgotten, worry, hunger, guilt, fear,
grief, grudges. They reuse the existing sprite sheets (listed in brackets). Bosses (the last section
of each passage) use `size` 1.3–1.5 and 80 HP, like Act 1. The final boss of the map, in 168, is
**Old Grudge**.

## Map regions

CANAAN (118–119, 140–141, 152–153) · THE ROAD (120, 142, 145–146, 154) · POTIPHAR'S HOUSE
(124–125) · THE PRISON (126–129) · THE NILE (130–136) · THE STOREHOUSES (137–139, 157–158) ·
JOSEPH'S HOUSE (143–144, 147–151) · GOSHEN (155–156, 159–161, 166–168). The trail doubles back to
Canaan when the brothers go home, which suits a two-band map.

---

## Encounters

Format: each section is `verses · Foe [sprite]`, then its questions with their answers. (T/F) marks
true/false questions; the rest are multiple choice, with wrong answers written when the content is
built. Every section has at least two questions, and every question can be answered from the
verses read by that point.

### gen-118 · Joseph's Dreams · GEN 37:1-11 · `canaan` · 🌾

- **§1 · 1-4 · Green Envy** [leaf-wisp]
  - How old was Joseph? → 17
  - What did Israel make for Joseph? → A robe of many colors
  - (T/F) Joseph's brothers spoke kindly to him. → False
- **§2 · 5-8 · Proud Whisper** [wind-wisp]
  - In Joseph's first dream, what were the brothers tying in the field? → Bundles of grain
  - What did the brothers' bundles do? → Bowed down to Joseph's bundle
- **§3 · 9-11 · Jealous Glare** (boss) [shade-wisp]
  - What bowed down in Joseph's second dream? → The sun, moon and eleven stars
  - Who scolded Joseph about the second dream? → His father
  - (T/F) Joseph's father kept thinking about the dream. → True

### gen-119 · Into the Pit · GEN 37:12-24 · `dothan` · 🕳️

- **§1 · 12-17 · Wandering Way** [wind-wisp]
  - Where did Jacob first send Joseph to find his brothers? → Shechem
  - Who found Joseph wandering in a field? → A man
  - Where did Joseph finally find his brothers? → Dothan
- **§2 · 18-20 · Dark Plot** [dusk-hound]
  - What did the brothers call Joseph when they saw him coming? → "This dreamer"
  - What did they plan to say had happened to him? → A wild animal ate him
- **§3 · 21-24 · Hollow Dread** (boss) [shade]
  - Which brother tried to save Joseph's life? → Reuben
  - What did the brothers take off Joseph? → His robe
  - (T/F) The pit had water in it. → False

### gen-120 · Sold to Egypt · GEN 37:25-36 · `caravan` · 🐪

- **§1 · 25-28 · Silver Greed** [slime-lava]
  - What were the traders' camels carrying? → Spices, balm and myrrh
  - Which brother said, "Let's sell him"? → Judah
  - How much silver did they sell Joseph for? → Twenty pieces
- **§2 · 29-32 · Robe of Lies** [storm-wisp]
  - What did Reuben do when he found the pit empty? → Tore his clothes
  - What did the brothers dip Joseph's robe in? → Goat's blood
- **§3 · 33-36 · Weeping Gloom** (boss) [tide-wisp]
  - What did Jacob think had happened to Joseph? → A wild animal ate him
  - (T/F) Jacob let his children comfort him. → False
  - Who bought Joseph in Egypt? → Potiphar, captain of Pharaoh's guard

### gen-124 · God Was with Joseph · GEN 39:1-6 · `estate` · 🏛️

- **§1 · 1-3 · Homesick Ache** [wind-wisp]
  - Who was with Joseph in Egypt? → The Lord
  - What did Potiphar notice? → The Lord made everything Joseph did go well
- **§2 · 4-6 · Heavy Toil** (boss) [minotaur]
  - What did Potiphar put Joseph in charge of? → His whole house
  - Whose house did the Lord bless because of Joseph? → Potiphar's
  - (T/F) After that, Potiphar worried about everything in his house. → False

### gen-125 · Joseph Says No · GEN 39:7-12 · `estate` · 🏃 · ⚠️ grown-up, told gently

Retell as in the picker ("wanted Joseph to do a wrong thing with her"). Questions are only about
Joseph's faithfulness and running away.

- **§1 · 7-9 · Sly Temptation** [hissling]
  - Why did Joseph say no? → His master trusted him with everything
  - Joseph said doing this wrong thing would be a sin against whom? → God
- **§2 · 10-12 · Clinging Lure** (boss) [thorn-plant]
  - How often did she keep asking? → Day after day
  - What did Joseph leave in her hand? → His cloak
  - What did Joseph do then? → Ran outside

### gen-126 · Joseph in Prison · GEN 39:13-23 · `prison` · ⛓️ · ⚠️ grown-up

- **§1 · 13-18 · False Tongue** [storm-wisp]
  - What did she show as "proof"? → Joseph's cloak
  - (T/F) What she told Potiphar was true. → False
- **§2 · 19-20 · Unfair Chains** [spiked-slime]
  - How did Potiphar feel? → Very angry
  - Where did Potiphar put Joseph? → The prison for the king's prisoners
- **§3 · 21-23 · Prison Gloom** (boss) [shade]
  - Who was with Joseph even in prison? → The Lord
  - What did the jailer put Joseph in charge of? → All the prisoners
  - (T/F) The jailer checked everything Joseph did. → False

### gen-127 · Two Dreams in Prison · GEN 40:1-8 · `prison` · 🌙

- **§1 · 1-4 · Night Worry** [night-bat]
  - Which two of Pharaoh's servants made him angry? → The cupbearer and the baker
  - Who was put in charge of them in prison? → Joseph
- **§2 · 5-8 · Gloomy Frown** (boss) [shade-wisp]
  - (T/F) Both men had dreams on the same night. → True
  - How did the two men look in the morning? → Sad
  - Joseph said the meanings of dreams belong to whom? → God

### gen-128 · The Cupbearer's Dream · GEN 40:9-15 · `prison` · 🍇

- **§1 · 9-11 · Tangled Doubt** [leaf-wisp]
  - How many branches were on the vine? → Three
  - What did the cupbearer squeeze the grapes into? → Pharaoh's cup
- **§2 · 12-15 · Fading Hope** (boss) [shade-wisp]
  - What did the three branches mean? → Three days
  - What would Pharaoh do for the cupbearer? → Give him his job back
  - What did Joseph ask the cupbearer to do? → Remember him and tell Pharaoh about him
  - (T/F) Joseph said he had done something to deserve prison. → False

### gen-129 · The Baker's Dream · GEN 40:16-23 · `prison` · 🧺 · ⚠️ grown-up (the baker's death, told plainly, no detail)

- **§1 · 16-19 · Pecking Flock** [night-bat]
  - How many baskets were on the baker's head? → Three
  - What was eating from the top basket? → Birds
  - (T/F) The baker's dream had a happy meaning. → False
- **§2 · 20-23 · Forgetful Fog** (boss) [storm-cloud]
  - What special day was it three days later? → Pharaoh's birthday
  - What did the cupbearer get back? → His job
  - What did the cupbearer do about Joseph? → He forgot him

### gen-130 · Pharaoh's Dreams · GEN 41:1-8 · `nile` · 🐄

- **§1 · 1-4 · Lean Hunger** [dusk-hound]
  - How long after the cupbearer's dream did Pharaoh dream? → Two whole years
  - Where did the seven fat cows come out of? → The Nile
  - What did the thin cows do? → Ate up the fat cows
- **§2 · 5-8 · Troubled Mind** (boss) [storm-wisp]
  - What swallowed the seven full heads of grain? → Seven thin heads
  - How did Pharaoh feel in the morning? → Worried
  - (T/F) Pharaoh's wise men explained the dreams. → False

### gen-131 · Remember Joseph! · GEN 41:9-16 · `palace` · 💭

- **§1 · 9-13 · Dusty Forgetting** [storm-cloud]
  - Who finally remembered Joseph? → The cupbearer
  - What did the cupbearer call Joseph? → A young Hebrew
  - (T/F) Everything happened just as Joseph said. → True
- **§2 · 14-16 · Puffed-Up Pride** (boss) [slime-blue]
  - What did Joseph do before he went to Pharaoh? → Shaved and changed his clothes
  - Who did Joseph say would give Pharaoh the answer? → God

### gen-132 · Seven Fat Cows · GEN 41:17-24 · `nile` · 🌊

- **§1 · 17-21 · Gnawing Want** [spiked-slime]
  - Where was Pharaoh standing in his dream? → On the bank of the Nile
  - (T/F) Pharaoh had seen cows that ugly before. → False
  - How did the thin cows look after eating the fat ones? → Just as thin as before
- **§2 · 22-24 · Dry East Wind** (boss) [gust]
  - How many heads of grain grew on one stalk? → Seven
  - What had dried up the thin heads? → The east wind
  - Who could not explain the dream? → Pharaoh's magicians

### gen-133 · Seven Good Years · GEN 41:25-32 · `palace` · ✨

- **§1 · 25-28 · Puzzling Fog** [storm-cloud]
  - Joseph said Pharaoh's two dreams mean what? → The same thing
  - What was God showing Pharaoh? → What He is about to do
  - What do the seven good cows mean? → Seven years
- **§2 · 29-32 · Coming Famine** (boss) [tempest]
  - What would come after the seven good years? → Seven years of famine
  - (T/F) People would still remember the good years during the famine. → False
  - Why did Pharaoh dream it twice? → God has decided it and will do it soon

### gen-134 · A Wise Plan · GEN 41:33-40 · `palace` · 📜

- **§1 · 33-36 · Careless Waste** [slime-blue]
  - What kind of man did Joseph say should be in charge? → A wise one
  - How much of the food should be stored? → A fifth
  - Why store the food? → For the famine years
- **§2 · 37-40 · Doubting Murmur** (boss) [wind-wisp]
  - What did Pharaoh say was in Joseph? → God's Spirit
  - Who would be greater than Joseph? → Only Pharaoh

### gen-135 · Ruler over Egypt · GEN 41:41-46 · `palace` · 💍

- **§1 · 41-43 · Grasping Pride** [slime-lava]
  - What did Pharaoh put on Joseph's finger? → His ring
  - What did Pharaoh hang around Joseph's neck? → A gold chain
  - What did people shout in front of Joseph's chariot? → "Bow down!"
- **§2 · 44-46 · Dizzy Heights** (boss) [squall]
  - (T/F) Pharaoh gave Joseph a wife. → True
  - How old was Joseph when he began to serve Pharaoh? → 30

### gen-136 · Grain Like the Sand · GEN 41:47-57 · `granary` · 🌾

- **§1 · 47-49 · Greedy Hoarder** [slime-lava]
  - Joseph stored so much grain it was like what? → The sand of the sea
  - Why did they stop counting it? → There was too much
- **§2 · 50-52 · Old Sorrow** [tide-wisp]
  - What were Joseph's sons called? → Manasseh and Ephraim
  - Joseph named Manasseh because God made him forget what? → His troubles
- **§3 · 53-57 · Great Famine** (boss) [tempest]
  - (T/F) The famine came just as Joseph had said. → True
  - Who did Pharaoh tell the hungry people to go to? → Joseph
  - Who came to Egypt to buy grain? → People from every land

### gen-137 · Ten Brothers Go to Egypt · GEN 42:1-8 · `granary` · 🎒

- **§1 · 1-5 · Empty Basket** [spiked-slime]
  - What did Jacob hear there was in Egypt? → Grain
  - How many brothers went to Egypt? → Ten
  - Which brother stayed home? → Benjamin
- **§2 · 6-8 · Stranger's Mask** (boss) [shade-wisp]
  - How did the brothers bow to Joseph? → With their faces to the ground
  - (T/F) The brothers knew who Joseph was. → False
  - How did Joseph speak to them? → Harshly, like a stranger

### gen-138 · "You Are Spies!" · GEN 42:9-17 · `palace` · 🕵️

- **§1 · 9-13 · Sharp Suspicion** [night-bat]
  - What did Joseph remember when he saw his brothers? → His dreams
  - What did Joseph say the brothers were? → Spies
  - How many brothers did they say there were in all? → Twelve
- **§2 · 14-17 · Locked Doubt** (boss) [minotaur]
  - How did Joseph say they must prove they were honest? → Bring their youngest brother
  - How long did Joseph keep them in prison? → Three days

### gen-139 · Simeon Stays Behind · GEN 42:18-28 · `palace` · 🔗

- **§1 · 18-20 · Tight Grip** [spiked-slime]
  - Joseph said, "I fear ___." → God
  - How many brothers had to stay behind? → One
- **§2 · 21-24 · Old Guilt** [shade]
  - What did the brothers think they were being punished for? → What they did to Joseph
  - (T/F) The brothers knew Joseph understood what they said. → False
  - Which brother did Joseph keep? → Simeon
- **§3 · 25-28 · Trembling Fear** (boss) [night-bat]
  - What did Joseph secretly put back in their sacks? → Their money
  - How did the brothers feel when they found it? → Afraid; they trembled

### gen-140 · Jacob's Sorrow · GEN 42:29-38 · `canaan` · 💧

- **§1 · 29-34 · Heavy News** [storm-cloud]
  - Who did the brothers tell everything to? → Jacob, their father
  - (T/F) They told Jacob the man called them spies. → True
- **§2 · 35-38 · Clinging Grief** (boss) [tide-wisp]
  - What did they find in every sack? → Their money
  - Who promised to bring Benjamin back safely? → Reuben
  - (T/F) Jacob agreed to let Benjamin go. → False

### gen-141 · Judah's Promise · GEN 43:1-10 · `canaan` · 🤝

- **§1 · 1-5 · Hungry Ache** [dusk-hound]
  - What had run out? → The grain
  - The man said they couldn't see him unless who came? → Their youngest brother
- **§2 · 6-10 · Wavering Heart** (boss) [wind-wisp]
  - Who promised to keep Benjamin safe? → Judah
  - Judah said he would take what if Benjamin didn't come home? → The blame forever
  - (T/F) Judah said they could have gone and come back twice by now. → True

### gen-142 · Back to Egypt · GEN 43:11-18 · `caravan` · 🍯

- **§1 · 11-14 · Anxious Road** [gust]
  - Name a gift Jacob sent. → Honey (balm, spices, nuts)
  - How much money did Jacob tell them to take? → Double
  - Jacob prayed God Almighty would make the man what? → Kind to them
- **§2 · 15-18 · Dread of Chains** (boss) [shadow-wolf]
  - Where did Joseph send the brothers to eat? → His own house
  - Why were the brothers afraid? → Because of the money in their sacks
  - (T/F) The brothers thought they were going to a happy feast. → False

### gen-143 · Don't Be Afraid · GEN 43:19-25 · `estate` · 🕊️

- **§1 · 19-22 · Nervous Stammer** [night-bat]
  - Who did the brothers talk to at the door? → The servant in charge of Joseph's house
  - What had they brought back? → The money from their sacks
- **§2 · 23-25 · Fleeing Fear** (boss) [shade-wisp]
  - What did the servant say to them? → "Don't be afraid"
  - Who did the servant bring out to them? → Simeon
  - What did he give them for their feet? → Water to wash them

### gen-144 · A Feast with Joseph · GEN 43:26-34 · `estate` · 🍞

- **§1 · 26-29 · Holding Back** [spiked-slime]
  - Who did Joseph ask about? → Their old father
  - What did Joseph say to Benjamin? → "God be kind to you, my son"
- **§2 · 30-34 · Hidden Tears** (boss) [tide-wisp]
  - Where did Joseph go to cry? → Into his own room
  - How were the brothers seated? → From oldest to youngest
  - How much more food did Benjamin get? → Five times as much

### gen-145 · The Silver Cup · GEN 44:1-10 · `caravan` · 🏆

- **§1 · 1-5 · Gleaming Trap** [slime-lava]
  - What did Joseph put in the youngest brother's sack? → His silver cup
  - (T/F) Their money was put back in their sacks too. → True
  - When did the brothers leave? → In the morning
- **§2 · 6-10 · Rash Vow** (boss) [storm-wisp]
  - What did the servant say the brothers had done? → Stolen his master's cup
  - The brothers said whoever had the cup should what? → Die
  - (T/F) The servant said only the one with the cup would be a slave. → True

### gen-146 · Found in Benjamin's Sack · GEN 44:11-17 · `caravan` · 🎒

- **§1 · 11-13 · Sinking Dread** [shade]
  - In what order did the servant search the sacks? → Oldest to youngest
  - Whose sack had the cup? → Benjamin's
  - What did the brothers do? → Tore their clothes and went back
- **§2 · 14-17 · Crushing Blame** (boss) [minotaur]
  - Which brother spoke for them all? → Judah
  - What did Joseph say would happen? → Only the one with the cup would be his slave

### gen-147 · Judah Speaks Up · GEN 44:18-26 · `estate` · 🗣️

- **§1 · 18-22 · Choking Silence** [shade-wisp]
  - What did Judah ask Joseph not to be? → Angry
  - What did they tell Joseph about their youngest brother? → Their father loves him very much
- **§2 · 23-26 · Wall of Fear** (boss) [minotaur]
  - Joseph had said they couldn't see him again unless who came? → Their youngest brother
  - (T/F) Their father wanted Benjamin to go. → False

### gen-148 · "Take Me Instead" · GEN 44:27-34 · `estate` · ❤️

- **§1 · 27-31 · Father's Sorrow** [tide-wisp]
  - What did Jacob think had happened to his lost son? → He was torn to pieces
  - What would happen to Jacob if they came home without Benjamin? → He would die of sadness
- **§2 · 32-34 · Selfish Pull** (boss) [shadow-wolf]
  - What did Judah offer to do? → Stay as a slave instead of the boy
  - Why? → He couldn't bear to see his father's sadness
  - Who had Judah promised to keep Benjamin safe for? → His father

### gen-149 · "I Am Joseph!" · GEN 45:1-8 · `estate` · 😭

- **§1 · 1-3 · Bursting Tears** [tide-wisp]
  - (T/F) Joseph cried so loudly the Egyptians heard him. → True
  - What did Joseph ask first? → "Is my father still alive?"
  - How did the brothers feel? → Too shocked to speak
- **§2 · 4-8 · Shame's Shadow** (boss) [shade]
  - Why did God send Joseph to Egypt ahead of them? → To save lives
  - How many more years of famine were coming? → Five
  - Joseph said it was not the brothers who sent him there, but who? → God

### gen-150 · "Bring My Father Here" · GEN 45:9-15 · `estate` · 🏡

- **§1 · 9-13 · Rushing Worry** [wind-wisp]
  - Who did Joseph tell them to hurry and bring? → Their father
  - Where would the family live? → Goshen
  - Why did they need to come? → There were five more years of famine
- **§2 · 14-15 · Cold Distance** (boss) [storm-wisp]
  - Who did Joseph hug first? → Benjamin
  - (T/F) Afterward, the brothers talked with Joseph. → True

### gen-151 · Carts from Pharaoh · GEN 45:16-24 · `palace` · 🛒

- **§1 · 16-20 · Stingy Grip** [slime-lava]
  - How did Pharaoh feel about the news? → Glad
  - What did Pharaoh promise the family? → The best of the land
  - What did he send for the children and wives? → Carts
- **§2 · 21-24 · Quarrel Spark** (boss) [flame-wisp]
  - What did Benjamin get? → Silver and five sets of clothes
  - What did Joseph send his father on donkeys? → Good things from Egypt
  - What did Joseph say as they left? → "Don't quarrel on the way!"

### gen-152 · Joseph Is Alive! · GEN 45:25-28 · `canaan` · 🎉

- **§1 · 25-26 · Numb Disbelief** [storm-cloud]
  - What did the brothers tell Jacob? → Joseph is alive
  - (T/F) Jacob believed them right away. → False
- **§2 · 27-28 · Faint Heart** (boss) [shade-wisp]
  - What did Jacob see that made his spirit come back to life? → The carts Joseph sent
  - What did Jacob decide? → To go and see Joseph before he died

### gen-153 · Don't Be Afraid to Go · GEN 46:1-7 · `wilderness` · ⭐

- **§1 · 1-4 · Night Fear** [night-bat]
  - Where did Jacob offer sacrifices? → Beersheba
  - When did God speak to Jacob? → At night
  - God said He would make Jacob's family into what? → A great nation
- **§2 · 5-7 · Clinging Home** (boss) [thorn-plant]
  - How did the family travel to Egypt? → In Pharaoh's carts
  - (T/F) Jacob left all his animals behind. → False

### gen-154 · Seventy in All · GEN 46:8-27 · `caravan` · 👨‍👩‍👧‍👦 · 📜 family list (kept; 20 verses)

Keep every name in the retelling. Questions ask about the four mothers' families and the total,
not hard names.

- **§1 · 8-15 · Long Road** [gust]
  - Who was Jacob's oldest son? → Reuben
  - Whose sons and grandsons are listed first? → Leah's
- **§2 · 16-18 · Weary Feet** [dusk-hound]
  - Gad's and which brother's families came from Zilpah? → Asher's
  - (T/F) Zilpah was Leah's servant. → True
- **§3 · 19-22 · Dusty Gust** [squall]
  - What were Rachel's two sons called? → Joseph and Benjamin
  - Where were Manasseh and Ephraim born? → In Egypt
- **§4 · 23-27 · Desert Storm** (boss) [tempest]
  - Bilhah's sons were Dan and who? → Naphtali
  - How many of Jacob's family were in Egypt in all? → Seventy

### gen-155 · Together Again · GEN 46:28-34 · `goshen` · 🤗

- **§1 · 28-30 · Lonely Years** [tide-wisp]
  - Who did Jacob send ahead to Joseph? → Judah
  - What did Joseph ride to meet his father? → His chariot
  - Why did Jacob say he could die in peace? → He had seen Joseph alive
- **§2 · 31-34 · Unwelcome Stare** (boss) [dusk-hound]
  - What should the brothers tell Pharaoh their work was? → Keeping animals
  - Where would that let them live? → Goshen
  - (T/F) The Egyptians liked shepherds. → False

### gen-156 · Jacob Blesses Pharaoh · GEN 47:1-12 · `palace` · 👑

- **§1 · 1-6 · Shy Nerves** [wind-wisp]
  - How many brothers did Joseph bring to Pharaoh? → Five
  - Where did Pharaoh tell them to live? → Goshen
  - (T/F) Pharaoh asked them to look after his animals too. → True
- **§2 · 7-10 · Weary Years** [storm-cloud]
  - Who blessed Pharaoh? → Jacob
  - How old was Jacob? → 130
- **§3 · 11-12 · Gnawing Famine** (boss) [tempest]
  - What did Joseph give his family? → Land and food
  - (T/F) Joseph gave them some of the best land in Egypt. → True

### gen-157 · The Hungry Years · GEN 47:13-19 · `granary` · 🥣

- **§1 · 13-15 · Empty Purse** [slime-blue]
  - (T/F) There was food everywhere. → False
  - What did people pay Joseph with first? → Money
- **§2 · 16-19 · Hollow Hunger** (boss) [dusk-hound]
  - What did they trade when the money ran out? → Their animals
  - What did they offer at the end? → Themselves and their land
  - What did they ask Joseph to give them besides food? → Seed

### gen-158 · A Fifth for Pharaoh · GEN 47:20-26 · `granary` · 🌱

- **§1 · 20-22 · Barren Field** [thorn-plant]
  - Who did Joseph buy the land for? → Pharaoh
  - Whose land was not bought? → The priests'
- **§2 · 23-26 · Grumbling Doubt** (boss) [spiked-slime]
  - What did Joseph give the people to plant? → Seed
  - How much of the harvest went to Pharaoh? → A fifth
  - What did the people say to Joseph? → "You have saved our lives"

### gen-159 · Bury Me with My Fathers · GEN 47:27-31 · `goshen` · 🙏

- **§1 · 27-28 · Fading Days** [shade-wisp]
  - (T/F) Israel's family grew very large in Goshen. → True
  - How many years did Jacob live in Egypt? → 17
- **§2 · 29-31 · Far-from-Home** (boss) [wind-wisp]
  - What did Jacob ask Joseph to promise? → Not to bury him in Egypt
  - Where did Jacob want to be buried? → Where his fathers were buried
  - What did Israel do after Joseph promised? → Bowed in worship

### gen-160 · Jacob Meets Joseph's Sons · GEN 48:1-12 · `goshen` · 👦

- **§1 · 1-4 · Sickbed Gloom** [shade]
  - Why did Joseph go to see his father? → He was sick
  - Which two sons did Joseph bring? → Manasseh and Ephraim
  - Who did Jacob say had blessed him and promised the land? → God Almighty
- **§2 · 5-7 · Old Ache** [tide-wisp]
  - Jacob said Joseph's two sons would be counted as whose? → His own
  - (T/F) Jacob said they'd be like Reuben and Simeon to him. → True
- **§3 · 8-12 · Dim Eyes** (boss) [storm-cloud]
  - Why could Jacob hardly see? → He was very old
  - What had Jacob never thought he'd see again? → Joseph's face
  - (T/F) God let Jacob see Joseph's children too. → True

### gen-161 · Crossed Hands · GEN 48:13-22 · `goshen` · ✋

- **§1 · 13-16 · Muddled Order** [leaf-wisp]
  - Who did Jacob put his right hand on? → Ephraim, the younger
  - Which boy was older? → Manasseh
  - Jacob said God had been his what all his life? → Shepherd
- **§2 · 17-22 · Stubborn Pride** (boss) [minotaur]
  - Why did Joseph try to move his father's hand? → Manasseh was the oldest
  - What did Jacob say? → "I know, my son"
  - Which boy would be greater? → The younger one
  - (T/F) Jacob said God would bring them back to their fathers' land. → True

### gen-166 · Joseph Mourns His Father · GEN 50:1-6 · `goshen` · 🕯️

- **§1 · 1-3 · Deep Grief** [tide-wisp]
  - What did Joseph do when his father died? → Hugged him, cried and kissed him
  - How many days did Egypt mourn for Jacob? → Seventy
- **§2 · 4-6 · Broken Promise** (boss) [shade]
  - Where had Jacob asked to be buried? → In Canaan
  - What did Pharaoh say? → "Go and bury your father, as you promised"

### gen-167 · The Journey Home · GEN 50:7-14 · `plain` · 🐎

- **§1 · 7-11 · Mourning Wind** [gust]
  - Who went with Joseph? → Pharaoh's officials, chariots and all Jacob's family
  - Who stayed behind in Goshen? → The little children and the animals
  - How many days did they mourn by the Jordan? → Seven
- **§2 · 12-14 · Long Shadow** (boss) [shadow-wolf]
  - Where did the sons bury Jacob? → In the cave of Machpelah
  - (T/F) Afterward they all went back to Egypt. → True

### gen-168 · God Meant It for Good · GEN 50:15-21 · `goshen` · 🌅 · final boss

- **§1 · 15-17 · Old Fear** [night-bat]
  - Why were the brothers afraid after their father died? → Joseph might pay them back
  - What did they ask Joseph to do? → Forgive them
  - What did Joseph do when he got their message? → He cried
- **§2 · 18-21 · Old Grudge** (final boss, size 1.6) [shadow-wolf or a new painted foe]
  - What did the brothers say when they bowed? → "We are your servants"
  - You meant to hurt me, but God meant it for what? → Good
  - Why? → To save many lives
  - What did Joseph promise them? → To take care of them and their children

---

## Totals

44 encounters, 98 sections (so 98 foes) (all reusing current sprite sheets; an optional new
painted final boss), 255 draft questions, 9 new environments. That is 381 verses to retell and narrate: all of Gen 37, 39:1–48:22 and 50:1–21.

## Suggested build order

1. Multi-map support + unlock after `gen-027` (end of Noah) + map switching (with the Joseph map's first 3
   locations as placeholders).
2. Environments in story order: `canaan`, `dothan`, `caravan`, `estate`, `prison`, `nile`,
   `palace`, `granary`, `goshen`.
3. Content in batches of about 6 passages along the trail (retell → narrate → JSON → validate),
   each batch committed as a draft for review.
