import Phaser from "phaser";

/**
 * One shared pixel grid for the whole world (heroes, monsters, ground, buildings, props, effects): the camera image
 * is snapped to square blocks of `size` screen px, so everything, however finely it was painted, shows at the same
 * pixel density, and colours are lightly posterized for a crafted pixel-art feel. The HUD is HTML, so it stays crisp.
 */
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uSize;
uniform float uLevels;
varying vec2 outTexCoord;
void main() {
  vec2 px = outTexCoord * uResolution;
  vec2 c = (floor(px / uSize) + 0.5) * uSize;
  vec4 col = texture2D(uMainSampler, c / uResolution);
  col.rgb = floor(col.rgb * uLevels + 0.5) / uLevels;
  gl_FragColor = col;
}`;

export class PixelGridFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  size = 3;
  levels = 28;
  constructor(game: Phaser.Game) {
    super({ game, name: "PixelGridFX", fragShader: FRAG });
  }
  onPreRender() {
    this.set1f("uSize", this.size);
    this.set1f("uLevels", this.levels);
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
  }
}

/**
 * World px per art pixel. 2/3 = 1.5 texels per world px (a tile is 48 texels, a texel is 2x2 screen px at the
 * default zoom 3), the density shared with the character art. `?px=1` gives chunkier pixels.
 */
export const ART_PX = (() => {
  const q = Number(new URLSearchParams(location.search).get("px"));
  return q > 0 && q <= 4 ? q : 2 / 3;
})();

export function addPixelGrid(cam: Phaser.Cameras.Scene2D.Camera) {
  const r = cam.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!r.pipelines) return;
  if (!r.pipelines.postPipelineClasses.has("PixelGridFX")) r.pipelines.addPostPipeline("PixelGridFX", PixelGridFX);
  cam.setPostPipeline("PixelGridFX");
  const fx = cam.getPostPipeline("PixelGridFX") as PixelGridFX;
  const sync = () => { fx.size = Math.max(1, Math.round(cam.zoom * ART_PX)); };
  sync();
  cam.scene.events.on(Phaser.Scenes.Events.PRE_RENDER, sync);
}
