// The game chunk: Phaser, TownScene and everything they import. main.ts (the start screen) loads this file with a
// dynamic import() as soon as the page opens, so it downloads while the player types; see loadGame() there.
import Phaser from "phaser";
import { initSfx } from "./sfx";
import { TownScene } from "./TownScene";
import "./heropanel.css"; // the hero panel redesign, after every other stylesheet
import type { ClassKind } from "../../shared/classes";
import { SMOOTH } from "./isoflag";
import { installSmoothTextures } from "./smooth";
import { fontsReady } from "./pixelfont";
import { attachWorldScale, initWorldScale, worldCanvasSize } from "./worldscale";
import { perfHud } from "./perfHud";

export interface GameStart { name: string; password: string; color: number; cls: ClassKind; newGame: boolean }

/** Boots Phaser with the TownScene for this login. Called once per page by main.ts's launch(). */
export function startGame(opts: GameStart) {
  initSfx(opts.name);
  if (SMOOTH) installSmoothTextures(Phaser);
  initWorldScale(); // the world canvas is 1/k of the window, scaled up by k (game menu: World size)
  // the pixel fonts must be ready first, or the world's name labels bake in a fallback font
  // window.__game: lets the browser tests (and the console) look at the running game
  void fontsReady.then(() => attachWorldScale((window as any).__game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    pixelArt: !SMOOTH,
    antialias: SMOOTH,
    backgroundColor: "#1b1b24",
    scale: { mode: Phaser.Scale.RESIZE, ...worldCanvasSize() },
    scene: [new TownScene(opts)],
  })));
  void fontsReady.then(() => perfHud()); // `?perf=1` perf readout; does nothing without the flag
}
