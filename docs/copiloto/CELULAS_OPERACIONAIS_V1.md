# Células Operacionais do Copiloto — Implementação V1

> Branch `feature/copiloto-celulas-operacionais-v1` (a partir de `101680a`).
> Especificação: [PRACAS_MAPPING_PROPOSAL](PRACAS_MAPPING_PROPOSAL.md) · [CAIXA_OPERATIONAL_MODEL](CAIXA_OPERATIONAL_MODEL.md).
> Baseline oficial `feature/copiloto-v33-implementation` permanece congelado em `101680a`.

## O que mudou

Mapeamento real e honesto das seis células, usando somente as fontes comprovadas.

| Célula | Antes (`101680a`) | Agora | Fonte |
|---|---|---|---|
| **Sushi** | agregação combinados+duplas+enrolados | igual, mas a leitura **diz qual praça concentra a espera** e quais seguem estáveis | `combinados`+`duplas`+`enrolados` |
| **Quentes** | enrolados_quentes **+ cozinha_quentes** | **só `enrolados_quentes`** | `enrolados_quentes` |
| **Cozinha** | hardcoded `validacao` ("sem dados") | **dado real da praça** | `cozinha_quentes` |
| **Caixa** | hardcoded `validacao` | **célula derivada, leitura parcial** (concentração de prontos) | `p` (pronto) do payload |
| **Conferência** | derivava de `sits` | **"leitura ainda não conectada"** (sem fonte própria) | — |
| **Entregas** (antes "Motoboy") | derivava de `sits` de saída | **"aguardando integração"** | — (ENTREGAS não integrado) |

`cozinha_quentes` **não é duplicado**: saiu de Quentes e passou a alimentar Cozinha.

## Arquivos

- `src/live/interface/celulas-operacionais.js` — **novo módulo puro** (dual-export, padrão de `adaptador-v33.js`): `estadoAgregado()` (agregação de praças) e `leituraCaixa()` (célula derivada). Testável server-side.
- `app-v1/app.js` — `mapaAmbientes()` passa a consumir o módulo; Conferência e Entregas declaram estado honesto; rótulo "Motoboy" → "Entregas" (id topológico `motoboy` preservado).
- `app-v1/index.html` — carrega o novo módulo antes de `app.js`.
- `src/live/interface/adaptador-v33.js` — `areaHintFromSit`: `cozinha_quentes` → **Cozinha** (era "Quentes"); `saida` → **Caixa** (lê a concentração de prontos), já que Entregas aguarda integração; `AREA_ORDER` usa "Entregas".

## Caixa — leitura parcial e limites (célula derivada)

- Fontes reais hoje: `r` (recebido), `p` (pronto), `c` (cancelado). Sinal usado: **concentração de pedidos prontos numa janela de 10 min** (não "fila" — sem carimbo de saída não se sabe o que saiu).
- Estados permitidos: **Calmo · Em movimento · Atenção · Leitura parcial · Fonte indisponível**.
- **"Sobrecarregado" é estruturalmente impossível** hoje — exigiria sinais combinados (sacola, comanda, retirada, mensagens, expedição, ocorrências) que não existem. Provado por teste.
- Toda leitura carrega a nota **"Leitura parcial: sacolas, comandas, expedição e mensagens ainda não estão conectadas."**
- Nunca exibe percentual, "Caixa 82%", quantidade inventada de sacolas/comandas, "zero mensagens", fila ou motoboys estimados.
- Limiares (`MOVIMENTO=3`, `ATENCAO=6`, `JANELA=10min`) são **PROVISÓRIOS · NÃO CALIBRADOS** — só para a leitura existir; não são verdade operacional nem pesos definitivos.

## Testes (336 verdes)

- **Suíte existente do Copiloto preservada:** 218 live + 53 copiloto + 43 capacidade = 314 (mais 22 novos = **336**). 2 testes ajustados à nova especificação (areaHint e rótulo topológico).
- **Novos** (`tests/live/celulas-operacionais.test.js` + `celulas-integracao.test.js`, 22 testes): Sushi agrupamento e praça contribuinte; Sushi severidade = pior praça (sem soma incompatível); Quentes usa só `enrolados_quentes`; Cozinha usa só `cozinha_quentes`; Quentes×Cozinha divergem; Caixa calmo/movimento/atenção; **bloqueio de "Sobrecarregado"**; leitura parcial sempre presente; **ausentes não viram zero**; fonte indisponível; cancelado não conta; integração com motor real; Conferência/Entregas declaram honesto; `montagem_outros` nunca é fonte de célula.

## Evidência visual (navegador real, localhost:5186)

Capturas via **leitura de DOM** (a captura de tela em pixel ficou impedida — ver limitação abaixo):

| # | Cenário | Evidência real observada |
|---|---|---|
| 1 | Caixa calmo | "Caixa · calmo" (poucos prontos) |
| 2 | Cozinha viva | "Cozinha · no ritmo · 1 em produção" (dado real, não mais "sem dados") |
| 3 | Caixa em atenção | pos 70 do replay: **"Caixa · atenção · 8 prontos na janela"** (reage à concentração real, teto em atenção) |
| 4 | Quentes × Cozinha | células distintas, estados independentes |
| 5 | Conferência | "Conferência · leitura ainda não conectada" |
| 6 | Entregas | "Entregas · aguardando integração" |
| 7 | Ambiente/Cozinha | caption "Cozinha está crescendo" em modo ambiente |
| 8 | 360 px | sem overflow horizontal, conteúdo íntegro, todas as células presentes |
| 9 | Console | sem erros |

## Limitação registrada (não contornada)

- **Captura de tela em pixel (screenshot) expirou (timeout)** no organismo animado do Copiloto, neste ambiente — a ferramenta de screenshot não conclui enquanto o replay anima. **Não é a correção de bind** (o localhost serve normalmente; leitura de DOM, cliques e resize funcionam). A correção de bind (`5e22553`) **não foi trazida** para esta branch, conforme instruído; ela não era necessária para os testes (todos rodam por `node --test`/`npm run`, sem depender de rede externa) nem para a verificação de estados (feita por leitura de DOM real). Nenhuma captura foi obtida como imagem `.png`; todas as evidências de estado vieram do DOM real servido em `localhost`.

## Fora de escopo (intocado)

ENTREGAS, COR, contratos públicos, shell, SELECAO, Blind V1/V2, calibração `cv-cal-tata-human-v2`, motor, Capacidade Viva (modo sombra), baseline congelado e branch de auditoria — nenhum alterado. Bar e Sobremesa continuam praças canônicas **sem célula própria** na primeira camada (não agregadas automaticamente a nenhuma outra).
