import { icon } from "./pixelicons";

const KEY = "chat.hidden";

/** Text on the toggle for unread lines while the log is hidden: "" for none, "9+" past nine. */
export function unreadLabel(n: number): string { return n <= 0 ? "" : n > 9 ? "9+" : String(n); }

/** Is the chat log drawn? Hidden by the player, but shown while the chat box has focus (so you see what you answer). */
export function chatShown(hidden: boolean, typing: boolean): boolean { return !hidden || typing; }

/**
 * A small button at the right end of the chat box that hides the chat log (kept per browser). While hidden, new lines
 * only raise a count on the button; opening the chat box (Enter) shows the log until you send or leave it.
 * It never takes focus, so Space/Enter and the game keys keep going to the game.
 */
export function setupChatToggle(hud: HTMLElement, log: HTMLElement, input: HTMLInputElement) {
  let hidden = false, typing = false, unread = 0;
  try { hidden = localStorage.getItem(KEY) === "1"; } catch { /* storage off */ }
  const btn = document.createElement("button");
  btn.id = "chattoggle"; btn.type = "button"; btn.tabIndex = -1;
  btn.innerHTML = icon("chat") + `<b></b>`;
  const badge = btn.querySelector("b")!;
  hud.append(btn);
  const apply = () => {
    document.body.classList.toggle("chat-hidden", !chatShown(hidden, typing));
    const label = hidden && !typing ? unreadLabel(unread) : "";
    badge.textContent = label; badge.hidden = !label;
    btn.classList.toggle("off", hidden);
    btn.dataset.tip = hidden ? "Show chat" : "Hide chat";
    btn.dataset.tiphint = hidden && unread > 0 && !typing ? `${unread} new` : "";
  };
  btn.addEventListener("mousedown", (ev) => ev.preventDefault()); // never take focus from the game
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    hidden = !hidden; unread = 0;
    try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch { /* storage off */ }
    apply(); btn.blur();
  });
  let blurAt = 0;
  new MutationObserver((muts) => {
    if (!hidden || typing || performance.now() - blurAt < 1000) return; // (the server's echo of the line you just sent)
    for (const m of muts) unread += m.addedNodes.length;
    apply();
  }).observe(log, { childList: true });
  input.addEventListener("focus", () => { typing = true; unread = 0; apply(); });
  input.addEventListener("blur", () => { typing = false; blurAt = performance.now(); apply(); });
  apply();
}
