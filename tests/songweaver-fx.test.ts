import { test } from "node:test";
import assert from "node:assert/strict";
import { DEGREES, DORIAN_RADIUS, LYDIAN_SHIELD, MODE_IDS, MODES, PHRYGIAN } from "../shared/songs";
import { CANTRIPS, FINISHERS, SKILLS } from "../shared/skills";
import { modeAbbr, modeText } from "../client/src/modeChip";
import { DEGREE_COLOR, degreeColor, hasSongShield, isSongShieldWord, MODE_COLOR } from "../client/src/songTables";

const SONG = [...SKILLS.songweaver, ...CANTRIPS.songweaver, ...FINISHERS];
const rank = (n: number) => () => n;

test("modeAbbr: two letters, unique, every mode", () => {
  const ab = MODE_IDS.map(modeAbbr);
  for (const a of ab) assert.match(a, /^\S{2}$/);
  assert.equal(new Set(ab).size, MODE_IDS.length);
  for (const m of MODE_IDS) assert.ok(MODE_COLOR[m] !== undefined, m);
});

test("modeText: base numbers match the shared tables", () => {
  for (const m of MODE_IDS) {
    const t = modeText(m, rank(1)), d = MODES[m];
    assert.equal(t.head, `${d.name} mode`);
    assert.ok(t.line.includes(`Heals ×${d.ally}`) && t.line.includes(`Damage ×${d.foe}`), t.line);
    assert.ok(t.desc.endsWith("Modulate switches to the next mode you know."));
  }
  assert.ok(modeText("lydian", rank(1)).line.includes(`shield ${Math.round(LYDIAN_SHIELD.share * 100)}%`));
  assert.ok(modeText("lydian", rank(1)).desc.includes(`${LYDIAN_SHIELD.maxPct}% of max HP for ${LYDIAN_SHIELD.ms / 1000} s`));
  assert.ok(modeText("dorian", rank(1)).line.includes(`Reach +${Math.round(DORIAN_RADIUS * 100)}%`));
  const p = modeText("phrygian", rank(1)).line;
  assert.ok(p.includes(`Poise +${Math.round(PHRYGIAN.poise * 100)}%`) && p.includes(`Res +${Math.round(PHRYGIAN.res * 100)}%`), p);
  assert.ok(!modeText("major", rank(1)).line.includes("Reach"));
});

test("modeText: rank scaling (+10% of the base per rank above 1)", () => {
  assert.ok(modeText("lydian", rank(3)).line.includes(`shield ${Math.round(LYDIAN_SHIELD.share * 1.2 * 100)}%`));
  assert.ok(modeText("dorian", rank(3)).line.includes(`Reach +${Math.round(DORIAN_RADIUS * 1.2 * 100)}%`));
  const p = modeText("phrygian", rank(3)).line;
  assert.ok(p.includes(`Poise +${Math.round(PHRYGIAN.poise * 1.2 * 100)}%`) && p.includes(`Res +${Math.round(PHRYGIAN.res * 1.2 * 100)}%`), p);
  assert.notEqual(modeText("dorian", rank(1)).line, modeText("dorian", rank(5)).line);
  // rank 0 never scales below the base
  assert.equal(modeText("dorian", rank(0)).line, modeText("dorian", rank(1)).line);
});

test("degreeColor: every degree used by SONG_SKILLS has its own colour", () => {
  const used = new Set(SONG.map((s) => s.degree).filter((d): d is NonNullable<typeof d> => !!d));
  assert.ok(used.size > 0);
  for (const d of used) assert.ok(d in DEGREE_COLOR, `no colour for degree ${d}`);
  for (const d of DEGREES) assert.ok(d in DEGREE_COLOR, d);
  assert.equal(new Set(DEGREES.map((d) => DEGREE_COLOR[d])).size, DEGREES.length, "degree colours are distinct");
});

test("degreeColor: unknown or missing degree falls back to gold", () => {
  assert.equal(degreeColor(undefined), 0xffd24d);
  assert.equal(degreeColor("zz"), 0xffd24d);
});

test("hasSongShield / isSongShieldWord: true exactly for shield skills", () => {
  const shields = SONG.filter((s) => s.buff?.shield || s.field?.party?.shield).map((s) => s.id).sort();
  assert.deepEqual(shields, ["sg_f_amen", "sg_g_bless", "sg_pedal"]);
  for (const s of SONG) assert.equal(isSongShieldWord(s.id), shields.includes(s.id), s.id);
  for (const id of shields) assert.ok(hasSongShield(id));
  assert.ok(hasSongShield("mode:major,sg_pedal,x"));
  assert.ok(!hasSongShield(undefined));
  assert.ok(!hasSongShield(""));
  assert.ok(!hasSongShield("mode:major,nonsense"));
  assert.ok(!isSongShieldWord("nonsense"));
});
