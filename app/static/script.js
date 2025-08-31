
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
    return `${DIGIT_INDEX[color]}  ${color} - ${name}`;
  }
  if (kind === "mult"){
    const exp = MULT_EXP[color] ?? 0;
    return `×10^${exp}  ${color} - ${name}`;
  }
  if (kind === "tol"){
    return `${TOL_MAP[color]||"-"}  ${color} - ${name}`;
  }
  if (kind === "temp"){
    return `${TEMPCO_MAP[color]||"-"}  ${color} - ${name}`;
  }
  return `${color} - ${name}`;
}

function contrast(hex){
  // return black or white for contrast
  const h = hex.replace("#","");
  const r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
  const yiq = (r*299 + g*587 + b*114)/1000;
  return yiq >= 200 ? "#111" : "#eee";
}
function option(el, value, label, hex){
  const o = document.createElement("option");
  o.value = value; o.textContent = label;
  if (hex){
    // Try to render a small swatch at left via text color to approximate; fallback is fine
    o.textContent = label; // label already includes digit + name; color the whole line softly
    // Many browsers ignore background on <option>; still set it in case it applies
    o.style.backgroundImage = `linear-gradient(90deg, ${hex} 0 1.2em, transparent 1.2em)`;
    o.style.paddingLeft = "0.4em";
    o.style.borderLeft = `0.8em solid ${hex}`;
  }
  el.appendChild(o);
}

function formatOhms(v){
  if (v >= 1e9) return (v/1e9).toFixed(v%1e9===0?0:3).replace(/\.?0+$/,"")+" GΩ";
  if (v >= 1e6) return (v/1e6).toFixed(v%1e6===0?0:3).replace(/\.?0+$/,"")+" MΩ";
  if (v >= 1e3) return (v/1e3).toFixed(v%1e3===0?0:3).replace(/\.?0+$/,"")+" kΩ";
  return v.toFixed(v%1===0?0:3).replace(/\.?0+$/,"")+" Ω";
}

function defaultToleranceColorFor(bands){
  return (bands===4) ? "ouro" : "marrom";
}
function bandKindAtIndex(i, bands){
  if (bands===4){
    return (i<=1)?"digit": (i===2?"mult":"tol");
  } else if (bands===5){
    return (i<=2)?"digit": (i===3?"mult":"tol");
  } else {
    if (i<=2) return "digit";
    if (i===3) return "mult";
    if (i===4) return "tol";
    return "temp";
  }
}
function valueLabelFor(kind, color){
  if (!color || color==="(padrão)" || color==="(nenhum)") return "-";
  if (kind==="digit") return String(DIGIT_INDEX[color]);
  if (kind==="mult")  return "×10^" + (MULT_EXP[color] ?? 0);
  if (kind==="tol")   return (TOL_MAP[color]||"-");
  if (kind==="temp")  return (TEMPCO_MAP[color]||"-");
  return "";
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

let CATALOG = buildCatalog(0.1, 100_000_000);

function parseOhms(text){
  if (!text) return null;
  text = String(text).trim().toLowerCase().replace(/,/g,'.');
  // Formats: "47k", "1m", "330", "4r7", "1 Ω", "1ohm"
  const rMatch = text.match(/^(\d*\.?\d+)\s*r\s*(\d+)?$/i);
  if (rMatch){
    const a = parseFloat(rMatch[1]);
    const b = rMatch[2] ? parseFloat("0."+rMatch[2]) : 0;
    return a + b;
  }
  const m = text.match(/^(\d*\.?\d+)\s*(g|m|k|ω|ohm|ohms|)$/i);
  if (m){
    let v = parseFloat(m[1]);
    const u = m[2];
    if (u==="g") v*=1e9; else if (u==="m") v*=1e6; else if (u==="k") v*=1e3; else v=v;
    return v;
  }
  const n = parseFloat(text);
  if (!isNaN(n)) return n;
  return null;
}
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
  const container = document.getElementById("bands-row");

  function addOptions(sel, opts, kind){
    sel.innerHTML = "";
    opts.forEach(c => option(sel, c, prettyLabel(kind, c), COLORS_HEX[c]));
  }

  const show4 = state.bands === 4;
  const show5 = state.bands === 5;
  const show6 = state.bands === 6;

  addOptions(document.getElementById("c0"), window.COLORS.digit, "digit");
  addOptions(document.getElementById("c1"), window.COLORS.digit, "digit");

  const l2 = document.getElementById("l-c2");
  const c2 = document.getElementById("c2");
  if (show4){ l2.textContent = "Multiplicador"; addOptions(c2, window.COLORS.mult, "mult"); }
  else { l2.textContent = "3º dígito"; addOptions(c2, window.COLORS.digit, "digit"); }

  const l3 = document.getElementById("l-c3");
  const f3 = document.getElementById("f-c3");
  const c3 = document.getElementById("c3");
  if (show4){ l3.textContent = "Tolerância"; addOptions(c3, window.COLORS.tol, "tol"); }
  else { l3.textContent = "Multiplicador"; addOptions(c3, window.COLORS.mult, "mult"); }

  const f4 = document.getElementById("f-c4");
  const c4 = document.getElementById("c4");
  f4.style.display = (show5 || show6) ? "" : "none";
  if (show5 || show6){ addOptions(c4, window.COLORS.tol, "tol"); }

  const f5 = document.getElementById("f-c5");
  const c5 = document.getElementById("c5");
  f5.style.display = show6 ? "" : "none";
  if (show6){ addOptions(c5, window.COLORS.temp, "temp"); }

  const ids = ["c0","c1","c2","c3","c4","c5"];
  ids.forEach((id, idx)=>{
    const el = document.getElementById(id);
    if (!el) return;
    const v = state.colors[idx] ?? el.options[0]?.value;
    if (v){ el.value = v; }
    updateHint(id);
    el.onchange = ()=>{ state.colors[idx] = el.value; updateHint(id); drawBands(); calc(); };
  });

  const bandSel = document.getElementById("band-count");
  if (bandSel){
    bandSel.value = String(state.bands);
    bandSel.onchange = (e)=>{ state.bands = parseInt(e.target.value,10); buildControls(); drawBands(); calc(); };
  }

  const presetSearch = document.getElementById("preset-search");
  const presetMenu = document.getElementById("preset-menu");
  const presetSeries = document.getElementById("preset-series");
  const presetOrder = document.getElementById("preset-order");
  const presetTol = document.getElementById("preset-tol");
  const presetApply = document.getElementById("preset-apply");
  const presetClear = document.getElementById("preset-clear");

  function refreshDatalist(){
    let q = presetSearch ? presetSearch.value : "";
    const looksLikeLabel = /[±()]/.test(q);
    const parsed = parseOhms(q);
    if (!q || looksLikeLabel || (state.selectedPreset && q === state.selectedPreset.label && parsed==null)) q = "";
    const items = filterCatalog({series:presetSeries.value, order:presetOrder.value, query:q});
    presetMenu.innerHTML = "";
    items.slice(0,400).forEach(e=>{
      const div = document.createElement("div");
      div.className = "item";
      const sw = document.createElement("div");
      sw.className = "preset-swatch";
      sw.style.background = "#6d3b13";
      div.appendChild(sw);
      const txt = document.createElement("div");
      txt.textContent = e.label;
      div.appendChild(txt);
      const right = document.createElement("div");
      right.className = "preset-right";
      right.textContent = formatOhms(e.ohms);
      div.appendChild(right);
      div.onmousedown = (ev)=>{
        ev.preventDefault();
        state.selectedPreset = e;
        if (presetSearch) presetSearch.value = e.label;
        applyPresetValue({...e, tolPercent: parseFloat(presetTol.value || e.tolPercent)});
        if (presetMenu) presetMenu.style.display = "none";
        if (presetSearch) presetSearch.blur();
      };
      presetMenu.appendChild(div);
    });
    presetMenu.style.display = (document.activeElement === presetSearch && items.length) ? "block" : "none";
  }

  if (presetSearch){
    presetSearch.onclick = ()=> { refreshDatalist(); if(presetMenu) presetMenu.style.display = "block"; };
    presetSearch.oninput = ()=> refreshDatalist();
    presetSearch.onkeydown = (e)=>{ if (e.key === "Enter"){ e.preventDefault(); applyFromSearch(); } };
    presetSearch.onfocus = ()=> { refreshDatalist(); if(presetMenu) presetMenu.style.display = "block"; };
    presetSearch.onblur = ()=>{ setTimeout(()=>{ if(presetMenu) presetMenu.style.display="none"; }, 80); };
  }
  if (presetSeries) presetSeries.onchange = ()=>{ if(presetMenu) presetMenu.style.display="none"; if(presetSearch) presetSearch.value=""; refreshDatalist(); };
  if (presetOrder) presetOrder.onchange = ()=> refreshDatalist();
  if (presetTol) presetTol.onchange = ()=>{ if (state.selectedPreset){ applyPresetValue({...state.selectedPreset, tolPercent: parseFloat(presetTol.value||state.selectedPreset.tolPercent)}); }};
  if (presetApply) presetApply.onclick = ()=> applyFromSearch();
  if (presetClear) presetClear.onclick = ()=>{ if(presetSearch) presetSearch.value=""; state.selectedPreset=null; refreshDatalist(); };
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
  let labelsGroup = document.getElementById("band-labels");
  if (!labelsGroup){
    labelsGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
    labelsGroup.setAttribute("id","band-labels");
    svg.appendChild(labelsGroup);
  }
  while (labelsGroup.firstChild) labelsGroup.removeChild(labelsGroup.firstChild);

  const startX = 210, endX = 510;
  const span = endX - startX;
  const n = state.bands;
  const bandWidth = 20;

  function kindAt(i){
    if (n===4) return (i<=1)?"digit":(i===2?"mult":"tol");
    if (n===5) return (i<=2)?"digit":(i===3?"mult":"tol");
    return (i<=2)?"digit":(i===3?"mult":(i===4?"tol":"temp"));
  }
  function tolDefault(){ return (n===4)?"ouro":"marrom"; }

  for (let i=0;i<n;i++){
    const x = startX + ((i+0.5) * span / n) - bandWidth/2;
    const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", 60);
    rect.setAttribute("width", bandWidth);
    rect.setAttribute("height", 100);
    rect.setAttribute("rx", 6);
    rect.setAttribute("class", "band");
    let c = state.colors[i];
    const k = kindAt(i);
    if (k==="tol" && (!c || c==="(padrão)")) c = tolDefault();
    if (k==="temp" && (!c || c==="(nenhum)")) c = "sem cor";
    if (!c || c==="(padrão)") c = "preto";
    rect.style.fill = COLORS_HEX[c] || "#000";
    svg.appendChild(rect);
    bandRects.push(rect);

    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x", x + bandWidth/2);
    t.setAttribute("y", 170);
    t.setAttribute("text-anchor","middle");
    t.setAttribute("font-size","12px");
    t.setAttribute("fill", getComputedStyle(document.documentElement).getPropertyValue("--band-label-color").trim() || "#cfd3e1");
    let lbl = "-";
    if (k==="digit") lbl = String(DIGIT_INDEX[c]);
    else if (k==="mult") lbl = "×10^" + (MULT_EXP[c] ?? 0);
    else if (k==="tol") lbl = TOL_MAP[c] || "-";
    else if (k==="temp") lbl = TEMPCO_MAP[c] || "-";
    t.textContent = lbl;
    labelsGroup.appendChild(t);
  }
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


// ======= Keyboard navigation between selects =======
document.addEventListener("keydown", (e)=>{
  const ids = ["c0","c1","c2","c3","c4","c5"].filter(id=>document.getElementById(id));
  const active = document.activeElement;
  const idx = ids.indexOf(active?.id);
  if (idx >= 0){
    if (e.key === "ArrowLeft" && idx > 0){ e.preventDefault(); document.getElementById(ids[idx-1]).focus(); }
    if (e.key === "ArrowRight" && idx < ids.length-1){ e.preventDefault(); document.getElementById(ids[idx+1]).focus(); }
  }
});

// ======= Theme toggle =======
const root = document.documentElement;
function setTheme(t){ root.setAttribute("data-theme", t); localStorage.setItem("theme", t); }
(function initTheme(){
  const saved = localStorage.getItem("theme");
  if (saved) setTheme(saved);
})();
document.getElementById("theme-toggle").onclick = ()=>{
  const cur = root.getAttribute("data-theme") || "dark";
  setTheme(cur==="dark"?"light":"dark");
};
document.addEventListener("keydown", (e)=>{
  if (e.key.toLowerCase() === "t" && (e.ctrlKey || e.metaKey)){
    e.preventDefault();
    document.getElementById("theme-toggle").click();
  }
});


document.addEventListener("click", (e)=>{
  const box = document.querySelector(".preset-dropdown");
  const menu = document.getElementById("preset-menu");
  if (box && menu && !box.contains(e.target)) menu.style.display = "none";
});
const _ps = document.getElementById("preset-search");
if (_ps){
  _ps.addEventListener("focus", ()=>{
    const menu = document.getElementById("preset-menu");
    const ev = new Event("input"); _ps.dispatchEvent(ev);
    menu.style.display = "block";
  });
}


function safeBuild(){
  try { buildControls(); drawBands(); calc(); }
  catch (e){ console.error("Build error:", e); try { drawBands(); } catch(_){} }
}


// === v3.3.3 Label color persistence ===
function applyLabelColor(hex){
  if (!hex) return;
  document.documentElement.style.setProperty("--band-label-color", hex);
  try{ localStorage.setItem("labelColor", hex); }catch(_){}
}
(function initLabelColor(){
  const input = document.getElementById("label-color");
  const saved = (function(){ try { return localStorage.getItem("labelColor"); } catch(_){ return null; } })();
  if (saved){
    input && (input.value = saved);
    applyLabelColor(saved);
  } else {
    // seed with current computed style so input matches initial theme
    const cur = getComputedStyle(document.documentElement).getPropertyValue("--band-label-color").trim() || "#cfd3e1";
    input && (input.value = cur);
  }
  if (input){
    input.addEventListener("input", (e)=>{
      applyLabelColor(e.target.value);
      // re-draw to ensure new color is applied on current labels
      try { drawBands(); } catch(_){}
    });
  }
})();
