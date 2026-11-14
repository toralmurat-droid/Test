import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, OBJECTS, areaAt, isSolidTile } from "../../shared/map";
import { createTilesetCanvas, tileRow } from "./tileset";

// Standalone viewer for the world map: no server needed. Open /map.html.
const tileset = createTilesetCanvas();
const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
// The world is drawn at S px per tile: at its full 32 px it would be ~9000x19000 px, past what browsers allow for one
// canvas (Safari stops at ~16.7 million pixels, so the page stayed blank). Zoom scales the canvas up, pixelated.
const S = 8;
canvas.width = MAP_W * S;
canvas.height = MAP_H * S;
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

function render() {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    for (const grid of [GROUND, OBJECTS]) {
      const t = grid[y][x];
      if (t !== EMPTY) ctx.drawImage(tileset, t * TILE, tileRow(grid, x, y) * TILE, TILE, TILE, x * S, y * S, S, S);
    }
  }
  if ($("solid").checked) {
    ctx.fillStyle = "rgba(255,0,0,0.35)";
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (isSolidTile(x, y)) ctx.fillRect(x * S, y * S, S, S);
  }
  if ($("grid").checked) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let x = 0; x < MAP_W; x++) ctx.fillRect(x * S, 0, 1, canvas.height);
    for (let y = 0; y < MAP_H; y++) ctx.fillRect(0, y * S, canvas.width, 1);
  }
  if ($("areas").checked) {
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    for (const a of AREAS) {
      ctx.strokeStyle = "rgba(255,209,102,0.7)";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(a.x * S + 0.5, a.y * S + 0.5, a.w * S - 1, a.h * S - 1);
      ctx.setLineDash([]);
      const cx = (a.x + a.w / 2) * S, cy = a.y * S + 12;
      ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(a.name, cx, cy);
      ctx.fillStyle = "#ffd166"; ctx.fillText(a.name, cx, cy);
      ctx.lineWidth = 1;
    }
  }
}

function applyZoom() {
  const z = Number(($("zoom") as unknown as HTMLSelectElement).value);
  canvas.style.width = `${canvas.width * z}px`;
  canvas.style.height = `${canvas.height * z}px`;
}

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * canvas.width, py = ((e.clientY - r.top) / r.height) * canvas.height;
  const tx = Math.floor(px / S), ty = Math.floor(py / S);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
  $("info").textContent = `tile ${tx},${ty} · ${areaAt((tx + 0.5) * TILE, (ty + 0.5) * TILE)}${isSolidTile(tx, ty) ? " · solid" : ""}`;
});
for (const id of ["areas", "solid", "grid"]) $(id).addEventListener("change", render);
$("zoom").addEventListener("change", applyZoom);
render();
applyZoom();
