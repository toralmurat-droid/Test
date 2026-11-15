/**
 * The five clans of the Riven Marches clan war (design: play.fmtpa.ch/design/riven-marches/, Murat's decisions
 * 2026-11-14: war across the whole map, any clan can be joined, an endless war, AI leaders without approval).
 * Each clan has one doctrine: the tool only it can use. Its capitals (zones that never change hands) live with the lands
 * in regions.ts, so a homeland can bring its own.
 * Pure data: the war rules (rules.ts), the scripted leaders (doctrine.ts) and the war sim (tools/balance/war.ts) read it.
 */
export type ClanKey = "wardens" | "redfang" | "host" | "hidekin" | "veiled";
export type Doctrine = "palisade" | "raid" | "siege" | "tunnel" | "ritual";

export interface Clan {
  key: ClanKey;
  name: string;
  /** Banner colours (cloth, trim, sigil), as in the design page's banners. */
  cloth: number; trim: number; sigil: number;
  doctrine: Doctrine;
  /** The clan this one beats on the counter cycle (wardens > redfang > veiled > host > hidekin > wardens). */
  counters: ClanKey;
}

export const CLANS: Record<ClanKey, Clan> = {
  wardens: { key: "wardens", name: "The Hearthbound Wardens", cloth: 0x3b4a2c, trim: 0xd9822b, sigil: 0xf0b44a, doctrine: "palisade", counters: "redfang" },
  redfang: { key: "redfang", name: "The Redfang Compact", cloth: 0x7e1d16, trim: 0x1a1414, sigil: 0xe3d6b8, doctrine: "raid", counters: "veiled" },
  host: { key: "host", name: "The Ossuary Host", cloth: 0x1f2422, trim: 0x4f7d6a, sigil: 0xd8cfb2, doctrine: "siege", counters: "hidekin" },
  hidekin: { key: "hidekin", name: "The Hide-Kin of Mawdeep", cloth: 0x8a5f2a, trim: 0x6e1d18, sigil: 0xe2c79a, doctrine: "tunnel", counters: "wardens" },
  veiled: { key: "veiled", name: "The Veiled Circle", cloth: 0x2a2a5a, trim: 0xe0a030, sigil: 0xf6d26b, doctrine: "ritual", counters: "host" },
};
export const CLAN_KEYS = Object.keys(CLANS) as ClanKey[];
