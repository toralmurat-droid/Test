import { gearDef, gearName, isLute, itemLevel, luteTraits, TIER_NAMES } from "../../shared/gear";
import { LUTE_GROUPS, LUTE_GROUP_NAMES, LUTE_TRAITS, MATERIALS, MATERIAL_IDS, type LuteTrait, type MaterialId } from "../../shared/lute";
import { breakYield, fitProblem } from "../../shared/lutemaker";
import { itemColor, rarityLabel } from "./gear";

/**
 * The lute-maker's panel (DI-5 D2, Wren, NPC `lutemaker`): Traits, Shop (the normal shop page) and Break tabs, and the
 * materials strip. HTML only; npcs.ts binds the buttons and sends "lutefit" { trait } / "break" { bag }. The server
 * decides every fit and break; the lock reasons and yields are shared/lutemaker.ts (fitProblem, breakYield).
 */
export type LmTab = "traits" | "shop" | "break";
export interface LmState { tab: LmTab; gold: number; level: number; cls?: string; weapon?: string; bag: string[]; mats: Record<string, number>; msg: string; breakAsk: number; hasShop: boolean }

export function lmTabsHtml(tab: LmTab, hasShop: boolean): string {
  const t = (id: LmTab, label: string) => `<button class="lm-tab${tab === id ? " on" : ""}" data-tab="${id}">${label}</button>`;
  return `<div class="lm-tabs">${t("traits", "Traits")}${hasShop ? t("shop", "Shop") : ""}${t("break", "Break")}</div>`;
}

/** Strip of the six materials with the counts from the "songbook" message. */
export function matsHtml(mats: Record<string, number>): string {
  return `<div class="lm-mats">${MATERIAL_IDS.map((id) => `<span class="lm-matc" title="${MATERIALS[id].desc}"><span class="lm-mat" data-mat="${id}"></span>${mats[id] ?? 0}<small>${MATERIALS[id].name}</small></span>`).join("")}</div>`;
}

const costLine = (t: LuteTrait, s: LmState) => [
  `<span class="${s.gold < t.gold ? "sh-need" : ""}">${t.gold.toLocaleString("en-US")} gold</span>`,
  ...(Object.entries(t.mats) as [MaterialId, number][]).map(([m, n]) => `<span class="${(s.mats[m] ?? 0) < n ? "sh-need" : ""}">${n} ${MATERIALS[m].name}</span>`),
].join(" · ");

/** Why a trait can't be fitted now (Wren's own words, shared/lutemaker.ts WREN), or "". */
export function traitLock(t: LuteTrait, s: LmState): string {
  return fitProblem({ cls: s.cls ?? "", level: s.level, gold: s.gold, weapon: s.weapon ?? "", mats: s.mats }, t.id);
}

function traitsHtml(s: LmState): string {
  const fitted = s.weapon && isLute(s.weapon) ? luteTraits(s.weapon) : [];
  return LUTE_GROUPS.map((g) => {
    const rows = LUTE_TRAITS.filter((t) => t.group === g).map((t) => {
      const on = fitted.includes(t.id), lock = on ? "" : traitLock(t, s), taken = !on && fitted.some((f) => LUTE_TRAITS.find((x) => x.id === f)?.group === g);
      return `<div class="sh-row lm-trait"><span class="sh-info"><b style="color:${t.exotic ? "#7a3fa8" : "#3d5a1e"}">${t.name}${t.exotic ? " (exotic)" : ""} <span class="lm-lv">Lv ${t.level}</span></b>` +
        `<small>${t.desc}</small><small class="lm-cost">${costLine(t, s)}</small>` +
        `${lock ? `<small class="sh-need">${lock}</small>` : taken ? `<small>That part already has a fitting. Changing it costs again.</small>` : ""}</span>` +
        `<button class="lm-fit sh-buy" data-trait="${t.id}"${on || lock ? " disabled" : ""}>${on ? "Fitted" : taken ? "Change" : "Fit"}</button></div>`;
    }).join("");
    return `<h5 class="sh-lv">${LUTE_GROUP_NAMES[g]}</h5>${rows}`;
  }).join("");
}

function breakHtml(s: LmState): string {
  const rows = s.bag.map((id, i) => [id, i, breakYield(id)] as const).filter(([, , y]) => !!y).map(([id, i, y]) => {
    const d = gearDef(id)!, ask = s.breakAsk === i;
    return `<div class="sh-row"><span class="sh-icon" data-icon="${id}"></span><span class="sh-info"><b style="color:${itemColor(id)}">${gearName(id, s.cls)}</b>` +
      `<small>${rarityLabel(id)}${TIER_NAMES[d.tier]} · Lv ${itemLevel(id)} · gives +${y!.n} ${MATERIALS[y!.mat].name}</small></span>` +
      `<button class="lm-break sh-sell" data-i="${i}">${ask ? "Sure?" : "Break"}</button></div>`;
  });
  return `<p class="sh-empty">Weapons give tonewood, shields and books give brass, more for a better tier and rarity. Runes come back to your bag. It cannot be put back.</p>` +
    (rows.length ? rows.join("") : `<p class="sh-empty">No weapons or shields in your bag to break.</p>`);
}

/** The panel body for the Traits and Break tabs (the Shop tab is the normal shop page). */
export function lutemakerBody(s: LmState): string {
  return `<div class="sh-gold">Your gold: <b>${s.gold}</b> ${s.msg}</div>${matsHtml(s.mats)}` + (s.tab === "break" ? breakHtml(s) : traitsHtml(s));
}
