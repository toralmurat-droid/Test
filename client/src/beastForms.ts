import Phaser from "phaser";
import { BeastForm, skillById, SkillDef, SKILLS } from "../../shared/skills";
import { Grain, MORPH_MS, SkillFx, FxEntity } from "./skillfx";
import { assetUrl } from "./assetUrl";

/**
 * Vampire Bat Form / Wolf Form (Murat 2026-11-08): while the hero's status words (Player.fx) hold a shapeshift buff
 * (BuffDef.form), the hero sprite and its gear are hidden and the beast is drawn in its place: a great black wolf that
 * trots, lunges with its jaws open and howls when it first takes shape, or a giant bat that flaps above its own shadow.
 * The sheets are ray-cast from small 3D models on the heroes' 1.5 texels per world px grid, 8 facings
 * (tools/art/paint/beastForms.ts, assets/hd/forms). Taking or leaving the shape plays SkillFx.morph: the texels of one
 * shape flow into the other.
 */

const BASE = "assets/hd/forms";
const META = "forms_meta";
/** Beast sheets are on the heroes' grid: 1.5 texels per world px. */
const FORM_SCALE = 1 / 1.5;
const FORMS: BeastForm[] = ["wolf", "bat"];
/** The skill that gives each shape (its school is the one the beast can still cast). */
const FORM_SKILL = Object.fromEntries(SKILLS.vampire.filter((s) => s.buff?.form).map((s) => [s.buff!.form!, s])) as Partial<Record<BeastForm, SkillDef>>;

/** The beast a hero's status words put them in, if any. */
export function formOfFx(fx: string | undefined): BeastForm | undefined {
  if (!fx) return undefined;
  for (const w of fx.split(",")) {
    const f = skillById(w)?.buff?.form;
    if (f) return f;
  }
  return undefined;
}

interface Run {
  form: BeastForm;
  sprite: Phaser.GameObjects.Sprite;
  shown: boolean; // the morph into it has finished: the beast is drawn
  leaving: boolean; // turning back into the hero
  gone: boolean; // ...and that morph has finished: the hero shows again
  biteUntil: number;
}

export interface FormHost extends FxEntity {
  sprite: Phaser.GameObjects.Sprite;
}

export class BeastForms {
  private runs = new Map<string, Run>();
  private loading = false;

  constructor(private scene: Phaser.Scene, private fx: SkillFx) {
    // a bat that turns to mist comes apart as the bat, not as the vampire
    fx.shapeOf = (id) => { const r = this.runs.get(id); return r && !r.leaving && r.sprite.visible ? fx.spritePixels([r.sprite]) : undefined; };
  }

  /** Loads the beast sheets the first time a vampire is seen. True once they can be drawn. */
  ready(): boolean {
    const sc = this.scene;
    if (sc.cache.json.exists(META) && FORMS.every((f) => sc.textures.exists(`form_${f}`))) {
      if (!sc.anims.exists("form_wolf_idle_down")) this.makeAnims();
      return true;
    }
    if (this.loading) return false;
    this.loading = true;
    sc.load.json(META, assetUrl(`${BASE}/forms.json`));
    for (const f of FORMS) {
      sc.load.spritesheet(`form_${f}`, assetUrl(`${BASE}/${f}.png`), { frameWidth: 64, frameHeight: 64 });
      sc.load.once(`filecomplete-spritesheet-form_${f}`, () => sc.textures.get(`form_${f}`).setFilter(Phaser.Textures.FilterMode.NEAREST));
    }
    if (!sc.load.isLoading()) sc.load.start();
    return false;
  }

  private makeAnims() {
    const meta = this.scene.cache.json.get(META);
    for (const f of FORMS) for (const [name, a] of Object.entries<any>(meta.forms[f].anims)) {
      const key = `form_${f}_${name}`;
      if (this.scene.anims.exists(key)) continue;
      this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(`form_${f}`, { frames: a.frames }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
    }
  }

  private origin() {
    const o = this.scene.cache.json.get(META)?.origin;
    return o ? [o.x, o.y] : [0.5, 54 / 64];
  }

  private play(r: Run, anim: string, dir: string, restart = false) {
    const key = `form_${r.form}_${anim}_${dir}`;
    if (!this.scene.anims.exists(key)) return;
    if (restart || r.sprite.anims.currentAnim?.key !== key) r.sprite.play(key, !restart);
  }

  /** A basic attack: the wolf lunges with its jaws, the bat dives in to bite. */
  attack(id: string) {
    const r = this.runs.get(id);
    if (r && !r.leaving) r.biteUntil = this.scene.time.now + 300;
  }

  /** Does casting `skill` keep this hero in beast shape (a skill of the form's own school, shared/skillEngine.ts castSkill)? */
  keeps(id: string, skill: string): boolean {
    const r = this.runs.get(id);
    if (!r || r.leaving) return false;
    const formSkill = skillById(skill);
    if (!formSkill || formSkill.buff?.form) return false; // a form again ends this one
    return FORM_SKILL[r.form]?.branch === formSkill.branch;
  }

  /** In beast shape (or changing): true while the hero sprite must stay hidden. */
  active(id: string) { return this.runs.has(id); }

  /**
   * Every frame for every hero. Starts or ends the change when the status words gain or lose a form, keeps the beast on
   * the hero's spot, facing and gait. Returns true while the hero itself must not be drawn.
   */
  tick(id: string, e: FormHost, moving: boolean, dir: string, now: number): boolean {
    const p = e.state;
    const want = p.dead ? undefined : formOfFx(p.fx);
    let r = this.runs.get(id);
    if (!want && !r) return false;
    if (!this.ready()) return false;
    const at = () => ({ x: e.sprite.x, y: e.sprite.y, depth: e.sprite.depth });

    if (want && r && (r.form !== want || r.leaving)) { this.drop(id); r = undefined; } // switched beast (or back again mid-change)
    if (want && !r) {
      // Taking the beast's shape
      const [ox, oy] = this.origin();
      const sprite = this.scene.add.sprite(e.sprite.x, e.sprite.y, `form_${want}`, 0).setOrigin(ox, oy).setScale(FORM_SCALE).setVisible(false);
      const run: Run = r = { form: want, sprite, shown: false, leaving: false, gone: false, biteUntil: 0 };
      this.runs.set(id, run);
      this.play(run, want === "wolf" ? "howl" : "fly", dir, true);
      sprite.anims.pause(); // (the wolf howls once it has taken shape)
      const from = this.fx.heroPixels(e), to = this.fx.spritePixels([sprite]);
      this.fx.morph(at, from, to, want, MORPH_MS, false, () => { run.shown = true; if (run.sprite.active) run.sprite.anims.resume(); });
    } else if (!want && r && !r.leaving) {
      // Turning back: the beast flows back into the hero (whose frame is up to date, only hidden)
      const run = r;
      run.leaving = true;
      const from = run.sprite.visible ? this.fx.spritePixels([run.sprite]) : [] as Grain[];
      run.sprite.setVisible(false);
      if (p.dead) run.gone = true;
      else this.fx.morph(at, from, this.fx.heroPixels(e), run.form, MORPH_MS, true, () => { run.gone = true; });
    }
    r = r!;
    if (r.leaving) {
      if (!r.gone) return true;
      this.drop(id);
      return false;
    }
    const s = r.sprite;
    s.setPosition(e.sprite.x, e.sprite.y).setDepth(e.sprite.depth).setVisible(r.shown);
    // the hero's status flashes (stunned, slowed...) show on the beast too
    if (e.sprite.isTinted) s.setTint(e.sprite.tintTopLeft); else if (s.isTinted) s.clearTint();
    const busy = s.anims.isPlaying && /_(howl|bite)_/.test(s.anims.currentAnim?.key ?? "");
    if (now < r.biteUntil && !/_bite_/.test(s.anims.currentAnim?.key ?? "")) this.play(r, "bite", dir, true);
    else if (!busy) {
      if (r.form === "bat") this.play(r, "fly", dir);
      else this.play(r, moving ? "run" : "idle", dir);
    }
    return true;
  }

  /** A hero left the scene. */
  drop(id: string) {
    this.runs.get(id)?.sprite.destroy();
    this.runs.delete(id);
  }
}
