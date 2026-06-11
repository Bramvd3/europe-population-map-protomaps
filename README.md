# Bevolkingsevolutie in Europa — VRT NWS

Deployable static site that powers the
[`europe-population-map-protomaps`](https://bramvd3.github.io/europe-population-map-protomaps/)
GitHub Pages deploy.

Three pages, served from this folder:

| URL | Wat |
|---|---|
| `/` | Het verhalende artikel (Nederlandstalig, in VRT NWS-stijl) |
| `/scrolly/` | Standalone scrolly — kan ook geëmbed worden via `/scrolly/?embed=1` |
| `/map/` | Vrij verkenbare kaart met jaarslider en bevolkingsgrafiek per gemeente |

## Stack

- **MapLibre GL JS 4.7** + **pmtiles@3.2** — vector rendering uit een single-file `.pmtiles`
- **Protomaps** basemap (Nederlandstalige labels, "white" flavor)
- **D3 v7** — popup-trendgrafiek + legenda
- **Scrollama 3.2** — scrollytelling-step detection
- **noUiSlider 15.7** — dubbele-handle jaarslider (alleen op `/map/`)
- **Roobert** — VRT's huisletter (self-hosted onder `assets/fonts/`)
- Plain HTML/CSS/JS — geen bundler, geen build step

## Map-structuur

```
webapp/
├── README.md
├── index.html                ← het artikel (root)
├── article.css               ← styling van het artikel
├── article.js                ← scrollama observer + postMessage naar scrolly-iframe
├── style.css                 ← shared design tokens, fonts, overlay-styling
│
├── scrolly/
│   ├── index.html            ← scrollytelling (standalone of via ?embed=1)
│   ├── scrolly.css           ← scrolly-specifieke layout (sticky map + cards)
│   └── scrolly.js            ← STEPS array, applyStep, period pill, popup chart
│
├── map/
│   ├── index.html            ← interactieve kaart met jaarslider
│   └── main.js               ← slider, paint expressions, popup, legend
│
├── assets/
│   ├── vrtnws-logo.png       ← gebruikt in de header
│   ├── vrtnws-logo-white.png ← gebruikt in de footer-gradient
│   └── fonts/
│       └── Roobert-{Regular,Medium,SemiBold}.{woff2,woff}
│
└── data/
    └── lau-scrolly.pmtiles   ← ~89 MB, bevat gemeente-geometries + pop_1961…pop_2024
```

Gedeelde resources (`style.css`, `assets/`, `data/`) liggen op root. De
scrolly en map laden `../style.css` en `pmtiles://../data/lau-scrolly.pmtiles`.

## Lokaal draaien

Vanuit de parent-map (`populatie-app/`):

```bash
python3 serve_local.py 8000 webapp
# open:
#   http://127.0.0.1:8000/             ← het artikel
#   http://127.0.0.1:8000/scrolly/     ← standalone scrolly
#   http://127.0.0.1:8000/map/         ← interactieve kaart
```

> De Protomaps API-key in `map/main.js` en `scrolly/scrolly.js` is
> origin-beperkt. Voor lokale testing: voeg `127.0.0.1` toe aan de
> allowlist op [app.protomaps.com](https://app.protomaps.com), of zet
> 'm tijdelijk op `*`.

## Deployen

Push naar de `main` branch:

```bash
git add <files>
git commit -m "…"
git push    # GitHub Pages bouwt + serveert binnen ~1 min
```

De host **moet** HTTP Range-requests ondersteunen voor `.pmtiles`. Alle
moderne CDN's doen dat (GitHub Pages, Akamai, Cloudflare, S3+CloudFront).

## Data + methodologie

- Bron: [JRC Local Population Time-Series 1961–2024](https://data.jrc.ec.europa.eu/dataset/37fcacbf-12e2-4b31-b1af-83117a74b2c7)
- LAU-geometrieën zijn topology-aware vereenvoudigd (250 m tolerance per land)
- UK en Ierland missen 2024-data — de paint expression coalesce't naar 2021
  zodat ze niet leeg verschijnen op de kaart
- Bin-thresholds: `[-25, -15, -8, -3, 0, 5, 15, 35, 75]` (%-verandering)
- Kleurenpalet: 10-stops diverging red→green, identiek over alle drie de pagina's
- De data zelf reproduceren vanaf raw ARDECO-input: zie `../README.md` in de parent map
