/**
 * Skill-move sheets (client/src/skillMoveData.ts): for each melee hero the bare body in the MOVE_ANIMS poses plus an
 * overlay per item it can wear in its native stance: hd/characters/{hero}-moves.webp, hd/gear/{hero}-moves_{id}.webp.
 * Usage: npx tsx tools/art/paint/skill-moves.ts [hero ...]   (no args = all; also part of `npm run art`)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { buildMovesSheet, HEROES, MOVE_HEROES, setPainted } from "../characters";
import { diff } from "../gear";
import { GEAR, GEAR_IDS, weaponType } from "../../../shared/gear";
import { nativeFamily, weaponFamily } from "../../../shared/weapons";
import type { ClassKind } from "../../../shared/classes";
import { PAINT_K, wear } from "./sheets";

function saveWebp(c: Canvas, path: string, q = 88) {
  const n = createCanvas(c.w, c.h), x = n.getContext("2d");
  const img = x.createImageData(c.w, c.h);
  img.data.set(c.data);
  x.putImageData(img, 0, 0);
  writeFileSync(path, n.encodeSync("webp", q));
}

export function buildSkillMoves(OUT: string, want: string[] = []) {
  setPainted(true, PAINT_K, true);
  mkdirSync(`${OUT}/characters`, { recursive: true });
  mkdirSync(`${OUT}/gear`, { recursive: true });
  for (const h of HEROES) {
    const cls = h.name as ClassKind;
    if (!MOVE_HEROES.includes(cls) || (want.length && !want.includes(cls))) continue;
    wear(null);
    const plain = buildMovesSheet(h);
    saveWebp(plain, `${OUT}/characters/${cls}-moves.webp`, 90);
    let n = 0;
    for (const id of GEAR_IDS) {
      const d = GEAR[id];
      if (d.cls && d.cls !== cls) continue; // class kits only fit their own class
      if (d.slot === "weapon" && weaponFamily(weaponType(cls, id)) !== nativeFamily(cls)) continue; // melee skills need a melee weapon
      wear(d);
      saveWebp(diff(plain, buildMovesSheet(h)), `${OUT}/gear/${cls}-moves_${id}.webp`);
      n++;
    }
    wear(null);
    console.log("skill moves", cls, n, "items");
  }
  setPainted(false, 2);
}

if (process.argv[1]?.endsWith("skill-moves.ts")) buildSkillMoves("client/public/assets/hd", process.argv.slice(2));
