/** The wiki home (/wiki, client/wiki.html): one card per page listed in wikiPages.ts, in the skills page look. */
import "./pixelfont.css";
import "./skillsPage.css";
import { installWeatheredFrames } from "./weathered";
import { WIKI } from "./wikiPages";
import { assetUrl } from "./assetUrl";

installWeatheredFrames();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
document.getElementById("sk-main")!.innerHTML = WIKI.map((shelf) => `<section class="sk-class">
  <h3 class="sk-branch">${esc(shelf.name)}</h3><p class="sk-help">${esc(shelf.help)}</p>
  <div class="sk-grid">${shelf.pages.map((p) => `<a class="sk-card wk-card" href="${esc(p.href)}">
    ${p.img ? `<div class="sk-view"><img class="sk-clip" src="${esc(assetUrl(p.img))}" alt="" loading="lazy"></div>` : ""}
    <div class="sk-text"><h3>${esc(p.title)}</h3><p>${esc(p.blurb)}</p></div>
  </a>`).join("")}</div>
</section>`).join("");
