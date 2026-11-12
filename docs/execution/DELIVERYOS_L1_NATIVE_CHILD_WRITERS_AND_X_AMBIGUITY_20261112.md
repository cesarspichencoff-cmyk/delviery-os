# Delivery OS Itaim — L1/N2-B: relações filhas reais e semântica não exclusiva de X (12/11/2026)

**Tipo:** evidência de código instalado; inspeção passiva de arquivos no CAIXA_MOOCA, sem SQL, shell, serviço, API, UI ou impressão. **Não é teste de dados reais nas relações filhas nem atestado de integração iFood.**
**Fonte verificada:** `C:\TEKNISA\odhenPOS\backend_74000\`, arquivos de PHP da instalação em 12/11/2026. Versões locais dos arquivos têm mtime de junho/2026. **Não modificar esses arquivos do fornecedor.**

## Diferença material: três classes de dados que não podem ser presumidas completas

| Código instalado | Caminho visto | Evidência e consequência |
| --- | --- | --- |
| `src/Service/Pedido.php`, `fazPedido()`, ~934–947 | `SQL_INS_ITCOMANDAVEN` seguido de `SQL_INS_OBSITCOMANDAVEN` por código de ocorrência | A nota/ocorrência pode residir em relação filha separada da descrição livre do item. |
| `src/Service/Pedido.php`, ~956–1060 | `SQL_INS_ITCOMANDAEST`, `ATUALIZA_ITEM_ITCOMANDAEST`, `SQL_INS_OBSITCOMANDAEST` | Produtos filhos de combos e suas observações podem ser inseridos/atualizados separadamente. Agregação por item pai sem cardinalidade filha pode perder informação. |
| `vendor/odhen/api/src/Service/Comanda.php`, `insereProdutos()`, ~175–335 | `INSERT_PRODUCT`, `INSERT_SMARTPROMO`, `INSERT_PRICED_OBSERVATION` | Há tratamento diferenciado para observações cobradas e comuns e vínculo pai-filho por `NRPRODCOMVEN` / `NRPRODCOMVENOBS`. |
| `vendor/odhen/api/src/Util/MSDEQuery.php`, ~1280–1318 | `GET_LASTSALE_PRODUCT_OBSERVATIONS` referencia `OBSITCOMANDAVEN` e `OCORRENCIA` | O próprio fornecedor mantém uma rota de leitura enriquecida que não é equivalente a ler somente o texto do item. |
| `vendor/odhen/api/src/Service/Comanda.php`, ~1664–1734 | `getLastSaleProductObservations`, `getLastSaleCombos`, `getLastSaleComboProducts` | Existem caminhos próprios de recuperação de observações e detalhes de combos, confirmando granularidade distinta. |

O SELECT instalado de `C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2.ps1`, ~204–220, consulta cabeçalhos/itens nativos, mas **não consulta diretamente** `ITCOMANDAEST`, `OBSITCOMANDAVEN`, `OBSITCOMANDAEST` nem `OCORRENCIA`. Isso é uma lacuna de cobertura *potencial para pedidos que usam essas relações*, **não comprovação de falha em algum pedido iFood específico**. Não é legítimo promover `observation_scan_complete=true` autoatribuído como prova independente.

### O que NÃO podemos inferir
- Os caminhos `Pedido::fazPedido` e `Comanda::insereProdutos` **não foram ligados inequivocamente** ao receptor `DLV_IFO`. Outros serviços/processos podem gravar uma comanda iFood; o chamador/commit real permanece `UNKNOWN`.
- `getLastSale...` é evidência de código de consulta do fornecedor; não é autorização para chamar SQL em produção nem garantia de isolamento/sem bloqueio de escritores.
- A amostra de 16 eventos emitidos e coerentes na madrugada de 12/11 (todos de 11/11, com campos de observações não vazios) não cobre, por si só, linhas ausentes nas tabelas filhas. Nenhum dado identificável de pedido ou cliente foi copiado para este documento.

## Diferença material: `X` não significa exclusivamente cancelamento

Dois caminhos do **mesmo código instalado** escrevem o mesmo valor:

1. `src/Controller/Delivery.php`, `cancelDeliveryOrder()`, ~280–386, chama `mudarStatusComanda(..., 'X')` no fluxo de cancelamento.
2. `vendor/odhen/api/src/Service/Comanda.php`, `liberaComandaDelivery()`, ~1916–1930: lê `IDRETBALLOJA` e `IDFINPEDAUTDLV`; quando **qualquer um é `S`**, grava `X`. No ramo `else`, grava `P`. O comentário local associa o primeiro caso a retirada no balcão, que pula controle de entrega. Há também uma condição de finalização automática.

Portanto `IDSTCOMANDA=X` é **ambíguo em relação à causa/transição**. `P` também **não equivale** a item fisicamente pronto, motoboy liberado ou pedido entregue. Exigir evento ou recibo do caminho real antes de mostrar uma categoria operacional. A Home atual mantém `ready_for_dispatch=null` e `operational_order_total=null` sem evidência, o que deve ser preservado.

## Prova de menor custo para destravar L1 sem atrapalhar venda

1. **Inventário estático de origem**: localizar o serviço que realmente grava `DLV_IFO` e a fronteira de transação/commit, com uma ligação inequívoca do pedido iFood ao `NRCOMANDAEXT` e à chave nativa de quatro partes.
2. **Uma revisão, não varredura ampla**: escolher uma comanda de iFood do Itaim com testemunha externa legítima (ID de loja, UUID ou vínculo forte verificável, timestamp, itens, complementos, observações) e confrontar com as relações nativas. Produzir só contagens e divergências sanitizadas.
3. **Impacto em escritores antes de qualquer consulta extra**: avaliar isolamento e risco de bloqueio; `SERIALIZABLE` com `LOCK_TIMEOUT=100` limita espera do *leitor*, não necessariamente bloqueio causado aos escritores do POS. Não executar no CAIXA_MOOCA sem plano de segurança específico, isolado e comprovado.
4. **Publicação e L3 sob HOLD**: não deduzir `cancelado` apenas de `X`, não deduzir `pronto` apenas de `P`, não promover `ready_for_downstream_shadow` a `physicalReady`, não alimentar Home operacional ainda.

**Gates finais:** `L1_PARTIAL`, `N2_A_WRITER_IMPACT=UNKNOWN`, `N2_B_CHILD_COVERAGE=UNKNOWN`, `N4_IFOOD_STRONG_JOIN=HOLD`, `L3_STATUS_SEMANTICS_NOT_UNIQUE`, `HOME_REAL=HOLD`, `FIELD_ACCEPTED=0/8`. PR #137 DRAFT/HOLD; PR #135 Stage 3/HOLD. Documento de investigação, sem alterações em código de produção ou caixa.

## Nova fonte independente encontrada no host: exportações históricas iFood (12/11/2026)

Na pasta `Downloads` do perfil já identificado no CAIXA_MOOCA, foi localizado **sem pesquisa SQL nem intervenção no Gestor** um XLSX de pedidos e quatro CSVs originados de `relatorios.ifood.com`. Somente o XLSX de pedidos e o CSV principal foram examinados por cabeçalhos e agregações **em memória**, sem registrar/exportar UUIDs, IDs curtos, consumidores, dados financeiros ou textos individuais:

| Evidência passiva | iFood XLSX | iFood CSV principal |
| --- | ---: | ---: |
| Período coberto | **20–26/04/2026** | **30/03–05/04/2026** |
| Pedidos/linhas válidas | **2.070** | **1.814** |
| `ID DA LOJA` | **53069 em 2.070/2.070** | **53069 em 1.814/1.814** |
| `ID COMPLETO DO PEDIDO` UUID completo | 2.070/2.070 | 1.814/1.814 |
| `ID CURTO DO PEDIDO` com 4 dígitos | 2.070/2.070 | 1.814/1.814 |
| Duplicidade interna do UUID | **0** | **0** |
| Estado final iFood | 2.039 `CONCLUIDO`, 22 `CANCELADO`, 9 `CANCELAMENTO PARCIAL` | 1.795 `CONCLUÍDO`, 19 `CANCELADO` |
| `ID DO PEDIDO NA INTEGRADORA` | Não há essa coluna no arquivo | **0/1.814 preenchidos** |

**Significado sustentado:** o próprio iFood fornece material histórico independente vinculando `UUID ↔ ID curto ↔ ID da loja 53069 ↔ horário ↔ status final`. Isso **não estabelece que `53069` corresponde globalmente à filial interna `0001/01`**; vincular o estabelecimento deve permanecer atestado por evidência operacional autorizada. A coluna que poderia dar um atalho direto para ID da integradora está **integralmente vazia** no CSV. Não imaginar que ela contém `NRVENDAREST` ou `NRCOMANDA`.

**Fronteira temporal comprovada:** o checkpoint atualmente instalado do Reader possui 250 revisões com data nativa **10/11 (25) e 11/11 (225)**. Portanto as duas exportações iFood encontradas **não se sobrepõem em data ao checkpoint ativo**; não houve nem há prova `UUID iFood ↔ quatro partes da chave do Reader` a partir delas. Também não demonstram itens, modificadores, observações ou uma sessão viva atualizada.

**Contra-rota escolhida:** não construir uma conciliação aparente baseada apenas em UUID e short-code de épocas diferentes; não presumir integradora por coluna vazia. Para tentar N4 de novo, é necessária uma **fonte legítima da mesma data/loja do evento Reader**, com detalhe autorizado e vínculo forte, além de checagem nativa das tabelas filhas por caminho seguro. Esses exports históricos são evidência de capacidade de auditoria e identidade de fonte iFood, **não** gatilho de Home operacional. `L1=PARTIAL`, `N2_B=UNKNOWN`, `N4=HOLD`, `L3=AMBIGUOUS_X`, `FIELD_ACCEPTED=0/8`.

## Verificação adicional: observação cobrada aponta para uma segunda linha nativa (12/11/2026)

**Evidência estática, somente leitura de código do fornecedor instalado no CAIXA_MOOCA; nenhuma chamada de função, SQL ou processo foi iniciada.**

- `vendor/odhen/api/src/Service/Comanda.php`, aproximadamente 270–334: no caminho de observação cobrada, o fornecedor cria uma linha adicional via `INSERT_PRODUCT`, usando `CDPRODUTO = pricedObservation['CODIGOOCORRENCIA']` e `QTPRODCOMVEN = productQuantity`. Em seguida grava `OBSITCOMANDAVEN.NRPRODCOMVEN` igual à linha **pai** e `OBSITCOMANDAVEN.NRPRODCOMVENOBS` igual ao identificador da **linha adicional**; `QTPRODCOMVENOBS = productQuantity`. Para observação comum, grava `NRPRODCOMVENOBS = null`.
- `vendor/odhen/api/src/Util/MSDEQuery.php`, aproximadamente 1280–1318: a consulta de observações do próprio fornecedor distingue `OCORRENCIA.CDPRODUTO IS NULL` e `IS NOT NULL`; no segundo caso relaciona `ITCOMANDAVEN.CDPRODUTO` ao código da ocorrência. Isso fundamenta a comparação de linha, código e quantidade como **verificação estrutural offline**, não como prova de origem DLV_IFO, de preço, de ausência de duplicações legítimas nem de transação atômica.

**Falha anterior:** o reconciliador puro aceitava `NRPRODCOMVENOBS` preenchido com um identificador que nem existia em `ITCOMANDAVEN`. Também não comparava o código do produto da ocorrência e a quantidade da linha cobrada. Isso poderia declarar `childJoinShapeMatched=true` apesar de associação incompleta.

**Correção na PR #137:** a receita de seis conjuntos `tools/comandas_reader_one_order_children_CAPTURE_OFFLINE_ONLY.sql` passou a projetar `OCORRENCIA.CDPRODUTO` no rowset 5, sem nova tabela, join ou consulta. O reconciliador `runtime/reporting/native_reader_n2_child_tables_review_v1.cjs` exige, quando `NRPRODCOMVENOBS` não é nulo, uma linha adicional distinta do pai na **mesma revisão**, com `CDPRODUTO` e `QTPRODCOMVEN` correspondentes e referência não reutilizada. Se não puder provar estruturalmente, devolve `HOLD`. Para observações comuns, código de produto associado sem referência à linha nativa também devolve `HOLD`. **Não há promoção a autenticado**, independentemente do resultado.

**Testes executados no GitHub Actions, apenas dados inventados:** `NATIVE_CHILD_ONE_ORDER_RECONCILE_PASS 56/56 OFFLINE_ONLY_FIELD_HOLD`, `NATIVE_CHILD_SQL_BLUEPRINT_STATIC_PASS 14/14 OFFLINE_NO_SQL`, `READER_IFOOD_EXISTING_PROCESSING_CORRELATION_PASS 28/28 OFFLINE_ONLY_HOLD`, job `Static fixture contracts` do run [43204584089](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/43204584089). Não executar o SQL sem investigação de índices, semântica de revisão, transação/commit e impacto sobre escritores.

**Limite de generalização:** uma linha extra de produto usada para cobrança pode afetar a contagem de itens nativos versus itens expostos no iFood. A correlação simples 1:1 não foi aprovada como regra universal, e nenhuma tentativa de remover automaticamente linhas cobradas da contagem de produtos foi autorizada sem evidência. `N2_B=UNKNOWN`, `N4=HOLD`, `HOME_REAL=HOLD`, `PRINT=HOLD`.
