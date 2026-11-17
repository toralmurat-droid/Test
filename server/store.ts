// Where player accounts are kept. Two backends with the same interface:
// - JSON file (default, SAVE_FILE): the whole file is rewritten in the background; fine for a small game.
// - PostgreSQL (DATABASE_URL set): one row per account, only changed accounts are written, all changes of one
//   flush in one transaction (a trade between two players is saved both sides or not at all).
//   On first start with an empty table, the accounts of the JSON file are imported once.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import type { LeaseBackend } from "./lease";

export interface Store<A> {
  kind: "json" | "postgres";
  load(): Promise<Record<string, A>>;
  /** One row (or undefined), without loading every account. */
  loadOne?(key: string): Promise<A | undefined>;
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
    loadOne: async (key) => readJsonFile<A>(file)[key],
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

/**
 * `table`: the accounts by default; other key -> JSON data (the world state, server/worldStore.ts) get their own table of
 * the same shape. The name goes into the SQL as it is, so it may only be lower-case letters and underscores.
 */
export async function postgresStore<A>(url: string, importFrom?: string, table = "accounts"): Promise<Store<A>> {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`Bad store table name: ${table}`);
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  pool.on("error", (e) => console.error("Postgres pool error:", e));
  await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
  if (Number(rows[0].n) === 0 && importFrom && fs.existsSync(importFrom)) {
    const old = readJsonFile<A>(importFrom);
    await upsert(pool, old, table);
    console.log(`Postgres: imported ${Object.keys(old).length} row(s) into ${table} from ${importFrom}`);
  }
  return {
    kind: "postgres",
    async load() {
      const r = await pool.query<{ key: string; data: A }>(`SELECT key, data FROM ${table}`);
      const out: Record<string, A> = {};
      for (const row of r.rows) out[row.key] = row.data;
      return out;
    },
    async loadOne(key) {
      const r = await pool.query<{ data: A }>(`SELECT data FROM ${table} WHERE key = $1`, [key]);
      return r.rows[0]?.data;
    },
    save: (changed) => upsert(pool, changed, table),
    close: () => pool.end(),
  };
}

async function upsert<A>(pool: pg.Pool, changed: Record<string, A>, table: string) {
  const keys = Object.keys(changed);
  if (!keys.length) return;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // One statement per 500 accounts: unnest() turns the two arrays back into rows
    for (let i = 0; i < keys.length; i += 500) {
      const ks = keys.slice(i, i + 500);
      await c.query(
        `INSERT INTO ${table} (key, data, updated_at)
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
 * `insertIfAbsent` writes only a key that does not exist yet (true when it wrote); `list` reads every key starting with
 * `prefix`; `leases` is the shared lease table (server/lease.ts), only with Postgres. All three optional (test stores).
 */
export interface Kv {
  get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void>; setSync?(key: string, value: unknown): void;
  insertIfAbsent?(key: string, value: unknown): Promise<boolean>;
  list?<T>(prefix: string): Promise<Record<string, T>>;
  leases?: LeaseBackend;
  close?(): Promise<void>;
}

/** Leases (server/lease.ts) in table `leases` of this pool: a key is taken when free, ran out, or the holder's own. */
export async function pgLeases(pool: pg.Pool): Promise<LeaseBackend> {
  await pool.query("CREATE TABLE IF NOT EXISTS leases (key text PRIMARY KEY, holder text NOT NULL, until timestamptz NOT NULL)");
  return {
    async acquire(keys, holder, ttlMs) {
      if (!keys.length) return [];
      const r = await pool.query<{ key: string }>(
        `INSERT INTO leases (key, holder, until)
         SELECT k, $2, now() + $3 * interval '1 millisecond' FROM unnest($1::text[]) AS t(k)
         ON CONFLICT (key) DO UPDATE SET holder = EXCLUDED.holder, until = EXCLUDED.until
         WHERE leases.until < now() OR leases.holder = EXCLUDED.holder
         RETURNING key`,
        [keys, holder, Math.max(1, Math.floor(ttlMs))],
      );
      return r.rows.map((x) => x.key);
    },
    async release(keys, holder) {
      if (keys.length) await pool.query("DELETE FROM leases WHERE key = ANY($1::text[]) AND holder = $2", [keys, holder]);
    },
  };
}

/**
 * Timeouts for the small pools (kv, leases): a half-open connection fails a call within seconds instead of stalling the
 * war's tick for minutes. Their rows are small (the war save is a few hundred kB). The accounts' pool keeps no query
 * timeout: a big flush (every changed account in one transaction) must never be cut off half way.
 */
const SMALL_POOL = { connectionTimeoutMillis: 10_000, query_timeout: 10_000 };

/** A lease backend of its own (one small pool) for a module without a kv pool (server/worldStore.ts). */
export async function openLeases(url: string): Promise<LeaseBackend> {
  const pool = new pg.Pool({ connectionString: url, max: 1, ...SMALL_POOL });
  pool.on("error", (e) => console.error("Postgres pool error:", e));
  return pgLeases(pool);
}

export async function openKv(url = process.env.DATABASE_URL): Promise<Kv> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 2, ...SMALL_POOL });
    pool.on("error", (e) => console.error("Postgres pool error:", e));
    await pool.query("CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
    const leases = await pgLeases(pool);
    return {
      async get<T>(key: string) {
        const r = await pool.query<{ data: T }>("SELECT data FROM kv WHERE key = $1", [key]);
        return r.rows[0]?.data;
      },
      async set(key, value) {
        await pool.query("INSERT INTO kv (key, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [key, JSON.stringify(value)]);
      },
      async insertIfAbsent(key, value) {
        const r = await pool.query("INSERT INTO kv (key, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO NOTHING", [key, JSON.stringify(value)]);
        return (r.rowCount ?? 0) > 0;
      },
      async list<T>(prefix: string) {
        const r = await pool.query<{ key: string; data: T }>("SELECT key, data FROM kv WHERE starts_with(key, $1)", [prefix]);
        const out: Record<string, T> = {};
        for (const row of r.rows) out[row.key] = row.data;
        return out;
      },
      leases,
      close: () => pool.end(),
    };
  }
  const dir = path.dirname(path.resolve(process.env.SAVE_FILE ?? path.join(__dirname, "../data/saves.json")));
  const name = (key: string) => `${key.replace(/[^a-z0-9_-]/gi, "_")}.json`;
  const file = (key: string) => path.join(dir, name(key));
  const write = async (key: string, value: unknown) => {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(file(key) + ".tmp", JSON.stringify(value));
    await fs.promises.rename(file(key) + ".tmp", file(key));
  };
  return {
    get: async <T>(key: string) => (fs.existsSync(file(key)) ? (readJsonFile(file(key)) as unknown as T) : undefined),
    set: write,
    setSync(key, value) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(key) + ".sync.tmp", JSON.stringify(value));
      fs.renameSync(file(key) + ".sync.tmp", file(key));
    },
    async insertIfAbsent(key, value) {
      if (fs.existsSync(file(key))) return false;
      await write(key, value);
      return true;
    },
    // (file names are the keys made safe, so the keys come back in that form: callers keep the real key in the document)
    async list<T>(prefix: string) {
      const start = name(prefix).slice(0, -".json".length), out: Record<string, T> = {};
      const files = fs.existsSync(dir) ? await fs.promises.readdir(dir) : [];
      for (const f of files) if (f.startsWith(start) && f.endsWith(".json")) out[f.slice(0, -".json".length)] = readJsonFile(path.join(dir, f)) as unknown as T;
      return out;
    },
  };
}
