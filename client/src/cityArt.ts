import type { ClanKey } from "../../shared/war/clans";

/** A city's stone tint (ground and walls). Banners and props are baked in cityProps.ts. Cosmetic only. */
export const CITY_LOOK: Record<ClanKey, { stone: number }> = {
  wardens: { stone: 0xffe2b8 },
  veiled: { stone: 0xe0dcff },
  host: { stone: 0xd8ece4 },
  redfang: { stone: 0xffd0c0 },
  hidekin: { stone: 0xf0dcc0 },
};
