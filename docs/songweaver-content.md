# Songweaver: content text

Player-facing text for the Songweaver. Sections 1, 2 and 7 are now in code (see "Where the text lives" at the end);
sections 3 to 6 are for the client engineer to copy into `client/src/songTables.ts`. English, plain, few numbers (a
balance pass changes them). Player-facing text says "note", never "pitch", and "key" for a mode. Ids are the code ids.

## 1. Class blurb (`CLASSES.songweaver.blurb`, in code)
> Oakvale minstrel with a lute. Songs help your friends, discord hurts your foes, and a good tune carries you alone.

## 2. Skill `desc` strings (all in `shared/skills.ts`, same text as there)

### Hymnal (healing, branch 0)
- `sg_ballad` Hearth Ballad: "Play the old village tune. For 30s it mends you and your party close by with every beat, and it follows you. Note I, the home note."
- `sg_mend` Mending Note: "Pluck a clear high note: it heals you, then leaps to the nearest friend. Ranks 3 and 5 add one more friend. Note IV."
- `sg_pedal` Pedal Point: "A held low note, steady while the tune moves above it. It shields you and your party close by. Note vi."
- `sg_lydian` Lydian: "Unlocks the Lydian key: bright and generous. Healing that would go past full life becomes a shield instead. Each rank makes the shield stronger."
- `sg_legato` Legato: "Played smooth, each note flowing into the next. The gifts of your songs linger on a friend after they step out of the song."
- `sg_chorale` Chorale: "Many voices, one hymn. You and your party close by heal, more for every friend standing in it, and keep mending for a few seconds. Note I."

### Folk (warsongs, branch 1)
- `sg_march` Marching Tune: "Song: a steady march for 30s. You and your party inside move faster and are harder to push around. Note I."
- `sg_jig` Jig: "A quick dance tune. You and your party close by strike faster for a few seconds. Note ii."
- `sg_call` Call: "Call and response. A ringing shout jolts foes close by, and for a few seconds you and your party answer with harder blows. Note V."
- `sg_dorian` Dorian: "Unlocks the Dorian key: plain and even, fit for the road. Your songs reach farther, and it serves friends and foes alike. Each rank adds reach."
- `sg_accel` Accelerando: "Gradually quickening. The more Tempo you build, the faster your songs beat."
- `sg_anthem` Anthem: "A crescendo that grows louder and prouder with every beat. For a while you and your party inside hit harder and move and strike faster. Note I, played low."

### Discord (branch 2)
- `sg_dirge` Dirge: "Song: a slow, heavy lament for 30s. Foes inside are slowed, worn down and lose their footing. Learning it opens the Minor key. Note i, home in shadow."
- `sg_shrill` Shrill Note: "A piercing note that runs through foes and bounces off walls. Stone gives it back, wood gives back less, and leaves and water swallow it. Each rank adds a bounce. Note V."
- `sg_crack` Cracked String: "Snap a string on purpose. A harsh twang hurts and stuns the foes ahead of you. From rank 3 it rings again, softer, like a canon. Note bII, the sour step above home."
- `sg_phrygian` Phrygian: "Unlocks the Phrygian key: dark, with a flinch in it. Your sound drains more poise and makes foes ring faster. Each rank adds more."
- `sg_sympathy` Sympathetic Strings: "Strings that hum along with each other. Foes ring faster, and when the ringing bursts it spreads to foes close by. Each rank adds more."
- `sg_twelve` Twelve-Tone Storm: "Every note at once, none of them at home. Four waves of sound crash around you, and each foe hears the note it likes best. Note bII."

Rank-step lines already in code and left as they were: Mending Note "+1 ally at ranks 3 and 5", Shrill Note "+1 bounce",
Cracked String "rings again from rank 3".

### Cantrip
- `sg_modulate` Modulate: "Change key: switch to the next key you know and recolour the song you are playing. Needs two keys. Major favours friends, the dark keys favour damage."

### Chord finishers (hidden skills, `FINISHERS`)
Skill names now follow the chord's story; the progression names are in section 4.
- `sg_f_amen` Amen: "Amen, a hymn's closing chord. You and your party close by are healed and shielded."
- `sg_f_encore` Turnaround: "The tune circles back and kicks the band into gear. You and your party close by hit harder and faster for a few seconds."
- `sg_f_shatter` Shatterchord: "A cruel chord that rings the whole room. Foes around you are hurt, stunned and left ringing hard."
- `sg_f_resolve` Perfect Cadence: "Tension settles into home. Foes around you are hurt and left ringing, and you and your party close by are healed."
- `sg_f_sleight` Deceptive Cadence: "You promise home, then step aside. For a moment nothing can touch you, and foes around you flee."

## 3. Keys (`swMode`): name and one line
Shown as "keys" to players. All are built on the same home note, A. Names are already `MODES[*].name` in
`shared/songs.ts`; `MODES` has no text field, so the lines go in `client/src/songTables.ts`. Strengths in code: Major
favours friends (heals and buffs x1.15, damage x0.9), Minor the reverse (x0.9 / x1.15), Lydian friends (x1.2 / x0.85),
Dorian even (x1 / x1), Phrygian foes (x0.85 / x1.2).
- `major` Major: "Bright and open. Best for friends: songs heal and lift."
- `minor` Minor: "Dark and tense. Best for foes: songs bite harder." (Opens with Dirge.)
- `lydian` Lydian: "Dreamy and bright. Friends do well in it, and healing past full life turns to shields."
- `dorian` Dorian: "Plain and even, a road-weary key. Songs reach farther."
- `phrygian` Phrygian: "Dark, with a flinch in it. Foes lose their footing and ring faster."

## 4. Progressions and finishers
Chords play by themselves on the third note, in the right order (the last three notes you played). Then the strings
need a short rest (12s).
- Amen (vi, IV, I): "A hymn's ending." Finisher: Amen. "Heals and shields."
- Turnaround (ii, V, I): "The tune circles back." Finisher: Turnaround. "Party hits harder and faster."
- Neapolitan (bII, V, i): "A sour step, then home in shadow." Finisher: Shatterchord. "Damage, a stun, and heavy ringing."
- Perfect (IV, V, I): "The cadence every ear expects." Finisher: Perfect Cadence. "Heals friends, hits foes."
- Deceptive (IV, V, vi): "You promise home and turn away." Finisher: Deceptive Cadence. "Untouchable for a moment; foes flee."
- Hint line when a chord is half played: "Chord: IV, V... one more note."
- Lockout line: "Your strings are still ringing."

## 5. Sound-sensitivity hint lines

Real values are `MOB_COMBAT[*].sound` in `shared/combat.ts` (tier, note L/M/H, and a key family: undead major, beasts
and fey minor). Bosses ring at three quarters (`SOUND_MATCH.boss` 0.75). Hint lines must stay true to that table.

Tier multipliers on a sound hit (`SOUND_TIER`; a matched note adds x1.2 damage and x1.5 resonance):

| Tier | Damage | Resonance | Crowd control |
|---|---|---|---|
| deaf | x0.75 | x0 | x0.75 |
| dull | x0.9 | x0.5 | x0.9 |
| normal | x1 | x1 | x1 |
| keen | x1.2 | x1.3 | x1.2 |
| fragile | x1.35 | x2 | x1.35 |

### Ear tiers (one-time hint, first time a monster of this tier is struck by a song)
- deaf: "It does not hear you. Sound barely troubles it."
- dull: "It hears you, but only dimly."
- normal: "It hears you as most things do."
- keen: "Sharp-eared. It flinches at every note."
- fragile: "It rings like glass. A hard note could shatter it."

### Note flavour (added to the tier line when the monster has a favourite note)
- low: "It hums back at low notes."
- mid: "It answers to middle notes."
- high: "It rings at high notes."
- Match cue: "The note fits it." Miss cue: "The note slides off."
- Key family, if it has one: major "It likes the major key." / minor "It likes the minor key."

### Notable monster kinds (one-time, first time you hit one with sound)
Tier and note are the real `MOB_COMBAT[*].sound`. Any kind without a line of its own uses the tier line (and the note
flavour). Table of every kind: tier / note / key.

| Kind | Tier | Note | Key |
|---|---|---|---|
| wisp | fragile | high | |
| slime | dull | low | |
| motherblob, blobling | deaf | low | |
| skeleton, skeletonmage | fragile | high | major |
| crawler | keen | high | |
| bride | keen | high | |
| demon | dull | low | major |
| shooterblob | dull | mid | |
| warriorblob, venomblob | dull | low | |
| healerblob | normal | mid | |
| frostblob | fragile | high | |
| fireblob | normal | mid | |
| stormblob | keen | high | |
| bandit, banditchief | normal | mid | |
| necromancer | normal | mid | major |
| hollowking | dull | low | major |
| gnawkin | keen | high | |
| tuskborn | normal | low | |
| silkwretch, duskwing, crowseer | keen | high | |
| gnasher | normal | low | |
| weaver | keen | high | |
| packlord | keen | mid | minor |
| hornbrute, hidemother | dull | low | |
| nomad | normal | mid | |
| scorpion | dull | high | |
| sanddead | normal | low | major |
| veiled | normal | mid | minor |
| camelfolk | normal | low | |
| sphinx | keen | mid | minor |
| sunwright | dull | low | major |
| golem_fire, golem_colossus | dull | low | |
| golem_cold | fragile | high | |
| golem_poison | normal | low | |
| golem_shock | keen | high | |
| nightraider | deaf | none | |

Lines:
- `wisp` Wisp: "Glassy. It rings at high notes, and a hard one could shatter it."
- `slime` Blob (and `motherblob`, `blobling`): "Soft and wet. It swallows the sound."
- `skeleton` Skeleton: "Dry, brittle bones. A high note in a bright key could shatter them."
- `skeletonmage` Skeleton Mage: "Brittle, and humming with its own spell. A high note cracks it."
- `bride` Bride: "Sharp-eared and pale. High notes cut her."
- `crowseer` Crowseer: "It cocks its head at every note."
- `duskwing` Duskwing: "Its ears are larger than its head."
- `gnawkin` Gnawkin: "Small, quick, and all ears. Every high note stings it."
- `tuskborn` Tuskborn: "It feels low notes in its chest, and hears them like anyone."
- `silkwretch` Silkwretch: "Its web shivers with every note, and so does it."
- `scorpion` Dune Scorpion: "A hard shell. Only the highest notes get through."
- `sanddead` Sand-Dead: "Dry and hollow. Low notes rattle in them, and they like the major key."
- `golem_colossus` Colossus: "Stone barely listens. Only low notes trouble it."
- `golem_fire`, `golem_poison`: "Heavy as stone. Low notes work best."
- `golem_cold` Frost Golem: "Ice rings like a bell. A high note could shatter it."
- `golem_shock` Storm Golem: "Crackling and restless. It flinches at high notes."
- `sphinx` Sphinx Warrior: "It listens closely, and the minor key reaches it best."
- `hollowking` The Hollow King: "A crown of bone, and ears of stone. A deep note in the major key rings in him, but slowly."
- `nightraider` Night Raider: "It cannot be moved by song, only by steel."

## 6. Tooltip text

### Ear icon (nameplate, by tier)
- deaf: "Deaf. Sound barely affects it."
- dull: "Hard of hearing. Sound is weaker."
- normal: "Normal hearing."
- keen: "Keen ears. Sound hits harder."
- fragile: "Fragile. A loud enough sound shatters it."

### Note icon
- low: "Answers to low notes."
- mid: "Answers to middle notes."
- high: "Answers to high notes."
- none: "No favourite note."
- Key affinity: "Likes the major key." / "Likes the minor key."

### Resonance
- "Resonance: the right notes make a foe ring. Fill it and it bursts. A fifth or an octave after the last note rings fastest. It fades if you stop."
- Stage labels (`res1` to `res3`): "Humming", "Ringing", "About to burst".

### Bounce
- "Bounce: a wave leaps off a wall and can hit again. Stone gives back most of it, wood less, and metal rings. Leaves and water swallow it."

### Trained Ear (Songweaver passive, if it gets a tooltip)
- "Trained Ear: your own songs ring in you only half as much."

## 7. Oakvale NPC lines (a minstrel busking in the village; in code as `BUSKING_LINES` in `shared/npcs.ts`)
For when a Songweaver plays a major-key song in Oakvale. A minor key or Discord in town is outlaw play and gets no lines.
1. Elder Rowan (`druid`): "A lute on the square. The bonfire has not heard a tune like that since my knees were young."
2. Brann (`weaponsmith`): "Play on, minstrel. The hammer keeps better time with a song."
3. Morwen (`witch`): "Hm. Mind the notes near my jars. Some of them hum when you do."
4. Hilda (`armourer`): "My stall has been quiet all morning. Your tune has the whole square lingering."
5. Captain Hale (`captain`): "Hymns and jigs, fine. Play a sour note near the gate and we will have words."
6. Tobin (`fisher`): "You play like my mother sang. Thank you for that."

## Where the text lives
- Blurb: `shared/classes.ts`. Skill and finisher `desc` and finisher names: `shared/skills.ts`.
- Key names: `MODES[*].name` in `shared/songs.ts` (already right). Key lines (section 3), progression lines and chord
  hints (4), hint lines and tooltips (5, 6): `client/src/songTables.ts` (client engineer).
- Busking lines: `BUSKING_LINES` in `shared/npcs.ts`. Nothing reads it yet: the room must pick a line when a Songweaver
  plays a major-key song near an Oakvale NPC (gameplay engineer).

## Unclear for players (flagged)
- Degree names (I, ii, bII, IV, V, vi) mean nothing to most players. The descs add a plain gloss, but a small
  in-game legend (home note, step up, and so on) would help.
- Modes are presented as "keys", though they share one home note. Never write "key of D" anywhere.
- Resonance, poise and "ringing" are separate meters. Players may blur ringing and stun.
- Hearth Ballad reaches party members (checked in code: `field.party`), so the text says "you and your party".
- Some descs end with a "Note X" gloss that a hero sees next to the skill's note name; the client may drop it if the
  tooltip already shows the degree.
