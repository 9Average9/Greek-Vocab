# Bible Journeys 3D Terrain

The Bible Journeys real map now keeps the existing MapLibre + PMTiles vector
basemap and adds a separate MapLibre `raster-dem` source for 3D elevation and
hillshade. This is progressive enhancement:

1. MapLibre + Protomaps PMTiles + terrain
2. MapLibre + Protomaps PMTiles without terrain
3. Existing schematic SVG fallback

Terrain failure must not trigger the schematic fallback by itself. Only the
vector PMTiles/style renderer should be considered fatal for the real map.

## Renderer

`bible-map.js` exposes the same public API:

- `BibleMap.render(container, journey, opts)`
- `BibleMap.setMode(mode)`
- `BibleMap.play(onStep)`
- `BibleMap.stop()`
- `BibleMap.destroy()`

`opts.terrain` accepts either a TileJSON URL or a direct tile template:

```js
{
  enabled: true,
  tilejsonUrl: 'https://tiles.mapterhorn.com/tilejson.json',
  tiles: null,
  encoding: 'terrarium',
  tileSize: 512,
  minzoom: 0,
  maxzoom: 14,
  exaggeration: 1.28,
  pitch: 48,
  bearing: -16,
  maxPitch: 65,
  hillshade: true,
  attribution: "Terrain: © Mapterhorn"
}
```

The renderer conditionally adds:

- `journey-terrain-dem`
- `journey-terrain-hillshade-dem`
- `journey-terrain-hillshade`
- `style.terrain`

Mode switching calls `map.setStyle()`, so terrain is included in every rebuilt
style. Route sources, alternate routes, stops, traveler, markers, labels, and
camera pitch/bearing are restored after the style change.

## Current Development Source

The app currently tests with:

- TileJSON: `https://tiles.mapterhorn.com/tilejson.json`
- Encoding: Terrarium
- Tile size advertised by TileJSON: 512
- Attribution advertised by TileJSON: `© Mapterhorn`
- Attribution page: `https://mapterhorn.com/attribution`

The public TileJSON advertises global bounds and Terrarium encoding. Mapterhorn's
attribution page lists the open elevation data sources used to create its tiles.
Do not treat this endpoint as production-cleared until usage terms, commercial
permission, caching permission, and uptime expectations are verified.

## Production Terrain Path

Keep the terrain source replaceable. A production source can be:

- a remote TileJSON raster-dem service, or
- a direct `tiles: [...]` raster-dem template, or
- a self-hosted terrain PMTiles/tile endpoint.

AWS Open Terrain Tiles is a possible source for building a Bible-world Terrarium
DEM extract. A production pipeline should document:

- exact dataset and date
- geographic bounds, likely `9,24,48,43`
- encoding, tile size, min/max zoom
- license and required attribution
- whether redistribution is allowed
- whether app/service-worker tile caching is allowed

Do not commit API keys. If a provider requires a key, read it from the app's
existing configuration path and leave terrain disabled when the key is missing.

## Visual Direction

Ancient mode should feel like a premium illustrated Bible atlas:

- warm parchment/tan land
- muted olive vegetation
- soft blue water
- restrained terrain exaggeration around `1.2-1.4`
- pitch around `45-52` degrees
- subtle brown/cream hillshade
- no modern buildings or modern clutter

Modern mode can be cooler and keep modern reference geography while still using
the same 3D terrain.

## Testing Checklist

Verify:

- PMTiles vector map still renders.
- Terrain is visibly three-dimensional.
- Terrain failure falls back to the flat vector map.
- PMTiles failure falls back to schematic SVG.
- Ancient/Modern switching does not duplicate sources, layers, markers, or
  listeners.
- Route playback still works and honors `prefers-reduced-motion`.
- Single-place Atlas entries work.
- Journey peeks inside Rhema render terrain or fall back gracefully.
- Required attribution remains visible.
- iOS Safari/PWA repeated open-close and resize behavior does not blank the map.
