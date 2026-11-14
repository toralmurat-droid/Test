import { play } from "./sfx";
import { markNewSong } from "./songbookReader";
import { MATS, SONGS, TRAITS } from "./songbookData";

/**
 * Songweaver DI-2 / DI-5 server events (`broadcast("sfx", ...)`): newsong, matpick, lutefit, break. Each gets a sound
 * and a visible effect; all cosmetic. HOOK(di): the sound names below are existing recipes in sfx.ts; swap for the
 * art-audio ones when they land.
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
      const s = SONGS.find((x) => x.id === ev.song);
      if (mine) { showNewSong(s?.name ?? String(ev.song ?? "")); markNewSong(String(ev.song)); if (s) c.feed(s.learned); play("lootRare"); }
      if (at) { c.float(at.x, at.y - 40, "New song!", "#ffd24d"); for (let i = 0; i < 4; i++) c.burst(at.x + (i - 1.5) * 10, at.y - 30 - i * 5, 5, i % 2 ? 0xffd24d : 0x9fd8ff, 800); }
      if (!mine) play("lutePluck", at?.x, at?.y, 0.5);
      break;
    }
    case "matpick": {
      const m = MATS[ev.mat], x = typeof ev.x === "number" ? ev.x : at?.x, y = typeof ev.y === "number" ? ev.y : at?.y;
      if (x === undefined || y === undefined) break;
      c.float(x, y - 8, `+${Math.max(1, Number(ev.n) || 1)} ${m?.name ?? String(ev.mat)}`, mine ? "#ffe29a" : "#c8b890");
      c.burst(x, y - 4, 4, m?.color ?? 0xffe29a, 350);
      play("pickup", x, y, mine ? 1 : 0.5);
      if (mine && m) c.feed(m.pick);
      break;
    }
    case "lutefit": {
      const t = TRAITS[ev.trait];
      if (!at) break;
      c.float(at.x, at.y - 34, t ? `${t.name} fitted` : "Fitted", "#9fd8ff");
      for (let i = 0; i < 5; i++) c.burst(at.x + (i - 2) * 8, at.y - 14 - (i % 2) * 8, 4, i % 2 ? 0xffd24d : 0xe8d070, 600);
      play("lutePluck", at.x, at.y, mine ? 1 : 0.6);
      if (mine) c.feed("There. Listen. Hear it? That is a different lute.");
      break;
    }
    case "break": {
      const m = MATS[ev.mat];
      if (!at) break;
      c.float(at.x, at.y - 34, `Broken: +${Math.max(0, Number(ev.n) || 0)} ${m?.name ?? String(ev.mat)}`, "#ffb86b");
      for (let i = 0; i < 5; i++) c.burst(at.x + (i - 2) * 7, at.y - 10 + (i % 2) * 5, 3, m?.color ?? 0xb88048, 450);
      play("boneBreak", at.x, at.y, mine ? 0.9 : 0.5);
      if (mine) c.feed(Number(ev.n) > 0 ? "Good wood in there. I'll find a use for it." : "There is not much left in that one.");
      break;
    }
  }
}
