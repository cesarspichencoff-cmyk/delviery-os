# TATÁ Comanda — replay dos pedidos históricos arquivados, V8.60
**20/10/2026 · REVISÃO OFFLINE · não imprimir · sem computador da loja**

## Escopo e verdade da prova
Cruzei as fontes históricas estruturadas efetivamente presentes na branch de revisão da PR #107. Há **8 pedidos iFood curtos distintos identificáveis**, sendo **3 com composição de produtos recuperável e conferível** em mais de uma fonte e **5 com apenas identificadores**. Não existe no repositório uma coleção completa de todos os eventos V2 da CAIXA_MOOCA; os 20 eventos observados em relatórios passivos anteriores não foram publicados com composição e IDs completos e **não podem ser descritos como reproduzidos**.

Esta execução **não** é um replay byte-a-byte do consumidor instalado. Para testar o caminho de V8.57/V8.58, o script reconstrói eventos e decisões com os **produtos, quantidades, códigos e IDs históricos verdadeiros**, mas **simula** os campos de estado de pedido ativo, a cobertura de observações V2 e um binding TATÁ em memória. As revisões/hashes são calculadas sobre essa reconstrução, não copiados como se fossem captura original. Conclusão correta: `SYNTHETIC_RECONSTRUCTION_PASS`, **não** `REAL_EVENT_PAIR_PROVEN` ou `PRINT_READY`.

## Todos os oito pedidos localizados

| ID curto iFood | Referência histórica | Linhas reais com descrição | Unidades totais | Resultado |
|---|---|---:|---:|---|
| 9092 | 02/10, leitura SQL + catálogo/rota | 2 | 4 | Prévia reconstruída PASS |
| 9627 | 04/10, leitura SQL + rota + replay | 4 | 6 | Prévia reconstruída PASS |
| 8332 | 05/10, primeiro pedido pós-cutover + fiscal | 3 | 6 | Prévia reconstruída PASS |
| 6086 | 04/10, log passivo | Não arquivadas | Não arquivadas | HOLD, composição ausente |
| 7810 | 04/10, log passivo | Não arquivadas | Não arquivadas | HOLD, composição ausente |
| 8342 | 04/10, log passivo | Não arquivadas | Não arquivadas | HOLD, composição ausente |
| 3245 | 04/10, log passivo | Não arquivadas | Não arquivadas | HOLD, composição ausente |
| 7253 | 04/10, log passivo | Não arquivadas | Não arquivadas | HOLD, composição ausente |

## Visualização ilustrativa: conteúdo extraído do histórico

**As sequências `001` abaixo são 100% SIMULADAS em memória, apenas para verificar a renderização e o reconhecimento dos campos; NÃO são atribuídas a nenhum pedido real.** O texto “caixa/sacola/kit A DEFINIR” corresponde à decisão de César para dados físicos opcionais ainda não verificados.

### iFood 9092 — prévia sintética de conteúdo real
```text
TATÁ COMANDA - SIMULAÇÃO - NÃO IMPRIMIR
iFood 9092 | TATÁ 001 (SIMULADO, NÃO GRAVADO)
1 x COMB SUSHI + SASHIMI ESPECIAL 2 P
3 x TEMAKI DE BARRIGA DE SALMAO
OBSERVAÇÕES: NÃO ARQUIVADAS PARA ESTE PEDIDO
CAIXA: A DEFINIR / SACOLA: A DEFINIR / KIT: A DEFINIR
```
Fontes: `tata_reader_real_read_success_20261003_v1.json`, `tata_reader_real_order_identity_bridge_candidate_20261004_v1.json`, `tata_reader_real_order_expected_route_direct_identity_20261004_v1.json`. Estado original `IDSTCOMANDA=X` e itens `IDSTPRCOMVEN=4`: é histórico, não pedido ativo.

### iFood 9627 — prévia sintética de conteúdo real
```text
TATÁ COMANDA - SIMULAÇÃO - NÃO IMPRIMIR
iFood 9627 | TATÁ 001 (SIMULADO, NÃO GRAVADO)
3 x COMBINADO KIDS
1 x EDAMAME
1 x NASU NO MISSO
1 x SUSHI DE UNAGUI
OBSERVAÇÕES DE ITEM: SEM TEXTOS NA CAPTURA HISTÓRICA ESPECÍFICA
OBSERVAÇÃO GERAL NÃO PRODUTIVA: EXCLUÍDA DA COMANDA
CAIXA: A DEFINIR / SACOLA: A DEFINIR / KIT: A DEFINIR
```
Fontes: `tata_reader_real_read_cdarvprod_success_20261005_v1.json`, `tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json`, `tata_reader_real_order_unified_replay_success_20261005_v2.json`, `tata_reader_real_order_observation_sanitized_20261005_v1.json`. O relatório de observações **deste pedido histórico específico** confirmou ausência de notas por item e uma nota geral de pagamento/cancelamento que não deve aparecer na produção. Estado original `X`, itens `4`.

### iFood 8332 — prévia sintética de conteúdo real
```text
TATÁ COMANDA - SIMULAÇÃO - NÃO IMPRIMIR
iFood 8332 | TATÁ 001 (SIMULADO, NÃO GRAVADO)
2 x COMB EXEC SUSHI SALMAO
2 x COCA COLA ZERO 350ML - UN
2 x URAMAKI EBITEN
OBSERVAÇÕES DE ITEM: COBERTURA V2 NÃO ARQUIVADA
CAIXA: A DEFINIR / SACOLA: A DEFINIR / KIT: A DEFINIR
```
Fontes: `tata_reader_post_cutover_first_live_order_20261005_v1.json`, `tata_reader_post_cutover_first_live_order_shadow_decision_20261005_v1.json` e `native_fiscal_real_reconciliation_8332_20261005_v1.json`. A NFC-e é vínculo separado, não condição para emitir comanda.

## O que o código realmente verificou
O script `tools/tata_comanda_archived_orders_replay_v860_offline.cjs` cruza:
- Identificadores de loja/venda/comanda e ID externo iFood;
- códigos nativos + produto de varejo, nome, quantidade bruta e rota/replay quando disponíveis;
- a existência de observações independentes quando registrada; **não** afirma notas vazias para pedidos sem essa prova;
- montagem de V2 **reconstruído e explicitamente simulado** (pedido ativo apenas no cenário virtual), com hashes produzidos em memória;
- passagem pelo algoritmo real `projectReaderEssentials` (V8.57) e pelo pré-teste `inspectTataSequencePreflight` (V8.58);
- sem binding de produção: `AUTHORIZED_ATOMIC_BIND_REQUIRED`; somente com estado **sintético** vinculado: prévia aprovada, impressão **sempre falsa**;
- os 5 IDs com cobertura incompleta são mantidos em HOLD, sem produto, quantidade ou observação inventada.

**Exclusões:** os relatórios agregados dos 20 pares vistos em outro momento na CAIXA_MOOCA não contêm todas as linhas fonte no GitHub, portanto não foram simulados como 20 pedidos. Uma validação real destes registros depende de leitura autorizada da máquina, e nenhum resultado simulado deve ser promovido a fato de operação.

## Próximo passo único
Se a CAIXA_MOOCA voltar, fazer apenas a inspeção V8.59, em leitura, dos eventos e bindings efetivamente existentes. Se não houver sequência gravada, a operação de vinculação é outro efeito e exige autorização. O piloto de impressão e não duplicação exige prova física específica. **PR #107 permanece OPEN/DRAFT/HOLD/UNMERGED.**
