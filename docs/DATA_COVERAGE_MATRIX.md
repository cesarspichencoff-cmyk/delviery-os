# Matriz de Cobertura de Dados — Praças (Auditoria 2026-07-20)

> Investigação ponta a ponta do porque Cozinha e Caixa aparecem "sem dados".
> Método: seguir o dado `fonte → payload → adapter → normalização → regra → estado → interface`.

## 1. Dois vocabulários que não são o mesmo

Existe uma diferença estrutural entre **as 8 praças do motor** e **as 6 células da interface**. Isso é a raiz de tudo.

### 8 praças canônicas do motor (`src/perfil-delivery/motor.js:19`)

`combinados · duplas · enrolados · enrolados_quentes · cozinha_quentes · sobremesa · bar_bebidas · montagem_outros`

DISPLAY do motor (`motor.js:25`): Combinados, Duplas, Enrolados, Enrolados Quentes, **Quentes** (=cozinha_quentes), Sobremesa, Bar, Montagem.

### 6 células da interface (`app-v1/app.js:330`, função `mapaAmbientes`)

`Caixa · Sushi · Quentes · Cozinha · Conferência · Motoboy`

**Elas não têm relação 1:1.** A interface é uma AGREGAÇÃO/RE-ROTULAÇÃO operacional das praças do motor:

| Célula da UI | Origem no motor | Como é calculada |
|---|---|---|
| **Sushi** | `combinados + duplas + enrolados` | `piorPraca([...])` — cor/sev da pior das 3 praças frias |
| **Quentes** | `enrolados_quentes + cozinha_quentes` | `piorPraca([...])` — pior das 2 praças quentes |
| **Conferência** | `sits` do tipo `conferencia` | derivada de sinais do motor, não de praça |
| **Motoboy** | `sits` do tipo `saida` + `ctx.wE` | expedição/espera de saída |
| **Cozinha** | **NADA** | **hardcoded** `cor:"validacao", sev:0, n:0` |
| **Caixa** | **NADA** | **hardcoded** `cor:"validacao", sev:0, n:0` |

## 2. Por que Cozinha aparece "sem dados"

`app-v1/app.js:315`:
```js
const cozinha = { nome: "Cozinha", cor: "validacao", sev: 0, n: 0,
  motivo: "Separação fina ainda depende do mapa operacional" };
```

**Causa (categoria 4 da taxonomia do prompt — nome de praça divergente / sem praça própria):** o motor **não tem uma praça "Cozinha"**. O que existe é `cozinha_quentes`, e o DISPLAY do motor rotula `cozinha_quentes` como **"Quentes"** — ou seja, a produção da cozinha já está sendo contada e mostrada dentro da célula **Quentes**. A célula "Cozinha" da interface é um **conceito operacional adicional** (a separação fina Cozinha × Quentes que o César faz na operação real) que **ainda não tem praça correspondente validada no motor**. Enquanto essa separação não for definida por César, a célula fica em estado "em validação" (tracejado honesto), nunca inventa medida.

**Não é bug de dado escondido.** Os pratos que "estão saindo" na operação real ESTÃO sendo contados — só que dentro de "Quentes" e "Sushi", não numa célula "Cozinha" separada. A célula "Cozinha" separada não tem lastro no motor atual.

## 3. Por que Caixa aparece "ainda sem dados"

`app-v1/app.js:329`:
```js
const caixa = { nome: "Caixa", cor: "validacao", sev: 0, n: 0,
  motivo: "Fonte atual ainda não mede esta fila" };
```

**Causa (categoria 1 — a fonte realmente não envia):** a fonte de dados atual (relatório iFood: recebido/pronto/saiu/cancelado) **não observa a fila do caixa/atendimento**. "Caixa e Atendimento" é, na própria arquitetura, um **domínio futuro** (`Mapa_Mestre_Dominios`: "domínio futuro — só registrado"). Não há sinal, campo ou carimbo de origem para essa fila. Mostrar qualquer número aqui seria dado falso.

## 4. Matriz de cobertura por praça

| Praça (motor) | Aliases/UI | Fonte | Campo de origem | Adapter | Dado observado | Estado mostrado | Cobertura real | Lacuna |
|---|---|---|---|---|---|---|---|---|
| combinados | Sushi | iFood report (A) real + composição (B) sint. | recebido/pronto/saiu + itens | `montarJanela` + `resolver` | sim (sintético rotulado) | pela pior de Sushi | **parcial** | composição sintética (motor B) |
| duplas | Sushi | idem | idem | idem | sim | Sushi | parcial | idem |
| enrolados | Sushi | idem | idem | idem | sim | Sushi | parcial | idem |
| enrolados_quentes | Quentes | idem | idem | idem | sim | Quentes | parcial | idem |
| cozinha_quentes | **Quentes** | idem | idem | idem | sim | Quentes | parcial | rotulado "Quentes", não "Cozinha" |
| sobremesa | (dentro de conferência/sinais) | idem | itens | resolver | sim | — | parcial | não tem célula própria |
| bar_bebidas | Bar (só no motor) | idem | itens | resolver | sim | — | parcial | não tem célula própria na UI de 6 |
| montagem_outros | Conferência/Montagem | idem | itens | resolver | sim | Conferência (via sits) | parcial | — |
| — (Cozinha UI) | Cozinha | **nenhuma** | — | — | **não** | "sem dados" | **0%** | não há praça própria; aguarda mapa do César |
| — (Caixa UI) | Caixa | **nenhuma** | — | — | **não** | "ainda sem dados" | **0%** | domínio futuro; nenhuma fonte mede |

## 5. Distinção honesta de estados de dado

O código distingue visual e tecnicamente (`app-v1/app.js:638` `fraseEstado` + cor `"validacao"`):

| Estado real | Como aparece | Correto? |
|---|---|---|
| Dado sintético (composição, motor B) | Rótulo global "Fonte simulada (D4A) · dados sintéticos (não é operação real)" no topo | **SIM** — rotulado |
| Dado real (timing, motor A) | integra o cálculo; nunca separado do rótulo geral | SIM |
| Dado parcial | célula amarela/vermelha com motivo | SIM |
| Dado indisponível (Cozinha/Caixa) | "sem dados" / "ainda sem dados", cor `validacao` (tracejado) | SIM — honesto |
| Fonte fora de `ready` | interface mostra estado técnico, nunca Calmo | SIM (`source_status`) |

## 6. Veredito da FASE 4

"Sem dados" em Cozinha e Caixa está **tecnicamente correto e honesto** — não é bug escondendo dado real. É a **ausência de fonte** (Caixa) e a **ausência de praça própria no motor** (Cozinha, cuja produção já é contada dentro de Quentes). **Não corrigir com mock.**

**Porém — risco de demonstração (não de verdade):** para uma direção/investidor, duas células permanentemente escuras podem *parecer* produto quebrado. O ajuste correto é de **produto/UX** (deixar mais claro "módulo em desenvolvimento" vs. "sem dado agora", ou não exibir Caixa/Cozinha até terem fonte) e **exige decisão do César** — não deve ser implementado silenciosamente. Registrado em [IMPROVEMENT_RECOMMENDATIONS.md](IMPROVEMENT_RECOMMENDATIONS.md) e [DEMO_READINESS.md](DEMO_READINESS.md).
