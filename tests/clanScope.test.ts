// CI scope of clan plug-ins (tools/ci/clan-scope.mjs): which clan folders a change gates, and clan branches confined
// to their own folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error plain ES module without types
import { clanFolders, scopeOf } from "../tools/ci/clan-scope.mjs";

const ALL = ["hidekin", "host", "redfang", "veiled", "wardens"];
type Scope = { clans: string[]; kernel: boolean; clanBranch?: string; errors: string[] };
const scope = (branch: string, files: string[]) => scopeOf(branch, files, ALL) as Scope;

test("no clan folder touched: nothing to gate", () => {
  assert.deepEqual(scope("claude/war-fix", ["server/war.ts", "docs/x.md"]), { clans: [], kernel: false, clanBranch: undefined, errors: [] });
});

test("touched folders are gated, only those", () => {
  const r = scope("claude/clan-tweaks", ["shared/clans/host/index.ts", "shared/clans/veiled/plan.ts", "shared/clans/host/x.ts"]);
  assert.deepEqual(r.clans, ["host", "veiled"]);
  assert.equal(r.kernel, false);
});

test("the plug-in kernel gates every clan", () => {
  for (const f of ["shared/clans/api.ts", "server/clanPluginWorker.ts", "server/clanPlugins.ts", "tools/clans/gate.ts", "shared/war/councilScript.ts"]) {
    const r = scope("claude/x", [f]);
    assert.deepEqual(r.clans, ALL, f);
    assert.equal(r.kernel, true);
  }
});

test("a clan branch may change only its own folder", () => {
  const ok = scope("claude/clan-redfang-raids", ["shared/clans/redfang/index.ts"]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.clanBranch, "redfang");
  assert.deepEqual(ok.clans, ["redfang"]);
  const bad = scope("claude/clan-redfang-raids", ["shared/clans/redfang/index.ts", "shared/clans/host/index.ts", "server/war.ts", "shared/clans/api.ts"]);
  assert.equal(bad.errors.length, 3);
  assert.ok(bad.errors.every((e: string) => /may change only shared\/clans\/redfang\//.test(e)));
  // a lookalike path outside the folder
  assert.equal(scope("claude/clan-host-x", ["shared/clans/hostile/index.ts"]).errors.length, 1);
});

test("a deleted folder is not gated", () => {
  assert.deepEqual(scope("claude/x", ["shared/clans/gone/index.ts"]).clans, []);
});

test("the folder list matches the repository", () => {
  const dirs = fs.readdirSync(path.join(__dirname, "../shared/clans"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(clanFolders(), dirs);
});

test("clan-scope: a folder name that is not lower-case letters is an error and never reaches the shell", () => {
  const r = scopeOf("main", ["shared/clans/x;id/index.ts"], ["wardens", "x;id"]);
  assert.deepEqual(r.clans, []);
  assert.equal(r.errors.length, 1);
});
