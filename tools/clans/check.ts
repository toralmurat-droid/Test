/**
 * The static check on clan plug-in folders (Living Code M6): what shared/clans/<clan>/ may contain, read from the
 * TypeScript syntax tree. One of the fences around plug-in code (with the sandbox, the hash pin and review): a plug-in
 * is a pure function of its briefing, so anything that reaches outside it is refused before it is ever built.
 *
 * Refused: files other than .ts (.d.ts too), subfolders, files over CLAN_PLUGIN.maxFileBytes, file names other than
 * HELPER_NAME; imports other than "../api" and "./<file>" of a .ts file in the same folder (part 2: helper files; no
 * `..`, no subpath, no extension; import, export from, import(), import = require); the names in DENIED anywhere (as identifiers, property
 * names or string literals: `x.constructor` and `x["constructor"]` alike); Math.random and Math used as a value
 * (aliased, destructured); async functions, await, `with`, `import.meta`, `declare` and namespaces. Computed keys
 * built at run time are not chased: what slips past this still meets the sandbox, review and the hash pin.
 * Run: npx tsx tools/clans/check.ts [clan ...]   (no clan: every folder). Exit code 1 when anything is refused.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CLAN_PLUGIN } from "../../shared/clans/api";

export const CLANS_DIR = path.resolve(__dirname, "../../shared/clans");

/** Names a plug-in may never mention: module loading, the process, globals, codegen, reflection, clock, timers, async, network, threads, locale. */
export const DENIED = [
  "require", "process", "globalThis", "global", "eval", "Function", "constructor", "__proto__", "Reflect", "Proxy",
  "Date", "performance", "setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "clearImmediate",
  "queueMicrotask", "Promise", "fetch", "WebAssembly", "Atomics", "SharedArrayBuffer", "Worker", "Intl",
  "module", "exports", "Buffer", "XMLHttpRequest", "WebSocket", "self", "window", "importScripts", "__defineGetter__",
  "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
] as const;
const DENY = new Set<string>(DENIED);
/** The one module outside its folder a plug-in may import. */
export const ALLOWED_IMPORT = "../api";
/** A helper file's name in a clan folder (without .ts), and so the only `./<name>` a plug-in may import. */
export const HELPER_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/**
 * Whether `spec` is an import a plug-in may make: "../api", or "./<name>" with a HELPER_NAME (and, when `files` lists
 * the folder's helper names, one of them). Pure.
 */
export function importAllowed(spec: string, files?: ReadonlySet<string>): boolean {
  if (spec === ALLOWED_IMPORT) return true;
  const m = /^\.\/(.+)$/.exec(spec);
  return !!m && HELPER_NAME.test(m[1]) && (!files || files.has(m[1]));
}

/**
 * Every problem in one plug-in source file (`file` for the messages). Pure. `files`: the names (without .ts) of the
 * .ts files in its folder, so a `./<name>` import must name one of them (unchecked when not given).
 */
export function checkSource(file: string, text: string, files?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (Buffer.byteLength(text) > CLAN_PLUGIN.maxFileBytes) out.push(`${file}: larger than ${CLAN_PLUGIN.maxFileBytes} bytes`);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const bad = (n: ts.Node, what: string) => out.push(`${at(n)}: ${what}`);
  const spec = (n: ts.Node, s: ts.Expression | undefined) => {
    if (!s || !ts.isStringLiteral(s)) bad(n, "import: only a plain string path");
    else if (!importAllowed(s.text, files)) bad(n, `import "${s.text}": a plug-in may import only "${ALLOWED_IMPORT}" and "./<file>" of its own folder${/^\.\/[A-Za-z][\w-]*$/.test(s.text) && files ? " (no such .ts file there)" : ""}`);
  };
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) spec(n, n.moduleSpecifier);
    else if (ts.isExportDeclaration(n) && n.moduleSpecifier) spec(n, n.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(n)) bad(n, "import = require(...) is not allowed");
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) bad(n, "import(): dynamic imports are not allowed");
    else if (ts.isMetaProperty(n) && n.keywordToken === ts.SyntaxKind.ImportKeyword) bad(n, "import.meta is not allowed");
    else if (ts.isAwaitExpression(n)) bad(n, "await: a plug-in is synchronous");
    else if (ts.isForOfStatement(n) && n.awaitModifier) bad(n, "for await: a plug-in is synchronous");
    else if (ts.isWithStatement(n)) bad(n, "with is not allowed");
    else if (ts.isModuleDeclaration(n)) bad(n, "namespace / module / declare global blocks are not allowed");
    else if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) {
      const name = ts.idText(n as ts.Identifier);
      if (DENY.has(name)) bad(n, `${name}: not allowed in a plug-in`);
      if (name === "Math") {
        const p = n.parent;
        const access = p && (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === n;
        if (!access) bad(n, "Math: use it as Math.x only (no aliasing or destructuring)");
        else if (ts.isPropertyAccessExpression(p) ? p.name.text === "random" : !ts.isStringLiteralLike(p.argumentExpression) || p.argumentExpression.text === "random") bad(n, "Math.random: a plug-in gets no unseeded randomness (use the briefing's seed)");
      }
    } else if (ts.isStringLiteralLike(n) && !(n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)))) {
      if (DENY.has(n.text)) bad(n, `"${n.text}": not allowed in a plug-in, not even as a string`);
    }
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    for (const m of mods ?? []) {
      if (m.kind === ts.SyntaxKind.AsyncKeyword) bad(m, "async: a plug-in is synchronous");
      if (m.kind === ts.SyntaxKind.DeclareKeyword) bad(m, "declare is not allowed");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Every problem in clan `clan`'s folder (under `dir`, default shared/clans). */
export function checkClan(clan: string, dir = CLANS_DIR): string[] {
  const root = path.join(dir, clan), out: string[] = [];
  if (!/^[a-z]+$/.test(clan)) return [`${clan}: not a clan folder name`];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [`${clan}: no folder shared/clans/${clan}/`];
  if (!fs.existsSync(path.join(root, "index.ts"))) out.push(`${clan}/index.ts: missing (it must export plugin)`);
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = new Set(entries.filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")).map((e) => e.name.slice(0, -3)).filter((n) => HELPER_NAME.test(n)));
  for (const e of entries) {
    const rel = `${clan}/${e.name}`;
    if (!e.isFile()) { out.push(`${rel}: only .ts files, no folders or links`); continue; }
    if (!e.name.endsWith(".ts") || e.name.endsWith(".d.ts")) { out.push(`${rel}: only .ts files`); continue; }
    if (!HELPER_NAME.test(e.name.slice(0, -3))) { out.push(`${rel}: file names are a letter, then letters, digits, - or _ (at most 40)`); continue; }
    const st = fs.statSync(path.join(root, e.name));
    if (st.size > CLAN_PLUGIN.maxFileBytes * 4) { out.push(`${rel}: larger than ${CLAN_PLUGIN.maxFileBytes} bytes`); continue; }
    out.push(...checkSource(rel, fs.readFileSync(path.join(root, e.name), "utf8"), files));
  }
  return out;
}

/** The clan folders under `dir`. */
export const clanFolders = (dir = CLANS_DIR) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];

if (require.main === module) {
  const clans = process.argv.slice(2).length ? process.argv.slice(2) : clanFolders();
  let n = 0;
  for (const c of clans) {
    const p = checkClan(c);
    n += p.length;
    console.log(p.length ? `clan check ${c}: ${p.length} problem(s)\n${p.map((x) => `  ${x}`).join("\n")}` : `clan check ${c}: ok`);
  }
  process.exit(n ? 1 : 0);
}
