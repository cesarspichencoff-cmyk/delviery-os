# Delivery OS Itaim — diferença de ordenação entre Reader V2 e candidata PR #135

**Data:** 05/11/2026. **Etapa:** L1/8, N2–N3 HOLD. **Escopo:** comparação de código, sem abrir revisão real, executar SQL, alterar Reader ou atribuir uma mudança a pedido de cliente.

## Fatos de implementação verificados

**V2 efetivamente instalado em CAIXA_MOOCA:** `bin/tata_reader_continuous_watch_candidate_v2.ps1`. A consulta aplica `TOP (@top)` **na CTE `recent` de comandas**, antes dos `LEFT JOIN` com itens. O padrão `TopOrders=50` limita **quantas comandas entram**, não corta diretamente a quantidade de linhas por comanda selecionada. Isso **não comprova** ausência de duplicatas de joins, isolamento transacional durante atualizações ou cobertura total do iFood. A seleção é `IDORGCMDVENDA LIKE 'DLV[_]%'`; a ordenação de comandas usa data e venda sem desempate por `NRCOMANDA`.

**Fonte candidata PR #135:** `tools/comandas_reader_native_note_rowset_v1_review_only.cjs` e `tools/comandas_reader_notes_single_select_v1_REVIEW_ONLY.sql`, branch `audit/comandas-native-chain-20261102`. O SQL restringe `IDORGCMDVENDA='DLV_IFO'` e acrescenta desempate. O montador ordena os itens de modo determinístico em JavaScript e mantém toda a montagem sem publicação.

**Mudança semântica de ordem das observações:**
- V2 instalado: acrescenta `DSOBSCOMANDA` (observação geral) **antes** dos três campos de observação associados a cada item; mantém `observation_rows` nessa ordem.
- Montador da PR #135: acrescenta observações associadas aos itens e **depois** `DSOBSCOMANDA`.
- O cálculo de `snapshotHash` incorpora `observation_rows` como array **ordenado**, não conjunto não ordenado. Logo, quando uma comanda tem observação geral **e** ao menos uma observação de item, a troca de sequência altera os bytes de serialização e o SHA, ainda que textos e vínculos sejam iguais. Esta é uma consequência do código; **não houve prova de qual pedido real apresenta os dois tipos simultaneamente**.
- Outra diferença possível: o V2 ordena `i.NRPRODCOMVEN` no SQL; o montador compara os valores como strings. Se o tipo/valores forem numéricos e incluírem, por exemplo, linhas `2` e `10`, a ordem pode divergir. Isso permanece **CONDICIONAL** até confirmação do tipo e dos valores reais; não afirmar ocorrência.

## Consequência para a migração

**Mesmo conteúdo de negócio != mesmo hash entre versões.** Não classificar a mudança de hash, por si só, como uma revisão de cliente, nem liberar repetição de via, nova numeração, atualização de praça ou notificação por conta de migração de serialização. A versão instalada também usa `ConvertTo-Json` que pode escapar apóstrofo diferentemente do `JSON.stringify` canônico; apenas `ToLowerInvariant()` não corrige.

O recibo puro existente `runtime/reporting/native_reader_n2n3_sanitized_receipt_v1.cjs` **não converte cegamente**: a correspondência de hash só é sinalizada após recomputar a representação canônica do evento apresentado. Continua `state=HOLD` e `ordersPublishable=0`, mesmo com autoconsistência. Portanto a mudança de ordenação **não foi corrigida ou autorizada nesta etapa**.

## Gates para passagem

1. **Versão/fonte:** comprovar qual serialização gerou a revisão e vinculá-la à identidade do Reader instalado, sem inferir versão do formato do hash.
2. **Conservação da identidade:** ensaio de comparação com **uma única revisão**, contendo, se presente, nota geral e nota de item, sem expor conteúdo e sem reordenar notas arbitrariamente; verificar ordem e vínculos de cada item.
3. **Diferença controlada:** se houver hash diferente exclusivamente por migração, documentar a equivalência de conteúdo com uma atestação independente; não criar segunda revisão/ordem operacional baseada apenas na diferença.
4. **Fonte real:** N2 requer prova de linhas consumidas e isolamento; N3 exige hash canônico sobre os mesmos bytes; N4 requer origem/frescor e escopo Itaim `DLV_IFO`. Nada disso decorre deste documento.
5. **Efeito:** projeto permanece DRAFT/HOLD, sem mesclar, instalar, executar comando no `CAIXA_MOOCA`, consultar SQL, operar impressora ou publicar no Copiloto.

**Fronteira:** `STATIC_CODE_DIFFERENCE=VERIFIED`; `BUSINESS_SEMANTIC_EQUIVALENCE=NOT_ATTESTED`; `FIELD_N2_N3=HOLD`; `V1_ACCEPTANCE=0/8`.
