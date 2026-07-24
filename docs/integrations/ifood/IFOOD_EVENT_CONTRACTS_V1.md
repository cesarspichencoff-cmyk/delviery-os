# Contratos normalizados — v1

Todos em `src/integrations/ifood-official/contracts/`. IMPLEMENTADO e
testado (`tests/integrations/ifood-official/contracts.test.js`), exceto
onde marcado HIPÓTESE.

## 1. Fronteira dura: payload externo × evento normalizado × estado reconciliado × ação

```
payload externo bruto (HIPÓTESE de formato)
        | receivers/payload-mapper.js (único lugar que traduz `code` -> EVENT_TYPES)
        v
IfoodEventEnvelope (contracts/envelope.js)     <- evento NORMALIZADO
        | inbox/inbox.js
        v
registro em ifood_events_inbox                  <- persistido, idempotente
        | reconciliation/reconciler.js
        v
IfoodOrderSnapshot (contracts/order-snapshot.js) <- estado RECONCILIADO
        | negotiation/negotiation-engine.js ou outbox/outbox.js
        v
IfoodNegotiationAction / outbox record           <- ação PREPARADA
        | (nunca chega a acontecer nesta missão)
        v
ação ENVIADA + IfoodEventAcknowledgement          <- confirmação externa
```

Nunca se pula uma etapa; o formato externo bruto nunca vaza para além de
`payload-mapper.js` (só o `payload_hash` sobrevive, nunca o corpo).

## 2. MerchantReference / IfoodOrderReference (`references.js`)

Elo estável entre IDs externos e internos. `merchant_id_source` distingue
`"confirmado"` (mapeamento humano já feito) de `"nao_mapeado"` — nunca
inventa a correspondência.

## 3. EVENT_TYPES (`event-types.js`) — HIPÓTESE DE IMPLEMENTAÇÃO

17 tipos (`order_placed` … `merchant_status_changed`, mais `unknown`),
baseados no padrão público geral de integrações Order/Events de
marketplaces de delivery — **nunca verificados contra uma resposta real da
API do iFood**. `ORDER_PROGRESS_RANK` define a progressão de produção
usada só para detectar regressão, nunca para inventar ordem entre eventos
paralelos (courier, disputa).

## 4. IfoodEventEnvelope (`envelope.js`)

`buildEventEnvelope()` — único ponto de entrada do formato externo.
Identidade real (`eventIdentityKey`): `external_event_id` quando existe;
senão, `tipo+merchant+pedido+hash do payload` (nunca tipo+merchant+pedido
sozinho — colapsaria eventos distintos sem ID). `internal_event_id` é a
chave natural persistida — estável para o MESMO fato, mesmo entregue por
fontes diferentes (webhook + polling).

## 5. IfoodOrderSnapshot (`order-snapshot.js`)

`ORDER_STATUS`: 8 valores + `CONFLICT` (explícito, nunca uma escolha
arbitrária quando dois eventos de progressão empatam no tempo sem
causalidade — ver `IFOOD_RECONCILIATION_V1.md`). `EVENT_TO_STATUS` mapeia
os eventos de progressão para o status; eventos paralelos (courier,
disputa) nunca mudam `order_status`.

## 6. IfoodEventAcknowledgement (`acknowledgement.js`)

Forma da confirmação enviada ao provedor. Nesta missão, nunca sai da
outbox (`status` fica em `prepared`/`pending`, nunca `sending` de verdade).

## 7. IfoodDeliveryState / IfoodCourierState (`delivery.js`)

Logística SEPARADA de produção. `courier_reference` e `location_hint` são
sempre referências opacas — nunca nome, telefone ou geolocalização bruta;
`location_hint` só é preenchido quando `locationAuthorized === true` for
passado explicitamente pelo chamador (nunca por padrão).

## 8. IfoodCancellationRequest / IfoodDispute (`cancellation.js`)

Fluxos paralelos, nunca fundidos com `order_status` diretamente pelo
contrato (a fusão acontece, quando acontece, na reconciliação —
cancelamento é o único evento paralelo que É terminal por regra de
negócio, ver `IFOOD_RECONCILIATION_V1.md` §3).

## 9. IfoodNegotiationAction (`negotiation.js`)

`buildNegotiationAction()` sempre devolve `status: "prepared"` — é
estruturalmente impossível construir uma ação já autorizada por este
contrato. 7 tipos de ação (`cancellation`, `deadline_extension_request`,
`structured_response`, `missing_item_report`, `alternative_proposal`,
`structured_refund`, `dispute_response`) — nunca chat livre.

## 10. IfoodIntegrationHealth (`health.js`, forma) + `health/health.js` (cálculo)

Ver `IFOOD_SECURITY_PRIVACY_V1.md` e o próprio módulo — projeção só-leitura,
nunca escreve em nenhum painel de produção.

## 11. ExternalPackagingCapability (`packaging.js`)

Ver documento dedicado `IFOOD_PACKAGING_CAPABILITY_V1.md`.

## 12. Autenticação (`auth.js`) — SOMENTE FORMA, DEPENDENTE DE CREDENCIAL

`buildAuthConfig()` valida presença de `client_id_ref`/`client_secret_ref`/
`token_url`/`token_ttl_seconds` — todos REFERÊNCIAS ou valores
configuráveis, nunca segredo em texto. `evaluateTokenState()` é puro
(recebe `now` injetável) e nunca lê relógio de verdade em teste.

## 13. Registro de schemas (`schemas.js`)

Independente de `conference-brain/contracts/schemas.js` — nenhum require
cruzado. `FORBIDDEN_FIELDS` recusa por NOME de campo
(`customer_name`, `customer_phone`, `customer_address`, `customer_note`,
`raw_token`, `raw_secret`, `cookie`, `session_token`) antes mesmo de olhar
o valor.
