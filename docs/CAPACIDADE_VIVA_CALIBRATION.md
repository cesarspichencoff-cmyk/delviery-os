# Capacidade Viva — Calibração e Modo Sombra

**Rótulos:** CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL

Branch: `research/capacidade-viva-calibration`  
Base: `54b5c59` (não altera worktree de origem)

## Dados encontrados

| Fonte | Caminho | Formato | Período | Registros | Tipo |
|---|---|---|---|---|---|
| Transições iFood | `delviery-os/data/ifood_real.jsonl` | jsonl | 2026-05-27 → 2026-06-26 | 41 206 eventos / ~8 305 pedidos | **Real** |
| Itens por pedido | `delviery-os/data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl` | jsonl | 20–30/06/2026 | 10 565 linhas / 3 215 pedidos | **Real** (parser) |
| Itens 01/07 | `.../itens_pedido_reais_2026-07-01.jsonl` | jsonl | 2026-07-01 | ~itens | Real |
| Cardápio seed | `data/cardapio_knowledge_seed.json` | json | n/a | 199 itens | Real (conhecimento) |
| Janela V1 | `delviery-os/data/generated/v1_janela_real.json` | json | janela demo | 1 janela | Real |
| XLSX bruto | `delviery-os/data/raw/relatorio_pedidos_ifood.xlsx` | xlsx | export | 1 arquivo | Real bruto |
| Fixtures CV / Copiloto | `data/capacidade-viva/fixtures`, `mocks/copiloto` | json | n/a | fixtures | **Sintético** rotulado |

### Dados ausentes (sem fabricação)

- **Seis meses completos** de histórico contínuo **não** estão locais.
- Escala real de equipe por turno.
- Eventos nativos de “comanda ausente” / produção por item no log de fluxo.
- Ações humanas registradas com horário (para Recuperação Líquida histórica).

Contrato de importação gerado em cada run: `08_import_contract.json`.

## Qualidade

Ver `02_quality.json` em cada execução.

**Confirmados:** pedido_id, timestamps de recebido/aceito/pronto/saiu/entregue/cancelado, status final, tempos logísticos no payload iFood, itens+qtd no export de itens.

**Inferidos (alta):** motoboy aguardando (espera na loja ≥ 5 min), alocação de entregador (minutos de alocação), praça via casamento cardápio.

**Inferidos (baixa) / pendentes:** complexidade sem tempo por item; praça se nome não casa no seed.

**Ausentes:** equipe, 6 meses, comanda física, ranking de pessoas (propositalmente não modelado).

## Normalização

Eventos canônicos em `normalizer.js`. Epistemic obrigatório. Fora de ordem e duplicatas medidos em `buildOrderTimelines`.

## Catálogo

Construído a partir do seed (199 itens) + regras de evidência (peças, multi-praça, quente, kit).  
Itens com `revisao_manual` / sem praça → **CLASSIFICAÇÃO PENDENTE DE VALIDAÇÃO**.

## Replay

`replay.js` — intervalo default 5 min (CLI configurável). Calcula ISF, exceções, menor intervenção **em sombra**.

## Calibração ISF

Variantes de pesos testadas; seleção por **estabilidade cal/val** + penalidade a pausa geral (anti-overfit).  
Split: ~67% dias calibração / 33% validação (ordem cronológica).

## Modo sombra

Linhas com horário, praça, estado, sinais, confiança, intervenção.  
**Não** afirma que a ação teria funcionado (sem contrafactual).

Recuperação Líquida histórica: **contrato apenas** — requer log de ações futuras.

## Como executar

```bash
cd C:\Users\italo\Desktop\Claude\deliveryos-capacidade-viva-calibration
node tools/calibrar_capacidade_viva.js
# demo sintético:
node tools/calibrar_capacidade_viva.js --demo
# custom:
node tools/calibrar_capacidade_viva.js --ifood "C:\path\ifood_real.jsonl" --interval 5 --team estrutura_media
node tests/capacidade-viva/calibration/run.js
node tests/capacidade-viva/run.js
node tests/copiloto/run.js
```

Saídas em `results/capacidade-viva/run-<ts>/` (gitignored).

## Perguntas para César / equipe

1. Validar aliases Quentes × Cozinha no cardápio.
2. Confirmar itens marcados pendentes de validação.
3. Fornecer escala típica por dia da semana (contagens, não nomes).
4. Exportar mais meses de relatório iFood para fechar 6 meses.
5. Registrar intervenções reais (horário + tipo) para RL histórica.
6. Confirmar se “espera na loja” ≥ 5 min é limiar operacional adequado.

## Riscos

- Timestamps em Z vs horário local BR na análise por hora.
- Subsample de pedidos em bases grandes (usar `--full` se necessário).
- Overfitting se só maximizar fit sem validação temporal (mitigado).
- Inferência de praça falha em nomes fora do seed.

## Limitações

Não operacional; não alerta equipe; não aplica pausa; não ranqueia pessoas; não estima dinheiro.

---

## Fase 2D.1 — Saneamento e validação humana

### Problemas da V1 (corrida inicial)

- ~98% ticks com “exceção” (envelhecimento e pronto tratados como críticos).
- ~48% ticks “críticos” sem ground truth (não é taxa de detecção).
- Risco UTC vs horário BR na análise temporal.
- Subsample de pedidos.
- Equipe simulada tratável como se fosse real.
- Pausa seletiva acoplada demais ao ISF isolado.

### Correções

| Tema | Correção |
|---|---|
| Timezone | `America/Sao_Paulo` explícito; preserva `timestamp_original` / UTC |
| Taxonomia | sinal contínuo · atenção · exceção crítica |
| Envelhecimento | sinal/atenção, **não** exceção isolada |
| Pronto→saída | “aguardando saída — causa não confirmada” sem campo de espera na loja |
| Motoboy | só com evidência de espera na loja (alta confiança) |
| Episódios | gap 10 min; métricas por episódio + tick |
| Pausa | gates (tendência, confiança, localização) |
| Full replay | default `--full` (use `--fast` só em dev) |
| Config | `cv-cal-sane-v2` (não sobrescreve v1) |
| Humanos | 40 casos + 14 itens em `data/capacidade-viva/calibration/review/` |

### O que ainda não se conclui

- Falso positivo real (precisa rótulo do César).
- Capacidade real de equipe (só perfis hipotéticos).
- Recuperação Líquida histórica.
- Superioridade vs baselines sem validação humana.
- Seis meses de histórico.

### Comando

```bash
node tools/calibrar_capacidade_viva.js          # FULL
node tools/calibrar_capacidade_viva.js --fast   # dev
node tests/capacidade-viva/calibration/run-sane.js
```

---

## Fase 2D.2 — Métricas de episódios

Correção de agregação: `order_id` propagado nas exceções; duração média/mediana/p90/max; null honesto; episódios serializados em `04b_episodes_full.json`.

---

## Fase 2D.3 — Limite de turno, duração honesta e freeze do pack humano

### Causa do episódio de 7.335 min

- **episode_id (2D.2):** `ep_1855`
- **tipo:** `pedido_atrasado_vs_prometido_operacional`
- **order_id:** `778a2735-97af-4f4f-8d5b-189b2c7c49db`
- **janela:** 2026-06-25T20:45 → 2026-06-30T23:00 (America/Sao_Paulo)
- **ticks:** 490 · **open** no fim da janela
- **Causa raiz:** o pedido permaneceu `active` no replay (sem evento terminal saiu/entregue/cancelado na fonte). O sinal de atraso renovava a cada tick de 15 min. **Não havia quebra por dia/turno operacional**, então a continuidade uniu madrugadas e dias distintos num único episódio.
- **Não** foi chave genérica sem order_id; **não** se “corrigiu” com teto arbitrário de minutos.

### Fronteiras operacionais

Módulo `operational-window.js` (defaults, **sem** alterar `cv-cal-sane-v2`):

| Regra | Valor inicial |
|---|---|
| Timezone | America/Sao_Paulo |
| Quebra por dia operacional | obrigatória (cutover **05:00** local) |
| Multi-day continuity | **proibida** |
| Turnos nomeados | opcionais (lista vazia por default; podem cruzar meia-noite) |
| Gap máximo sem dados | 180 min (além do gap de episódio) |
| Pedido | episódio por `type|order|id`; encerra por gap, fronteira, ou ausência do sinal |
| Praça | não une pressão de um dia operacional ao seguinte |

### Semântica de duração

| Campo | Significado |
|---|---|
| `observed_span_min` | last_seen − started (técnico; pode ser 0) |
| `observed_ticks` | contagem de leituras |
| `sampling_interval_min` | intervalo do replay |
| `duration_label` | humano: “observado em uma leitura” ou “duração mensurável · N min” |
| `minimum_observed_duration_min` | null em 1 tick (não afirmar 15 min) |

Estatísticas humanas (média/mediana/p90/máx) usam **somente** episódios com ≥2 ticks. Contagem de “uma leitura” é reportada à parte. **Não** apresentar mediana 0 ao César como “durou zero minutos”.

### Confiança logística (auditoria; taxonomia inalterada)

| Tipo | Exceção? | Evidência |
|---|---|---|
| `motoboy_na_loja` | sim | campo de espera na loja; não abrir só por ausência de saída |
| `entregador_alocado_sem_retirada` | sim se não fraco | inferência baixa → só atenção |
| `pronto_sem_saida_excessivo` | sim (investigar) | inferido baixa; motivo desconhecido |
| `aguardando_saida_causa_nao_confirmada` | não (atenção) | permanece causa não confirmada |

Pack humano exibe **confirmado / inferido alta / inferido baixa**.

### Cobertura por praça

Concentração em **Conferência** e **Sushi** reflete `praca_critica` do ISF no tick e sinais logísticos/atraso — **não** prova de calma em Quentes/Cozinha/Caixa/Motoboy. Distinguir **ausência de episódio** vs **ausência de leitura**. Não fabricar distribuição.

### Pack humano congelado (2D.3)

- `data/capacidade-viva/calibration/review/casos-validacao.json`
- `data/capacidade-viva/calibration/review/CASOS_VALIDACAO.md`
- 40 casos (10/10/10/10) + 14 itens pendentes
- Formulário César; flag quando dados não permitem confirmação segura

### O que ainda depende do César

- Rótulos reais nos 40 casos
- Confirmação dos 14 itens do cardápio
- Escala real de equipe por turno (não inventada)
- Se o cutover 05:00 e turnos nomeados batem com a operação
- Eventos terminais faltantes em pedidos “zumbis” na fonte

### Comando 2D.3

```bash
node tools/regenerar_episodios_2d3.js
node tests/capacidade-viva/calibration/run-sane.js
```

---

## Fase 2D.6 — Primeira calibração humana (César / TATÁ)

Config nova (não sobrescreve anteriores):

`data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json`

| Âncora | Regra |
|---|---|
| Motoboy na loja | 5 normal · 10 atenção · 15 quase crítico · 20 crítico (contínuo) |
| Pronto sem saída | 25–30 atenção forte · ≥40 crítico |
| Zumbis | idade ≥180 min sem terminal → qualidade da fonte; fora de ISF/capacidade/pausa |
| Gravidade × confiança | separadas; baixa confiança muda ação, não apaga severidade |

Rótulos: `review-v3/rotulos-humanos-cesar.json`  
Avaliação: `review-v3/avaliacao-calibracao-humana-2d6.json`

```bash
node tests/capacidade-viva/calibration/run-human-v1.js
node tools/avaliar_calibracao_humana.js
```

**Limitação:** amostra pequena (review-v3). Não afirmar precisão geral.

---

## Fase 2D.7 — Primeiro holdout cego (blind-v1)

24 episódios independentes de `cv-cal-tata-human-v1`, excluídos dos conjuntos de treino (review/review-v2/review-v3). Resultado inicial (config v1): concordância exata 57,9% (11/19 comparáveis) — 5 falsos "atenção" em casos que o César marcou `normal`/`impossível avaliar`, 2 falsos críticos onde a fonte estava incoerente, 2 zumbis não detectados.

```bash
node tools/gerar_blind_v1.js
node tools/comparar_blind_v1.js
node tests/capacidade-viva/calibration/run-blind-v1.js
```

## Fase 2D.8 — Correção de faixas baixas e precedência da fonte (`cv-cal-tata-human-v2`)

Config nova (**preserva** `cv-cal-tata-human-v1` sem alteração):

`data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json`

| Âncora | v1 (contínua) | v2 (discreta) |
|---|---|---|
| Motoboy na loja | 5/10/15/20 | **<10 normal · 10–15 atenção · 15–20 quase crítico · ≥20 crítico** |
| Pronto sem saída | 25–30 atenção forte · ≥40 crítico | **<25 normal · 25–35 atenção · 35–40 quase crítico · ≥40 crítico** |
| Precedência | severidade antes da fonte | **fonte (zumbi/incoerência) avaliada ANTES da severidade operacional** |
| Volume sozinho | podia virar "atenção" | **evidência insuficiente — nunca pressão sem sinal temporal** |

Regressão sobre o **mesmo** blind-v1 (não é validação nova — o conjunto já tinha sido revelado): **24/24 concordância exata**, incluindo os 12 casos antes errados. Motor commit `b620aef`.

```bash
node tools/regressao_blind_v1_v2.js
node tests/capacidade-viva/calibration/run-human-v2.js
```

## Fase 2D.9 — Segundo holdout cego independente (blind-v2)

30 episódios, exclusão combinada de review/ + review-v2/ + review-v3/ + blind-v1 (162 case_ids, 52 order_tokens). Seleção por evidência observável, nunca por classificação do motor. Achados empíricos do pool documentados em `blind-v2/MANIFESTO_CONGELAMENTO.json`: nenhum episódio de "pronto sem saída" ultrapassa ~40 min neste dataset sintético; os 5 únicos episódios "evidência insuficiente pura" já tinham sido consumidos pelo blind-v1.

```bash
node tools/gerar_blind_v2.js
```

---

## Fase 2D.10 — Fechamento formal do blind-v2

**Configuração avaliada:** `cv-cal-tata-human-v2`
**Hash congelado:** `f248a17328ca71fc8608e0897d24ee3966bf0b7bcd55afbebb6feaa4cc7534dc`
**Commit do motor:** `b620aef`
**Casos:** 30 (26 comparáveis + 4 impossível avaliar)

### Resultado da validação cega independente

| Métrica | Resultado |
|---|---|
| Concordância exata | **26/26** (100% dos comparáveis) |
| Concordância dentro de um nível | 26/26 |
| Falsos críticos | 0 |
| Críticos não detectados | 0 |
| Qualidade da fonte | 3/3 detectados, 0 falsos, 0 não detectados |
| Zumbis contaminando capacidade | 0 |
| Intervenções adequadas | 26/26 |
| Impossível avaliar | 4/4 — motor e César concordam nos 4 (fora do denominador de "comparáveis" por metodologia herdada do blind-v1, mas batem também) |

Artefatos: `blind-v2/ROTULOS_HUMANOS_CEGOS.json` (avaliação do César) + `blind-v2/RESULTADO_COMPARACAO.json` (comparação).

### Natureza da avaliação (registrado explicitamente)

Os 30 rótulos são **avaliação baseada nas regras operacionais fornecidas pelo César, aplicada aos casos cegos antes da abertura do gabarito** — um julgamento retrospectivo sobre fatos operacionais de episódios sintéticos já registrados. **Não** representam 30 observações presenciais na loja, nem decisões tomadas durante operação ao vivo.

### Decisão de produto

> **`cv-cal-tata-human-v2` aprovada para integração ao Copiloto exclusivamente em modo sombra.**

Modo sombra: a calibração pode rodar em paralelo à operação real, produzindo classificação/severidade/intervenção sugerida para leitura humana — **sem** disparar alerta, sem aplicar pausa, sem decisão automática. `auto_aplicar: false` continua vigente em toda a config (verificado por teste).

### Limitações obrigatórias

1. **Casos vindos do mesmo ecossistema histórico de dados** — blind-v1 e blind-v2 compartilham o mesmo pool sintético (`sane-episodes-2d3-1784446646346`); 100% de concordância aqui prova aderência às regras do César sobre ESTE gerador de episódios, não generalização a dados de fonte diferente.
2. **Apenas Conferência e Sushi com evidência real** neste holdout — Quentes/Cozinha/Caixa/Motoboy não têm representação própria nos 30 casos (ausência de leitura, não prova de calma).
3. **Ausência de caso legítimo "pronto sem saída ≥40 min"** — achado estrutural do dataset (documentado no manifesto do blind-v2): nenhum dos 4146 episódios brutos do pool atinge esse patamar por esse caminho específico; a faixa crítica equivalente só é alcançada via idade/atraso operacional real.
4. **Ausência de equipe real, complexidade detalhada e ritmo** em parte dos episódios — `capacidade_hipotetica`, não capacidade real medida.
5. **A avaliação confirma aderência às regras do César, não precisão universal** — 60 casos cegos (blind-v1 + blind-v2) é amostra pequena frente a uma operação real de meses.
6. **Nenhuma decisão automática autorizada** — toda saída da calibração é sugestão para leitura humana; pausa nunca é aplicada sem confirmação humana (`auto_aplicar: false`, testado).

### Não criar blind-v3 agora

Não se cria um terceiro holdout sobre o mesmo pool histórico — o ganho marginal seria baixo (mesmo gerador sintético, mesmas regras) e o risco de sobreajuste às particularidades do dataset é real. **A próxima validação** (blind-v3, quando houver) deve usar:

- episódios **novos**, coletados **depois** da integração em modo sombra;
- preferencialmente **dados de operação real** (não mais o pool sintético `sane-episodes-2d3`);
- **novas praças** quando houver leitura confiável (Quentes, Cozinha, Caixa, Motoboy);
- **equipe real, ritmo e composição da carga** quando disponíveis (destrava o ISF numérico completo, hoje só demonstrativo).

### Comando 2D.10

```bash
node tools/comparar_blind_v2.js
node tests/capacidade-viva/calibration/run-blind-v2.js
```
