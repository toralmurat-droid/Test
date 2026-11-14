/**
 * The public skills page (/skills, client/skills.html): every skill of every playable hero, with its icon, text and
 * numbers straight from shared/skills.ts, and a clip filmed in the game (tools/skill-clips, refilmed by
 * .github/workflows/skill-clips.yml after a merge that changes skills). So it never needs editing by hand.
 */
import "./pixelfont.css";
import "./skillsPage.css";
import { ACTIVE_CLASSES, CLASSES, type ClassKind } from "../../shared/classes";
import { BRANCHES, CANTRIPS, SKILLS, skillById, maxRank, type SkillDef } from "../../shared/skills";
import { skillIcon } from "./skillIcons";
import { installWeatheredFrames } from "./weathered";
import { assetUrl } from "./assetUrl";

type Clips = { sources: string; clips: Record<string, { ms: number; frames: number }> };

installWeatheredFrames();
const main = document.getElementById("sk-main")!, tabs = document.getElementById("sk-tabs")!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One line of numbers: level, cost, cooldown, ranks. */
function facts(s: SkillDef): string {
  const f: string[] = [];
  if (!s.cantrip) f.push(`Lv ${s.req}`);
  if (s.mana) f.push(`${s.mana} mana`);
  if (s.cost) f.push(`${s.cost} heat`);
  if (s.blood) f.push(`${s.blood}% life`);
  if (s.cd) f.push(`${+(s.cd / 1000).toFixed(1)} s cooldown`);
  if (!s.cantrip) f.push(`${maxRank(s)} ranks`);
  return f.join(" · ");
}

function card(s: SkillDef, clips: Clips, color: string): string {
  const icon = skillIcon(s.id);
  const clip = clips.clips[s.id];
  const upgrade = s.mod ? skillById(s.mod.of) : undefined;
  let view: string;
  if (clip) view = `<img class="sk-clip" src="${assetUrl(`/skills/${s.id}.webp`)}" alt="${esc(s.name)} in the game" loading="lazy" width="576" height="432">`;
  else if (s.passive || upgrade) view = `<div class="sk-still"><img src="${icon}" alt=""><span>${upgrade ? `Makes ${esc(upgrade.name)} stronger` : "Always on"}</span></div>`;
  else view = `<div class="sk-still"><img src="${icon}" alt=""><span>Clip being filmed</span></div>`;
  return `<article class="sk-card" style="--branch:${color}">
    <div class="sk-view">${view}</div>
    <div class="sk-text">
      <h3><img class="sk-icon" src="${icon}" alt="">${esc(s.name)}<small>${esc(s.cantrip ? "Basic spell" : s.type)}</small></h3>
      <p class="sk-facts">${esc(facts(s))}</p>
      <p>${esc(s.desc)}</p>
      ${s.rankStep ? `<p class="sk-rank">Each rank: ${esc(s.rankStep)}</p>` : ""}
    </div>
  </article>`;
}

function show(cls: ClassKind, clips: Clips) {
  tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.cls === cls));
  const C = CLASSES[cls];
  let html = `<section class="sk-class"><h2>${esc(C.name)}</h2><p class="sk-help">${esc(C.blurb)}</p>`;
  const basics = CANTRIPS[cls] ?? [];
  if (basics.length) html += `<h3 class="sk-branch">Basic spells</h3><div class="sk-grid">${basics.map((s) => card(s, clips, "#c9a45a")).join("")}</div>`;
  BRANCHES[cls].forEach((b, i) => {
    const list = SKILLS[cls].filter((s) => s.branch === i).sort((a, z) => a.req - z.req);
    if (list.length) html += `<h3 class="sk-branch" style="color:${b.color}">${esc(b.name)}</h3><div class="sk-grid">${list.map((s) => card(s, clips, b.color)).join("")}</div>`;
  });
  main.innerHTML = html + "</section>";
  try { localStorage.setItem("skillsPageCls", cls); } catch { /* storage off */ }
  if (location.hash !== `#${cls}`) history.replaceState(null, "", `#${cls}`);
}

(async () => {
  let clips: Clips = { sources: "", clips: {} };
  try { const r = await fetch(assetUrl("/skills/clips.json")); if (r.ok) clips = await r.json(); } catch { /* no clips yet: icons only */ }
  for (const cls of ACTIVE_CLASSES) {
    const b = document.createElement("button");
    b.dataset.cls = cls; b.textContent = CLASSES[cls].name;
    b.onclick = () => show(cls, clips);
    tabs.appendChild(b);
  }
  let first = location.hash.slice(1) as ClassKind;
  if (!ACTIVE_CLASSES.includes(first)) { try { first = localStorage.getItem("skillsPageCls") as ClassKind; } catch { /* storage off */ } }
  show(ACTIVE_CLASSES.includes(first) ? first : ACTIVE_CLASSES[0], clips);
})();
