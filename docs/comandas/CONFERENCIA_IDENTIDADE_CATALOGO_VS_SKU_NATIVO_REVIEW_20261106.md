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

`data/tata_reader_product_identity_observed_crosswalk_20261004_v1.json` contém somente duas identidades observadas de produtos **diferentes**: `CDPRODUTO=0000001459 / CDARVPROD=9150003000` e `CDPRODUTO=0000001641 / CDARVPROD=9600001000`. A equivalência catalogal versionada atualmente é restrita ao combinado especial Sushi + Sashimi de 2 pessoas. Esses arquivos **não provam** os códigos `CDPRODUTO` ou `CDARVPROD` de Missoshiro, Salmão 1 pessoa ou Salmão/Atum 1 pessoa.

Não inferir código de produto pelo nome, por classificação ou por número de peças. Uma evidência nativa exata para cada um precisaria ser comparada com a identidade catalogal e com o conteúdo da revisão, sob autorização distinta, antes de qualquer uso operacional.

## O que o laboratório realmente acrescenta

Arquivos:
- `data/comandas_assembly_academy_identity_reference_review_v1.json`: recorte de três entradas do catálogo, com a procedência fixada; não contém IDs nativos.
- `tools/comandas_assembly_catalog_identity_hold_v1_offline.cjs`: valida apenas par **ID + nome exatos**, e recusa papel de montagem incompatível, abreviação, nomes aproximados, ID de produto nativo acrescentado, falsa permissão ou campo extra. Saída **sempre `HOLD`**, inclusive para entrada catalogal correta. Nome e ID do catálogo não comprovam origem do evento nem completude do pedido.
- `tools/verificar_comandas_assembly_catalog_identity_hold_v1_offline.cjs`: casos sintéticos de identidade, colisão e falsa autoridade, Linux e Windows.

**Obrigação aberta:** corrigir/classificar a identidade de cada SKU nativo e a sua correspondência de catálogo; definir as regras específicas de embalagem em composição real; provar volume/encaixe, observações e conclusão semântica. Nenhum resultado desta PR autoriza prévia operacional, nova via de Conferência, instalação de motor, mudança de catálogo, cutover ou impressão.

**Decisão:** preservar a via nativa da Teknisa; orientar o desenvolvimento para apoio à montagem sem duplicar papel. `STAGE_3=IN_PROGRESS`, `NATIVE_PRODUCT_BINDING=UNKNOWN`, `OPERATIONAL_ASSEMBLY_PLAN=HOLD`, `PRINT=HOLD`.
