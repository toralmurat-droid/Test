import Phaser from "phaser";

/**
 * Generated pixel art (see tools/art, run `npm run art`).
 * Characters: 32x32 frames (6 per row), animations `${char}_${anim}_${dir}`; dir is down | up | right (flipX for left).
 * Props/items: texture atlases "props" and "items" with frame names like "barrel", "potion_health".
 */
export const CHARACTERS = ["ninja", "wizard", "knight", "archer", "barbarian", "blacksmith", "merchant", "villager", "guard"] as const;
export const NPC_NAMES = ["blacksmith", "merchant", "villager", "guard"] as const;
export type CharacterName = (typeof CHARACTERS)[number];
export const CHAR_ANIMS = ["idle", "walk", "attack", "attack2", "attack3", "hit", "ko", "skill"] as const;
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
