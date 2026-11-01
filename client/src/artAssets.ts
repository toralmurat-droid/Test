import Phaser from "phaser";

/**
 * Generated pixel art (see tools/art, run `npm run art`).
 * Characters: 32x32 frames (6 per row), animations `${char}_${anim}_${dir}`; dir is down | up | right (flipX for left).
 * Props/items: texture atlases "props" and "items" with frame names like "barrel", "potion_health".
 */
export const CHARACTERS = ["ninja", "wizard", "knight", "archer", "barbarian", "blacksmith", "merchant", "villager", "guard"] as const;
export const NPC_NAMES = ["blacksmith", "merchant", "villager", "guard"] as const;
export type CharacterName = (typeof CHARACTERS)[number];
export const CHAR_ANIMS = ["idle", "walk", "attack", "attack2", "attack3", "attack4", "hit", "ko", "skill", "idle2", "idle3", "run", "wave", "cheer", "laugh", "sit", "sleep"] as const;
/** Cosmetic animations: play idle2/idle3 now and then while standing still, run when moving fast, emotes from chat (e.g. /wave). */
export const FLAVOUR_ANIMS = ["idle2", "idle3", "run", "wave", "cheer", "laugh", "sit", "sleep"] as const;
export const CHAR_ORIGIN = { x: 0.5, y: 29 / 32 }; // feet

const BASE = "assets";

export function preloadArt(scene: Phaser.Scene) {
  for (const c of CHARACTERS) scene.load.spritesheet(c, `${BASE}/characters/${c}.png`, { frameWidth: 32, frameHeight: 32 });
  scene.load.json("characters_meta", `${BASE}/characters/characters.json`);
  scene.load.atlas("props", `${BASE}/objects/props.png`, `${BASE}/objects/props.json`);
  scene.load.atlas("items", `${BASE}/objects/items.png`, `${BASE}/objects/items.json`);
  scene.load.json("props_meta", `${BASE}/objects/props.json`);
}

/** Call once in create(), after preloadArt has finished. */
export function createArtAnims(scene: Phaser.Scene) {
  const meta = scene.cache.json.get("characters_meta");
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

/** Play `${char}_${anim}_${dir}` with left handled by flipping the right-facing frames. */
export function playCharAnim(sprite: Phaser.GameObjects.Sprite, char: CharacterName, anim: string, dir: "up" | "down" | "left" | "right") {
  const d = dir === "left" ? "right" : dir;
  sprite.setFlipX(dir === "left");
  sprite.play(`${char}_${anim}_${d}`, true);
}

/** The four normal-attack variants. Pick one per Space press so attacks don't look repetitive. */
export const ATTACK_VARIANTS = ["attack", "attack2", "attack3", "attack4"] as const;
export function nextAttackAnim(prev?: string): (typeof ATTACK_VARIANTS)[number] {
  const options = ATTACK_VARIANTS.filter((a) => a !== prev);
  return options[Math.floor(Math.random() * options.length)];
}
