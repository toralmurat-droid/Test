/**
 * The public roadmap page (/roadmap, client/roadmap.html): milestones and items from roadmap.ts, and the latest
 * patch notes (client/patchnotes/), so "what shipped" updates by itself with every PR.
 */
import "./pixelfont.css";
import "./skillsPage.css";
import { installWeatheredFrames } from "./weathered";
import { MILESTONES, RISKS, TEAM, type Item, type Status } from "./roadmap";
import { PATCH_NOTES } from "./patchnotes";

installWeatheredFrames();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const LABEL: Record<Status, string> = { done: "Done", doing: "In progress", next: "Next", later: "Planned", blocked: "Waiting" };
const PR = (n?: number) => (n ? ` <span class="rm-pr">#${n}</span>` : "");

const item = (i: Item) => `<li class="rm-item rm-${i.status}">
  <span class="rm-badge">${LABEL[i.status]}</span>
  <span class="rm-name">${esc(i.name)}${PR(i.pr)}${i.note ? `<small>${esc(i.note)}</small>` : ""}</span>
  <span class="rm-owner">${esc(i.owner)}</span>
</li>`;

const done = (items: Item[]) => items.filter((i) => i.status === "done").length;
const pct = (items: Item[]) => (items.length ? Math.round((done(items) / items.length) * 100) : 0);
const all = MILESTONES.flatMap((m) => (m.id === "LIVE" ? [] : m.items));
const now = MILESTONES.find((m) => m.id !== "LIVE" && m.items.some((i) => i.status !== "done")) ?? MILESTONES[0];

document.getElementById("sk-main")!.innerHTML = `
<section class="sk-class">
  <h3 class="sk-branch">Where we are</h3>
  <div class="rm-now sk-card">
    <p>Now: <b>${esc(now.id)} · ${esc(now.name)}</b>. ${esc(now.goal)}</p>
    <div class="rm-bar"><i style="width:${pct(all)}%"></i></div>
    <p class="sk-help">${done(all)} of ${all.length} planned items done across milestones M0–M6.</p>
    ${all.filter((i) => i.status === "blocked").map((i) => `<p class="rm-wait">Waiting: ${esc(i.name)}${i.note ? `. ${esc(i.note)}` : ""}</p>`).join("")}
  </div>
</section>
<section class="sk-class">
  <h3 class="sk-branch">Milestones</h3>
  <div class="rm-ms">${MILESTONES.map((m) => `<article class="sk-card rm-card">
    <div class="rm-head"><span class="rm-id">${esc(m.id)}</span><h3>${esc(m.name)}</h3><span class="rm-when">${esc(m.target)}</span></div>
    <p>${esc(m.goal)}</p>
    <div class="rm-bar"><i style="width:${pct(m.items)}%"></i></div>
    <ul class="rm-list">${m.items.map(item).join("")}</ul>
    <p class="rm-exit"><b>Done when:</b> ${esc(m.exit)}</p>
  </article>`).join("")}</div>
</section>
<section class="sk-class">
  <h3 class="sk-branch">Latest shipped</h3>
  <p class="sk-help">From the in-game patch notes, newest first.</p>
  <div class="sk-grid">${PATCH_NOTES.slice(0, 9).map((n) => `<article class="sk-card"><div class="sk-text">
    <h3>${esc(n.title)}<small>${esc(n.date)}</small></h3>
    ${n.changes.map((c) => `<p>${esc(c)}</p>`).join("")}
  </div></article>`).join("")}</div>
</section>
<section class="sk-class">
  <h3 class="sk-branch">The studio</h3>
  <p class="sk-help">Every role a game studio would staff, and who fills it here.</p>
  <div class="sk-grid">${TEAM.map((r) => `<article class="sk-card"><div class="sk-text">
    <h3>${esc(r.role)}</h3><p class="sk-facts">${esc(r.who)}</p><p>${esc(r.does)}</p>
  </div></article>`).join("")}</div>
</section>
<section class="sk-class">
  <h3 class="sk-branch">Risks we watch</h3>
  <div class="sk-grid">${RISKS.map((r) => `<article class="sk-card"><div class="sk-text">
    <h3>${esc(r.risk)}</h3><p>${esc(r.plan)}</p>
  </div></article>`).join("")}</div>
</section>`;
