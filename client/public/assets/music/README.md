# Background music

MP3 tracks for the game. To add one, put the file here and add a line to `TRACKS` in `client/src/music.ts`.
Players pick the track in the in-game Music menu.

Saltmere plays `tides-of-saltmere.mp3` (falls back to the village tune if missing).

Act 2 (desert) songs already have their slot in `TRACKS` (marked `optional`): just drop the mp3 here with the file
name from `docs/music/act2-prompts.md` and it plays in its place (strip cover art first: `ffmpeg -i in.mp3 -map 0:a -c copy out.mp3`).

Clan war big battles (W5) play `war-battle.mp3` ("Battle of the Clans", optional) in Auto while the hero stands in a
battle's field during the fight: a boss-style loop that lasts as long as the battle. Until the file is added, the
Pale Marshal's March plays in its place.

## The Crown of the Marches (Act 6, optional)

`tollcross-tune.mp3` (slot `tollcross`) plays in Tollcross, the Truce Market; `crown-of-the-marches.mp3` (slot `crown`)
plays everywhere else in the Crown outside monster zones. Both are `optional` in `TRACKS` (`client/src/music.ts`): without
the files Tollcross keeps the village tune and the rest of the Crown the country tune, and nothing errors.
- Mood: regal and ruined; slow horns and strings over a faded fanfare, dusk-gold warmth with a hollow, wind-swept
  edge. Tollcross is livelier (a fair under old banners); the open Marches are sparse and wide.
- Length: 2 to 4 minutes, seamless loop. Format: mp3, 128 to 192 kbps, cover art stripped.

## Capital cities (W7, optional)

Each clan capital plays its own calm tune: slot `city-<clan>` in `TRACKS` (`client/src/music.ts`), file
`city-<clan>.mp3`, all `optional`: `city-wardens.mp3` (Hearthhold), `city-veiled.mp3` (Duskveil), `city-host.mp3`
(Marrowkeep), `city-redfang.mp3` (Scarwall) and `city-hidekin.mp3` (Deepden). Without the file Auto plays the act's town
tune in the city (the Kel Ashar tune or the desert sounds in Duskveil, the village tune in the others) and nothing errors.
- Mood (Hearthhold): warm and steady, a hearth-fire fanfare; strings and low horns, a march in the drums, safe walls.
- Mood (Duskveil): hushed and sunlit; oud and frame drum, a low women's chant, bells far off, a veil of reverb.
- Mood (Marrowkeep): slow and solemn; low bowed strings and a funeral drum, a bone xylophone, cold and orderly.
- Mood (Scarwall): rough and loud; hand drums and a growling fiddle, stamping and laughter, a camp after a raid.
- Mood (Deepden): close and earthy; hollow log drums, a bone flute, a low hum underground, warm and wary.
- Length: 2 to 4 minutes, seamless loop. Format: mp3, 128 to 192 kbps, cover art stripped.
