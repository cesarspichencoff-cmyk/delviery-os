# Arquitetura da integração oficial — v1

> Legenda usada em todo este conjunto de documentos: **IMPLEMENTADO**
> (código real, testado, `tests/integrations/ifood-official/`) ·
> **SIMULADO** (roda de verdade, mas contra `tools/ifood-simulator/`, nunca
> API real) · **DOCUMENTADO** (descrito aqui, sem código) ·
> **HIPÓTESE** (nome/formato baseado em padrão público geral, nunca
> verificado contra a API oficial do iFood — esta missão não acessou API
> real, não tem credencial) · **NÃO VALIDADO** · **DEPENDENTE DE
> CREDENCIAL** · **DEPENDENTE DE HOMOLOGAÇÃO** · **DEPENDENTE DE
> AUTORIZAÇÃO HUMANA**.

## 1. Por que um módulo próprio, isolado do Conference Brain

`src/conference-brain/*` resolve um problema diferente: observação passiva
da TELA do portal (scraper de DOM), nunca da API oficial. Esta missão
constrói o caminho oposto — eventos estruturados de uma API REST/webhook
hipotética — e vive inteiramente em `src/integrations/ifood-official/`,
`tools/ifood-simulator/`, `tests/integrations/ifood-official/`,
`docs/integrations/ifood/`. Nenhum arquivo do conference-brain foi
modificado nesta missão. Ver `IFOOD_EXISTING_ASSETS_INVENTORY.md` para o
levantamento completo que fundamentou essa separação.

## 2. Camadas (IMPLEMENTADO)

```
receivers/ (webhook + polling)
        |
        v
    inbox/ (append-only, idempotente por identidade real do evento)
        |
        v
  reconciliation/ (determinístico: eventos -> IfoodOrderSnapshot)
        |
        v
  projection/ (HIPÓTESE, nunca ligada) -> conference-brain (futuro, fora desta missão)

    outbox/ (ações preparadas -- NUNCA enviadas nesta missão)
    negotiation/ (ações estruturadas -- NUNCA enviadas nesta missão)
    health/ (diagnóstico local, projeção só-leitura)
    security/ (sanitização, allowlist por token)
    auth/ (ciclo de vida de token, SEM segredo real)
    adapter/ (interface — IfoodOfficialAdapter)
    contracts/ (formas normalizadas + schemas de persistência)
    storage/ (JSONL append-only, independente do conference-brain)
```

## 3. IfoodOfficialAdapter — interface desacoplada (IMPLEMENTADO)

`adapter/ifood-official-adapter.js#createAdapter(impl, opts)` — 10
responsabilidades fechadas (`ADAPTER_RESPONSIBILITIES`): `authenticate`,
`listMerchants`, `pollEvents`, `receiveWebhook`, `fetchOrder`,
`acknowledgeEvent`, `requestCancellation`, `sendNegotiationAction`,
`fetchDeliveryState`, `checkHealth`. Nenhum módulo operacional (inbox,
outbox, reconciliador, negociação, saúde) importa URL ou formato externo
diretamente — tudo passa por este adapter. Uma responsabilidade não
implementada nunca falha em silêncio: vira
`{ok:false, reason:"nao_implementado:<responsabilidade>"}`, testável.

Implementações possíveis, trocáveis sem mudar nenhum consumidor:
- **simulador** (`tools/ifood-simulator/simulator.js`) — SIMULADO, único
  usado nesta missão;
- **cliente oficial** — DEPENDENTE DE CREDENCIAL, DEPENDENTE DE
  HOMOLOGAÇÃO, não construído nesta missão;
- **fixture** — reaproveitável dos próprios testes;
- **homologação** — DEPENDENTE DE AUTORIZAÇÃO HUMANA e de acesso ao
  ambiente de sandbox do iFood, não iniciado.

## 4. Fluxo ponta a ponta (IMPLEMENTADO, SIMULADO)

1. Evento chega por `receivers/webhook-receiver.js` OU
   `receivers/polling-receiver.js` (ambos alimentam a MESMA inbox).
2. `receivers/payload-mapper.js` traduz o payload externo (HIPÓTESE de
   formato) para `contracts/envelope.js#buildEventEnvelope()`.
3. `inbox/inbox.js#receive()` persiste com idempotência real —
   `internal_event_id` deriva da identidade do evento, nunca de posição.
4. `reconciliation/reconciler.js#reconcileOrder()` projeta o histórico
   completo de eventos de um pedido em um `IfoodOrderSnapshot`
   determinístico — mesma coleção de fatos, qualquer ordem, mesmo
   resultado.
5. `projection/order-projection-bridge.js` (HIPÓTESE, nunca chamada por
   ninguém nesta missão) documenta como o snapshot PODERIA alimentar o
   modelo multidimensional do Conference Brain no futuro.
6. Ações (`outbox/`, `negotiation/`) nascem `prepared`, exigem autorização
   humana explícita para avançar — e nunca são enviadas de verdade nesta
   missão (regra dura da missão).

## 5. O que este documento NÃO afirma

Não afirma que o vocabulário de eventos (`contracts/event-types.js`), os
`code`s do payload mapper ou o formato de payload de webhook/polling batem
com a API real do iFood — tudo isso é HIPÓTESE DE IMPLEMENTAÇÃO, a ser
confirmada/corrigida na fase de homologação
(`IFOOD_HOMOLOGATION_NEXT_STEPS.md`). Não afirma suporte a nenhum recurso
específico do provedor sem evidência (ver `IFOOD_PACKAGING_CAPABILITY_V1.md`
para o caso mais explícito disso).
