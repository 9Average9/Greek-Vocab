# Bible Journeys Vision

This feature helps users follow the movement of biblical stories, not just inspect a map. The experience should feel like a Bible-first reading aid: the route, distance, travel time, modern comparison, and Scripture steps should all serve the passage being read.

## Current Implementation

- The feature lives in `index.html`, `style.css`, and `app.js`.
- Route data is held in the `BIBLE_JOURNEYS` array in `app.js`. There are currently 16 curated journeys spanning Genesis through Acts.
- Each journey now carries a `sources` array of short notes explaining the geography/archaeology decisions behind the route; these render in a "Sources & notes" section.
- The map is an offline-safe schematic SVG renderer. That keeps the app fast, deployable on GitHub Pages, and free from tile-provider terms while the data model is being refined.
- A "Play route" control walks a marker along the polyline at a steady pace, lighting up each stop and its matching Scripture step (with a `prefers-reduced-motion` fallback). The route line also has a subtle continuous flow animation.
- Rhema verse sheets show a "Follow this journey" action only when the selected reference belongs to one of the curated journey ranges.

## Data Rules

- Keep journeys curated. Do not infer routes automatically from verse text.
- Every route should include Scripture references, route points, story steps, approximate distance, travel-time context, and an accuracy note.
- Use honest certainty labels such as "Approximate route", "Representative route", or "Highly debated".
- Ancient/Bible labels and modern comparison labels should stay separate.
- Distances and timing are teaching estimates, not claims of exact GPS precision.

## Future Map Direction

The move to a true interactive map is underway and uses **MapLibre GL JS with a
self-hosted Protomaps `.pmtiles` basemap** — free forever, no API key, and no
hotlinking of public OpenStreetMap tiles.

Current state of that work:

- Every journey point now carries real `lat`/`lon` (alongside the schematic
  `x`/`y` used by the offline fallback).
- `bible-map.js` is the MapLibre renderer. It draws each curated route, stops, and
  an animated traveler over the basemap, and swaps a parchment "ancient" theme for
  a "modern" theme. The basemap is geometry-only (no glyph fonts needed); our own
  curated markers carry the ancient/modern place names.
- `maplibre-gl` and `pmtiles` are vendored under `assets/maplibre/` and lazy-loaded
  only when the Journeys page opens, so the rest of the app is unaffected.
- The renderer is behind the `BIBLE_WORLD_PMTILES_URL` flag in `app.js`. While it
  is empty, the schematic SVG map stays in charge. Set it to a hosted
  `bibleworld.pmtiles` to turn the real map on (online only; schematic is still the
  offline fallback).
- See `scripts/build-bibleworld-pmtiles.md` for how to generate and host that file
  (a single `pmtiles extract` over the Bible-world bounding box, hosted as a free
  GitHub Release asset).

Next: host the tile file, verify rendering on real devices, then iterate on the
ancient-vs-modern styling and add richer layers (ancient roads, regions, terrain)
as reliable sources become available.

## Expansion Ideas

Done so far:

- Added Jacob, Joseph's family to Egypt, the conquest entry (Jericho/Ai/Gibeon), David's flight from Saul, Elijah to Horeb, Jesus' Galilean ministry loop, and Paul's second and third missionary journeys.
- Added a stepper/traveler animation that moves along each route and lights up the matching Scripture step.
- Added `sources` notes per journey for archaeology/geography decisions.

Still open:

- Add more journeys (Elisha routes, Israel's wider conquest movements, David's later campaigns, additional exile movements).
- Add per-verse journey markers inside Rhema when a passage is part of a route.
- Keep modern travel comparison only as context, not as the main teaching claim.
- When moving to MapLibre, derive point positions from real coordinates rather than the current per-journey schematic placement.

## Terrain Notes

The MapLibre renderer now supports true 3D terrain from a separate raster DEM
source while preserving the existing Protomaps PMTiles basemap and schematic SVG
fallback. See `docs/bible-journeys-terrain.md` for the source configuration,
licensing cautions, replacement path, and testing checklist.
