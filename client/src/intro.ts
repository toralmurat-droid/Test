// One-time game intro: shown on a hero's first login, never again once closed (the server saves that).
const SECTIONS: [string, string][] = [
  ["Move & fight", "Left-click the ground to walk there; hold the button to keep walking. Left-click a monster to walk up and attack it (hold to keep hitting, chain hits for a combo). Keys 1 to 0 pick your active skill (gold frame on the hotbar) and right-click casts it: on yourself, on the clicked spot or toward it, depending on the skill. Shift or F dodge-rolls, Q drinks a potion. Keys still work too: WASD to walk, Space to attack."],
  ["Grow your hero", "Monsters give XP and gold. Each level gives stat points (C) and skill points (T). Learn skills in the tree, then put them on the hotbar. Press a slot's key to make it your right-click skill."],
  ["Gear & loot", "Click a drop or walk over it to pick it up. G opens your equipment: click to wear. Click a loot chest to open it, and buy or sell at the village shops."],
  ["Quests", "Click villagers to talk to them (or press E next to them). Quest givers send you out into the wilds; J opens your quest log. Zones get harder the further you go from Oakvale."],
  ["Saving", "Your hero is saved on the server automatically. Log in with the same name and password on any device to carry on."],
];

export class IntroPanel {
  private el: HTMLElement;
  constructor(private onClose: () => void) {
    this.el = document.createElement("div");
    this.el.id = "intro";
    this.el.innerHTML =
      `<h2>Welcome to Oakvale</h2>` +
      SECTIONS.map(([h, t]) => `<h3>${h}</h3><p>${t}</p>`).join("") +
      `<p class="introhint">M map · I ideas board · P group · Enter chat</p><button id="introok">Got it, let's go!</button>`;
    this.el.hidden = true;
    document.getElementById("hud")!.appendChild(this.el);
    const ok = this.el.querySelector("button")!;
    ok.addEventListener("mousedown", (ev) => ev.preventDefault()); // never takes focus (Space must not click it)
    ok.addEventListener("click", () => this.close());
  }
  get open() { return !this.el.hidden; }
  show() { this.el.hidden = false; }
  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.onClose();
  }
}
