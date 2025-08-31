
const COLORS_HEX = {
  "preto":"#1a1a1a","marrom":"#6d3b13","vermelho":"#c62828","laranja":"#ef6c00",
  "amarelo":"#f9a825","verde":"#2e7d32","azul":"#1565c0","violeta":"#6a1b9a",
  "cinza":"#757575","branco":"#efefef","ouro":"#c6a700","prata":"#b0bec5","sem cor":"transparent"
};

const state = {
  bands: 4,
  colors: ["marrom","preto","preto","(padrão)", "(padrão)", "(nenhum)"] // defaults
};

const topControls = document.getElementById("controls-top");
const svg = document.getElementById("resistor-svg");
let bandRects = [];

function pretty(valType, color) {
  if (!color || color === "(padrão)" || color === "(nenhum)") return "-";
  if (valType === "digit") {
    const idx = window.COLORS.digit.indexOf(color);
    return idx >= 0 ? String(idx) : "-";
  }
  if (valType === "mult") {
    // map to exponent
    const multIndex = window.COLORS.mult.indexOf(color);
    const map = {
      "prata": -2, "ouro": -1, "preto":0, "marrom":1, "vermelho":2, "laranja":3, "amarelo":4,
      "verde":5, "azul":6, "violeta":7, "cinza":8, "branco":9
    };
    const exp = map[color] ?? 0;
    return `×10^${exp}`;
  }
  if (valType === "tol") {
    const map = {"sem cor":"±20%","prata":"±10%","ouro":"±5%","marrom":"±1%","vermelho":"±2%","verde":"±0.5%","azul":"±0.25%","violeta":"±0.10%","cinza":"±0.05%"};
    return map[color] || "-";
  }
  if (valType === "temp") {
    const map = {"marrom":"100 ppm/K","vermelho":"50 ppm/K","laranja":"15 ppm/K","amarelo":"25 ppm/K","azul":"10 ppm/K","violeta":"5 ppm/K"};
    return map[color] || "-";
  }
  return "-";
}

function buildControls() {
  topControls.innerHTML = "";

  // Linha 1: presets + quantidade de faixas
  const row1 = document.createElement("div");
  row1.className = "controls inline";
  row1.innerHTML = `
    <div class="field">
      <label>Pré-sets</label>
      <select id="preset">
        <option value="">— selecione —</option>
      </select>
    </div>
    <div class="field">
      <label>Quantidade de faixas</label>
      <select id="band-count">
        <option value="4">4 faixas</option>
        <option value="5">5 faixas</option>
        <option value="6">6 faixas</option>
      </select>
    </div>`;
  topControls.appendChild(row1);

  // Inputs das faixas (sempre em cima)
  const container = document.createElement("div");
  container.className = "controls";
  const addField = (label, id, options) => {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<label>${label}</label><select id="${id}"></select><div class="hint" id="${id}-hint">-</div>`;
    const sel = f.querySelector("select");
    options.forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c.charAt(0).toUpperCase()+c.slice(1);
      sel.appendChild(o);
    });
    container.appendChild(f);
    return sel;
  };

  if (state.bands === 4) {
    var s1 = addField("1º dígito", "c0", window.COLORS.digit);
    var s2 = addField("2º dígito", "c1", window.COLORS.digit);
    var s3 = addField("Multiplicador", "c2", window.COLORS.mult);
    var s4 = addField("Tolerância", "c3", window.COLORS.tol);
  } else if (state.bands === 5) {
    var s1 = addField("1º dígito", "c0", window.COLORS.digit);
    var s2 = addField("2º dígito", "c1", window.COLORS.digit);
    var s3 = addField("3º dígito", "c2", window.COLORS.digit);
    var s4 = addField("Multiplicador", "c3", window.COLORS.mult);
    var s5 = addField("Tolerância", "c4", window.COLORS.tol);
  } else {
    var s1 = addField("1º dígito", "c0", window.COLORS.digit);
    var s2 = addField("2º dígito", "c1", window.COLORS.digit);
    var s3 = addField("3º dígito", "c2", window.COLORS.digit);
    var s4 = addField("Multiplicador", "c3", window.COLORS.mult);
    var s5 = addField("Tolerância", "c4", window.COLORS.tol);
    var s6 = addField("Tempco (ppm/K)", "c5", window.COLORS.temp);
  }

  topControls.appendChild(container);

  // set values
  const ids = ["c0","c1","c2","c3","c4","c5"];
  ids.forEach((id, idx)=>{
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

  // fill presets options
  const presetSel = document.getElementById("preset");
  window.COLORS.presets.forEach(p=>{
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.label;
    presetSel.appendChild(o);
  });
  presetSel.addEventListener("change", ()=> applyPreset(presetSel.value));

  // band count select
  const bandSel = document.getElementById("band-count");
  bandSel.value = String(state.bands);
  bandSel.addEventListener("change", (e)=>{
    state.bands = parseInt(e.target.value,10);
    buildControls();
    drawBands();
    calc();
  });
}

function updateHint(id){
  const el = document.getElementById(id);
  const hint = document.getElementById(id+"-hint");
  if (!el || !hint) return;
  let valType = "digit";
  if (id === "c2" && state.bands === 4) valType = "mult";
  if (state.bands >= 5 && (id === "c3")) valType = "mult";
  if (state.bands === 6 && id === "c5") valType = "temp";
  if ((state.bands === 4 && id === "c3") || (state.bands >= 5 && id === "c4")) valType = "tol";
  hint.textContent = pretty(valType, el.value);
}

function applyPreset(presetId){
  const p = window.COLORS.presets.find(x=>x.id===presetId);
  if (!p) return;
  state.bands = p.bands;
  // reset colors and apply
  state.colors = ["(padrão)","(padrão)","(padrão)","(padrão)","(padrão)","(nenhum)"];
  p.colors.forEach((c,i)=> state.colors[i]=c);
  buildControls();
  drawBands();
  calc();
}

function drawBands() {
  // remove previous bands
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
  // Compose params
  const params = new URLSearchParams();
  params.set("bands", state.bands);
  for (let i=0;i<state.bands;i++){
    let v = state.colors[i] || "";
    // Don't send placeholders for defaults
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

  // export buttons
  const btnPng = document.getElementById("btn-png");
  const btnPdf = document.getElementById("btn-pdf");
  const q = new URLSearchParams();
  q.set("bands", state.bands);
  for (let i=0;i<state.bands;i++) q.set("c"+i, state.colors[i] || "");
  btnPng.onclick = ()=> window.open("/export/png?"+q.toString(), "_blank");
  btnPdf.onclick = ()=> window.open("/export/pdf?"+q.toString(), "_blank");
}

// init
buildControls();
drawBands();
calc();
