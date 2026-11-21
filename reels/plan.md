# Instagram @fmtpa promotion plan

Goal: find the audience for Pixel Town Brawl (free dark pixel-art browser MMO-RPG, play.fmtpa.ch) and turn views into players.
Owner: Claude (scheduled promotion runs). Murat approved reels 1-3 one by one; from reel 4 on, runs post on their own
and send a weekly report.

## Rules for every reel
- 9:16, 7-20 s, first frame already in action (no logo or slow intro). Hook text in the first second, 3-6 words.
- Hero always moving: walking routes, casting into real monster packs, battles. Cut every 1.5-2.5 s, on the beat.
- Music: game tracks (all allowed), start at a strong part (blob-slayer.mp3 drop at 8.6 s).
- Text: few words, game pixel font, top third (IG UI covers the bottom fifth and the right edge).
- End: "Free to play / play.fmtpa.ch" over moving gameplay. Caption: 1-2 lines + "link in bio" + 8-10 hashtags.
- Bright enough on a phone: skill shots in day without colour grade; dusk/night only for mood shots.

## Rhythm
- First month (until 2026-12-21): one reel every weekday around 18:00 Zurich (scheduled run Mon-Fri 17:07). Then
  set the frequency from the data and note it here. Stats read before each run.
- Judge a reel at 48 h (views, avg watch time, likes+comments+shares+saves per view, follows).

## Formats to test (one variable at a time)
1. "Runs in your browser" montage (hook = no download).            [reel 1]
2. POV / class fantasy: "POV: you main a vampire" (one class, its best skills).
3. Big moments: clan war battles, bosses (Hollow King, Mother Blob), siege.
4. World tour: Oakvale -> desert Act 2 -> moors/badlands; "how big is this browser game?".
5. Update posts: new feature from the latest patch notes (client/patchnotes/), "new this week".
6. Satisfying loops: one skill on a big pack, seamless loop, no text.
7. Dev/indie angle: "I'm building an MMO in the browser" (needs Murat's OK for voice/person).
8. Questions to drive comments: "Which class should we add next?".
Hooks to rotate: no download; free; pixel art; vampire; clan war; "made by one person" (ask Murat first).

## Loop each run
1. Run the workflow with action `stats`, read reels/stats.json, note numbers in journal.md.
2. Decide: keep what beats the median, drop what is under it, try one new idea.
3. Render (npm run build; npx tsx tools/reels/render.ts reels/<slug>/reel.json, ~15 min), check frames.
4. Push the folder to claude/reels-media, run the workflow with action `post`.
5. Weekly (Fri): short report to Murat: posts, best/worst, followers, next tests.
