import Phaser from "phaser";

/**
 * Sends only some rectangles of a canvas texture to the graphics card. `tex.refresh()` re-uploads the whole canvas,
 * and the tilesets are huge (the iso one is ~50 MB): doing that several times a second for a few animated tiles
 * made weaker GPUs stutter. Falls back to a full refresh when partial uploads are not possible (canvas renderer,
 * lost context, flipped texture).
 */
let scratch: HTMLCanvasElement | undefined;

export function refreshRegions(scene: Phaser.Scene, tex: Phaser.Textures.CanvasTexture, rects: [number, number, number, number][]) {
  const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = (renderer as any).gl as WebGLRenderingContext | undefined;
  const wrap = (tex.getSourceImage() && (tex as any).source?.[0]?.glTexture) as any;
  if (!gl || !wrap?.webGLTexture || wrap.flipY || gl.isContextLost()) { tex.refresh(); return; }
  const src = tex.getSourceImage() as HTMLCanvasElement;
  // Same unit and unpack settings as Phaser's own upload (WebGLTextureWrapper._processTexture), then put back the binding
  gl.activeTexture(gl.TEXTURE0);
  const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D, wrap.webGLTexture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, wrap.pma);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  for (const [x, y, w, h] of rects) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(tex.width, x + w), y1 = Math.min(tex.height, y + h);
    if (x1 <= x0 || y1 <= y0) continue;
    // Copy the piece onto a small canvas and upload that (getImageData would read the whole big canvas back from the GPU)
    const c = (scratch ??= document.createElement("canvas"));
    if (c.width !== x1 - x0 || c.height !== y1 - y0) { c.width = x1 - x0; c.height = y1 - y0; }
    const sc = c.getContext("2d")!;
    sc.globalCompositeOperation = "copy";
    sc.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }
  gl.bindTexture(gl.TEXTURE_2D, prev);
}
