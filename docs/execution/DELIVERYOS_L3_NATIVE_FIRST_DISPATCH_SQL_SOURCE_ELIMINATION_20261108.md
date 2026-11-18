# Delivery OS Itaim — limite comprovado de fontes SQL para primeiro despacho nativo (08/11/2026)

**Escopo da investigação:** `CAIXA_MOOCA` (equipamento do caixa do Itaim), banco SQL local `teknisa`, somente leitura. Executadas consultas ao catálogo `sys.tables`, `sys.columns`, `sys.indexes` e `sys.partitions`, um SELECT agregado filtrado por uma revisão histórica já validada e duas consultas `EXISTS` sem projeção de dados. Nenhum pedido foi criado ou modificado; nenhuma impressão, spooler, serviço, tabela, configuração, deploy, merge ou contato com a Teknisa foi efetuado. `SET LOCK_TIMEOUT<=250ms`, `CommandTimeout<=4s`, prioridade de deadlock baixa e conexões não-poolizadas. As invocações PowerShell usaram `-WindowStyle Hidden`; **não existe atestado visual de que não piscaram na tela**.

## 1. O que já estava comprovado antes desta rodada

A PR #135, branch `audit/comandas-native-chain-20261102`, possui análise de símbolos compilados de `Pkg_Dlv00000.bpl`, `PKG_IMP00000.bpl`, `PKG_DLV00100.bpl`, `FosImp.exe` e `FosSinc.exe`. Também contém `tools/comandas_native_first_dispatch_lineage_v1_offline.cjs` e `tools/comandas_native_first_dispatch_correlation_v1_offline.cjs`. Esses verificadores já recusam tratar impressão manual, relatório pós-venda, evento de spooler 307, emissão fiscal ou simples nome de função como prova de **primeira via automática para uma revisão `DLV_IFO`**.

Fonte versionada da investigação: `docs/comandas/MAPA_ROTINAS_NATIVAS_FORSALE_DELIVERY_IMPRESSAO_20261101.md`, lido novamente nesta rodada na PR #135; não se repetiu análise de executáveis nem se tentou ler módulos vivos protegidos. `NATIVE_FIRST_DISPATCH=UNKNOWN` continuava correto.

A PR #137 já havia comprovado que `PRODAMBIENTE` estava vazia, enquanto `IMPRLOJA` e `MAPIMPRLOJA` tinham respectivamente 10 e 24 registros com `IDATIVO='S'` para `0001/01`. Cadastros de impressora não são evidência de rota atual nem de impressão física.

## 2. Busca técnica de histórico que também carregue a chave de pedido

Na base `teknisa`, procuraram-se **somente metadados** de tabelas que contivessem `CDFILIAL`, `CDLOJA`, pelo menos uma das chaves `NRVENDAREST`/`NRCOMANDA`, e indicadores lexicais de impressão/emissão/via ou nomes de histórico/log. O filtro retornou seis tabelas: `COMANDAVEN`, `ITCOMANDAVEN`, `HISTPEDCONS`, `ITCMDVENORIG`, `VENDA` e `PEDIDOFOS`. **Busca restrita por nomes não prova exaustividade da base**, nem identifica automaticamente a origem real de uma emissão.

Duas fontes com colunas sugestivas mereceram verificação específica:

- `ITCMDVENORIG`: reúne `CDFILIAL`, `CDLOJA`, `NRVENDAREST`, `NRCOMANDA`, `NRPRODCOMVEN`, `CDPRODUTO`, `QTPRODCOMVEN`, além de `IDPRODIMPFIS` e `NRPEDIDOFOS`. A chave primária usa filial, venda, comanda e linha de item, mas **não inclui `CDLOJA`**, embora a coluna exista. Sua presença não é prova de histórico completo de impressão nem integridade entre lojas.
- `PEDIDOFOS`: possui `NRPEDIDOFOS`, `CDFILIAL`, `CDLOJA`, `NRCOMANDA`, `IDIMPPEDIDOFOS`, `CDSETOR`, `NRCOMANDAEXT` e campos de status. **Não possui `NRVENDAREST`**. Portanto um encontro apenas por número de comanda não seria identificação forte de uma revisão; esse atalho não foi usado.

## 3. Provas reais e contra-verificação de ausência

1. **Uma revisão histórica `DLV_IFO` previamente validada:** após conferir `snapshot_hash`, filial `0001`, loja `01` e origem exata, uma consulta somente de contagens em `ITCMDVENORIG`, limitada às quatro partes da identidade nativa do cabeçalho, retornou **0 linhas**, 0 linhas distintas e 0 referências a `NRPEDIDOFOS` para a comanda cujo Reader tinha quatro itens. A consulta válida levou **17 ms**. A primeira tentativa falhou por converter `SUM(NULL)` em inteiro quando não havia registros; foi corrigida com `COALESCE(SUM(...),0)` e não foi contada como sucesso.
2. **Catálogo de partições:** `sys.partitions` nas partições heap/clustered retornou estimativas de contagem `ITCMDVENORIG=0`, `PEDIDOFOS=0`, `PRODAMBIENTE=0` e `HISTPEDCONS=9314`. Esses valores são **contadores de catálogo**, não censo físico nem prova de ordenação.
3. **Confirmatório de presença global:** `EXISTS (SELECT TOP(1) 1 FROM TEKNISA.ITCMDVENORIG)` = **false**; `EXISTS (SELECT TOP(1) 1 FROM TEKNISA.PEDIDOFOS)` = **false**. Consulta **13 ms**, sem saída de linhas de negócio ou IDs. Isso confirma que **as duas tabelas estavam vazias no instante da medição**, em todo o banco consultado, e não apenas para o pedido selecionado. Não extrapolar o estado para outras bases, outros momentos ou vias de impressão.

Não houve tentativa de correlacionar `PEDIDOFOS.NRCOMANDA` a registros do Reader por chave parcial, nem de usar `IDPRODIMPFIS` ou `IDIMPPEDIDOFOS` como prova de que papel saiu: além de a semântica não ter sido atestada, nenhuma dessas duas tabelas tinha registros.

## 4. Decisão — bloquear rota sem dados, não o projeto inteiro

**Rota excluída no estado atual do banco:** implementar uma prova de **primeira emissão nativa** a partir de `ITCMDVENORIG` ou `PEDIDOFOS`. Ambas carecem de linhas e não oferecem vínculo operacional observável para a revisão `DLV_IFO`. Isso não significa que a Teknisa não imprima, que toda emissão seja manual, ou que não existam outros fluxos/caches/configurações.

**Rota preservada:** a revisão do Reader continua apoiada no cabeçalho, itens e histórico comprovados da comanda, com SQL transacional N2 ainda não atestado. `HISTPEDCONS` tem registros na base e já havia mostrado dois eventos para o mesmo pedido histórico, mas é **histórico de pedido**, não recibo da primeira via. Para identificar o primeiro despacho automático será necessária evidência independente que carregue a **identidade de quatro partes**, hash/revisão, horário de tentativa, origem de produção, praça, destino e resultado, e que não confunda evento manual, relatório ou spooler genérico. Nenhum dado com esse vínculo completo foi obtido.

**Evitar trabalho duplicado:** usar o contrato `comandas_native_first_dispatch_lineage_v1_offline.cjs` da PR #135; não criar uma segunda implementação em PR #137, nem insistir em tabelas que estão vazias. Caso surja prova legítima e independente, ela poderá ser confrontada com o contrato e com o trabalho por linha já existente na PR #137. Antes disso, não promover a Home nem liberar impressão.

**Gates remanescentes:** `L3_FIRST_NATIVE_PRODUCTION_DISPATCH=UNKNOWN`; `L2_STATION_ROUTE=HOLD`; `N2_ATOMIC_CAPTURE=HOLD`; `N4_EXTERNAL_IFOOD_BINDING=HOLD`; `LIVE_HOME=HOLD`; `PHYSICAL_PRINT=HOLD`; `DEPLOY=NO`; **V1=0/8 etapas integralmente aceitas em operação**.

**Limite metodológico:** as consultas `EXISTS` provam ausência somente **no instante e base observados**. Elas não atestam inexistência de outros bancos, componentes de aplicação, filas de Windows, logs próprios nem registros que venham a ser criados. Não foi verificada a semântica de todos os estados nativos, nem o efeito sobre o caixa durante pico de atendimento. Nenhuma medição de bloqueio de escritores sob `SERIALIZABLE` foi executada.
