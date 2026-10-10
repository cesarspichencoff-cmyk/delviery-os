# CÉSAR OS — projeto candidato de ingestão WORK em lotes D1

**REVIEW ONLY / NOT DEPLOYED**: não é endpoint, nem migração, nem transação implantada. O runtime privado Python continua separado deste repositório e seu handler v1 existente ainda não usa este agrupador.

## Limites oficiais Cloudflare D1
- Workers Free: até 50 consultas por invocação de Worker; até 100 parâmetros vinculados por statement D1; até 100.000 bytes por SQL. Fonte: https://developers.cloudflare.com/d1/platform/limits/
- `D1Database.batch()` executa as instruções em uma transação; falha numa instrução provoca rollback do lote. Fonte: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- Lote de até 100 observações com 21 colunas: **4 observações por INSERT** (84 parâmetros), até **25 INSERTs**. Reservar cinco instruções para registro de fonte, cobertura, recibo atestado, cursor e verificações, teto planejado **30 < 50**. Esta contagem é planejamento, não medição real de subrequests do runtime Python.

## Implementação candidata e testes
- `tools/cesar-os-ci/d1-bulk-plan.mjs`: geração somente em memória, `INSERT INTO source_observations (...) VALUES (...) ... ON CONFLICT(observation_id) DO NOTHING`; nunca usa `INSERT OR IGNORE` amplo nem chama D1.
- Identidade fixa `github-actions-public-deliveryos`, `WORK`, `SOURCE_CLAIM`, `ORGANIZATIONAL`, `OBSERVATION_ONLY`, `possible_commitment=false` e `observation_id`/`content_fingerprint` calculados conforme algoritmo do `source_spine.py` privado. Não se aceita alegação fornecida pelo chamador sem comparação com a fórmula.
- Metadados JSON são limitados a 4096 bytes e chaves de payload bruto/credenciais são rejeitadas antes de compor qualquer comando SQL. Não persistir payload bruto.
- `test/cesar-os-ci-bulk-plan.test.mjs`: tamanho, limite de parâmetros, compromisso rejeitado, identidade inválida e privacidade.
- `test/cesar-os-ci-bulk-sqlite.test.py`: usa Node para produzir SQL do módulo e SQLite real em memória para testar 100 inserções, repetição sem novas linhas e rollback após falha dentro de transação explícita.

## Evidência exigida antes da promoção
1. Portar para o Worker Python privado usando prepared statements e `self.env.PRIVATE_DB.batch([...])`; não executar um INSERT individual por observação em plano gratuito.
2. Criar v2 com impressão digital do **arquivo real validado** (`git_blob_sha` e `snapshot_sha256`) persistida em transação junto às observações e ao recibo; não inferir esses campos retroativamente de v1.
3. Resolver a contagem verdadeira `items_new` e `items_deduped` mesmo sob concorrência: o plano atual produz SQL, **não** prova o cálculo transacional desses contadores.
4. Criar e testar a migração D1 de recibo v2 e sua consulta interna, mantendo v1 sem mudanças. Se houver conflito entre `(source_id,batch_id)` e hash do arquivo, falhar fechado.
5. Testar atomicidade no D1 em ambiente autorizado, incluindo queda no meio do lote, duplicação simultânea, 100 observações e leitura posterior de recibo. Só depois permitir CAS do cursor.
6. Avaliar custo zero e regressões do bridge, Gmail, Calendar, Outlook, Zapia e ActivityWatch. Nunca criar compromissos humanos automaticamente.
7. Não repetir ou contornar o POST que foi bloqueado pela ferramenta. Sem prova de ingestão real, manter `INGEST_ENABLED=false`, `DELIVERYOS_WORK_ENABLED=false` e sem cron.

## Fronteiras
- SQLite em memória e CI aprovados são `TEST_PASS`, não `D1_WORLD_PROVEN`.
- O arquivo histórico real usado no smoke test foi semeado manualmente; não prova publicação automática do produtor.
- O PR #61 permanece revisão, não implantação. Nenhum gasto pago ou novo serviço foi ativado.