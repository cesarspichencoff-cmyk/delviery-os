# TATÁ Comandas — Endurecimento da identidade de loja nos JOINs do Reader (07/11/2026)

**Etapa 3/6 · PR #135 · somente desenho SQL offline.** Objetivo: não misturar linhas de outra loja na consulta candidata de uma única comanda iFood do Itaim, antes de cogitar a Etapa 4.

## Evidência nova observada, sem modificar o caixa

Leitura **passiva** dos arquivos preexistentes `C:\TEKNISA\odhenPOS\backend_74000\vendor\odhen\api\src\Service\Comanda.php` e `...\Util\MSDEQuery.php` no host `CAIXA_MOOCA` (host físico do Itaim), em 07/11/2026, usando somente funções de leitura de arquivo. A SQL instalada de `INSERT_VENDAREST` informa o campo `CDLOJA` de `VENDAREST`; a SQL de `INSERT_PRODUCT` (aprox. linhas 1104–1115 do `MSDEQuery.php`) insere **`CDLOJA` em `ITCOMANDAVEN`**. Esta constatação de **colunas na rotina de INSERT** não comprova unicidade, índices, FK, conteúdo atual nem plano físico do SELECT.

A consulta candidata `tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql` filtra `c.CDLOJA='01'` no cabeçalho `COMANDAVEN`, mas antes conectava as tabelas `VENDAREST` e `ITCOMANDAVEN` sem comparação direta de suas lojas, apenas `CDFILIAL/NRVENDAREST` e `CDFILIAL/NRVENDAREST/NRCOMANDA` respectivamente. Se números de venda/comanda se repetirem entre lojas da mesma filial, essa omissão **pode** associar venda ou itens de outra loja e multiplicar/distorcer linhas, apesar do filtro no cabeçalho. **Não há prova de colisão real ou de que os índices existentes permitam essa combinação.**

## Correção estática na mesma PR

- No JOIN de `VENDAREST`, exigir `v.CDLOJA=c.CDLOJA`.
- No JOIN de `ITCOMANDAVEN`, exigir `i.CDLOJA=c.CDLOJA`.
- Não mudar os 17 campos de projeção, parâmetros nativos `varchar(10)`, filtro literal `DLV_IFO`, `TOP(201)`, tratamento de notas, `SERIALIZABLE`, `LOCK_TIMEOUT 100`, `MAXDOP 1` nem `HOLD` da aprovação.
- O analisador `comandas_reader_one_order_plan_risk_review_only.cjs` agora bloqueia uma candidata que remova qualquer igualdade de loja. Testes de contraprova no modelo de JOIN incluem VENDAREST/ITCOMANDAVEN de loja `02` com números iguais aos do Itaim; somente linhas da loja `01` devem participar do resultado. **Modelo ficcional**, não mecanismo de prova do SQL instalado.

## O que ainda NÃO foi resolvido

A ausência de colisão em fixtures não prova unicidade nativa, cardinalidade exata, acesso por índice, custo de operação, isolamento sem bloqueio de escritores nem fechamento semântico de itens e observações. `PRODUTO` permanece ligado por `CDPRODUTO` como na consulta anterior; unicidade desse código e plano físico ainda requerem revisão independente. `SERIALIZABLE` pode bloquear a Teknisa mesmo quando os JOINs são mais restritivos. A validação de código é uma **pré-condição de qualidade**, não uma prova de segurança operacional.

### Critério de transição

`N2_A_JOIN_SHOP_SCOPE=STATIC_LAB_ONLY` após CI do **SHA exato** em Linux e Windows; `N2_A_CANDIDATE_SQL_PLAN=UNKNOWN`, `N2_A_WRITER_LOCK_IMPACT=UNKNOWN`, `N2_B_POST_COMMIT_COMPLETE_REVISION=UNKNOWN`, `STAGE_3=IN_PROGRESS`, `STAGE_4=NOT_AUTHORIZED`, `PRINT/CUTOVER=HOLD`. Nenhuma instalação, SQL, CMD/PowerShell, serviço, spooler, impressão, sequenciamento ou arquivo no caixa foi alterado.
