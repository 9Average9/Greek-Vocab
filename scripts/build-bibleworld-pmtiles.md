# Building the Bible-world basemap (`bibleworld.pmtiles`)

The Bible Journeys "real map" view draws curated routes over a **self-hosted
Protomaps vector basemap**. This keeps the feature free forever: no API key, no
per-request tile fees, and no hotlinking of the public OpenStreetMap tile servers
(which their usage policy forbids for app traffic).

You produce one small `.pmtiles` file that covers only the Bible world, host it as
a static asset, and point the app at it. That's the whole setup.

---

## 1. Install the `pmtiles` CLI

It's a single Go binary.

```bash
# Option A: with Go installed
go install github.com/protomaps/go-pmtiles@latest   # gives you `go-pmtiles`

# Option B: download a prebuilt binary from
# https://github.com/protomaps/go-pmtiles/releases  (rename to `pmtiles`)
```

## 2. Extract just the Bible-world region

Protomaps publishes daily whole-planet builds at `https://build.protomaps.com`.
`pmtiles extract` pulls **only** the tiles inside a bounding box using HTTP range
requests, so you never download the planet — just the region you ask for.

Bounding box used by the app's coordinates (lon/lat): **`9,24,48,43`**
(roughly Rome and Carthage in the west to Babylon in the east, the Nile Delta in
the south to the Black Sea coast in the north).

```bash
# Pick a recent dated build (check the directory listing at build.protomaps.com).
SRC="https://build.protomaps.com/20250601.pmtiles"   # <-- use a current date

pmtiles extract "$SRC" bibleworld.pmtiles \
  --bbox=9,24,48,43 \
  --maxzoom=9
```

- `--maxzoom=9` gives clear country/region/city detail at a modest file size.
  Use `8` for a smaller file, or `10` if you want to zoom in closer (larger file).
- Expect something in the tens-of-MB range at z9. It is fine for a GitHub Release
  asset (2 GB limit) and works with HTTP range requests there.

> **Schema/version note:** the vendored style in `assets/maplibre/pm-style-layers.json`
> was generated with `@protomaps/basemaps@5.x`, which targets the current Protomaps
> tile schema. Use a recent `build.protomaps.com` build so the two match. If you ever
> regenerate the style layers, keep the basemaps package version and the build date
> roughly in sync. To regenerate the style:
>
> ```bash
> cd scripts && npm install @protomaps/basemaps maplibre-gl
> node build-pm-style.js   # writes ../assets/maplibre/pm-style-layers.json
> ```

## 3. Host the file

Any static host that supports HTTP range requests works. Two free options:

- **GitHub Release asset** (recommended, free): create a release on the repo and
  upload `bibleworld.pmtiles`. The download URL
  (`https://github.com/<owner>/<repo>/releases/download/<tag>/bibleworld.pmtiles`)
  serves `Accept-Ranges: bytes`, which is what pmtiles needs.
- **Cloudflare R2 / any S3-compatible bucket** free tier, with public read.

Do **not** commit the `.pmtiles` into the git repo (it's large and binary).

## 4. Point the app at it

In `app.js`, set:

```js
const BIBLE_WORLD_PMTILES_URL = 'https://github.com/<owner>/<repo>/releases/download/<tag>/bibleworld.pmtiles';
```

That's the only switch. While it is an empty string, the app keeps using the
offline-safe schematic SVG map. Once it points at a reachable file, the Journeys
page shows the real top-down map when the device is online, and still falls back to
the schematic when offline.
