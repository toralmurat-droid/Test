import { Signpost, signpostNear } from "../../shared/map";

/** Shows a signpost's directions in a small wooden panel while the player stands next to it. */
export class SignPanel {
  private el = document.createElement("div");
  private current?: Signpost;

  constructor() {
    this.el.id = "signpanel";
    document.getElementById("hud")?.appendChild(this.el);
  }

  update(me: { x: number; y: number } | undefined) {
    const s = me ? signpostNear(me.x, me.y) : undefined;
    if (s === this.current) return;
    this.current = s;
    this.el.classList.toggle("open", !!s);
    if (!s) return;
    const rows = s.dirs.map((d) => `<div class="sp-row"><span class="sp-arrow">${d.arrow}</span>${d.name}</div>`).join("");
    this.el.innerHTML = `<div class="sp-title">Signpost</div>${rows}`;
  }
}
