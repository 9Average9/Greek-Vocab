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

  var STYLE_URL = 'assets/maplibre/pm-style-layers.json?v=2';
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
    coords: []
  };

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
      exaggeration: _clamp(Number(raw.exaggeration || 1.3), 0.25, 2.2),
      pitch: _clamp(Number(raw.pitch || 48), 0, 65),
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
        'hillshade-exaggeration': 0.28,
        'hillshade-shadow-color': '#54606a',
        'hillshade-highlight-color': '#f0f7fb',
        'hillshade-accent-color': '#91a4a9',
        'hillshade-illumination-direction': 315
      };
    }
    return {
      'hillshade-exaggeration': 0.34,
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
    if (mode === 'ancient') {
      layers = layers.filter(function (l) {
        var sl = l['source-layer'];
        return sl !== 'roads' && sl !== 'buildings';
      }).map(function (l) {
        if (l['source-layer'] === 'boundaries') {
          l.paint = l.paint || {};
          l.paint['line-opacity'] = 0.18;
        }
        return l;
      });
    }
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
    var coords = state.coords;
    if (!map || coords.length < 2) return;
    var accent = _cssVar('--secondary-color', '#3a6ea5');

    _addOrUpdateGeoJsonSource(map, 'journey-route', _routeGeoJSON(coords));
    _addOrUpdateGeoJsonSource(map, 'journey-stops', _stopsGeoJSON(state.journey, coords));
    _addOrUpdateGeoJsonSource(map, 'journey-traveler', {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords[0] }
    });

    ((state.journey && state.journey.alternates) || []).forEach(function (alt, i) {
      var ac = (alt.points || [])
        .filter(function (p) { return typeof p.lon === 'number' && typeof p.lat === 'number'; })
        .map(function (p) { return [p.lon, p.lat]; });
      if (ac.length < 2) return;
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4.8, 8, 6.8, 12, 8.2],
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.6, 8, 3.6, 12, 4.4],
          'line-dasharray': [2, 1.35],
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
    var narrow = w < 430;
    return {
      top: Math.round(narrow ? 42 : 42),
      left: Math.round(narrow ? 54 : 42),
      right: Math.round(narrow ? 64 : 44),
      bottom: Math.round(Math.max(58, h * (narrow ? 0.24 : 0.18)))
    };
  }

  function _applyJourneyCamera(map, coords, opts) {
    if (!map || !coords || !coords.length) return;
    var terrain = state.terrain || { enabled: false };
    var pitch = terrain.enabled ? terrain.pitch : 0;
    var bearing = terrain.enabled ? terrain.bearing : 0;
    try {
      if (coords.length === 1) {
        map.jumpTo({
          center: coords[0],
          zoom: Number(opts && opts.pinZoom ? opts.pinZoom : (terrain.enabled ? 7.2 : 7)),
          pitch: pitch,
          bearing: bearing
        });
        return;
      }
      map.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: pitch,
        bearing: bearing
      });
      map.fitBounds(_bounds(coords), {
        padding: (opts && opts.cameraPadding) || _cameraPadding(map),
        maxZoom: terrain.enabled ? Number((opts && opts.maxZoom3d) || 9.8) : Number((opts && opts.maxZoom) || 12),
        animate: false
      });
      map.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: pitch,
        bearing: bearing
      });
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
    _refreshMarkerText();
    if (applyCamera !== false) _applyJourneyCamera(map, state.coords, state.opts || {});
    try { map.triggerRepaint(); } catch (e) {}
  }

  function _clearMarkers() {
    state.markers.forEach(function (m) { try { m.remove(); } catch (e) {} });
    state.markers = [];
    state.landmarkMarkers.forEach(function (m) { try { m.remove(); } catch (e) {} });
    state.landmarkMarkers = [];
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
          attributionControl: true,
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
        map.on('load', function () {
          try {
            map.resize();
            if (state.terrain.enabled && !_supportsTerrain(map)) state.terrain.enabled = false;
            _restoreMapEnhancements(true);
            map.triggerRepaint();
            setTimeout(function () {
              try {
                map.resize();
                _applyJourneyCamera(map, state.coords, state.opts || {});
                map.triggerRepaint();
              } catch (e) {}
            }, 180);
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
    var coords = state.coords;
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
    var duration = reduce ? 700 : Math.min(11000, Math.max(3200, total * 6));
    map.setPaintProperty('journey-traveler-circle', 'circle-opacity', 1);
    var start = performance.now();
    function posAt(frac) {
      var d = Math.max(0, Math.min(1, frac)) * total;
      for (var i = 0; i < segLens.length; i++) {
        if (d <= segLens[i] || i === segLens.length - 1) {
          var t = segLens[i] ? d / segLens[i] : 0;
          var a = coords[i], b = coords[i + 1];
          return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, seg: i };
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
      if (followTraveler && state.terrain && state.terrain.enabled && now - state.followTick > 520) {
        state.followTick = now;
        try {
          map.easeTo({
            center: [p.lng, p.lat],
            pitch: state.terrain.pitch,
            bearing: state.terrain.bearing,
            duration: 430,
            essential: false
          });
        } catch (e) {}
      }
      if (typeof onStep === 'function') onStep(p.seg, frac >= 1);
      if (frac >= 1) { state.raf = 0; return; }
      state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.followTick = 0;
  }

  function destroy() {
    stop();
    _clearMarkers();
    if (state.map) { try { state.map.remove(); } catch (e) {} state.map = null; }
    state.journey = null;
    state.coords = [];
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
