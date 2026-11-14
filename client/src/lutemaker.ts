import { gearDef, gearName, itemLevel, itemRarity, TIER_NAMES } from "../../shared/gear";
import { parseRune } from "../../shared/runes";
import { breakEstimate, isBound, isLute, luteTraits, MATS, TRAITS, TRAIT_GROUPS, type TraitInfo } from "./songbookData";
import { itemColor, rarityLabel } from "./gear";

/**
 * The lute-maker's panel (DI-5 D2, Wren, NPC `lutemaker`): Traits, Shop (the normal shop page) and Break tabs, and the
 * materials strip. HTML only; npcs.ts binds the buttons and sends "lutefit" { trait } / "break" { bag }. The server
 * decides every fit and break; lock reasons here are display (they mirror the content doc, section 6).
 * HOOK(di): trait levels and costs are the client copy in songbookData.ts until shared/songbook.ts exists.
 */
export type LmTab = "traits" | "shop" | "break";
export interface LmState { tab: LmTab; gold: number; level: number; cls?: string; weapon?: string; bag: string[]; mats: Record<string, number>; msg: string; breakAsk: number; hasShop: boolean }

export function lmTabsHtml(tab: LmTab, hasShop: boolean): string {
  const t = (id: LmTab, label: string) => `<button class="lm-tab${tab === id ? " on" : ""}" data-tab="${id}">${label}</button>`;
  return `<div class="lm-tabs">${t("traits", "Traits")}${hasShop ? t("shop", "Shop") : ""}${t("break", "Break")}</div>`;
}

/** Strip of the six materials with the counts from the "songbook" message. */
export function matsHtml(mats: Record<string, number>): string {
  return `<div class="lm-mats">${Object.values(MATS).map((m) => `<span class="lm-matc" title="${m.desc}"><span class="lm-mat" data-mat="${m.id}"></span>${mats[m.id] ?? 0}<small>${m.name}</small></span>`).join("")}</div>`;
}

const costLine = (t: TraitInfo, s: LmState) => [
  `<span class="${s.gold < t.gold ? "sh-need" : ""}">${t.gold.toLocaleString("en-US")} gold</span>`,
  ...Object.entries(t.mats).map(([m, n]) => `<span class="${(s.mats[m] ?? 0) < n ? "sh-need" : ""}">${n} ${MATS[m]?.name ?? m}</span>`),
].join(" · ");

/** Why a trait can't be fitted now (content doc "Lock reasons"), or "". */
export function traitLock(t: TraitInfo, s: LmState): string {
  if (s.cls !== "songweaver" || !s.weapon || !isLute(s.weapon)) return "Only a minstrel's lute can be fitted.";
  if (s.level < t.level) return `Needs level ${t.level}.`;
  const short = Object.entries(t.mats).find(([m, n]) => (s.mats[m] ?? 0) < n);
  if (short) return `Needs more ${MATS[short[0]]?.name ?? short[0]}.`;
  if (s.gold < t.gold) return "That costs more than you carry.";
  return "";
}

function traitsHtml(s: LmState): string {
  const fitted = s.weapon ? luteTraits(s.weapon) : [];
  return TRAIT_GROUPS.map((g) => {
    const rows = Object.values(TRAITS).filter((t) => t.group === g).map((t) => {
      const on = fitted.includes(t.id), lock = on ? "" : traitLock(t, s), taken = !on && fitted.some((f) => TRAITS[f]?.group === g);
      return `<div class="sh-row lm-trait"><span class="sh-info"><b style="color:${t.exotic ? "#7a3fa8" : "#3d5a1e"}">${t.name}${t.exotic ? " (exotic)" : ""} <span class="lm-lv">Lv ${t.level}</span></b>` +
        `<small>${t.desc}</small><small class="lm-cost">${costLine(t, s)}</small>` +
        `${lock ? `<small class="sh-need">${lock}</small>` : taken ? `<small>That part already has a fitting. Changing it costs again.</small>` : ""}</span>` +
        `<button class="lm-fit sh-buy" data-trait="${t.id}"${on || lock ? " disabled" : ""}>${on ? "Fitted" : taken ? "Change" : "Fit"}</button></div>`;
    }).join("");
    return `<h5 class="sh-lv">${g}</h5>${rows}`;
  }).join("");
}

function breakHtml(s: LmState): string {
  const rows = s.bag.map((id, i) => [id, i] as const).filter(([id]) => {
    if (parseRune(id) || isBound(id)) return false; // bound items are not listed
    const d = gearDef(id);
    return !!d && (d.slot === "weapon" || d.slot === "shield");
  }).map(([id, i]) => {
    const d = gearDef(id)!, y = breakEstimate(id, d.slot, d.tier, itemRarity(id), itemLevel(id)), ask = s.breakAsk === i;
    return `<div class="sh-row"><span class="sh-icon" data-icon="${id}"></span><span class="sh-info"><b style="color:${itemColor(id)}">${gearName(id, s.cls)}</b>` +
      `<small>${rarityLabel(id)}${TIER_NAMES[d.tier]} · Lv ${itemLevel(id)} · about +${y.n} ${MATS[y.mat].name} <i>(estimate)</i></small></span>` +
      `<button class="lm-break sh-sell" data-i="${i}">${ask ? "Sure?" : "Break"}</button></div>`;
  });
  return `<p class="sh-empty">Weapons give tonewood, shields and books give brass, more for a better tier and rarity. Runes come back to your bag. It cannot be put back.</p>` +
    (rows.length ? rows.join("") : `<p class="sh-empty">No weapons or shields in your bag to break.</p>`);
}

/** The panel body for the Traits and Break tabs (the Shop tab is the normal shop page). */
export function lutemakerBody(s: LmState): string {
  return `<div class="sh-gold">Your gold: <b>${s.gold}</b> ${s.msg}</div>${matsHtml(s.mats)}` + (s.tab === "break" ? breakHtml(s) : traitsHtml(s));
}
