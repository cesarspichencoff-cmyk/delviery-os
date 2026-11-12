# Planejador de impressão — destinos físicos não são alternados por horário

## Retificação de auditoria posterior — 27/10/2026

A revalidação de 27/10 pela gestão e pela **leitura real da CAIXA_MOOCA** modifica a conclusão anterior de que os pares de sushi não tinham papel operacional por horário. A documentação de 30/09 já descrevia a distinção almoço/jantar, e a gestão reafirmou que **não quer imprimir nas impressoras que não trabalham naquele período**.

Os pares `00009/00003` e `00006/00004` **são candidatos de alternância operacional documentada por família de preparo**, não destinos que devam imprimir simultaneamente. A matriz histórica apresenta 87 produtos no primeiro par e 19 no segundo. São 106 candidatos de supressão seletiva, sujeitos à validação de exceções e horários efetivos; **os outros 11 casos de dupla rota não são automaticamente alternativos**.

O `HOLD` irrestrito implementado nesta PR foi uma proteção contra papel duplicado, **mas não é o comportamento final desejado**, pois pode bloquear pratos válidos. É necessário substituir esse mecanismo por um seletor com **evidência da janela original do pedido e categoria/praça comprovada**, que suprima filas inativas sem imprimir nas duas. A própria hora que já vem na comanda deve ser preservada; nenhuma aprovação diária ou relógio paralelo. Não transformar `production-service-state.json` vencido em prova.

Ver [auditoria revisada das impressoras](AUDITORIA_REVALIDADA_IMPRESSORAS_E_JANELAS_20261027.md). **O planner físico segue DRAFT/HOLD até o seletor testado e homologado.** Esta retificação não autoriza alteração do arquivo de impressão da Teknisa, fila Windows, serviço ou impressora.



**TATÁ Comandas · 27/10/2026 · PR #127 · DRAFT/HOLD · sem implantação**

## Decisão operacional preservada

A fonte Teknisa alimenta **as vias de produção**; o cruzamento com iFood ocorre **somente na conferência do caixa**. A hora original do pedido deve ser preservada, mas o sistema não deve inferir qual impressora física de sushi usar pelo suposto almoço/jantar, nem exigir uma aprovação diária de turno.

A leitura nativa do código instalado e a auditoria anterior V8.48 **não comprovaram** que os códigos `00009/00003` (SUSHI_1) e `00006/00004` (SUSHI_2) formam pares alternáveis segundo o turno. Eles podem representar papéis físicos distintos; um plano que escolhe um destino sem prova pode mandar o produto à impressora errada, ou duplicar uma comanda. Não supor que os quatro códigos são quatro vias obrigatórias do mesmo pedido.

## Inconsistência corrigida

O consumidor candidato `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs` já sinalizava `SUSHI1_DUAL_PRODUCTION_ROLE_UNPROVEN` e `SUSHI2_DUAL_PRODUCTION_ROLE_UNPROVEN` e removia ambos os membros de um par com papel ambíguo. Porém o planejador em `src/production/productionPrintPlan.ts` ainda usava `SERVICE_ALTERNATIVE_GROUPS` para escolher `lunch` ou `dinner` se `service_resolution` existisse. A divergência podia se tornar uma falsa rota `ready_for_shadow_payload` para um item com dois destinos configurados.

**Patch de revisão aplicado:** o planejador passa a usar `UNPROVEN_DUAL_PRODUCTION_ROLES`. Se um item contém os dois códigos do mesmo par, retorna `SUSHI_1_DUAL_PRODUCTION_ROLE_UNPROVEN_ITEM_<index>` ou `SUSHI_2_DUAL_PRODUCTION_ROLE_UNPROVEN_ITEM_<index>`, exclui apenas os destinos desse par e mantém o pedido em `ready_for_shadow_payload=false`, com `ready_for_physical_print=false`. Essa decisão é **independente de `LUNCH`, `DINNER` ou nulo**. Se o item possuir uma única rota configurada, o planejador não inventa outra; outras rotas independentes não são apagadas, mas não revogam o bloqueio do pedido ambíguo.

A política não atribui, inventa ou recalibra impressoras. Nenhum caminho foi ligado a spooler ou impressora e a configuração atual de loja **não foi inspecionada nem alterada** nesta execução.

## Evidência executada, origem e limites

Uma cópia temporária do branch foi criada no computador de desenvolvimento Foxxy (NÃO na CAIXA_MOOCA) e o commit exato `341f4bf0775228175bdc443483b77320cc1f5d72` foi compilado usando `npm.cmd ci --ignore-scripts` e `npm.cmd run build -- --pretty false`. Resultado `ISOLATED_REGRESSION=SUCCESS` e remoção solicitada do diretório temporário.

- `tools/verificar_comandas_no_shift_printer_role_v1_offline.cjs`: **13/13 PASS**, incluindo ambos os pares, serviço almoço/jantar/nulo, rota única, cozinha independente e ausência de autorização física.
- `tools/verificar_production_service_matrix_v1.js`: **463 produtos históricos** percorridos com `LUNCH/DINNER/null`, **106** produtos com pelo menos um dos pares conflitantes; todos preservam o bloqueio. Os 117 registros historicamente marcados `two_targets` não são todos, necessariamente, um desses pares; **106 ≠ 117**.
- `tools/verificar_production_print_plan_v1.js`: passou após substituir os exemplos que dependiam da alternância fictícia por rotas únicas **sintéticas**; mantém os testes de conteúdo, observações, calibração, fingerprint/idempotência e um exemplo que bloqueia par sushi mesmo com cozinha independente.
- `tools/verificar_comandas_view_source_scope_v1_offline.cjs`: **25/25 PASS**.
- `tools/verificar_comandas_reader_v2_view_evidence_v1_offline.cjs`: **37/37 PASS**.
- `tools/verificar_comandas_scoped_view_preview_v1_offline.cjs`: **9/9 PASS**.
- O workflow Linux/Windows da PR foi ampliado para executar o novo verificador e os dois verificadores legados já atualizados, no commit seguinte ao teste local. **A CI hospedada deve ser verificada no HEAD exato antes de alegar sucesso integral.**

Esses dados vêm da matriz **histórica de 30/09 para 0001 - TATÁ ITAIM**, não da topologia atual da CAIXA_MOOCA. Nenhum dos 106 produtos pode ser liberado para ambos ou para um dos destinos só porque passaram testes sintéticos. Para resolver o bloqueio físico falta evidência atual da função e do destino real de cada código de impressora, e autorização separada para quaisquer efeitos no caixa.

## Próximas provas sem operação prematura

1. Atestar o contrato vigente de destino **por praça/identidade de impressora** por meio da fonte local autorizada. O código está pronto para bloquear ambiguidades, não para inventar a configuração.
2. Provar o evento de **primeira via de produção no caminho efetivo do delivery**, separado de `IDSTCOMANDA=3/P/X`, de relatórios de entrega e de reimpressão.
3. Revalidar classificação e produtos, observações, sequência TATÁ única e persistida, emissão exclusiva e reconciliação de falhas.
4. Manter iFood × Teknisa só na conferência; não ligar impressão do Gestor iFood como substituto de prova de vínculo.

**Estado: CODE_READY + ISOLATED_TEST_PASS na revisão local. Não DEPLOYED, não WORLD_PROVEN, não HUMAN_ACCEPTED.** PR continua DRAFT/HOLD. Sem escrita no caixa, alteração de serviço, SQL, sequência, spooler, impressora, GP/iFood ou fiscal.


## Identidade de intenção estável, sem falso reenvio ao mudar o turno

A revisão do planejador revelou outra dependência antiga: `stableSemanticKeyMaterial` incluía `serviceResolution.service`, `evidence` e `source_ref` na base do SHA-256 da **intenção de produção**. Após corrigir o roteamento, esses campos não decidem mais uma impressora física. Se uma etiqueta externa de turno fosse alterada, o **mesmo pedido, mesmos produtos, mesmo destino, mesmo horário nativo e mesma sequência** receberia um `intent_fingerprint` diferente e poderia driblar controles de duplicação que comparam apenas essa chave.

**Correção:** as etiquetas de serviço continuam presentes no metadata de diagnóstico, mas não no material usado para o fingerprint de produção. Permanecem no hash os identificadores do pedido, `ifood_sequence` nativo, `teknisa_sequence`, sequência TATÁ, destino, template, horário original, observações e linhas/produtos. Para uma rota **única e igualmente configurada**, `LUNCH`, `DINNER` ou `null` não podem gerar fingerprints diferentes. Para um par ambíguo, os três continuam `HOLD` e com zero destinos selecionados daquele par.

Prova em cópia temporária Foxxy no commit `68144b95bc24953f6d79b8b1af46e1960fe02f6d`: build TS, matriz 463 produtos/106 casos de par ambíguo e as seis suítes direcionadas passaram, incluindo o novo teste de **fingerprint idêntico** entre etiquetas. Testes não equivalem a confirmar que o GP/Teknisa já emitiu ou não em papel.

**Segurança:** excluir metadados não causais do hash não é autorização para repetir tentativa; submissão, reconciliação independente, falha ambígua e confirmação física continuam gates separados e fechados.
