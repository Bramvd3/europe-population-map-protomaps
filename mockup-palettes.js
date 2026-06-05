/* ============================================================
   Mockup — palet-vergelijking.
   Stand-alone, niet ingebed in artikel of scrolly.
   ============================================================ */

const ALL_YEARS = [1961, 1971, 1981, 1991, 2001, 2011, 2021, 2024];

// New bin set — proposal 2. Spreads the extremes so that fewer features
// pile up in the deepest bucket.
const PCT_BINS = [-25, -15, -8, -3, 0, 5, 15, 35, 75];

// ---- Three palette options ------------------------------------------------
// Each is 10 entries: index 0 = deepest decline, index 9 = deepest growth.

const PALETTES = {
  // A — Brown ↔ Teal (FT / Economist style, ColorBrewer BrBG-derived)
  A: [
    "#5a3409",   // deep brown
    "#8c510a",
    "#bf812d",
    "#dfc27d",
    "#f3e3c3",   // pale brown
    "#cfe9e3",   // pale teal
    "#80cdc1",
    "#35978f",
    "#01665e",
    "#003c30",   // deep teal
  ],

  // B — Orange ↔ VRT-purple (ColorBrewer PuOr-derived, growth anchored
  // on VRT's --basevio #5541F0 so the map matches the article)
  B: [
    "#7a3a06",   // deep orange-brown
    "#b35806",
    "#e08214",
    "#fdb863",
    "#fde0b8",   // pale orange
    "#e0d8f9",   // pale purple
    "#b7a4ee",
    "#8a78dc",
    "#6951e6",
    "#5541F0",   // VRT purple
  ],

  // C — Pink ↔ Green (ColorBrewer PiYG, kept close to current red-green
  // but with pink instead of fire-engine red)
  C: [
    "#8e0152",   // deep pink
    "#c51b7d",
    "#de77ae",
    "#f1b6da",
    "#fde0ef",   // pale pink
    "#e6f5d0",   // pale green
    "#b8e186",
    "#7fbc41",
    "#4d9221",
    "#276419",   // deep green
  ],
};

let COLORS = PALETTES.A;        // active palette — switched by the toggle
let palette = "A";
const NO_DATA_COLOR = "rgba(0,0,0,0)";

// ---- State ----------------------------------------------------------------
let yearA = 1961;
let yearB = 2024;
const mode = "pct";             // mockup is fixed to %; abs is hidden
let map;

// ---- Helpers --------------------------------------------------------------
function effectiveYear(props, requested, direction) {
  const k = "pop_" + requested;
  if (props[k] != null) return [requested, props[k]];
  const range = direction < 0
    ? ALL_YEARS.filter(y => y < requested).reverse()
    : ALL_YEARS.filter(y => y > requested);
  for (const y of range) {
    if (props["pop_" + y] != null) return [y, props["pop_" + y]];
  }
  return [requested, null];
}

function getPopExpr(year) {
  if (year === 2024) {
    return ["coalesce", ["get", "pop_2024"], ["get", "pop_2021"]];
  }
  return ["get", "pop_" + year];
}

function buildFillExpr(yA, yB) {
  const popA = getPopExpr(yA);
  const popB = getPopExpr(yB);
  const valExpr = ["*", 100, ["/", ["-", popB, popA], popA]];
  return [
    "case",
    ["any",
      ["==", popA, null],
      ["==", popB, null],
      ["==", popA, 0],
    ], NO_DATA_COLOR,
    [
      "step", valExpr,
      COLORS[0],
      PCT_BINS[0], COLORS[1],
      PCT_BINS[1], COLORS[2],
      PCT_BINS[2], COLORS[3],
      PCT_BINS[3], COLORS[4],
      PCT_BINS[4], COLORS[5],
      PCT_BINS[5], COLORS[6],
      PCT_BINS[6], COLORS[7],
      PCT_BINS[7], COLORS[8],
      PCT_BINS[8], COLORS[9],
    ],
  ];
}

// ---- Protomaps basemap ----------------------------------------------------
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

// ---- Map setup ------------------------------------------------------------
async function init() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  map = new maplibregl.Map({
    container: "map",
    style: buildProtomapsStyle(),
    center: [12, 53],
    zoom: 3.4,
    minZoom: 2,
    maxZoom: 12,
    attributionControl: { compact: true },
  });

  map.on("load", () => {
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

    map.addSource("lau", {
      type: "vector",
      url: "pmtiles://data/lau-scrolly.pmtiles",
    });
    const beforeId = borderLayerId ?? undefined;

    map.addLayer({
      id: "lau-fill",
      type: "fill",
      source: "lau",
      "source-layer": "lau",
      paint: {
        "fill-color": buildFillExpr(yearA, yearB),
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

    map.addLayer({
      id: "lau-hover",
      type: "line",
      source: "lau",
      "source-layer": "lau",
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

    attachInteractions();
    renderToggleSwatches();
    updateLegend();
  });
}

// ---- Re-paint -------------------------------------------------------------
function updateMap() {
  map.setPaintProperty("lau-fill", "fill-color", buildFillExpr(yearA, yearB));
  updateLegend();
}

// ---- Slider ---------------------------------------------------------------
function setupYearSlider() {
  const sliderEl = document.getElementById("year-slider");
  noUiSlider.create(sliderEl, {
    start: [0, ALL_YEARS.length - 1],
    step: 1,
    connect: true,
    range: { min: 0, max: ALL_YEARS.length - 1 },
    margin: 1,
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
  sliderEl.noUiSlider.on("change", (_v, _h, unencoded) => {
    yearA = ALL_YEARS[Math.round(unencoded[0])];
    yearB = ALL_YEARS[Math.round(unencoded[1])];
    updateMap();
    const panel = document.getElementById("chart-panel");
    if (panel.style.display !== "none" && panel.dataset.location) {
      showPopup(panel.dataset.location);
    }
  });
}

// ---- Palette toggle -------------------------------------------------------
function renderToggleSwatches() {
  document.querySelectorAll("#palette-toggle .swatches").forEach((row) => {
    const pal = PALETTES[row.dataset.palette];
    row.innerHTML = "";
    pal.forEach((c) => {
      const s = document.createElement("span");
      s.style.background = c;
      row.appendChild(s);
    });
  });
}

function setPalette(letter) {
  palette = letter;
  COLORS = PALETTES[letter];
  updateMap();
}

// ---- Interactions ---------------------------------------------------------
let hoveredId = null;
let pinnedId = null;

function attachInteractions() {
  map.on("mousemove", "lau-fill", (e) => {
    if (!e.features || e.features.length === 0) return;
    const f = e.features[0];
    const id = f.id;
    if (id === hoveredId) return;
    if (hoveredId != null) {
      map.setFeatureState({ source: "lau", sourceLayer: "lau", id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    map.setFeatureState({ source: "lau", sourceLayer: "lau", id }, { hover: true });
    map.getCanvas().style.cursor = "pointer";
    if (pinnedId == null) showPopup(f);
  });
  map.on("mouseleave", "lau-fill", () => {
    if (hoveredId != null) {
      map.setFeatureState({ source: "lau", sourceLayer: "lau", id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    map.getCanvas().style.cursor = "";
    if (pinnedId == null) setPopupShown(false);
  });
  map.on("click", "lau-fill", (e) => {
    if (!e.features || e.features.length === 0) return;
    pinnedId = e.features[0].id;
    showPopup(e.features[0]);
  });

  setupYearSlider();

  document.querySelectorAll('input[name="palette"]').forEach((inp) => {
    inp.addEventListener("change", (e) => setPalette(e.target.value));
  });

  document.getElementById("close-button").addEventListener("click", (e) => {
    e.preventDefault();
    pinnedId = null;
    setPopupShown(false);
  });
}

// ---- Popup ----------------------------------------------------------------
function showPopup(featureOrGiscoId) {
  let props;
  if (typeof featureOrGiscoId === "string") {
    const matches = map.querySourceFeatures("lau", {
      sourceLayer: "lau",
      filter: ["==", ["get", "gisco_id"], featureOrGiscoId],
    });
    if (!matches[0]) return;
    props = matches[0].properties;
  } else if (featureOrGiscoId && featureOrGiscoId.properties) {
    props = featureOrGiscoId.properties;
  } else {
    return;
  }
  const locationId = props.gisco_id;
  const name = props.name || locationId;
  const panel = document.getElementById("chart-panel");
  panel.dataset.location = locationId;

  const [eya, pa] = effectiveYear(props, yearA, +1);
  const [eyb, pb] = effectiveYear(props, yearB, -1);

  let sentence;
  if (pa == null || pb == null || eya >= eyb) {
    sentence = `<strong>${name}</strong>: geen vergelijkbare data voor deze periode.`;
  } else {
    const delta = (pb - pa) / pa * 100;
    const verb = delta >= 0 ? "groeide" : "daalde";
    const pct = Math.abs(delta).toFixed(1).replace(".", ",");
    sentence = `In <strong>${name}</strong> ${verb} het aantal inwoners met ` +
               `<strong>${pct}%</strong> tussen ${eya} en ${eyb}.`;
  }
  document.getElementById("info-sentence").innerHTML = sentence;

  const series = ALL_YEARS
    .map(y => ({ year: y, pop: props["pop_" + y] }))
    .filter(d => d.pop != null);

  renderTrendChart(series);
  setPopupShown(true);
}

function setPopupShown(shown) {
  document.getElementById("chart-panel").style.display = shown ? "block" : "none";
  document.body.classList.toggle("popup-open", shown);
}

function renderTrendChart(series) {
  const W = 380, H = 120;
  const margin = { top: 15, right: 60, bottom: 20, left: 60 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const container = d3.select("#popup_chart");
  container.selectAll("svg").remove();
  if (series.length < 2) {
    container.append("p").text("Te weinig data.");
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
    .attr("stroke", "#031037")
    .attr("stroke-width", 2)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", line);
  const first = series[0], last = series[series.length - 1];
  g.append("text").attr("class", "endpoint-label").attr("text-anchor", "end")
    .attr("x", x(first.year) - 6).attr("y", y(first.pop) + 4)
    .text(first.pop.toLocaleString("nl-BE"));
  g.append("text").attr("class", "endpoint-label").attr("text-anchor", "start")
    .attr("x", x(last.year) + 6).attr("y", y(last.pop) + 4)
    .text(last.pop.toLocaleString("nl-BE"));
  g.append("circle").attr("r", 3.5).attr("cx", x(first.year)).attr("cy", y(first.pop))
    .attr("fill", "#5541F0").attr("stroke", "#fff").attr("stroke-width", 1.5);
  g.append("circle").attr("r", 3.5).attr("cx", x(last.year)).attr("cy", y(last.pop))
    .attr("fill", "#5541F0").attr("stroke", "#fff").attr("stroke-width", 1.5);
}

// ---- Legend ---------------------------------------------------------------
function updateLegend() {
  const container = d3.select("#map_legend");
  container.selectAll("svg").remove();
  const W = 300, H = 24;
  const bandW = W / COLORS.length;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block");
  COLORS.forEach((c, i) => {
    svg.append("rect")
      .attr("x", i * bandW).attr("y", 0)
      .attr("width", bandW).attr("height", 6)
      .attr("fill", c);
  });
  for (let i = 0; i < PCT_BINS.length; i++) {
    const x = (i + 1) * bandW;
    const v = PCT_BINS[i];
    const txt = (v > 0 ? "+" : "") + v + "%";
    svg.append("text")
      .attr("class", "legend-number")
      .attr("text-anchor", "middle")
      .attr("x", x).attr("y", 17)
      .text(txt);
  }
}

// ---- Go -------------------------------------------------------------------
init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="padding:1rem;background:#fee;color:#900;">Failed to load: ${err.message}</div>`);
});
