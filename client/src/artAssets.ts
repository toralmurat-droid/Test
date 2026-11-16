import Phaser from "phaser";
import { SMOOTH } from "./isoflag";

/**
 * Generated pixel art (see tools/art, run `npm run art`).
 * Characters: 32x32 design frames rendered at CHAR_FRAME px, animations `${char}_${anim}_${dir}`; dir is down | up | right
 * (flipX for left), plus downright | upright (flipX for downleft | upleft) in the iso sheets.
 * Props/items: texture atlases "props" and "items" with frame names like "barrel", "potion_health".
 */
export const CHARACTERS = ["ninja", "wizard", "knight", "archer", "barbarian", "vampire", "summoner", "songweaver", "blacksmith", "merchant", "villager", "guard", "druid", "witch", "watchman", "peasant", "farmwife", "labourer", "elder", "goodwife", "wellkeeper", "sandcaptain", "spicetrader", "desertsmith", "armourer", "saltarmourer", "sandarmourer", "huntsman", "miller", "forester", "beachcomber", "prospector", "caravaneer", "hermit", "dunescout", "defector", "monk", "tombrobber", "sexton", "mourner1", "mourner2", "mourner3", "ilka", "quartermaster", "smuggler", "alewife", "lutemaker", "cairncaptain", "moorherbalist", "moorarmourer", "rustmarshal", "rustarmourer", "rusthealer", "ropewarden", "ropearmourer", "ropehealer", "steward_wardens", "steward_redfang", "steward_host", "steward_hidekin", "steward_veiled", "steward_neutral", "cap_wardens_leader", "cap_wardens_oathkeeper", "cap_wardens_trainer", "crownherald"] as const;
export const NPC_NAMES = ["blacksmith", "merchant", "villager", "guard", "druid", "witch", "watchman", "peasant", "farmwife", "labourer", "elder", "goodwife", "wellkeeper", "sandcaptain", "spicetrader", "desertsmith", "armourer", "saltarmourer", "sandarmourer", "huntsman", "miller", "forester", "beachcomber", "prospector", "caravaneer", "hermit", "dunescout", "defector", "monk", "tombrobber", "sexton", "mourner1", "mourner2", "mourner3", "ilka", "quartermaster", "smuggler", "alewife", "lutemaker", "cairncaptain", "moorherbalist", "moorarmourer", "ropewarden", "ropearmourer", "ropehealer", "steward_wardens", "steward_redfang", "steward_host", "steward_hidekin", "steward_veiled", "steward_neutral", "cap_wardens_leader", "cap_wardens_oathkeeper", "cap_wardens_trainer", "crownherald"] as const;
export type CharacterName = (typeof CHARACTERS)[number];
export const CHAR_ANIMS = ["idle", "walk", "attack", "attack2", "attack3", "attack4", "attack5", "hit", "ko", "skill", "idle2", "idle3", "run", "wave", "cheer", "laugh", "sit", "sleep", "walk2", "dodge", "jump", "block", "hit2", "ko2"] as const;
/** Cosmetic animations: play idle2/idle3 now and then while standing still, run when moving fast, emotes from chat (e.g. /wave). */
export const FLAVOUR_ANIMS = ["idle2", "idle3", "run", "wave", "cheer", "laugh", "sit", "sleep"] as const;
/** Alternative takes on the basic movements: per-hero gait, roll, jump, guard, heavy hit, forward fall. */
export const ALT_MOVE_ANIMS = ["walk2", "dodge", "jump", "block", "hit2", "ko2"] as const;
/** Generated art is drawn ART_K times finer than its 32px design grid (tools/art K); scale sprites by 1/ART_K. */
export const ART_K = 2;
/**
 * Iso characters (assets/hd, tools/art/paint: painted, then pixelated onto the shared 1.5 texels per world px grid)
 * unless `?pixel=1`: 48px frames, WebP, 8 facings and 8-frame walk cycles.
 * Character sprites are scaled by 1/CHAR_K so they keep the same size on screen either way.
 */
export const HD_CHARS = SMOOTH;
export const CHAR_K = HD_CHARS ? 1.5 : ART_K;
/** Iso characters stand a third taller (about one tile) than the old 24px heroes, for more detail. */
export const CHAR_GROW = HD_CHARS ? 4 / 3 : 1;
/** Sprite scale for characters: 48px iso frames show at 32 world px (1.5 texels per world px). */
export const CHAR_SCALE = (0.75 * CHAR_GROW) / CHAR_K;
/** Size of one character frame in the sheets. */
export const CHAR_FRAME = 32 * CHAR_K;
export const CHAR_BASE = HD_CHARS ? "assets/hd/characters" : "assets/characters";
export const CHAR_EXT = HD_CHARS ? "webp" : "png";
export const CHAR_ORIGIN = { x: 0.5, y: 29 / 32 }; // feet

const BASE = "assets";

/**
 * Art loaded before play. Each character sheet is 384 x 5760 px (8.85 MB decoded), so with the iso sheets only the
 * local hero's class comes up front; every other sheet loads on demand (ensureCharSheet). `?pixel=1` sheets are small
 * and still all preloaded.
 */
export function preloadArt(scene: Phaser.Scene, ownClass?: string) {
  const first = HD_CHARS ? CHARACTERS.filter((c) => c === ownClass) : CHARACTERS;
  for (const c of first) scene.load.spritesheet(c, `${CHAR_BASE}/${c}.${CHAR_EXT}`, { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME });
  scene.load.json("characters_meta", `${CHAR_BASE}/characters.json`);
  scene.load.atlas("props", `${BASE}/objects/props.png`, `${BASE}/objects/props.json`);
  scene.load.atlas("items", `${BASE}/objects/items.png`, `${BASE}/objects/items.json`);
  scene.load.json("props_meta", `${BASE}/objects/props.json`);
}

/** Pixel art on the world's texel grid: NEAREST sampling (the game is antialiased otherwise), and the sheet's animations `${name}_${anim}`. */
function registerCharSheet(scene: Phaser.Scene, name: string) {
  if (HD_CHARS) scene.textures.get(name).setFilter(Phaser.Textures.FilterMode.NEAREST);
  const meta = scene.cache.json.get("characters_meta");
  for (const [anim, a] of Object.entries<any>(meta.animations)) {
    const key = `${name}_${anim}`;
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(name, { frames: a.frames }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
  }
}

/** Call once in create(), after preloadArt has finished: animations for the sheets that came with it. */
export function createArtAnims(scene: Phaser.Scene) {
  for (const c of CHARACTERS) if (scene.textures.exists(c)) registerCharSheet(scene, c);
  const props = scene.cache.json.get("props_meta");
  for (const [name, a] of Object.entries<any>(props.animations ?? {})) {
    if (scene.anims.exists(`props_${name}`)) continue;
    scene.anims.create({
      key: `props_${name}`,
      frames: a.frames.map((frame: string) => ({ key: "props", frame })),
      frameRate: a.fps,
      repeat: -1,
    });
  }
}

/** Sheets (prio >= 0) loading at the same time: the loader moves on frame by frame, so one alone is slow on a slow machine. */
const SHEETS_AT_ONCE = 2;
interface SheetJob { name: string; prio: number; waiters: (() => void)[]; tries: number; retryAt: number; loading: boolean }
const sheetJobs = new Map<string, SheetJob>(), errHooked = new WeakSet<Phaser.Scene>();
/** Debug: how long each on-demand sheet took (load start to usable) and what registering its animations cost on the main thread. */
export const sheetLog: { name: string; loadMs: number; registerMs: number }[] = [];
(window as any).__sheetLog = sheetLog;

/**
 * A character sheet (a hero class, a weapon stance "archer-melee" (shared/weapons.ts poseSheet) or an NPC), loaded the
 * first time it is needed, with its animations. True when it can be used now; otherwise `done` runs once it has
 * loaded. `prio` orders the queue (lower first; NPCs pass their distance): sheets with prio >= 0 load two at a time,
 * so walking into town decodes a couple of 8.85 MB sheets at a time instead of ten in one frame; prio < 0 starts at once.
 * A failed download is retried with growing pauses and never throws.
 */
/**
 * How near (world px) the hero must be before a standing character's sheet is asked for. The far corner of the view is
 * about 340 px away at the default Screen size and about 680 px at the smallest (50%), so this leaves time to load.
 */
export const SHEET_RANGE = 900;

export function ensureCharSheet(scene: Phaser.Scene, name: string, done?: () => void, prio = 0): boolean {
  if (scene.anims.exists(`${name}_idle_down`)) return true;
  if (!HD_CHARS) return false;
  let job = sheetJobs.get(name);
  if (!job) sheetJobs.set(name, job = { name, prio, waiters: [], tries: 0, retryAt: 0, loading: false });
  if (done) job.waiters.push(done);
  job.prio = Math.min(job.prio, prio);
  if (!errHooked.has(scene)) {
    errHooked.add(scene);
    scene.load.on("loaderror", (f: any) => {
      const j = sheetJobs.get(f?.key);
      if (!j || !j.loading) return;
      j.loading = false;
      const wait = Math.min(30000, 2000 * 2 ** j.tries++);
      j.retryAt = performance.now() + wait;
      window.setTimeout(() => pumpSheets(scene), wait + 20);
    });
  }
  pumpSheets(scene);
  return false;
}

function pumpSheets(scene: Phaser.Scene) {
  if (!scene.sys?.isActive()) return; // the scene is gone
  const now = performance.now();
  let running = 0;
  for (const j of sheetJobs.values()) if (j.loading && j.prio >= 0) running++;
  const queued = [...sheetJobs.values()].filter((j) => !j.loading && j.retryAt <= now).sort((a, b) => a.prio - b.prio);
  for (const j of queued) {
    if (j.prio >= 0) { if (running >= SHEETS_AT_ONCE) continue; running++; }
    startSheet(scene, j);
  }
}

function startSheet(scene: Phaser.Scene, job: SheetJob) {
  const { name } = job, t0 = performance.now();
  job.loading = true;
  scene.load.spritesheet(name, `${CHAR_BASE}/${name}.${CHAR_EXT}`, { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME });
  scene.load.off(`filecomplete-spritesheet-${name}`); // a failed earlier try left its listener
  scene.load.once(`filecomplete-spritesheet-${name}`, () => {
    const t1 = performance.now();
    registerCharSheet(scene, name);
    sheetLog.push({ name, loadMs: Math.round(t1 - t0), registerMs: Math.round((performance.now() - t1) * 10) / 10 });
    sheetJobs.delete(name);
    for (const w of job.waiters) { try { w(); } catch (e) { console.error(e); } }
    pumpSheets(scene);
  });
  if (!scene.load.isLoading()) scene.load.start();
}

/** Play `${char}_${anim}_${dir}` with left handled by flipping the right-facing frames. */
export function playCharAnim(sprite: Phaser.GameObjects.Sprite, char: CharacterName, anim: string, dir: string) {
  const left = dir.endsWith("left");
  let d = left ? dir.replace("left", "right") : dir;
  // 3/4 facings only exist in the iso sheets: otherwise face sideways
  if (d.length > 5 && !sprite.scene.anims.exists(`${char}_${anim}_${d}`)) d = "right";
  if (!sprite.scene.anims.exists(`${char}_${anim}_${d}`)) return; // the sheet has not arrived: callers re-play once it has
  sprite.setFlipX(left);
  sprite.play(`${char}_${anim}_${d}`, true);
}

/** The four normal-attack variants (aliases in characters.json). attack3 stays the combo finisher. */
export const SWING_ANIMS = ["swing1", "swing2", "swing3", "swing4"] as const;
