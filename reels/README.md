# Instagram reels

Short vertical gameplay videos (1080x1920, 30 fps) for Instagram @fmtpa. The reels themselves live on the branch
`claude/reels-media` (never merged, so reels and their records don't redeploy the game), one folder per reel:
`reel.json` (shots + caption), `reel.mp4` and `cover.jpg` (rendered), `posted.json` (written once it is posted).

1. **Render** (needs Playwright + ffmpeg, like `tools/skill-clips`):
   `npm run build && npx tsx tools/reels/render.ts reels/<slug>/reel.json`
   Shots film real gameplay on a local server (`SKILL_CAPTURE=1`): `stage` = skill meadow with three blobs,
   `goto` = put the hero on a tile, `look`/`panTo` = camera parked on / gliding between tiles, `casts`, `keys`,
   `text` (first line big, next lines small, in the game's pixel font), `dim` for an end card. Music from
   `client/public/assets/music`.
2. **Review**: Murat watches the video and approves the caption for that post.
3. **Post**: push the folder to `claude/reels-media`, then GitHub > Actions > *Instagram reel* > Run workflow, action
   `post`, reel folder `reels/<slug>` (`dry-run` checks without posting; `stats` saves every post's numbers to
   `reels/stats.json` on the media branch). The first 3 reels need Murat's yes; after that the promotion runs post on
   their own (`reels/journal.md` on the media branch logs what was tried and how it did). Uses the repo secret `INSTAGRAM_TOKEN` (long-lived token, expires after ~60 days: make a new one in the
   Graph API Explorer and save it over the secret).
