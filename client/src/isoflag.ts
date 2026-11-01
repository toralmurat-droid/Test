/** Isometric view, on by default. `?iso=0` switches to the old top-down view, `?iso=1` back; remembered in localStorage (see iso.ts). */
export const ISO = (() => {
  const q = new URLSearchParams(location.search).get("iso");
  if (q !== null) {
    try { localStorage.setItem("iso", q === "0" ? "0" : "1"); } catch { /* private mode */ }
    return q !== "0";
  }
  try { return localStorage.getItem("iso") !== "0"; } catch { return true; }
})();
