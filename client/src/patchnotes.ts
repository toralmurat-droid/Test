// In-game patch notes (N, or News in the Esc game menu).
// One JSON file per update in client/patchnotes/ (see client/patchnotes/README.md).
// One file per PR means parallel PRs never conflict on this list.

export interface PatchNote { id: string; num: number; date: string; pr?: number; title: string; changes: string[] }

const files = import.meta.glob<{ default: Omit<PatchNote, "id"> }>("../patchnotes/*.json", { eager: true });

/** Oldest first: by date, then by PR number (notes without one go last that day), then by file name. */
const byAge = (a: Omit<PatchNote, "num">, b: Omit<PatchNote, "num">) =>
  a.date.localeCompare(b.date) || (a.pr ?? Infinity) - (b.pr ?? Infinity) || a.id.localeCompare(b.id);

/** Newest first. Each note gets its patch number (1 = oldest) at build time from
 *  that order, so PRs never hand-assign numbers and never conflict over them. */
export const PATCH_NOTES: PatchNote[] = Object.entries(files)
  .map(([path, mod]) => ({ ...mod.default, id: path.replace(/^.*\//, "").replace(/\.json$/, "") }))
  .sort(byAge)
  .map((n, i) => ({ ...n, num: i + 1 }))
  .reverse();

const SEEN_KEY = "patchnotes-seen";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function loadSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}
function saveSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(PATCH_NOTES.map((n) => n.id))); } catch { /* private mode */ }
}

export class PatchNotesPanel {
  private el: HTMLElement;
  private badge: HTMLElement;
  private notice: HTMLElement;
  private fresh: Set<string>;

  constructor(private openFromNotice: () => void) {
    const seen = loadSeen();
    // First visit on this device: nothing is "new" (the intro covers the basics)
    this.fresh = new Set(seen ? PATCH_NOTES.filter((n) => !seen.has(n.id)).map((n) => n.id) : []);
    if (!seen) saveSeen();

    this.el = document.createElement("div");
    this.el.id = "patchnotes";
    this.el.hidden = true;
    document.getElementById("hud")!.appendChild(this.el);
    this.el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
    this.el.addEventListener("click", (ev) => { if ((ev.target as HTMLElement).closest("#patchclose")) this.close(); });

    this.badge = document.getElementById("newsbadge")!;
    this.notice = document.createElement("div");
    this.notice.id = "patchnotice";
    this.notice.hidden = true;
    document.getElementById("hud")!.appendChild(this.notice);
    this.notice.addEventListener("mousedown", (ev) => ev.preventDefault());
    this.notice.addEventListener("click", () => this.openFromNotice());
    this.render();
  }

  /** Shows the "new update" notice for 15 s (call once the world is on screen). */
  announce() {
    if (this.fresh.size && !this.open) {
      const latest = PATCH_NOTES.find((n) => this.fresh.has(n.id))!;
      this.notice.textContent = this.fresh.size === 1
        ? `New update: Patch #${latest.num} ${latest.title} (N)`
        : `${this.fresh.size} new updates since your last visit (N)`;
      this.notice.hidden = false;
      setTimeout(() => { this.notice.hidden = true; }, 15000);
    }
  }

  get open() { return !this.el.hidden; }
  toggle() { if (this.open) this.close(); else this.show(); }

  show() {
    this.render();
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.notice.hidden = true;
    saveSeen();
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.fresh.clear(); // seen now: drop the NEW tags and the badge
    this.render();
  }

  private render() {
    const n = this.fresh.size;
    this.badge.hidden = n === 0;
    this.badge.textContent = String(n);
    this.el.innerHTML =
      `<h2>Patch notes</h2><p class="pnhint">What changed in each game update, newest first.</p>` +
      PATCH_NOTES.map((p) =>
        `<div class="pn${this.fresh.has(p.id) ? " new" : ""}"><h3>${this.fresh.has(p.id) ? `<span class="pnnew">NEW</span> ` : ""}${esc(p.title)}</h3>` +
        `<div class="pndate">Patch #${p.num} · ${esc(p.date)}</div>` +
        `<ul>${p.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`).join("") +
      `<button id="patchclose">Close (N or Esc)</button>`;
  }
}
