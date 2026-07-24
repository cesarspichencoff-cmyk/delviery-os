# Inbox e outbox persistentes — v1

IMPLEMENTADO, testado (`tests/integrations/ifood-official/storage-inbox.test.js`,
`outbox.test.js`). Persistência: `storage/store.js` — JSONL append-only
independente do conference-brain (ver `IFOOD_EXISTING_ASSETS_INVENTORY.md` §3.1).

## 1. Inbox (`inbox/inbox.js`)

### 1.1 Estados

`received` → `validated` → `normalized` → `processed` → `acknowledged`
(terminal) · `duplicated` (nunca substitui o registro original) ·
`quarantined` (terminal) · `failed` (não-terminal — pode ser reprocessado)
· `expired` (terminal). `TERMINAL_STATUS` = `[acknowledged, quarantined,
expired]` — só esses saem de `pending()`.

### 1.2 Idempotência real

`internal_event_id` = hash da IDENTIDADE do evento
(`contracts/envelope.js#eventIdentityKey`) — `external_event_id` quando o
provedor fornece um; senão, `tipo+merchant+pedido+hash do payload`. Retry
do MESMO evento (mesma identidade) — por qualquer fonte, webhook ou
polling — nunca cria um segundo registro; `receive()` devolve
`status:"duplicated"` apontando para o registro já existente, **sem
regredir** seu `processing_status` (um evento já `acknowledged` continua
`acknowledged` mesmo se "recebido" de novo).

Eventos DISTINTOS (identidade diferente) nunca são colapsados, mesmo que
resultem no mesmo estado final — provado em teste com dois eventos
`ready_for_pickup` distintos.

### 1.3 Quarentena

Dois motivos automáticos, cobertos por teste:
- payload que não bate com `buildEventEnvelope()` (forma inválida —
  `event_type`/`source`/`received_at` ausentes ou inválidos);
- `schema_version` fora de `KNOWN_SCHEMA_VERSIONS` (`["v0","v1"]`) — versão
  desconhecida NUNCA é adivinhada/coagida.

Quarentena sempre persiste (mesmo sem `external_event_id`/`payload_hash`
— ambos opcionais no schema exatamente por isso: a escrita não pode falhar
justo no caso que mais precisa ficar auditável). `quarantine_reason`
declarado, nunca vago.

### 1.4 Corrupção parcial

`storage/store.js#load()` — linha JSONL corrompida vira entrada em
`corrupted_lines[]` (hash + tamanho, nunca conteúdo — usa `e.name`, nunca
`e.message`, porque o V8 atual pode embutir um trecho da entrada inválida
na mensagem de erro). Linhas válidas ao redor continuam carregando —
provado com PII no meio de uma linha corrompida, nunca vazada.

### 1.5 Contadores de processo (`inbox.stats()`)

`duplicates_seen`, `quarantined_seen` — em memória, nunca persistidos,
nunca sobrevivem a reinício. Alimentam `health/health.js` para diagnóstico
do processo atual; a fonte de verdade durável continua sendo
`processing_status` de cada registro.

## 2. Outbox (`outbox/outbox.js`)

### 2.1 Estados e transições válidas

```
prepared -> authorized | cancelled | expired
authorized -> pending | cancelled | expired
pending -> sending | cancelled | expired
sending -> confirmed | retryable_failure | permanent_failure
retryable_failure -> pending | permanent_failure | expired
confirmed / permanent_failure / cancelled / expired -> (terminal)
```

Qualquer transição fora dessa tabela é recusada com
`transicao_invalida:<de>-><para>`, nunca silenciosamente aceita.

### 2.2 Autorização humana explícita — regra dura

`authorize(idempotencyKey, authorizedBy)` recusa sem `authorizedBy`.
`prepare()` NUNCA produz um registro em outro estado que não `prepared` —
verificado em teste; não existe caminho de código que pule a autorização.

### 2.3 Idempotência

`prepare()` com a MESMA `idempotency_key` duas vezes devolve o registro
existente (`idempotent:true`), nunca cria um segundo.

### 2.4 Nenhuma ação é enviada externamente nesta missão

`markSending()` é só uma transição de estado, para uso futuro por um
adapter real — nenhum código desta missão chama rede a partir daqui.
Confirmado por escopo: nenhum teste depende de I/O externo, nenhum
`fetch`/`http.request` existe em `outbox/`.

### 2.5 Escrita nunca finge sucesso

Se uma transição for aceita pela máquina de estados mas rejeitada pelo
schema de persistência (ex.: campo desconhecido), `transition()` devolve
`ok:false` com o registro **anterior real**, nunca o estado tentado que
não foi de fato salvo — bug encontrado e corrigido durante o desenvolvimento
desta missão (campos `authorized_by`/`authorized_at` faltavam no schema).
