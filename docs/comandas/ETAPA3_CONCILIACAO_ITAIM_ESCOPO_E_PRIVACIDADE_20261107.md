# TATÁ Comandas — conciliação iFood × Teknisa sem confundir unidade ou divulgar dados privados

**Data: 07/11/2026 · Etapa 3 · PR #135 · análise exclusivamente offline.**

## Diferença comprovada no código anterior

A ferramenta `tools/comandas_reconciliacao_fontes_v1_offline.cjs` confronta conjuntos de pedidos por **ID curto único + dia**, provenientes de exportação iFood e registros nativos `DLV_IFO`. Não comprova vínculo de UUID iFood completo, autenticidade do extrato, conclusão da transação, integridade de itens, impressão ou causa de um pedido não integrado.

A versão anterior validava apenas que os rótulos de loja do cabeçalho eram iguais aos de cada linha. Se um chamador fornecesse dois conjuntos autocoerentes de **outra unidade**, ainda poderia obter `CANDIDATE_SET_REVIEW`/`DISCREPANCIES_REVIEW` dentro do projeto Itaim. Isso é diferente de um vínculo independente de lojas.

Outro risco: `status_code` nativo aceitava texto arbitrário não vazio. O resumo agregava situações por chave de objeto; um valor impróprio que contivesse informação privada poderia reaparecer em `native_matched_status_codes` ou `native_unmatched_status_codes`, contrariando o contrato de relatório agregado e sem identificadores de cliente. Usar um objeto simples para esse contador também dificultava garantir segurança para chaves especiais.

## Correção de revisão, sem mudança operacional

- Fixar o escopo declarado do **Itaim**: `ifood_store="53069"` e `native_store="0001/01"` em cada lote. Se a origem alegada estiver fora desses valores, **`HOLD/NOT_ITAIM_IFOOD_TEKNISA_SCOPE`**, mesmo quando cada linha usa o mesmo rótulo do cabeçalho. Isso não autentica de forma independente a correspondência entre os dois sistemas; `source_store_mapping_attested=false` continua.
- Aceitar códigos nativos de situação como **tokens técnicos de 1 a 3 caracteres alfanuméricos ASCII maiúsculos** (`3`, `P`, `X`, `4` são exemplos observados; outros tokens curtos ainda não recebem significado operacional). Texto livre, código com espaços, pontuação, letras minúsculas ou rótulo longo → `HOLD/NATIVE_REQUIRED_FIELD_INVALID`.
- Usar `Map` na agregação antes de produzir o JSON agregado, evitando propriedades herdadas ou chaves de objeto como contador. Saída **apenas de contagens por status**, sem exportar UUID, cliente, telefone, pedido individual, nome, linha de produto ou caminho.
- Ampliar a suíte com **7 testes adversariais**: loja iFood estranha mas autocoerente, unidade Teknisa estranha mas autocoerente, ambos estranhos, tentativa de texto privado em status, chave especial `__proto__`, status técnico desconhecido curto e rejeição de texto livre/lowercase.
- Não presumir que os códigos `3/P/X/4` indiquem conclusão, cancelamento ou impressão; seguir `UNKNOWN` até prova nativa independente.

## Fronteira da decisão

A função é uma **conciliação de presença por ID curto e dia**, não uma função de identificação final. Mesmo resultados com diferença zero permanecem `CANDIDATE_SET_REVIEW` e não liberam nenhum efeito. Diferenças positivas não determinam se o erro veio do iFood, do integrador, da Teknisa ou de contenção do Reader.

A seleção de `53069` e `0001/01` reproduz a identificação histórica da conciliação de 25/10/2026 registrada em `docs/comandas/CONCILIACAO_IFOOD_TEKNISA_20261025_CORRECAO_HUMANA.md`; essa identificação não equivale a configuração viva autenticada hoje.

**Gates:** `STAGE_3=IN_PROGRESS`, `INDEPENDENT_SOURCE_ATTESTATION=UNKNOWN`, `CURRENT_IFOOD_MISSING_ORDERS=UNKNOWN`, `READER_CAUSALITY=UNKNOWN`, `PRINT=HOLD`, `CUTOVER=HOLD`, `STAGE_4=NOT_AUTHORIZED`.

Nenhum comando, SQL, processo, leitura do caixa, serviço, fila, impressão, instalação, merge, deploy, conexão com fornecedor ou gasto foi necessário para criar esta correção. A CI Linux/Windows deve ser verificada por SHA exato antes de declarar o teste concluído.
