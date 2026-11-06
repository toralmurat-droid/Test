// Where player accounts are kept. Two backends with the same interface:
// - JSON file (default, SAVE_FILE): the whole file is rewritten in the background; fine for a small game.
// - PostgreSQL (DATABASE_URL set): one row per account, only changed accounts are written, all changes of one
//   flush in one transaction (a trade between two players is saved both sides or not at all).
//   On first start with an empty table, the accounts of the JSON file are imported once.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export interface Store<A> {
  kind: "json" | "postgres";
  load(): Promise<Record<string, A>>;
  /** Persist these changed accounts (`all` is every account, for backends that write everything). */
  save(changed: Record<string, A>, all: Record<string, A>): Promise<void>;
  /** Blocking write of everything (JSON only; used while shutting down). */
  saveSync?(all: Record<string, A>): void;
  close?(): Promise<void>;
}

export function readJsonFile<A>(file: string): Record<string, A> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e: any) {
    if (e?.code !== "ENOENT") console.error("Could not read saves file:", e);
    return {};
  }
}

export function jsonStore<A>(file: string): Store<A> {
  // Bumped by every blocking write: a background write that started before it must not put its older data over it.
  // (A one-way "closing" flag was wrong: a room is also disposed when its last player leaves, not only at shutdown.)
  let gen = 0;
  return {
    kind: "json",
    load: async () => readJsonFile<A>(file),
    async save(_changed, all) {
      const mine = gen;
      const body = JSON.stringify(all);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file + ".tmp", body);
      if (mine !== gen) return; // a blocking write (newer) happened meanwhile
      await fs.promises.rename(file + ".tmp", file);
    },
    saveSync(all) {
      gen++;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + ".sync.tmp", JSON.stringify(all));
      fs.renameSync(file + ".sync.tmp", file);
    },
  };
}

export async function postgresStore<A>(url: string, importFrom?: string): Promise<Store<A>> {
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  pool.on("error", (e) => console.error("Postgres pool error:", e));
  await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM accounts");
  if (Number(rows[0].n) === 0 && importFrom && fs.existsSync(importFrom)) {
    const old = readJsonFile<A>(importFrom);
    await upsert(pool, old);
    console.log(`Postgres: imported ${Object.keys(old).length} account(s) from ${importFrom}`);
  }
  return {
    kind: "postgres",
    async load() {
      const r = await pool.query<{ key: string; data: A }>("SELECT key, data FROM accounts");
      const out: Record<string, A> = {};
      for (const row of r.rows) out[row.key] = row.data;
      return out;
    },
    save: (changed) => upsert(pool, changed),
    close: () => pool.end(),
  };
}

async function upsert<A>(pool: pg.Pool, changed: Record<string, A>) {
  const keys = Object.keys(changed);
  if (!keys.length) return;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // One statement per 500 accounts: unnest() turns the two arrays back into rows
    for (let i = 0; i < keys.length; i += 500) {
      const ks = keys.slice(i, i + 500);
      await c.query(
        `INSERT INTO accounts (key, data, updated_at)
         SELECT k, d::jsonb, now() FROM unnest($1::text[], $2::text[]) AS t(k, d)
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [ks, ks.map((k) => JSON.stringify(changed[k]))],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
