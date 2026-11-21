# Instagram @fmtpa promotion plan

Goal: find the audience for Pixel Town Brawl (free dark pixel-art browser MMO-RPG, play.fmtpa.ch) and turn views into players.
Owner: Claude (scheduled promotion runs). Murat approved reels 1-3 one by one; from reel 4 on, runs post on their own
and send a weekly report.

## Rules for every reel
- VOICE (Murat 2026-11-21, updated): GENERIC, neutral, casual voice. NO first person ("i", "my game", maker/devlog voice
  felt icky to Murat) and NO ad-speak ("How big is this browser MMO?", "Play now!", "Free to play!", superlatives).
  Describe what happens like a caption on a clip: "this village has one rule", "the vampire can eat monsters".
  Lowercase, textStyle "voice", one biome/moment per reel, end card = place name + play.fmtpa.ch.
- CORE THEME (Murat 2026-11-21): the game is natively MULTIPLAYER, in play AND in how it is made: players shape it,
  from builders to suggesters (in-game /idea requests become features). Weave it into captions ("bring your party",
  "the next skills come from player ideas") and give it its own reels (type Community).
- 9:16, 7-20 s, first frame already in action (no logo or slow intro). Hook text in the first second, 3-6 words.
- Hero always moving: walking routes, casting into real monster packs, battles. Cut every 1.5-2.5 s, on the beat.
- Music: game tracks (all allowed), start at a strong part (blob-slayer.mp3 drop at 8.6 s). NO fade-out at the end
  (Murat 2026-11-21): music and picture run to the last frame (render.ts no longer fades), which also loops better.
- Text: lowercase voice, but place and game names Capitalized (Kel Ashar, Oakvale, Pixel Town Brawl; Murat 2026-11-21). Few words, game pixel font, top third (IG UI covers the bottom fifth and the right edge).
- End: place name + play.fmtpa.ch, small, over moving gameplay. Caption: casual 1-2 lines in a player's voice + "link in bio" + 8-10 hashtags.
- Bright enough on a phone: skill shots in day without colour grade; dusk/night only for mood shots.

## What works (research 2026-11-21: howtomarketagame, presskit.gg, 80.lv Indie Game Joe, HypeHype, CloutBoost)
- PREMISE HOOK beats genre pitch: lead with the one weird rule/mechanic in a sentence ("this village has one rule:
  no magic", "my vampire eats monsters to steal their powers", "skeletons only come out at night"). Never
  "cozy pixel-art MMO with ..." (genre-only pitches flop).
- Show, don't sell; homemade beats polished; unscripted funny/fail moments beat staged ones. Fails and deaths are content.
- Structures that work: premise -> 2-3 quick beats -> payoff; setup that pays off at the end; before/after or
  day/night hard cut; seamless loop (loops count as views); one character per video; reply-to-comment videos.
- End on a question to pull comments ("would you have tried it?", "which class next?"), not a CTA banner.
- 12-25 s; show the coolest thing in the first 2 s; no logos/intros/slow pans.
- Devlog voice tested and REJECTED by Murat (icky); use the generic voice.
- Captions short; 3-5 hashtags (mix 1-2 broad + niche). Cross-post the same cut to TikTok/Shorts later (no watermark).
- Don't pay for ads; boost only organic winners later.

## Rhythm
- First month (until 2026-12-21): one reel EVERY day, weekends included, around 18:00 Zurich (scheduled run 17:07). Then
  set the frequency from the data and note it here. Stats read before each run.
- Judge a reel at 48 h (views, avg watch time, likes+comments+shares+saves per view, follows).

## Reel types (rotate; never the same type twice in a row, each type at least once a week)
- CHARACTERS: one class and its signature skills (vampire Devour/Bite, wizard, summoner, songweaver).
- MOBS: one monster or boss and what makes it nasty (Mother Blob splits, tree ambushers, Hollow King, sphinx).
- GAMEPLAY: one rule or moment (no magic in the village, clan war battles, shrine boon, night undead).
- EXPLORATION: walking around one biome/place (desert, moors, badlands, sinkholes, Crown, Oakvale at dusk).
- COMMUNITY: multiplayer + players shaping the game (/idea requests that shipped, parties, trading, PvP).
- UPDATES: what's new from client/patchnotes/ ("new this week").
Order so far: A village rule (gameplay) -> B vampire eats (characters) -> C desert (exploration) -> next: mobs, community, updates.
Log each reel's type in journal.md and compare types at 48 h.

## Formats to test (one variable at a time)
1. "Runs in your browser" montage (hook = no download).            [reel 1]
2. POV / class fantasy: "POV: you main a vampire" (one class, its best skills).
3. Big moments: clan war battles, bosses (Hollow King, Mother Blob), siege.
4. One biome told as a discovery (desert, moors, badlands, sinkholes, Crown), creator voice.
5. Update posts: new feature from the latest patch notes (client/patchnotes/), "new this week".
6. Satisfying loops: one skill on a big pack, seamless loop, no text.
7. Community angle: a player /idea that became a feature (no first person).
8. Questions to drive comments: "Which class should we add next?".
Premise hooks bank: no magic in the village (outlaw + guards); vampire Devour eats monsters / Bite makes thralls;
undead only at night; casting into a crowd of AI clan soldiers starts a war; shrine with a random boon;
broken bridges; tree ambushers drop on you in Redfang woods; portal stones; mother blob splits; waygate to a desert.

## Loop each run
0. If journal.md has a QUEUED reel, post that one (step 4) instead of making a new one.
1. Run the workflow with action `stats`, read reels/stats.json, note numbers in journal.md.
2. Decide: keep what beats the median, drop what is under it, try one new idea.
3. Render (npm run build; npx tsx tools/reels/render.ts reels/<slug>/reel.json, ~15 min), check frames.
4. Push the folder to claude/reels-media, run the workflow with action `post`.
5. Weekly (Fri): short report to Murat: posts, best/worst, followers, next tests.
