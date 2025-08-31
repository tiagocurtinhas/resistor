
const COLORS_HEX = {
  "preto":"#1a1a1a","marrom":"#6d3b13","vermelho":"#c62828","laranja":"#ef6c00",
  "amarelo":"#f9a825","verde":"#2e7d32","azul":"#1565c0","violeta":"#6a1b9a",
  "cinza":"#757575","branco":"#efefef","ouro":"#c6a700","prata":"#b0bec5","sem cor":"transparent"
};

const state = {
  bands: 4,
  colors: ["preto","preto","preto","marrom", null, null] // defaults (4 faixas; tol marrom = 1% mas será ajustado no backend)
};

const topControls = document.getElementById("controls-top");
const bottomControls = document.getElementById("controls-bottom");
const svg = document.getElementById("resistor-svg");
let bandRects = [];

function buildControls() {
  topControls.innerHTML = "";
  bottomControls.innerHTML = "";
  const holder = (state.bands === 4) ? topControls : bottomControls;

  // Quantidade de faixas (sempre no topo visual)
  const selectorRow = document.createElement("div");
  selectorRow.className = "controls inline";
  const bandField = document.createElement("div");
  bandField.className = "field";
  bandField.innerHTML = `
    <label>Quantidade de faixas</label>
    <select id="band-count">
      <option value="4">4 faixas</option>
      <option value="5">5 faixas</option>
      <option value="6">6 faixas</option>
    </select>`;
  selectorRow.appendChild(bandField);
  // place selector in both control areas to keep easy access
  topControls.appendChild(selectorRow.cloneNode(true));
  bottomControls.appendChild(selectorRow);

  // Inputs das faixas
  const container = document.createElement("div");
  container.className = "controls";

  const addField = (label, id, options) => {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<label>${label}</label><select id="${id}"></select>`;
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

  holder.appendChild(container);

  // set values
  const ids = ["c0","c1","c2","c3","c4","c5"];
  ids.forEach((id, idx)=>{
    const el = document.getElementById(id);
    if (!el) return;
    const v = state.colors[idx] ?? el.options[0]?.value;
    if (v) el.value = v;
    el.addEventListener("change", ()=>{
      state.colors[idx] = el.value;
      drawBands();
      calc();
    });
  });

  // band count select listeners (both copies)
  document.querySelectorAll("#band-count").forEach(sel=>{
    sel.value = String(state.bands);
    sel.addEventListener("change", (e)=>{
      state.bands = parseInt(e.target.value,10);
      // adjust defaults for tolerance when missing (handled server-side too)
      buildControls();
      drawBands();
      calc();
    });
  });
}

function drawBands() {
  // remove previous bands
  bandRects.forEach(r=>r.remove());
  bandRects = [];

  // positions relative to body area (x from 200 to 520 approx)
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

  // recolor on change
  bandRects.forEach((r,i)=>{
    r.setAttribute("fill", COLORS_HEX[state.colors[i] || "preto"]);
  });
}

async function calc(){
  // Compose params
  const params = new URLSearchParams();
  params.set("bands", state.bands);
  for (let i=0;i<state.bands;i++){
    params.set("c"+i, state.colors[i] || "");
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

  // color the bands visibly
  bandRects.forEach((r,i)=>{
    r.setAttribute("fill", COLORS_HEX[state.colors[i] || "preto"]);
  });
}

// init
buildControls();
drawBands();
calc();
