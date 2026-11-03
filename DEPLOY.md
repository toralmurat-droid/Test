# Put the game online

## Is copying the repo to a server enough?

No. The repo is only the source code. To be playable by anyone, a server also needs to:

1. **Install and build**: install the packages (`npm ci`) and build the browser game (`npm run build`).
2. **Keep the game running** 24/7, and restart it if it crashes.
3. **Be reachable**: a public web address with HTTPS (the game uses a WebSocket on the same address).
4. **Keep player saves**: accounts live in `data/saves.json` (and ideas in `data/ideas.json`). This folder must be
   on a *persistent disk*, otherwise every update wipes all accounts.
5. **Update itself** when new code is merged on GitHub.

A hosting service does all five for you. The `Dockerfile` in this repo tells it how to build and start the game.

## Recommended host: Railway

Simple, connects to GitHub directly, supports WebSockets and persistent disks (volumes). Costs about 5 USD/month
(Hobby plan) for a small game like this. Check current pricing on railway.com.

### One-time setup (about 10 minutes)

1. Go to **railway.com** and sign in with your **GitHub** account.
2. Click **New Project** → **Deploy from GitHub repo** → pick **toralmurat-droid/Test** (allow Railway access to it when asked).
3. Open the new service → **Settings**:
   - **Source → Branch**: choose `claude/relaxed-wozniak-cjs85z` (the branch where PRs merge).
   - Railway finds the `Dockerfile` by itself; nothing else to set.
4. Add the save disk: right-click the service (or **+ New** → **Volume**) → **Add Volume**, mount path **`/app/data`**.
5. **Settings → Networking → Generate Domain**. You get an address like `https://yourgame.up.railway.app`.
   Share that link: anyone can play in their browser.

### Automatic updates

With the branch connected in step 3, Railway rebuilds and restarts the game **every time a PR is merged**
(a new commit on that branch). Work done in Claude threads auto-merges, so it reaches the live game a few minutes later.
Saves on the volume are kept across updates. Players are disconnected for a few seconds during each restart.

## How you keep working from here

Nothing changes: keep asking for changes in this project. Threads open PRs, PRs auto-merge, Railway deploys them.
You don't need to touch the server. Railway's **Deployments** tab shows each update and its logs if something breaks.

## Test heroes (`/max`)

Any player can type `/max` in chat: the hero they are playing goes to level 99, learns every skill at max rank
(actives go on keys 1-0), spreads all stat points over the 4 stats, and gets full potions and 100000 gold.
It is saved like normal progress, per class (do it once on each class).

## Good to know

- **Backups**: the volume is the only copy of player accounts. Railway can back up volumes (volume → Backups); turn it on.
- **Only one copy (replica)** of the game must run: the game state and saves live in one process.
- **Own domain** (optional): Settings → Networking → Custom Domain, then add the DNS record Railway shows.
- **Other hosts** work too with the same Dockerfile (Fly.io, Render with a paid disk, a VPS with Docker). The
  rules are the same: build with the Dockerfile, mount a persistent disk at `/app/data`, deploy on each push.

## Run the production version on your computer

```bash
npm ci
npm run build
npm start        # then open http://localhost:2567
```
