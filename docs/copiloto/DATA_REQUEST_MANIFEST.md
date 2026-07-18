# Manifesto de Pedido de Dados — Calibração Real do Copiloto

| Campo | Valor |
|---|---|
| Tipo | Contrato de importação (somente especificação) |
| Branch | `grok/copiloto-intelligence-pack` |
| Substitui | baselines e backtests **synthetic_calibrated** |
| Dados reais neste documento | **Nenhum** (não copiar, não anexar, não commitar) |
| Escopo | Worktree isolado do DeliveryOS / pacote Copiloto |
| TATÁ Seleção | Fora de escopo |

---

## 1. Objetivo

Definir **exatamente** quais dados operacionais reais da operação TATÁ são necessários para:

1. recalcular **baselines** (mediana, percentis, intervalo normal por área × dia × faixa horária);
2. recalibrar **limiares** de atraso, desvio de etapa e pressão;
3. reexecutar **backtest** walk-forward de previsão 10/15/30 min **sem vazamento de futuro**;
4. validar **Foco / anomalias / fechamento** em modo sombra com fatos reais.

Enquanto estes dados não estiverem montados no worktree sob política de privacidade, o pacote permanece com série sintética calibrada — rotulada e honesta, **não** produção.

---

## 2. Estrutura local proposta (gitignorada)

### 2.1 Validação da estrutura real do repositório

Observado no worktree:

| Caminho existente | Função atual | Cobertura `.gitignore` |
|---|---|---|
| `data/raw/` + `data/raw/incoming/` | bruto local | **sim** (`/data/raw/*`, `/data/raw/incoming/*`) |
| `data/canonico/` | derivado estruturado | **sim** (`/data/canonico/*`) |
| `data/generated/` | saídas geradas | **sim** (`/data/generated/*`) |
| `data/copiloto/synthetic/` | artefatos sintéticos do pacote | **não** listado à parte (sintético pode versionar) |
| `reports/copiloto/` | relatórios do pacote (sem PII) | versionável se **sem** dado sensível |
| `docs/Politica_Dados.md` | política geral do repo | vigente |

**Nesta tarefa o `.gitignore` não foi alterado.**  
Portanto os caminhos **finais recomendados** usam pastas **já cobertas** pelo ignore existente.

### 2.2 Caminhos finais recomendados

```
data/raw/incoming/copiloto/          # P0–P2: depósitos brutos imutáveis (gitignorado)
  pedidos/
  logistica/
  cancelamentos/
  composicao/
  contexto/                          # promoções, clima (opcional)

data/canonico/copiloto/              # normalizado, pseudonimizado (gitignorado)
  orders.jsonl
  items.jsonl
  stages.jsonl
  areas_minute.jsonl

data/generated/copiloto/             # staged + saídas de calibração (gitignorado)
  staged/
  baselines/
  backtest/
  reports/                           # relatórios com métricas, sem linhas de pedido bruto

reports/copiloto/                    # somente resumos públicos (sem IDs reais, sem PII)
```

| Estágio | Caminho | Conteúdo |
|---|---|---|
| raw | `data/raw/incoming/copiloto/**` | arquivos originais (xlsx/html/csv/jsonl) |
| staged | `data/generated/copiloto/staged/**` | parse validado, ainda local |
| canonical | `data/canonico/copiloto/**` | modelo canônico do Copiloto |
| reports | `data/generated/copiloto/reports/**` + resumo sanitizado em `reports/copiloto/` | MAE, cobertura, gates |

**Proibido:** colocar exports reais em `mocks/copiloto/fixtures/`, `docs/`, ou qualquer path versionado.

---

## 3. Regras transversais (todas as fontes)

| Tema | Regra |
|---|---|
| **Timezone** | America/Sao_Paulo (horário de operação da loja). Timestamps ISO com offset ou convertidos de forma explícita; nunca misturar UTC silencioso com local. |
| **Unidade de tempo** | minutos inteiros para dwell/atraso; segundos só se a fonte nativa for sub-minuto (documentar). |
| **Identificador de pedido** | preferir **ID completo (UUID iFood)**; ID curto só com política de ambiguidade. |
| **Duplicidade** | dedup por `order_id_completo`; se só curto: `id_curto + data/hora aproximada + loja` com `confianca:"baixa"` se ambíguo — **nunca join silencioso**. |
| **Cancelamento** | manter linha; marcar `outcome=cancelled`; **não** apagar do histórico; não usar como pedido “em produção” no minuto. |
| **Reenvio / refeito** | se detectável, ligar `reissue_of` / `related_order_id`; senão registrar `unknown` — não inventar. |
| **Dados ausentes** | campo `null` + epistemic `absent`; proibido imputar carimbo. |
| **Privacidade** | sem nome, telefone, endereço, e-mail, mensagem WhatsApp, áudio, foto de cliente. |
| **Anonimização** | UUID pode ser hasheado com salt local **não commitado**; ID curto pode ser reindexado. Fixtures públicas usam só IDs fictícios (`184`, `191`). |
| **Qualidade mínima global** | ver §6 Gates. |

---

## 4. Fontes e conjuntos de dados

### 4.1 Histórico de pedidos iFood (relatório de pedidos)

| Campo | Valor |
|---|---|
| **Nome** | Histórico de pedidos iFood (pedido-a-pedido) |
| **Finalidade** | Motor A (tempo/estado); volume; atraso vs ciclo; backtest de fila agregada |
| **Sistema de origem** | Portal / export iFood (relatório de pedidos) |
| **Formato aceito** | `.xlsx`, `.xlsx.zip`, CSV estável, JSONL derivado local |
| **Período ideal** | 6–9 meses contínuos (alinhado à auditoria out/2025–jun/2026) |
| **Período mínimo** | 28 dias de operação jantar com cobertura diária ≥ 80% |
| **Granularidade** | 1 linha = 1 pedido (ou 1 transição temporal reconstruível) |
| **Campos obrigatórios** | `order_id_completo` **ou** (`order_id_curto` + `data` + `hora`); `status`/`outcome`; ao menos 2 timestamps de ciclo (ver 4.3) |
| **Campos opcionais** | valores, taxas, canal, agendado, prioridade, rota |
| **Identificador de pedido** | `order_id_completo` (preferencial) |
| **Timestamps necessários** | ver §4.3 |
| **Timezone** | America/Sao_Paulo |
| **Unidade** | pedido; tempo em min |
| **Relacionamento** | base para logística, cancelamentos, composição, avaliações |
| **Qualidade mínima** | ≥ 95% pedidos com `received_at`; ≤ 5% IDs nulos |
| **Duplicidade** | dedup por ID completo; sobreposição com logística = complementação de colunas, não soma de volume |
| **Cancelamento** | status cancelado/declined preservado |
| **Reenvio** | se não houver campo, não inferir |
| **Ausentes** | null; excluir do score de atraso se faltar promessa |
| **Risco de privacidade** | baixo se sem PII de cliente (export padrão) |
| **Anonimização** | hash de UUID opcional |
| **Obrigatório / opcional** | **P0 obrigatório** |
| **Impacto da ausência** | baselines e previsão permanecem sintéticos |
| **Calibra** | `baselines.js`, `thresholds` (atraso/pressão agregada), `forecast` walk-forward |
| **Teste pós-importação** | cobertura diária; unicidade; reconstrução de ciclo; backtest MAE 10/15/30 vs sintético |

---

### 4.2 Horários prometidos

| Campo | Valor |
|---|---|
| **Nome** | Horário prometido ao cliente |
| **Finalidade** | **Atraso do pedido** (vs promessa) — distinto de desvio de etapa |
| **Sistema de origem** | Coluna de promessa no relatório iFood / logística |
| **Formato aceito** | datetime na mesma linha do pedido |
| **Período ideal / mínimo** | igual ao histórico P0 |
| **Granularidade** | por pedido |
| **Campos obrigatórios** | `promised_at` (ou equivalente documentado) |
| **Campos opcionais** | `promised_source`, renegociação de prazo |
| **Identificador** | mesmo do pedido |
| **Timestamps** | `promised_at` |
| **Timezone / unidade** | America/Sao_Paulo; minutos de atraso = now/entrega − promised |
| **Relacionamento** | 4.1, 4.3 |
| **Qualidade mínima** | ≥ 90% pedidos concluídos com promessa preenchida |
| **Duplicidade / cancelamento / reenvio / ausentes** | cancelados: atraso opcional; ausente → `delay.kind=unknown` |
| **Privacidade / anonimização** | n/a operacional |
| **Obrigatório** | **P0** |
| **Impacto da ausência** | só desvio de etapa/fila; sem classificação de atraso de promessa |
| **Calibra** | `classifyPromiseDelay`, risco futuro de prazo, textos de Foco |
| **Teste** | distribuição de atraso p50/p90; taxa unknown |

---

### 4.3 Entrada, aceite, preparo, pronto, despacho e conclusão

| Campo | Valor |
|---|---|
| **Nome** | Marcos do ciclo de vida do pedido |
| **Finalidade** | reconstruir estágios canônicos; dwell; fila por minuto; forecast |
| **Sistema de origem** | Relatório iFood + logística (+ live futuro) |
| **Formato aceito** | colunas datetime por marco na linha do pedido |
| **Período ideal / mínimo** | P0 |
| **Granularidade** | por pedido × marco |
| **Campos obrigatórios (mínimo P0)** | `received_at` (entrada); `ready_at` **ou** `left_store_at` **ou** `delivered_at` (ao menos um marco pós-entrada + desfecho) |
| **Campos obrigatórios (ideal)** | `received_at`, `accepted_at` (aceite), `preparation`/`ready_at` (pronto), `dispatched_at`/`left_store_at` (despacho), `delivered_at` ou `cancelled_at` (conclusão) |
| **Campos opcionais** | tempos derivados oficiais (preparo, alocação, espera loja, etc.) |
| **Identificador** | ID completo |
| **Timestamps necessários** | received, accepted, ready, left_store/dispatched, delivered/cancelled |
| **Timezone / unidade** | America/Sao_Paulo; min |
| **Relacionamento** | 4.1, 4.2, 4.10 |
| **Qualidade mínima** | ordem temporal: received ≤ ready ≤ left ≤ delivered (quando todos presentes); ≤ 2% inversões inexplicáveis |
| **Duplicidade** | um carimbo por marco; reimpressão não cria segundo pedido |
| **Cancelamento** | `cancelled_at` + motivo se houver |
| **Reenvio** | novo `order_id` ou flag explícita |
| **Ausentes** | null; não interpolar |
| **Privacidade** | baixo |
| **Obrigatório** | **P0** (subconjunto); ideal completo **P0+** |
| **Impacto da ausência** | impossível reconstruir ciclo → gate de calibração fecha |
| **Calibra** | modelo canônico, pressão, forecast de fila, follow-up de recuperação |
| **Teste** | % pedidos com ciclo reconstruível; contagem de inversões; STALE (>120 min) como suspeito |

---

### 4.4 Itens e quantidades

| Campo | Valor |
|---|---|
| **Nome** | Composição do pedido (itens × quantidade) |
| **Finalidade** | complexidade, praças envolvidas, risco de conferência, desenviesar motor B |
| **Sistema de origem** | HTML/comanda/export itens; cancelamentos com nomes; API futura |
| **Formato aceito** | CSV/JSONL `order_id, item_name|item_id, qty, [obs]` |
| **Período ideal** | ≥ 14 noites jantar contínuas **ou** 28 dias parciais |
| **Período mínimo** | 7 noites com ≥ 100 pedidos compostos |
| **Granularidade** | 1 linha = 1 item de 1 pedido |
| **Campos obrigatórios** | `order_id`, `item_ref` (id seed ou nome casável), `quantity` ≥ 1 |
| **Campos opcionais** | observação (sem PII), preço unitário, complemento |
| **Identificador** | ID completo preferencial |
| **Timestamps** | `received_at` do pedido (join) |
| **Timezone / unidade** | n/a; quantidade em peças |
| **Relacionamento** | 4.1 + seed `data/cardapio_knowledge_seed.json` (4.5) |
| **Qualidade mínima** | match de nome/id ao seed ≥ 95% dos itens de linha; qty não nula |
| **Duplicidade** | somar qty se mesma linha repetida; não duplicar pedido |
| **Cancelamento** | itens de cancelados são enviesados — rotular `sample_bias=cancellation` se só dessa fonte |
| **Reenvio / ausentes** | obs ausente = null; nunca inventar item |
| **Privacidade** | obs pode conter alergia (operacional OK) — sem nome de pessoa |
| **Anonimização** | IDs de pedido |
| **Obrigatório** | **P1** |
| **Impacto da ausência** | praça/pressão por composição continua sintética/inferida |
| **Calibra** | complexidade, baselines por mix, anomalia “pequenos vs grandes”, Foco de conferência |
| **Teste** | taxa de match ao seed; cobertura de pedidos com composição; replay 1 janela |

---

### 4.5 Mapeamento dos itens por praça

| Campo | Valor |
|---|---|
| **Nome** | Conhecimento item → praça (já parcialmente no seed) |
| **Finalidade** | agregar carga Sushi/Quentes/Cozinha/Conferência |
| **Sistema de origem** | `data/cardapio_knowledge_seed.json` + revisão humana de cardápio |
| **Formato aceito** | JSON seed versionado **ou** planilha de override local gitignorada |
| **Período** | snapshot vigente no período dos pedidos |
| **Granularidade** | 1 item canônico |
| **Campos obrigatórios** | `item_id`, `praca_principal` (ou null explícito), `pracas_dependentes` |
| **Campos opcionais** | temperatura, sacolas, trava, risco_de_erro, sinais |
| **Identificador** | `item_id` do seed |
| **Timestamps** | `valid_from` / `valid_to` se houver mudança de cardápio |
| **Relacionamento** | 4.4 |
| **Qualidade mínima** | 100% dos itens casados no período de calibração têm praça ou `unknown` explícito |
| **Duplicidade** | um id canônico |
| **Ausentes** | item não mapeado → quarentena de linha, não chute de praça |
| **Privacidade** | nenhum |
| **Obrigatório** | **P1** (seed já ajuda; override se cardápio mudou) |
| **Impacto da ausência** | áreas produto (Sushi/Quentes) mal calibradas |
| **Calibra** | `PRACA_TO_AREA`, pressão por área, playbooks |
| **Teste** | `npm run verificar:cardapio` + cobertura de match pós-composição |

---

### 4.6 Cancelamentos

| Campo | Valor |
|---|---|
| **Nome** | Relatório / eventos de cancelamento |
| **Finalidade** | desfecho; aprendizado; não contaminar fila viva |
| **Sistema de origem** | iFood cancelamentos / status CANCELLED |
| **Formato aceito** | xlsx/csv com motivo, origem, data |
| **Período ideal** | mesmo recorte P0 |
| **Período mínimo** | 28 dias |
| **Granularidade** | 1 cancelamento |
| **Campos obrigatórios** | ref de pedido, `cancelled_at`, status |
| **Campos opcionais** | motivo, origem, itens cancelados, contestação |
| **Identificador** | completo se possível; curto+tempo com cautela |
| **Timestamps** | `cancelled_at` |
| **Relacionamento** | 4.1, 4.4 |
| **Qualidade mínima** | join resolvido ≥ 90% com política de confiança |
| **Duplicidade** | 1 evento canônico por cancelamento |
| **Cancelamento** | é o objeto |
| **Reenvio** | se pedido substituto existir, linkar |
| **Ausentes** | motivo null permitido |
| **Privacidade** | sem dados de cliente |
| **Obrigatório** | **P0** (via status no histórico) / detalhe motivo **P1** |
| **Impacto da ausência** | desfecho pobre; fechamento com menos aprendizado |
| **Calibra** | outcome, unexplained do fechamento, métricas de produto |
| **Teste** | taxa de join; % cancelados no volume; não entrada em wP/wE |

---

### 4.7 Reenvios

| Campo | Valor |
|---|---|
| **Nome** | Pedidos refeitos / reenviados |
| **Finalidade** | não contar volume/atraso em dobro; memória de ocorrência |
| **Sistema de origem** | iFood (se houver) ou registro operacional manual no fechamento |
| **Formato aceito** | flag em pedido; ou tabela `original_id, reissue_id, at` |
| **Período** | P0 se existir; senão P2 via fechamento |
| **Granularidade** | par de pedidos |
| **Campos obrigatórios** | `original_order_id`, `reissue_order_id` **ou** relato humano no fechamento |
| **Opcionais** | motivo |
| **Identificador** | IDs completos |
| **Timestamps** | `reissued_at` |
| **Relacionamento** | 4.1, 4.6, 4.8 |
| **Qualidade mínima** | se fonte existir, 100% dos pares com ambos IDs válidos |
| **Duplicidade** | um par único |
| **Ausentes** | comum — marcar `reissue_tracking=unavailable` |
| **Privacidade** | baixo |
| **Obrigatório** | **P2** (opcional se não houver fonte) |
| **Impacto da ausência** | possível dupla contagem residual; aprendizado limitado |
| **Calibra** | memória de turno, playbooks de erro |
| **Teste** | se importado: zero double-count de volume no mesmo cliente-ciclo |

---

### 4.8 Ocorrências

| Campo | Valor |
|---|---|
| **Nome** | Ocorrências operacionais (equipamento, falta, decisão humana) |
| **Finalidade** | perguntas de fechamento; hipóteses vs fatos |
| **Sistema de origem** | fechamento do Copiloto, planilha local, não WhatsApp bruto |
| **Formato aceito** | JSONL local: `at, type, area, text_operacional, epistemic=human_report` |
| **Período ideal** | contínuo após piloto sombra |
| **Período mínimo** | 5 turnos com fechamento |
| **Granularidade** | 1 ocorrência |
| **Campos obrigatórios** | `at`, `type`, `text` (sem PII) |
| **Opcionais** | `area`, `equipment`, `shift_id` |
| **Identificador** | `occurrence_id` local |
| **Timestamps** | `at` |
| **Relacionamento** | memória de turno, playbooks |
| **Qualidade mínima** | texto sem nome de cliente; tipo controlado |
| **Privacidade** | **médio** se mal preenchido — proibir nomes/telefones |
| **Anonimização** | strip de PII na entrada |
| **Obrigatório** | **P2** (gerado pelo próprio fechamento após piloto) |
| **Impacto da ausência** | fechamento com 0 perguntas úteis; sem aprendizado estrutural |
| **Calibra** | `shift-closing`, `shift-memory`, microcoaching de processo |
| **Teste** | zero PII no payload; epistemic=human_report |

---

### 4.9 Conferência (quando disponível)

| Campo | Valor |
|---|---|
| **Nome** | Eventos / tempos de conferência e montagem |
| **Finalidade** | pressão real de Conferência (não só proxy de pronto) |
| **Sistema de origem** | KDS, comanda, app de conferência, live `comanda_impressa` |
| **Formato aceito** | eventos `order_id, conference_start, conference_end` ou dwell |
| **Período ideal** | ≥ 14 dias com eventos |
| **Período mínimo** | 7 dias |
| **Granularidade** | por pedido ou por evento |
| **Campos obrigatórios** | `order_id` + ao menos um de start/end/dwell |
| **Opcionais** | sacolas, checklist, risco_erro |
| **Timestamps** | start/end |
| **Relacionamento** | 4.1, 4.4, live |
| **Qualidade mínima** | freshness documentada; ≤ 10% eventos órfãos |
| **Privacidade** | baixo |
| **Obrigatório** | **P2** se existir fonte; senão proxy documentado |
| **Impacto da ausência** | Conferência continua inferida (pronto + composição) |
| **Calibra** | thresholds `conferencia`, anomalia buildup, playbook conferência |
| **Teste** | correlação proxy vs evento real; MAE de fila conferência |

---

### 4.10 Motoboy e saída (quando disponíveis)

| Campo | Valor |
|---|---|
| **Nome** | Tempos logísticos de saída / entregador |
| **Finalidade** | pressão Motoboy; Foco de saída; forecast de prontos parados |
| **Sistema de origem** | Relatório Logística iFood (alocação, espera na loja, saiu, entregue) |
| **Formato aceito** | xlsx logística 29 col (ou subset) |
| **Período ideal** | ≥ 3 meses; mínimo 28 dias |
| **Granularidade** | por pedido |
| **Campos obrigatórios** | `order_id_completo`, `left_store_at` **ou** tempo de espera na loja + ready |
| **Opcionais** | alocação, distância, serviço logístico, agrupamento de rota |
| **Timestamps** | alocado, chegou loja, saiu, entregue |
| **Relacionamento** | 4.1 (dedup 99,7% documentado) |
| **Qualidade mínima** | join por ID completo ≥ 98% no overlap |
| **Duplicidade** | complementa colunas; não soma pedidos |
| **Cancelamento** | excluir de “prontos sem sair” |
| **Privacidade** | sem endereço de entrega no pacote Copiloto (não importar) |
| **Obrigatório** | **P1** (fortemente recomendado) / **P0** se coluna já no relatório principal |
| **Impacto da ausência** | Motoboy só por proxy de expedição do motor |
| **Calibra** | área `motoboy`, anomalia couriers, forecast saída |
| **Teste** | p50/p90 espera na loja; fila de prontos |

---

### 4.11 Disponibilidade de motoboys (quando disponível)

| Campo | Valor |
|---|---|
| **Nome** | Contagem / status de entregadores disponíveis |
| **Finalidade** | anomalia “motoboy livre + pedidos prontos”; forecast de capacidade de saída |
| **Sistema de origem** | painel logística, app interno, registro manual de turno |
| **Formato aceito** | série temporal `at, available_couriers` (minuto ou 5 min) |
| **Período mínimo** | 7 jantares |
| **Granularidade** | snapshot temporal (não por pedido) |
| **Campos obrigatórios** | `at`, `available_couriers` ≥ 0 |
| **Opcionais** | `on_route`, `waiting_at_store` |
| **Identificador** | n/a (agregado) — **sem nome de entregador** |
| **Privacidade** | **proibido** ranking ou id de pessoa; só contagem |
| **Obrigatório** | **P2** opcional |
| **Impacto da ausência** | anomalia de idle courier desligada |
| **Calibra** | `anomalies` courier idle; briefing de saída |
| **Teste** | zero campo de pessoa; coerência com picos de saída |

---

### 4.12 Caixa (quando disponível)

| Campo | Valor |
|---|---|
| **Nome** | Fila / eventos de Caixa |
| **Finalidade** | área `caixa` hoje sem instrumentação |
| **Sistema de origem** | PDV, senha, observação manual |
| **Formato aceito** | `at, queue_depth` ou eventos de atendimento |
| **Período mínimo** | 7 dias se for calibrar a área |
| **Campos obrigatórios** | timestamp + métrica de fila ou tempo |
| **Privacidade** | sem dados de cliente de pagamento além do necessário (preferir só fila) |
| **Obrigatório** | **P2** opcional |
| **Impacto da ausência** | área caixa permanece `data_quality=incomplete` / confiança baixa |
| **Calibra** | thresholds `caixa` |
| **Teste** | não elevar Foco de caixa com confiança inventada |

---

### 4.13 Escala ou capacidade operacional (quando disponível)

| Campo | Valor |
|---|---|
| **Nome** | Escala / cabeças por área e turno |
| **Finalidade** | baselines condicionados a capacidade; briefing |
| **Sistema de origem** | escala RH/loja (agregada) |
| **Formato aceito** | `date, shift, area, headcount` |
| **Período mínimo** | 28 dias |
| **Campos obrigatórios** | data, turno, área, contagem |
| **Proibido** | nomes de funcionários em qualquer export usado pelo Copiloto |
| **Obrigatório** | **P1** opcional mas de alto valor |
| **Impacto da ausência** | baselines só por volume, sem normalizar por equipe |
| **Calibra** | baselines condicionais; microcoaching de processo (não de pessoa) |
| **Teste** | zero PII; join por data/turno |

---

### 4.14 Promoções

| Campo | Valor |
|---|---|
| **Nome** | Promoções e campanhas |
| **Finalidade** | explicar picos de volume/mix |
| **Sistema de origem** | portal iFood / operação |
| **Formato aceito** | `start, end, name_operacional, channel` |
| **Período** | sobreposto ao P0 |
| **Campos obrigatórios** | janela temporal |
| **Obrigatório** | **P1** se campanhas forem frequentes; senão P2 |
| **Privacidade** | baixo |
| **Calibra** | briefing, comparação “normal pra sexta”, forecast com feature de promo |
| **Teste** | flags de dia com promo vs volume |

---

### 4.15 Clima e eventos (fontes futuras opcionais)

| Campo | Valor |
|---|---|
| **Nome** | Chuva/temperatura; feriados; jogos/eventos locais |
| **Finalidade** | contexto externo **só com impacto validado** |
| **Sistema de origem** | Open-Meteo/INMET; calendário; feed de eventos |
| **Formato aceito** | série horária agregada na loja (sem GPS de cliente) |
| **Período** | alinhado ao P0 se for usar |
| **Campos obrigatórios** | `at`, `signal_id`, `value` |
| **Obrigatório** | **P2 opcional** — não usar só porque existe |
| **Privacidade** | nenhum dado pessoal |
| **Gate de uso** | `shouldUseSignal` exige `validated=true` (evidência de impacto na loja) |
| **Calibra** | `external-signals`, briefing |
| **Teste** | sinal sem validação **não** entra em forecast de produção |

---

## 5. Ordem de prioridade

### P0 — necessário para calibração inicial

Mínimo para baselines, atraso e previsão de fila:

1. Histórico de pedidos iFood (4.1)  
2. Horários prometidos (4.2)  
3. Marcos de ciclo reconstruíveis (4.3)  
4. Status de cancelamento no histórico (4.6 básico)  
5. Preferencialmente colunas de saída/logística já no mesmo export (4.10 parcial)

**Critério de “P0 completo”:** ≥ 28 dias, ciclo reconstruível em ≥ 70% dos pedidos, promessa em ≥ 90% dos concluídos, unicidade de ID completo ≥ 99%.

### P1 — necessário para melhorar precisão

1. Itens e quantidades (4.4)  
2. Mapeamento item→praça atualizado (4.5)  
3. Logística rica / espera na loja (4.10)  
4. Motivos de cancelamento (4.6 detalhe)  
5. Escala agregada (4.13)  
6. Promoções (4.14) se relevantes  

### P2 — inteligência avançada

1. Conferência eventada (4.9)  
2. Disponibilidade de motoboys agregada (4.11)  
3. Caixa (4.12)  
4. Reenvios explícitos (4.7)  
5. Ocorrências de fechamento (4.8)  
6. Clima/eventos validados (4.15)  

---

## 6. Critérios (gates) para usar os dados

| Gate | Critério mínimo | Se falhar |
|---|---|---|
| **Cobertura** | P0: ≥ 28 dias com ≥ 80% dias úteis de jantar representados | não recalibrar; manter sintético |
| **Consistência temporal** | ≤ 2% de marcos fora de ordem sem cancelamento | quarentenar pedidos afetados |
| **Unicidade** | ≥ 99% IDs completos únicos por loja no período | dedup obrigatório; relatório de colisões |
| **Taxa de ausentes** | `received_at` missing ≤ 5%; promessa missing ≤ 10% em concluídos | atraso/forecast degradados |
| **Estabilidade de schema** | colunas P0 estáveis entre meses (renomear documentado) | parser versionado; não misturar sem adapter |
| **Ciclo reconstruível** | ≥ 70% pedidos com received + (ready ou left ou delivered/cancel) | gate P0 falha |
| **Split temporal** | treino = prefixo; teste = sufixo (ex. últimos 7–14 dias); **proibido** embaralhar aleatório entre tempos | invalidar backtest |
| **Sem vazamento futuro** | em t, só eventos com `occurred_at ≤ t` (e `captured_at` se live) | invalidar métricas |
| **Privacidade** | zero PII nos paths canônicos e em reports versionados | bloquear import |
| **Rotulagem** | todo artefato declara `source=historical_export` vs `synthetic_calibrated` | não publicar como “real” indevido |

---

## 7. Proteção de dados

1. **Dados reais não entram em commit** — usar apenas paths já gitignorados (`data/raw/**`, `data/canonico/**`, `data/generated/**`).  
2. **Não necessários:** nomes, telefones, endereços, e-mails, mensagens, áudios, fotos.  
3. **Identificadores:** UUID pode ser pseudonimizado com salt local fora do git.  
4. **Importar só campos operacionais mínimos** listados como obrigatórios.  
5. **Fixtures e relatórios publicados** (`mocks/`, `reports/copiloto/*.md` versionados): somente IDs fictícios, agregados e métricas — **nunca** linha de pedido real.  
6. **Sem vigilância:** escala só em headcount por área; proibido desempenho individual.

---

## 8. Fluxo de importação (quando autorizado)

```
bruto → inventário (este manifesto) → parser → validação/gates →
relatório local (data/generated/copiloto/reports) → aprovação humana →
canonical → rebuild baselines → backtest walk-forward →
comparar vs synthetic_calibrated → só então atualizar DEFAULT_THRESHOLDS
com PR de calibração (fora desta tarefa)
```

Alinhado a: *bruto → inventário → parser → validação → relatório → aprovação humana → integração*.

---

## 9. Testes a executar após importação real

| Ordem | Teste | Saída esperada |
|---|---|---|
| 1 | Inventário de arquivos + hashes locais | lista no relatório local (não commit) |
| 2 | Gate de cobertura/unicidade/ausentes | pass/fail |
| 3 | Rebuild `buildBaselines` com canônico | `data/generated/copiloto/baselines/` |
| 4 | Backtest 10/15/30 walk-forward | MAE, p90 erro, por horário/área |
| 5 | Recalcular limiares propostos (não auto-aplicar) | diff sugerido vs `DEFAULT_THRESHOLDS` |
| 6 | `npm run copiloto:test` | suite de regressão do pacote ainda 53/53+ |
| 7 | Modo sombra em 3 turnos (se live) | logs de acerto/erro de Foco |

---

## 10. Relação com o que já existe no pacote

| Artefato atual | Status até P0 real |
|---|---|
| `baselines.generateSyntheticHistory` | válido como **provisório** |
| `reports/copiloto/BACKTEST_REPORT.*` | sintético — rotulado |
| `docs/copiloto/DATA_AUDIT.md` | auditoria do ambiente; este manifesto pede o que falta |
| Fixtures 01–30 | permanecem sintéticas/canônicas de contrato para o Claude |

---

## 11. Checklist rápido para o operador de dados

- [ ] Export P0 em `data/raw/incoming/copiloto/pedidos/`  
- [ ] Sem colunas de PII  
- [ ] Timezone America/Sao_Paulo documentado  
- [ ] Período e loja anotados em README **local** (gitignorado)  
- [ ] Gates §6 avaliados  
- [ ] Aprovação humana registrada antes de qualquer mudança de limiar em código  
- [ ] Nada disso commitado  

---

## 12. Resumo executivo

| Prioridade | O que pedir agora |
|---|---|
| **P0** | 28+ dias de pedidos com ID completo, promessa, marcos de ciclo, desfecho |
| **P1** | composição item×qty + logística/saída + escala agregada + promos se houver |
| **P2** | conferência eventada, contagem de motoboys, caixa, reenvios, ocorrências, clima validado |

**Sem P0 real, o Copiloto continua cérebro + contrato + mock — correto e honesto, mas não calibrado na loja.**
