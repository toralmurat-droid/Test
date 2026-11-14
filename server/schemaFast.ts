/**
 * Faster field reads on @colyseus/schema 3 classes, with exactly the same results.
 *
 * Schema 3 gives every synced field one getter, `function () { return this[fieldCached]; }`, made by one closure for
 * all fields of all classes. V8 keeps one inline cache for that `this[fieldCached]` across all of them, so it goes
 * megamorphic and each `m.x` costs a generic lookup (about 30x a plain property read on a Mob, measured). This swaps in
 * one compiled getter per field that reads its own backing property (`this._x`) by name: the same value, but each
 * getter sees one shape and V8 inlines it. Setters get the same treatment for their first step only: a write of the
 * value already there returns before the library's setter runs (which would return at that point too).
 *
 * Instances copy the descriptors from `cls[Symbol.metadata]["~descriptors"]` when they are made, so call this once
 * per class right after its definition, before any instance exists (and before trackSchemaMoves, which wraps setters).
 */
export function fastFields(cls: Function) {
  const ds = (cls as any)[Symbol.metadata]?.["~descriptors"];
  if (!ds) throw new Error("fastFields: no schema descriptors (did @colyseus/schema change?)");
  for (const f of Object.keys(ds)) {
    const d: PropertyDescriptor = ds[f];
    if (!d.get || !d.set) continue; // backing fields (`_x`) are plain values
    const raw = "_" + f;
    if (!/^[A-Za-z_$][\w$]*$/.test(f) || !ds[raw] || "get" in ds[raw]) throw new Error(`fastFields: ${f} has no plain backing field ${raw}`);
    // Check that the library still reads and skips the way assumed above: on a bare object holding the value, its
    // getter must return it and its setter must return early (it would throw on the missing change tree otherwise)
    const probe: any = { [raw]: probeValue }, get = d.get, set = d.set;
    let ok: boolean;
    try { ok = get.call(probe) === probeValue; set.call(probe, probeValue); } catch { ok = false; }
    if (!ok) throw new Error(`fastFields: the schema accessors of ${f} changed (see server/schemaFast.ts)`);
    ds[f] = {
      ...d,
      get: new Function(`return this.${raw};`) as () => unknown,
      // (a null in the field goes through the library, which tells undefined and null apart there)
      set: new Function("set", `return function (v) { if (v === this.${raw} && v != null) return; set.call(this, v); };`)(set),
    };
  }
}

const probeValue = { probe: true };
