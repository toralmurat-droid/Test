"""Build the standalone sprite preview page (test field + animation board) from the generated assets.
Usage: python3 tools/art/preview/build.py out.html   (run `npm run art` first)"""
import base64, json, sys, pathlib
root = pathlib.Path(__file__).resolve().parents[3]
A = root / "client/public/assets"
b = lambda p: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
meta = json.loads((A / "characters/characters.json").read_text())
data = {"chars": {c: b(A / f"characters/{c}.png") for c in meta["characters"] + meta["npcs"]}, "meta": meta,
        "props": b(A / "objects/props.png"), "propsJson": json.loads((A / "objects/props.json").read_text()),
        "items": b(A / "objects/items.png"), "itemsJson": json.loads((A / "objects/items.json").read_text())}
tpl = (pathlib.Path(__file__).parent / "template.html").read_text()
pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "sprites.html").write_text(tpl.replace("__DATA__", json.dumps(data)))
