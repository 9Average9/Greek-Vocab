/* =========================================================================
   JOURNEY STORY — the simple, one-stop-at-a-time journey map.

   One full-screen 3D map, the guide standing at the current stop, a trail that
   fills in behind him, and three labels at most (here, next, start). The page
   (app.js) draws the card and calls go(i) to move through the story.

   Looks: 'storybook' (parchment), 'lantern' (night, glowing trail) and 'toy'
   (bright, chunky, tall mountains). Names: 'ancient' or 'modern'.

   Public API (window.JourneyStory):
     mount(container, journey, opts) -> Promise
       opts: { pmtilesUrl, terrain, look, names,
               stops:[{point, bubble, by, overview}]  (story order; the trail
               follows it, revisits included),
               padding: () => ({ top, bottom }) }
     go(i, { animate })       -> move to story stop i
     setLook(look) / setNames(names)
     destroy()
========================================================================= */
(function () {
  'use strict';

  var LOOKS = {
    storybook: {
      bg: '#e9d7a8', earth: '#ecdcae', landcover: 0.25, water: '#5fb0c2',
      shadow: '#7a4f22', highlight: '#fff4d2', accent: '#9c6a33', hx: 0.75,
      ex: 1.9, pitch: 50, bearing: -6, pose: 'guide-thumbs',
      halo: { color: '#fff8ec', width: 9, opacity: 0.95 },
      done: { color: '#b5452b', width: 5, dash: [0.2, 1.8] },
      sea: { color: '#b5452b', width: 4, dash: [1.4, 1.4] },
      ahead: { color: '#b5452b', width: 3, opacity: 0.5, dash: [1, 2] }
    },
    lantern: {
      bg: '#20264a', earth: '#262c55', landcover: 0, water: '#0b1230',
      shadow: '#03050d', highlight: '#7783c2', accent: '#3c4580', hx: 0.85,
      ex: 2.0, pitch: 52, bearing: -6, pose: 'guide-wow', glow: true,
      halo: { color: '#ffb52e', width: 16, opacity: 0.55, blur: 10 },
      done: { color: '#fff3c4', width: 3.5 },
      sea: { color: '#fff3c4', width: 3, dash: [1.4, 1.4] },
      ahead: { color: '#ffd56b', width: 2.5, opacity: 0.35, dash: [1, 2] }
    },
    toy: {
      bg: '#c9e39a', earth: '#cfe6a2', landcover: 0.25, water: '#45c2ea',
      shadow: '#4f7a3a', highlight: '#fbffe6', accent: '#7ca85a', hx: 0.9,
      ex: 2.8, pitch: 54, bearing: -6, pose: 'guide-cheer',
      halo: { color: '#2bb3a3', width: 12, opacity: 0.95 },
      done: { color: '#ffffff', width: 6, dash: [1.2, 1] },
      sea: { color: '#ffffff', width: 5, dash: [0.6, 1.2] },
      ahead: { color: '#ffffff', width: 3, opacity: 0.55, dash: [1, 2] }
    }
  };
  var LAYERS = ['js-halo', 'js-done-land', 'js-done-sea', 'js-ahead'];

  var st = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function reduced() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function hasLL(p) { return p && typeof p.lat === 'number' && typeof p.lon === 'number'; }
  function ll(p) { return [p.lon, p.lat]; }

  // The base map restyled for a look: no roads, borders or labels — just land,
  // water and real elevation shading.
  function styleFor(look) {
    var L = LOOKS[look] || LOOKS.storybook;
    var t = Object.assign({}, st.opts.terrain || {}, { enabled: !!(st.opts.terrain && st.opts.terrain.enabled !== false), exaggeration: L.ex, pitch: L.pitch, bearing: L.bearing, hillshade: true });
    var style = window.BibleMap.buildStyle('ancient', st.opts.pmtilesUrl, t);
    style.layers.forEach(function (l) {
      var id = l.id || '';
      if (/^roads|^boundaries|^buildings|^landuse|^pois|^places|^physical/.test(id) || l.type === 'symbol') {
        l.layout = Object.assign({}, l.layout || {}, { visibility: 'none' });
        return;
      }
      if (id === 'background') l.paint = { 'background-color': L.bg };
      else if (id === 'earth') l.paint = { 'fill-color': L.earth };
      else if (id === 'landcover') l.paint = Object.assign({}, l.paint || {}, { 'fill-opacity': L.landcover });
      else if (/^water/.test(id) && l.type === 'fill') l.paint = { 'fill-color': L.water };
      else if (/^water/.test(id) && l.type === 'line') l.paint = Object.assign({}, l.paint || {}, { 'line-color': L.water });
      else if (l.type === 'hillshade') {
        l.paint = { 'hillshade-shadow-color': L.shadow, 'hillshade-highlight-color': L.highlight, 'hillshade-accent-color': L.accent, 'hillshade-exaggeration': L.hx, 'hillshade-illumination-direction': 315 };
      }
    });
    return style;
  }

  // The trail follows the story: a leg each time the story moves to a new
  // place (revisits and trips back included). A stop with by:'sea' was
  // reached by ship.
  function legsGeoJSON() {
    var stops = st.opts.stops, pts = st.pts, out = [];
    for (var k = 1; k < stops.length; k++) {
      var a = pts[stops[k - 1].point], b = pts[stops[k].point];
      if (stops[k].point === stops[k - 1].point || !hasLL(a) || !hasLL(b)) continue;
      out.push({ type: 'Feature', properties: { done: k <= st.i, sea: /sea|ship|boat/i.test(stops[k].by || '') },
        geometry: { type: 'LineString', coordinates: [ll(a), ll(b)] } });
    }
    return { type: 'FeatureCollection', features: out };
  }

  function addLayers() {
    var map = st.map, L = LOOKS[st.look] || LOOKS.storybook;
    if (!map.getSource('js-legs')) map.addSource('js-legs', { type: 'geojson', data: legsGeoJSON() });
    var line = function (id, filter, p) {
      if (map.getLayer(id)) map.removeLayer(id);
      var paint = { 'line-color': p.color, 'line-width': p.width, 'line-opacity': p.opacity == null ? 1 : p.opacity };
      if (p.dash) paint['line-dasharray'] = p.dash;
      if (p.blur) paint['line-blur'] = p.blur;
      map.addLayer({ id: id, type: 'line', source: 'js-legs', filter: filter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: paint });
    };
    line('js-ahead', ['==', ['get', 'done'], false], L.ahead);
    line('js-halo', ['==', ['get', 'done'], true], L.halo);
    line('js-done-land', ['all', ['==', ['get', 'done'], true], ['==', ['get', 'sea'], false]], L.done);
    line('js-done-sea', ['all', ['==', ['get', 'done'], true], ['==', ['get', 'sea'], true]], L.sea);
  }

  function label(p) {
    if (!p) return '';
    var name = st.names === 'modern' ? (p.modern || p.ancient) : (p.ancient || p.modern);
    return String(name || '');
  }

  function clearMarkers() {
    (st.markers || []).forEach(function (m) { try { m.remove(); } catch (e) {} });
    st.markers = [];
  }
  function marker(el, at, anchor, offset) {
    var m = new maplibregl.Marker({ element: el, anchor: anchor || 'center', offset: offset || [0, 0] }).setLngLat(at).addTo(st.map);
    st.markers.push(m);
    return m;
  }
  function div(cls, html) { var d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; return d; }

  // Dots for every place, the three labels, little boats on sea legs.
  function drawMarkers() {
    clearMarkers();
    var pts = st.pts, stops = st.opts.stops, cur = st.curPoint;
    var stop = stops[st.i] || {};
    var visited = {};
    for (var v = 0; v <= st.i; v++) visited[stops[v].point] = true;
    var nextStop = stops.slice(st.i + 1).find(function (s) { return s.point !== cur && !s.overview; });
    var next = nextStop ? nextStop.point : -1;
    pts.forEach(function (p, i) {
      if (!hasLL(p) || i === cur) return;
      marker(div('jst-dot ' + (visited[i] ? 'is-done' : 'is-ahead'), '<b>' + (i + 1) + '</b>'), ll(p));
    });
    for (var k = 1; k < stops.length; k++) {
      var a = pts[stops[k - 1].point], b = pts[stops[k].point];
      if (stops[k].point !== stops[k - 1].point && hasLL(a) && hasLL(b) && /sea|ship|boat/i.test(stops[k].by || '')) {
        marker(div('jst-boat', '⛵'), [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2]);
      }
    }
    var start = stops[0].point;
    // Labels sit beside their dots (the guide stands above his stop and his
    // name flag below it), on the side away from him.
    var side = function (i) { return hasLL(pts[cur]) && pts[i].lon < pts[cur].lon ? ['right', [-12, 0]] : ['left', [12, 0]]; };
    if (next >= 0 && hasLL(pts[next])) { var sn = side(next); marker(div('jst-mini', esc(label(pts[next])) + ' · <em>next</em>'), ll(pts[next]), sn[0], sn[1]); }
    if (cur !== start && next !== start && hasLL(pts[start])) { var ss = side(start); marker(div('jst-mini', esc(label(pts[start])) + ' · <em>start</em>'), ll(pts[start]), ss[0], ss[1]); }
    var here = pts[cur];
    if (hasLL(here)) {
      marker(div('jst-flag', esc(label(here))), ll(here), 'top', [0, 10]);
      var L = LOOKS[st.look] || LOOKS.storybook;
      var g = div('jst-guide',
        '<div class="jst-bubble">' + esc(stop.bubble || label(here) + '!') + '</div>' +
        '<img src="assets/mascot/' + L.pose + '.webp" alt="" decoding="async">');
      st.guide = marker(g, ll(here), 'bottom', [0, 4]);
    }
  }

  // Frame a set of stops in the space between the top bar and the card. Done
  // with plain Web Mercator math (MapLibre's cameraForBounds misbehaves once a
  // tilted map already carries padding).
  function merc(c) {
    var s = Math.sin(c[1] * Math.PI / 180);
    return [(c[0] + 180) / 360 * 512, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512];
  }
  function unmerc(p) {
    var n = Math.PI * (1 - 2 * p[1] / 512);
    return [p[0] / 512 * 360 - 180, Math.atan(Math.sinh(n)) * 180 / Math.PI];
  }
  function framePoints(idxs, overview) {
    var cs = idxs.map(function (i) { return st.pts[i]; }).filter(hasLL).map(ll);
    if (!cs.length) return;
    var L = LOOKS[st.look] || LOOKS.storybook;
    var pad = (st.opts.padding && st.opts.padding()) || { top: 140, bottom: 300 };
    var el = st.map.getContainer(), W = el.clientWidth || 390, H = el.clientHeight || 800;
    var side = 58, top = pad.top + 34;                       // room for the guide's head
    var ps = cs.map(merc);
    var xs = ps.map(function (p) { return p[0]; }), ys = ps.map(function (p) { return p[1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var aw = Math.max(80, W - side * 2), ah = Math.max(80, H - top - pad.bottom);
    var zw = Math.log2(aw / Math.max(maxx - minx, 1e-7));
    var zh = Math.log2(ah / Math.max(maxy - miny, 1e-7)) + (L.pitch > 30 ? 0.45 : 0);
    var zoom = Math.min(zw, zh, overview ? 9 : 9.6) - 0.08;
    if (cs.length === 1) zoom = Math.min(zoom, 8.6);
    zoom = Math.max(2.5, zoom);
    var target = { center: unmerc([(minx + maxx) / 2, (miny + maxy) / 2]), zoom: zoom, pitch: L.pitch, bearing: L.bearing,
      padding: { top: top, bottom: pad.bottom, left: side, right: side } };
    if (st.animate && !reduced()) st.map.flyTo(Object.assign(target, { duration: 1700, curve: 1.25, essential: true }));
    else st.map.jumpTo(target);
  }

  // Walk the guide from the last place to this one.
  function walk(fromPt, toPt, done) {
    var A = st.pts[fromPt], B = st.pts[toPt];
    if (!hasLL(A) || !hasLL(B) || reduced() || !st.guide) { done(); return; }
    var a = ll(A), b = ll(B);
    var dur = 1300, t0 = performance.now();
    var el = st.guide.getElement();
    el.classList.add('is-walking');
    var token = st.token;
    function frame(now) {
      if (!st || st.token !== token) return;
      var f = Math.min(1, (now - t0) / dur);
      var e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      st.guide.setLngLat([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]);
      if (f < 1) requestAnimationFrame(frame);
      else { el.classList.remove('is-walking'); done(); }
    }
    requestAnimationFrame(frame);
  }

  function go(i, o) {
    if (!st || !st.map) return;
    o = o || {};
    var stops = st.opts.stops;
    i = Math.max(0, Math.min(stops.length - 1, i));
    var prevPoint = st.curPoint, prevI = st.i;
    st.i = i;
    st.curPoint = stops[i].point;
    st.animate = o.animate !== false;
    st.token = (st.token || 0) + 1;
    var src = st.map.getSource('js-legs');
    var settle = function () {
      if (!st) return;
      st.guideAt = null;
      if (src) src.setData(legsGeoJSON());
      drawMarkers();
    };
    // Frame the leg just walked (or the whole route at the start and end).
    var s = stops[i];
    if (s.overview) framePoints(st.pts.map(function (_, k) { return k; }), true);
    else {
      // The leg just walked, plus the next stop so "next" stays on screen.
      var idxs = [s.point];
      var pv = stops.slice(0, i).reverse().find(function (x) { return x.point !== s.point; });
      if (pv) idxs.push(pv.point);
      var nx = stops.slice(i + 1).find(function (x) { return x.point !== s.point && !x.overview; });
      if (nx) idxs.push(nx.point);
      framePoints(idxs, false);
    }
    if (st.animate && i === prevI + 1 && st.curPoint !== prevPoint && st.guide) {
      // Keep the old picture while he walks, then redraw at the new stop.
      walk(prevPoint, st.curPoint, settle);
    } else settle();
  }

  function mount(container, journey, opts) {
    destroy();
    if (!window.BibleMap || !window.BibleMap.supported()) return Promise.reject(new Error('WebGL not supported'));
    st = { container: container, journey: journey, opts: opts, look: LOOKS[opts.look] ? opts.look : 'storybook', names: opts.names === 'modern' ? 'modern' : 'ancient',
      pts: journey.points || [], i: 0, curPoint: (opts.stops[0] || {}).point || 0, markers: [] };
    var mine = st;
    return window.BibleMap.prepare().then(function () {
      return new Promise(function (resolve, reject) {
        var L = LOOKS[mine.look];
        var map;
        try {
          map = new maplibregl.Map({ container: container, style: styleFor(mine.look), attributionControl: false,
            dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0, maxPitch: 70,
            center: hasLL(mine.pts[0]) ? ll(mine.pts[0]) : [35.2, 31.8], zoom: 6, pitch: L.pitch, bearing: L.bearing });
        } catch (e) { reject(e); return; }
        mine.map = map;
        var timer = setTimeout(function () { reject(new Error('map timed out')); }, 45000);
        map.once('load', function () {
          clearTimeout(timer);
          if (st !== mine) { resolve(); return; }
          addLayers();
          go(0, { animate: false });
          resolve();
        });
        map.on('error', function (e) {
          if (!map.loaded()) { clearTimeout(timer); reject(e && e.error || new Error('map error')); }
        });
      });
    });
  }

  function setLook(look) {
    if (!st || !st.map || !LOOKS[look] || look === st.look) { if (st) st.look = LOOKS[look] ? look : st.look; return; }
    st.look = look;
    var map = st.map;
    map.setStyle(styleFor(look));
    map.once('style.load', function () {
      if (!st) return;
      addLayers();
      st.animate = false;
      drawMarkers();
      var L = LOOKS[look];
      map.easeTo({ pitch: L.pitch, bearing: L.bearing, duration: reduced() ? 0 : 600 });
    });
  }
  function setNames(names) {
    if (!st) return;
    st.names = names === 'modern' ? 'modern' : 'ancient';
    if (st.map) drawMarkers();
  }
  function destroy() {
    if (!st) return;
    clearMarkers();
    try { if (st.map) st.map.remove(); } catch (e) {}
    st = null;
  }

  window.JourneyStory = { _map: function () { return st && st.map; }, mount: mount, go: go, setLook: setLook, setNames: setNames, destroy: destroy, LOOKS: Object.keys(LOOKS) };
})();
