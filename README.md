
# Calculadora de Resistores (Códigos de Cores) — FastAPI

## Como rodar
```bash
uvicorn app.main:app --reload
# abra http://127.0.0.1:8000
```


Feito! Entreguei a v3.1.0, mantendo tudo da v3 (MODO INCREMENTAL) e adicionando:

✅ Novidades da v3.1.0

Catálogo completo de pré-sets comerciais (E-séries)

Geração automática das séries E6 (±20%), E12 (±10%), E24 (±5%), E48 (±2%), E96 (±1%) e E192 (±0,5%)

Cobertura de ~0,1 Ω até 10 MΩ por décadas (sem duplicatas na busca)

Cada pré-set vem rotulado, ex.: “47 kΩ ±1% (E96)” e aplica automaticamente 4 faixas para tolerâncias ≥5% e 5 faixas para ≤2%

Busca por valor + filtro de série + ordem (menor→maior / maior→menor)

Botão Aplicar para setar as faixas/cores, mantendo todo o fluxo atual

Seletores de cor com rótulos aprimorados

Agora cada select mostra à esquerda:

Dígitos: [n] cor - Nome (ex.: [4] amarelo - Amarelo)

Multiplicador: [×10^n] cor - Nome (ouro = ×10⁻¹; prata = ×10⁻²)

Tolerância: [±X%] cor - Nome

Tempco: [Y ppm/K] cor - Nome

Os hints abaixo de cada select continuam exibindo o valor correspondente; o resistor em SVG colore em tempo real.

Exportação com origem do pré-set

PNG/PDF agora incluem “Origem: E96 (±1%)” quando o valor veio do catálogo (mantido opcional; export sem preset segue igual).