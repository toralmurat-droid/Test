import { markNewSong } from "./songbookReader";
import { MATERIALS, LUTE_TRAITS } from "../../shared/lute";
import { songById } from "../../shared/songbook";
import { WREN } from "../../shared/lutemaker";
import { MAT_COLOR } from "./matArt";

/**
 * Songweaver DI-2 / DI-5 server events (`broadcast("sfx", ...)`): newsong, matpick, lutefit, break. Each gets a sound
 * and a visible effect; all cosmetic. The sounds are in sfx.ts.
 */
export interface DiCtx {
  me: string;
  /** World position of a hero, or undefined. */
  pos(id: string): { x: number; y: number } | undefined;
  float(x: number, y: number, text: string, color: string): void;
  burst(x: number, y: number, r: number, color: number, ms: number): void;
  feed(text: string): void;
}

let banner: HTMLDivElement | undefined;
let bannerTimer = 0;
/** The "New song!" banner (DOM, pixel font, fades out). */
export function showNewSong(name: string) {
  if (!banner) { banner = document.createElement("div"); banner.id = "newsong"; document.body.appendChild(banner); }
  banner.innerHTML = `New song!<small>${name}</small>`;
  banner.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => banner!.classList.remove("show"), 3800);
}

export const DI_EVENTS = new Set(["newsong", "matpick", "lutefit", "break"]);

/** Handles one of DI_EVENTS. Read defensively: unknown ids still show something. */
export function diEvent(ev: any, c: DiCtx) {
  const mine = ev.id === c.me, at = c.pos(ev.id) ?? (typeof ev.x === "number" ? { x: ev.x, y: ev.y } : undefined);
  switch (ev.ev) {
    case "newsong": {
      const s = songById(ev.song);
      if (mine) { showNewSong(s?.name ?? String(ev.song ?? "")); markNewSong(String(ev.song)); if (s) c.feed(s.learned); }
      if (at) { c.float(at.x, at.y - 40, "New song!", "#ffd24d"); for (let i = 0; i < 4; i++) c.burst(at.x + (i - 1.5) * 10, at.y - 30 - i * 5, 5, i % 2 ? 0xffd24d : 0x9fd8ff, 800); }
      break;
    }
    case "matpick": {
      const m = (MATERIALS as Record<string, (typeof MATERIALS)["tonewood"]>)[ev.mat], x = typeof ev.x === "number" ? ev.x : at?.x, y = typeof ev.y === "number" ? ev.y : at?.y;
      if (x === undefined || y === undefined) break;
      c.float(x, y - 8, `+${Math.max(1, Number(ev.n) || 1)} ${m?.name ?? String(ev.mat)}`, mine ? "#ffe29a" : "#c8b890");
      c.burst(x, y - 4, 4, MAT_COLOR[ev.mat]?.color ?? 0xffe29a, 350);
      if (mine && m) c.feed(m.pick);
      break;
    }
    case "lutefit": {
      const t = LUTE_TRAITS.find((x) => x.id === ev.trait);
      if (!at) break;
      c.float(at.x, at.y - 34, t ? `${t.name} fitted` : "Fitted", "#9fd8ff");
      for (let i = 0; i < 5; i++) c.burst(at.x + (i - 2) * 8, at.y - 14 - (i % 2) * 8, 4, i % 2 ? 0xffd24d : 0xe8d070, 600);
      if (mine) c.feed(WREN.fitted);
      break;
    }
    case "break": {
      const m = (MATERIALS as Record<string, (typeof MATERIALS)["tonewood"]>)[ev.mat];
      if (!at) break;
      c.float(at.x, at.y - 34, `Broken: +${Math.max(0, Number(ev.n) || 0)} ${m?.name ?? String(ev.mat)}`, "#ffb86b");
      for (let i = 0; i < 5; i++) c.burst(at.x + (i - 2) * 7, at.y - 10 + (i % 2) * 5, 3, MAT_COLOR[ev.mat]?.color ?? 0xb88048, 450);
      if (mine) c.feed(Number(ev.n) > 0 ? WREN.broken : WREN.nothing);
      break;
    }
  }
}
