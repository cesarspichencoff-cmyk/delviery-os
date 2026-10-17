# TATÁ Comandas — revisão humana V2 (HOLD)

Módulo de **anotação somente** sobre decisões do consumidor V2. Reusa as 21 composições exatas de B1–B15 e o ajuste C1 do pacote de auditoria anonimizada de 14/10/2026. **D1 corrigida conforme confirmação explícita de César:** 1, 2 e 3 Letras B = respectivamente 1, 2 e 3 caixas 750. Para 4+, UNKNOWN; nenhuma extrapolação.

Executar `node --test tools/comandas-human-review-v1/human_review_v1.test.cjs`.

**Não** altera `live_shadow_consumer_v2_candidate_v714.cjs`, `packaging-current.js`, `ready`, sacola/caixa/kit no motor, V6.8, serviço, sequência, spooler ou impressora. A função `reviewV2` recebe uma decisão original e devolve apenas parecer. `candidate_for_reconciliation` nunca autoriza impressão. Confirmações humanas não autenticam automaticamente snapshots ou aprovam novos pedidos; todo estado permanece HOLD até prova separada. 

**Privacidade:** somente código e fixtures sintéticas no GitHub público; os 60 pedidos e respectivos hashes/snapshots não são publicados.
