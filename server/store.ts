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

/**
 * Small named documents that are not accounts (the clan war's state): a row of table `kv` with DATABASE_URL, else
 * a JSON file per key next to the saves file (SAVE_FILE's folder, default data/).
 */
export interface Kv { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void>; setSync?(key: string, value: unknown): void }

export async function openKv(url = process.env.DATABASE_URL): Promise<Kv> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 2 });
    pool.on("error", (e) => console.error("Postgres pool error:", e));
    await pool.query("CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
    return {
      async get<T>(key: string) {
        const r = await pool.query<{ data: T }>("SELECT data FROM kv WHERE key = $1", [key]);
        return r.rows[0]?.data;
      },
      async set(key, value) {
        await pool.query("INSERT INTO kv (key, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [key, JSON.stringify(value)]);
      },
    };
  }
  const dir = path.dirname(path.resolve(process.env.SAVE_FILE ?? path.join(__dirname, "../data/saves.json")));
  const file = (key: string) => path.join(dir, `${key.replace(/[^a-z0-9_-]/gi, "_")}.json`);
  return {
    get: async <T>(key: string) => (fs.existsSync(file(key)) ? (readJsonFile(file(key)) as unknown as T) : undefined),
    async set(key, value) {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(file(key) + ".tmp", JSON.stringify(value));
      await fs.promises.rename(file(key) + ".tmp", file(key));
    },
    setSync(key, value) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(key) + ".sync.tmp", JSON.stringify(value));
      fs.renameSync(file(key) + ".sync.tmp", file(key));
    },
  };
}
