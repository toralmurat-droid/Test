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
    exit: "Saves in Postgres on Railway; a war sim runs 1,000 simulated years headless; this page is live.",
    items: [
      { name: "Riven Marches concept and Murat's decisions", owner: "Producer", status: "done", pr: 394 },
      { name: "Roadmap page on the wiki", owner: "Producer", status: "done" },
      { name: "Saves in a database (code already supports it)", owner: "Server & Live Ops", status: "done", note: "server/store.ts with DATABASE_URL" },
      { name: "Turn on Postgres on Railway", owner: "Game Director", status: "blocked", note: "Murat adds the database on Railway, or says go" },
      { name: "War data model: territories from every zone, sanctuaries, Crowns (shared/war/)", owner: "Gameplay Engineers", status: "next" },
      { name: "War sim tools/balance/war.ts with scripted leaders", owner: "Balance & Economy", status: "next" },
    ],
  },
  {
    id: "M1", name: "First Front (vertical slice)", target: "30 Nov – 20 Dec 2026",
    goal: "One real front in Act 1: Wardens against Redfang over four territories, led by scripted doctrine.",
    exit: "Players can hold standards, see Control move every 10 minutes and join a siege window; it feels good to play.",
    items: [
      { name: "War tick, Control, pressure formula, siege windows", owner: "Gameplay Engineers", status: "later" },
      { name: "Standards (capture rings) and Holds in two clan styles", owner: "Art + Gameplay", status: "later" },
      { name: "Front plaque HUD and siege countdown", owner: "Client & UI", status: "later" },
      { name: "Banners and standards in the world (pixel art)", owner: "Art Director", status: "later" },
      { name: "War horn and siege sounds", owner: "Audio", status: "later" },
      { name: "Hale and the Redfang Chief speak as clan leaders", owner: "Narrative", status: "later" },
      { name: "Play-test and tuning", owner: "QA + Balance", status: "later" },
    ],
  },
  {
    id: "M2", name: "Five Banners (alpha)", target: "Jan – Feb 2027",
    goal: "All five clans fight over every zone of Act 1 and Act 2.",
    exit: "Without players no clan holds over 30% of the map for more than three days in the sim and live.",
    items: [
      { name: "Ossuary Host siege works, Hide-Kin tunnels, Veiled rituals", owner: "Gameplay Engineers", status: "later" },
      { name: "Swear to a clan, tabards, Renown ranks", owner: "Gameplay + Art", status: "later" },
      { name: "War writs on bounty boards, caravans on supply roads", owner: "Gameplay + Narrative", status: "later" },
      { name: "War table map (world map overlay)", owner: "Client & UI", status: "later" },
      { name: "Night Raiders hunt the leading clan; Rally for the weakest", owner: "Gameplay Engineers", status: "later" },
      { name: "Clan troops and holds for all five clans", owner: "Art Director", status: "later" },
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
