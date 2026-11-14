import { isBook, isLute, itemLevel, luteTraits } from "../../shared/gear";
import { BOOK_TEXT } from "../../shared/songbook";
import { LUTE_TRAITS, luteAt } from "../../shared/lute";

/**
 * Tooltip helpers for the Songweaver's books and lute (cosmetic; the rules and numbers are in shared/).
 * Texts: docs/songweaver-di-content.md. Kept short: the gear screen's info box is only a few lines high.
 */
export const BOUND_LINE = "Bound. It won't leave your side.";
export const POOR_SHIELD = "Not meant to be read in a fight. As a shield it is a poor one.";

/** Base id of an item id: strips `@level`, `#traits`, `^runes`, `~affixes`. */
export const songBase = (id: string) => (id ?? "").split(/[@#^~]/)[0];
export const isSongbook = (id: string) => songBase(id) === "songweaver_shield";

/** Extra tooltip lines for books and the lute (HTML). `cls` is the viewer's class. */
export function songItemHtml(id: string, cls: string | undefined): string {
  const out: string[] = [];
  const text = BOOK_TEXT[songBase(id)];
  if (isBook(id) && text) {
    out.push(`<span class="glvl">${text.desc}</span>`);
    out.push(`<span class="gok">Full gauge: ${text.line}</span>`);
    const who = isSongbook(id) ? "Yours from the start." : "Only a minstrel hears its gift. Needs a mind for magic to read.";
    out.push(cls === "songweaver" ? `<span class="glvl">${who}</span>` : `<span class="gbad">${POOR_SHIELD}</span>`);
  }
  if (isLute(id)) {
    const st = luteAt(itemLevel(id)), tr = luteTraits(id);
    out.push(`<span class="glvl">${st.line}</span>`);
    out.push(tr.length ? `Fitted: ${tr.map((t) => LUTE_TRAITS.find((x) => x.id === t)?.name ?? t).join(", ")}.` : "No fittings. Wren can change that.");
  }
  return out.join("<br>");
}
