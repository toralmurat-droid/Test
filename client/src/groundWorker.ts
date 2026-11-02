/// <reference lib="webworker" />
import { Fields, GroundData, makeFields, paintChunk } from "./groundPaint";

let data: GroundData | undefined;
let fields: Fields | undefined;

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === "init") { data = m.data; fields = makeFields(m.data); return; }
  if (m.type === "paint" && data && fields) {
    const W = Math.round(m.cw * m.res), H = Math.round(m.ch * m.res);
    const px = new Uint8ClampedArray(W * H * 4);
    paintChunk(data, fields, m.sx0, m.sy0, m.cw, m.ch, m.res, px);
    (self as any).postMessage({ type: "done", key: m.key, W, H, px }, [px.buffer]);
  }
};
