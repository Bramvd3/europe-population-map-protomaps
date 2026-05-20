/* ============================================================
   CORRECTIV-style embed: MapLibre map + D3 popup + D3 legend.

   Same data, same bins, same fallback logic as the parent Streamlit app
   — just rendered with MapLibre/D3 instead of Plotly so it's lightweight
   enough to drop into an article <iframe>.
   ============================================================ */

const ALL_YEARS = [1961, 1971, 1981, 1991, 2001, 2011, 2021, 2024];

// Same 10 fixed bins as the parent app, in user-specified value space.
const PCT_BINS = [-80, -60, -40, -20, 0, 50, 100, 200, 500];
const ABS_BINS = [-20000, -10000, -5000, -1000, 0, 1000, 5000, 10000, 20000];

// CORRECTIV's discrete diverging palette — 10 colours (5 red + 5 green,
// skipping the cream centre so 0 is a clean red→green boundary).
const COLORS = [
  "#d46780", // 0 darkest red   — ≤−80% / ≤−20k
  "#df91a3", // 1
  "#e8acb3", // 2
  "#f0c6c3", // 3
  "#f7e1d4", // 4 lightest red  — −20→0 / −1k→0
  "#e7e7c3", // 5 lightest green— 0→+50 / 0→+1k
  "#d0d3a2", // 6
  "#bac082", // 7
  "#8e9847", // 8
  "#646c1d", // 9 darkest green — ≥+500% / ≥+20k
];

const NO_DATA_COLOR = "rgba(0,0,0,0)";    // transparent → basemap shows through

// ---- State ----------------------------------------------------------------
let regionData;     // {locations, names, spark, first_year, ..., pops:{...}}
let dataByLocation; // locations[] index lookup
let yearA = 1961;
let yearB = 2024;
let mode = "pct";
let map;

// ---- Helpers --------------------------------------------------------------
function binIndex(value, bins) {
  if (value == null || !isFinite(value)) return null;
  for (let i = 0; i < bins.length; i++) {
    if (value < bins[i]) return i;
  }
  return bins.length;
}

function effectiveYear(idx, requested, direction) {
  // direction=+1 fall forward in time, -1 fall backward.
  const v = regionData.pops[String(requested)][idx];
  if (v != null) return [requested, v];
  const range = direction < 0
    ? ALL_YEARS.filter(y => y < requested).reverse()
    : ALL_YEARS.filter(y => y > requested);
  for (const y of range) {
    const val = regionData.pops[String(y)][idx];
    if (val != null) return [y, val];
  }
  return [requested, null];
}

function computeDelta(idx) {
  const [eya, pa] = effectiveYear(idx, yearA, +1);
  const [eyb, pb] = effectiveYear(idx, yearB, -1);
  if (pa == null || pb == null || eya >= eyb) return null;
  if (mode === "pct") {
    if (pa === 0) return null;
    return (pb - pa) / pa * 100;
  }
  return pb - pa;
}

function formatAbsLabel(v) {
  const sign = v > 0 ? "+" : (v < 0 ? "−" : "");
  const abs = Math.abs(v);
  if (abs >= 1000) return sign + (abs / 1000) + "k";
  return sign + abs;
}

// ---- Map setup ------------------------------------------------------------
// OpenFreeMap Positron — community-maintained OSM-derived vector tiles served
// from Cloudflare's CDN. Free, no API key, and *much* faster on zoom/pan than
// CARTO's public endpoint (which is the slowdown CORRECTIV avoids with their
// MapTiler hosting).  We can still slot our choropleth between the basemap
// layers via beforeId.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
// In OpenFreeMap, country borders are a single layer (`boundary_2` = OSM
// admin level 2). No separate "halo" sublayer to hide.
const BASE_COUNTRY_BORDER_LAYER = "boundary_2";

async function init() {
  // Load LAU geojson + per-region data in parallel. (We used to also fetch
  // countries.geojson for a custom border overlay; the vector basemap renders
  // those above the choropleth for us now, so it's gone.)
  const [lauGeo, dataJson] = await Promise.all([
    fetch("data/lau.geojson").then(r => r.json()),
    fetch("data/data.json").then(r => r.json()),
  ]);
  regionData = dataJson;
  dataByLocation = new Map(regionData.locations.map((loc, i) => [loc, i]));

  map = new maplibregl.Map({
    container: "map",
    style: MAP_STYLE,
    center: [12, 53],
    zoom: 3.4,
    minZoom: 2,
    maxZoom: 12,
    attributionControl: { compact: true },
  });

  // MapLibre's setFeatureState requires features to be addressable by ID.
  // Our GeoJSON has the gisco_id at the top-level `id` field as a string, but
  // MapLibre's GeoJSON source ignores non-numeric top-level IDs unless we
  // promote a property. So we copy each feature's top-level id into a
  // properties.gisco_id and tell the source to promote that field.
  lauGeo.features.forEach(f => {
    f.properties = f.properties || {};
    f.properties.gisco_id = f.id;
  });

  map.on("load", () => {
    // Darken the basemap's country border to dark grey, like CORRECTIV's.
    if (map.getLayer(BASE_COUNTRY_BORDER_LAYER)) {
      map.setPaintProperty(BASE_COUNTRY_BORDER_LAYER, "line-color", "#333");
      map.setPaintProperty(BASE_COUNTRY_BORDER_LAYER, "line-width", 1.2);
    }

    map.addSource("lau", {
      type: "geojson",
      data: lauGeo,
      promoteId: "gisco_id",
      // Our LAU geometries are already simplified to ~250 m in preprocess.py
      // (topology-aware per country, so no sliver artefacts). We do NOT want
      // MapLibre to simplify them further per tile — that's what causes the
      // shapes to "snap" to a coarser version during rapid zoom changes.
      // tolerance: 0 disables Douglas-Peucker simplification; buffer: 256
      // keeps polygons fully drawn across tile seams.
      tolerance: 0,
      buffer: 256,
    });
    // The basemap's country-border layer exists in the loaded style; if it's
    // present we pass its id as `beforeId` so MapLibre inserts our choropleth
    // *under* it (so the borders stay crisply on top).
    const beforeId = map.getLayer(BASE_COUNTRY_BORDER_LAYER)
      ? BASE_COUNTRY_BORDER_LAYER
      : undefined;

    map.addLayer({
      id: "lau-fill",
      type: "fill",
      source: "lau",
      paint: {
        "fill-color": [
          "case",
          ["==", ["feature-state", "bin"], null], NO_DATA_COLOR,
          ["match", ["feature-state", "bin"],
            0, COLORS[0], 1, COLORS[1], 2, COLORS[2], 3, COLORS[3], 4, COLORS[4],
            5, COLORS[5], 6, COLORS[6], 7, COLORS[7], 8, COLORS[8], 9, COLORS[9],
            NO_DATA_COLOR],
        ],
        "fill-opacity": 0.85,
        "fill-outline-color": "rgba(255,255,255,0)",
      },
    }, beforeId);

    // Thin white separator between adjacent LAUs; zoom-interpolated so it's
    // invisible at continental zoom and fades in around city level.
    map.addLayer({
      id: "lau-outline",
      type: "line",
      source: "lau",
      paint: {
        "line-color": "rgba(255,255,255,0.75)",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          5, 0,
          6, 0.2,
          7, 0.4,
          8, 0.6,
        ],
      },
    }, beforeId);

    // Hover ring — also goes below the country border so it doesn't fight it
    // visually around national edges.
    map.addLayer({
      id: "lau-hover",
      type: "line",
      source: "lau",
      paint: {
        "line-color": "#222",
        "line-width": 2,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false], 1,
          0,
        ],
      },
    }, beforeId);

    refreshBins();
    attachInteractions();
  });
}

// ---- Recompute fill colours ----------------------------------------------
function refreshBins() {
  const bins = mode === "pct" ? PCT_BINS : ABS_BINS;
  const locations = regionData.locations;
  for (let i = 0; i < locations.length; i++) {
    const d = computeDelta(i);
    const b = binIndex(d, bins);
    map.setFeatureState(
      { source: "lau", id: locations[i] },
      { bin: b }
    );
  }
  updateLegend();
  updateTitle();
}

function updateTitle() {
  document.getElementById("period-title").textContent =
    `Population change in Europe between ${yearA} and ${yearB}`;
}

// 2-handle range slider over ALL_YEARS. We use integer indices (0..7)
// internally so noUiSlider gets uniform step=1; the tooltips and pips display
// the actual year via the `format` / `pips.format` callbacks.
function setupYearSlider() {
  const sliderEl = document.getElementById("year-slider");
  noUiSlider.create(sliderEl, {
    start: [0, ALL_YEARS.length - 1],
    step: 1,
    connect: true,
    range: { min: 0, max: ALL_YEARS.length - 1 },
    margin: 1,                       // handles must stay ≥1 step apart
    tooltips: [
      { to: v => ALL_YEARS[Math.round(v)], from: v => parseInt(v) },
      { to: v => ALL_YEARS[Math.round(v)], from: v => parseInt(v) },
    ],
    pips: {
      mode: "values",
      values: ALL_YEARS.map((_, i) => i),
      density: -1,
      format: { to: v => ALL_YEARS[Math.round(v)] },
    },
  });

  // Live title while dragging — cheap text update, no map re-render.
  sliderEl.noUiSlider.on("update", (_v, _h, unencoded) => {
    const ya = ALL_YEARS[Math.round(unencoded[0])];
    const yb = ALL_YEARS[Math.round(unencoded[1])];
    document.getElementById("period-title").textContent =
      `Population change in Europe between ${ya} and ${yb}`;
  });

  // Heavy re-bin only on handle release.
  sliderEl.noUiSlider.on("change", (_v, _h, unencoded) => {
    yearA = ALL_YEARS[Math.round(unencoded[0])];
    yearB = ALL_YEARS[Math.round(unencoded[1])];
    refreshBins();
    const panel = document.getElementById("chart-panel");
    if (panel.style.display !== "none" && panel.dataset.location) {
      showPopup(panel.dataset.location);
    }
  });
}

// ---- Interactions ---------------------------------------------------------
let hoveredId = null;

function attachInteractions() {
  map.on("mousemove", "lau-fill", (e) => {
    if (!e.features || e.features.length === 0) return;
    const id = e.features[0].id;
    if (id === hoveredId) return;
    if (hoveredId != null) {
      map.setFeatureState({ source: "lau", id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    map.setFeatureState({ source: "lau", id }, { hover: true });
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "lau-fill", () => {
    if (hoveredId != null) {
      map.setFeatureState({ source: "lau", id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "lau-fill", (e) => {
    if (!e.features || e.features.length === 0) return;
    showPopup(e.features[0].id);
  });

  setupYearSlider();

  // Mode toggle (% / abs)
  document.querySelectorAll('input[name="mode"]').forEach(inp => {
    inp.addEventListener("change", (e) => {
      mode = e.target.value;
      refreshBins();
    });
  });

  // Close button
  document.getElementById("close-button").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("chart-panel").style.display = "none";
  });
}

// ---- Popup with D3 line chart --------------------------------------------
function showPopup(locationId) {
  const idx = dataByLocation.get(locationId);
  if (idx == null) return;
  const name = regionData.names[idx] || locationId;
  const panel = document.getElementById("chart-panel");
  panel.dataset.location = locationId;

  // Effective years for the sentence
  const [eya, pa] = effectiveYear(idx, yearA, +1);
  const [eyb, pb] = effectiveYear(idx, yearB, -1);

  let sentence;
  if (pa == null || pb == null || eya >= eyb) {
    sentence = `<strong>${name}</strong>: no comparable data for this period.`;
  } else {
    const delta = mode === "pct" ? (pb - pa) / pa * 100 : pb - pa;
    if (mode === "pct") {
      const direction = delta >= 0 ? "grew" : "declined";
      sentence = `In <strong>${name}</strong>, population <strong>${direction}</strong> ` +
                 `by <strong>${Math.abs(delta).toFixed(1)}</strong> per cent ` +
                 `between ${eya} and ${eyb}.`;
    } else {
      const direction = delta >= 0 ? "gained" : "lost";
      sentence = `<strong>${name}</strong> ${direction} <strong>${Math.abs(delta).toLocaleString()}</strong> ` +
                 `residents between ${eya} and ${eyb}.`;
    }
  }
  document.getElementById("info-sentence").innerHTML = sentence;

  // Build the line chart from all 8 yearly population values for this region.
  const series = ALL_YEARS
    .map(y => ({ year: y, pop: regionData.pops[String(y)][idx] }))
    .filter(d => d.pop != null);

  renderTrendChart(series);
  panel.style.display = "block";
}

function renderTrendChart(series) {
  const W = 380, H = 120;
  const margin = { top: 15, right: 60, bottom: 20, left: 60 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const container = d3.select("#popup_chart");
  container.selectAll("svg").remove();

  if (series.length < 2) {
    container.append("p").text("Not enough data to plot.");
    return;
  }

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([series[0].year, series[series.length - 1].year])
    .range([0, innerW]);
  // Y-axis starts at 0 (same as CORRECTIV) so a rising/falling line can be
  // judged against the absolute population, not just the visible range.
  const y = d3.scaleLinear()
    .domain([0, d3.max(series, d => d.pop)]).nice()
    .range([innerH, 0]);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.pop));

  g.append("path")
    .datum(series)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2.5)
    .attr("d", line);

  // Endpoint labels + dots
  const first = series[0], last = series[series.length - 1];
  g.append("text")
    .attr("class", "endpoint-label")
    .attr("text-anchor", "end")
    .attr("x", x(first.year) - 4)
    .attr("y", y(first.pop) + 4)
    .text(first.pop.toLocaleString());
  g.append("text")
    .attr("class", "endpoint-label")
    .attr("text-anchor", "start")
    .attr("x", x(last.year) + 4)
    .attr("y", y(last.pop) + 4)
    .text(last.pop.toLocaleString());

  g.append("circle").attr("r", 3).attr("cx", x(first.year)).attr("cy", y(first.pop)).attr("fill", "steelblue");
  g.append("circle").attr("r", 3).attr("cx", x(last.year)).attr("cy", y(last.pop)).attr("fill", "steelblue");
}

// ---- Legend ---------------------------------------------------------------
function updateLegend() {
  const bins = mode === "pct" ? PCT_BINS : ABS_BINS;
  const container = d3.select("#map_legend");
  container.selectAll("svg").remove();

  const W = 300, H = 24;
  const bandW = W / COLORS.length;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");

  // 10 colour bands.
  COLORS.forEach((c, i) => {
    svg.append("rect")
      .attr("x", i * bandW)
      .attr("y", 0)
      .attr("width", bandW)
      .attr("height", 6)
      .attr("fill", c);
  });

  // 9 labels at the boundaries between bands (between band i and band i+1).
  for (let i = 0; i < bins.length; i++) {
    const x = (i + 1) * bandW;
    const v = bins[i];
    let txt;
    if (mode === "pct") {
      txt = (v > 0 ? "+" : "") + v + "%";
    } else {
      txt = formatAbsLabel(v);
    }
    svg.append("text")
      .attr("class", "legend-number")
      .attr("text-anchor", "middle")
      .attr("x", x)
      .attr("y", 17)
      .text(txt);
  }
}

// ---- Go -------------------------------------------------------------------
init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="padding:1rem;background:#fee;color:#900;">Failed to load: ${err.message}</div>`);
});
