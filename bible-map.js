/* =========================================================================
   BIBLE MAP - 3D terrain renderer for Bible Journeys (MapLibre + Protomaps)

   This renderer draws curated Bible journey routes over the self-hosted
   Protomaps PMTiles basemap. Terrain is a progressive enhancement: if raster
   DEM tiles fail, the map stays alive as a flat vector map; if the vector map
   itself fails, app.js can still fall back to the schematic SVG renderer.

   Public API (window.BibleMap):
     supported()                         -> boolean (libs + WebGL present)
     render(container, journey, opts)    -> Promise (builds the map)
     setMode('ancient' | 'modern')       -> swap basemap theme + label language
     play(onStep)                        -> animate the traveler along the route
     stop()                              -> halt the animation
     destroy()                           -> tear the map down
========================================================================= */
(function () {
  'use strict';

  var STYLE_URL = 'assets/maplibre/pm-style-layers.json?v=4';
  var TERRAIN_SOURCE_ID = 'journey-terrain-dem';
  var HILLSHADE_SOURCE_ID = 'journey-terrain-hillshade-dem';
  var HILLSHADE_LAYER_ID = 'journey-terrain-hillshade';
  var _styleLayers = null;
  var _protocolReady = false;

  var state = {
    map: null,
    journey: null,
    mode: 'ancient',
    markers: [],
    landmarkMarkers: [],
    raf: 0,
    followTick: 0,
    opts: null,
    terrain: { enabled: false },
    terrainErrorNoted: false,
    fatalErrorNoted: false,
    coords: [],
    routeCoords: [],
    routeSegmentMap: [],
    compassRose: null,
    homeCamera: null,
    resetBtn: null,
    bordersNote: null,
    geoMarkers: [],
    userMoved: false
  };

  // Curated physical geography of the Bible world — seas, rivers, lakes,
  // mountains, deserts and regions the tiles can't label for us (we ship no
  // glyph fonts, and the raw OSM labels are modern-only and far too dense).
  // Each carries its biblical name and its modern name so the map teaches
  // location AND the "then vs now" at a glance. Shown as font-free HTML markers,
  // gated by zoom [z0, z1] so only a handful ever share the screen.
  //   a = ancient / biblical name · m = modern name · k = kind
  //   lon, lat = label anchor · z0/z1 = zoom range it appears in
  var GEO_FEATURES = [
    // Seas & gulfs
    { a: 'The Great Sea', m: 'Mediterranean Sea', k: 'sea', lon: 34.2, lat: 33.7, z0: 4, z1: 8.2 },
    { a: 'The Red Sea', m: 'Red Sea', k: 'sea', lon: 37.6, lat: 24.8, z0: 4, z1: 7.6 },
    { a: 'The Salt Sea', m: 'Dead Sea', k: 'lake', lon: 35.5, lat: 31.5, z0: 5.5, z1: 12 },
    { a: 'Sea of Galilee', m: 'Lake Kinneret', k: 'lake', lon: 35.59, lat: 32.82, z0: 6.5, z1: 12 },
    { a: 'Gulf of Aqaba', m: 'Gulf of Aqaba', k: 'sea', lon: 34.75, lat: 28.8, z0: 6.5, z1: 11 },
    { a: 'Gulf of Suez', m: 'Gulf of Suez', k: 'sea', lon: 33.05, lat: 29.0, z0: 6.5, z1: 11 },
    // Rivers
    { a: 'The Jordan', m: 'Jordan River', k: 'river', lon: 35.57, lat: 32.28, z0: 6.5, z1: 12 },
    { a: 'The Nile', m: 'Nile River', k: 'river', lon: 31.0, lat: 29.6, z0: 5, z1: 10 },
    { a: 'The Euphrates', m: 'Euphrates River', k: 'river', lon: 40.3, lat: 34.6, z0: 5, z1: 9.5 },
    { a: 'The Tigris', m: 'Tigris River', k: 'river', lon: 43.6, lat: 34.7, z0: 5.5, z1: 9.5 },
    { a: 'The Jabbok', m: 'Zarqa River', k: 'river', lon: 35.62, lat: 32.06, z0: 8, z1: 12 },
    { a: 'The Arnon', m: 'Wadi Mujib', k: 'river', lon: 35.6, lat: 31.46, z0: 8, z1: 12 },
    { a: 'The Kishon', m: 'Kishon River', k: 'river', lon: 35.06, lat: 32.72, z0: 8.5, z1: 12 },
    // Mountains
    { a: 'Mount Sinai (Horeb)', m: 'Jebel Musa', k: 'mountain', lon: 33.97, lat: 28.54, z0: 6.5, z1: 12 },
    { a: 'Mount Hermon', m: 'Jabal al-Shaykh', k: 'mountain', lon: 35.86, lat: 33.42, z0: 6.5, z1: 12 },
    { a: 'Mount Carmel', m: 'Mount Carmel', k: 'mountain', lon: 35.03, lat: 32.73, z0: 7.5, z1: 12.5 },
    { a: 'Mount Tabor', m: 'Har Tavor', k: 'mountain', lon: 35.39, lat: 32.69, z0: 8, z1: 12.5 },
    { a: 'Mount Nebo', m: 'Jabal Nibu', k: 'mountain', lon: 35.73, lat: 31.77, z0: 8, z1: 12.5 },
    { a: 'Mount Gerizim', m: 'Jabal Jarizim', k: 'mountain', lon: 35.27, lat: 32.2, z0: 8.5, z1: 12.5 },
    { a: 'Mount Gilboa', m: 'Mount Gilboa', k: 'mountain', lon: 35.42, lat: 32.48, z0: 8.5, z1: 12.5 },
    { a: 'Mount of Olives', m: 'Mount of Olives', k: 'mountain', lon: 35.24, lat: 31.78, z0: 9.5, z1: 13 },
    // Deserts & wilderness
    { a: 'Wilderness of Sinai', m: 'Sinai Peninsula', k: 'desert', lon: 33.7, lat: 29.5, z0: 5, z1: 9 },
    { a: 'The Negev', m: 'Negev Desert', k: 'desert', lon: 34.85, lat: 30.6, z0: 6, z1: 10 },
    { a: 'Wilderness of Judea', m: 'Judean Desert', k: 'desert', lon: 35.35, lat: 31.62, z0: 7, z1: 11 },
    { a: 'Wilderness of Paran', m: 'Desert of Paran', k: 'desert', lon: 34.4, lat: 30.2, z0: 6, z1: 10 },
    { a: 'Wilderness of Zin', m: 'Wilderness of Zin', k: 'desert', lon: 35.0, lat: 30.7, z0: 7.5, z1: 11 },
    // Regions (faint background context)
    { a: 'Galilee', m: 'Galilee', k: 'region', lon: 35.4, lat: 32.95, z0: 7, z1: 11 },
    { a: 'Samaria', m: 'Samaria', k: 'region', lon: 35.25, lat: 32.28, z0: 7.5, z1: 11 },
    { a: 'Judea', m: 'Judea', k: 'region', lon: 35.05, lat: 31.6, z0: 7.5, z1: 11 },
    { a: 'Decapolis', m: 'Decapolis', k: 'region', lon: 35.95, lat: 32.4, z0: 8, z1: 11 }
  ];

  function supported() {
    if (typeof maplibregl === 'undefined' || typeof pmtiles === 'undefined') return false;
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }

  function _registerProtocol() {
    if (_protocolReady) return;
    var protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    _protocolReady = true;
  }

  function _loadStyleLayers() {
    if (_styleLayers) return Promise.resolve(_styleLayers);
    return fetch(STYLE_URL).then(function (r) {
      if (!r.ok) throw new Error('style layers HTTP ' + r.status);
      return r.json();
    }).then(function (json) { _styleLayers = json; return json; });
  }

  function _clamp(value, min, max) {
    if (!isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function _normalizeTerrainOptions(opts) {
    var raw = (opts && opts.terrain) || {};
    if (raw === false || raw.enabled === false) return { enabled: false };
    var tilejsonUrl = typeof raw.tilejsonUrl === 'string' ? raw.tilejsonUrl.trim() : '';
    var tiles = Array.isArray(raw.tiles) ? raw.tiles.filter(Boolean) : null;
    var enabled = raw.enabled === true && (tilejsonUrl || (tiles && tiles.length));
    if (!enabled) return { enabled: false };
    return {
      enabled: true,
      tilejsonUrl: tilejsonUrl || '',
      tiles: tiles,
      encoding: raw.encoding || 'terrarium',
      tileSize: Number(raw.tileSize || 512),
      minzoom: Number(raw.minzoom == null ? 0 : raw.minzoom),
      maxzoom: Number(raw.maxzoom == null ? 14 : raw.maxzoom),
      bounds: Array.isArray(raw.bounds) ? raw.bounds : null,
      exaggeration: _clamp(Number(raw.exaggeration || 1.42), 0.25, 2.2),
      pitch: _clamp(Number(raw.pitch || 54), 0, 65),
      bearing: _clamp(Number(raw.bearing == null ? -16 : raw.bearing), -180, 180),
      hillshade: raw.hillshade !== false,
      attribution: raw.attribution || '',
      maxPitch: _clamp(Number(raw.maxPitch || 65), 0, 85)
    };
  }

  function _terrainAttribution(terrain) {
    if (!terrain || !terrain.enabled) return '';
    if (terrain.attribution) return terrain.attribution;
    if (terrain.tilejsonUrl && /mapterhorn\.com/i.test(terrain.tilejsonUrl)) {
      return "<a href='https://mapterhorn.com/attribution'>Terrain: &copy; Mapterhorn</a>";
    }
    return '';
  }

  function _attributionHtml() {
    var terrain = state.terrain && state.terrain.enabled
      ? " &middot; <a href='https://mapterhorn.com/attribution' target='_blank' rel='noopener'>Mapterhorn terrain</a>"
      : '';
    return "<a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener'>&copy; OSM</a>" +
      " &middot; <a href='https://protomaps.com' target='_blank' rel='noopener'>Protomaps</a>" +
      terrain +
      " &middot; <a href='https://maplibre.org' target='_blank' rel='noopener'>MapLibre</a>";
  }

  // A small compass rosette that always points to true north. Because the map
  // can be pitched/bearing-rotated for the 3D view, the rose counter-rotates by
  // the live map bearing so "N" keeps pointing north. Source attribution lives
  // in the page's info panel instead of on the map itself.
  function _syncCompass(container) {
    if (!container) return;
    var old = container.querySelector('.bible-map-compass');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'bible-map-compass';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="bible-map-compass-rose">' +
      '<span class="bible-map-compass-n">N</span>' +
      '<span class="bible-map-compass-needle"></span></div>';
    container.appendChild(el);
    state.compassRose = el.querySelector('.bible-map-compass-rose');
    _updateCompass();
  }

  function _updateCompass() {
    if (!state.compassRose || !state.map) return;
    var bearing = 0;
    try { bearing = state.map.getBearing() || 0; } catch (e) {}
    state.compassRose.style.transform = 'rotate(' + (-bearing) + 'deg)';
  }

  // Reset-view control: hidden until the user drags/zooms the map, then flies the
  // camera back to the framing it opened with.
  function _syncResetButton(container) {
    if (!container) return;
    var old = container.querySelector('.bible-map-reset');
    if (old) old.remove();
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'bible-map-reset';
    el.setAttribute('aria-label', 'Reset map view');
    el.innerHTML = '<span class="material-symbols-outlined">recenter</span><span>Reset</span>';
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      _resetCamera();
    });
    container.appendChild(el);
    state.resetBtn = el;
  }

  function _showReset(show) {
    if (state.resetBtn) state.resetBtn.classList.toggle('visible', !!show);
  }

  // Small caption clarifying that the faint administrative borders on the
  // ancient map are modern (shown for scale, not period-accurate). Only shown in
  // ancient mode — on the modern map the borders are simply the current ones.
  function _syncBordersNote(container) {
    if (!container) return;
    var old = container.querySelector('.bible-map-borders-note');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'bible-map-borders-note';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="material-symbols-outlined">public</span>' +
      '<span>Faint borders are modern countries, provinces &amp; counties &mdash; shown for scale, not biblical-era lines</span>';
    el.classList.toggle('visible', state.mode === 'ancient');
    container.appendChild(el);
    state.bordersNote = el;
  }

  function _updateBordersNote() {
    if (state.bordersNote) state.bordersNote.classList.toggle('visible', state.mode === 'ancient');
  }

  function _resetCamera() {
    if (!state.map || !state.homeCamera) return;
    state.userMoved = false;
    _showReset(false);
    try {
      state.map.easeTo(Object.assign({}, state.homeCamera, {
        duration: 1000,
        easing: function (t) { return 1 - Math.pow(1 - t, 3); }
      }));
    } catch (e) {}
  }

  function _terrainSourceSpec(terrain, includeAttribution) {
    var spec = {
      type: 'raster-dem',
      encoding: terrain.encoding || 'terrarium',
      tileSize: terrain.tileSize || 512
    };
    if (terrain.tilejsonUrl) spec.url = terrain.tilejsonUrl;
    else if (terrain.tiles && terrain.tiles.length) {
      spec.tiles = terrain.tiles;
      spec.minzoom = terrain.minzoom;
      spec.maxzoom = terrain.maxzoom;
    }
    if (terrain.bounds) spec.bounds = terrain.bounds;
    var attribution = includeAttribution && !terrain.tilejsonUrl ? _terrainAttribution(terrain) : '';
    if (attribution) spec.attribution = attribution;
    return spec;
  }

  function _hillshadePaint(mode) {
    if (mode === 'modern') {
      return {
        'hillshade-exaggeration': 0.38,
        'hillshade-shadow-color': '#54606a',
        'hillshade-highlight-color': '#f0f7fb',
        'hillshade-accent-color': '#91a4a9',
        'hillshade-illumination-direction': 315
      };
    }
    return {
      'hillshade-exaggeration': 0.44,
      'hillshade-shadow-color': '#6f6048',
      'hillshade-highlight-color': '#f7edcf',
      'hillshade-accent-color': '#a89a73',
      'hillshade-illumination-direction': 320
    };
  }

  function _insertHillshadeLayer(layers, hillshadeLayer) {
    var waterIndex = layers.findIndex(function (l) {
      return l && l.type === 'fill' && l['source-layer'] === 'water';
    });
    if (waterIndex > 0) layers.splice(waterIndex, 0, hillshadeLayer);
    else layers.splice(Math.max(1, layers.length), 0, hillshadeLayer);
  }

  function _addTerrainSourcesToStyle(style, terrain, mode) {
    if (!terrain || !terrain.enabled) return style;
    style.sources[TERRAIN_SOURCE_ID] = _terrainSourceSpec(terrain, true);
    style.terrain = {
      source: TERRAIN_SOURCE_ID,
      exaggeration: terrain.exaggeration
    };
    if (terrain.hillshade) {
      style.sources[HILLSHADE_SOURCE_ID] = _terrainSourceSpec(terrain, false);
      _insertHillshadeLayer(style.layers, {
        id: HILLSHADE_LAYER_ID,
        type: 'hillshade',
        source: HILLSHADE_SOURCE_ID,
        layout: { visibility: 'visible' },
        paint: _hillshadePaint(mode)
      });
    }
    return style;
  }

  function _buildStyle(mode, pmtilesUrl, terrain) {
    var layers = (mode === 'modern' ? _styleLayers.modern : _styleLayers.ancient) || [];
    layers = JSON.parse(JSON.stringify(layers));
    layers = layers.filter(function (l) {
      if (mode !== 'ancient') return true;
      var sl = l['source-layer'];
      if (sl === 'buildings') return false;
      if (/runway|taxiway|aerodrome|rail/i.test(l.id || '')) return false;
      return true;
    }).map(function (l) {
      if (mode === 'ancient') {
        if (l['source-layer'] === 'boundaries') {
          l.paint = l.paint || {};
          // Faint reference on the parchment map: enough to read modern
          // countries, provinces & counties for location/scale, without
          // asserting them as biblical-era borders. Countries lead; the
          // finer tiers stay lighter so they don't clutter the ancient look.
          l.paint['line-opacity'] =
            l.id === 'boundaries_country' ? 0.40 :
            l.id === 'boundaries_region' ? 0.34 : 0.24;
        }
        if (l['source-layer'] === 'roads' && l.type === 'line') {
          l.paint = l.paint || {};
          l.paint['line-color'] = '#a98958';
          l.paint['line-opacity'] = ['interpolate', ['linear'], ['zoom'], 5, 0.08, 8, 0.18, 12, 0.28];
          if (/minor|other|path|service|link/i.test(l.id || '')) {
            l.paint['line-opacity'] = ['interpolate', ['linear'], ['zoom'], 8, 0, 11, 0.12, 14, 0.2];
          }
        }
        if (l['source-layer'] === 'water' && l.type === 'line') {
          l.minzoom = Math.min(Number(l.minzoom || 0), /river/i.test(l.id || '') ? 6 : 10);
          l.paint = l.paint || {};
          l.paint['line-color'] = '#7fb3c7';
          l.paint['line-opacity'] = ['interpolate', ['linear'], ['zoom'], 5, 0.45, 9, 0.78, 13, 0.9];
          l.paint['line-width'] = ['interpolate', ['exponential', 1.45], ['zoom'], 6, 0.45, 9, 1.1, 14, 4.8, 18, 11];
        }
      } else {
        if (l['source-layer'] === 'water' && l.type === 'line') {
          l.minzoom = Math.min(Number(l.minzoom || 0), /river/i.test(l.id || '') ? 6 : 10);
        }
      }
      return l;
    });
    var style = {
      version: 8,
      sources: {
        protomaps: {
          type: 'vector',
          url: 'pmtiles://' + pmtilesUrl,
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &middot; <a href="https://protomaps.com">Protomaps</a>'
        }
      },
      layers: layers
    };
    return _addTerrainSourcesToStyle(style, terrain, mode);
  }

  function _journeyCoords(journey) {
    return (journey.points || [])
      .filter(function (p) { return typeof p.lon === 'number' && typeof p.lat === 'number'; })
      .map(function (p) { return [p.lon, p.lat]; });
  }

  function _bounds(coords) {
    var b = new maplibregl.LngLatBounds();
    coords.forEach(function (c) { b.extend(c); });
    return b;
  }

  function _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function _densifyRoute(coords) {
    var out = [];
    var segmentMap = [];
    if (!coords || !coords.length) return { coords: [], segmentMap: [] };
    out.push(coords[0]);
    for (var i = 0; i < coords.length - 1; i++) {
      var a = coords[i], b = coords[i + 1];
      var km = _haversine(a, b);
      var steps = Math.max(4, Math.min(64, Math.ceil(km / 32)));
      for (var s = 1; s <= steps; s++) {
        var t = s / steps;
        out.push([_lerp(a[0], b[0], t), _lerp(a[1], b[1], t)]);
        segmentMap.push(i);
      }
    }
    return { coords: out, segmentMap: segmentMap };
  }

  function _routeGeoJSON(coords) {
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
  }

  function _stopsGeoJSON(journey, coords) {
    return {
      type: 'FeatureCollection',
      features: coords.map(function (c, i) {
        return {
          type: 'Feature',
          id: i,
          geometry: { type: 'Point', coordinates: c },
          properties: { i: i, first: i === 0, last: i === coords.length - 1 }
        };
      })
    };
  }

  function _cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (e) { return fallback; }
  }

  function _addOrUpdateGeoJsonSource(map, id, data) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: data });
    else map.getSource(id).setData(data);
  }

  function _addOverlays() {
    var map = state.map;
    var coords = state.routeCoords && state.routeCoords.length ? state.routeCoords : state.coords;
    if (!map || state.coords.length < 2) return;
    var accent = _cssVar('--secondary-color', '#3a6ea5');

    _addOrUpdateGeoJsonSource(map, 'journey-route', _routeGeoJSON(coords));
    _addOrUpdateGeoJsonSource(map, 'journey-stops', _stopsGeoJSON(state.journey, state.coords));
    _addOrUpdateGeoJsonSource(map, 'journey-traveler', {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords[0] }
    });

    ((state.journey && state.journey.alternates) || []).forEach(function (alt, i) {
      var ac = (alt.points || [])
        .filter(function (p) { return typeof p.lon === 'number' && typeof p.lat === 'number'; })
        .map(function (p) { return [p.lon, p.lat]; });
      if (ac.length < 2) return;
      ac = _densifyRoute(ac).coords;
      var sid = 'journey-alt-' + i;
      _addOrUpdateGeoJsonSource(map, sid, _routeGeoJSON(ac));
      if (!map.getLayer(sid + '-line')) {
        map.addLayer({
          id: sid + '-line',
          type: 'line',
          source: sid,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': accent,
            'line-width': 2.4,
            'line-opacity': 0.55,
            'line-dasharray': [1.4, 1.6]
          }
        });
      }
    });

    if (!map.getLayer('journey-route-casing')) {
      map.addLayer({
        id: 'journey-route-casing',
        type: 'line',
        source: 'journey-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': 'rgba(55,43,28,0.48)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5.2, 8, 7.8, 12, 9.4],
          'line-blur': 1.2,
          'line-opacity': 0.72
        }
      });
    }
    if (!map.getLayer('journey-route-line')) {
      map.addLayer({
        id: 'journey-route-line',
        type: 'line',
        source: 'journey-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': accent,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.1, 8, 4.4, 12, 5.2],
          'line-dasharray': [2.2, 1.25],
          'line-opacity': 0.96
        }
      });
    }
    if (!map.getLayer('journey-stops-circle')) {
      map.addLayer({
        id: 'journey-stops-circle',
        type: 'circle',
        source: 'journey-stops',
        paint: {
          'circle-radius': ['case', ['any', ['get', 'first'], ['get', 'last']], 7, 5],
          'circle-color': ['case', ['get', 'first'], '#16a34a', ['get', 'last'], '#dc2626', '#fffdf4'],
          'circle-stroke-color': accent,
          'circle-stroke-width': ['case', ['any', ['get', 'first'], ['get', 'last']], 2.8, 2],
          'circle-blur': 0.02
        }
      });
    }
    if (!map.getLayer('journey-traveler-circle')) {
      map.addLayer({
        id: 'journey-traveler-circle',
        type: 'circle',
        source: 'journey-traveler',
        paint: {
          'circle-radius': 6.5,
          'circle-color': accent,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0
        }
      });
    }
  }

  function _cameraPadding(map) {
    var c = map && map.getContainer && map.getContainer();
    var rect = c ? c.getBoundingClientRect() : { width: 360, height: 260 };
    var w = Math.max(1, rect.width || 360);
    var h = Math.max(1, rect.height || 260);
    var terrain = state.terrain || { enabled: false };
    // Generous, roughly even padding so the whole route (both endpoints) sits
    // comfortably inside the frame. A pitched 3D view foreshortens the far edge,
    // so give the top extra room when terrain is on.
    var base = Math.round(Math.max(34, w * 0.1));
    return {
      top: Math.round(base + (terrain.enabled ? h * 0.14 : h * 0.04)),
      left: base,
      right: base,
      bottom: Math.round(base + h * (terrain.enabled ? 0.1 : 0.08))
    };
  }

  function _applyJourneyCamera(map, coords, opts, animateOpen) {
    if (!map || !coords || !coords.length) return;
    var terrain = state.terrain || { enabled: false };
    var pitch = terrain.enabled ? terrain.pitch : 0;
    var bearing = terrain.enabled ? terrain.bearing : 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      if (coords.length === 1) {
        var singleTarget = {
          center: coords[0],
          zoom: Number(opts && opts.pinZoom ? opts.pinZoom : (terrain.enabled ? 8.6 : 7.6)),
          pitch: pitch,
          bearing: bearing
        };
        state.homeCamera = { center: coords[0], zoom: singleTarget.zoom, pitch: pitch, bearing: bearing };
        if (animateOpen && !reduce) {
          // Start well pulled back and flat, then slowly settle in close to the place.
          map.jumpTo({ center: coords[0], zoom: Math.max(2.6, singleTarget.zoom - 3.6), pitch: Math.max(0, pitch - 34), bearing: bearing });
          map.easeTo(Object.assign({}, singleTarget, { duration: 2300, easing: function (t) { return 1 - Math.pow(1 - t, 3); } }));
        } else {
          map.jumpTo(singleTarget);
        }
        return;
      }
      // Frame the WHOLE route. fitBounds (run at the final pitch/bearing) already
      // fits both endpoints; we then ease back a touch instead of zooming past it,
      // so the start and end never get cropped out of view.
      map.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: pitch,
        bearing: bearing
      });
      map.fitBounds(_bounds(coords), {
        padding: (opts && opts.cameraPadding) || _cameraPadding(map),
        maxZoom: terrain.enabled ? Number((opts && opts.maxZoom3d) || 10.6) : Number((opts && opts.maxZoom) || 12),
        animate: false
      });
      var fitZoom = map.getZoom();
      var target = {
        center: map.getCenter(),
        zoom: Math.max(2, fitZoom - (terrain.enabled ? 0.35 : 0.12)),
        pitch: pitch,
        bearing: bearing
      };
      state.homeCamera = { center: target.center, zoom: target.zoom, pitch: pitch, bearing: bearing };
      if (animateOpen && !reduce) {
        // Begin zoomed far out and flat, centered on the finished framing, then
        // glide the whole route into view so the journey "arrives" gracefully.
        map.jumpTo({
          center: target.center,
          zoom: Math.max(2.6, target.zoom - 2.8),
          pitch: terrain.enabled ? Math.max(0, pitch - 32) : 0,
          bearing: bearing
        });
        map.easeTo(Object.assign({}, target, {
          duration: 2400,
          easing: function (t) { return 1 - Math.pow(1 - t, 3); }
        }));
      } else {
        map.jumpTo(target);
      }
    } catch (e) {}
  }

  function _supportsTerrain(map) {
    return !!(map && typeof map.setTerrain === 'function');
  }

  function _handleTerrainError(err) {
    if (state.terrainErrorNoted) return true;
    var msg = (err && (err.message || err.error && err.error.message) || '').toString();
    var source = err && (err.sourceId || err.source && err.source.id || err.error && err.error.sourceId);
    var isTerrain = source === TERRAIN_SOURCE_ID || source === HILLSHADE_SOURCE_ID ||
      /terrain|raster-dem|mapterhorn|dem/i.test(msg);
    if (!isTerrain) return false;
    state.terrainErrorNoted = true;
    try {
      if (state.map && _supportsTerrain(state.map)) state.map.setTerrain(null);
      if (state.map && state.map.getLayer(HILLSHADE_LAYER_ID)) state.map.removeLayer(HILLSHADE_LAYER_ID);
    } catch (e) {}
    return true;
  }

  function _restoreMapEnhancements(applyCamera) {
    var map = state.map;
    if (!map) return;
    _addOverlays();
    _addMarkers();
    _addGeoFeatures();
    _refreshMarkerText();
    if (applyCamera !== false) _applyJourneyCamera(map, state.coords, state.opts || {});
    try { map.triggerRepaint(); } catch (e) {}
  }

  function _clearMarkers() {
    state.markers.forEach(function (m) { try { m.remove(); } catch (e) {} });
    state.markers = [];
    state.landmarkMarkers.forEach(function (m) { try { m.remove(); } catch (e) {} });
    state.landmarkMarkers = [];
    _clearGeoFeatures();
  }

  function _clearMarkerProximity() {
    state.markers.forEach(function (m) { try { m.getElement().classList.remove('near-traveler'); } catch (e) {} });
    state.landmarkMarkers.forEach(function (m) { try { m.getElement().classList.remove('near-traveler'); } catch (e) {} });
  }

  function _updateMarkerProximity(point, thresholdKm) {
    if (!point) { _clearMarkerProximity(); return; }
    var coord = [point.lng, point.lat];
    var pts = (state.journey.points || []).filter(function (p) {
      return typeof p.lon === 'number' && typeof p.lat === 'number';
    });
    state.markers.forEach(function (m, i) {
      if (!pts[i]) return;
      var near = _haversine(coord, [pts[i].lon, pts[i].lat]) <= thresholdKm;
      m.getElement().classList.toggle('near-traveler', near);
    });
    var landmarks = (state.opts && state.opts.landmarks) || [];
    state.landmarkMarkers.forEach(function (m, i) {
      var p = landmarks[i];
      if (!p || typeof p.lon !== 'number' || typeof p.lat !== 'number') return;
      var near = _haversine(coord, [p.lon, p.lat]) <= thresholdKm;
      m.getElement().classList.toggle('near-traveler', near);
    });
  }

  function _addMarkers() {
    _clearMarkers();
    var map = state.map;
    var pts = (state.journey.points || []).filter(function (p) {
      return typeof p.lon === 'number' && typeof p.lat === 'number';
    });
    var labelFor = (state.opts && state.opts.labelFor) || function (p, mode) {
      return mode === 'modern' ? (p.modern || p.ancient || '') : (p.ancient || p.modern || '');
    };
    var lons = pts.map(function (p) { return p.lon; });
    var midLon = lons.length ? (Math.min.apply(Math, lons) + Math.max.apply(Math, lons)) / 2 : 0;
    pts.forEach(function (p, i) {
      var el = document.createElement('div');
      el.className = 'bible-map-label' + (i === 0 ? ' first' : '') + (i === pts.length - 1 ? ' last' : '');
      el.textContent = labelFor(p, state.mode);
      var eastSide = p.lon > midLon;
      var marker = new maplibregl.Marker({ element: el, anchor: eastSide ? 'right' : 'left', offset: eastSide ? [-9, 0] : [9, 0] })
        .setLngLat([p.lon, p.lat]).addTo(map);
      state.markers.push(marker);
    });
    ((state.opts && state.opts.landmarks) || []).forEach(function (p) {
      if (typeof p.lon !== 'number' || typeof p.lat !== 'number') return;
      var el = document.createElement('div');
      var kind = p.kind || p.type || 'place';
      el.className = 'bible-map-landmark landmark-' + kind + (state.mode === 'modern' ? ' visible' : '');
      el.innerHTML = '<span></span><em>' + _escape(p.name || '') + '</em>';
      var marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, 0] })
        .setLngLat([p.lon, p.lat]).addTo(map);
      state.landmarkMarkers.push(marker);
    });
  }

  // Two-line label: leads with the name that matches the current map (biblical
  // on the ancient map, modern on the modern map) and tucks the other name
  // underneath. Same-name features (Mount Carmel) show a single line.
  function _geoNames(feat, mode) {
    var primary = mode === 'modern' ? feat.m : feat.a;
    var secondary = mode === 'modern' ? feat.a : feat.m;
    return { primary: primary || secondary || '', secondary: secondary && secondary !== primary ? secondary : '' };
  }

  function _addGeoFeatures() {
    _clearGeoFeatures();
    var map = state.map;
    if (!map) return;
    GEO_FEATURES.forEach(function (feat) {
      var el = document.createElement('div');
      el.className = 'bmgeo bmgeo-' + feat.k + (state.mode === 'ancient' ? ' bmgeo-ancient' : '');
      var names = _geoNames(feat, state.mode);
      el.innerHTML = '<span class="bmgeo-name">' + _escape(names.primary) + '</span>' +
        (names.secondary ? '<span class="bmgeo-sub">' + _escape(names.secondary) + '</span>' : '');
      var marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, 0] })
        .setLngLat([feat.lon, feat.lat]).addTo(map);
      marker._geo = feat;
      state.geoMarkers.push(marker);
    });
    _updateGeoVisibility();
  }

  // Gate each label to its zoom window so only a handful ever share the screen.
  function _updateGeoVisibility() {
    if (!state.map || !state.geoMarkers.length) return;
    var z = 0;
    try { z = state.map.getZoom(); } catch (e) { return; }
    state.geoMarkers.forEach(function (m) {
      var f = m._geo;
      m.getElement().classList.toggle('visible', z >= f.z0 && z <= f.z1);
    });
  }

  function _clearGeoFeatures() {
    state.geoMarkers.forEach(function (m) { try { m.remove(); } catch (e) {} });
    state.geoMarkers = [];
  }

  function _refreshMarkerText() {
    var pts = (state.journey.points || []).filter(function (p) {
      return typeof p.lon === 'number' && typeof p.lat === 'number';
    });
    var labelFor = (state.opts && state.opts.labelFor) || function (p, mode) {
      return mode === 'modern' ? (p.modern || p.ancient || '') : (p.ancient || p.modern || '');
    };
    state.markers.forEach(function (m, i) {
      if (pts[i]) m.getElement().textContent = labelFor(pts[i], state.mode);
    });
    state.landmarkMarkers.forEach(function (m) {
      m.getElement().classList.toggle('visible', state.mode === 'modern');
    });
  }

  function _escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function render(container, journey, opts) {
    opts = opts || {};
    state.journey = journey;
    state.opts = opts;
    state.mode = opts.mode === 'modern' ? 'modern' : 'ancient';
    state.coords = _journeyCoords(journey);
    var dense = _densifyRoute(state.coords);
    state.routeCoords = dense.coords;
    state.routeSegmentMap = dense.segmentMap;
    state.terrain = _normalizeTerrainOptions(opts);
    state.terrainErrorNoted = false;
    state.fatalErrorNoted = false;
    var pmtilesUrl = opts.pmtilesUrl;
    if (!pmtilesUrl || state.coords.length < 1) {
      return Promise.reject(new Error('bible-map: missing pmtiles url or coordinates'));
    }
    var single = state.coords.length === 1;

    stop();
    if (state.map) { try { state.map.remove(); } catch (e) {} state.map = null; }
    _clearMarkers();

    return _loadStyleLayers().then(function () {
      _registerProtocol();
      return new Promise(function (resolve, reject) {
        var map;
        var mapOpts = {
          container: container,
          style: _buildStyle(state.mode, pmtilesUrl, state.terrain),
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          cooperativeGestures: false,
          preserveDrawingBuffer: true,
          fadeDuration: 0,
          pitch: state.terrain.enabled ? state.terrain.pitch : 0,
          bearing: state.terrain.enabled ? state.terrain.bearing : 0,
          maxPitch: state.terrain.enabled ? state.terrain.maxPitch : 0,
          maxZoom: state.terrain.enabled ? 14 : 18
        };
        if (single) {
          mapOpts.center = state.coords[0];
          mapOpts.zoom = opts.pinZoom || 7;
        } else {
          mapOpts.center = state.coords[0];
          mapOpts.zoom = 6;
        }
        try {
          map = new maplibregl.Map(mapOpts);
        } catch (e) { reject(e); return; }
        state.map = map;
        map.on('error', function (e) {
          var err = e && (e.error || e);
          if (_handleTerrainError(err)) return;
          if (!state.fatalErrorNoted && opts.onError) {
            state.fatalErrorNoted = true;
            opts.onError(err);
          }
        });
        map.on('rotate', _updateCompass);
        map.on('pitch', _updateCompass);
        map.on('zoom', _updateGeoVisibility);
        // Surface the reset control once the user drags/zooms/rotates by hand
        // (programmatic camera moves have no originalEvent, so they don't count).
        map.on('movestart', function (e) {
          if (e && e.originalEvent && !state.userMoved) {
            state.userMoved = true;
            _showReset(true);
          }
        });
        map.on('load', function () {
          try {
            map.resize();
            if (state.terrain.enabled && !_supportsTerrain(map)) state.terrain.enabled = false;
            _syncCompass(container);
            _syncResetButton(container);
            _syncBordersNote(container);
            state.userMoved = false;
            _showReset(false);
            _restoreMapEnhancements(false);
            _applyJourneyCamera(map, state.coords, state.opts || {}, true);
            map.triggerRepaint();
            // Early resize keeps the canvas filled while the intro plays; the
            // final re-fit runs after the (slower) fly-in so it isn't cut short.
            setTimeout(function () { try { map.resize(); map.triggerRepaint(); } catch (e) {} }, 400);
            setTimeout(function () {
              try {
                map.resize();
                // Don't yank the camera back if the user already grabbed it.
                if (!state.userMoved) _applyJourneyCamera(map, state.coords, state.opts || {}, false);
                map.triggerRepaint();
              } catch (e) {}
            }, 2700);
            resolve(map);
          } catch (e) { reject(e); }
        });
      });
    });
  }

  function setMode(mode) {
    var next = mode === 'modern' ? 'modern' : 'ancient';
    if (!state.map || next === state.mode) { state.mode = next; return; }
    state.mode = next;
    stop();
    _updateBordersNote();
    state.map.setStyle(_buildStyle(next, state.opts.pmtilesUrl, state.terrain));
    state.map.once('styledata', function () {
      _restoreMapEnhancements(false);
      if (state.terrain && state.terrain.enabled) {
        try {
          state.map.jumpTo({
            center: state.map.getCenter(),
            zoom: state.map.getZoom(),
            pitch: state.terrain.pitch,
            bearing: state.terrain.bearing
          });
        } catch (e) {}
      }
    });
  }

  function _haversine(a, b) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (b[1] - a[1]) * toRad, dLon = (b[0] - a[0]) * toRad;
    var lat1 = a[1] * toRad, lat2 = b[1] * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function play(onStep) {
    var map = state.map;
    var coords = state.routeCoords && state.routeCoords.length ? state.routeCoords : state.coords;
    if (!map || coords.length < 2 || !map.getSource('journey-traveler')) return;
    stop();
    var segLens = [], total = 0;
    for (var i = 0; i < coords.length - 1; i++) {
      var L = _haversine(coords[i], coords[i + 1]);
      segLens.push(L); total += L;
    }
    if (total <= 0) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var followTraveler = !reduce && state.opts && state.opts.followTraveler === true;
    // A touch slower and with a higher floor so short routes don't whip past.
    var duration = reduce ? 900 : Math.min(28000, Math.max(9500, total * 14));
    var proximityThreshold = Math.max(28, Math.min(95, total / 18));
    map.setPaintProperty('journey-traveler-circle', 'circle-opacity', 1);
    var start = performance.now();
    function posAt(frac) {
      var d = Math.max(0, Math.min(1, frac)) * total;
      for (var i = 0; i < segLens.length; i++) {
        if (d <= segLens[i] || i === segLens.length - 1) {
          var t = segLens[i] ? d / segLens[i] : 0;
          var a = coords[i], b = coords[i + 1];
          return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, seg: i, storySeg: state.routeSegmentMap[i] || 0 };
        }
        d -= segLens[i];
      }
      return { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1], seg: segLens.length - 1 };
    }
    function frame(now) {
      if (!state.map) return;
      var frac = Math.min(1, (now - start) / duration);
      var ease = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
      var p = posAt(ease);
      var src = map.getSource('journey-traveler');
      if (src) src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });
      _updateMarkerProximity(p, proximityThreshold);
      // Smooth, constant-speed follow: short linear eases that chain seamlessly
      // (the old cubic eases re-accelerated every tick, which looked blocky).
      if (followTraveler && state.terrain && state.terrain.enabled && now - state.followTick > 260) {
        state.followTick = now;
        try {
          map.easeTo({
            center: [p.lng, p.lat],
            pitch: state.terrain.pitch,
            bearing: state.terrain.bearing,
            duration: 300,
            easing: function (t) { return t; },
            essential: true
          });
        } catch (e) {}
      }
      if (typeof onStep === 'function') onStep(p.storySeg, frac >= 1);
      if (frac >= 1) {
        state.raf = 0;
        setTimeout(function () { _clearMarkerProximity(); }, 520);
        return;
      }
      state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.followTick = 0;
    _clearMarkerProximity();
  }

  function destroy() {
    stop();
    _clearMarkers();
    state.compassRose = null;
    state.resetBtn = null;
    state.bordersNote = null;
    state.geoMarkers = [];
    state.homeCamera = null;
    state.userMoved = false;
    if (state.map) { try { state.map.remove(); } catch (e) {} state.map = null; }
    state.journey = null;
    state.coords = [];
    state.routeCoords = [];
    state.routeSegmentMap = [];
  }

  window.BibleMap = {
    supported: supported,
    render: render,
    setMode: setMode,
    play: play,
    stop: stop,
    destroy: destroy
  };
})();
