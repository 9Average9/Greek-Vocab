# Vendored map libraries (Bible Journeys real map)

These are lazy-loaded only when the Journeys page opens, and only when
`BIBLE_WORLD_PMTILES_URL` is configured. Self-hosted so the app stays
offline-friendly and never hotlinks third-party CDNs.

| File | Source | Version | License |
|------|--------|---------|---------|
| `maplibre-gl.js`, `maplibre-gl.css` | maplibre-gl | 4.7.1 | BSD-3-Clause |
| `pmtiles.js` | pmtiles | 3.2.1 | BSD-3-Clause |
| `pm-style-layers.json` | generated via @protomaps/basemaps | 5.7.2 | BSD-3-Clause |

Regenerate the style layers with `node scripts/build-pm-style.js`.
Generate/host the tile data per `scripts/build-bibleworld-pmtiles.md`.

3D terrain is a separate raster DEM source layered with MapLibre terrain; it is
not embedded in the Protomaps PMTiles basemap. See
`docs/bible-journeys-terrain.md` for the configurable elevation source and
self-hosting notes.
