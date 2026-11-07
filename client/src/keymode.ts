/**
 * Keyboard layouts (Murat 2026-11-07), picked in the game menu (Esc) and remembered in the browser.
 *
 *   classic: WASD walk, skills on 1-0, Q / V potions, C character, G bag, T skills, E use, F dodge, R ranged weapon.
 *   spells:  Diablo style. The mouse walks (WASD do not), spells on W E R T 1 2 3 4 5, C bag, D / F potions,
 *            H character, K skills, G use, X dodge, Q ranged weapon. Arrow keys still walk.
 *
 * Keys are matched by the letter typed (so they follow the keyboard's own layout) and, for digits, by the key's
 * place on the keyboard (on AZERTY the top row types &é"... without Shift).
 */
export type KeyMode = "classic" | "spells";
export type KeyAction = "potion" | "mana" | "ranged" | "dodge" | "hero" | "interact" | "bag" | "tree";

interface Layout { slots: string[]; actions: Record<KeyAction, string>; name: string }

const LAYOUTS: Record<KeyMode, Layout> = {
  classic: {
    name: "Classic (WASD, skills 1-0)",
    slots: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    actions: { potion: "Q", mana: "V", ranged: "R", dodge: "F", hero: "C", interact: "E", bag: "G", tree: "T" },
  },
  spells: {
    name: "Spell keys (W E R T 1-5, mouse walks)",
    slots: ["W", "E", "R", "T", "1", "2", "3", "4", "5"],
    actions: { potion: "D", mana: "F", ranged: "Q", dodge: "X", hero: "H", interact: "G", bag: "C", tree: "K" },
  },
};

const STORE = "keymode";
let mode: KeyMode = (() => {
  try { return localStorage.getItem(STORE) === "spells" ? "spells" : "classic"; } catch { return "classic"; }
})();
const listeners: (() => void)[] = [];

export const keyMode = () => mode;
export const keyModeName = (m: KeyMode = mode) => LAYOUTS[m].name;
export function setKeyMode(m: KeyMode) {
  mode = m;
  try { localStorage.setItem(STORE, m); } catch { /* storage off */ }
  for (const f of listeners) f();
}
export function onKeyMode(f: () => void) { listeners.push(f); }

/** WASD walk in this layout? (In "spells" W is a spell key: the mouse walks.) */
export const wasdWalks = () => mode === "classic";

/** Label of skill slot n's key ("" when the layout has no key for it). */
export const slotKey = (n: number) => LAYOUTS[mode].slots[n] ?? "";
/** How many skill slots have a key in this layout (10 classic, 9 spell keys). */
export const slotCount = () => LAYOUTS[mode].slots.length;
/** Label of an action's key. */
export const actionKey = (a: KeyAction) => LAYOUTS[mode].actions[a];

/** The key an event stands for, as the layouts write it: "W", "1"... */
function keyOf(ev: KeyboardEvent): string {
  const d = /^(?:Digit|Numpad)(\d)$/.exec(ev.code);
  if (d) return d[1];
  return ev.key.length === 1 ? ev.key.toUpperCase() : "";
}

/** Skill slot this key casts in the current layout, or -1. */
export function slotOfKey(ev: KeyboardEvent): number {
  const k = keyOf(ev);
  return k ? LAYOUTS[mode].slots.indexOf(k) : -1;
}

/** Action this key does in the current layout. */
export function actionOfKey(ev: KeyboardEvent): KeyAction | undefined {
  const k = keyOf(ev);
  if (!k) return undefined;
  const acts = LAYOUTS[mode].actions;
  return (Object.keys(acts) as KeyAction[]).find((a) => acts[a] === k);
}
