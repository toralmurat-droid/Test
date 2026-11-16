# Background music

MP3 tracks for the game. To add one, put the file here and add a line to `TRACKS` in `client/src/music.ts`.
Players pick the track in the in-game Music menu.

Saltmere plays `tides-of-saltmere.mp3` (falls back to the village tune if missing).

Act 2 (desert) songs already have their slot in `TRACKS` (marked `optional`): just drop the mp3 here with the file
name from `docs/music/act2-prompts.md` and it plays in its place (strip cover art first: `ffmpeg -i in.mp3 -map 0:a -c copy out.mp3`).

Clan war big battles (W5) play `war-battle.mp3` ("Battle of the Clans", optional) in Auto while the hero stands in a
battle's field during the fight: a boss-style loop that lasts as long as the battle. Until the file is added, the
Pale Marshal's March plays in its place.
