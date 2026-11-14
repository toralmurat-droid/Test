/**
 * The pages of the game wiki (/wiki, client/wiki.html). A new wiki or design page only needs an entry here.
 * `img` is a picture or clip shown on its card (served from client/public).
 */
export interface WikiPage { title: string; href: string; blurb: string; img?: string }
export interface WikiShelf { name: string; help: string; pages: WikiPage[] }

export const WIKI: WikiShelf[] = [
  {
    name: "The Game",
    help: "How things work in the game today.",
    pages: [
      { title: "Skills of the Heroes", href: "/skills", img: "/skills/v_exsang.webp", blurb: "Every skill of every hero, filmed in the game. Refilmed on its own when a skill changes." },
      { title: "Map Viewer", href: "/map.html", blurb: "The whole world map, with areas, collision and grid overlays." },
    ],
  },
  {
    name: "Development",
    help: "How the game is being built and what comes next.",
    pages: [
      { title: "Roadmap", href: "/roadmap", img: "/design/riven-marches/img/faction-banners.png", blurb: "The studio plan: team, milestones, what is in progress and what shipped last." },
    ],
  },
  {
    name: "Design",
    help: "Ideas and plans being shaped, before they are built.",
    pages: [
      { title: "The Riven Marches", href: "/design/riven-marches/", img: "/design/riven-marches/img/riven-marches-map.png", blurb: "Clan war: five AI-led clans fight over the whole world, without end." },
    ],
  },
];
