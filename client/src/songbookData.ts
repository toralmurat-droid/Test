/**
 * The owner-only "songbook" message store: `{ songs, mats }` from the server, on join and on change. Everything else
 * (books, lute stages, traits, materials, songs) is read from shared/ (gear.ts, lute.ts, songbook.ts, lutemaker.ts).
 */
export interface SongbookState { songs: string[]; mats: Record<string, number> }
let state: SongbookState = { songs: [], mats: {} };
const subs = new Set<() => void>();
/** `"songbook" { songs, mats }`, sent on join and on change (owner only). Read defensively. */
export function setSongbook(m: any) {
  state = {
    songs: Array.isArray(m?.songs) ? m.songs.filter((s: unknown) => typeof s === "string") : [],
    mats: m?.mats && typeof m.mats === "object" ? Object.fromEntries(Object.entries(m.mats).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))])) : {},
  };
  subs.forEach((f) => f());
}
export const getSongbook = () => state;
export function onSongbook(f: () => void): () => void { subs.add(f); return () => subs.delete(f); }
