
// ======= Color tables =======
const COLORS_HEX = {
  "preto":"#1a1a1a","marrom":"#6d3b13","vermelho":"#c62828","laranja":"#ef6c00",
  "amarelo":"#f9a825","verde":"#2e7d32","azul":"#1565c0","violeta":"#6a1b9a",
  "cinza":"#757575","branco":"#efefef","ouro":"#c6a700","prata":"#b0bec5","sem cor":"transparent"
};

const DIGIT_INDEX = Object.fromEntries(window.COLORS.digit.map((c,i)=>[c,i]));
const MULT_EXP = {"prata":-2,"ouro":-1,"preto":0,"marrom":1,"vermelho":2,"laranja":3,"amarelo":4,"verde":5,"azul":6,"violeta":7,"cinza":8,"branco":9};
const TOL_MAP = {"sem cor":"±20%","prata":"±10%","ouro":"±5%","marrom":"±1%","vermelho":"±2%","verde":"±0.5%","azul":"±0.25%","violeta":"±0.10%","cinza":"±0.05%"};
const TEMPCO_MAP = {"marrom":"100 ppm/K","vermelho":"50 ppm/K","laranja":"15 ppm/K","amarelo":"25 ppm/K","azul":"10 ppm/K","violeta":"5 ppm/K"};

const state = {
  bands: 4,
  colors: ["marrom","preto","preto","(padrão)", "(padrão)", "(nenhum)"], // defaults
  selectedPreset: null // {ohms, label, series, tolPercent, bands}
};

const topControls = document.getElementById("controls-top");
const svg = document.getElementById("resistor-svg");
let bandRects = [];

// ======= Helpers =======
function prettyLabel(kind, color){
  if (!color || color === "(padrão)" || color === "(nenhum)") return "-";
  const name = color.charAt(0).toUpperCase()+color.slice(1);
  if (kind === "digit"){
    return `[${DIGIT_INDEX[color]}] ${color} - ${name}`;
  }
  if (kind === "mult"){
    const exp = MULT_EXP[color] ?? 0;
    return `[×10^${exp}] ${color} - ${name}`;
  }
  if (kind === "tol"){
    return `[${TOL_MAP[color]||"-"}] ${color} - ${name}`;
  }
  if (kind === "temp"){
    return `[${TEMPCO_MAP[color]||"-"}] ${color} - ${name}`;
  }
  return `${color} - ${name}`;
}

function option(el, value, label){
  const o = document.createElement("option");
  o.value = value; o.textContent = label;
  el.appendChild(o);
}

function formatOhms(v){
  if (v >= 1e9) return (v/1e9).toFixed(v%1e9===0?0:3).replace(/\.?0+$/,"")+" GΩ";
  if (v >= 1e6) return (v/1e6).toFixed(v%1e6===0?0:3).replace(/\.?0+$/,"")+" MΩ";
  if (v >= 1e3) return (v/1e3).toFixed(v%1e3===0?0:3).replace(/\.?0+$/,"")+" kΩ";
  return v.toFixed(v%1===0?0:3).replace(/\.?0+$/,"")+" Ω";
}

// ======= E-series generation =======
function roundToSig(x, sig){
  if (x === 0) return 0;
  const mult = Math.pow(10, sig - Math.ceil(Math.log10(Math.abs(x))));
  return Math.round(x * mult) / mult;
}
function eSeriesBase(N){
  // IEC 60063 approximation
  const sig = (N<=6)?1:(N<=48?2:3);
  const arr = [];
  for (let i=0;i<N;i++){
    let v = Math.pow(10, i/N);
    v = roundToSig(v, sig);
    if (v >= 1 && v < 10) arr.push(v);
  }
  // de-dup near-equal
  const unique = [];
  arr.forEach(v=>{
    if (!unique.some(u=>Math.abs(u-v)<1e-6)) unique.push(v);
  });
  return unique;
}
const SERIES_DEFAULTS = {
  "E6": {N:6,  tol:20, bands:4},
  "E12":{N:12, tol:10, bands:4},
  "E24":{N:24, tol:5,  bands:4},
  "E48":{N:48, tol:2,  bands:5},
  "E96":{N:96, tol:1,  bands:5},
  "E192":{N:192,tol:0.5,bands:5}
};

function buildCatalog(minOhm=0.1, maxOhm=10_000_000){
  const entries = [];
  for (const [series, cfg] of Object.entries(SERIES_DEFAULTS)){
    const base = eSeriesBase(cfg.N);
    const tol = cfg.tol;
    const bands = cfg.bands;
    // decades
    for (let d=-1; d<=7; d++){
      const decade = Math.pow(10, d);
      base.forEach(m=>{
        const ohms = m * decade;
        if (ohms < minOhm - 1e-9 || ohms > maxOhm + 1e-9) return;
        // normalize small floating noise
        const ohmsN = parseFloat(ohms.toPrecision(8));
        const label = `${formatOhms(ohmsN)} ±${tol}% (${series})`;
        entries.push({ohms: ohmsN, series, tolPercent: tol, bands, label});
      });
    }
  }
  // de-dup values that can appear across series (same nominal)
  // Keep the entry with the TIGHTEST tolerance by default higher priority
  entries.sort((a,b)=> a.ohms===b.ohms ? a.tolPercent-b.tolPercent : a.ohms-b.ohms);
  const uniques = [];
  for (const e of entries){
    const k = e.ohms.toFixed(6);
    if (!uniques.some(u=>u.ohms.toFixed(6)===k)) uniques.push(e);
    else uniques.push(e); // keep all; filtering by series will handle views
  }
  return entries;
}

let CATALOG = buildCatalog();

function filterCatalog({series="", order="asc", query=""}){
  let arr = CATALOG.slice();
  if (series) arr = arr.filter(e=>e.series===series);
  if (query){
    const q = query.replace(/Ω|ohms?/gi,"").trim().toLowerCase();
    arr = arr.filter(e=> formatOhms(e.ohms).toLowerCase().includes(q));
  }
  arr.sort((a,b)=> order==="asc" ? a.ohms-b.ohms : b.ohms-a.ohms);
  return arr;
}

// ======= Build UI =======
function buildControls() {
  // Build the selectors row(s) after the preset UI already in HTML
  const container = document.createElement("div");
  container.className = "controls";

  const addField = (label, id, options, kind) => {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<label>${label}</label><select id="${id}"></select><div class="hint" id="${id}-hint">-</div>`;
    const sel = f.querySelector("select");
    options.forEach(c => option(sel, c, prettyLabel(kind, c)));
    container.appendChild(f);
    return sel;
  };

  // Remove old container (if any)
  const old = topControls.querySelector(".controls:not(#preset-ui)");
  if (old) old.remove();

  let s1,s2,s3,s4,s5,s6;
  if (state.bands === 4) {
    s1 = addField("1º dígito", "c0", window.COLORS.digit, "digit");
    s2 = addField("2º dígito", "c1", window.COLORS.digit, "digit");
    s3 = addField("Multiplicador", "c2", window.COLORS.mult, "mult");
    s4 = addField("Tolerância", "c3", window.COLORS.tol, "tol");
  } else if (state.bands === 5) {
    s1 = addField("1º dígito", "c0", window.COLORS.digit, "digit");
    s2 = addField("2º dígito", "c1", window.COLORS.digit, "digit");
    s3 = addField("3º dígito", "c2", window.COLORS.digit, "digit");
    s4 = addField("Multiplicador", "c3", window.COLORS.mult, "mult");
    s5 = addField("Tolerância", "c4", window.COLORS.tol, "tol");
  } else {
    s1 = addField("1º dígito", "c0", window.COLORS.digit, "digit");
    s2 = addField("2º dígito", "c1", window.COLORS.digit, "digit");
    s3 = addField("3º dígito", "c2", window.COLORS.digit, "digit");
    s4 = addField("Multiplicador", "c3", window.COLORS.mult, "mult");
    s5 = addField("Tolerância", "c4", window.COLORS.tol, "tol");
    s6 = addField("Tempco (ppm/K)", "c5", window.COLORS.temp, "temp");
  }
  topControls.appendChild(container);

  // set values
  ["c0","c1","c2","c3","c4","c5"].forEach((id, idx)=>{
    const el = document.getElementById(id);
    if (!el) return;
    const v = state.colors[idx] ?? el.options[0]?.value;
    if (v) el.value = v;
    updateHint(id);
    el.addEventListener("change", ()=>{
      state.colors[idx] = el.value;
      updateHint(id);
      drawBands();
      calc();
    });
  });

  // Wire band count selector
  const bandSel = document.getElementById("band-count");
  bandSel.value = String(state.bands);
  bandSel.addEventListener("change", (e)=>{
    state.bands = parseInt(e.target.value,10);
    buildControls();
    drawBands();
    calc();
  });

  // Preset UI
  const presetSearch = document.getElementById("preset-search");
  const presetList = document.getElementById("preset-list");
  const presetSeries = document.getElementById("preset-series");
  const presetOrder = document.getElementById("preset-order");
  const presetApply = document.getElementById("preset-apply");
  const presetClear = document.getElementById("preset-clear");

  function refreshDatalist(){
    // Rebuild datalist items from filtered catalog
    presetList.innerHTML = "";
    const items = filterCatalog({series:presetSeries.value, order:presetOrder.value, query:presetSearch.value});
    items.slice(0,500).forEach(e=>{
      const opt = document.createElement("option");
      opt.value = e.label; // show label
      opt.dataset.ohms = e.ohms;
      opt.dataset.series = e.series;
      opt.dataset.tol = e.tolPercent;
      opt.dataset.bands = e.bands;
      presetList.appendChild(opt);
    });
  }
  presetSearch.addEventListener("input", refreshDatalist);
  presetSeries.addEventListener("change", refreshDatalist);
  presetOrder.addEventListener("change", refreshDatalist);
  refreshDatalist();

  presetApply.onclick = ()=>{
    const label = presetSearch.value;
    // Find closest match in current filtered set
    const items = filterCatalog({series:presetSeries.value, order:presetOrder.value, query:label});
    if (!items.length) return;
    const p = items[0];
    state.selectedPreset = p;
    // Apply to bands/colors
    applyPresetValue(p);
  };
  presetClear.onclick = ()=>{
    presetSearch.value = "";
    state.selectedPreset = null;
    refreshDatalist();
  };
}

function updateHint(id){
  const el = document.getElementById(id);
  const hint = document.getElementById(id+"-hint");
  if (!el || !hint) return;
  let kind = "digit";
  if (id === "c2" && state.bands === 4) kind = "mult";
  if (state.bands >= 5 && (id === "c3")) kind = "mult";
  if ((state.bands === 4 && id === "c3") || (state.bands >= 5 && id === "c4")) kind = "tol";
  if (state.bands === 6 && id === "c5") kind = "temp";
  hint.textContent = prettyLabel(kind, el.value);
}

// ======= Applying preset to bands/colors =======
function encodeBandsFromValue(ohms, bands, tolPercent){
  // scientific notation: ohms = m * 10^e, with 1<=m<10
  const e = Math.floor(Math.log10(ohms));
  const m = ohms / Math.pow(10, e);
  const digitCount = (bands===4)?2:3;
  const sig = Math.pow(10, digitCount-1);
  let digits = Math.round(m * sig); // 2 or 3 significant digits
  let exp = e - (digitCount-1);
  if (digits === Math.pow(10, digitCount)){ // rollover (e.g., 9.99 -> 10.0)
    digits = Math.pow(10, digitCount-1);
    exp += 1;
  }
  const digs = String(digits).padStart(digitCount, "0").split("").map(d=>parseInt(d,10));
  // map to colors
  const DIG_COLORS = ["preto","marrom","vermelho","laranja","amarelo","verde","azul","violeta","cinza","branco"];
  const EXP_COLOR = Object.entries(MULT_EXP).find(([c,val])=> val===exp)?.[0] ?? "preto";
  // tolerance color
  const tolColor = tolPercent<=0.1 ? "violeta"
                   : tolPercent<=0.25 ? "azul"
                   : tolPercent<=0.5 ? "verde"
                   : tolPercent<=1 ? "marrom"
                   : tolPercent<=2 ? "vermelho"
                   : tolPercent<=5 ? "ouro"
                   : tolPercent<=10 ? "prata"
                   : "sem cor";
  if (bands === 4){
    return [DIG_COLORS[digs[0]], DIG_COLORS[digs[1]], EXP_COLOR, tolColor];
  } else {
    return [DIG_COLORS[digs[0]], DIG_COLORS[digs[1]], DIG_COLORS[digs[2]], EXP_COLOR, tolColor];
  }
}

function applyPresetValue(preset){
  // Switch bands according to preset default
  state.bands = preset.bands;
  const cols = encodeBandsFromValue(preset.ohms, state.bands, preset.tolPercent);
  // Fill colors into state (6 slots)
  state.colors = ["(padrão)","(padrão)","(padrão)","(padrão)","(padrão)","(nenhum)"];
  cols.forEach((c,i)=> state.colors[i]=c);
  buildControls();
  drawBands();
  calc();
}

// ======= Drawing and calculation =======
function drawBands() {
  bandRects.forEach(r=>r.remove());
  bandRects = [];

  const startX = 210, endX = 510;
  const span = endX - startX;
  const n = state.bands;
  const bandWidth = 20;
  for (let i=0; i<n; i++){
    const x = startX + ((i+0.5) * span / n) - bandWidth/2;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", 60);
    rect.setAttribute("width", bandWidth);
    rect.setAttribute("height", 100);
    rect.setAttribute("rx", 6);
    rect.setAttribute("class", "band");
    const color = state.colors[i] || "preto";
    rect.setAttribute("fill", COLORS_HEX[color] || "#000");
    svg.appendChild(rect);
    bandRects.push(rect);
  }
  bandRects.forEach((r,i)=> r.setAttribute("fill", COLORS_HEX[state.colors[i] || "preto"]));
}

async function calc(){
  const params = new URLSearchParams();
  params.set("bands", state.bands);
  for (let i=0;i<state.bands;i++){
    let v = state.colors[i] || "";
    if ((i === 3 && state.bands === 4) || (i === 4 && state.bands >=5)) {
      if (v === "(padrão)") v = "";
    }
    if (i === 5 && state.bands === 6 && v === "(nenhum)") v = "";
    params.set("c"+i, v);
  }
  const res = await fetch("/api/calc?"+params.toString());
  const data = await res.json();
  const valueEl = document.querySelector("#result .value");
  const tolEl = document.querySelector("#result .tolerance");
  const rangeEl = document.querySelector("#result .range");
  const tempLine = document.getElementById("tempco-line");
  if (data.error){
    valueEl.textContent = "Erro: " + data.error;
    tolEl.textContent = "—";
    rangeEl.textContent = "—";
    tempLine.style.display = "none";
    return;
  }
  valueEl.textContent = data.text_value;
  tolEl.textContent = `Tolerância: ±${data.tolerance_percent}%`;
  rangeEl.textContent = `Faixa: ${data.min_text} — ${data.max_text}`;
  if (state.bands === 6 && data.tempco_ppm){
    tempLine.style.display = "block";
    tempLine.textContent = `Tempco: ${data.tempco_ppm} ppm/K`;
  } else {
    tempLine.style.display = "none";
  }

  bandRects.forEach((r,i)=> r.setAttribute("fill", COLORS_HEX[state.colors[i] || "preto"]));

  // export buttons (include origin if preset selected)
  const btnPng = document.getElementById("btn-png");
  const btnPdf = document.getElementById("btn-pdf");
  const q = new URLSearchParams();
  q.set("bands", state.bands);
  for (let i=0;i<state.bands;i++) q.set("c"+i, state.colors[i] || "");
  if (state.selectedPreset){
    q.set("origin", `${state.selectedPreset.series} (±${state.selectedPreset.tolPercent}%)`);
  }
  btnPng.onclick = ()=> window.open("/export/png?"+q.toString(), "_blank");
  btnPdf.onclick = ()=> window.open("/export/pdf?"+q.toString(), "_blank");
}

// ======= Init =======
buildControls();
drawBands();
calc();
