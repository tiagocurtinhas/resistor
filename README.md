# Calculadora de Cores de Resistores — FastAPI (v3.3.3)

Aplicação web para cálculo de resistência a partir do **código de cores** de resistores (4/5/6 faixas).  
Front-end estático (HTML/CSS/JS) servido por **FastAPI**, com **Séries E (E6…E192)**, **pré‑sets com busca**, colorização **ao vivo** do resistor (SVG), **rótulos por faixa**, exportação **PNG/PDF** e seletor de **cor dos rótulos** (persistido em `localStorage`).

> **Layout**: inputs **sempre em cima**; resistor e resultado abaixo.  
> **Padrão de tolerância**: se não selecionar a cor de tolerância, assume **ouro (±5%) em 4 faixas** e **marrom (±1%) em 5/6 faixas**.

---

## 🚀 Como executar

```bash
# 1) criar e ativar venv (opcional)
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# 2) instalar dependências mínimas
pip install fastapi uvicorn jinja2 pillow reportlab

# 3) rodar
uvicorn app.main:app --reload
# abrir no navegador
# http://127.0.0.1:8000
```

---

## 📁 Estrutura do projeto

```
app/
  main.py
  templates/
    index.html
  static/
    styles.css
    script.js
    images/
      cod_resisotr.webp         # imagem de referência (4 faixas)
    favicon.ico                 # gerado em v3.3.3
README.md (este)
```

---

## ✨ Funcionalidades (v3.3.3)

- 4/5/6 **faixas** com selects dedicados:
  - 4: `1º dígito`, `2º dígito`, `Multiplicador`, `Tolerância`
  - 5: `1º`, `2º`, `3º dígito`, `Multiplicador`, `Tolerância`
  - 6: `1º`, `2º`, `3º dígito`, `Multiplicador`, `Tolerância`, `Tempco`
- **Resistor em SVG** com faixas coloridas em tempo real + **rótulos por faixa**
  (`0…9`, `×10^n`, `±x%`, `ppm/K`).
- **Pré‑sets** por **Séries E**: E6 (±20%), E12 (±10%), E24 (±5%), E48 (±2%), E96 (±1%), E192 (±0.5%) e **Todas**.
  - Busca aceita `47k`, `1M`, `330`, `4R7`, `1 Ω`, `1ohm`.
  - Dropdown **custom** (swatches, mousedown para aplicar).
  - Botões **Aplicar** e **Limpar**; ordenação **Menor→Maior / Maior→Menor**.
  - Tolerância **padrão da série** ou **override** manual.
- **Seletor “Cor dos rótulos”** (color input) que atualiza os textos no SVG e salva em `localStorage`.
- **Exportar PNG/PDF**: imagem do resistor + dados (valor, tolerância e faixa útil).

---

## 🧠 Regras de cálculo

- 4 faixas: `dd × 10^m` (+ tolerância).  
- 5/6 faixas: `ddd × 10^m` (+ tolerância; 6ª = tempco informativo).  
- Símbolos e unidades corretos: `Ω`, `kΩ`, `MΩ` (formatação SI).  
- Faixa útil: `mín = R × (1 − tol)`, `máx = R × (1 + tol)`.

**Padrões de tolerância quando ausentes**
- 4 faixas → **ouro** (±5%)
- 5/6 faixas → **marrom** (±1%)

---

## 🔌 Endpoints

### `GET /`
Retorna a página da calculadora.

### `GET /api/calc`
Calcula a resistência com base nas faixas.

**Query params** (exemplo para 4 faixas — marrom/preto/laranja/ouro):  
`/api/calc?bands=4&c0=marrom&c1=preto&c2=laranja&c3=ouro`

**Resposta:**
```json
{
  "ohms": 10000.0,
  "ohms_label": "10.0 kΩ",
  "tol_percent": 5.0,
  "range": {
    "min": 9500.0, "max": 10500.0,
    "min_label": "9.50 kΩ", "max_label": "10.5 kΩ"
  },
  "bands": 4,
  "colors": ["marrom","preto","laranja","ouro"],
  "series": null,
  "tempco_ppm": null
}
```

### `POST /export/png` e `POST /export/pdf`
Recebem o estado/SVG e retornam o arquivo pronto para download.

---

## ⌨️ Atalhos

- `↑/↓` muda a opção do select focado.  
- `←/→` navega entre as bandas.  
- (opcional) `Ctrl/Cmd + T` alterna tema (se disponível).

---

## 🎨 Mapas de cores (PT‑BR)

- **Dígitos (0–9)**: preto, marrom, vermelho, laranja, amarelo, verde, azul, violeta, cinza, branco.  
- **Multiplicador**: prata (−2), ouro (−1), preto (0), marrom (1), vermelho (2), laranja (3), amarelo (4), verde (5), azul (6), violeta (7), cinza (8), branco (9).  
- **Tolerância**: marrom ±1%, vermelho ±2%, verde ±0.5%, azul ±0.25%, violeta ±0.1%, cinza ±0.05%, ouro ±5%, prata ±10%, **sem cor ±20%**.  
- **Tempco (ppm/K)**: marrom 100, vermelho 50, laranja 15, amarelo 25, azul 10, violeta 5.

---

## 🧩 Dicas & Solução de problemas

- **Dropdown de pré‑sets não abre após escolher um item**: clique no campo de busca; a lista reabre para a série atual.  
- **JS/CSS desatualizados**: faça **Ctrl+F5** (hard refresh).  
- **Faixas não mudam de cor**: a cor é aplicada por `rect.style.fill` (inline). Certifique-se de que não há regras CSS sobrepondo.

---

## 🏷️ Versão & Git

**Versão atual:** `v3.3.3`

Criação de tag anotada:

```bash
git add -A
git commit -m "chore(release): v3.3.3"
git tag -a v3.3.3 -m "v3.3.3 – presets E-series, colorização ao vivo, labels, export, label color picker"
git push origin main --follow-tags
# ou, separadamente
git push origin v3.3.3
```

---

## 📝 CHANGELOG (resumo)

- **v3.3.3**: seletor de **cor dos rótulos** + **favicon**.  
- **v3.3.2**: correção de cor das faixas (inline style) e cor de rótulos (variável CSS).  
- **v3.3.1**: `drawBands()` refeito; rótulos por faixa + defaults de tolerância.  
- **v3.3.0**: colorização ao vivo + rótulos no SVG.  
- **v3.2.9**: pré‑sets não “travam” ao reabrir após aplicar.  
- **v3.2.8**: aplicar preset no **mousedown**.  
- **v3.2.7**: correção de `\"` no JS.  
- **v3.2.6**: série → não trava; **Aplicar** com busca vazia pega primeiro item.  
- **v3.2.5**: selects das faixas sempre presentes (server‑rendered).  
- **v3.2.4/3**: robustez da UI dos presets.  
- **v3.2.1**: dropdown custom de presets.  
- **v3.2.0**: tema claro/escuro, atalhos.  
- **v3.1.x**: catálogo E‑series, presets e melhorias de UI.  
- **v3.0**: versão inicial funcional (4/5/6 faixas, cálculo e export).

---

## 📄 Licença
Defina a licença desejada (MIT, Apache‑2.0, etc.).
