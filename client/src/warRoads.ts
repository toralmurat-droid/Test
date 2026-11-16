/**
 * The trampled-track ground decal along the war roads (W4). Only the stretch near the hero is painted: one flat
 * RenderTexture window of the ground (so the iso view skews it onto the ground like other flat paintings) that is
 * stamped from a precomputed list of road samples and moved when the hero strays from its middle. Cosmetic only.
 */
import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { ensureTrackTextures, TRACK_VARIANTS } from "./columnArt";
import type { WarColumns } from "./warColumns";

/** Window edge (px) and how far the hero may drift from its middle before it is re-centred. */
const WIN = 2048, DRIFT = 192;

export class WarRoadFx {
  private rt?: Phaser.GameObjects.RenderTexture;
  /** x, y, angle (deg), variant per sample, flat. */
  private samples = new Float32Array(0);
  private version = -1;
  private cx = NaN; private cy = NaN;

  constructor(private scene: Phaser.Scene, private model: WarColumns) { ensureTrackTextures(scene); }

  /** Samples every TILE px along the walked legs of roads and waygate links (tracks have no walkers: no decal). */
  private build() {
    const out: number[] = [];
    for (const e of this.model.roads) {
      if (e[3] === -1) continue;
      const f = e[2], split = e[3] !== undefined && e[3] >= 1 ? e[3] * 2 : f.length;
      for (const [s, t] of [[0, split], [split, f.length]]) {
        for (let i = s; i + 3 < t; i += 2) {
          const x0 = (f[i] + 0.5) * TILE, y0 = (f[i + 1] + 0.5) * TILE, x1 = (f[i + 2] + 0.5) * TILE, y1 = (f[i + 3] + 0.5) * TILE;
          const len = Math.hypot(x1 - x0, y1 - y0), ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, n = Math.max(1, Math.round(len / TILE));
          for (let k = 0; k < n; k++) {
            const u = (k + 0.5) / n, h = (((f[i] * 73856093) ^ (f[i + 1] * 19349663)) + k * 31) >>> 0;
            out.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, ang, h % TRACK_VARIANTS);
          }
        }
      }
    }
    this.samples = Float32Array.from(out);
  }

  /** Call every frame with the hero's world position (px); repaints only when the window has to move. */
  update(x: number, y: number) {
    if (this.version !== this.model.roadsVersion) { this.version = this.model.roadsVersion; this.build(); this.cx = NaN; }
    if (!this.samples.length) { this.rt?.setVisible(false); return; }
    if (Math.abs(x - this.cx) < DRIFT && Math.abs(y - this.cy) < DRIFT) return;
    this.cx = x; this.cy = y;
    const x0 = Math.round(x - WIN / 2), y0 = Math.round(y - WIN / 2), s = this.samples, near: number[] = [];
    for (let i = 0; i < s.length; i += 4) if (s[i] > x0 && s[i] < x0 + WIN && s[i + 1] > y0 && s[i + 1] < y0 + WIN) near.push(i);
    if (!near.length) { this.rt?.setVisible(false); return; }
    if (!this.rt) this.rt = this.scene.add.renderTexture(0, 0, WIN, WIN).setOrigin(0, 0).setDepth(0);
    const rt = this.rt.setVisible(true).setPosition(x0, y0);
    rt.clear();
    for (const i of near) rt.stamp("war_track", s[i + 3], s[i] - x0, s[i + 1] - y0, { angle: s[i + 2], originX: 0.5, originY: 0.5, alpha: 0.9 });
  }
}
