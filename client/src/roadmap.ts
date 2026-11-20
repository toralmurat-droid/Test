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
      { name: "Standards with capture rings, oath to a clan", owner: "Art + Gameplay", status: "done", note: "Two per zone; where heroes swear their oath. Valor now comes from fighting: troopers, enemy heroes, sacked Holds" },
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
      { name: "Ossuary Host siege works, Hide-Kin tunnels, Veiled rituals", owner: "Gameplay Engineers", status: "done" },
      { name: "Swear to a clan, tabards, Renown ranks", owner: "Gameplay + Art", status: "done", note: "Oaths, Renown ranks and clan pennants on name tags live" },
      { name: "War writs on bounty boards, caravans on supply roads", owner: "Gameplay + Narrative", status: "done" },
      { name: "War table map (world map overlay)", owner: "Client & UI", status: "done" },
      { name: "Night Raiders hunt the leading clan; Rally for the weakest", owner: "Gameplay Engineers", status: "done", note: "Raiders strike the leader's borders by night; the weakest clan's heroes rally" },
      { name: "Clan troops and holds for all five clans", owner: "Art Director", status: "done", note: "Troops fight on the server; painted soldiers, carts and Holds live" },
      { name: "Forts kept clear of wild monsters", owner: "Gameplay Engineers", status: "done", note: "Wild monsters walk round clan forts; the clan's troops guard them", pr: 531 },
      { name: "Archers, pikes and riders for every clan", owner: "Gameplay + Art", status: "done", note: "Wall archers, bracing pikes and charging riders in Holds, patrols, columns, caravans, sieges and battles (#532, #534)", pr: 535 },
      { name: "Troop roles in tunnels, rituals and town gates", owner: "Gameplay Engineers", status: "doing", pr: 537 },
      { name: "Holds fall: barracks, works to wreck, claim the ruin", owner: "Gameplay + Art", status: "doing", note: "Soldiers come out of a barracks; wreck every work and the Hold falls until a clan claims it" },
    ],
  },
  {
    id: "NL", name: "New Lands of the Marches", target: "Dec 2026 – 2027, alongside the milestones",
    goal: "The Riven Marches as one continent (Murat 2026-11-14): Act 1 is the Wardens' homeland, Act 2 the Veiled Circle's; three new lands and the Crown complete it.",
    exit: "Every clan fights from its own homeland; the war table shows the whole continent; each new land has zones, a village, quests and its own levels.",
    items: [
      { name: "Continent design: regions, borders between regions, level bands, design page v0.3", owner: "Lead Designer", status: "done" },
      { name: "Regions in the war map: territories grouped by land, links between lands, capitals move home", owner: "Gameplay Engineers", status: "done", note: "Oakvale Lands 21, Sunscar 10; forward capitals step down when a homeland is built" },
      { name: "The Red Badlands (Redfang homeland, west)", owner: "World + Art + Narrative", status: "done", note: "Open: the land, the Red Pass, Rustwater Post (shops, portal), eight Redfang-country monsters and a quest chain to Old Rourke. At war: 10 Redfang territories, the Redfang seat at Fangrock, the Red Pass to Oakvale", pr: 446 },
      { name: "The Grey Barrow Moors (Ossuary Host homeland, north-east)", owner: "World + Art + Narrative", status: "done", note: "Open: the Moorgate, Cairnwatch (outpost, portal stone, bounty board), seven new monsters, the Barrow-King and a quest chain. At war: 11 territories, the Host's seat at the Muster, the Wardens' Grey Ring, the Barrowgate to Oakvale", pr: 442 },
      { name: "The Mawdeep Sinkholes (Hide-Kin homeland, south)", owner: "World + Art + Narrative", status: "done", note: "Open: the Sinkway at level 30 (a cave on the beach south of Sunken Lake), Ropewell (shops, portal), eight Hide-Kin monsters and a quest chain to the Maw-Father. At war: 10 Hide-Kin territories, the Hide-Kin seat at Hidehall, the Sinkway to Oakvale", pr: 449 },
      { name: "Walk between the lands: border roads between neighbours", owner: "World + Client", status: "done", note: "Ten roads join all six lands on foot (Murat 2026-11-19); each ends in a mountain pass where the mist takes you on into the next land, open at that land's level. The gates stay as quick ways" },
      { name: "Settlement network: capitals, towns and villages on roads, forts guarding them, more portal stones by land", owner: "World + Client", status: "doing", note: "Murat 2026-11-19: each land gets its own look and a capital-town-village road chain; capitals move into their homelands. Step 1: portal stones grouped by land. Step 2: forts beside the roads. Step 2b: a 3-wide cobbled highway in each land from the capital's gate to every town, village and pass. Step 3: each land's own props and landmark (Oakvale's windmill and farm kit first, the other lands next)" },
      { name: "The Crown of the Marches (neutral prize in the middle)", owner: "World + Gameplay", status: "done", note: "Built: the land (Lv 40-50), the five Crownways from every homeland, Tollcross, the Crown Keep, the Riven Court's monsters, The Riven Throne quest chain, the Riven King in the Throne Hall and the war for the Crown (ten territories; the Keep held by the clan with the least land). The Reckoning (#482): once a month the clans settle who holds the Keep" },
    ],
  },
  {
    id: "M3", name: "War Councils", target: "Mar 2027",
    goal: "An AI leads each clan, first in shadow mode, then for real.",
    exit: "Councils lead for two weeks with no rule broken; Murat gets the daily digest by email.",
    items: [
      { name: "Orders API and validator", owner: "AI Engineer", status: "done", note: "Once a war day each clan's council names up to 3 targets, a stance and a proclamation; anything illegal is rejected and the doctrine leads. Councils can be scheduled Claude routines (remote orders behind a token)" },
      { name: "Councils in shadow mode, compared with scripted doctrine", owner: "AI Engineer", status: "doing", note: "Shadow and lead modes, kill switch and fallback built and off by default; the scripted council runs in the war sim. Next: a Claude routine in shadow on the live server" },
      { name: "Herald proclamations and the war chronicle page on the wiki", owner: "Narrative + Client", status: "doing", note: "A leading council's proclamation is read out by the Herald; the chronicle page is still to come" },
      { name: "Email flags and daily digest; kill switch and undo", owner: "Server & Live Ops", status: "later", note: "Daily digest and kill switch built (admin route); email needs Murat's approval first" },
    ],
  },
  {
    id: "M4", name: "The Forge", target: "Apr 2027",
    goal: "Clans invent new weapons and monsters from the Codex, live without a restart.",
    exit: "A forged item goes from council order to live in under a war day, passing sims, with art.",
    items: [
      { name: "Codex recipes, power budgets and the sim gate", owner: "Lead Designer + Balance", status: "done", pr: 493 },
      { name: "Art from recipe parameters (palette recolours in the client)", owner: "Art Director", status: "done", pr: 495 },
      { name: "Content packs hot-loaded by the running server", owner: "Server & Live Ops", status: "done", pr: 494 },
      { name: "Councils order forgings (one a war day, Herald news)", owner: "AI Engineer", status: "done", pr: 497 },
    ],
  },
  {
    id: "M5", name: "Ages", target: "May – Jun 2027",
    goal: "Two versions of the game side by side; players cross to the new one when they choose.",
    exit: "A real update ships as an Age with no player kicked mid-fight, and rolls back cleanly in a drill.",
    items: [
      { name: "War state as its own service with a versioned API", owner: "Server & Live Ops", status: "done", note: "War, world and Forge leases on one Postgres: one Age owns them, the others follow and queue their changes; versioned war, Forge and save APIs", pr: 510 },
      { name: "One hero on one server at a time (account leases, save versions)", owner: "Server & Live Ops", status: "done", pr: 508 },
      { name: "Gateway, Vanguard canary, crossing offer, safe-moment move", owner: "Server + Client", status: "done", note: "Gateway with an Age split and cookie (#507), status page (#509), crossing from the Esc menu or /age, out of combat, hero and spot kept", pr: 520 },
      { name: "Drill: two Ages and the gateway on one Postgres, crossing and role handover", owner: "Server & Live Ops", status: "done", note: "Passes 9 of 9", pr: 522 },
      { name: "Switch production to the gateway and two game servers on Railway", owner: "Game Director", status: "next", note: "Murat's call: three always-on services instead of one (docs/ages-setup.md)" },
      { name: "Automatic rollback on error spikes", owner: "Server & Live Ops", status: "later" },
    ],
  },
  {
    id: "M6", name: "Living Code", target: "Summer 2027",
    goal: "Clan AIs write small code changes for their own clan, shipped as Ages.",
    exit: "Ten AI changes shipped with no incident; every one logged and emailed.",
    items: [
      { name: "Clan plug-in folders behind a fixed interface", owner: "Gameplay Engineers", status: "done", note: "shared/clans/<clan>/: sandboxed council code, off until Murat pins its hash; kill switch on the admin route", pr: 525 },
      { name: "AI PR bot with sandbox rules and a sim gate", owner: "AI Engineer + Tech Lead", status: "done", note: "Five weekly clan routines (Monday to Friday, one clan a night) each open at most one PR to their own folder; the verify tool and the reviewer gate it", pr: 528 },
      { name: "First clan code pinned in the live game", owner: "Game Director", status: "next", note: "Murat's call: pin a clan's sha256 in CLAN_PLUGINS" },
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
