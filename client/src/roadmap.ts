/**
 * The studio plan shown on the public roadmap page (/roadmap, client/roadmap.html, roadmapPage.ts).
 * This is the one place where development status lives: when a PR delivers or starts an item, set its `status`
 * (and `pr`) in the same PR, so the page always shows where the game stands. Dates are targets, not promises.
 */
export type Status = "done" | "doing" | "next" | "later" | "blocked";

export interface Role { role: string; who: string; does: string }
export interface Item { name: string; owner: string; status: Status; note?: string; pr?: number }
export interface Milestone { id: string; name: string; goal: string; target: string; exit: string; items: Item[] }
export interface Risk { risk: string; plan: string }

/** The studio: each role a real studio would staff, and who fills it here (agents are in .claude/agents/). */
export const TEAM: Role[] = [
  { role: "Game Director", who: "Murat", does: "Vision, art direction, final say on every design decision." },
  { role: "Producer", who: "Project coordinator (Claude)", does: "Plans milestones, opens one thread per feature, keeps this roadmap true." },
  { role: "Lead Designer", who: "planner agent", does: "Turns each feature into a spec with acceptance criteria." },
  { role: "Gameplay Engineers", who: "gameplay-engineer agent", does: "Rules, combat, monsters, quests, the war simulation (shared/, server/)." },
  { role: "Server & Live Ops Engineer", who: "gameplay-engineer + infra threads", does: "Railway, database, seamless deploys, side-by-side Ages." },
  { role: "AI Engineer", who: "gameplay-engineer + Claude API", does: "War Councils, order validator, heralds, the Forge." },
  { role: "Client & UI Engineer", who: "client-engineer agent", does: "HUD, menus, war table map, phone layout." },
  { role: "Art Director & Pixel Artists", who: "art-audio agent", does: "Banners, holds, tabards, forged items. The village bonfire is the style model." },
  { role: "Audio", who: "art-audio agent", does: "War horns, siege sounds, clan themes." },
  { role: "Narrative Designer", who: "content-writer agent", does: "Clan lore, leader voices, writs, chronicle lines." },
  { role: "Balance & Economy", who: "balance-analyst agent", does: "Duel, PvE and war sims; rewards and gold flow." },
  { role: "QA", who: "tester + qa agents", does: "Automated tests on every PR; play-tests when asked." },
  { role: "Tech Lead / Code Review", who: "reviewer agent", does: "Checks every change against CLAUDE.md; its verdict gates the merge." },
  { role: "Community", who: "Players (/idea board) + patch notes", does: "Player ideas, votes and the News panel." },
];

export const MILESTONES: Milestone[] = [
  {
    id: "M0", name: "Foundations", target: "16–29 Nov 2026",
    goal: "Everything the war needs underneath, before players see any of it.",
    exit: "Saves in Postgres on Railway; the war sim plays 200 wars of 30 days and no clan dominates; this page is live.",
    items: [
      { name: "Riven Marches concept and Murat's decisions", owner: "Producer", status: "done", pr: 394 },
      { name: "Roadmap page on the wiki", owner: "Producer", status: "done" },
      { name: "Saves in a database (code already supports it)", owner: "Server & Live Ops", status: "done", note: "server/store.ts with DATABASE_URL" },
      { name: "Turn on Postgres on Railway", owner: "Game Director", status: "done", note: "Live since 14 Nov 2026: 5 accounts moved over" },
      { name: "War data model: territories from every zone, sanctuaries, capitals (shared/war/)", owner: "Gameplay Engineers", status: "done", note: "31 territories, 5 clans with a capital per act" },
      { name: "War sim tools/balance/war.ts with scripted leaders", owner: "Balance & Economy", status: "done", note: "Stalemate goal met: one clan dominates in 0.5% of wars" },
    ],
  },
  {
    id: "M1", name: "The War Goes Live", target: "14 Nov – 20 Dec 2026",
    goal: "The war runs live over Act 1 and Act 2 (all five clans, scripted doctrine) and players can take part.",
    exit: "Players can hold standards, see Control move every 10 minutes and join a siege window; it feels good to play.",
    items: [
      { name: "War tick, Control, pressure formula, siege windows in the live game", owner: "Gameplay Engineers", status: "done", note: "server/war.ts runs the whole war (all five clans, both acts) every 10 minutes and saves it" },
      { name: "Standards with capture rings, oath to a clan", owner: "Art + Gameplay", status: "done", note: "Two per zone; a minute in a ring is valor for the next war tick" },
      { name: "Holds in the five clan styles", owner: "Art + Gameplay", status: "done", note: "One per zone, changes with the owner (look only for now)" },
      { name: "Front plaque HUD and siege countdown", owner: "Client & UI", status: "done" },
      { name: "Banners and standards in the world (pixel art)", owner: "Art Director", status: "done" },
      { name: "War horn and siege notices", owner: "Audio", status: "done" },
      { name: "Clan leaders speak (Hale, the Redfang Chief, the Pale Marshal, the Hide-Mother, the Veiled Oracle)", owner: "Narrative", status: "done" },
      { name: "Play-test and tuning", owner: "QA + Balance", status: "doing" },
    ],
  },
  {
    id: "M2", name: "Five Banners (alpha)", target: "Jan – Feb 2027",
    goal: "Each clan plays its own way and players live the war: sworn ranks, writs, caravans, the war table.",
    exit: "Without players no clan holds over 30% of the map for more than three days in the sim and live.",
    items: [
      { name: "Ossuary Host siege works, Hide-Kin tunnels, Veiled rituals", owner: "Gameplay Engineers", status: "later" },
      { name: "Swear to a clan, tabards, Renown ranks", owner: "Gameplay + Art", status: "done", note: "Oaths, Renown ranks and clan pennants on name tags live" },
      { name: "War writs on bounty boards, caravans on supply roads", owner: "Gameplay + Narrative", status: "done" },
      { name: "War table map (world map overlay)", owner: "Client & UI", status: "done" },
      { name: "Night Raiders hunt the leading clan; Rally for the weakest", owner: "Gameplay Engineers", status: "later" },
      { name: "Clan troops and holds for all five clans", owner: "Art Director", status: "done", note: "Troops fight on the server; painted soldiers, carts and Holds live" },
    ],
  },
  {
    id: "NL", name: "New Lands of the Marches", target: "Dec 2026 – 2027, alongside the milestones",
    goal: "The Riven Marches as one continent (Murat 2026-11-14): Act 1 is the Wardens' homeland, Act 2 the Veiled Circle's; three new lands and the Crown complete it.",
    exit: "Every clan fights from its own homeland; the war table shows the whole continent; each new land has zones, a village, quests and its own levels.",
    items: [
      { name: "Continent design: regions, borders between regions, level bands, design page v0.3", owner: "Lead Designer", status: "done" },
      { name: "Regions in the war map: territories grouped by land, links between lands, capitals move home", owner: "Gameplay Engineers", status: "next" },
      { name: "The Red Badlands (Redfang homeland, west)", owner: "World + Art + Narrative", status: "later" },
      { name: "The Grey Barrow Moors (Ossuary Host homeland, north-east)", owner: "World + Art + Narrative", status: "later" },
      { name: "The Mawdeep Sinkholes (Hide-Kin homeland, south)", owner: "World + Art + Narrative", status: "later" },
      { name: "The Crown of the Marches (neutral prize in the middle)", owner: "World + Gameplay", status: "later" },
    ],
  },
  {
    id: "M3", name: "War Councils", target: "Mar 2027",
    goal: "An AI leads each clan, first in shadow mode, then for real.",
    exit: "Councils lead for two weeks with no rule broken; Murat gets the daily digest by email.",
    items: [
      { name: "Orders API and validator", owner: "AI Engineer", status: "later" },
      { name: "Councils in shadow mode, compared with scripted doctrine", owner: "AI Engineer", status: "later" },
      { name: "Herald proclamations and the war chronicle page on the wiki", owner: "Narrative + Client", status: "later" },
      { name: "Email flags and daily digest; kill switch and undo", owner: "Server & Live Ops", status: "later" },
    ],
  },
  {
    id: "M4", name: "The Forge", target: "Apr 2027",
    goal: "Clans invent new weapons and monsters from the Codex, live without a restart.",
    exit: "A forged item goes from council order to live in under a war day, passing sims, with art.",
    items: [
      { name: "Codex recipes and power budgets", owner: "Lead Designer + Balance", status: "later" },
      { name: "Art from recipe parameters (tools/art)", owner: "Art Director", status: "later" },
      { name: "Content packs hot-loaded by the running server", owner: "Server & Live Ops", status: "later" },
    ],
  },
  {
    id: "M5", name: "Ages", target: "May – Jun 2027",
    goal: "Two versions of the game side by side; players cross to the new one when they choose.",
    exit: "A real update ships as an Age with no player kicked mid-fight, and rolls back cleanly in a drill.",
    items: [
      { name: "War state as its own service with a versioned API", owner: "Server & Live Ops", status: "later" },
      { name: "Gateway, Vanguard canary, crossing offer, safe-moment move", owner: "Server + Client", status: "later" },
      { name: "Automatic rollback on error spikes", owner: "Server & Live Ops", status: "later" },
    ],
  },
  {
    id: "M6", name: "Living Code", target: "Summer 2027",
    goal: "Clan AIs write small code changes for their own clan, shipped as Ages.",
    exit: "Ten AI changes shipped with no incident; every one logged and emailed.",
    items: [
      { name: "Clan plug-in folders behind a fixed interface", owner: "Gameplay Engineers", status: "later" },
      { name: "AI PR bot with sandbox rules and auto-merge", owner: "AI Engineer + Tech Lead", status: "later" },
    ],
  },
  {
    id: "LIVE", name: "The live game (all the time)", target: "Ongoing",
    goal: "Keep Act 1 and Act 2 growing while the war is built.",
    exit: "Players always have something new; patch notes every week.",
    items: [
      { name: "Re-add archived classes one by one", owner: "Gameplay + Art", status: "doing", note: "Songweaver in progress" },
      { name: "Houses and props rework", owner: "Art Director", status: "doing" },
      { name: "Winning player ideas", owner: "Community", status: "doing" },
      { name: "Skills page with filmed clips", owner: "Client + QA", status: "done", pr: 391 },
    ],
  },
];

export const RISKS: Risk[] = [
  { risk: "One clan snowballs and the war stops being fun.", plan: "Prove the stalemate in the war sim before any AI leads; Rally and Night Raiders as brakes." },
  { risk: "The war gets in the way of new players levelling.", plan: "Villages, dungeons and quest-boss lairs never flip; troops spawn at the zone's level." },
  { risk: "AI changes break the live game.", plan: "Sandboxed folders, no access to saves or core code, automatic rollback, email flags." },
  { risk: "AI model costs grow.", plan: "A daily call budget per clan; scripted doctrine takes over when it runs out." },
  { risk: "The server room gets too big (TownRoom.ts is 6,000+ lines).", plan: "War systems live in their own shared/war and server/war modules." },
  { risk: "Railway limits for two versions at once.", plan: "Measure in M0; Ages only need double capacity for a few hours per update." },
];
