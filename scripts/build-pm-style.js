/* Regenerate assets/maplibre/pm-style-layers.json
   ------------------------------------------------
   Produces the MapLibre layer arrays for the Bible Journeys real map, for both
   the "modern" (light) and "ancient" (parchment) themes.

   We keep only non-symbol layers (background/fill/line) so the basemap needs no
   glyph fonts — the app overlays its own curated ancient/modern place-name
   markers instead. That keeps the whole thing self-hosted and offline-friendly.

   Usage:
     cd scripts && npm install @protomaps/basemaps
     node build-pm-style.js
*/
const fs = require('fs');
const path = require('path');
const b = require('@protomaps/basemaps');
const { refineBoundaries } = require('./refine-boundaries');

const SOURCE = 'protomaps';
const lightFlavor = b.namedFlavor('light');

// Parchment palette for the "ancient" view — warm paper tones, muted water.
const parchmentFlavor = Object.assign({}, b.namedFlavor('light'), {
  background: '#efe4cf', earth: '#e8d9b8',
  park_a: '#dfd3ad', park_b: '#d8caa0',
  wood_a: '#dccfa6', wood_b: '#d6c89c',
  scrub_a: '#ded2a8', scrub_b: '#d8cb9f',
  water: '#aeccd6', glacier: '#e8e0cf', sand: '#e6d8b4',
  buildings: '#ddcfa6', hospital: '#e3d6b0', industrial: '#e0d2a8', school: '#e3d6b0',
  agriculture: '#e2d4ab', wood: '#dccfa6', scrub: '#ded2a8',
  grassland: '#e0d3a9', farmland: '#e2d4ab'
});

const nonSymbol = (layers) => layers.filter((l) => l.type !== 'symbol');
const opts = { lang: 'en' };

const out = {
  schema: 'protomaps v5 (' + require('@protomaps/basemaps/package.json').version + ')',
  source: SOURCE,
  modern: refineBoundaries(nonSymbol(b.layers(SOURCE, lightFlavor, opts)), 'modern'),
  ancient: refineBoundaries(nonSymbol(b.layers(SOURCE, parchmentFlavor, opts)), 'ancient')
};

const dest = path.join(__dirname, '..', 'assets', 'maplibre', 'pm-style-layers.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('Wrote ' + dest);
console.log('modern layers:', out.modern.length, '| ancient layers:', out.ancient.length);
