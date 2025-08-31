
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional, List, Dict
from io import BytesIO

# Pillow for export
from PIL import Image, ImageDraw, ImageFont

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
COLORS_HEX = {
    "preto":"#1a1a1a","marrom":"#6d3b13","vermelho":"#c62828","laranja":"#ef6c00",
    "amarelo":"#f9a825","verde":"#2e7d32","azul":"#1565c0","violeta":"#6a1b9a",
    "cinza":"#757575","branco":"#efefef","ouro":"#c6a700","prata":"#b0bec5","sem cor":"#00000000"
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

def multiplier_exponent(color: str) -> int:
    v = MULT[color]
    # v is power of 10 like 0.01, 0.1, 1, 10 ...
    import math
    return int(round(math.log10(v)))

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # For simplicity, we pass the color lists to the template
    colors_digit = ["preto","marrom","vermelho","laranja","amarelo","verde","azul","violeta","cinza","branco"]
    colors_mult  = ["prata","ouro"] + colors_digit
    colors_tol   = ["(padrão)"] + ["sem cor","prata","ouro","marrom","vermelho","verde","azul","violeta","cinza"]
    colors_temp  = ["(nenhum)"] + ["marrom","vermelho","laranja","amarelo","azul","violeta"]
    presets = [
        # id, label, bands, colors
        {"id":"47k_1", "label":"47 kΩ ±1%", "bands":5, "colors":["amarelo","violeta","preto","vermelho","marrom"]},
        {"id":"10k_5", "label":"10 kΩ ±5%", "bands":4, "colors":["marrom","preto","laranja","ouro"]},
    ]
    return templates.TemplateResponse("index.html", {
        "request": request,
        "colors_digit": colors_digit,
        "colors_mult": colors_mult,
        "colors_tol": colors_tol,
        "colors_temp": colors_temp,
        "presets": presets
    })

def compute_resistance(bands: int, c: List[str]) -> Dict:
    """
    bands: 4, 5, 6
    c: list of color names in pt-br lowercase
       4: [d1, d2, mult, tol?]
       5: [d1, d2, d3, mult, tol?]
       6: [d1, d2, d3, mult, tol?, tempco?]
    """
    c = [x.lower() for x in c if x]  # remove vazios

    tol_color = None
    tempco_color = None
    if bands == 4:
        d1, d2, mult = c[0], c[1], c[2]
        tol_color = c[3] if len(c) >= 4 and c[3] not in ("(padrão)","") else None
        digits = str(DIGIT[d1]) + str(DIGIT[d2])
    elif bands in (5, 6):
        d1, d2, d3, mult = c[0], c[1], c[2], c[3]
        tol_color = c[4] if len(c) >= 5 and c[4] not in ("(padrão)","") else None
        digits = str(DIGIT[d1]) + str(DIGIT[d2]) + str(DIGIT[d3])
        if bands == 6:
            tempco_color = c[5] if len(c) >= 6 and c[5] not in ("(nenhum)","") else None
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
        "digits": digits,
        "mult_color": mult,
        "mult_exp": multiplier_exponent(mult)
    }
    if bands == 6:
        if tempco_color is None:
            result["tempco_ppm"] = None
            result["tempco_color"] = None
        else:
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

# ---------------- Exports ----------------

def render_png(bands: int, colors: List[str], data: Dict, origin: str | None = None) -> Image.Image:
    # Canvas
    W, H = 1200, 700
    img = Image.new("RGBA", (W, H), (11, 11, 16, 255))
    d = ImageDraw.Draw(img)

    # Colors
    def hx(c): 
        from PIL import ImageColor
        return ImageColor.getrgb(COLORS_HEX.get(c, "#000000"))
    card = (21,21,28,255)
    fg = (231,231,238,255)
    muted = (168,168,179,255)
    accent = (124,156,255,255)

    # Card
    margin = 40
    d.rounded_rectangle([margin, margin+80, W-margin, H-margin], 24, fill=card)

    # Title
    try:
        font_title = ImageFont.truetype("DejaVuSans-Bold.ttf", 44)
        font_big   = ImageFont.truetype("DejaVuSans-Bold.ttf", 64)
        font_med   = ImageFont.truetype("DejaVuSans.ttf", 28)
        font_small = ImageFont.truetype("DejaVuSans.ttf", 24)
    except:
        font_title = font_big = font_med = font_small = None
    d.text((margin, margin), "Calculadora de Cores de Resistores", fill=fg, font=font_title)

    # Resistor drawing area
    cx, cy = W//2, H//2 + 40
    body_w, body_h = 520, 150
    wire_len = 260
    # wires
    d.rounded_rectangle([cx-wire_len-180, cy-7, cx-body_w//2, cy+7], 7, fill=(185,185,194,255))
    d.rounded_rectangle([cx+body_w//2, cy-7, cx+wire_len+180, cy+7], 7, fill=(185,185,194,255))
    # body
    d.rounded_rectangle([cx-body_w//2, cy-body_h//2, cx+body_w//2, cy+body_h//2], 60, fill=(226,196,155,255), outline=(178,144,96,255), width=6)

    # bands
    n = bands
    startX = cx - body_w//2 + 50
    endX = cx + body_w//2 - 50
    span = endX - startX
    band_w = 28
    for i in range(n):
        x = startX + ((i+0.5) * span / n) - band_w/2
        d.rounded_rectangle([x, cy-90, x+band_w, cy+90], 6, fill=hx(colors[i]))

    # Value box
    d.text((margin+30, margin+120), data["text_value"], fill=fg, font=font_big)
    d.text((margin+30, margin+200), f"Tolerância: ±{data['tolerance_percent']}%", fill=muted, font=font_med)
    d.text((margin+30, margin+240), f"Faixa: {data['min_text']} — {data['max_text']}", fill=muted, font=font_med)

    # Origin
    if origin:
        d.text((margin+30, margin+280), f"Origem: {origin}", fill=muted, font=font_med)

    # Legend of bands
    labels = []
    if bands == 4:
        labels = [
            ("1º dígito", str(colors[0]).title()),
            ("2º dígito", str(colors[1]).title()),
            ("Multiplicador", f"x10^{data['mult_exp']}"),
            ("Tolerância", f"±{data['tolerance_percent']}%"),
        ]
    elif bands == 5:
        labels = [
            ("1º dígito", str(colors[0]).title()),
            ("2º dígito", str(colors[1]).title()),
            ("3º dígito", str(colors[2]).title()),
            ("Multiplicador", f"x10^{data['mult_exp']}"),
            ("Tolerância", f"±{data['tolerance_percent']}%"),
        ]
    else:
        temp_line = f"{data.get('tempco_ppm','-')} ppm/K" if data.get("tempco_ppm") else "-"
        labels = [
            ("1º dígito", str(colors[0]).title()),
            ("2º dígito", str(colors[1]).title()),
            ("3º dígito", str(colors[2]).title()),
            ("Multiplicador", f"x10^{data['mult_exp']}"),
            ("Tolerância", f"±{data['tolerance_percent']}%"),
            ("Tempco", temp_line),
        ]
    lx = W - 420
    ly = margin + 120
    for name, val in labels:
        d.text((lx, ly), name, fill=muted, font=font_small); ly += 22
        d.text((lx, ly), val,  fill=fg,    font=font_med ); ly += 36

    return img

@app.get("/export/png")
async def export_png(
    bands: int = Query(4, ge=4, le=6),
    c0: str = Query("marrom"),
    c1: str = Query("preto"),
    c2: str = Query("preto"),
    c3: Optional[str] = Query(None),
    c4: Optional[str] = Query(None),
    c5: Optional[str] = Query(None),
):
    cores = [c0, c1, c2]
    if bands >= 4 and c3 is not None and c3 not in ("(padrão)",""):
        cores.append(c3)
    if bands >= 5 and c4 is not None and c4 not in ("(padrão)",""):
        cores.append(c4)
    if bands == 6 and c5 is not None and c5 not in ("(nenhum)",""):
        cores.append(c5)

    data = compute_resistance(bands, [c0,c1,c2,c3,c4,c5])
    img = render_png(bands, [c0,c1,c2,c3 or "-",c4 or "-",c5 or "-"], data, origin)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

@app.get("/export/pdf")
async def export_pdf(
    bands: int = Query(4, ge=4, le=6),
    c0: str = Query("marrom"),
    c1: str = Query("preto"),
    c2: str = Query("preto"),
    c3: Optional[str] = Query(None),
    c4: Optional[str] = Query(None),
    c5: Optional[str] = Query(None),
):
    data = compute_resistance(bands, [c0,c1,c2,c3,c4,c5])
    img = render_png(bands, [c0,c1,c2,c3 or "-",c4 or "-",c5 or "-"], data, origin).convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PDF")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf")
