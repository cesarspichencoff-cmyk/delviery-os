# Conferência — identidade de catálogo não é identidade de produto nativo

**Escopo:** análise exclusivamente estática de arquivos versionados, dados sintéticos nos testes. Nenhum acesso a caixa, SQL, catálogo instalado, impressoras, pedidos reais, produção ou fornecedor. Estado: `DRAFT/HOLD`.

## Descoberta independente em fonte fixada

Fonte: `cesarspichencoff-cmyk/tata-academia`, branch `evolucao/v33-product-pass`, `data/app-data.json`, Git blob SHA-1 **`d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22`**. Esse mesmo blob já aparece como referência do arquivo `data/comandas_catalog_equivalence_v1.json` da PR #135.

- `combinado_salmao_1_pessoa`: **Combinado Salmão 1 pessoa**. Descrição: seis sashimis de salmão, três nigiris de salmão e três rolls.
- `combinado_salmao_atum_1_pessoa`: **Combinado Salmão/Atum 1 pessoa**. Descrição publicada resumida: seis sashimis, três nigiris e três rolls; observação de não substituição.
- Apesar de compartilharem `family=combinado`, `subfamily=salmao` e `station=combinados`, são **produtos distintos**. Semelhança de classificação, composição resumida ou prefixo de nome não estabelece igualdade de SKU.
- `missoshiro` está no catálogo com `menu_status=PROVEN_PUBLISHED_NAME_ONLY`, `classification.truth_class=UNKNOWN_REVIEW_REQUIRED` e `review_required=true`. A confirmação humana de pote de isopor, ausência de kit e sacola P exclusiva é requisito de montagem; não altera automaticamente esse status catalogal.

O documento humano `docs/comandas/REGRAS_HUMANAS_CONFERENCIA_MISSOHIRO_COMBINADO_P1_20261106.md` já preserva o risco da expressão abreviada “combinado salmão p/1” e proíbe generalizar para Salmão/Atum 2 Pessoas, todos os combinados ou outros itens quentes. Esta auditoria mostra o motivo concreto: o catálogo já possui **dois candidatos de uma pessoa**.

## Diferença de autoridade com a fonte nativa

`data/tata_reader_product_identity_observed_crosswalk_20261004_v1.json` contém somente duas identidades *publicadas naquela referência versionada* de produtos **diferentes**: `CDPRODUTO=0000001459 / CDARVPROD=9150003000` e `CDPRODUTO=0000001641 / CDARVPROD=9600001000`. A equivalência catalogal versionada atualmente é restrita ao combinado especial Sushi + Sashimi de 2 pessoas. Esses arquivos **não provam** os códigos `CDPRODUTO` ou `CDARVPROD` de Missoshiro, Salmão 1 pessoa ou Salmão/Atum 1 pessoa.

Não inferir código de produto pelo nome, por classificação ou por número de peças. Uma evidência nativa exata para cada um precisaria ser comparada com a identidade catalogal e com o conteúdo da revisão, sob autorização distinta, antes de qualquer uso operacional.

## Atualização por leitura passiva do cache histórico (07/11/2026)

**Fonte observada:** `CAIXA_MOOCA` (host do Itaim), `C:\\ProgramData\\TataComandaReader\\shadow\\product-identity-cache-v1.json`. Acesso realizado por `list_directory`, `get_file_info` e `read_file`, exclusivamente para os **554 registros históricos em arquivo preexistente**; nenhum CMD/PowerShell, SQL, processo, impressão, edição ou cópia. Arquivo de **141.005 bytes**, com `captured_at=2026-10-05T15:27:33.4357828-03:00`. O resumo abaixo **não inclui nenhuma linha bruta nem os IDs nativos**.

| Família pesquisada no cache histórico | Candidatos com IDs nativos distintos | Problema |
| --- | ---: | --- |
| `MISSOSHIRO` (rótulo exato após trim) | **2** | Dois códigos nativos em duas entradas de mesmo nome; não escolher o primeiro |
| `SALMAO/ATUM 1 PESSOA` / `COMB SALMAO/ATUM 1 PESSOA` | **2** | Variações de rótulo e dois pares de IDs nativos; não concluir que representam o mesmo SKU ativo |
| `COMBINADO SALMAO 1 PESSOA` | **1** | Ter apenas um registro histórico não confirma atividade atual nem permite herdar a regra humana de Salmão/Atum |

**Difference Check:** o diagnóstico anterior estava correto para **o arquivo versionado de referência da Academia**, que não contém `CDPRODUTO` ou `CDARVPROD`. Entretanto, a frase ampla “IDs nativos dos três produtos ainda não foram observados” precisa ser qualificada: agora **foram observados candidatos em um cache histórico**, não foram provados vínculos atuais `ID nativo ↔ registro Academia ↔ item da revisão iFood`. A entrada antiga `native_product_ids_observed_for_these_three=false` foi substituída por `native_product_ids_in_this_reference=false` para não ocultar essa diferença.

Em `data/comandas_assembly_academy_identity_reference_review_v1.json` entraram apenas **contagens e contexto de antiguidade**, com os identificadores omitidos. `tools/comandas_assembly_catalog_identity_hold_v1_offline.cjs` agora expõe `historical_label_candidate_count` e sinais explícitos `historical_label_candidates_are_current=false`, `historical_name_match_can_select_active_sku=false`; mantém `native_cdproduto_bound=false`, `native_cdarvprod_bound=false` e `status=HOLD`. Quatro testes adicionais verificam esses vetos. O código permanece livre de leitura de host, SQL, print ou dependência do cache original.

**Risco operacional preservado:** o código não infere se o Missoshiro antigo é o item atual nem se o Salmão/Atum 1 pessoa é o “combinado salmão p/1” mencionado na decisão humana. Não aplicar a caixa 750 ml, kit p/1 ou sacolas P/M a SKU nativo sem prova exata; a via de Conferência Teknisa não deve ser duplicada.

**Próxima prova útil, ainda pendente:** em autorização própria e com leitura mínima, identificar o `CDPRODUTO` e `CDARVPROD` **do item realmente vendido na comanda do Itaim** e confrontar com o catálogo ativo e a descrição da Academia, preservando a revisão completa. A simples existência do cache de outubro não demonstra esse vínculo, nem a atualidade do cadastro, nem censo de impressão.

## O que o laboratório realmente acrescenta

Arquivos:
- `data/comandas_assembly_academy_identity_reference_review_v1.json`: recorte de três entradas do catálogo, com a procedência fixada; não contém IDs nativos.
- `tools/comandas_assembly_catalog_identity_hold_v1_offline.cjs`: valida apenas par **ID + nome exatos**, e recusa papel de montagem incompatível, abreviação, nomes aproximados, ID de produto nativo acrescentado, falsa permissão ou campo extra. Saída **sempre `HOLD`**, inclusive para entrada catalogal correta. Nome e ID do catálogo não comprovam origem do evento nem completude do pedido.
- `tools/verificar_comandas_assembly_catalog_identity_hold_v1_offline.cjs`: casos sintéticos de identidade, colisão e falsa autoridade, Linux e Windows.

**Obrigação aberta:** corrigir/classificar a identidade de cada SKU nativo e a sua correspondência de catálogo; definir as regras específicas de embalagem em composição real; provar volume/encaixe, observações e conclusão semântica. Nenhum resultado desta PR autoriza prévia operacional, nova via de Conferência, instalação de motor, mudança de catálogo, cutover ou impressão.

**Decisão:** preservar a via nativa da Teknisa; orientar o desenvolvimento para apoio à montagem sem duplicar papel. `STAGE_3=IN_PROGRESS`, `NATIVE_PRODUCT_BINDING=UNKNOWN`, `OPERATIONAL_ASSEMBLY_PLAN=HOLD`, `PRINT=HOLD`.
