# Delivery OS Itaim — um pedido iFood ↔ Reader observado passivamente (12/11/2026)

**Escopo:** verificação pontual em 12/11/2026, somente leitura, sem SQL, sem navegação/ação no navegador, sem iniciar processo no CAIXA_MOOCA, sem instalar serviço, sem impressão, sem enviar pedidos ao Delivery OS. Este documento registra **convergência de evidências**, não atestação independente da origem SQL, de completude ou de vínculo nativo ao UUID iFood.

## Testemunhas já disponíveis

1. **Portal do Parceiro iFood**, aba de pedido já aberta no navegador Opera conectado, lida unicamente por árvore de acessibilidade. A página mostra um pedido **Concluído**, realizado em **11/11 às 22h59**, com duas linhas: **Hot Roll (1)** e **Tartar de Salmão (1)**. O identificador curto foi usado apenas em memória para conferir o evento nativo; UUID do URL, ID curto, valores, cliente e qualquer outra informação privada não foram copiados para este arquivo.
2. **Checkpoint Reader instalado:** leitura passiva do arquivo já existente `state/reader-watch-checkpoint-v1.json` no CAIXA_MOOCA. Contém **250** entradas na filial/loja `0001/01`. Houve **uma** entrada cujo horário nativo registrado corresponde a `2026-11-11T22:59`. A revisão de quatro partes e o SHA no checkpoint foram preservados como valores privados.
3. **Arquivo do evento Reader** já persistido em `state/reader-events-v1`: localizado exclusivamente por igualdade do hash de revisão selecionado no checkpoint. O arquivo contém **duas** linhas, com quantidades **1,000 + 1,000**. Identidade nativa de quatro partes, hash, data/minuto e código curto coincidiram com o checkpoint e com o campo correspondente do Portal do Parceiro.
4. **Decisão de processamento já persistida** em `state/reader-shadow-decisions-v1`: a chave de quatro partes e o hash coincidem com o evento. Os nomes internos são `HOT ROLL` e `TARTAR DE SALMAO`, cada um com quantidade **1**. Os nomes externos eram `Hot Roll` e `Tartar de Salmão`; a comparação por minúsculas e diacríticos permite **2/2** correspondências sem garantir identidade por foreign key. O comparador offline na PR #137 ganhou uma regra de normalização com veto a colisões de nomes distintos.

## Resultado limitado e contra-prova de completude

| Aserção | Resultado |
| --- | --- |
| Mesmo dia/minuto nos dois sistemas | **OBSERVADO** |
| Igualdade do código curto | **OBSERVADO** em memória, identificador não exportado |
| Evento ↔ checkpoint ↔ decisão, mesma chave de quatro partes e SHA | **OBSERVADO** |
| Quantidade e nomes normalizados dos dois produtos | **2/2 OBSERVADO** |
| UUID iFood ↔ foreign key nativa assinada ou documentada | **NÃO PROVADO** |
| ID da loja iFood ↔ `0001/01` independentemente atestado | **NÃO PROVADO** |
| Integridade de captura SQL sob a mesma transação/commit | **NÃO PROVADO** |
| Tabelas filhas `ITCOMANDAEST`, `OBSITCOMANDAVEN`, `OBSITCOMANDAEST`, `OCORRENCIA` exaustivamente lidas | **NÃO PROVADO** |
| Capacidade de imprimir, publicar na Home ou tratar estado físico | **NÃO AUTORIZADO** |

**Contradição material observada:** o evento da instalação declara `order.observation_scan_complete=true`, `ready_for_downstream_shadow=true` e `blockers=[]`; o arquivo possui **uma** observação de escopo geral `DSOBSCOMANDA`. A decisão de processamento carrega uma observação de pedido e nenhuma de item. **Essas afirmações autocontidas não demonstram leitura das tabelas filhas**, ausentes da consulta do watcher instalado conforme inspeção de código já documentada em `DELIVERYOS_L1_NATIVE_CHILD_WRITERS_AND_X_AMBIGUITY_20261112.md`. O conteúdo da observação não foi exportado ou reproduzido. Também não se inferiu ausência de modificadores na fonte externa porque a interface observada não fornece atestado de sua exaustividade.

**Correção preventiva na PR #137:** o adaptador real `runtime/reporting/copiloto_tata_reader_adapter_v1.cjs` não deve mais aceitar `canonicalContractChecked=true` como se fosse `observationScanIndependentlyProven=true`. O verificador de origem devolve explicitamente `false` para essa segunda propriedade. Em `sourceMode=real`, a admissão deve retornar `READER_REAL_NATIVE_CHILD_TABLE_COVERAGE_UNPROVEN` até existir comprovante independente e devidamente revisto. O laboratório continua admitindo somente revisões sintéticas de controle, sem publicar nem imprimir.

## Nova checagem estática: `GET_LAST_SALE` do fornecedor não identifica a origem

Em 12/11/2026 foi feita outra leitura **somente de arquivo de código instalado**, sem API nem consulta SQL:
- `C:\\TEKNISA\\odhenPOS\\backend_74000\\vendor\\odhen\\api\\src\\Util\\MSDEQuery.php`, ~1240–1264, constante `GET_LAST_SALE`: a cláusula `WHERE CV.NRCOMANDAEXT = :NRCOMANDAEXT` é ordenada por `VR.DTHRABERMESA DESC`. **Não existem nessa seleção predicados de `CDFILIAL`, `CDLOJA`, `IDORGCMDVENDA` ou UUID iFood.**
- `vendor/odhen/api/src/Service/Comanda.php`, ~1610–1630: `getLastSale($NRCOMANDAEXT)` recebe **somente** o número curto e chama `fetchAssoc("GET_LAST_SALE", ...)`. Sem unicidade demonstrada, escolher o registro cronologicamente mais recente **não** comprova qual venda corresponde a uma referência iFood.
- As consultas auxiliares `getLastSaleProducts/getLastSaleProductObservations/getLastSaleCombos/getLastSaleComboProducts` recebem `CDFILIAL, NRVENDAREST, NRCOMANDA`, e, para combos, o par de agrupamento nativo. Isso ajuda a estudar as relações **depois** de obter a chave exata, mas não atesta por si a seleção inicial nem a integridade temporal/SQL.

**Efeito prático:** a rota aparentemente simples "pegar UUID iFood → número curto → `GET_LAST_SALE` → comanda" está **DESCARTADA como prova forte N4**. Códigos curtos podem se repetir em datas/lojas diferentes; ainda que nome, quantidade e minuto coincidam, isso sustenta somente correlação. Não afirmar que efetivamente ocorreu colisão neste pedido: o risco é deduzido da ausência de restrições no SQL instalado, e não de uma colisão real observada.

**Proteção testada por fixtures:** o comparador `native_reader_ifood_processing_correlation_v1.cjs` conserva `state=HOLD` e `nativeUuidLinkProven=false` até com uma segunda identidade nativa fictícia e os mesmos produtos/minuto/código curto; variantes de outra data/loja não correlacionam. O teste não consulta o fornecedor nem autentica a fonte.

## O que este marco altera

Esta observação supera uma **ausência total de confrontação contemporânea**: agora existe **um** pedido do Portal e **um** evento Reader com múltiplos campos coincidentes e a mesma data. **Não** generaliza para outros pedidos, não prova 100% do movimento, não comprova completude semântica, não autoriza novo SQL e não muda a política de proteção absoluta de tela do CAIXA_MOOCA.

**Gates:** `L1_IFOOD_READER_ONE_ORDER=CORRELATED_PASSIVE`; `N2_B_CHILD_COMPLETE=UNKNOWN`; `N2_A_WRITER_IMPACT=UNKNOWN`; `N4_UUID_NATIVE_FOREIGN_KEY=HOLD`; `L3_PHYSICAL_STATE=UNKNOWN`; `HOME_REAL=HOLD`; `PRINT=HOLD`; `FIELD_ACCEPTED=0/8`.

**Próxima prova material:** por canal autorizado e sem efeitos em produção, atestar a leitura exaustiva das tabelas filhas da *mesma* revisão e sua origem/commit, antes de promover qualquer dado além da correlação passiva. Não usar apenas uma marca de completude escrita pelo próprio Reader.
