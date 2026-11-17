// An account table in memory with the Postgres rules of server/store.ts (insertNew, the lease-fenced write, findBy),
// reading the lease rows of a memLeases backend: several "servers" in one test process.
import type { Store } from "../../server/store";

export function memDb<A>(leases: { rows: Map<string, { holder: string; until: number }> }, now: () => number = Date.now) {
  const rows = new Map<string, A>();
  const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  const db = {
    rows,
    /** Next fenced writes throw (the database cannot be reached). */
    fail: false,
    /** Runs just before an insertNew (tests: another server makes the same name first). */
    beforeInsert: undefined as undefined | ((key: string) => void),
    writes: 0,
    store: {
      kind: "postgres",
      load: async () => Object.fromEntries([...rows].map(([k, v]) => [k, copy(v)])),
      loadOne: async (k: string) => copy(rows.get(k)),
      save: async (changed: Record<string, A>) => { for (const [k, v] of Object.entries(changed)) rows.set(k, copy(v)); },
      async insertNew(k: string, v: A) {
        db.beforeInsert?.(k);
        if (rows.has(k)) return false;
        rows.set(k, copy(v));
        return true;
      },
      async saveFenced(changed: Record<string, A>, holder: string, prefix: string) {
        if (db.fail) throw new Error("database down");
        db.writes++;
        const refused: string[] = [];
        for (const [k, v] of Object.entries(changed)) {
          const l = leases.rows.get(prefix + k);
          if (l && l.holder === holder && l.until > now() && rows.has(k)) rows.set(k, copy(v)); else refused.push(k);
        }
        return refused;
      },
      async findBy(field: string, value: string, limit = 5) {
        const out: Record<string, A> = {};
        for (const [k, v] of rows) if ((v as any)?.[field] === value && Object.keys(out).length < limit) out[k] = copy(v);
        return out;
      },
    } as Store<A>,
  };
  return db;
}
