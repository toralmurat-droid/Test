// Posts a rendered reel (reels/<slug>/reel.mp4 + the caption in reel.json) to the Instagram account, through the
// Instagram Graph API with a resumable upload (no public video URL needed). Run by .github/workflows/instagram-reel.yml:
//   INSTAGRAM_TOKEN=... node tools/reels/publish.mjs reels/<slug> [--publish]
//   INSTAGRAM_TOKEN=... node tools/reels/publish.mjs --stats <out.json>
// Without --publish it is a dry run: it checks the token, finds the account and prints what it would post.
// --stats writes every post's numbers (likes, comments, and views/reach/saves/shares when the token may read insights).
// The token is only ever sent in headers, never in a URL or the log.
import { readFileSync, writeFileSync, existsSync, statSync, appendFileSync } from "node:fs";
import path from "node:path";

const V = "v21.0", G = `https://graph.facebook.com/${V}`;
const TOKEN = process.env.INSTAGRAM_TOKEN;
const WANT = (process.env.IG_USERNAME || "fmtpa").toLowerCase();
const [dir, flag] = process.argv.slice(2);
const publish = flag === "--publish";
const summary = (t) => { console.log(t); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + "\n"); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : G + url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${method} ${url.split("?")[0]}: ${res.status} ${j.error?.message ?? JSON.stringify(j)}`);
  return j;
}

async function account() {
  const pages = (await api("GET", "/me/accounts?fields=name,instagram_business_account{id,username,followers_count,media_count}")).data ?? [];
  const accts = pages.map((p) => p.instagram_business_account).filter(Boolean);
  const ig = accts.find((a) => a.username?.toLowerCase() === WANT) ?? (accts.length === 1 ? accts[0] : undefined);
  if (!ig) throw new Error(`no Instagram account @${WANT} found on the token's Pages (found: ${accts.map((a) => "@" + a.username).join(", ") || "none"})`);
  return ig;
}

/** Numbers of every post, newest first, for deciding what to try next. Insights need instagram_manage_insights. */
async function stats(out) {
  const ig = await account();
  const media = (await api("GET", `/${ig.id}/media?fields=id,caption,timestamp,permalink,media_product_type,like_count,comments_count&limit=50`)).data ?? [];
  for (const m of media) {
    try {
      const ins = (await api("GET", `/${m.id}/insights?metric=views,reach,saved,shares,total_interactions${m.media_product_type === "REELS" ? ",ig_reels_avg_watch_time" : ""}`)).data ?? [];
      for (const i of ins) m[i.name] = i.values?.[0]?.value ?? i.total_value?.value;
    } catch (e) { m.insights = `unavailable: ${e.message.slice(0, 120)}`; }
    try { m.comments = ((await api("GET", `/${m.id}/comments?fields=text,timestamp,like_count&limit=20`)).data ?? []).map((c) => ({ text: c.text, at: c.timestamp, likes: c.like_count })); } catch { /* none */ }
  }
  const res = { at: new Date().toISOString(), account: ig.username, followers: ig.followers_count, posts: ig.media_count, media };
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + "\n");
  summary("```json\n" + JSON.stringify(res, null, 1).slice(0, 60000) + "\n```");
}

(async () => {
  if (!TOKEN) throw new Error("INSTAGRAM_TOKEN secret is missing");
  if (dir === "--stats") return stats(flag);
  if (!dir) throw new Error("usage: node tools/reels/publish.mjs reels/<slug> [--publish]");
  const reel = JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8"));
  const mp4 = path.join(dir, "reel.mp4");
  if (!existsSync(mp4)) throw new Error(`${mp4} not found: render it first (tools/reels/render.ts)`);
  const posted = path.join(dir, "posted.json");
  if (publish && existsSync(posted) && process.env.FORCE !== "true") throw new Error(`already posted (${posted}); run with force to post it again`);
  const caption = process.env.CAPTION?.trim() || reel.caption;
  const size = statSync(mp4).size;

  // token check (best effort) and the Instagram account behind the Facebook Page
  try {
    const d = (await api("GET", `/debug_token?input_token=${encodeURIComponent(TOKEN)}`)).data;
    if (d?.expires_at) summary(`Token valid: ${d.is_valid}, expires ${new Date(d.expires_at * 1000).toISOString().slice(0, 10)}`);
  } catch { /* not every token may read debug_token */ }
  const ig = await account();
  summary(`Instagram account: @${ig.username}`);
  summary(`Reel: ${mp4} (${(size / 1e6).toFixed(1)} MB)`);
  summary(`Caption:\n\n${caption}\n`);
  if (!publish) { summary("Dry run: nothing posted. Run again with publish ticked to post."); return; }

  // 1) container, 2) upload the file, 3) wait for Instagram to process it, 4) publish
  const { id } = await api("POST", `/${ig.id}/media`, { media_type: "REELS", upload_type: "resumable", caption, share_to_feed: "true" });
  const up = await fetch(`https://rupload.facebook.com/ig-api-upload/${V}/${id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${TOKEN}`, offset: "0", file_size: String(size) },
    body: readFileSync(mp4),
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok || !uj.success) throw new Error(`upload failed: ${up.status} ${JSON.stringify(uj)}`);
  for (let i = 0; ; i++) {
    const s = await api("GET", `/${id}?fields=status_code,status`);
    console.log(`processing: ${s.status_code}`);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram could not process the video: ${s.status}`);
    if (i > 60) throw new Error("Instagram took over 10 minutes to process the video");
    await wait(10000);
  }
  const media = await api("POST", `/${ig.id}/media_publish`, { creation_id: id });
  const { permalink } = await api("GET", `/${media.id}?fields=permalink`);
  writeFileSync(posted, JSON.stringify({ media: media.id, permalink, account: ig.username, at: new Date().toISOString() }, null, 1) + "\n");
  summary(`Posted: ${permalink}`);
})().catch((e) => { console.error("PUBLISH FAILED:", e.message); process.exit(1); });
