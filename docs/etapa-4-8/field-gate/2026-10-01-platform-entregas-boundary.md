---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-platform-entregas-boundary.md
  status: ACTIVE
  authority_scope: platform_entregas_boundary_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: ebb06f4
---

# Platform -> Entregas — guarda alinhada à arquitetura atual

Data: 2026-10-01
Host: Foxxy
Resultado: **guarda obsoleta substituída por allowlist exata + controle negativo**

## Reproduzido antes

`test:platform` ainda aplicava a regra histórica “platform não importa
Entregas”. Ela passou a ficar incompatível com decisões canônicas posteriores,
porque hoje existem adapters deliberados que consomem apenas fronteiras
públicas/estreitas de Entregas.

A falha existia antes desta frente: `entregas-source-ingest.ts` já importava
o feed durável no commit-base `ebb06f4`.
## Fronteiras permitidas

A guarda agora permite somente os pares exatos:

- `bin/entregas-source-ingest.ts` -> `integration/durable-event-feed`;
- `copiloto/causal-identity-bridge.ts` -> `contracts/events/types`;
- `ingest/entregas-shadow-adapter.ts` -> `contracts/events/types`;
- `runtime/entregas-live-consumer.ts` -> `contracts/EntregasEventFeed`;
- `runtime/rota-localizacao-despacho.ts` ->
  `foundation/platform-read-assertion` e `foundation/route-access`.

Essas fronteiras já estavam documentadas/provadas por Q-003, source-ingest e
GPS canônico do despacho. A mudança não cria autoridade nova.

Arquivos de `run-*-tests.ts` ficam fora da regra de produção porque testes
E2E deliberadamente montam os dois lados da integração.
## Anti-regressão

A allowlist é fechada em duas direções:

- qualquer import de Entregas em arquivo de produção fora desses pares falha;
- a lista observada precisa ser exatamente igual à lista esperada, então
  remover ou adicionar uma fronteira também exige decisão explícita.

Controle negativo real: foi criado temporariamente
`src/platform/runtime/__entregas_import_probe.ts`, importando
`../../entregas/foundation/trip-machine`. O gate ficou vermelho com a
assinatura `fora da fronteira autorizada`. O probe foi removido e o mesmo
gate voltou a **44/44 PASS**.

## Fronteira

Isto não liga consumer live, não ativa source-ingest, não amplia papel SQL e
não muda domínio de Entregas. Apenas faz a guarda arquitetural representar as
fronteiras que já eram canônicas, em vez de uma regra histórica impossível.
