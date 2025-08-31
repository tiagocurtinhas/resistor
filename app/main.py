
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional, List, Dict, Tuple

app = FastAPI(title="Calculadora de Cores de Resistores")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# Tabelas de cores
DIGIT = {
    "preto": 0, "marrom": 1, "vermelho": 2, "laranja": 3, "amarelo": 4,
    "verde": 5, "azul": 6, "violeta": 7, "cinza": 8, "branco": 9
}
MULT = {
    "prata": 0.01, "ouro": 0.1,
    "preto": 1, "marrom": 10, "vermelho": 100, "laranja": 1_000, "amarelo": 10_000,
    "verde": 100_000, "azul": 1_000_000, "violeta": 10_000_000, "cinza": 100_000_000, "branco": 1_000_000_000
}
TOL = {
    "sem cor": 20.0,
    "prata": 10.0, "ouro": 5.0,
    "marrom": 1.0, "vermelho": 2.0, "verde": 0.5, "azul": 0.25, "violeta": 0.10, "cinza": 0.05
}
TEMPCO = {
    "marrom": 100, "vermelho": 50, "laranja": 15, "amarelo": 25, "azul": 10, "violeta": 5
}

def format_ohms(value: float) -> str:
    units = [("GΩ", 1e9), ("MΩ", 1e6), ("kΩ", 1e3), ("Ω", 1)]
    for u, f in units:
        if value >= f or (u == "Ω"):
            v = value / f
            if v >= 100:
                s = f"{v:.0f} {u}"
            elif v >= 10:
                s = f"{v:.1f} {u}"
            else:
                s = f"{v:.2f} {u}"
            return s
    return f"{value:.2f} Ω"

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # For simplicity, we pass the color lists to the template
    colors_digit = ["preto","marrom","vermelho","laranja","amarelo","verde","azul","violeta","cinza","branco"]
    colors_mult  = ["prata","ouro"] + colors_digit
    colors_tol   = ["sem cor","prata","ouro","marrom","vermelho","verde","azul","violeta","cinza"]
    colors_temp  = ["marrom","vermelho","laranja","amarelo","azul","violeta"]
    return templates.TemplateResponse("index.html", {
        "request": request,
        "colors_digit": colors_digit,
        "colors_mult": colors_mult,
        "colors_tol": colors_tol,
        "colors_temp": colors_temp
    })

def compute_resistance(bands: int, c: List[str]) -> Dict:
    """
    bands: 4, 5, 6
    c: list of color names in pt-br lowercase
       4: [d1, d2, mult, tol?]
       5: [d1, d2, d3, mult, tol?]
       6: [d1, d2, d3, mult, tol?, tempco?]
    """
    c = [x.lower() for x in c]
    tol_color = None
    tempco_color = None
    if bands == 4:
        d1, d2, mult = c[0], c[1], c[2]
        tol_color = c[3] if len(c) >= 4 else None
        digits = str(DIGIT[d1]) + str(DIGIT[d2])
    elif bands in (5, 6):
        d1, d2, d3, mult = c[0], c[1], c[2], c[3]
        tol_color = c[4] if len(c) >= 5 else None
        digits = str(DIGIT[d1]) + str(DIGIT[d2]) + str(DIGIT[d3])
        if bands == 6:
            tempco_color = c[5] if len(c) >= 6 else None
    else:
        raise ValueError("Número de faixas inválido")
    base = int(digits)
    value = base * MULT[mult]

    # Tolerância padrão, se não informada:
    if tol_color is None:
        tol = 5.0 if bands == 4 else 1.0
        tol_color = "ouro" if bands == 4 else "marrom"
    else:
        tol = TOL[tol_color]

    vmin = value * (1 - tol/100)
    vmax = value * (1 + tol/100)

    result = {
        "ohms": value,
        "text_value": format_ohms(value),
        "tolerance_percent": tol,
        "tolerance_color": tol_color,
        "min": vmin,
        "max": vmax,
        "min_text": format_ohms(vmin),
        "max_text": format_ohms(vmax),
    }
    if bands == 6:
        if tempco_color is None:
            # escolha padrão comum para 6 bandas quando não informado
            tempco_color = "marrom"
        result["tempco_ppm"] = TEMPCO.get(tempco_color, None)
        result["tempco_color"] = tempco_color
    return result

@app.get("/api/calc", response_class=JSONResponse)
async def api_calc(
    bands: int = Query(4, ge=4, le=6),
    c0: str = Query("preto"),
    c1: str = Query("preto"),
    c2: str = Query("preto"),
    c3: Optional[str] = Query(None),
    c4: Optional[str] = Query(None),
    c5: Optional[str] = Query(None),
):
    # Monta lista de cores conforme o número de faixas
    cores = [c0, c1, c2]
    if bands >= 4 and c3 is not None:
        cores.append(c3)
    if bands >= 5 and c4 is not None:
        cores.append(c4)
    if bands == 6 and c5 is not None:
        cores.append(c5)

    try:
        res = compute_resistance(bands, cores)
        return res
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
