# Instagram reels

Short vertical gameplay videos (1080x1920, 30 fps) for Instagram @fmtpa. One folder per reel:
`reel.json` (shots + caption), `reel.mp4` and `cover.jpg` (rendered), `posted.json` (written once it is posted).

1. **Render** (needs Playwright + ffmpeg, like `tools/skill-clips`):
   `npm run build && npx tsx tools/reels/render.ts reels/<slug>/reel.json`
   Shots film real gameplay on a local server (`SKILL_CAPTURE=1`): `stage` = skill meadow with three blobs,
   `goto` = put the hero on a tile, `look`/`panTo` = camera parked on / gliding between tiles, `casts`, `keys`,
   `text` (first line big, next lines small, in the game's pixel font), `dim` for an end card. Music from
   `client/public/assets/music`.
2. **Review**: Murat watches the video and approves the caption for that post.
3. **Post**: GitHub > Actions > *Instagram reel* > Run workflow, reel folder `reels/<slug>`. Unticked "publish" =
   dry run. Uses the repo secret `INSTAGRAM_TOKEN` (long-lived token, expires after ~60 days: make a new one in the
   Graph API Explorer and save it over the secret).
