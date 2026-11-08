# TATÁ Comandas — Etapa 3: fluxo de gravação e cobertura das observações da Teknisa (08/11/2026)

**Estado:** `SOURCE_CODE_OBSERVED` · `SEMANTIC_COMPLETENESS_NOT_PROVEN` · `STAGE_3=IN_PROGRESS` · `PRINT/CUTOVER=HOLD`.

## Escopo e proveniência

Leitura estritamente passiva de faixas de arquivos PHP já instalados no **CAIXA_MOOCA (host físico do Itaim)**, sem executar processos/SQL, varredura ativa, cópia de dados de pedido, impressão ou mudança na operação:

- `C:\TEKNISA\odhenPOS\backend_74000\vendor\odhen\api\src\Service\Comanda.php` — 1.943 linhas; arquivo modificado em 09/06/2026.
- `...\Service\Venda.php` — 5.411 linhas; arquivo modificado em 09/06/2026.
- `...\Util\MSDEQuery.php` — 5.860 linhas; arquivo modificado em 09/06/2026.

Código **presente no host** não prova que a ingestão original de **cada** pedido iFood acione exatamente esse caminho, nem que a versão tenha execução idêntica no momento do incidente. As referências abaixo são de linhas aproximadas do arquivo PHP; nenhum código proprietário ou PII foi copiado para este documento.

## Evidência A — não confundir cabeçalho existente com pedido concluído

No método `Comanda::comanda()` (~linhas 48–75), as chamadas estão em sequência com condições de erro entre elas:

1. `abreComanda` (~58), que em ~1005–1018 gera códigos, chama `insereVendaRest` (`INSERT_VENDAREST`) e, depois do primeiro retorno bem-sucedido, `insereComandaVen` (`INSERT_COMANDAVEN`).
2. `registraPagamento` (~60).
3. `preparaProdutos` e `insereProdutos` (~63–66).

Em `insereProdutos` (~176–340), dentro de um laço de produtos, há comandos independentes de `INSERT_PRODUCT` para itens (~229) e variantes de observações com preço (~308), `INSERT_SMARTPROMO` para componentes promocionais (~242) e `INSERT_PRICED_OBSERVATION` para ocorrências/observações (~320, ~336).

**FATO:** esse método contém múltiplas etapas e escritas de entidades distintas. **NÃO PROVADO:** se elas integram uma única transação SQL no caminho efetivamente utilizado pelos pedidos do iFood. Não há `beginTransaction/commit/rollBack` explícitos nos métodos inspecionados de `Comanda.php`, mas uma transação **pode** estar num chamador ou camada superior.

**Controle de contraprova:** `Venda.php` contém `beginTransaction` (~123, ~333), `commit` (~282/288, ~548) e `rollBack` (~305, ~554) em métodos de venda. Isso demonstra que há caminhos transacionais **diferentes** no mesmo produto; não prova que esses escopos envolvam `Comanda::comanda()` durante a ingestão iFood.

## Evidência B — a consulta candidata de quatro tabelas não cobre toda a estrutura usada pelo caminho PHP

1. `MSDEQuery::INSERT_PRODUCT` (~1105–1117) grava `ITCOMANDAVEN`, incluindo `DSOBSPEDDIGCMD`.
2. `MSDEQuery::INSERT_SMARTPROMO` (~1120–1131) grava `ITCOMANDAEST`, tabela de componentes/promos.
3. `MSDEQuery::INSERT_PRICED_OBSERVATION` (~4063–4068) grava `OBSITCOMANDAVEN`, com `NRPRODCOMVEN`, `CDOCORR`, `CDGRPOCOR` e quantidade de observação. O mesmo identificador é chamado em `Comanda::insereProdutos` para observações precificadas e comuns.
4. `MSDEQuery::GET_LASTSALE_PRODUCT_OBSERVATIONS` (~1281–1317) **lê `OBSITCOMANDAVEN` e faz associação com `OCORRENCIA`** para obter a descrição das ocorrências; também consulta `ITCOMANDAVEN` conforme o caso.

A candidata `tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql` lê **somente** `COMANDAVEN`, `VENDAREST`, `ITCOMANDAVEN` e `PRODUTO`, projetando 17 campos. Alguns textos são capturados diretamente de colunas do cabeçalho e item; entretanto, **não há leitura da tabela `OBSITCOMANDAVEN`, nem de `ITCOMANDAEST`, nem do catálogo `OCORRENCIA`**.

**Conclusão estrita:** a consulta não comprova cobertura de observações gravadas em tabela separada, componentes promocionais nem descrições associadas, quando esses caminhos se aplicarem. É uma lacuna estrutural **do desenho revisado**, não prova de perdas efetivas em pedidos reais.

## Evidência C — caminho adicional do Pedido nativo e observações de componentes

Leitura passiva complementar em 08/11/2026 dos arquivos **instalados** (código local, não prova de execução para iFood):

- `C:\TEKNISA\odhenPOS\backend_74000\src\Service\Pedido.php`, método `fazPedido` (~linha 51), com 1.440 linhas de arquivo. O trecho ~537–545 distingue combinações em que o produto pai vai a `ITCOMANDAVEN` e os filhos a `ITCOMANDAEST`, de outras em que filhos entram em `ITCOMANDAVEN`.
- Esse caminho efetua `SQL_INS_ITCOMANDAVEN` (~935), `SQL_INS_OBSITCOMANDAVEN` (~948), `SQL_INS_ITCOMANDAEST` (~990/1047) e **`SQL_INS_OBSITCOMANDAEST`** (~1003/1061), de acordo com o tipo do item. Portanto, observações de componentes de combinações também podem ficar em tabela distinta.
- Uma seção de impressão dos pedidos aparece após essas escritas (~1077–1095), com opções de tecnologia de impressão. Essa ordem no fonte **não é recibo de papel, nem marca de conclusão de revisão ou garantia de chamada única**.
- Foram inspecionados passivamente os métodos de `src/Service/Delivery.php`, `src/Service/Order.php`, `src/Controller/Delivery.php` e `src/Controller/Order.php`. Os nomes/rotinas encontrados cobrem leitura, expedição, cancelamento, alteração de pedidos e impressão; nenhum deles atestou **o receptor original** do pedido iFood. Outros módulos ou serviços externos ainda podem existir.
- Uma leitura completa do arquivo `vendor/odhen/api/src/Service/Venda.php` encontrou `beginTransaction/commit/rollBack` para rotinas de venda e liberação de comanda, **mas nenhuma chamada direta literal a `Comanda::comanda()`**; assim não vincular os commits observados ao `Comanda::comanda` da outra fonte sem rastrear o chamador efetivo. Isso não exclui chamada indireta por outros módulos.

**Nova lacuna N2-B:** além de `OBSITCOMANDAVEN`, `ITCOMANDAEST` e `OCORRENCIA` (identificadas no caminho vendor), a fonte de Pedido nativo utiliza `OBSITCOMANDAEST`. A candidata SQL de quatro tabelas **não acessa nenhuma dessas quatro**. Não presumir que ambas as fontes sejam necessariamente acionadas pelo iFood: a lacuna é a **ausência de demonstração de cobertura para os caminhos inspecionados**, não prova de que pedidos atuais estejam incompletos.

**Decisão:** ampliar mapa de semântica/associação e identificar chamador/commit por evidência independente, não fazer JOIN automático sob `SERIALIZABLE` nem inferir que o gatilho de impressão foi alcançado. Dados transacionais, itens, componentes, observações e papel físico permanecem gates diferentes. `STAGE_4=NOT_AUTHORIZED`, `PRINT=HOLD`, `CUTOVER=HOLD`.

## Não aplicar correção precipitada

**Não acrescentar JOINs às tabelas faltantes de forma automática.** A tabela de observações é gravada sem campo `CDLOJA` na lista de colunas do INSERT visto; o relacionamento exato e a unicidade/índices precisam de catálogo e prova de identidade. JOINs adicionais sob `SERIALIZABLE` podem multiplicar linhas, exceder a sentinela `TOP(201)`, introduzir scans e **aumentar locks para escritores**. `LOCK_TIMEOUT 100` restringe espera do leitor, não a espera de escritores bloqueados por ele.

O produto deve seguir separando:
- consistência transacional de um resultado lido;
- completude semântica da aplicação após os commits relevantes;
- cobertura real de itens/modificadores/observações;
- decisão de primeira impressão por via e revisão.

## Prova que muda o gate

1. Identificar por evidência independente o **caminho de ingestão efetivo** do iFood na unidade Itaim e sua fronteira de transação/commit, sem inferi-la a partir de nomes de classes.
2. Estabelecer catálogo e cardinalidades da origem de `OBSITCOMANDAVEN`, `ITCOMANDAEST` e `OCORRENCIA`, e a correspondência semântica de observações/modificadores, **antes** de desenhar novos JOINs.
3. Avaliar alternativa de preservar a impressão nativa e obter um sinal de completude na aplicação/integração, em vez de aumentar o isolamento SQL sem prova de segurança. Uma consulta consistente em SQL Server não atesta sozinha o fim de todas as escritas.
4. Só com autorização específica, ambiente seguro e evidência N2-A/N2-B considerar ensaio com uma revisão real. Sem isso, `STAGE_4=NOT_AUTHORIZED`.

Nenhum SQL real, arquivo de evento, dado de cliente, XEL binário, processo, serviço, impressão, sequência, merge ou deploy foi acionado nesta verificação.
