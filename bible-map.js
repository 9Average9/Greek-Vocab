/* =========================================================================
   BIBLE MAP — real top-down map renderer for Bible Journeys (MapLibre + Protomaps)

   This is the "accurate" renderer that draws curated journey routes over a real
   self-hosted vector basemap. It is intentionally optional: app.js only loads
   and uses it when a Bible-world .pmtiles file is configured AND the device is
   online. Otherwise the offline-safe schematic SVG renderer stays in charge.

   Design choices that keep this free + offline-friendly + uncluttered:
   - Tiles come from a single self-hosted Protomaps .pmtiles file (no API key,
     no per-request cost, no hotlinking public OSM tiles). See
     scripts/build-bibleworld-pmtiles.md for how that file is produced/hosted.
   - The basemap is drawn as geometry only (earth/water/land/roads/boundaries).
     Basemap text labels are turned off so we don't have to host glyph fonts,
     and so our own curated ancient/modern place names are the only labels.
   - maplibre-gl + pmtiles are vendored under assets/maplibre/ and lazy-loaded.

   Public API (window.BibleMap):
     supported()                         -> boolean (libs + WebGL present)
     render(container, journey, opts)    -> Promise (builds the map)
     setMode('ancient' | 'modern')       -> swap basemap theme + label language
     play(onStep)                        -> animate the traveler along the route
     stop()                              -> halt the animation
     destroy()                           -> tear the map down
   opts: { mode, pmtilesUrl, labelFor(point, mode), landmarks, onError() }
========================================================================= */
(function () {
  'use strict';

  var STYLE_URL = 'assets/maplibre/pm-style-layers.json?v=1';
  var _styleLayers = null;        // { modern: [...], ancient: [...] }
  var _protocolReady = false;

  var state = {
    map: null,
    journey: null,
    mode: 'ancient',
    markers: [],
    landmarkMarkers: [],
    raf: 0,
    opts: null,
    coords: []                    // [[lon,lat], ...] in journey order
  };

  function supported() {
    if (typeof maplibregl === 'undefined' || typeof pmtiles === 'undefined') return false;
    // Cheap WebGL probe — MapLibre needs a WebGL context.
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

  function _buildStyle(mode, pmtilesUrl) {
    var layers = (mode === 'modern' ? _styleLayers.modern : _styleLayers.ancient) || [];
    // Clone so per-mode tweaks never mutate the cached arrays.
    layers = JSON.parse(JSON.stringify(layers));
    if (mode === 'ancient') {
      // Mute distinctly modern features in the ancient view.
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
    return {
      version: 8,
      // No `glyphs` key on purpose: there are no symbol/text layers, so no font
      // glyphs are needed. MapLibre rejects glyphs:undefined, so it must be omitted.
      sources: {
        protomaps: {
          type: 'vector',
          url: 'pmtiles://' + pmtilesUrl,
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &middot; <a href="https://protomaps.com">Protomaps</a>'
        }
      },
      layers: layers
    };
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

  // ── Overlays (route line, stops, traveler) ─────────────────────────────────
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

  function _addOverlays() {
    var map = state.map;
    var coords = state.coords;
    if (!map || coords.length < 2) return;
    var accent = _cssVar('--secondary-color', '#3a6ea5');

    if (!map.getSource('journey-route')) {
      map.addSource('journey-route', { type: 'geojson', data: _routeGeoJSON(coords) });
    } else {
      map.getSource('journey-route').setData(_routeGeoJSON(coords));
    }
    if (!map.getSource('journey-stops')) {
      map.addSource('journey-stops', { type: 'geojson', data: _stopsGeoJSON(state.journey, coords) });
    } else {
      map.getSource('journey-stops').setData(_stopsGeoJSON(state.journey, coords));
    }
    if (!map.getSource('journey-traveler')) {
      map.addSource('journey-traveler', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: coords[0] } } });
    }

    // Alternate / "possible" routes — faint dashed lines under the main route.
    ((state.journey && state.journey.alternates) || []).forEach(function (alt, i) {
      var ac = (alt.points || [])
        .filter(function (p) { return typeof p.lon === 'number' && typeof p.lat === 'number'; })
        .map(function (p) { return [p.lon, p.lat]; });
      if (ac.length < 2) return;
      var sid = 'journey-alt-' + i;
      if (!map.getSource(sid)) map.addSource(sid, { type: 'geojson', data: _routeGeoJSON(ac) });
      else map.getSource(sid).setData(_routeGeoJSON(ac));
      if (!map.getLayer(sid + '-line')) {
        map.addLayer({
          id: sid + '-line', type: 'line', source: sid,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': accent, 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [1.4, 1.6] }
        });
      }
    });

    if (!map.getLayer('journey-route-casing')) {
      map.addLayer({
        id: 'journey-route-casing', type: 'line', source: 'journey-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': 'rgba(0,0,0,0.28)', 'line-width': 6, 'line-blur': 1.5 }
      });
    }
    if (!map.getLayer('journey-route-line')) {
      map.addLayer({
        id: 'journey-route-line', type: 'line', source: 'journey-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': accent, 'line-width': 3, 'line-dasharray': [2, 1.4] }
      });
    }
    if (!map.getLayer('journey-stops-circle')) {
      map.addLayer({
        id: 'journey-stops-circle', type: 'circle', source: 'journey-stops',
        paint: {
          'circle-radius': ['case', ['any', ['get', 'first'], ['get', 'last']], 7, 5],
          'circle-color': ['case', ['get', 'first'], '#16a34a', ['get', 'last'], '#dc2626', '#ffffff'],
          'circle-stroke-color': accent,
          'circle-stroke-width': 2
        }
      });
    }
    if (!map.getLayer('journey-traveler-circle')) {
      map.addLayer({
        id: 'journey-traveler-circle', type: 'circle', source: 'journey-traveler',
        paint: {
          'circle-radius': 6, 'circle-color': accent,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-opacity': 0
        }
      });
    }
  }

  function _cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (e) { return fallback; }
  }

  // ── Place-name markers (DOM, so no glyph fonts needed) ─────────────────────
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
    pts.forEach(function (p, i) {
      var el = document.createElement('div');
      el.className = 'bible-map-label' + (i === 0 ? ' first' : '') + (i === pts.length - 1 ? ' last' : '');
      el.textContent = labelFor(p, state.mode);
      var marker = new maplibregl.Marker({ element: el, anchor: 'left', offset: [8, 0] })
        .setLngLat([p.lon, p.lat]).addTo(map);
      state.markers.push(marker);
    });
    ((state.opts && state.opts.landmarks) || []).forEach(function (p) {
      if (typeof p.lon !== 'number' || typeof p.lat !== 'number') return;
      var el = document.createElement('div');
      el.className = 'bible-map-landmark landmark-' + (p.kind || 'place') +
        (state.mode === 'modern' ? ' visible' : '');
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

  // ── Public: render ─────────────────────────────────────────────────────────
  function render(container, journey, opts) {
    opts = opts || {};
    state.journey = journey;
    state.opts = opts;
    state.mode = opts.mode === 'modern' ? 'modern' : 'ancient';
    state.coords = _journeyCoords(journey);
    var pmtilesUrl = opts.pmtilesUrl;
    if (!pmtilesUrl || state.coords.length < 2) {
      return Promise.reject(new Error('bible-map: missing pmtiles url or coordinates'));
    }

    stop();
    if (state.map) { try { state.map.remove(); } catch (e) {} state.map = null; }
    _clearMarkers();

    return _loadStyleLayers().then(function () {
      _registerProtocol();
      return new Promise(function (resolve, reject) {
        var map;
        try {
          map = new maplibregl.Map({
            container: container,
            style: _buildStyle(state.mode, pmtilesUrl),
            bounds: _bounds(state.coords),
            fitBoundsOptions: { padding: 46, maxZoom: 12 },
            attributionControl: false,
            dragRotate: false,
            pitchWithRotate: false,
            cooperativeGestures: false,
            // Keep the WebGL buffer — iOS Safari otherwise composites a blank
            // canvas when the map sits inside a modal/animated container.
            preserveDrawingBuffer: true,
            fadeDuration: 0
          });
        } catch (e) { reject(e); return; }
        state.map = map;
        map.on('error', function (e) {
          // Tile/style errors shouldn't crash the app; surface once for fallback.
          if (opts.onError) { opts.onError(e && e.error); opts.onError = null; }
        });
        map.on('load', function () {
          try {
            map.resize();   // container may have been sized just before init
            _addOverlays();
            _addMarkers();
            map.fitBounds(_bounds(state.coords), { padding: 46, maxZoom: 12, animate: false });
            map.triggerRepaint();   // force a paint (blank-canvas guard on iOS)
            setTimeout(function () { try { map.resize(); map.triggerRepaint(); } catch (e) {} }, 180);
            resolve(map);
          } catch (e) { reject(e); }
        });
      });
    });
  }

  // ── Public: setMode ────────────────────────────────────────────────────────
  function setMode(mode) {
    var next = mode === 'modern' ? 'modern' : 'ancient';
    if (!state.map || next === state.mode) { state.mode = next; return; }
    state.mode = next;
    stop();
    state.map.setStyle(_buildStyle(next, state.opts.pmtilesUrl));
    state.map.once('styledata', function () {
      _addOverlays();
      _refreshMarkerText();
    });
  }

  // ── Public: play (animate traveler along the real route) ───────────────────
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
      if (typeof onStep === 'function') onStep(p.seg, frac >= 1);
      if (frac >= 1) { state.raf = 0; return; }
      state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function destroy() {
    stop();
    _clearMarkers();
    if (state.map) { try { state.map.remove(); } catch (e) {} state.map = null; }
    state.journey = null;
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
