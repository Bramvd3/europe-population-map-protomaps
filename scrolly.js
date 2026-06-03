/* ============================================================
   Scrollytelling controller — Option C edition.

   Compared to the interactive embed (which uses lau.pmtiles + data.json),
   this scrolly uses lau-scrolly.pmtiles. That PMTiles has every LAU's full
   1961–2024 population series baked in as feature properties, so we can:
     * compute the choropleth's bin entirely in the paint expression
       (no JS-side feature-state, no refreshBins iterating 107k LAUs)
     * read the popup chart's data straight off feature.properties
     * skip the 17 MB data.json fetch altogether — no loading overlay
   The price is a heavier PMTiles file (93 MB vs 44), but the browser only
   fetches the byte-ranges for tiles currently in view, so the actual data
   over the wire is smaller than the data.json+lau.pmtiles combo.
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
// drive the choropleth period; center/zoom drive the camera; highlight is an
// array of gisco_ids that get a thick dark outline; multiPopup is an array of
// gisco_ids → row of mini line charts with a marker at year 2001.
//
// dim mode:    "off" | "belgium" | "belgium-lux"
// countryHighlight: ISO-3 country code (e.g. "LUX") to thickly outline
// transition:  "fly" (default) | "jump" for instant cross-continent cuts
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

const STEPS = [
  { yearA: 1961, yearB: 2024, center: [5, 51],     zoom: 5.5, highlight: [],            popup: null, dim: "off",         countryHighlight: null },
  { yearA: 1961, yearB: 2001, center: [4.6, 50.7],  zoom: 7.2, highlight: BIG_CITIES,    popup: null, dim: "belgium",     countryHighlight: null },
  { yearA: 1961, yearB: 2001, center: [4.40, 50.85],zoom: 9.0, highlight: LLN_AREA,      popup: null, dim: "belgium",     countryHighlight: null },
  { yearA: 1961, yearB: 2001, center: [5.15, 51.20],zoom: 8.4, highlight: KEMPEN_LIMBURG,popup: null, dim: "belgium",     countryHighlight: null },
  { yearA: 1961, yearB: 2001, center: [2.85, 50.90],zoom: 9.5, highlight: WESTHOEK,      popup: null, dim: "belgium",     countryHighlight: null },
  { yearA: 2001, yearB: 2024, center: [4.6, 50.7],  zoom: 7.2, highlight: BIG_CITIES,    popup: null, dim: "belgium",     countryHighlight: null },
  { yearA: 2001, yearB: 2024, center: [4.6, 50.7],  zoom: 7.2, highlight: THREE_BIG,     popup: null, dim: "belgium",     countryHighlight: null, multiPopup: THREE_BIG },
  { yearA: 2001, yearB: 2024, center: [5.85, 49.83],zoom: 8.5, highlight: BE_LUX,        popup: null, dim: "belgium",     countryHighlight: "LUX" },
  { yearA: 2001, yearB: 2024, center: [4.6, 50.7],  zoom: 7.5, highlight: [],            popup: null, dim: "belgium",     countryHighlight: null },
  { yearA: 2001, yearB: 2024, center: [6, 49.5],    zoom: 5.8, highlight: [],            popup: null, dim: "off",         countryHighlight: null },
  { yearA: 2001, yearB: 2024, center: [-3.8, 40.5], zoom: 5.4, highlight: [],            popup: null, dim: "off",         countryHighlight: null, transition: "jump" },
  { yearA: 2001, yearB: 2024, center: [25, 56.5],   zoom: 5.3, highlight: [],            popup: null, dim: "off",         countryHighlight: null, transition: "jump" },
];

// ---- State --------------------------------------------------------------
let currentYearA = STEPS[0].yearA;
let currentYearB = STEPS[0].yearB;
let map;
// Embedded mode (when scrolly.html is loaded inside an article iframe with
// ?embed=1). In that mode we hide the internal text cards and the period
// pill, and let the parent article drive applyStep() via postMessage.
const IS_EMBEDDED = new URLSearchParams(location.search).get("embed") === "1";

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

// ---- The fill expression ------------------------------------------------
// Pure paint-expression bin computation: takes pop_yearA / pop_yearB straight
// from feature properties, computes pct, then steps through PCT_BINS to pick
// a colour. setPaintProperty('lau-fill', 'fill-color', buildFillExpr(...))
// is the only thing we need to do when the period changes — no JS loop over
// 107k features, no feature-state.
function buildFillExpr(yearA, yearB) {
  const kA = "pop_" + yearA;
  const kB = "pop_" + yearB;
  const pctExpr = [
    "*",
    100,
    ["/", ["-", ["get", kB], ["get", kA]], ["get", kA]],
  ];
  return [
    "case",
    // Missing-data fall-through → transparent (basemap shows through)
    ["any",
      ["==", ["get", kA], null],
      ["==", ["get", kB], null],
      ["==", ["get", kA], 0],
    ], NO_DATA_COLOR,
    // step(pct, COLORS[0], -8, COLORS[1], -6, COLORS[2], …)
    [
      "step", pctExpr,
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

// ---- Init ---------------------------------------------------------------
async function init() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  buildPeriodTicks();

  map = new maplibregl.Map({
    container: "map",
    style: buildProtomapsStyle(),
    center: STEPS[0].center,
    zoom: STEPS[0].zoom,
    minZoom: 2,
    maxZoom: 12,
    interactive: false,
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

    // Scrolly-specific LAU source — properties include pop_1961…pop_2024.
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
        "fill-color": buildFillExpr(currentYearA, currentYearB),
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

    // Dim overlay — translucent white over non-focused countries.
    map.addLayer({
      id: "lau-dim",
      type: "fill",
      source: "lau",
      "source-layer": "lau",
      filter: ["!=", ["slice", ["get", "gisco_id"], 0, 3], "ZZ_"],
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": 0.78,
      },
      layout: { visibility: "none" },
    }, beforeId);

    // Highlight layer — filter-based. setHighlight() updates the filter to
    // contain the focus gisco_ids; no feature-state needed.
    map.addLayer({
      id: "lau-highlight",
      type: "line",
      source: "lau",
      "source-layer": "lau",
      filter: ["in", ["get", "gisco_id"], ["literal", []]],
      paint: {
        "line-color": "#1c1c1c",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          5, 1.2, 8, 2.0, 11, 2.5,
        ],
      },
    }, beforeId);

    // Country highlight — Protomaps' boundaries source-layer filtered to a
    // single ISO-3 code (e.g. "LUX").
    map.addLayer({
      id: "country-highlight",
      type: "line",
      source: "protomaps",
      "source-layer": "boundaries",
      filter: ["all",
        ["<=", ["get", "kind_detail"], 2],
        ["==", ["get", "brk_a3"], "ZZZ"],
      ],
      paint: {
        "line-color": "#1c1c1c",
        "line-width": 3,
      },
      layout: { visibility: "none" },
    }, beforeId);

    drawLegend();
    updatePeriodPill();

    // No preload overlay. The map shows step 0 immediately; tiles for later
    // steps stream in as the user scrolls. The slow flyTo speed (0.5) gives
    // MapLibre time to keep up.
    applyStep(STEPS[0]);

    if (IS_EMBEDDED) {
      // Embedded mode: hide internal cards + period pill, listen for the
      // parent article's step events via postMessage.
      document.body.classList.add("embedded");
      window.addEventListener("message", (event) => {
        if (event.data?.type === "step" && typeof event.data.index === "number") {
          const step = STEPS[event.data.index];
          if (step) applyStep(step);
        }
      });
    } else {
      setupScrollama();
    }
  });
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

// ---- Highlight management (now filter-based, not feature-state) ------
function setHighlight(giscoIds) {
  map.setFilter("lau-highlight", [
    "in", ["get", "gisco_id"], ["literal", giscoIds || []],
  ]);
}

// ---- Period pill (top-center) ------------------------------------------
function buildPeriodTicks() {
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

// ---- Popup (queries feature properties — no data.json) -----------------
// Look up the population series for a gisco_id by querying the LAU source.
// Returns null if the feature isn't in any loaded tile yet.
function getLauProperties(giscoId) {
  const features = map.querySourceFeatures("lau", {
    sourceLayer: "lau",
    filter: ["==", ["get", "gisco_id"], giscoId],
  });
  return features[0]?.properties || null;
}

function hidePopup() {
  const panel = document.getElementById("chart-panel");
  panel.style.display = "none";
  panel.classList.remove("multi");
}

function showMultiPopup(giscoIds) {
  const panel = document.getElementById("chart-panel");
  panel.classList.add("multi");

  // Resolve the LAU props for every requested city. If a tile isn't loaded
  // yet we just skip that one (rare; we always fly first, then call this).
  const cities = giscoIds
    .map(id => {
      const p = getLauProperties(id);
      if (!p) return null;
      const name = (p.name || id).split(" / ")[0];
      const series = ALL_YEARS
        .map(y => ({ year: y, pop: p["pop_" + y] }))
        .filter(d => d.pop != null && d.pop !== 0);
      return series.length ? { name, series } : null;
    })
    .filter(Boolean);

  const cityNames = cities.map(c => c.name).join(", ");
  document.getElementById("info-sentence").innerHTML =
    `<strong>${cityNames}</strong>: drie steden, één patroon. ` +
    `De daling tot rond 2000, dan een duidelijke knik omhoog.`;

  d3.select("#popup_chart").selectAll("*").remove();
  const row = d3.select("#popup_chart")
    .append("div")
    .style("display", "flex")
    .style("gap", "10px");

  for (const { name, series } of cities) {
    const cell = row.append("div").style("flex", "1").style("min-width", "0");
    cell.append("div")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("margin-bottom", "2px")
      .text(name);

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

    const minPop = d3.min(series, d => d.pop);
    const maxPop = d3.max(series, d => d.pop);
    const span = Math.max(maxPop - minPop, 1);
    const y = d3.scaleLinear()
      .domain([minPop - span * 0.4, maxPop + span * 0.15])
      .range([ih, 0]);

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
    // Single paint-property update re-evaluates the fill for every visible
    // LAU. No more refreshBins() iterating all 107k features.
    map.setPaintProperty("lau-fill", "fill-color", buildFillExpr(currentYearA, currentYearB));
    updatePeriodPill();
  }

  // On mobile, zoom out a notch so the same geographical area still fits
  // comfortably in the narrower viewport. Without this, a step tuned for
  // a 1280px desktop renders as "way too zoomed in" on a 375px phone.
  // The breakpoint matches article.css's @media (max-width: 720px) rule.
  const isMobile = window.innerWidth <= 720;
  const zoom = isMobile ? Math.max(3.8, step.zoom - 1.3) : step.zoom;

  if (step.transition === "jump") {
    map.jumpTo({ center: step.center, zoom });
  } else {
    map.flyTo({
      center: step.center,
      zoom,
      essential: true,
      speed: 0.5,
      curve: 1.42,
    });
  }

  setHighlight(step.highlight || []);
  setDimMode(step.dim || "off");
  setCountryHighlight(step.countryHighlight || null);

  if (step.multiPopup) {
    // Defer the popup a frame so the just-issued flyTo has a chance to start
    // loading the new tiles → properties available when we query.
    setTimeout(() => showMultiPopup(step.multiPopup), 200);
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
      offset: 0.55,
      debug: false,
    })
    .onStepEnter(({ index }) => {
      const step = STEPS[index];
      if (step) applyStep(step);
    });

  window.addEventListener("resize", () => scroller.resize());
}

init();
