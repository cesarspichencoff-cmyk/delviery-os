# TATÁ Comandas — Etapa 3: origem nativa exata do Itaim mesmo com chave consistente

**07/11/2026 · PR #135 · revisão offline.** Nenhum acesso a serviços, SQL, filas, impressoras, processos do `CAIXA_MOOCA`, deploy ou corte operacional.

## Contraprova encontrada

O contrato `assessNativeReaderV2` exigia `IDORGCMDVENDA=DLV_IFO`, quatro componentes da chave iguais entre evento e decisão, `snapshot_hash` e `fingerprint` coerentes. Mas permitia `CDFILIAL` e `CDLOJA` válidos **de qualquer unidade**. O teste antigo alterava `CDFILIAL` sem atualizar `order_key` e, por isso, rejeitava a **inconsistência da chave**, não demonstrando a proteção contra outra unidade com todos os campos coerentes. O preflight de catálogo possuía validação própria do Itaim, mas não pode proteger todos os usos diretos da revisão.

Risco: um par evento/decisão internamente consistente de outra unidade poderia ser aceito como `NATIVE_PAIR_CONSISTENT_REVIEW_ONLY` no módulo nativo, ou até percorrer as camadas de papel virtual da cadeia da PR #135. Isso **não implicava impressão**, que já permanece bloqueada; é um defeito de separação de identidade e proveniência na homologação.

## Correção de escopo

- `tools/comandas_reader_v2_view_evidence_v1_offline.cjs`: depois de verificar a origem literal e a chave forte, exigir **`CDFILIAL=0001` e `CDLOJA=01`**. Caso contrário, `HOLD: NATIVE_ORDER_OUTSIDE_ITAIM_SCOPE` antes de aceitar o par, mesmo com hash, fingerprint, pedido e mapeamento iFood autocoerentes. Preserva rejeição anterior para chave realmente inválida.
- `tools/comandas_view_source_scope_v1_offline.cjs`: defesa adicional para quem invoca a verificação de origem das três vias diretamente, sem passar pelo avaliador nativo. Uma origem autocoerente fora do Itaim gera `HOLD: NATIVE_STORE_OUTSIDE_ITAIM_SCOPE` nas duas vias de produção **e** na Conferência, sem deixar uma candidatura externa produzir estado de revisão nativa.
- `tools/verificar_comandas_reader_v2_view_evidence_v1_offline.cjs`: testes novos de filial diferente, loja diferente e ambas diferentes, **com todo o `order_key` dos dois objetos recomposto, `snapshot_hash` e `fingerprint` recalculados** e alegação sintética de mapeamento iFood coerente onde aplicável. Cada caso deve rejeitar por escopo, não por divergência do hash.
- `tools/verificar_comandas_view_source_scope_v1_offline.cjs`: testes novos de duas identidades estranhas coerentes, com mapeamento iFood igualmente ajustado, mas todas as vias em `HOLD`.
- Manifestos de homologação da cadeia e da integração V2 repinados para **os blobs exatos alterados**. Não modificar consumidor V7.14 pinado, motor da Academia, configuração, arquivo de produção ou ramos experimentais. A candidata V7.15 da PR #140 continua isolada e não instalada.

## Fronteira de prova

A validação **reconhece escopo, não autenticidade da fonte**. Um atacante que fabrique integralmente uma chave `0001|01|...` e seus hashes internos ainda não é rebatido por um canal de assinatura independente; `INDEPENDENT_SOURCE_ATTESTATION=UNKNOWN`. Os estados `3`, `P`, `X` não têm semântica final homologada e `STAGE_4=NOT_AUTHORIZED`. `PRINT=HOLD`, `CUTOVER=HOLD`.

A verificação deve ocorrer na CI da PR #135 em Linux e Windows, no **SHA exato** da correção. Uma CI parcial ou com manifesto incompatível não justifica declarar `TEST_PASS`.

**Resultado pretendido:** nenhum par nativo de outra unidade alcança `NATIVE_REVISION_CONSISTENT` pela cadeia de revisão do Itaim, ainda que os próprios documentos fornecidos sejam mutuamente consistentes. Não é prova de dados operacionais vivos nem de papel físico.
