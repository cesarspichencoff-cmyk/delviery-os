# TATÁ Comandas — transição das impressões antigas para saída única

**27/10/2026 — PR #127 — SOMENTE PLANEJAMENTO E TESTE OFFLINE / SEM MUDANÇA NO CAIXA**

## Decisão operacional solicitada

Quando as novas comandas forem testadas, aceitas e implantadas, **Teknisa e iFood não devem produzir comandas redundantes em papel**, nem enviar trabalhos para a Epson errada, enquanto a saída do **TATÁ Comandas** assume a preparação das vias corretas por praça e a conferência do caixa. Manter intacto o caminho fiscal e a operação normal durante o desenvolvimento.

O pedido é de **substituição progressiva e segura da emissão**, não de eliminar o cadastro de pedidos na Teknisa, nem de desativar fisicamente todas as impressoras.

## Uma distinção que muda a solução

**A impressão virtual pode ser um destino sem papel, mas não é automaticamente o gatilho confiável de um pedido.** A Microsoft documenta a porta local `NUL` como modo de enviar jobs Windows sem gastar papel, e a arquitetura do spooler inclui processador e monitor de porta. Porém, isso só cobre o fluxo que efetivamente passa **por aquela fila Windows**. Se algum componente imprime diretamente em IP, outro servidor, periférico ou via do Gestor, desviar uma fila local para `NUL` **não o intercepta**. O Windows pode registrar um trabalho descartado como processado; isso não significa pedido interpretado, papel ou entrega ao TATÁ.

Referências oficiais:
- https://learn.microsoft.com/pt-br/troubleshoot/windows-server/printing/troubleshoot-printing-scenarios
- https://learn.microsoft.com/en-us/windows/win32/printdocs/port-monitors
- https://learn.microsoft.com/en-us/windows-hardware/drivers/print/printing-a-print-job

**Gatilho preferido:** evento/revisão **nativa** do pedido já observado pelo Reader, acompanhado de uma fonte atestada de elegibilidade da primeira via. Não usar nome do documento no spooler, job ID ou status `Printed` como identidade de venda; não usar status `P` ou `X` da Teknisa como comprovante de primeira impressão. O cruzamento externo iFood × Teknisa continua **somente na conferência**, não nas duas produções.

## Descoberta posterior que limita o desvio virtual

A inspeção **somente do código instalado** em `CAIXA_MOOCA` identificou três transportes possíveis da Teknisa: `PONTE_HTTP_PRINT` (`/print` para periféricos), `PHP_PORT_WRITE` (`fopen/fwrite`) e `DELPHI_FILE_DISPATCH`. **O ramo ativo não foi comprovado** e nenhuma fila foi desviada. Não se pode tratar `NUL` como cobertura universal desses caminhos. O contrato de transição exige agora o pré-voo `tools/comandas_teknisa_transport_census_v1_offline.cjs` compatível com o transporte e destino alegados antes de admitir sequer uma candidatura de migração. Caso faltem flags do runtime, prova da fila real depois da ponte ou do Delphi, ou comprovação de isolamento fiscal, a transição permanece `HOLD`.

[Auditoria de transporte do PHP instalado](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md) fornece SHA-256 dos módulos lidos, evidência de cada ramo, limites e testes; **23/23 transporte + 18/18 modo nativo + 38/38 contrato de cutover** passaram em clone offline. Nenhum deles autentica sozinho a configuração de produção ou autoriza uma porta virtual.


**Guard adicional do periférico Epson:** o Odhen Periféricos instalado usa uma **DLL de fornecedor** no ramo Epson, enquanto o código usa `SpoolerLibrary` para outros modelos. A existência de filas Windows de Epson não prova que a DLL utiliza essas filas. Portanto o redirecionamento de um caminho `PONTE_HTTP_PRINT → EPSON_VENDOR_DLL` para `NUL` recebe `HOLD`, ainda que alguém alegue uma fila downstream; o modo `WINDOWS_WINSPOOL_API` tem de ser demonstrado na rota efetiva, e não inferido de uma fila presente. A primeira preferência permanece a supressão seletiva da **via antiga** na fonte, sem atingir registro de pedidos, documentos fiscais ou relatórios.

## Retificação de alcance do IDIMPPEDPROD — configuração de caixa compartilhada

A inspeção posterior de **133 PHP instalados** identificou `src/Service/Operator.php:314` como origem do `IDIMPPEDPROD` na sessão a partir da configuração **do caixa** e comprovou consumo desse mesmo parâmetro em caminhos de **mesa** (`Pedido.php:1293–1312`), **balcão** (`Controller/Payment.php:550–556`) e **reimpressão** (`GeneralFunctions.php:561–575`). Logo `IDIMPPEDPROD='N'` **na configuração compartilhada** pode cortar comandas válidas alheias ao delivery e **não é um atalho operacional permitido**. Um override estritamente restrito à invocação `DLV_IFO` permanece apenas hipótese, sem prova de callsite. Na PR, `CASH_REGISTER_CONFIG_CHANGE` ou ausência de override granular retorna `HOLD`; testes específicos **24/24 + 23/23 + 41/41 PASS** em Foxxy isolado. [Auditoria detalhada do escopo](AUDITORIA_ESCOPO_IDIMPPEDPROD_CAIXA_COMPARTILHADO_20261027.md). Esta retificação prevalece sobre qualquer leitura anterior que sugira simplesmente parametrizar `N` no caixa.

## Retificação: resposta `status: 202` no JSON e emissão secundária Odhen

A revisão estática de `odhen-perifericos/routes/imp.js:6–45` mostrou que `/print` responde com `res.json({status: 202, message: 'Impressao salva com sucesso'})` após `saveItemRequest`. O **202 é campo da resposta JSON**, não foi observada chamada `res.status(202)` nesse trecho; o **status HTTP efetivo não foi medido**. Em nenhum caso o valor comprova papel físico.

Em `src/IMP/index.js:90–125`, a ponte enfileira dados e admite `printerInfo.impBackup`. Em `index.js:162–220`, falha/timeout pode fazer a impressão antiga sair por destino **backup**. O censo de rota principal não prova cobertura do backup nem que a via seja única. Novo [relatório específico](AUDITORIA_ODHEN_HTTP202_FILA_BACKUP_20261027.md) descreve os gatilhos e a fronteira da evidência.

Os módulos offline `comandas_peripheral_bridge_ack_backup_v1_offline.cjs` e `comandas_legacy_virtual_cutover_review_v1_offline.cjs` exigem agora o inventário **de destino principal e reserva** antes de uma candidatura de transição via `PONTE_HTTP_PRINT`; backend desconhecido, reserva não observada e promoção do JSON 202 a prova de papel dão `HOLD`. Testes **17/17 + 47/47 PASS** no Foxxy isolado após correção explícita da diferença entre JSON e HTTP; nunca há efeito ou autorização para imprimir/desviar. O fluxo `DLV_IFO` de primeira via permanece **UNKNOWN**.

## Atualização de segurança: backlog antigo continua existindo após desligar a origem

A ponte Odhen pode salvar o job em fila interna antes de imprimi-lo e, conforme erro/timeout, enviá-lo ao backup. Portanto **suprimir apenas novas submissões antigas não remove jobs antigos já aceitos**. A futura passagem ao emissor único exige comprovar **o censo de jobs antigos pendentes** e a reconciliação de **tentativas ambíguas**, independentemente de o destino principal e o backup terem sido mapeados.

O módulo `comandas_peripheral_bridge_ack_backup_v1_offline.cjs` passou a retornar `HOLD: QUEUED_OR_AMBIGUOUS_OLD_JOBS_NOT_RECONCILED` se qualquer evidência de backlog/reconciliação estiver ausente. Este é um contrato de revisão **sem leitura de banco, fila, spooler ou log**: entradas declaradas em fixture não representam prova da loja. Os testes passaram **19/19** no módulo e **49/49** no contrato de transição em clone descartável Foxxy no commit `9bbc91340e1099136b1ae1301e2f873feb9b8b96`. O código não limpa fila, não considera `status:202` do JSON como papel e não autoriza alternância automática dos emissores.

## Prova posterior: `IDIMPAUTENTREG` é relatório pós-venda, não primeira via de produção

A inspeção de 133 PHP instalados mais os controladores de delivery do POS mobile identificou um ramo **separado** em `Venda.php:469–499`: depois de venda de delivery bem-sucedida e `TOTALVENDABRT>0`, `IMPRIMEDLV_AUTOMATICO` lê `CAIXA.IDIMPAUTENTREG`; somente `'S'` solicita `ImpressaoDelivery::imprimeDelivery`. Esse módulo produz literalmente **`Relatorio De Entrega`** e usa `BUSCA_IMPRESSORA_DELIVERY` (`CAIXA.NRSEQIMPRLOJA7` com fallback para `NRSEQIMPRLOJA3`), destino distinto da matriz de produtos de produção.

`src/Controller/Delivery.php:165–175` e duas telas mobile mostram **impressão manual do relatório**, independente do flag automático. Portanto, `IDIMPAUTENTREG=N` no caixa **não prova** inibição da primeira via de cozinha nem desativação do relatório manual, e o próprio flag é do caixa para deliveries, não um escopo `DLV_IFO` demonstrado. `Comanda::liberaComandaDelivery` apenas muda status `P/X` no trecho examinado, sem provar papel. O caminho da **primeira via de produção iFood segue UNKNOWN**.

Implementação: `tools/comandas_teknisa_delivery_report_boundary_v1_offline.cjs` + **21/21** regressões; contrato `comandas_legacy_virtual_cutover_review_v1_offline.cjs` agora exige censo separado de **relatório automático e manual**, com **55/55** testes de transição em Foxxy isolado. Nenhuma opção real foi lida/alterada. [Auditoria detalhada, linhas, fingerprints e limites](AUDITORIA_RAMOS_IMPRESSAO_RELATORIO_DELIVERY_VS_PRODUCAO_20261027.md). O objetivo continua supressão **por emissor/ramo específico** e preservação do fiscal, com PR DRAFT/HOLD.

## Descoberta comprovada: impressão do iFood tem **dois caminhos de software** no caixa

A inspeção passiva em 27/10/2026 encontrou o aplicativo **Impressora GP iFood 1.2.0** (`POST /print` local, porta padrão 4013; a porta estava em `LISTEN`) e o **Gestor de Pedidos 8.10.4**, cujo próprio módulo Electron recebe `printOrder` por IPC e chama `@ifood/thermal-printer`. Ambos têm biblioteca `@ifood/thermal-printer` 1.0.32, que usa a infraestrutura de impressoras Windows para `printDirect RAW` e `ThermalPrinter({interface:'printer:'+nome,driver:nodePrinter})`. O código do Gestor responde **`Successfully printed` antes de aguardar a função assíncrona**, portanto o ACK não comprova papel. Esse desenho é **diferente** da ponte Odhen Epson nativa e não prova que ambos os aplicativos estejam imprimindo no Itaim.

Novo gate de revisão `tools/comandas_ifood_installed_print_channels_v1_offline.cjs`: **`GP_HTTP_PRINT` e `GESTOR_IPC_PRINTORDER` têm de ser censados independentemente**, inclusive manual, impressora Windows real, fila compartilhada/fiscal e trabalhos antigos ambíguos. **Desligar GP não prova Gestor off**; nem desativar automático prova ausência de reimpressão manual. Um `jobId`, uma resposta HTTP e o IPC `printOrderReply` não são recibos físicos. **23/23 testes dedicados + 62/62 testes de transição PASS em checkout isolado**. Nenhuma mudança foi feita no caixa.

[Auditoria detalhada com versões, SHA-256, distinção de fontes e limites](AUDITORIA_IFOOD_DOIS_CANAIS_IMPRESSAO_INSTALADOS_20261027.md). A primeira via de produção na Teknisa **continua UNKNOWN**, não sendo atribuída ao aplicativo do Gestor sem prova. Nenhuma transição live autorizada.

## Fechamento da lacuna de identidade: pedido iFood → Retail → ForSale ≠ primeiro despacho

A documentação específica da Teknisa descreve o iFood como integração do Retail, com **pré-pedido de marketplace distinto de venda PDV**, e a geração de comanda ForSale como etapa de fluxo. As chamadas PHP `Venda.php → IDIMPAUTENTREG → ImpressaoDelivery` examinadas antes são **relatórios pós-venda**, e a impressão pelo Gestor/GP iFood é **outro emissor**, não um evento nativo de produção. A simples presença de `FosExp.exe` no host **não comprova que ele faça o primeiro disparo**.

Para não falsear a prova, o módulo offline `tools/comandas_native_first_dispatch_lineage_v1_offline.cjs` e o contrato de cutover distinguem esses estágios; um `preorder`, criação de ForSale, exportação, relatório ou ACK `Printed` não satisfaz o gate `native_first_print_trigger`. **26/26 casos próprios e 70/70 cenários de transição PASS** em cópia isolada. Continua **UNKNOWN** o ponto real de despacho `DLV_IFO`, e a PR não confere autoridade de imprimir ou desativar o emissor.

Relatório com fontes oficiais, pontos de prova e barreiras de segurança: [Auditoria da primeira via Retail/ForSale](AUDITORIA_PRIMEIRO_DESPACHO_MARKETPLACE_FORSALE_20261027.md).

## Alternativas em ordem de simplicidade

1. **Desativação da via antiga na fonte, se houver configuração específica**, mantendo a geração/leitura dos pedidos. Exige identificar exatamente a opção, seu escopo (comandas de produção vs caixa/relatório/fiscal), a configuração vigente e a capacidade de reverter. Não assumir que existe uma chave global segura na Teknisa.
2. **Destino Windows de descarte (porta local NUL)** para uma fila *comprovadamente exclusiva* da comanda antiga, apenas se a origem imprimir via spooler Windows e se o TATÁ já receber o pedido independentemente. A NUL é uma **pia de papel**, não motor de leitura. Não instalar/selecionar porta na loja neste PR.
3. **Monitor/driver de impressão virtual próprio**, se necessário no futuro, é opção de maior custo e risco (instalação de monitor/driver, permissões, estabilidade do spooler, formato ESC/POS ou outro). Não o criar agora: primeiro resolver o problema na origem ou com um recurso nativo do Windows. Não interceptar/proxyar tráfego TCP de Epson sem evidências e autorização.

**Convivência:** a impressão do Gestor iFood foi informada desligada em 25/10, porém isso não comprova o estado atual. Tratar iFood e Teknisa como **duas fontes de saída separadas**, cada uma com seu censo: quem inicia, qual host, driver/fila/porta/IP, se há outras vias simultâneas, papel gerado e função da via. Verificar que desativar cada fonte não afeta fiscalização, relatórios essenciais, impressoras de cozinha ou outros sistemas.

**Revisão da política de transição:** para a alternativa `UPSTREAM_PRINT_OFF`, o módulo da PR exige agora declarar o mecanismo exato. Se for `IDIMPPEDPROD_N`, o pré-voo nativo deve rejeitar modos `S/M/T`, escopo global, ausência de callsite `DLV_IFO` ou qualquer indício de perda fiscal/outras vendas. Uma opção diferente de desativação nativa só poderá ser revisada com prova separada de escopo. Nenhuma dessas declarações de laboratório vira autorização de alteração ou comprovação de efeito na loja. **18/18 + 23/23 + 38/38 testes locais PASS**; CI do commit exato permanece como gate próprio.

**Candidato de supressão na fonte:** o PHP `ImpressaoPedido.php` possui filtro de pedido de produção `IDIMPPEDPROD='N'`, que omite seus três grupos de destinos nos condicionais examinados. Isso ainda **não comprova** que seja configurável especificamente para `DLV_IFO`, nem que o evento de primeira via do delivery percorra esse método. Não alterar `IDIMPPEDPROD` real, nem cortar toda a produção da loja. O caminho mais simples poderá ser essa supressão nativa **se** o callsite granular for provado. Ver [provas e limites](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md).

## Prova já existente que não deve ser mal interpretada

A CAIXA_MOOCA expôs no Windows as filas Balcão Sushi 1/2, Delivery Sushi 1/2, Cozinha e Caixa. Na inspeção anterior, 1.086 jobs de Delivery Sushi 1 estavam **retidos como Printed** porque a fila usa `KeepPrintedJobs=true`; 204 deles foram submetidos durante as janelas de almoço relatadas. Essa é evidência de **envio à fila**, não comprovação de papel desperdiçado, 1.086 pendentes ou de origem causal exclusiva da Teknisa. O código PHP instalado possui laços de `impressoraProducao`, `impressoraProducao2` e `impressoraPuxa`; **não** foi demonstrado que esse é o evento exato da primeira via de pedidos iFood.

## Contrato de transição e recuperação

**Fase A — SHADOW:** produção física antiga continua **inalterada**, TATÁ lê/reconcilia **sem enviar papel**, e se compara a correção das novas vias e seus destinos; ainda não se promete economia de papel. Um teste que muda a rota antiga já **não é shadow**.

**Fase B — PREPARAÇÃO:** demonstrar com provas distintas: origem da primeira via, pedido/revisão do Reader, regras de praça e horários, sequência TATÁ persistida e relida, impressora/driver corretos, emissor único, todas as saídas ativas de Teknisa e iFood, e snapshot de reversão. A fonte iFood **não é gatilho de produção**. A inspeção de cada emissor precisa cobrir seu caminho de transporte, não só o nome da fila.

**Fase C — PILOTO AUTORIZADO:** só depois dos gates, escolher uma janela e um pedido real supervisionados, com parada e rollback sob controle humano. O TATÁ emite a comanda aprovada com a mesma sequência nas praças e a conferência independente. As vias antigas são desviadas/desabilitadas **no ponto realmente comprovado**, jamais por impedir o funcionamento físico de toda Epson. Não executar sem autorização específica e observação física de papel.

**Fase D — RECUPERAÇÃO:** se a nova emissão falhar e a antiga já tiver sido desativada, sinalizar imediatamente **incidente de comanda não entregue** e manter registro da tentativa. **Não alternar automaticamente de volta** para a antiga sem conciliar impressões anteriores, para evitar duas vias iguais. Aplicar procedimento humano de fallback e reversão com evidência.

**Gates absolutos:** NÃO fazer cutover enquanto a sequência TATÁ real não estiver vinculada, a classe de produto não for confiável, a seleção de praça não estiver comprovada, o primeiro evento da produção for incerto, a saída antiga puder escapar da rota tratada, ou não existir reversão testada. Nunca aceitar "Printed" da porta NUL como prova de saída física nem criar segundo pedido a partir de job virtual.

## Implementação efetiva nesta PR

- `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs`: módulo **puro** que modela duas origens (Teknisa/Gestor), tipos de transporte (fila Windows, direto na impressora, aplicativo, desconhecido), supressão a montante/rota NUL, exigências de prova e recuperação. Ele distingue `SHADOW_SAFE_REVIEW_ONLY`, `CUTOVER_CANDIDATE_NEEDS_EXTERNAL_ATTESTATION` e `HOLD`; nenhuma resposta libera operação.
- `tools/verificar_comandas_legacy_virtual_cutover_v1_offline.cjs`: testes adversariais: fonte faltando/duplicada, host errado, NUL ineficaz contra TCP direto, outra saída não mapeada, ausência de Reader/primeira via/sequence/fiscal guard/catálogo, retorno automático proibido e autodeclaração sem autoridade.
- O Windows `NUL` é admissível apenas como **candidato de destino sem papel** se há Reader independente e o restante da cadeia alegado e verificado **fora do modelo**. Não é autorização de instalar porta nem de imprimir pelo TATÁ.
- Teste integrado no workflow `deliveryos-thermal-shadow-gate.yml` para Linux/Windows. Atestação da CI só após execução no commit exato.

**Estado e limites:** a estrutura está em review/test; NÃO existe interceptação live, monitor virtual instalado, edição em iFood/Teknisa, desvio de porta, alteração de filas, impressão, sequence binding, SQL, fiscal ou deploy. PR OPEN/DRAFT/HOLD.

**Próxima apuração de maior valor:** inventário observável e de baixo risco das **duas saídas de impressão** (Teknisa e iFood Gestor), incluindo fonte, host e caminho de envio. Depois, provar como desligar **somente** a impressão antiga sem perder pedidos nem o fiscal. Uma decisão de rota sem essa prova vira papel perdido ou duplicado.
