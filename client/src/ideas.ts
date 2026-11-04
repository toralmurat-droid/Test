import { BoardView, IDEA, IdeaView, STATUS_TEXT, waitText } from "../../shared/ideas";

/**
 * The Ideas board (I key, or Ideas board in the Esc game menu): suggest one idea a day, vote on others, see the hourly winner.
 * The server owns the log (shared/ideas.ts); this only shows it and sends "idea" / "ideavote" / "ideas".
 */
type Tab = "top" | "new" | "mine" | "history";

export class IdeaBoard {
  private el: HTMLElement;
  private text: HTMLTextAreaElement;
  private count: HTMLElement;
  private send: HTMLButtonElement;
  private msg: HTMLElement;
  private list: HTMLElement;
  private countdown: HTMLElement;
  private winner: HTMLElement;
  private view?: BoardView;
  private tab: Tab = "top";
  private clockOffset = 0; // server time - local time
  private timer?: number;

  constructor(private sendMsg: (type: string, msg?: unknown) => void) {
    const el = document.createElement("div");
    el.id = "ideas";
    el.hidden = true;
    el.innerHTML = `
      <h2>Ideas board</h2>
      <div id="ideatop"><span id="ideacountdown"></span><span id="ideawinner"></span></div>
      <div id="ideasubmit">
        <textarea id="ideatext" maxlength="${IDEA.maxChars}" rows="3" placeholder="Suggest one improvement for the game (one idea per day)"></textarea>
        <div class="row"><span id="ideacount"></span><button id="ideasend">Send</button></div>
        <p id="ideamsg"></p>
      </div>
      <div id="ideatabs">
        <button data-tab="top">Top</button><button data-tab="new">New</button><button data-tab="mine">My ideas</button><button data-tab="history">History</button>
      </div>
      <div id="idealist"></div>
      <p class="help">Every hour the idea with the best score wins (at least ${IDEA.winMinVoters} voters and +${IDEA.winMinScore}).
        Chat works too: /idea your idea, /up 12, /down 12 · I or Esc to close</p>`;
    document.getElementById("hud")!.appendChild(el);
    this.el = el;
    const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>("#" + id)!;
    this.text = $("ideatext"); this.count = $("ideacount"); this.send = $("ideasend"); this.msg = $("ideamsg");
    this.list = $("idealist"); this.countdown = $("ideacountdown"); this.winner = $("ideawinner");

    // Buttons never keep focus (Space/Enter are game keys); the text box does
    el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
    el.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest("button");
      if (!b || ev.detail === 0) return;
      if (b.dataset.tab) { this.tab = b.dataset.tab as Tab; this.renderList(); }
      else if (b.dataset.vote) {
        const id = Number(b.dataset.id), v = Number(b.dataset.vote);
        const cur = this.view?.open.find((i) => i.id === id)?.myVote ?? 0;
        this.sendMsg("ideavote", { id, v: cur === v ? 0 : v }); // click again to take the vote back
      } else if (b === this.send) this.submit();
    });
    this.text.addEventListener("input", () => this.updateCount());
    this.text.addEventListener("keydown", (ev) => {
      ev.stopPropagation(); // typing here must not move the hero or open menus
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); this.submit(); }
      if (ev.key === "Escape") { this.text.blur(); this.close(); }
    });
    this.text.addEventListener("keyup", (ev) => ev.stopPropagation());
    this.updateCount();
  }

  get open() { return !this.el.hidden; }
  /** True while the player types in the idea box (game keys are off). */
  typing() { return document.activeElement === this.text; }

  toggle() { if (this.open) this.close(); else this.show(); }

  show() {
    this.el.hidden = false;
    this.sendMsg("ideas");
    this.timer ??= window.setInterval(() => this.renderTop(), 1000);
  }

  close() {
    this.el.hidden = true;
    if (this.typing()) this.text.blur();
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  update(view: BoardView) {
    this.view = view;
    this.clockOffset = view.now - Date.now();
    this.renderTop();
    this.renderSubmit();
    this.renderList();
  }

  /** Feedback from the server ("Idea #12 received!", "You can't vote on your own idea."). */
  note(text: string, ok: boolean) {
    this.msg.textContent = text;
    this.msg.className = ok ? "ok" : "err";
    if (ok) { this.text.value = ""; this.updateCount(); }
  }

  private submit() {
    const t = this.text.value.trim();
    if (t.length < IDEA.minChars) return this.note(`Ideas need at least ${IDEA.minChars} characters.`, false);
    this.sendMsg("idea", t);
  }

  private updateCount() {
    const n = this.text.value.length;
    this.count.textContent = `${n}/${IDEA.maxChars}`;
    this.count.className = n >= IDEA.maxChars ? "full" : n >= IDEA.maxChars - 30 ? "near" : "";
  }

  private renderTop() {
    const v = this.view;
    if (!v) return;
    const now = Date.now() + this.clockOffset;
    if (now >= v.nextRound) this.sendMsg("ideas"); // the round just ended: fetch the result
    const left = Math.max(0, v.nextRound - now), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    this.countdown.textContent = `Next winner in ${m}:${String(s).padStart(2, "0")}`;
    this.winner.textContent = v.lastWinner ? `Last winner: #${v.lastWinner.id} ${short(v.lastWinner.text, 40)}` : "No winner yet";
    if (!v.canSubmit && v.nextSubmitAt) this.send.textContent = `Next idea in ${waitText(v.nextSubmitAt - now)}`;
  }

  private renderSubmit() {
    const v = this.view!;
    this.text.disabled = this.send.disabled = !v.canSubmit;
    if (v.canSubmit) this.send.textContent = "Send";
    else if (!v.nextSubmitAt) this.send.textContent = `Reach level ${v.minLevel}`;
    this.text.placeholder = v.canSubmit ? "Suggest one improvement for the game (one idea per day)"
      : v.nextSubmitAt ? "You already suggested an idea today. You can still vote!" : `Reach level ${v.minLevel} to suggest ideas. You can still vote!`;
  }

  private renderList() {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>("#ideatabs button")) b.classList.toggle("on", b.dataset.tab === this.tab);
    const v = this.view;
    this.list.replaceChildren();
    if (!v) return;
    let items: IdeaView[];
    if (this.tab === "top") items = [...v.open].sort((a, b) => b.score - a.score || b.voters - a.voters || a.createdAt - b.createdAt);
    else if (this.tab === "new") items = [...v.open].sort((a, b) => b.createdAt - a.createdAt);
    else if (this.tab === "mine") items = [...v.open, ...v.history].filter((i) => i.mine).sort((a, b) => b.createdAt - a.createdAt);
    else items = v.history;
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "help";
      p.textContent = this.tab === "mine" ? "You haven't suggested an idea yet." : this.tab === "history" ? "No finished ideas yet." : "No open ideas. Be the first!";
      this.list.appendChild(p);
      return;
    }
    for (const i of items) this.list.appendChild(this.card(i));
  }

  private card(i: IdeaView) {
    const c = document.createElement("div");
    c.className = "ideacard" + (i.mine ? " mine" : "");
    const body = document.createElement("div");
    body.className = "body";
    const head = document.createElement("div");
    head.className = "head";
    head.textContent = `#${i.id} · ${i.author}${i.status === "open" ? "" : " · " + STATUS_TEXT[i.status]}`;
    const txt = document.createElement("div");
    txt.textContent = i.text;
    body.append(head, txt);
    if (i.reason) { const r = document.createElement("div"); r.className = "reason"; r.textContent = i.reason; body.appendChild(r); }
    const votes = document.createElement("div");
    votes.className = "votes";
    const canVote = i.status === "open" && !i.mine;
    const btn = (v: 1 | -1, label: string) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = v > 0 ? "Upvote" : "Downvote";
      b.dataset.vote = String(v); b.dataset.id = String(i.id);
      b.disabled = !canVote;
      if (i.myVote === v) b.classList.add("on");
      return b;
    };
    const sc = document.createElement("span");
    sc.className = "score" + (i.score > 0 ? " pos" : i.score < 0 ? " neg" : "");
    sc.textContent = (i.score > 0 ? "+" : "") + i.score;
    sc.title = `${i.voters} voter${i.voters === 1 ? "" : "s"}`;
    votes.append(btn(1, "▲"), sc, btn(-1, "▼"));
    c.append(votes, body);
    return c;
  }
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
