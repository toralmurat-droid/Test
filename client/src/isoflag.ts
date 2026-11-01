/** Isometric view on? `?iso=1` / `?iso=0` in the address, remembered in localStorage (see iso.ts). */
export const ISO = (() => {
  const q = new URLSearchParams(location.search).get("iso");
  if (q !== null) {
    try { localStorage.setItem("iso", q === "0" ? "0" : "1"); } catch { /* private mode */ }
    return q !== "0";
  }
  try { return localStorage.getItem("iso") === "1"; } catch { return false; }
})();
