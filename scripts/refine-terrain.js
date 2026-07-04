/* Shared terrain-palette refinement for the Bible Journeys basemap style.
   -----------------------------------------------------------------------
   The upstream @protomaps/basemaps `landcover` layer paints deserts, scrub and
   grassland in near-identical pale greens that fade out by zoom 7, so the map
   reads flat and can't tell wilderness from farmland. This retints landcover
   into an earthy, theme-aware palette (sandy deserts, muted greens, olive on
   the parchment map) and lets the regional wash carry a little further into the
   journey zoom range, so the physical landscape reads at a glance.

   Used by build-pm-style.js (so regenerating keeps it) and applied to the
   committed assets/maplibre/pm-style-layers.json. `landcover` carries a single
   `kind` field: barren / scrub / grassland / farmland / forest / urban_area /
   glacier. */

var TERRAIN_PALETTE = {
  modern: {
    barren: '#ecdcb6',      // desert / bare ground — sand
    scrub: '#e2ddbf',       // dry brush
    grassland: '#d3e3bd',   // open pasture — soft green
    farmland: '#d8e6c2',    // cultivated land
    forest: '#c4d9b0',      // woodland
    urban_area: '#e4e1da',  // built-up — warm grey
    glacier: '#ffffff',
    other: '#d7e4cd'
  },
  ancient: {
    barren: '#e3d0a2',      // parchment sand
    scrub: '#dccb9c',
    grassland: '#d6cf9f',   // olive-tan
    farmland: '#dcd3a2',
    forest: '#cbc596',
    urban_area: '#ddd0ab',
    glacier: '#efe8d6',
    other: '#dcd2a9'
  }
};

function _landcoverColor(theme) {
  var p = TERRAIN_PALETTE[theme] || TERRAIN_PALETTE.modern;
  return [
    'match', ['get', 'kind'],
    'barren', p.barren,
    'scrub', p.scrub,
    'grassland', p.grassland,
    'farmland', p.farmland,
    'forest', p.forest,
    'urban_area', p.urban_area,
    'glacier', p.glacier,
    p.other
  ];
}

// Retint the landcover fill in-place. Everything else about the layer (its
// position, source, filter) is left untouched.
function refineTerrain(layers, theme) {
  var opacity = theme === 'ancient'
    ? ['interpolate', ['linear'], ['zoom'], 4, 0.72, 6, 0.67, 8, 0]
    : ['interpolate', ['linear'], ['zoom'], 4, 0.85, 6, 0.8, 8, 0];
  return layers.map(function (l) {
    if (l && l.id === 'landcover' && l.type === 'fill') {
      l.paint = l.paint || {};
      l.paint['fill-color'] = _landcoverColor(theme);
      // Hold the regional wash a touch longer (fade to nothing by z8, not z7)
      // so the terrain still reads as you zoom toward a journey.
      l.paint['fill-opacity'] = JSON.parse(JSON.stringify(opacity));
    }
    return l;
  });
}

module.exports = { refineTerrain: refineTerrain };
