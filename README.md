# Embed map

CORRECTIV-style population-change map of European LAUs, packaged as a
stand-alone HTML page that can be dropped into a `<iframe>` on any article
page.

## Stack

- **MapLibre GL JS 4.7** (CDN) — vector rendering of the polygons + basemap
- **D3 v7** (CDN) — popup line chart + discrete legend SVG
- **Plain HTML / CSS / JS** — no bundler, no build step

## Files

```
embed/
├── index.html      # Page chrome + controls + overlay panels
├── style.css       # CORRECTIV-inspired overlay layout
├── main.js         # MapLibre setup, bin/colour logic, D3 chart + legend
└── data/           # Symlinks back to ../../static/* — no duplication
    ├── lau.geojson         (~50 MB, served once, browser-cached)
    ├── data.json           (~17 MB, names + per-year populations)
    └── countries.geojson   (~2 MB, dissolved country outlines)
```

## Serving locally

```bash
cd embed
python -m http.server 8000
# open http://localhost:8000
```

## Embedding in an article

Host the folder on any static file host (CDN, S3, GitHub Pages, your own
server) and add the iframe to the article HTML:

```html
<iframe src="https://your-host/embed/" width="100%" height="600"
        frameborder="0" loading="lazy"></iframe>
```

## Data + methodology

- Source: [JRC Local Population Time-Series 1961–2024](https://data.jrc.ec.europa.eu/dataset/37fcacbf-12e2-4b31-b1af-83117a74b2c7)
- Bin thresholds and colour palette match the parent Streamlit app
  (`../static_map_template.html`) so the two views are visually consistent.
- UK and Iceland LAUs lack 2024 data — the map falls back to 2021 for them
  automatically and the tooltip shows the actual effective years used.
