# Songweaver: content text

Player-facing text for the Songweaver, written against Plan v2 and the Interface contract in
[songweaver-progress.md](songweaver-progress.md). Paste into the tables later. English, plain, no numbers that may
still change. Ids are the contract ids.

## 1. Class blurb (`CLASSES.songweaver.blurb`)
> Oakvale minstrel with a lute. Songs help your friends, discord hurts your foes, and a good tune carries you alone.

## 2. Skill `desc` strings

### Hymnal (healing, branch 0)
- `sg_ballad` Hearth Ballad: "Play the old village tune. It mends you and friends close by, slowly, while the song lasts. I: the home note."
- `sg_mend` Mending Note: "Pluck a clear note: it heals one friend, then leaps to another nearby. IV: the note that leans toward home."
- `sg_pedal` Pedal Point: "A held bass note, never moving while the tune moves above it. It shields you and your party. vi: the sad cousin of home."
- `sg_lydian` Lydian: "A bright key with a lifted fourth. Healing that would run over turns into a shield instead."
- `sg_legato` Legato: "Played smooth, each note flowing into the next. Your songs and blessings linger longer."
- `sg_chorale` Chorale: "Many voices, one hymn. A great heal that grows with every friend standing in it. I: home, and everyone sings."

### Folk (warsongs, branch 1)
- `sg_march` Marching Tune: "A steady march. You and your party move faster and are harder to push around. I: home."
- `sg_jig` Jig: "A quick dance tune. You and your party swing faster. ii: the lively step up."
- `sg_call` Call: "Call and response. Strike a note, and for a few seconds the party answers: hits in that time land harder. V: the question that wants an answer."
- `sg_dorian` Dorian: "A key neither bright nor dark, fit for the road. Your songs reach farther, and work for foes and friends alike."
- `sg_accel` Accelerando: "Gradually quickening. The longer a song plays, the faster it ticks."
- `sg_anthem` Anthem: "A crescendo that grows louder and prouder as it goes. It lifts the whole party. I: home, at full volume."

### Discord (branch 2)
- `sg_dirge` Dirge: "A slow, heavy lament. It slows foes and drains their poise. Learning it opens the minor key. i: home, in shadow."
- `sg_shrill` Shrill Note: "A piercing note that bounces off walls. Rank 1: one bounce. Rank 2: two bounces. Rank 3: three bounces. V: tension, an unfinished phrase."
- `sg_crack` Cracked String: "Snap a string on purpose. A harsh twang stuns what it hits. Rank 3: the sound echoes once more, a canon. bII: the sour step just above home."
- `sg_phrygian` Phrygian: "A dark key with a flat second. Foes lose their footing faster, and sound rings in them longer."
- `sg_sympathy` Sympathetic Strings: "Strings that hum along with each other. Ringing in a foe builds faster, and when it bursts, it spreads to those nearby."
- `sg_twelve` Twelve-Tone Storm: "Every pitch at once, none of them at home. It strikes each foe at the pitch it hears best."

### Cantrip
- `sg_modulate` Modulate: "Change key mid-fight. Major favours friends, minor and Phrygian favour damage, Dorian sits between."

### Chord finishers (hidden skills)
- `sg_f_amen` Amen: "A hymn's closing chord. Heals and shields you and friends close by."
- `sg_f_encore` Turnaround: "The tune circles back and kicks the band into gear. Party damage and attack speed rise for a while."
- `sg_f_shatter` Shatterchord: "A cruel chord that rings the whole room. Damage, a stun, and a great surge of ringing in foes."
- `sg_f_resolve` Perfect Cadence: "Tension settles into home. A heal for friends and a blow for foes, with some ringing left behind."
- `sg_f_sleight` Deceptive Cadence: "You promise home, then step aside. For a moment nothing can touch you, and nearby foes flee."

## 3. Keys (`swMode`): name and one line
Shown as "keys" to players. All are built on the same home note, A.
- `major` Major: "Bright and open. Best for friends: songs heal and lift."
- `minor` Minor: "Dark and tense. Best for foes: songs bite harder."
- `lydian` Lydian: "Dreamy and bright. Healing turns to shields."
- `dorian` Dorian: "Plain and even, a road-weary key. Songs reach farther."
- `phrygian` Phrygian: "Dark, with a flinch in it. Foes lose their footing and ring longer."

## 4. Progressions and finishers
Chords play by themselves on the third note, in the right order. Then the strings need a short rest.
- Amen (vi, IV, I): "A hymn's ending." Finisher: Amen. "Heals and shields."
- Turnaround (ii, V, I): "The tune circles back." Finisher: Turnaround. "Party hits harder and faster."
- Neapolitan (bII, V, i): "A sour step, then home in shadow." Finisher: Shatterchord. "Damage, a stun, and heavy ringing."
- Perfect (IV, V, I): "The cadence every ear expects." Finisher: Perfect Cadence. "Heals friends, hits foes."
- Deceptive (IV, V, vi): "You promise home and turn away." Finisher: Deceptive Cadence. "Untouchable for a moment; foes flee."
- Hint line when a chord is half played: "Chord: IV, V... one more note."
- Lockout line: "Your strings are still ringing."

## 5. Sound-sensitivity hint lines

### Ear tiers (one-time hint, first time a monster of this tier is struck by a song)
- deaf: "It does not hear you. Sound barely troubles it."
- dull: "It hears you, but only dimly."
- normal: "It hears you as most things do."
- keen: "Sharp-eared. It flinches at every note."
- fragile: "It rings like glass. A hard note could shatter it."

### Pitch flavour (added to the tier line when the monster has a pitch)
- low: "It hums back at low notes."
- mid: "It answers to middle notes."
- high: "It rings at high notes."
- Match cue: "The note fits it." Miss cue: "The note slides off."

### Notable monster kinds (one-time, first time you hit one with sound)
Proposed assignments: check against the engineer's `MOB_COMBAT.sound` table. Keep the tier and pitch in the line true
to that table.
- `wisp` Wisp (keen, high): "Glassy... it rings at high notes."
- `slime` Blob (deaf): "Soft and wet. It swallows the sound."
- `skeleton` Skeleton (normal, low): "Hollow bones. They rattle at low notes."
- `skeletonmage` Skeleton Mage (normal, mid): "It hums with its own spell. Match its note."
- `bride` Bride (fragile, high): "Pale and brittle. A high note could crack her."
- `crowseer` Crowseer (keen, high): "It cocks its head at every note."
- `duskwing` Duskwing (keen, high): "Its ears are larger than its head."
- `gnawkin` Gnawkin (dull): "Thick skull. It hears you late."
- `tuskborn` Tuskborn (dull, low): "It feels low notes in its chest more than it hears them."
- `silkwretch` Silkwretch (keen, mid): "Its web shivers with every note, and so does it."
- `scorpion` Dune Scorpion (dull, low): "It feels the ground more than the air."
- `sanddead` Sand-Dead (normal, low): "Dry and hollow. Low notes rattle in them."
- `golem_colossus` Colossus (deaf, low): "Stone does not listen."
- `golem_fire`, `golem_cold`, `golem_poison`, `golem_shock` (dull, low): "Heavy as stone. Only low notes trouble it."
- `sphinx` Sphinx Warrior (normal, mid): "It listens carefully, and will not be fooled twice."
- `hollowking` The Hollow King (normal, low): "A crown of bone. A deep note rings in him."
- `nightraider` Night Raider (deaf): "It cannot be moved by song, only by steel."
- Any kind without a line of its own: use the tier line.

## 6. Tooltip text

### Ear icon (nameplate, by tier)
- deaf: "Deaf. Sound barely affects it."
- dull: "Hard of hearing. Sound is weaker."
- normal: "Normal hearing."
- keen: "Keen ears. Sound hits harder."
- fragile: "Fragile. A loud enough sound shatters it."

### Pitch icon
- low: "Answers to low notes."
- mid: "Answers to middle notes."
- high: "Answers to high notes."
- none: "No favourite note."
- Key affinity: "Likes the major key." / "Likes the minor key."

### Resonance
- "Resonance: the right notes make a foe ring. Fill it and it bursts. Fifths and octaves ring fastest. It fades if you stop."
- Stage labels (`res1` to `res3`): "Humming", "Ringing", "About to burst".

### Bounce
- "Bounce: sound leaps off a wall and can hit again. Stone gives back most of it, wood swallows much, and leaves swallow all."

### Trained Ear (Songweaver passive, if it gets a tooltip)
- "Trained Ear: your own songs ring in you only half as much."

## 7. Oakvale NPC lines (a minstrel busking in the village)
For when a Songweaver plays a major-key song in Oakvale. A minor key or Discord in town is outlaw play and gets no lines.
1. Elder Rowan: "A lute on the square. The bonfire has not heard a tune like that since my knees were young."
2. Brann: "Play on, minstrel. The hammer keeps better time with a song."
3. Morwen: "Hm. Mind the pitch near my jars. Some of them hum when you do."
4. Hilda: "My stall has been quiet all morning. Your tune has the whole square lingering."
5. Captain Hale: "Hymns and jigs, fine. Play a sour note near the gate and we will have words."
6. Tobin: "You play like my mother sang. Thank you for that."

## Unclear for players (flagged)
- Degree names (I, ii, bII, IV, V, vi) mean nothing to most players. The descs add a plain gloss, but a small
  in-game legend (home note, step up, and so on) would help.
- "Pitch" (Low/Mid/High) on a skill and on a monster may be mistaken for volume. Suggest "note" wording in tooltips.
- Modes are presented as "keys" (owner's choice), though they share one tonic. Never write "key of D" anywhere.
- Resonance, poise and "ringing" are separate meters. Players may blur ringing and stun.
- The monster tier and pitch list was not in `docs/songweaver-progress.md`: the section 5 monster lines are proposals.
- Plan v2 says Hearth Ballad is a regen song for the party; the desc says "you and friends close by". Confirm it reaches party members.
