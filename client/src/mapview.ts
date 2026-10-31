import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, OBJECTS, areaAt, isSolidTile } from "../../shared/map";
import { createTilesetCanvas } from "./tileset";

// Standalone viewer for the world map: no server needed. Open /map.html.
const tileset = createTilesetCanvas();
const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
canvas.width = MAP_W * TILE;
canvas.height = MAP_H * TILE;
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

function render() {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    for (const t of [GROUND[y][x], OBJECTS[y][x]]) {
      if (t !== EMPTY) ctx.drawImage(tileset, t * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
    }
  }
  if ($("solid").checked) {
    ctx.fillStyle = "rgba(255,0,0,0.35)";
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (isSolidTile(x, y)) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  if ($("grid").checked) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let x = 0; x < MAP_W; x++) ctx.fillRect(x * TILE, 0, 1, canvas.height);
    for (let y = 0; y < MAP_H; y++) ctx.fillRect(0, y * TILE, canvas.width, 1);
  }
  if ($("areas").checked) {
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    for (const a of AREAS) {
      ctx.strokeStyle = "rgba(255,209,102,0.7)";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(a.x * TILE + 0.5, a.y * TILE + 0.5, a.w * TILE - 1, a.h * TILE - 1);
      ctx.setLineDash([]);
      const cx = (a.x + a.w / 2) * TILE, cy = a.y * TILE + 18;
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
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
  $("info").textContent = `tile ${tx},${ty} · ${areaAt(px, py)}${isSolidTile(tx, ty) ? " · solid" : ""}`;
});
for (const id of ["areas", "solid", "grid"]) $(id).addEventListener("change", render);
$("zoom").addEventListener("change", applyZoom);
render();
applyZoom();
