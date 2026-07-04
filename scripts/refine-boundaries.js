/* Shared boundary refinement for the Bible Journeys basemap style.
   ----------------------------------------------------------------
   The upstream @protomaps/basemaps style draws every sub-national border
   (provinces AND counties) as one faint grey line, so the reader can't judge
   region size or tell a province border from a county border. This splits the
   single `boundaries` line layer into three tiers — country / region / county —
   and gives provinces and counties their own distinct colors and weights.

   Used by build-pm-style.js (so regenerating the style keeps the refinement)
   and applied to the committed assets/maplibre/pm-style-layers.json. The
   `boundaries` source-layer carries `kind_detail` (OSM-style admin level):
     <= 2  country
      3-4  region / province / state / district
     >= 5  county / sub-region
*/

// Distinct hues, reused across both themes so the map legend reads the same on
// the modern and ancient views; only the country line is toned per theme.
var REGION_COLOR = '#c56a3a';   // provinces / states / districts — terracotta
var COUNTY_COLOR = '#3f8f8a';   // counties — teal

function _boundaryLayers(theme) {
  var countryColor = theme === 'ancient' ? '#9a8558' : '#77777f';
  return [
    {
      id: 'boundaries_country',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: ['<=', 'kind_detail', 2],
      paint: {
        'line-color': countryColor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 1.1, 9, 1.7],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.85]
      }
    },
    {
      id: 'boundaries_region',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: ['all', ['>', 'kind_detail', 2], ['<', 'kind_detail', 5]],
      paint: {
        'line-color': REGION_COLOR,
        'line-dasharray': [3, 1.5],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 6, 0.9, 9, 1.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 5, 0.55, 8, 0.85]
      }
    },
    {
      id: 'boundaries_county',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: ['>=', 'kind_detail', 5],
      paint: {
        'line-color': COUNTY_COLOR,
        'line-dasharray': [1, 1.6],
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 9, 0.95],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7, 0.4, 9, 0.7]
      }
    }
  ];
}

// Replace the upstream boundary line layer(s) in-place with the three tiers,
// preserving their position in the draw order.
function refineBoundaries(layers, theme) {
  var out = [];
  var inserted = false;
  layers.forEach(function (l) {
    if (l && l['source-layer'] === 'boundaries') {
      if (!inserted) { out = out.concat(_boundaryLayers(theme)); inserted = true; }
      return; // drop the original single-tier boundary layer
    }
    out.push(l);
  });
  if (!inserted) out = out.concat(_boundaryLayers(theme));
  return out;
}

module.exports = { refineBoundaries: refineBoundaries, REGION_COLOR: REGION_COLOR, COUNTY_COLOR: COUNTY_COLOR };
