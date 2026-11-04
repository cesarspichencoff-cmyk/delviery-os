# Delivery OS Itaim — Reader → classificação → praça de trabalho (04/11/2026)

**Conclusão limitada:** prova de compatibilidade de **código**, com duas PRs reais e entradas fictícias. Não houve leitura de comanda de cliente, homologação física de praça, alteração no sistema do caixa, ativação da Home ou publicação de prontidão. Manter a fonte como REVIEW_ONLY até catalogação vigente, atomicidade e evento físico atestado.

## Não repetir: componentes já existentes que foram reutilizados

1. **PR #135**, commit verificado `bb107bf3fb91d54380e0240f096aefe72de4698e`: `comandas_reader_catalog_identity_crosscheck_v1_offline.cjs`, `comandas_reader_bound_classification_v1_offline.cjs`, `sourceBoundClassificationReviewV1.ts`, `currentPackagingBridgeV63.ts`, revisores do Reader V2. Eles já conectam CDPRODUTO, código canônico, nome, índice, quantidade e claims de estação num **recibo self-consistent, nunca homologação independente**. Proibida reimplementação paralela de catálogo ou aprovação a partir do recibo.
2. **PR #137**, base de teste `08d3077af6221971202b7184439113a893879bcd`: `copiloto_tata_reader_adapter_v1.cjs` preserva NRPRODCOMVEN na revisão privada. `vinculo-reader-trabalho-praca.ts` associa a linha, SKU, quantidade e hash da revisão à chave opaca de trabalho. `produzirTrabalhoPraca` e `projetarLeitura` já tratam estados, duplicidade, conflitos e carga, sem dar autoridade para afirmar conclusão física.

## Única ligação nova — somente revisão

`src/product/eventos/revisar-classificacao-trabalho-praca.ts`, PR #137:
- Recebe a revisão já adaptada, o vínculo por linha já produzido, o recibo candidato de classificação **da PR #135**, as claims usadas e o resultado candidato de convergência de catálogo.
- Exige escopo exato Itaim `0001/01`, `DLV_IFO`, mesmo SHA-256 nativo e cobertura de índices; cada linha deve conservar `CDPRODUTO`, código canônico derivado do `CDARVPROD` nativo, quantidade e classificação do **mesmo índice**.
- Aceita somente identificadores de praça do contrato visual aprovado (`areas.ts`): `combinados`, `duplas`, `enrolados`, `enrolados_quentes`, `cozinha_quentes`, `sobremesa`, `bar_bebidas`, `montagem_outros`. A palavra ampla `sushi` não vira subpraça inventada.
- Para eventos de bancada, compara a praça declarada à da classificação por linha. Se divergir, `HOLD`; não modifica nem reencaminha a comanda. Ausência de evento não vira pronto, e item de família não produtiva com evento de produção é conflito.
- Reconhece apenas `REVIEW_CANDIDATE_ONLY` de classificadores e `JOINT_SELF_CONSISTENCY_REVIEW_ONLY` do catálogo. Qualquer aprovação declarada artificialmente, recibo de outra revisão, falta de catálogo, código pendente ou observação nativa sem disposição permanece `HOLD`.
- Mesmo no caso positivo, os campos de autoridade retornam **`current_catalog_homologation_proven=false`**, `station_physically_attested=false`, `work_producer_authorized=false`, `ready_for_dispatch=null`, `live_home_authorized=false`. Saída usa apenas referências opacas, praça e contagem; não contém código de produto, identificador nativo de pedido, nome de produto nem nota de cliente.

## Provas diretas, sem efeitos

**Foxxy, isolado:** `run-reader-classification-work-review-tests.ts` **14/14 PASS**; `run-reader-station-link-review-tests.ts` **12/12 PASS**, sem regressão observada. Ambos usam as bibliotecas reais da PR #137 com entrada sintética.

**Cruzamento de código de duas PRs:** `tests/reporting/run-pr135-classification-pr137-station-cross-branch-tests.cjs`, execução com PR #135 fixada em `bb107bf3` e PR #137 fixada em `08d3077a`, **8/8 PASS** no Foxxy. Exercita os módulos reais de catálogo, classificação e reconciliação da PR #135, Reader adapter, vínculo de linha, produtor de trabalho e revisor PR #137. Casos: correspondência de linhas e praças; divergência de estação; um dos 14 códigos historicamente pendentes; conflito de catálogo; observação especial que exige disposição; revisão alterada; ausência de divulgação de dados brutos. A decisão é fictícia no teste; nenhum pedido nem SQL real foi utilizado.

**CI hospedado:** GitHub Actions run `41787511322` no commit `08d3077a`, `completed/success`: Linux de revisão de linha/classificação, contratos Linux existentes e fixture Windows sem console passaram. A CI **não executa** o teste entre branches porque ele requer um checkout separado e pinado da PR #135; os **8/8** foram executados no Foxxy, não no GitHub runner.

## Verificação material da cache instalada, somente leitura

CAIXA_MOOCA (PC comercial do Itaim), **somente metadados de arquivos, sem SQL ou processo**:
- `C:\ProgramData\TataComandaReader\shadow\product-identity-cache-v1.json`: modificado `2026-10-05T18:31:49.264Z`.
- `...\shadow\routing.json`: modificado `2026-10-05T18:40:00.087Z`.
- `...\shadow\product-aliases-v1.json`: modificado `2026-10-06T01:21:39.583Z`; leitura do JSON confirmou exatamente **3 entradas** de aliases.
- Esses timestamps coincidem com o diagnóstico de 26/10 documentado em `docs/comandas/ORIGEM_CLASSIFICACAO_CAIXA_MOOCA_READONLY_20261026.md`. **Não é evidência de catálogo atualizado em novembro**. A ausência de modificação de arquivo não prova que o cadastro SQL não mudou; prova que esses snapshots locais não foram renovados.

**Não reabrir decisões humanas:** a regra `enrolados_quentes` = Sushi Quentes e `cozinha_quentes` = Cozinha já está confirmada; o arquivo `data/cardapio_operational_confirmations_20260930.json` registra confirmações operacionais. Já existe `docs/comandas/HOMOLOGACAO_CLASSIFICACAO_14_CODIGOS_20261029.md` com a fila de revisão; as 14 lacunas são um conjunto histórico, não afirmação de 14 erros atuais.

## O que separa esta entrega do lançamento

1. **Classificação vigente por código**: obter, por via autorizada interna, captura atual de identidade `CDPRODUTO`↔código↔praça, revisão e aprovação operacional explícita, sem nome-fuzzy ou extrapolação de impressora. O teste anterior só provou consistência das alegações.
2. **Atomicidade do Reader real**: SQL atual tem RCSI/SNAPSHOT OFF. Plano de execução observado para o V2 existente NÃO é prova do plano ou custo de uma consulta `SERIALIZABLE`. A candidata segue review-only, sem execução na Teknisa nem risco para transações do POS.
3. **Pronto físico**: uma classificação ou evento com campo `concluido` autodeclarado não atesta preparo terminado na bancada. Exigir fonte operacional identificada, autorização e prova de evento real; depois conferência/lacre e Entregas.
4. **Home e campo**: só conectar à Home V3.3 depois dos gates de origem, classificação, frescor, conclusão física e segurança. `#/copiloto` é diagnóstico, não interface substituta.

**Efeitos desta rodada:** criação de revisor e testes na PR #137, atualização de gate CI e este relatório. Metadados do PC comercial foram somente lidos. `SQL_WRITES=0`; `READER_RESTART=0`; `PRINT=0`; `DEPLOY=0`; `USER_ORDER_CAPTURE=0`; `NEW_COST=0`; `WORLD_PROVEN=NO`.
