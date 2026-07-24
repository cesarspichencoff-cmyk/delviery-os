# Reconciliação determinística — v1

IMPLEMENTADO, testado (`tests/integrations/ifood-official/reconciliation.test.js`,
9 casos). `reconciliation/reconciler.js#reconcileOrder(orderId, inboxEvents)`
— puro, sem I/O.

## 1. Invariante central

A MESMA coleção de eventos produz o MESMO `IfoodOrderSnapshot` final,
independente da ordem de chegada. Provado com replay forward, invertido e
embaralhado convergindo byte-a-byte (exceto `last_reconciled_at`, que é
timestamp de computação, não parte do fato reconciliado).

## 2. Como (mesma lição do Sprint 2.4 do conference-brain, reimplementada de forma independente)

1. **Dedup por identidade real** (`internal_event_id`) — nunca por posição
   no array.
2. **Agrupa por timestamp EFETIVO** (`occurred_at` quando o provedor
   informa, senão `received_at`) via `Map` — a construção de um `Map` não
   depende da ordem de inserção para o conjunto final de chaves.
3. **Dois eventos de PROGRESSÃO contraditórios no MESMO timestamp**, sem
   causalidade mais forte disponível, viram `ORDER_STATUS.CONFLICT`
   explícito — nunca uma escolha arbitrária. Provado em teste.
4. **Cancelamento é terminal e sempre vence** — fato observado, nunca
   suposto a partir de outra coisa.
5. **Regressão de progresso nunca é escondida** (vira anomalia
   `regressao_de_progresso` no array `anomalies`), mas o evento mais
   recente por timestamp ainda decide o estado atual — a fonte mais
   fresca manda, a anomalia fica registrada para investigação humana,
   nunca oculta.
6. **Eventos paralelos e desconhecidos** (courier, disputa, `code` nunca
   documentado) nunca mudam `order_status` — só entram em `provenance`.

## 3. Fora de ordem vs. empate — a distinção que importa

"Fora de ordem" (entrega ≠ ocorrência) é resolvido de graça pelo passo 2:
um evento avançado entregue ANTES de um evento anterior no tempo real
ainda produz o resultado correto, porque a ordenação usa `occurred_at`,
nunca ordem de chegada. Só quando dois eventos têm o MESMO `occurred_at` E
representam fatos de progressão contraditórios é que a situação vira
conflito explícito (passo 3) — provado com os dois cenários separados em
teste.

## 4. O que a reconciliação NUNCA faz

Não escolhe "o mais recente venceu" quando dois candidatos empatam sem
causalidade; não usa hash sem semântica causal para inventar qual fato
ocorreu depois (hash é usado só para tornar a REPRESENTAÇÃO do conflito
determinística, nunca para decidir ordem — mesma disciplina do
`grouping.js#buildConflict` do conference-brain); não infere `order_status`
de eventos paralelos; não descarta duplicata em silêncio (dedupe é
contado em `duplicate_count`, nunca escondido).

## 5. Limitação conhecida, registrada com honestidade

O reconciliador não recebe (porque a inbox e os contratos desta missão não
os capturam ainda) nenhum metadado causal mais forte que `occurred_at`
(sem `sequence`/`version` por evento vindos do provedor real — HIPÓTESE
não confirmada se a API real oferece algo assim). Quando dois eventos
empatam sem esse metadado, o resultado é sempre `CONFLICT` — correto e
seguro, mas menos informativo do que seria com uma fonte causal real.
