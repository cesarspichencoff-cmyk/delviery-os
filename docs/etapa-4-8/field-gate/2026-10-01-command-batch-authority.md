# Cadeia de comandos do piloto — autoridade da sessão

Data: 2026-10-01
Host: Foxxy
Base Git: `3b5fe2679cd7f993548a6428e58e8cf8ee60b05e`
Resultado: **SERVER PATH PROVEN; produtor Android continua NOT_IMPLEMENTED**

## Gap encontrado

O servidor já vinculava a façade ao ator autenticado de cada requisição, mas
`PilotApplicationFacade.execute()` aceitava `actor` e `unit_id` do comando
recebido e lhes dava precedência. Assim, um payload podia tentar declarar papel
ou unidade diferentes da sessão autenticada.

O Android, por outro lado, possui a estrutura `outbox_event` e
`sendEvents()`, mas a busca no código de produção encontrou **zero produtores**
de `OutboxEventEntity`. Portanto a cadeia Android → comando não existe hoje em
runtime e não deve ser chamada de pronta.

## Correção

`PilotApplicationFacade.execute()` passou a fixar sempre:

- `actor = this.actor` — ator da sessão autenticada;
- `unit_id = this.cfg.unit_id` — unidade configurada do piloto.

Valores de `actor` e `unit_id` no corpo são tratados como não confiáveis e
não ganham autoridade.

## Provas

Contra o servidor real sintético do próprio piloto:

- `/api/events/batch` criou uma Trip e a timeline contém `trip_created`;
- payload enviado por operador alegando `role=gerente` não conseguiu executar
  `CloseTripManually`;
- o mesmo controle negativo passou em `/api/command`;
- sessão de motoboy executou `ConfirmTripDeparture` como o motoboy real mesmo
  quando o payload alegava gerente e outra unidade;
- snapshot continuou em `ITAIM`.

Matriz focada:

- device-api: **43/43 PASS**;
- session isolation: **18/18 PASS**;
- integration contracts: **14/14 PASS**;
- governance: **14/14 / GOVERNANCE_GATE_GREEN**;
- `git diff --check`: PASS.

## Fronteira

Isto prova o **caminho servidor** `/api/events/batch → ApplicationService →
domínio/event log` e fecha a possibilidade de elevação de papel/unidade via
payload nesses endpoints.

Não prova um fluxo Android de comandos: hoje nenhum código de produção insere
`OutboxEventEntity`. Essa superfície permanece **dormant / NOT_IMPLEMENTED** até
existir uma interação nativa de produto que realmente precise gerar comando.
Não foi criada uma feature artificial apenas para tornar o teste verde.
