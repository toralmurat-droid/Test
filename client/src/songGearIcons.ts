/**
 * Bag icons for the Songweaver's starter kit (songweaver_weapon / _armour / _hat / _shoes). The generated atlas
 * (public/assets/gear/icons.png, built by tools/art) has no frames for them yet, so they are painted here in code at
 * 16x16 with the gear's own colours (shared/gear.ts) and scaled up crisp. Once the atlas has them, gear.ts uses those.
 */
const P: Record<string, string> = { o: "#1b120a", w: "#8a5a2c", d: "#5a3a1a", l: "#b88048", g: "#e8d070", s: "#e8e0c8", b: "#d09a34", r: "#a8402a", t: "#2e7d74", f: "#d9482f", k: "#4e3220" };
const ART: Record<string, string[]> = {
  // a lute: round body with a sound hole, neck going up and right, pegs at the head
  weapon: ["..............oo", "............ooso", "...........ogoo.", "..........ogo...", ".........ogo....", "....oooo.ogo....", "...owwwwogo.....", "..owllwwwo......", ".owlwddwwwo.....", ".owldooowwo.....", ".owlwddwwwo.....", ".owwlwwwwdo.....", "..owwwwwddo.....", "...oddddoo......", "....oooo........", "................"],
  // a doublet: gold buttons, red sash
  armour: ["................", "...oo......oo...", "..obbo....obbo..", ".obbbboooobbbbo.", ".obbbbbbbbbbbbo.", ".obbbbbgbbbbbbo.", "..obbbbgbbbbbo..", "..obbbbgbbbbbo..", "..orrrrrrrrrro..", "..orrrrrrrrrro..", "..obbbbgbbbbbo..", "..obbbbgbbbbbo..", "..obbbbbbbbbbo..", "...obbbbbbbbo...", "....oooooooo....", "................"],
  // a feathered cap
  hat: ["................", "..........ooff..", ".........offfo..", "........offfo...", "....oooooffo....", "...ottttttoo....", "..ottttttttto...", "..ottttttttto...", ".ottttttttttto..", ".obbbbbbbbbbbo..", "..oooooooooooo..", "................", "................", "................", "................", "................"],
  // a pair of boots
  shoes: ["................", "................", "...oooo..oooo...", "..okkkko.okkkko.", "..okkkko.okkkko.", "..okkkko.okkkko.", "..okkkko.okkkko.", "..okwwko.okwwko.", ".okkkkko.okkkkko", ".okkkkko.okkkkko", ".ooooooo.ooooooo", "................", "................", "................", "................", "................"],
};

/** Draw the icon for a `songweaver_<slot>` id into `ctx` at `size` px; false when this id is not one of them. */
export function drawSongGearIcon(ctx: CanvasRenderingContext2D, id: string, size: number): boolean {
  const art = id.startsWith("songweaver_") ? ART[id.slice(11)] : undefined;
  if (!art) return false;
  const k = size / 16;
  art.forEach((row, y) => [...row].forEach((ch, x) => { const c = P[ch]; if (c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x * k), Math.floor(y * k), Math.ceil(k), Math.ceil(k)); } }));
  return true;
}
