/* ============================================================
   Scrollytelling controller.

   Reuses the same Protomaps basemap, lau.pmtiles + data.json as the
   interactive embed. Each step in STEPS defines a period (yearA→yearB),
   camera (center+zoom), optional set of LAU gisco_ids to highlight, and
   optional gisco_id to auto-open the popup for.
   ============================================================ */

const ALL_YEARS = [1961, 1971, 1981, 1991, 2001, 2011, 2021, 2024];

// Same 10 bins / colours as the interactive embed.
const PCT_BINS = [-8, -6, -4, -2, 0, 5, 10, 20, 50];
const COLORS = [
  "#d46780", "#df91a3", "#e8acb3", "#f0c6c3", "#f7e1d4",
  "#e7e7c3", "#d0d3a2", "#bac082", "#8e9847", "#646c1d",
];
const NO_DATA_COLOR = "rgba(0,0,0,0)";

// ---- Story steps ---------------------------------------------------------
// Each entry corresponds to a .step in scrolly.html (by index). yearA/yearB
// drive the choropleth period; center/zoom drive the camera fly; highlight
// is an array of LAU gisco_ids that get a thick dark outline; popup (if set)
// auto-opens the D3 chart for that single LAU.
// Hand-picked focus regions reused across steps.
const BIG_CITIES = ["BE_44021", "BE_11002", "BE_21004", "BE_62063", "BE_52011"];
const LLN_AREA  = [
  "BE_25121","BE_25018","BE_25068","BE_25112","BE_25023",
  "BE_25091","BE_25119","BE_25124","BE_25031",
];
const KEMPEN_LIMBURG = [
  "BE_13031","BE_13046","BE_13019","BE_13017","BE_13004","BE_13023",
  "BE_13010","BE_13029","BE_13049","BE_13035",
  "BE_71067","BE_72039","BE_72042","BE_72020","BE_71011","BE_71070",
  "BE_71057","BE_71066","BE_72043","BE_72038",
];
const WESTHOEK = [
  "BE_32030","BE_33041","BE_33016","BE_33039","BE_33021",
  "BE_33029","BE_37012","BE_32003","BE_32006","BE_32011",
];
const BE_LUX = [
  "BE_84033","BE_82036","BE_81013","BE_81003","BE_82005",
  "BE_82009","BE_85039","BE_84043","BE_84077","BE_83055",
];
const THREE_BIG = ["BE_11002", "BE_44021", "BE_21004"];

// dim: how to dim the non-focused regions.
//   "off"           — no overlay; full choropleth visible everywhere
//   "belgium"       — translucent white over everything except BE
//   "belgium-lux"   — translucent white over everything except BE + LU
//
// countryHighlight: ISO-3 country code to outline thickly (uses Protomaps'
//   built-in country boundary layer). null = no country outline.
//
// multiPopup: array of gisco_ids → draws a row of mini line charts (one per
//   id) in the chart panel, with a vertical marker at year 2001 (the "knik").
const STEPS = [
  // 0 — Intro, tight West-European frame (NL/BE/FR/UK + western DE)
  { yearA: 1961, yearB: 2024, center: [5, 51],     zoom: 5.5, highlight: [],            popup: null, dim: "off",         countryHighlight: null },
  // 1 — BE cities decline
  { yearA: 1961, yearB: 2001, center: [4.6, 50.7],  zoom: 7.2, highlight: BIG_CITIES,    popup: null, dim: "belgium",     countryHighlight: null },
  // 2 — Brussels-centred banlieue
  { yearA: 1961, yearB: 2001, center: [4.40, 50.85],zoom: 9.0, highlight: LLN_AREA,      popup: null, dim: "belgium",     countryHighlight: null },
  // 3 — Kempen + Limburg
  { yearA: 1961, yearB: 2001, center: [5.15, 51.20],zoom: 8.4, highlight: KEMPEN_LIMBURG,popup: null, dim: "belgium",     countryHighlight: null },
  // 4 — Westhoek
  { yearA: 1961, yearB: 2001, center: [2.85, 50.90],zoom: 9.5, highlight: WESTHOEK,      popup: null, dim: "belgium",     countryHighlight: null },
  // 5 — Switch to 2001→2024, cities return
  { yearA: 2001, yearB: 2024, center: [4.6, 50.7],  zoom: 7.2, highlight: BIG_CITIES,    popup: null, dim: "belgium",     countryHighlight: null },
  // 6 — Knik in 3 curves (Antwerpen, Gent, Brussel) shown in side-by-side mini charts
  { yearA: 2001, yearB: 2024, center: [4.6, 50.7],  zoom: 7.2, highlight: THREE_BIG,     popup: null, dim: "belgium",     countryHighlight: null, multiPopup: THREE_BIG },
  // 7 — Belgian Lux + Grand Duchy: LU stays dimmed but gets a thick country
  //     outline so its shape is unambiguous. Focus stays on the Belgian side.
  { yearA: 2001, yearB: 2024, center: [5.85, 49.83],zoom: 8.5, highlight: BE_LUX,        popup: null, dim: "belgium",     countryHighlight: "LUX" },
  // 8 — Belgium overview, almost all light green
  { yearA: 2001, yearB: 2024, center: [4.6, 50.7],  zoom: 7.5, highlight: [],            popup: null, dim: "belgium",     countryHighlight: null },
  // 9 — Zoom out, neighbours visible, dim off so we can compare
  { yearA: 2001, yearB: 2024, center: [6, 49.5],    zoom: 5.8, highlight: [],            popup: null, dim: "off",         countryHighlight: null },
  // 10 — Iberia
  { yearA: 2001, yearB: 2024, center: [-3.8, 40.5], zoom: 5.4, highlight: [],            popup: null, dim: "off",         countryHighlight: null },
  // 11 — Baltic states
  { yearA: 2001, yearB: 2024, center: [25, 56.5],   zoom: 5.3, highlight: [],            popup: null, dim: "off",         countryHighlight: null },
];

// ---- Helpers (mirrors of main.js) ---------------------------------------
function binIndex(value, bins) {
  if (value == null || !isFinite(value)) return null;
  for (let i = 0; i < bins.length; i++) {
    if (value < bins[i]) return i;
  }
  return bins.length;
}

let regionData;          // {locations, names, pops, …}
let dataByLocation;      // gisco_id → array index
let currentYearA = STEPS[0].yearA;
let currentYearB = STEPS[0].yearB;
let map;

function effectiveYear(idx, requested, direction) {
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
  const [eya, pa] = effectiveYear(idx, currentYearA, +1);
  const [eyb, pb] = effectiveYear(idx, currentYearB, -1);
  if (pa == null || pb == null || eya >= eyb) return null;
  if (pa === 0) return null;
  return (pb - pa) / pa * 100;
}

// ---- Map style (copied from main.js) -----------------------------------
const PROTOMAPS_KEY = "d3b78e1318dd7bcb";
const PROTOMAPS_FLAVOR = "white";

function buildProtomapsStyle() {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${PROTOMAPS_FLAVOR}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_KEY}`,
        attribution:
          '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> © ' +
          '<a href="https://openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a>',
      },
    },
    layers: protomaps_themes_base.default("protomaps", PROTOMAPS_FLAVOR, "nl"),
  };
}

function findCountryBorderLayer() {
  const layers = map.getStyle().layers;
  const looksLikeBorder = (id) => {
    const s = id.toLowerCase();
    if (!/country|admin[-_]?0|boundary[-_]?2/.test(s)) return false;
    if (/(disputed|halo|shadow|casing|maritime|coast)/.test(s)) return false;
    return true;
  };
  const lineLayers = layers.filter(l => l.type === "line");
  return (
    lineLayers.find(l => looksLikeBorder(l.id))?.id ??
    lineLayers.find(l => l.id.toLowerCase().includes("boundary"))?.id ??
    null
  );
}

// ---- Preload overlay ----------------------------------------------------
function showPreloadOverlay() {
  const div = document.createElement("div");
  div.className = "preload-overlay";
  div.innerHTML = `
    <div class="preload-card">
      <h2>Even geduld…</h2>
      <p>De kaart wordt geladen.</p>
      <div class="preload-progress">
        <div class="preload-progress-fill"></div>
      </div>
      <p class="preload-count">0 / ${STEPS.length}</p>
    </div>
  `;
  document.body.appendChild(div);
  return {
    el: div,
    setProgress(done, total) {
      div.querySelector(".preload-progress-fill").style.width =
        (done / total * 100) + "%";
      div.querySelector(".preload-count").textContent = `${done} / ${total}`;
    },
    hide() {
      div.classList.add("fade-out");
      setTimeout(() => div.remove(), 600);
    },
  };
}

// Wait until the map has no in-flight tile requests. Resolves immediately
// if everything is already loaded.
function waitForIdle() {
  if (map.areTilesLoaded()) return Promise.resolve();
  return new Promise((r) => map.once("idle", r));
}

// ---- Init ---------------------------------------------------------------
async function init() {
  const overlay = showPreloadOverlay();

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  regionData = await fetch("data/data.json").then(r => r.json());
  dataByLocation = new Map(regionData.locations.map((loc, i) => [loc, i]));

  buildPeriodTicks();

  map = new maplibregl.Map({
    container: "map",
    style: buildProtomapsStyle(),
    center: STEPS[0].center,
    zoom: STEPS[0].zoom,
    minZoom: 2,
    maxZoom: 12,
    interactive: false,                // story-driven, no user pan/zoom
    attributionControl: { compact: true },
  });

  map.on("load", () => {
    // Border + water + country-label tweaks (same as main.js)
    const borderLayerId = findCountryBorderLayer();
    if (borderLayerId) {
      map.setPaintProperty(borderLayerId, "line-color", "#333");
      map.setPaintProperty(borderLayerId, "line-width", 1.2);
      map.setPaintProperty(borderLayerId, "line-dasharray", [1]);
    }
    if (map.getLayer("water")) {
      map.setPaintProperty("water", "fill-color", "#dbe9f4");
    }
    if (map.getLayer("places_country")) {
      map.setPaintProperty("places_country", "text-color", "#5c5c5c");
    }

    // LAU source — numeric feature.id from the rebuilt PMTiles (see
    // rebuild_lau_pmtiles.py).
    map.addSource("lau", {
      type: "vector",
      url: "pmtiles://data/lau.pmtiles",
    });
    const beforeId = borderLayerId ?? undefined;

    map.addLayer({
      id: "lau-fill",
      type: "fill",
      source: "lau",
      "source-layer": "lau",
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

    map.addLayer({
      id: "lau-outline",
      type: "line",
      source: "lau",
      "source-layer": "lau",
      paint: {
        "line-color": "rgba(255,255,255,0.75)",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          5, 0, 6, 0.2, 7, 0.4, 8, 0.6,
        ],
      },
    }, beforeId);

    // Dim overlay — translucent white over non-focused countries. The filter
    // is rewritten per step (setDimMode). Layer is inserted ABOVE the choropleth
    // (lau-outline) so it visually mutes those LAUs, but BELOW the highlight
    // line so highlighted gemeenten still pop crisply on top.
    map.addLayer({
      id: "lau-dim",
      type: "fill",
      source: "lau",
      "source-layer": "lau",
      filter: ["!=", ["slice", ["get", "gisco_id"], 0, 3], "ZZ_"],   // placeholder, replaced per step
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": 0.78,
      },
      layout: { visibility: "none" },
    }, beforeId);

    // Highlight layer — thick dark outline for feature-state.highlighted.
    map.addLayer({
      id: "lau-highlight",
      type: "line",
      source: "lau",
      "source-layer": "lau",
      paint: {
        "line-color": "#1c1c1c",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          5, 1.2, 8, 2.0, 11, 2.5,
        ],
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "highlighted"], false], 1,
          0,
        ],
      },
    }, beforeId);

    // Country highlight — uses Protomaps' built-in `boundaries` source-layer
    // (already loaded as part of the basemap). Filter is rewritten per step
    // to point at a single ISO-3 country code (e.g. "LUX").
    map.addLayer({
      id: "country-highlight",
      type: "line",
      source: "protomaps",
      "source-layer": "boundaries",
      filter: ["all",
        ["<=", ["get", "kind_detail"], 2],
        ["==", ["get", "brk_a3"], "ZZZ"],          // placeholder
      ],
      paint: {
        "line-color": "#1c1c1c",
        "line-width": 3,
      },
      layout: { visibility: "none" },
    }, beforeId);

    // First refreshBins after LAU source has actually loaded (avoids the
    // first-paint feature-state race; same logic as the main embed). Once
    // bins are set we trigger the per-step tile preload, then unveil the
    // story.
    function onceLauLoaded(e) {
      if (e.sourceId !== "lau" || !map.isSourceLoaded("lau")) return;
      map.off("sourcedata", onceLauLoaded);
      refreshBins();
      map.triggerRepaint();
      preloadAllStepsThenStart();
    }
    if (map.isSourceLoaded("lau")) {
      refreshBins();
      map.triggerRepaint();
      preloadAllStepsThenStart();
    } else {
      map.on("sourcedata", onceLauLoaded);
    }

    drawLegend();
  });

  // Walk through every step's camera position once, waiting for tiles to
  // finish loading at each. After this completes both the Protomaps basemap
  // tiles AND the LAU PMTiles byte-ranges are in the browser HTTP cache, so
  // the actual scrolly flyTo's no longer have to fetch them — pans and
  // zooms run smoothly without the white-tile flicker.
  async function preloadAllStepsThenStart() {
    try {
      // Make sure the initial render finished before we start jumping
      await waitForIdle();

      for (let i = 0; i < STEPS.length; i++) {
        const step = STEPS[i];
        map.jumpTo({ center: step.center, zoom: step.zoom });
        await waitForIdle();
        overlay.setProgress(i + 1, STEPS.length);
      }

      // Cleanly reset to step 0 so the very first flyTo has nothing to do
      applyStep(STEPS[0]);
      await waitForIdle();
    } catch (e) {
      // If preload fails for any reason, fall back to just rendering step 0
      console.warn("Preload error, continuing without:", e);
      applyStep(STEPS[0]);
    }

    overlay.hide();
    setupScrollama();
  }
}

// ---- Bin refresh -------------------------------------------------------
function refreshBins() {
  const locations = regionData.locations;
  for (let i = 0; i < locations.length; i++) {
    const d = computeDelta(i);
    const b = binIndex(d, PCT_BINS);
    map.setFeatureState(
      { source: "lau", sourceLayer: "lau", id: i },
      { bin: b }
    );
  }
}

// ---- Dim + country-highlight management -------------------------------
function setDimMode(mode) {
  const layer = "lau-dim";
  if (mode === "off") {
    map.setLayoutProperty(layer, "visibility", "none");
    return;
  }
  let filter;
  if (mode === "belgium") {
    filter = ["!=", ["slice", ["get", "gisco_id"], 0, 3], "BE_"];
  } else if (mode === "belgium-lux") {
    filter = ["all",
      ["!=", ["slice", ["get", "gisco_id"], 0, 3], "BE_"],
      ["!=", ["slice", ["get", "gisco_id"], 0, 3], "LU_"],
    ];
  } else {
    return;
  }
  map.setFilter(layer, filter);
  map.setLayoutProperty(layer, "visibility", "visible");
}

function setCountryHighlight(brk_a3) {
  const layer = "country-highlight";
  if (!brk_a3) {
    map.setLayoutProperty(layer, "visibility", "none");
    return;
  }
  map.setFilter(layer, [
    "all",
    ["<=", ["get", "kind_detail"], 2],
    ["==", ["get", "brk_a3"], brk_a3],
  ]);
  map.setLayoutProperty(layer, "visibility", "visible");
}

// ---- Highlight management ---------------------------------------------
const highlightedIdxs = new Set();
function setHighlight(giscoIds) {
  // Clear previous
  for (const idx of highlightedIdxs) {
    map.setFeatureState(
      { source: "lau", sourceLayer: "lau", id: idx },
      { highlighted: false }
    );
  }
  highlightedIdxs.clear();
  // Set new
  for (const giscoId of giscoIds) {
    const idx = dataByLocation.get(giscoId);
    if (idx == null) continue;
    map.setFeatureState(
      { source: "lau", sourceLayer: "lau", id: idx },
      { highlighted: true }
    );
    highlightedIdxs.add(idx);
  }
}

// ---- Period pill (top-center) ------------------------------------------
function buildPeriodTicks() {
  // Place a small tick mark for each of the 8 census years.
  const ticks = document.getElementById("period-ticks");
  ALL_YEARS.forEach((y, i) => {
    const pct = (i / (ALL_YEARS.length - 1)) * 100;
    const el = document.createElement("div");
    el.className = "tick";
    el.style.left = pct + "%";
    el.dataset.year = y;
    ticks.appendChild(el);
  });
}

function updatePeriodPill() {
  // Translate yearA/yearB to positions in the [0, 100] track.
  const idxA = ALL_YEARS.indexOf(currentYearA);
  const idxB = ALL_YEARS.indexOf(currentYearB);
  const pctA = (idxA / (ALL_YEARS.length - 1)) * 100;
  const pctB = (idxB / (ALL_YEARS.length - 1)) * 100;
  const fill = document.getElementById("period-fill");
  fill.style.left = pctA + "%";
  fill.style.right = (100 - pctB) + "%";
  document.querySelector("#period-pill .year-a").textContent = currentYearA;
  document.querySelector("#period-pill .year-b").textContent = currentYearB;
}

// ---- Popup (same as the main embed, simplified) -----------------------
function showPopup(giscoId) {
  const idx = dataByLocation.get(giscoId);
  if (idx == null) { hidePopup(); return; }

  const name = regionData.names[idx] || giscoId;
  const panel = document.getElementById("chart-panel");

  const [eya, pa] = effectiveYear(idx, currentYearA, +1);
  const [eyb, pb] = effectiveYear(idx, currentYearB, -1);

  let sentence;
  if (pa == null || pb == null || eya >= eyb) {
    sentence = `<strong>${name}</strong>: geen vergelijkbare data voor deze periode.`;
  } else {
    const delta = (pb - pa) / pa * 100;
    const direction = delta >= 0 ? "groeide" : "kromp";
    sentence = `In <strong>${name}</strong> ${direction} de bevolking met ` +
               `<strong>${Math.abs(delta).toFixed(1)}%</strong> tussen ${eya} en ${eyb}.`;
  }
  document.getElementById("info-sentence").innerHTML = sentence;

  // Line chart of the full 1961–2024 series for this LAU
  const series = ALL_YEARS
    .map(y => ({ year: y, pop: regionData.pops[String(y)][idx] }))
    .filter(d => d.pop != null);

  const W = 280, H = 130;
  const margin = { top: 6, right: 8, bottom: 18, left: 8 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  d3.select("#popup_chart").selectAll("*").remove();
  const svg = d3.select("#popup_chart")
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain(d3.extent(series, d => d.year))
    .range([0, innerW]);
  const y = d3.scaleLinear()
    .domain(d3.extent(series, d => d.pop)).nice()
    .range([innerH, 0]);

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.pop))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(series)
    .attr("fill", "none")
    .attr("stroke", "#222")
    .attr("stroke-width", 1.5)
    .attr("d", line);

  g.selectAll("circle")
    .data(series)
    .join("circle")
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.pop))
    .attr("r", 2)
    .attr("fill", "#222");

  // X axis with year labels (every other to avoid crowding)
  g.selectAll(".x-label")
    .data(ALL_YEARS.filter((_, i) => i % 2 === 0))
    .join("text")
    .attr("class", "x-label")
    .attr("x", d => x(d))
    .attr("y", innerH + 14)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "#666")
    .text(d => d);

  // Mark the period endpoints
  g.selectAll(".endpoint")
    .data([[currentYearA, "A"], [currentYearB, "B"]])
    .join("circle")
    .attr("cx", d => x(d[0]))
    .attr("cy", d => {
      const p = series.find(s => s.year === d[0]);
      return p ? y(p.pop) : innerH;
    })
    .attr("r", 3.5)
    .attr("fill", "#1c1c1c")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);

  panel.style.display = "block";
}

function hidePopup() {
  const panel = document.getElementById("chart-panel");
  panel.style.display = "none";
  panel.classList.remove("multi");
}

// Three (or more) mini line charts side by side. Each chart shows the full
// 1961–2024 series for that LAU with a dashed vertical marker at year 2001
// (the "knik") and a red dot at the 2001 datapoint to draw the eye.
function showMultiPopup(giscoIds) {
  const panel = document.getElementById("chart-panel");
  panel.classList.add("multi");

  const names = giscoIds
    .map(id => regionData.names[dataByLocation.get(id)]?.split(" / ")[0])
    .filter(Boolean);
  document.getElementById("info-sentence").innerHTML =
    `<strong>${names.join(", ")}</strong>: drie steden, één patroon. ` +
    `De daling tot rond 2000, dan een duidelijke knik omhoog.`;

  d3.select("#popup_chart").selectAll("*").remove();
  const row = d3.select("#popup_chart")
    .append("div")
    .style("display", "flex")
    .style("gap", "10px");

  for (const id of giscoIds) {
    const idx = dataByLocation.get(id);
    if (idx == null) continue;
    const name = (regionData.names[idx] || id).split(" / ")[0];
    const series = ALL_YEARS
      .map(y => ({ year: y, pop: regionData.pops[String(y)][idx] }))
      .filter(d => d.pop != null);

    const cell = row.append("div").style("flex", "1").style("min-width", "0");
    cell.append("div")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("margin-bottom", "2px")
      .text(name);

    // Reserve enough height for the labels above + below the curve
    const W = 160, H = 110;
    const m = { top: 16, right: 8, bottom: 18, left: 8 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    const svg = cell.append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("width", "100%")
      .style("display", "block");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(series, d => d.year))
      .range([0, iw]);

    // Padded y-domain so the dip doesn't visually hit the bottom of the
    // chart (otherwise it reads as "population went to zero"). 40% headroom
    // below the minimum + 15% above the maximum keeps the curve visibly
    // dynamic without misleading the eye.
    const minPop = d3.min(series, d => d.pop);
    const maxPop = d3.max(series, d => d.pop);
    const span = Math.max(maxPop - minPop, 1);
    const y = d3.scaleLinear()
      .domain([minPop - span * 0.4, maxPop + span * 0.15])
      .range([ih, 0]);

    // Dashed marker at 2001 — the year where the trend bends
    g.append("line")
      .attr("x1", x(2001)).attr("x2", x(2001))
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "#bbb")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.pop))
      .curve(d3.curveMonotoneX);
    g.append("path")
      .datum(series)
      .attr("fill", "none")
      .attr("stroke", "#222")
      .attr("stroke-width", 1.5)
      .attr("d", line);

    g.selectAll("circle.dot")
      .data(series)
      .join("circle")
      .attr("class", "dot")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.pop))
      .attr("r", 1.6)
      .attr("fill", "#222");

    // Value labels at 1961, 2001 (the dip), 2024
    const p1961 = series.find(s => s.year === 1961);
    const p2001 = series.find(s => s.year === 2001);
    const p2024 = series.find(s => s.year === 2024);
    const fmt = v => v >= 100000 ? Math.round(v / 1000) + "k" : v.toLocaleString();

    if (p1961) {
      g.append("text")
        .attr("x", x(1961)).attr("y", y(p1961.pop) - 6)
        .attr("font-size", 9).attr("fill", "#555")
        .text(fmt(p1961.pop));
    }
    if (p2024) {
      g.append("text")
        .attr("x", x(2024)).attr("y", y(p2024.pop) - 6)
        .attr("text-anchor", "end")
        .attr("font-size", 9).attr("fill", "#555")
        .text(fmt(p2024.pop));
    }
    // The inflection point — red dot + value label in red, anchored below.
    if (p2001) {
      g.append("circle")
        .attr("cx", x(2001))
        .attr("cy", y(p2001.pop))
        .attr("r", 3)
        .attr("fill", "#d46780")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);
      g.append("text")
        .attr("x", x(2001)).attr("y", y(p2001.pop) + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 9).attr("font-weight", "600").attr("fill", "#a83a55")
        .text(fmt(p2001.pop));
    }

    g.append("text")
      .attr("x", 0).attr("y", ih + 12)
      .attr("font-size", 9).attr("fill", "#666")
      .text("1961");
    g.append("text")
      .attr("x", iw).attr("y", ih + 12)
      .attr("text-anchor", "end")
      .attr("font-size", 9).attr("fill", "#666")
      .text("2024");
  }

  panel.style.display = "block";
}

// ---- Legend (D3) -------------------------------------------------------
function drawLegend() {
  const el = d3.select("#map_legend");
  el.selectAll("*").remove();
  const W = 280, H = 30;
  const swatchW = W / COLORS.length;
  const svg = el.append("svg")
    .attr("viewBox", `0 0 ${W} ${H + 14}`)
    .attr("width", "100%");
  svg.selectAll("rect")
    .data(COLORS)
    .join("rect")
    .attr("x", (_, i) => i * swatchW)
    .attr("y", 0)
    .attr("width", swatchW)
    .attr("height", H)
    .attr("fill", d => d);
  // Labels for the bin boundaries
  svg.selectAll("text")
    .data(PCT_BINS)
    .join("text")
    .attr("x", (_, i) => (i + 1) * swatchW)
    .attr("y", H + 12)
    .attr("text-anchor", "middle")
    .attr("font-size", 9)
    .attr("fill", "#555")
    .text(d => (d >= 0 ? "+" : "") + d + "%");
}

// ---- Apply a single story step ----------------------------------------
function applyStep(step) {
  const periodChanged = step.yearA !== currentYearA || step.yearB !== currentYearB;
  if (periodChanged) {
    currentYearA = step.yearA;
    currentYearB = step.yearB;
    refreshBins();
    updatePeriodPill();
  }

  map.flyTo({
    center: step.center,
    zoom: step.zoom,
    essential: true,        // play even with prefers-reduced-motion
    duration: 1800,
    speed: 0.9,
    curve: 1.3,
  });

  setHighlight(step.highlight || []);
  setDimMode(step.dim || "off");
  setCountryHighlight(step.countryHighlight || null);

  if (step.multiPopup) {
    showMultiPopup(step.multiPopup);
  } else if (step.popup) {
    showPopup(step.popup);
  } else {
    hidePopup();
  }
}

// ---- Scrollama wiring --------------------------------------------------
function setupScrollama() {
  const scroller = scrollama();
  scroller
    .setup({
      step: "#story .step",
      offset: 0.55,           // trigger when card crosses 55% of viewport
      debug: false,
    })
    .onStepEnter(({ index }) => {
      const step = STEPS[index];
      if (step) applyStep(step);
    });

  window.addEventListener("resize", () => scroller.resize());
}

init();
