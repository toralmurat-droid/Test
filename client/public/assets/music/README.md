# Background music

MP3 tracks for the game. To add one, put the file here and add a line to `TRACKS` in `client/src/music.ts`.
Players pick the track in the in-game Music menu.

Act 2 (desert) songs already have their slot in `TRACKS` (marked `optional`): just drop the mp3 here with the file
name from `docs/music/act2-prompts.md` and it plays in its place (strip cover art first: `ffmpeg -i in.mp3 -map 0:a -c copy out.mp3`).

## Saltmere (Act 1, optional)

`saltmere-tune.mp3` is the tune for Saltmere, the fishing village on the south coast (slot `saltmere` in `TRACKS`,
marked `optional`). Drop the file here and it plays in Saltmere only; without it Saltmere keeps the village tune and
nothing errors.
- Mood: calm, salt and weather; a small fishing village at the edge of the sea. Gentle accordion or concertina, soft
  fiddle, a slow tide-like rhythm (6/8 or 3/4), a little melancholy but warm. No drums, no big climax; it must sit
  under the surf and gull sounds the game already plays on the beach.
- Length: 2 to 4 minutes, seamless loop (the end flows into the start; no fade-out baked in).
- Format: mp3, about 128 to 192 kbps, cover art stripped (`ffmpeg -i in.mp3 -map 0:a -c copy out.mp3`).
