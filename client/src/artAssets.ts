import Phaser from "phaser";
import { SMOOTH } from "./isoflag";

/**
 * Generated pixel art (see tools/art, run `npm run art`).
 * Characters: 32x32 design frames rendered at CHAR_FRAME px, animations `${char}_${anim}_${dir}`; dir is down | up | right
 * (flipX for left), plus downright | upright (flipX for downleft | upleft) in the iso sheets.
 * Props/items: texture atlases "props" and "items" with frame names like "barrel", "potion_health".
 */
export const CHARACTERS = ["ninja", "wizard", "knight", "archer", "barbarian", "vampire", "summoner", "blacksmith", "merchant", "villager", "guard", "druid", "witch", "watchman", "peasant", "farmwife", "labourer", "elder", "goodwife"] as const;
export const NPC_NAMES = ["blacksmith", "merchant", "villager", "guard", "druid", "witch", "watchman", "peasant", "farmwife", "labourer", "elder", "goodwife"] as const;
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

export function preloadArt(scene: Phaser.Scene) {
  for (const c of CHARACTERS) scene.load.spritesheet(c, `${CHAR_BASE}/${c}.${CHAR_EXT}`, { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME });
  scene.load.json("characters_meta", `${CHAR_BASE}/characters.json`);
  scene.load.atlas("props", `${BASE}/objects/props.png`, `${BASE}/objects/props.json`);
  scene.load.atlas("items", `${BASE}/objects/items.png`, `${BASE}/objects/items.json`);
  scene.load.json("props_meta", `${BASE}/objects/props.json`);
}

/** Call once in create(), after preloadArt has finished. */
export function createArtAnims(scene: Phaser.Scene) {
  const meta = scene.cache.json.get("characters_meta");
  // The iso sheets are pixel art on the world's texel grid: sample them NEAREST (the game is antialiased otherwise)
  if (HD_CHARS) for (const c of CHARACTERS) scene.textures.get(c).setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const c of CHARACTERS) {
    for (const [name, a] of Object.entries<any>(meta.animations)) {
      const key = `${c}_${name}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(c, { frames: a.frames }),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  }
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

const charPending = new Set<string>(), charFailed = new Set<string>(), errHooked = new WeakSet<Phaser.Scene>();
/**
 * A hero's sheet for another weapon stance ("archer-melee", shared/weapons.ts poseSheet), loaded the first time it is
 * needed, with its animations. True when it can be used now; `done` runs once it has loaded.
 */
export function ensureCharSheet(scene: Phaser.Scene, name: string, done?: () => void): boolean {
  if (scene.anims.exists(`${name}_idle_down`)) return true;
  if (!HD_CHARS || charPending.has(name) || charFailed.has(name)) return false;
  if (!errHooked.has(scene)) errHooked.add(scene), scene.load.on("loaderror", (f: any) => { if (charPending.delete(f?.key)) charFailed.add(f.key); });
  charPending.add(name);
  scene.load.spritesheet(name, `${CHAR_BASE}/${name}.${CHAR_EXT}`, { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME });
  scene.load.once(`filecomplete-spritesheet-${name}`, () => {
    scene.textures.get(name).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const meta = scene.cache.json.get("characters_meta");
    for (const [anim, a] of Object.entries<any>(meta.animations)) {
      const key = `${name}_${anim}`;
      if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(name, { frames: a.frames }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
    }
    charPending.delete(name);
    done?.();
  });
  if (!scene.load.isLoading()) scene.load.start();
  return false;
}

/** Play `${char}_${anim}_${dir}` with left handled by flipping the right-facing frames. */
export function playCharAnim(sprite: Phaser.GameObjects.Sprite, char: CharacterName, anim: string, dir: string) {
  const left = dir.endsWith("left");
  let d = left ? dir.replace("left", "right") : dir;
  // 3/4 facings only exist in the iso sheets: otherwise face sideways
  if (d.length > 5 && !sprite.scene.anims.exists(`${char}_${anim}_${d}`)) d = "right";
  sprite.setFlipX(left);
  sprite.play(`${char}_${anim}_${d}`, true);
}

/** The four normal-attack variants (aliases in characters.json). attack3 stays the combo finisher. */
export const SWING_ANIMS = ["swing1", "swing2", "swing3", "swing4"] as const;
