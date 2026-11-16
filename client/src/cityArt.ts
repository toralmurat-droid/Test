import { CLANS, type ClanKey } from "../../shared/war/clans";

/** White mixed toward `c` by `k` (0 = white, 1 = c): a multiply tint that leans a city's colours to its clan. */
const lean = (c: number, k: number) => {
  const ch = (sh: number) => Math.round(255 - (255 - ((c >> sh) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
/** A tint scaled darker (k < 1), for black-stone walls. */
const dim = (c: number, k: number) => {
  const ch = (sh: number) => Math.round(((c >> sh) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * A city's tints, from its clan's colours (shared/war/clans.ts CLANS): `stone` for the ground (smoothground.ts; light,
 * as the ground is already painted like the homeland's), `wall` for the walls, roofs and stalls (iso.ts). Hearthhold
 * keeps its hand-picked warm tint. Banners and props are baked in cityProps.ts. Cosmetic only.
 */
export const CITY_LOOK: Record<ClanKey, { stone: number; wall: number }> = {
  wardens: { stone: 0xffe2b8, wall: 0xffe2b8 },
  // Duskveil: dusk-violet sand and mud-brick (the Circle's indigo cloth, lifted toward its gold)
  veiled: { stone: lean(CLANS.veiled.cloth, 0.12), wall: lean(CLANS.veiled.cloth, 0.3) },
  // Marrowkeep: grey-green ground under black stone (the Host's teal trim, the walls darkened)
  host: { stone: lean(CLANS.host.trim, 0.15), wall: dim(lean(CLANS.host.trim, 0.45), 0.62) },
  // Scarwall: red dust and red-stained timber (the Compact's red cloth)
  redfang: { stone: lean(CLANS.redfang.cloth, 0.08), wall: lean(CLANS.redfang.cloth, 0.35) },
  // Deepden: brown earth and hide (the Kin's brown cloth)
  hidekin: { stone: lean(CLANS.hidekin.cloth, 0.12), wall: lean(CLANS.hidekin.cloth, 0.4) },
};
