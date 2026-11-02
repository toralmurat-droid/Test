import { CLASSES, ClassKind } from "../../shared/classes";
import { CHAR_BASE, CHAR_EXT, HD_CHARS } from "./artAssets";

/**
 * Hero picker for the start menu: one equal-size card per class with the hero's sprite animated
 * on a little patch of grass. Idle heroes breathe and fidget; the selected hero shows off its moves.
 */
interface AnimDef { frames: number[]; fps: number; loop: boolean }
interface Meta { columns: number; frameWidth: number; animations: Record<string, AnimDef> }

const BASE = CHAR_BASE;
const SCALE = 2; // card size in 32px design units; the frame is meta.frameWidth px
const SHOWCASE = ["idle3", "swing1", "swing2", "attack3", "skill", "cheer"];

export function mountHeroCards(host: HTMLElement, kinds: ClassKind[], selected: ClassKind, onPick: (k: ClassKind) => void) {
  host.innerHTML = "";
  host.setAttribute("role", "radiogroup");
  host.setAttribute("aria-label", "Choose your hero");
  const cards = kinds.map((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "herocard";
    b.setAttribute("role", "radio");
    b.dataset.kind = k;
    const cv = document.createElement("canvas");
    cv.width = 32 * SCALE; cv.height = 32 * SCALE;
    const name = document.createElement("span");
    name.className = "hcname"; name.textContent = CLASSES[k].name;
    const skill = document.createElement("span");
    skill.className = "hcskill"; skill.textContent = CLASSES[k].special.name;
    b.append(cv, name, skill);
    b.onclick = () => { select(k); onPick(k); };
    host.appendChild(b);
    return { k, b, cv, ctx: cv.getContext("2d")!, img: null as HTMLImageElement | null, anim: "idle", t0: 0, hover: false, step: 0, nextFidget: 2500 + Math.random() * 4000 };
  });
  for (const c of cards) {
    c.b.onpointerenter = () => { c.hover = true; };
    c.b.onpointerleave = () => { c.hover = false; };
  }

  let current = selected;
  function select(k: ClassKind) {
    current = k;
    const now = performance.now();
    for (const c of cards) {
      const on = c.k === k;
      c.b.classList.toggle("sel", on);
      c.b.setAttribute("aria-checked", String(on));
      c.anim = on ? "cheer" : "idle"; c.t0 = now; c.step = 0;
    }
  }
  select(selected);

  let meta: Meta | null = null;
  fetch(`${BASE}/characters.json`).then((r) => r.json()).then((m) => { meta = m; }).catch(() => { /* cards still show names */ });
  for (const c of cards) { const i = new Image(); i.onload = () => { c.img = i; }; i.src = `${BASE}/${c.k}.${CHAR_EXT}`; }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  const duration = (a: AnimDef) => (a.frames.length * 1000) / a.fps;
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    if (!meta) return;
    for (const c of cards) {
      if (!c.img) continue;
      const sel = c.k === current;
      const get = (n: string) => meta!.animations[`${n}_down`];
      let a = get(c.anim) ?? get("idle");
      // advance the little routine
      if (!reduce) {
        const t = now - c.t0;
        if (sel) {
          if (c.anim === "idle" && t > 700) { c.anim = SHOWCASE[c.step++ % SHOWCASE.length]; c.t0 = now; }
          else if (c.anim !== "idle" && t > duration(a) + 250) { c.anim = "idle"; c.t0 = now; }
        } else if (c.hover) {
          if (c.anim !== "walk") { c.anim = "walk"; c.t0 = now; }
        } else if (c.anim === "walk") { c.anim = "idle"; c.t0 = now; }
        else if (c.anim === "idle" && t > c.nextFidget) { c.anim = Math.random() < 0.5 ? "idle2" : "idle3"; c.t0 = now; c.nextFidget = 3000 + Math.random() * 5000; }
        else if (c.anim !== "idle" && c.anim !== "walk" && t > duration(a)) { c.anim = "idle"; c.t0 = now; }
        a = get(c.anim) ?? get("idle");
      }
      const t = reduce ? 0 : now - c.t0;
      let i = Math.floor(t / (1000 / a.fps));
      i = a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1);
      const f = a.frames[i], fw = meta.frameWidth, cols = meta.columns;
      c.ctx.imageSmoothingEnabled = HD_CHARS;
      c.ctx.clearRect(0, 0, c.cv.width, c.cv.height);
      c.ctx.drawImage(c.img, (f % cols) * fw, Math.floor(f / cols) * fw, fw, fw, 0, 0, 32 * SCALE, 32 * SCALE);
    }
  }
  raf = requestAnimationFrame(tick);
  return { select, stop: () => cancelAnimationFrame(raf) };
}
