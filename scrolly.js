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
const STEPS = [
  // 0 — Intro (Europe overview, no highlight)
  {
    yearA: 1961, yearB: 2024,
    center: [10, 51], zoom: 3.4,
    highlight: [],
    popup: null,
  },
  // 1 — 1961→2001, BE big cities all red
  {
    yearA: 1961, yearB: 2001,
    center: [4.6, 50.7], zoom: 7.2,
    highlight: ["BE_44021", "BE_11002", "BE_21004", "BE_62063", "BE_52011"],
    popup: null,
  },
  // 2 — Louvain-la-Neuve area
  {
    yearA: 1961, yearB: 2001,
    center: [4.62, 50.65], zoom: 9.2,
    highlight: [
      "BE_25121",  // Ottignies-Louvain-la-Neuve
      "BE_25018",  // Chaumont-Gistoux
      "BE_25068",  // Mont-Saint-Guibert
      "BE_25112",  // Wavre
      "BE_25023",  // Court-Saint-Etienne
      "BE_25091",  // Rixensart
      "BE_25119",  // Lasne
      "BE_25124",  // Walhain
      "BE_25031",  // Genappe
    ],
    popup: null,
  },
  // 3 — Kempen + Limburg (growth corridors)
  {
    yearA: 1961, yearB: 2001,
    center: [5.15, 51.20], zoom: 8.4,
    highlight: [
      // Kempen (arr. Turnhout)
      "BE_13031","BE_13046","BE_13019","BE_13017","BE_13004","BE_13023",
      "BE_13010","BE_13029","BE_13049","BE_13035",
      // Limburg
      "BE_71067","BE_72039","BE_72042","BE_72020","BE_71011","BE_71070",
      "BE_71057","BE_71066","BE_72043","BE_72038",
    ],
    popup: null,
  },
  // 4 — Westhoek (decline)
  {
    yearA: 1961, yearB: 2001,
    center: [2.85, 50.90], zoom: 9.5,
    highlight: [
      "BE_32030","BE_33041","BE_33016","BE_33039","BE_33021",
      "BE_33029","BE_37012","BE_32003","BE_32006","BE_32011",
    ],
    popup: null,
  },
  // 5 — Switch to 2001→2024, BE cities all turn green
  {
    yearA: 2001, yearB: 2024,
    center: [4.6, 50.7], zoom: 7.2,
    highlight: ["BE_44021", "BE_11002", "BE_21004", "BE_62063", "BE_52011"],
    popup: null,
  },
  // 6 — Zoom on Antwerpen + auto-open D3 chart to show the "knik" at 2001
  {
    yearA: 2001, yearB: 2024,
    center: [4.41, 51.22], zoom: 10.5,
    highlight: ["BE_11002"],
    popup: "BE_11002",
  },
  // 7 — Belgian Luxembourg, Grand Duchy effect
  {
    yearA: 2001, yearB: 2024,
    center: [5.55, 49.85], zoom: 9.3,
    highlight: [
      "BE_84033","BE_82036","BE_81013","BE_81003","BE_82005",
      "BE_82009","BE_85039","BE_84043","BE_84077","BE_83055",
    ],
    popup: null,
  },
  // 8 — Whole Belgium, mostly light green, no specific highlight
  {
    yearA: 2001, yearB: 2024,
    center: [4.6, 50.7], zoom: 7.5,
    highlight: [],
    popup: null,
  },
  // 9 — Zoom out to neighbours (FR, DE visible)
  {
    yearA: 2001, yearB: 2024,
    center: [6, 49.5], zoom: 5.8,
    highlight: [],
    popup: null,
  },
  // 10 — Iberia
  {
    yearA: 2001, yearB: 2024,
    center: [-3.8, 40.5], zoom: 5.4,
    highlight: [],
    popup: null,
  },
  // 11 — Baltic states
  {
    yearA: 2001, yearB: 2024,
    center: [25, 56.5], zoom: 5.3,
    highlight: [],
    popup: null,
  },
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

// ---- Init ---------------------------------------------------------------
async function init() {
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

    // First refreshBins after LAU source has actually loaded (avoids the
    // first-paint feature-state race; same logic as the main embed).
    function onceLauLoaded(e) {
      if (e.sourceId !== "lau" || !map.isSourceLoaded("lau")) return;
      map.off("sourcedata", onceLauLoaded);
      refreshBins();
      map.triggerRepaint();
      // Apply the very first step now that everything is ready
      applyStep(STEPS[0]);
      setupScrollama();
    }
    if (map.isSourceLoaded("lau")) {
      refreshBins();
      map.triggerRepaint();
      applyStep(STEPS[0]);
      setupScrollama();
    } else {
      map.on("sourcedata", onceLauLoaded);
    }

    drawLegend();
  });
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
  document.getElementById("chart-panel").style.display = "none";
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

  if (step.popup) showPopup(step.popup);
  else hidePopup();
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
