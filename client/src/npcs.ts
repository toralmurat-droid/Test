import Phaser from "phaser";
import { NPCS, Npc, npcNear, TALK_RANGE } from "../../shared/npcs";
import { druidDialog, Q, QUEST, questObjective } from "../../shared/quests";
import { CHAR_ORIGIN, CharacterName, playCharAnim } from "./artAssets";

type Me = { x: number; y: number } | undefined;
type QuestState = { questStage: number; questCount: number } | undefined;

/**
 * Village NPCs (shared/npcs.ts): sprites by the bonfire, "!"/"?" quest markers, an "E Talk" prompt when close,
 * a dialog panel and the quest tracker. The server checks distance and owns quest progress.
 */
export class NpcLayer {
  private sprites = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; mark: Phaser.GameObjects.Text }>();
  private prompt = document.createElement("div");
  private dialog = document.createElement("div");
  private tracker = document.createElement("div");
  private toast = document.createElement("div");
  private near?: Npc;
  private talking?: Npc;
  private trackerHtml = "";
  private stage = -1;

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void) {
    const hud = document.getElementById("hud")!;
    this.prompt.id = "npcprompt";
    this.dialog.id = "npcdialog";
    this.tracker.id = "questtracker";
    this.toast.id = "questtoast";
    hud.append(this.prompt, this.dialog, this.tracker, this.toast);
    this.prompt.onclick = () => this.near && this.open(this.near);
    for (const n of NPCS) {
      const sprite = scene.add.sprite(n.x, n.y, n.sprite, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(0.75).setDepth(n.y);
      playCharAnim(sprite, n.sprite as CharacterName, "idle", n.dir);
      sprite.setInteractive({ useHandCursor: true }).on("pointerdown", () => { if (this.near === n) this.open(n); });
      const label = scene.add.text(n.x, n.y - 21, n.name, {
        fontFamily: "monospace", fontSize: "16px", color: "#b9f27c", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(n.y + 1);
      const mark = scene.add.text(n.x, n.y - 25, "", {
        fontFamily: "monospace", fontSize: "40px", fontStyle: "bold", color: "#ffd166", stroke: "#000", strokeThickness: 6,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(n.y + 1);
      scene.tweens.add({ targets: mark, y: n.y - 27, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.sprites.set(n.id, { sprite, label, mark });
    }
  }

  get isOpen() { return !!this.talking; }

  /** E key: talk to the NPC you stand next to (or close the dialog). */
  interact() {
    if (this.talking) this.close();
    else if (this.near) this.open(this.near);
  }

  close() {
    this.talking = undefined;
    this.dialog.classList.remove("open");
  }

  /** Server says the quest moved on: banner + refresh the open dialog. */
  onQuest(stage: number) {
    const msg: Record<number, [string, string]> = {
      [Q.INVESTIGATE]: ["New quest", QUEST.title],
      [Q.REPORT]: ["Blobs in the woods!", "Go back and tell Elder Rowan"],
      [Q.HUNT]: ["Quest updated", `Kill ${QUEST.killGoal} blobs`],
      [Q.RETURN]: [`${QUEST.killGoal} blobs slain!`, "Return to Elder Rowan"],
      [Q.DONE]: ["Quest complete", QUEST.title],
    };
    const m = msg[stage];
    if (m) {
      this.toast.innerHTML = `<div class="big">${m[0]}</div><div class="small">${m[1]}</div>`;
      this.toast.classList.remove("show"); void this.toast.offsetWidth; this.toast.classList.add("show");
      clearTimeout((this.toast as any)._t);
      (this.toast as any)._t = setTimeout(() => this.toast.classList.remove("show"), 3500);
    }
  }

  private open(n: Npc) {
    this.talking = n;
    this.stage = -1; // force a redraw
    this.dialog.classList.add("open");
  }

  private renderDialog(q: QuestState) {
    const n = this.talking!;
    const stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
    const key = stage * 1000 + count;
    if (key === this.stage) return;
    this.stage = key;
    const page = druidDialog(stage, count);
    this.dialog.innerHTML =
      `<div class="nd-head"><span class="nd-name">${n.name}</span><span class="nd-title">${n.title}</span></div>` +
      page.text.map((t) => `<p>${t}</p>`).join("") +
      `<div class="nd-btns">${page.accept ? `<button class="nd-accept">${page.accept}</button>` : ""}<button class="nd-bye">${page.bye} <kbd>E</kbd></button></div>`;
    const acc = this.dialog.querySelector<HTMLButtonElement>(".nd-accept");
    if (acc) acc.onclick = () => { this.send("quest"); acc.disabled = true; };
    this.dialog.querySelector<HTMLButtonElement>(".nd-bye")!.onclick = () => this.close();
  }

  update(me: Me, q: QuestState) {
    this.near = me ? npcNear(me.x, me.y) : undefined;
    if (this.talking && (!me || npcNear(me.x, me.y, TALK_RANGE * 1.6) !== this.talking)) this.close(); // walked away
    this.prompt.classList.toggle("open", !!this.near && !this.talking);
    if (this.near && !this.talking) this.prompt.innerHTML = `<kbd>E</kbd> Talk to ${this.near.name}`;
    if (this.talking) this.renderDialog(q);

    const stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
    const druid = this.sprites.get(QUEST.giver);
    if (druid) {
      // "!" = quest to pick up, "?" = come back to me
      const mark = stage === Q.NONE ? "!" : stage === Q.REPORT || stage === Q.RETURN ? "?" : "";
      if (druid.mark.text !== mark) druid.mark.setText(mark);
    }
    const obj = questObjective(stage, count);
    const html = obj ? `<div class="qt-title">${QUEST.title}</div><div class="qt-obj">${stage === Q.REPORT || stage === Q.RETURN ? "➜ " : "• "}${obj}</div>` : "";
    if (html !== this.trackerHtml) {
      this.trackerHtml = html;
      this.tracker.innerHTML = html;
      this.tracker.classList.toggle("open", !!html);
    }
  }
}
