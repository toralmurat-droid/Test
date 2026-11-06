import { MOB_FIELDS, POS_SCALE, X_FIELD, Y_FIELD, type MobViewMsg } from "../../shared/mobView";

/** A monster as the client knows it: its synced fields, plus `onChange` like a schema object. */
export type MobState = Record<string, any> & { onChange(cb: () => void): void };

function unwire(i: number, v: unknown): unknown {
  return i === X_FIELD || i === Y_FIELD ? (v as number) / POS_SCALE : v;
}

/**
 * The monsters near the hero, fed by the server's "mv" messages (shared/mobView.ts).
 * Offers the bits of the schema MapSchema API the scene used: onAdd, onRemove, get, forEach, size.
 */
export class MobFeed {
  private mobs = new Map<string, MobState>();
  private changeCbs = new Map<string, () => void>();
  private addCb?: (m: MobState, id: string) => void;
  private removeCb?: (m: MobState, id: string) => void;

  onAdd(cb: (m: MobState, id: string) => void) { this.addCb = cb; this.mobs.forEach((m, id) => cb(m, id)); }
  onRemove(cb: (m: MobState, id: string) => void) { this.removeCb = cb; }
  get(id: string) { return this.mobs.get(id); }
  has(id: string) { return this.mobs.has(id); }
  get size() { return this.mobs.size; }
  forEach(cb: (m: MobState, id: string) => void) { this.mobs.forEach(cb); }

  apply(msg: MobViewMsg) {
    for (const id of msg.r ?? []) {
      const m = this.mobs.get(id);
      if (!m) continue;
      this.mobs.delete(id); this.changeCbs.delete(id);
      this.removeCb?.(m, id);
    }
    for (const row of msg.a ?? []) {
      const id = row[0] as string;
      const cbs = this.changeCbs;
      const m = { onChange(cb: () => void) { cbs.set(id, cb); } } as MobState;
      Object.defineProperty(m, "onChange", { enumerable: false });
      for (let i = 0; i < MOB_FIELDS.length; i++) m[MOB_FIELDS[i]] = unwire(i, row[i + 1]);
      this.mobs.set(id, m);
      this.addCb?.(m, id);
    }
    for (const row of msg.c ?? []) {
      const id = row[0] as string, m = this.mobs.get(id);
      if (!m) continue;
      for (let j = 1; j < row.length; j += 2) { const i = row[j] as number; m[MOB_FIELDS[i]] = unwire(i, row[j + 1]); }
      this.changeCbs.get(id)?.();
    }
  }

  /** Lost the connection: the server will send everything near the hero again. */
  clear() { for (const id of [...this.mobs.keys()]) this.apply({ r: [id] }); }
}
