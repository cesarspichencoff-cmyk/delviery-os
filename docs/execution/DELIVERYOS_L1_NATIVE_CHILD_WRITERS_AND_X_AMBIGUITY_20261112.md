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
