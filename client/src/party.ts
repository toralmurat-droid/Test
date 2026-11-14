import "./party.css";
import { PARTY } from "../../shared/party";
import { TRADE } from "../../shared/trade";
import { nearbyEmptyMessage } from "./hudLogic";

/**
 * Player groups (shared/party.ts): the Group button / P key opens a panel to invite nearby heroes or leave,
 * an invite pops up with Accept / Decline, and a small party frame shows each member's HP.
 * Members can't hurt each other; their names show green over their heads.
 */
const NEAR_PX = 640; // heroes this close are listed for an invite
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export class PartyUI {
  private panel = document.createElement("div");
  private frame = document.createElement("div");
  private ask = document.createElement("div");
  private toast = document.createElement("div");
  private invite?: { from: string; name: string; until: number };
  private toastTimer = 0;
  private lastHtml = "";
  private lastFrame = "";
  private lastAsk = "";

  constructor(private send: (type: string, msg?: unknown) => void, private players: () => any, private me: () => string, private onTrade?: (id: string) => void) {
    const hud = document.getElementById("hud")!;
    this.panel.id = "partypanel";
    this.panel.hidden = true;
    this.frame.id = "partyframe";
    this.ask.id = "partyask";
    this.ask.hidden = true;
    this.toast.id = "partytoast";
    for (const el of [this.panel, this.ask]) {
      el.addEventListener("mousedown", (ev) => ev.preventDefault()); // never take focus from the game
      el.addEventListener("click", (ev) => {
        if (ev.detail === 0) return; // keyboard "clicks" (Space/Enter) don't count
        const b = (ev.target as HTMLElement).closest("button");
        if (!b) return;
        if (b.dataset.inv) this.send("pinvite", { id: b.dataset.inv });
        else if (b.dataset.trade) this.onTrade?.(b.dataset.trade);
        else if (b.dataset.act === "leave") this.send("pleave");
        else if (b.dataset.act === "close") this.close();
        else if (b.dataset.act === "yes" || b.dataset.act === "no") {
          if (this.invite) this.send(b.dataset.act === "yes" ? "paccept" : "pdecline", { from: this.invite.from });
          this.invite = undefined;
          this.ask.hidden = true;
          this.lastAsk = "";
        }
      });
    }
    hud.append(this.panel, this.frame, this.ask, this.toast);
  }

  get open() { return !this.panel.hidden; }
  toggle() { this.panel.hidden = !this.panel.hidden; this.lastHtml = ""; this.update(); }
  close() { this.panel.hidden = true; }

  invited(from: string, name: string, ms = PARTY.inviteMs) {
    this.invite = { from, name, until: Date.now() + ms };
    this.ask.hidden = false;
  }

  notice(text: string) {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 3500);
  }

  /** Called every frame: keeps the frame, the panel and the invite card up to date (DOM only touched on change). */
  update() {
    const all = this.players(), myId = this.me();
    const mine = all?.get(myId);
    if (!mine) return;
    const group: [string, any][] = [];
    const others: [string, any, number][] = [];
    all.forEach((p: any, id: string) => {
      if (mine.party && p.party === mine.party) group.push([id, p]);
      else if (id !== myId) others.push([id, p, Math.hypot(p.x - mine.x, p.y - mine.y)]);
    });

    // Party frame: every member but me, with an HP bar
    const fh = group.filter(([id]) => id !== myId).map(([, p]) => {
      const pct = p.dead ? 0 : Math.round((100 * p.hp) / Math.max(1, p.maxHp));
      return `<div class="pm${p.dead ? " dead" : ""}"><span class="pn">${esc(p.name)} <small>Lv${p.level}</small></span>`
        + `<span class="pb"><i style="width:${pct}%"></i></span></div>`;
    }).join("");
    const frameHtml = fh ? `<div class="pt">Group</div>${fh}` : "";
    if (frameHtml !== this.lastFrame) { this.frame.innerHTML = frameHtml; this.lastFrame = frameHtml; }

    // Invite card with a countdown
    if (this.invite) {
      const left = Math.ceil((this.invite.until - Date.now()) / 1000);
      if (left <= 0) { this.invite = undefined; this.ask.hidden = true; }
      else {
        const html = `<p><b>${esc(this.invite.name)}</b> invites you to a group <small></small></p>`
          + `<button data-act="yes">Accept</button> <button data-act="no">Decline</button>`;
        if (html !== this.lastAsk) { this.ask.innerHTML = html; this.lastAsk = html; }
        const sec = this.ask.querySelector("small")!;
        if (sec.textContent !== `(${left}s)`) sec.textContent = `(${left}s)`; // only the countdown changes, so clicks land
      }
    }

    if (this.panel.hidden) return;
    const full = group.length >= PARTY.maxSize;
    const near = others.filter(([, , d]) => d <= NEAR_PX).sort((a, b) => a[2] - b[2]).slice(0, 8);
    let html = `<h2>Group</h2>`;
    if (group.length) {
      html += `<ul>${group.map(([id, p]) => `<li>${esc(p.name)} <small>${p.cls} Lv${p.level}${id === myId ? " (you)" : ""}</small></li>`).join("")}</ul>`
        + `<button data-act="leave">Leave group</button>`;
    } else html += `<p class="help">You are not in a group. Group members can't hurt each other and share kill XP in the same zone, but monsters fight harder against a group.</p>`;
    html += `<h3>Heroes nearby</h3>`;
    html += near.length
      ? `<ul>${near.map(([id, p, d]) => `<li>${esc(p.name)} <small>${p.cls} Lv${p.level}${p.party ? " · in a group" : ""}</small>`
        + ` <span class="pbtns">${p.party || full ? "" : `<button data-inv="${esc(id)}">Invite</button>`}`
        + `${d <= TRADE.range ? ` <button data-trade="${esc(id)}">Trade</button>` : ""}</span></li>`).join("")}</ul>`
      : `<p class="help">${nearbyEmptyMessage(group.filter(([id, p]) => id !== myId && Math.hypot(p.x - mine.x, p.y - mine.y) <= NEAR_PX).length)}</p>`;
    html += `<p class="help">Max ${PARTY.maxSize} heroes · /leave in chat · P or Esc to close <button data-act="close">Close</button></p>`;
    if (html !== this.lastHtml) { this.panel.innerHTML = html; this.lastHtml = html; }
  }
}
