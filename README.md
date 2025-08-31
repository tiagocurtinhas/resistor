
# Calculadora de Resistores (Códigos de Cores) — FastAPI

## Como rodar
```bash
uvicorn app.main:app --reload
# abra http://127.0.0.1:8000
```


## Changelog
### v3.2.0 (Incremental sobre v3)
- Catálogo de pré-sets com E6/E12/E24/E48/E96/E192 (0,1 Ω → 100 MΩ), busca/filtro/ordem.
- Tolerância customizável por série (override no Apply).
- Seletores com rótulos simplificados e tentativa de “swatch” de cor à esquerda.
- Auto-aplicar pré-set ao pressionar Enter, ao mudar o campo ou via botão Aplicar.
- Export PNG/PDF inclui “Origem: Série (±tol%)” quando aplicável.
- Tema claro/escuro e atalhos (Ctrl/Cmd+T para alternar; ←/→ muda banda focada).


### v3.2.2 (Incremental)
- Fix: linha de **inputs das faixas** garantida (classe `.bands-row`), sem remoções indevidas.
- Fix: aplicação de **pré-sets** fecha/limpa dropdown e evita travamentos.
- Hardening: `safeBuild()` para não quebrar a UI se houver erro intermitente.
