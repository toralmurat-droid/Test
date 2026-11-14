# Songweaver DI-1 to DI-5: content text

Player-facing text for the song gauge, books, songs, the evolving lute, Wren the lute-maker and materials.
Written for pasting into the tables later (`shared/` descs, `client/src/songTables.ts`). English, plain, no balance
numbers (they will change). Ids are the ones in the Interface contract of `docs/songweaver-di-plan.md`. Player text
says "note", never "pitch", and "key" for a mode. `{x}` marks a value the code fills in.

## 1. Verse and Chorus

### Help text (skills page "?", Songbook reader)
- Title: "Verses and Choruses"
- Verse: "Verse: any skill that strikes once, your basic attack included. Play as many as you like."
- Chorus: "Chorus: a song that sings on around you. You can keep only one Chorus going. Playing another ends the first."
- Short form (tooltip tag): `Verse` / `Chorus` / `Key change` (Modulate).
- Combined, one line: "Verses are your attacks, basic hits too. Choruses are songs that play on around you, one at a time."
- Under-the-feet hint, first Chorus: "The ring under your feet is your Chorus. Notes you play ring out above it."

### Updated descs (every Songweaver desc that says "song")
Only the wording changes. Replace "Song:" with "Chorus:" and "song" with "Chorus" where it means the aura.
- `sg_ballad` Hearth Ballad: "Chorus: the old village tune. For 30s it mends you and your party close by with every beat, and it follows you. Note I, the home note."
- `sg_pedal` Pedal Point: "A held low note, steady while the Chorus moves above it. It shields you and your party close by. Note vi."
- `sg_lydian` Lydian: "Unlocks the Lydian key: bright and generous. Healing that would go past full life becomes a shield instead. Each rank makes the shield stronger."
- `sg_legato` Legato: "Played smooth, each note flowing into the next. The gifts of your Choruses linger on a friend after they step out of it."
- `sg_chorale` Chorale: "Many voices, one hymn. You and your party close by heal, more for every friend standing in it, and keep mending for a few seconds. Note I."
- `sg_march` Marching Tune: "Chorus: a steady march for 30s. You and your party inside move faster and are harder to push around. Note I."
- `sg_dorian` Dorian: "Unlocks the Dorian key: plain and even, fit for the road. Your Choruses reach farther, and they serve friends and foes alike. Each rank adds reach."
- `sg_accel` Accelerando: "Gradually quickening. The fuller your song gauge, the faster your Choruses beat."
- `sg_dirge` Dirge: "Chorus: a slow, heavy lament for 30s. Foes inside are slowed, worn down and lose their footing. Learning it opens the Minor key. Note i, home in shadow."
- `sg_modulate` Modulate: "Change key: switch to the next key you know and recolour the Chorus you are playing. Needs two keys. Major favours friends, the dark keys favour damage."
- `sg_twelve` Twelve-Tone Storm: "Every note at once, none of them at home. Your song gauge pours out into four waves of sound, and each foe hears the note it likes best. The fuller the gauge, the harder they crash. The book's gift is lost. Note bII." (Replaces the old Tempo wording; the Storm now empties the gauge.)
- `sg_anthem` Anthem: "A crescendo that grows louder and prouder with every beat. For a while you and your party inside hit harder and move and strike faster. Note I, played low." (Unchanged.)
- Passive tooltip "Trained Ear": "your own Choruses ring in you only half as much."
- Verses (`sg_mend`, `sg_jig`, `sg_call`, `sg_shrill`, `sg_crack`) keep their descs. Optional lead tag on each: "Verse."

## 2. The song gauge

- Name: "Song gauge"
- Orb tooltip: "Song gauge. It fills as you play. Fill it and your book's gift rings out, then it empties and begins again."
- Orb tooltip, with the book named: "Song gauge: {n}%. When full: {book}, {gift}."
- Help line (Songbook reader / skills "?"): "The song gauge fills with every note you play. Basic hits add a little, chords add a lot. Stop playing and it drains away. When it is full, your book's gift rings out and the gauge starts over."
- Short form: "Notes fill it. Chords fill it faster. Idle, it drains."
- Potion refusal: "Your song gauge isn't mana. A potion can't fill it."
- Alternate: "A potion won't help the song gauge. Only music fills it."
- Fizzle (full gauge, no book worn): "The song swells, then fades. Wear a book in your shield slot to give it a voice."
- Fizzle hint (floating text): "No book."
- Swell banner (floating text): `{book}: {gift}`, for example "Songbook: Refrain".
- Low-use hint, first time the gauge drains: "The song fades when you stop. Keep playing."

## 3. Books

Books go in the shield slot. They are not class-locked.

| Id | Name | Gift |
|---|---|---|
| `songweaver_shield` | Songbook | Refrain |
| `bk_hymnal` | Hymnal | Benediction |
| `bk_march` | War March | Rally |
| `bk_dissonance` | Dissonance | Cacophony |

### Songbook (`songweaver_shield`)
- Desc: "A worn little book of your own tunes. It keeps the songs you find and the legend of your chords."
- Full-gauge line: "Refrain: your Chorus beats again at once and its time begins anew. With no Chorus, your party is mended."
- Gift name: "Refrain"
- Source line: "Yours from the start. It will not leave your side."

### Hymnal (`bk_hymnal`)
- Desc: "Pages of old hymns, soft with handling. For a minstrel who keeps people on their feet."
- Full-gauge line: "Benediction: you and your party close by are healed and shielded."
- Gift name: "Benediction"

### War March (`bk_march`)
- Desc: "Drum rhythms and road songs, inked in a hurry. For a minstrel who leads a band."
- Full-gauge line: "Rally: you and your party close by hit harder, strike faster and move quicker for a few seconds."
- Gift name: "Rally"

### Dissonance (`bk_dissonance`)
- Desc: "Songs written to be played wrong. For a minstrel who plays alone and does not mind the stares."
- Full-gauge line: "Cacophony: a harsh blast hurts and stuns foes around you, and leaves them ringing."
- Gift name: "Cacophony"

### Another class looks at a book
- Tooltip line: "Not meant to be read in a fight. As a shield it is a poor one."
- Short: "A poor shield."
- Songweaver-only line, shown on all books: "Only a minstrel hears its gift."
- Requirement line (needs Magic): "Needs a mind for magic to read."

## 4. Songs

Songs are found in the world, never dropped. Each one adds a chord (a new order of three notes) and a finisher. A song counts while the Songbook is worn.

Songbook states:
- Unknown song name: "???"
- Source hint (before found): shown under "???".
- Learned line: shown in the reader and as a chat/banner line on pickup.
- Banner on finding a song: "New song!" / "{song}".

### The Gloam's Hum (`song_hum`, quest `jelly`)
- Source hint: "Something hums in Morwen's jelly. Help her find out why."
- Learned line: "You hum the tune back until you have it. The Gloam's Hum is in your Songbook."
- Chord line (I, V, I): "The tune of a thing that remembers."
- Finisher: `sg_f_hum`, "Gloam's Hum". Desc: "The jelly's old tune, played by you. Foes around you are hurt and left ringing, and you are mended."
- Morwen, when the song is taught (after the jelly quest, at the reward step):
  - "Hold still, darling. Listen. Hear it? The jelly hums in threes."
  - "Here. Write it down before it gets away from you. A minstrel should have it. I have no use for a tune that crawls."
  - Banner: "Morwen taught you a song."

### Miller's Round (`song_round`, villager Odo)
- Source hint: "Odo the miller likes a good Chorus. Play a bright one near him."
- Learned line: "Odo hums the last bars for you. Miller's Round is in your Songbook."
- Chord line (I, V, vi): "A round that turns the mill, and the people with it."
- Finisher: `sg_f_round`, "Miller's Round". Desc: "A round the whole mill can step to. You and your party close by hit harder and move faster."
- Odo, when the song is taught (the player played a major Chorus within reach):
  - Before: "Is that a lute? Play something bright, would you? The wheel turns better with a tune."
  - On teaching: "Ha! That is the spirit. Here, I will give you the round we sing at the wheel. Three lines, and it never ends."
  - Line after: "Mind the rhythm. The wheel does not wait."
  - Banner: "Odo taught you a song."
  - If the Chorus is dark: "Hm. A bit gloomy for grinding grain. Try a bright key."

### Mirror Pond Air (`song_pond`, a place)
- Source hint: "The still water at the Mirror Pond keeps the tune. Play a Chorus on its shore."
- Learned line: "The water gives your tune back, a little changed. Mirror Pond Air is in your Songbook."
- Chord line (i, bII, i): "A tune and its reflection."
- Finisher: `sg_f_undertow`, "Undertow". Desc: "The pond pulls back. Foes around you are drawn in, slowed and left ringing."
- On the shore, a first-time hint: "The water is very still. It is listening."

### The Hollow King's Lament (`song_lament`, quest `king`)
- Source hint: "A king is owed a song. Put the Hollow King to rest."
- Learned line: "You find the last notes in the quiet he leaves behind. The Hollow King's Lament is in your Songbook."
- Chord line (i, V, I, the dark home note turning bright at the end): "Grief, then a single light at the end."
- Finisher: `sg_f_picardy`, "Picardy". Desc: "A sad tune ends on a bright chord. Foes around you are blasted, and you and your party close by are healed."
- Quest-end line (at the reward step of `king`): "Something in the silence is a tune. You write it down while you can."
- Banner: "A song for the Hollow King."

## 5. The lute

### Stages
Names follow the hero's level (the code supplies the bands). Shown as "{stage} Lute".
- Minstrel's Lute: "A first lute. It plays, and that is enough."
- Journeyman's Lute: "Strung properly, now. It starts to answer you."
- Fine Lute: "A fine lute. Good wood, good voice."
- Master's Lute: "A master's instrument. Heads turn when it is tuned."
- Virtuoso's Lute: "Known by its sound across the land."
- Stage-up line: "Your lute has grown. It is now a {stage} Lute."
- Tooltip line, traits: "Fitted: {traits}." / none: "No fittings. Wren can change that."
- Tooltip line, sockets: "{n} rune sockets."

### Can't wear
- Wrong weapon: "That is not a musical instrument. A minstrel plays a lute."
- Wrong shield: "A minstrel carries a book, not a shield."
- Short form on the item tooltip: "Not a musical instrument."
- Bag-move note on login (migration): "Your old gear was put in your bag. A minstrel carries a lute and a book."

### Bound items
- Lute, when you try to drop or sell: "Your lute won't leave your side."
- Songbook, drop or sell: "Your Songbook won't leave your side."
- Tooltip tag: "Bound."
- Breaking a bound item at Wren: "Wren shakes her head. That one is yours to keep."

### Tutorial: First Steps gift
The step "Kill 3 blobs" has `gift: "w_bronze"` and the "equip" step says "Wear the weapon the blob dropped". For a Songweaver the gift is a Hymnal.
- Gift line (step text): "Wear the book the blob dropped" (banner: "A blob dropped a book!", "Wear it").
- Obj: "Wear your new book"
- Hint: "It went into your bag. Press G, then click the book to wear it. Your lute is already in your hands."
- Nag: "Press G and click that book to wear it."
- Rowan's closing lines for a Songweaver (replace "a real weapon"): "Look at you! Walking, fighting, a book to your name and a skill of your own."

## 6. Wren, the lute-maker (`lutemaker`)

Title: "Lute-maker". Where: "Oakvale, in her workshop by the square". Tone: brisk, kind, always sanding something.

- Greeting: "Mind the shavings. You have a lute? Let me see it. Oh, you do play it, don't you? Good."
- Greeting, not a Songweaver: "I make lutes, friend. Do you play?"
- Idle lines:
  1. "A lute is only wood until someone means it."
  2. "Spruce for the top, maple for the back. Everyone has an opinion about the glue."
  3. "Bring me bone from the old dead and I'll make you pegs that never slip. Bit grim, but they hold."
  4. "I have heard every sour note in Oakvale. Most were Tobin's."
  5. "Don't leave it in the sun. A lute dislikes the Sunscar more than I do."
- Shop open: "Books on the left, spare strings on the right. Anything you can't use, I'll buy or break."
- Fit success: "There. Listen. Hear it? That is a different lute."
- Break prompt: "Break it into something useful? It cannot be put back."
- Break done: "Good wood in there. I'll find a use for it."
- Break, nothing to gain: "There is not much left in that one."
- Sell line: "I'll give you fair coin for that."
- Buy refused (class): "You'd want a book that suits you, friend. Ask me when you have a lute."
- Farewell: "Keep her tuned."

### Traits
Fitting a trait costs gold and materials. One trait per group (Strings, Body, Tuning).
- Group names: "Strings", "Body", "Tuning".
- `steel` Steel Strings: "Bright metal strings. Your sound waves bounce off a wall once."
- `gut` Gut Strings: "Warm and soft. Your sound rings foes faster."
- `silk` Silk Strings (exotic): "Spun from silkwretch thread. Your bounces lose nothing."
- `wide` Wide Bowl: "A broad, round body. Your Choruses reach farther."
- `deep` Deep Bowl: "A deep, hollow body. Low notes come out stronger."
- `horn` Horn Bowl (exotic): "A tusk-horn body. Chords fill your song gauge faster."
- `bright` Bright Tuning: "Tuned high and sweet. Friends gain more from your bright keys."
- `dark` Dark Tuning: "Tuned low and sour. Foes suffer more from your dark keys."
- `bonepegs` Bone Pegs (exotic): "Pegs carved from old bone. Your gauge holds longer before it drains, and your book's gift is stronger."

### Lock reasons
- Level too low: "Wren says you are not ready for that yet. Come back at level {n}."
- Level too low, short: "Needs level {n}."
- Missing materials: "You don't have enough {mat} yet. Wren needs {n}."
- Missing materials, short: "Needs more materials."
- Missing gold: "That costs more than you carry."
- Group taken: "That part already has a fitting. Changing it costs again."
- Not a Songweaver: "Only a minstrel's lute can be fitted."

## 7. Materials

Kept as counters on your hero, not in your bag. Ground items are `mat_<id>`; only a Songweaver can pick them up. Pickup text is `+{n} {name}`, with the line below shown as chat or banner.

| Id | Name | Desc | Pickup line |
|---|---|---|---|
| `tonewood` | Tonewood | "Seasoned wood that rings when you tap it. Comes from broken weapons." | "You gather tonewood." |
| `brass` | Brass | "Bright fittings and tuning pins. Comes from broken shields and books." | "You gather brass." |
| `bone` | Bone | "Old, dry bone, smooth as a peg. The restless dead carry it." | "You pick up old bone." |
| `silk` | Silk | "Fine, strong thread from the webs of silkwretches." | "You gather a hank of silk." |
| `horn` | Horn | "A curl of tusk-horn, hollow and deep-voiced." | "You pick up a curl of horn." |
| `sunglass` | Sunglass | "Glass fused by the desert sun. It rings like a bell." | "You find a shard of sunglass." |

- Source lines (Wren / material tooltip): tonewood "Break a weapon at Wren." / brass "Break a shield or book at Wren." / bone "Skeletons and the Hollow King." / silk "Silkwretches and the weaver." / horn "Tusk beasts." / sunglass "The Sunscar."
- Greyed-drop tooltip, other classes: "Only a minstrel can use this."
- Greyed-drop pickup refusal: "That is no use to you. A minstrel would want it."

## 8. Patch note

File: `client/patchnotes/2026-11-14-songweaver-gauge.json` (no `patch` field).
