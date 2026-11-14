import { toggleSongbook } from "./songbookReader";

/**
 * The Songweaver's chord legend (DI-1 removed the chord tracker panel; the rings under her feet show progress).
 * DI-C2: the legend lives in the Songbook reader (songbookReader.ts); the "?" on the skills page opens that.
 */
export function toggleChordLegend() { toggleSongbook(); }
