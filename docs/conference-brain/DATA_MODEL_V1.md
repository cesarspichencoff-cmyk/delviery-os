# Modelo de dados — Cérebro da Conferência V1

Definido em `src/conference-brain/contracts/schemas.js`. Nove entidades. Toda
entidade tem **chave natural** (não id sintético), para que a mesma observação
processada duas vezes produza o mesmo registro.

## 1. As nove entidades

| Entidade | Chave natural | Papel |
|---|---|---|
| `ingestion_runs` | `run_id` | uma execução de ingestão |
| `ingestion_raw_records` | `record_id` | L0 imutável: o bruto observado, com hash |
| `orders` | `order_id` | o pedido |
| `order_items` | `order_id` + `line_index` | linha de item do pedido |
| `order_status_events` | `order_id` + `status` + `event_at` | evento de mudança de estado |
| `operational_snapshots` | `snapshot_at` + `window_minutes` | a janela operacional |
| `ingestion_anomalies` | `anomaly_id` | duplicidade, divergência, rejeição |
| `conference_state` | `snapshot_at` | leitura sombra da Conferência |
| `source_evidence` | `evidence_id` | ponteiro + hash para o trecho de origem |

### Campos por entidade (obrigatórios em **negrito**)

**orders** — **order_id**, **external_id**, **channel**, **status**,
**first_observed_at**, **last_observed_at**, **confidence**, **source** ·
opcionais: `unit`, `received_at`, `confirmed_at`, `ready_at`, `dispatched_at`,
`cancelled_at`, `concluded_at`, `total_value`, `distinct_items`, `total_units`.

**order_items** — **order_id**, **line_index**, **raw_name**,
**normalized_name**, **quantity**, **confidence** · opcionais:
`external_item_id`, `complements`, `observation`, `catalog_item_id`,
`catalog_match`.

**operational_snapshots** — **snapshot_at**, **window_minutes**,
**active_orders**, **received_in_window**, **ready_in_window**,
**concluded_in_window**, **source_state**, **confidence**, **rule_version** ·
opcionais: `convergence`, `avg_ready_minutes`, `queue_delta`, `notes`.

**conference_state** — **snapshot_at**, **mode**, **base_state**,
**suggested_state**, **active_orders**, **reasons**, **source_health**,
**confidence**, **rule_version** · opcionais: `missing_data`, `modifiers`,
`window_minutes`.

Note que `active_orders` é **obrigatório** em `conference_state` — mas aceita
`null`. Isso é proposital: a ausência precisa ser *declarada*, não omitida.

## 2. Dois vocabulários de estado, deliberadamente separados

Misturar "a fonte está quebrada" com "a Conferência está sob pressão" é o erro
clássico que faz um sistema gritar por causa de um parser. Aqui são conjuntos
distintos (`contracts/states.js`):

**Estado da FONTE** — `disponivel` · `parcial` · `atrasada` · `inconsistente` ·
`indisponivel` · `recuperando`.

**Estado da CONFERÊNCIA** — `calmo` · `fluindo` · `atencao` · `urgencia` ·
`leitura_parcial` · `fonte_indisponivel`.

Duas listas governam o cruzamento:

- `SOURCE_BLOCKS_CONFIDENT_READING` = [`indisponivel`, `inconsistente`] →
  o estado vira `leitura_parcial`/`fonte_indisponivel`, jamais uma faixa.
- `SOURCE_DEGRADES_READING` = [`parcial`, `atrasada`, `recuperando`] →
  a faixa continua, mas a confiança cai para `media`.

## 3. Privacidade por construção

`FORBIDDEN_FIELDS` rejeita no `validate()` — antes de qualquer gravação:

```
customer_name · nome_cliente · telefone · phone · endereco · address
cpf · email · message_text · texto_mensagem
```

Um registro com qualquer um desses campos é rejeitado com
`campo_proibido_pii:<campo>` e vai para quarentena. A observação do cliente
(`observation`) é preservada porque é instrução de preparo — não identificação.

Além disso, `validate()` rejeita `modo_nao_permitido_no_sprint1:` para qualquer
`conference_state` cujo `mode` não seja `shadow`. O modo sombra é validado na
porta de entrada da persistência, não só na lógica.

## 4. Persistência

JSONL append-only, um arquivo por entidade:
`data/conference-brain/<entidade>.runtime.jsonl` (já coberto pelo `.gitignore`
existente via `*.runtime.jsonl`).

**Por que JSONL e não um banco:** o repositório tem zero dependências de runtime
— `package.json` só tem devDeps. Introduzir um banco no Sprint 1 seria uma
decisão de infraestrutura maior que a própria fundação. JSONL preserva o
princípio append-only, é auditável a olho nu e é reconstruível.

O contrato de `Store` (`put/get/has/all/count/clear/load/health`) é a fronteira:
trocar para SQLite ou Postgres depois **não exige mudar** ingestão, snapshots
nem estado sombra. O store nunca lança por erro de I/O — coleta em `failures` e
reporta em `health()`, mesma disciplina de falha segura do modo sombra.

## 5. Idempotência

`put()` grava pela chave natural: reprocessar a mesma fonte não duplica. Provado
na validação real — 3.465 registros observados produzem 3.429 pedidos, e uma
segunda execução produz exatamente os mesmos 3.429.

## 6. Versionamento de regra

Nenhum número mágico vive solto no código. Toda regra passa por `defineRule`,
que **lança** se faltar `id`, `version`, `date` ou `source`:

| Regra | Parâmetros | Modo |
|---|---|---|
| `LOAD_BANDS_V1` | `calm_below:30`, `flowing_below:50`, `attention_below:70` | shadow |
| `CONFERENCE_SHADOW_V1` | `window_minutes:5`, `high_convergence_ready_in_window:8`, `queue_growing_consecutive_windows:2`, `ready_time_growth_ratio:1.25`, `attention_floor_active:20` | shadow |
| `SNAPSHOT_WINDOW_V1` | `window_minutes:5`, `supported_minutes:[5,10]` | shadow |
| `COMPOSITION_HINTS_V1` | `many_units_threshold:12`, `multi_volume_units_threshold:18` | shadow |

Cada saída carrega `rule_version` com a referência da regra que a produziu. Uma
leitura antiga sempre pode ser explicada pela regra que existia na hora.
