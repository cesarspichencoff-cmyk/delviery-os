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

[Auditoria de transporte do PHP instalado](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md) fornece SHA-256 dos módulos lidos, evidência de cada ramo, limites e testes; **23/23 pré-voo + 33/33 contrato de cutover** passaram em clone offline. Nenhum deles autentica sozinho a configuração de produção ou autoriza uma porta virtual.


**Guard adicional do periférico Epson:** o Odhen Periféricos instalado usa uma **DLL de fornecedor** no ramo Epson, enquanto o código usa `SpoolerLibrary` para outros modelos. A existência de filas Windows de Epson não prova que a DLL utiliza essas filas. Portanto o redirecionamento de um caminho `PONTE_HTTP_PRINT → EPSON_VENDOR_DLL` para `NUL` recebe `HOLD`, ainda que alguém alegue uma fila downstream; o modo `WINDOWS_WINSPOOL_API` tem de ser demonstrado na rota efetiva, e não inferido de uma fila presente. A primeira preferência permanece a supressão seletiva da **via antiga** na fonte, sem atingir registro de pedidos, documentos fiscais ou relatórios.

## Alternativas em ordem de simplicidade

1. **Desativação da via antiga na fonte, se houver configuração específica**, mantendo a geração/leitura dos pedidos. Exige identificar exatamente a opção, seu escopo (comandas de produção vs caixa/relatório/fiscal), a configuração vigente e a capacidade de reverter. Não assumir que existe uma chave global segura na Teknisa.
2. **Destino Windows de descarte (porta local NUL)** para uma fila *comprovadamente exclusiva* da comanda antiga, apenas se a origem imprimir via spooler Windows e se o TATÁ já receber o pedido independentemente. A NUL é uma **pia de papel**, não motor de leitura. Não instalar/selecionar porta na loja neste PR.
3. **Monitor/driver de impressão virtual próprio**, se necessário no futuro, é opção de maior custo e risco (instalação de monitor/driver, permissões, estabilidade do spooler, formato ESC/POS ou outro). Não o criar agora: primeiro resolver o problema na origem ou com um recurso nativo do Windows. Não interceptar/proxyar tráfego TCP de Epson sem evidências e autorização.

**Convivência:** a impressão do Gestor iFood foi informada desligada em 25/10, porém isso não comprova o estado atual. Tratar iFood e Teknisa como **duas fontes de saída separadas**, cada uma com seu censo: quem inicia, qual host, driver/fila/porta/IP, se há outras vias simultâneas, papel gerado e função da via. Verificar que desativar cada fonte não afeta fiscalização, relatórios essenciais, impressoras de cozinha ou outros sistemas.

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
