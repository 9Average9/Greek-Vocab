# Bible Journeys Vision

This feature helps users follow the movement of biblical stories, not just inspect a map. The experience should feel like a Bible-first reading aid: the route, distance, travel time, modern comparison, and Scripture steps should all serve the passage being read.

## Current Implementation

- The first version lives in `index.html`, `style.css`, and `app.js`.
- Route data is held in the `BIBLE_JOURNEYS` array in `app.js`.
- The map is currently an offline-safe schematic SVG renderer. That keeps the app fast, deployable on GitHub Pages, and free from tile-provider terms while the data model is being refined.
- Rhema verse sheets show a "Follow this journey" action only when the selected reference belongs to one of the curated journey ranges.

## Data Rules

- Keep journeys curated. Do not infer routes automatically from verse text.
- Every route should include Scripture references, route points, story steps, approximate distance, travel-time context, and an accuracy note.
- Use honest certainty labels such as "Approximate route", "Representative route", or "Highly debated".
- Ancient/Bible labels and modern comparison labels should stay separate.
- Distances and timing are teaching estimates, not claims of exact GPS precision.

## Future Map Direction

If this becomes a true interactive map, prefer MapLibre GL JS with hosted vector/raster tiles and custom styles. Do not hotlink OpenStreetMap public tiles directly for app traffic. Keep the same curated journey data and add richer layers for ancient roads, regions, terrain, and modern borders as reliable sources become available.

## Expansion Ideas

- Add more journeys: Jacob, Joseph's family to Egypt, Israel's conquest movements, David's flight, Elijah/Elisha routes, exile movements, Jesus' Galilean ministry loops, and Paul's other missionary journeys.
- Add a stepper animation that moves along each route as the user reads each Scripture step.
- Add source notes per journey for archaeology/geography decisions.
- Add per-verse journey markers inside Rhema when a passage is part of a route.
- Add modern travel comparison only as context, not as the main teaching claim.
