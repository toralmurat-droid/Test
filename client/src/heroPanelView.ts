import type { ClassKind } from "../../shared/classes";
import type { Sheet } from "../../shared/heroSheet";
import type { StatKind } from "../../shared/powers";
import { ELEMENTS, ELEMENT_NAMES } from "../../shared/elements";
import { ATTR_TAG, attrEffect, pointsRule, toneOf } from "./heroText";
import { glyphUrl } from "./plateArt";
import { icon } from "./pixelicons";

/**
 * HTML of the Character tab (TownScene.showHeroMenu feeds it): left column name, XP, stat points and the four
 * attributes; right column Offense, Defense and Resistances. Pure drawing: every number is passed in, computed by
 * `shared/` rules (heroSheet.ts and friends). A hovered + or item passes `next`, which adds the green / red changes.
 */
export interface HeroPanelData {
  name: string; cls: ClassKind; className: string; level: number; maxLevel: number;
  xp: number; xpNeed: number;
  free: number; /** level-up highlight: the level just reached */ levelUp?: number;
  attrs: { k: StatKind; name: string; value: number; placed: number; gear: number }[];
  main: StatKind;
  sheet: Sheet; next?: Sheet;
  /** Basic attack words ("Staff: fireballs"), attack speed (hits/s), initiative. */
  attackWords: string; hitsPerSec: number; poise: number;
  hpRegenRest: number; hpRegenFight: number;
  gauge: boolean; manaRegen: number; manaRestMult: number; mana: number; maxMana: number;
  kills: number; gold: number; devoured: string[];
  titlesHtml: string; reactions: string;
  previewLabel?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const q = (tip: string) => `<span class="hq" data-tip="${esc(tip)}">?</span>`;

export function heroPanelParts(d: HeroPanelData) {
  const title = `<span class="hname">${esc(d.name)}</span><span class="hcls">${esc(d.className)} · level ${d.level}</span>`;
  const maxed = d.level >= d.maxLevel;
  const frac = maxed ? 1 : Math.max(0, Math.min(1, d.xp / Math.max(1, d.xpNeed)));
  const xp = `<div class="hxpbar" data-tip="${maxed ? "Max level" : `Experience ${d.xp} / ${d.xpNeed}`}"><i style="width:${Math.round(frac * 100)}%"></i></div>`;
  const pts = `<div class="hpts${d.levelUp !== undefined ? " lvlup" : ""}${d.free > 0 ? " has" : ""}"><span>${d.levelUp !== undefined ? `<em>Level ${d.levelUp}!</em> ` : ""}Stat points ${q(pointsRule())}</span><b>${d.free}</b></div>`;
  const attrs = d.attrs.map((a) => {
    const t = ATTR_TAG[a.k];
    const src = [a.placed ? `${a.placed} placed` : "", a.gear ? `${a.gear} from gear` : ""].filter(Boolean).join(", ");
    return `<div class="attr attr-${a.k}${a.k === d.main ? " main" : ""}" style="--ac:${t.color}">` +
      `<span class="aname"${src ? ` data-tip="${src}"` : ""}><span class="atag">${t.tag}</span>${a.name}</span>` + // where the points come from: in the tooltip
      `<b class="aval">${a.value}</b>` +
      `<button class="statplus" data-stat="${a.k}" aria-label="Add a point to ${a.name}"${d.free > 0 ? "" : " disabled"}>+</button>` +
      `<span class="aeff">${attrEffect(a.k, d.cls)}</span></div>`;
  }).join("");

  // ---- right column ----
  const { sheet: now, next } = d;
  const nx = next ?? now;
  const delta = (v: number, n: number, pct = false) => { const x = n - v; return x ? `<em class="${x > 0 ? "up" : "down"}">${x > 0 ? "+" : ""}${x}${pct ? "%" : ""}</em>` : ""; };
  const row = (label: string, key: string, val: string, dim = "", dl = "", tip = "") =>
    `<div class="hrow"${tip ? ` data-tip="${esc(tip)}"` : ""}><span>${label}</span><b class="t-${toneOf(key)}">${val}${dim ? ` <i>· ${dim}</i>` : ""}</b>${dl}</div>`;
  const k = (key: keyof Sheet, pct = false) => delta(now[key] as number, nx[key] as number, pct);
  const sec = (cls: string, mark: string, text: string, body: string) => `<h3 class="hsec ${cls}">${icon(mark)}${text}</h3>${body}`;
  const offense = sec("off", "swords", "Offense",
    row("Spell damage", "spell", `${nx.spell}%`, "", k("spell", true)) +
    row("Attack", "atk", `${nx.atk}`, d.attackWords, k("atk")) +
    row("Damage per second", "dps", `${nx.dps}`, "", k("dps"), "Basic attack damage per second, critical hits included") +
    row("Attack speed", "rate", `${d.hitsPerSec.toFixed(1)} hits/s`) +
    row("Critical hits", "crit", `${nx.crit}%`, "double damage", k("crit", true)));
  const defense = sec("def", "shield", "Defense",
    row("Health", "hp", `${nx.hp}`, `${d.hpRegenRest.toFixed(1)}/s resting`, k("hp"), `Regen ${d.hpRegenRest.toFixed(1)} HP/s resting, ${d.hpRegenFight.toFixed(1)} HP/s in a fight`) +
    (d.gauge ? row("Song gauge", "mana", `${d.maxMana}`, "no regen", k("mana"))
      : row("Mana", "mana", `${nx.mana}`, `${d.manaRegen.toFixed(1)}/s`, k("mana"), `Regen ${d.manaRegen.toFixed(1)}/s, ×${d.manaRestMult} when resting`)) +
    row("Damage blocked", "def", `${nx.def}%`, "", k("def", true)) +
    row("Move speed", "speed", `${nx.speed}`, "", k("speed")) +
    row("Initiative", "poise", `${d.poise}`, "dizzy at 0"));
  const res = ELEMENTS.map((e) => {
    const v = now.res[e] ?? 0, n = nx.res[e] ?? 0;
    return `<span class="hres${v || n ? "" : " zero"}" data-tip="${ELEMENT_NAMES[e]} resistance"><img src="${glyphUrl(e, ({ fire: "#ff8a3c", cold: "#8fd8ff", poison: "#9bdc4a", faith: "#ffe08a", shock: "#b8a8ff" } as Record<string, string>)[e])}" alt="">` +
      `<b>${n}%</b>${delta(v, n)}</span>`;
  }).join("");
  const resist = `<h3 class="hsec">Resistances ${q(d.reactions)}</h3><div class="hress">${res}</div>`;
  const devoured = d.devoured.length ? `<h3 class="hsec">Devoured</h3>${d.devoured.map((l) => `<div class="hrow"><span>${l}</span></div>`).join("")}` : "";
  const foot = `<div class="hfoot">Kills ${d.kills} · Gold ${d.gold}</div>`;
  const hint = next && d.previewLabel ? `<div class="hnote">If you ${esc(d.previewLabel)}</div>` : "";
  return { title, xp, pts, attrs, right: offense + defense + resist + devoured + foot + hint + d.titlesHtml };
}
