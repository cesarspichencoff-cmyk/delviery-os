# TATÁ Comandas — auditoria integral, funcionamento explicado e sequência TATÁ

**Data da apuração:** 27/10/2026. **Fonte de projeto:** `cesarspichencoff-cmyk/delviery-os`, PR #127, branch `audit/comandas-shift-contract-20261026`. **Situação:** OPEN/DRAFT/HOLD, sem integração operacional da candidata, sem impressão, sem novas gravações de sequência. Este documento descreve o projeto **TATÁ Comandas**, não avalia separadamente todo o GPS, motoboys ou copiloto do Delivery OS.

## Errata operacional posterior: destino físico de sushi varia conforme janela comprovada

A conclusão anterior de que nenhum par Balcão/Delivery deveria ser selecionado por serviço **foi retificada** após a orientação reiterada pela gestão e auditoria passiva da CAIXA_MOOCA. O dado humano válido é: no almoço as impressoras **Delivery Sushi 1 e 2 ficam desligadas**; os produtos de combinado e enrolados vão às respectivas praças Balcão, enquanto no jantar os destinos **Delivery Sushi 1 e 2** recebem as famílias indicadas; **enrolados quentes continuam no Balcão Sushi 2**, e combinado dupla tem exceção a preservar.

Portanto, **não imprimir os dois membros de uma rota dupla** e também **não bloquear indefinidamente os dois como solução operacional final**. É preciso selecionar somente a praça em operação para a janela e produto, com a hora original da comanda e exceções comprovadas, sem aprovação diária manual e sem escolher pelo relógio atual do Windows. Evidência de janela não é prova de que a Epson esteja energizada ou apta a imprimir no segundo exato: conferir dados de serviço/estação com a operação.

Na mesma inspeção, 1.086 trabalhos de `DELIVERY SUSHI 1` estavam **retidos com estado Printed**, porque o Windows tem `KeepPrintedJobs=true`; **204 foram submetidos à fila no período de almoço relatado**. Estes não são 204 pedidos distintos ou papéis desperdiçados provados, e tampouco são uma fila de 1.086 trabalhos pendentes. As outras filas têm retenção desativada, impedindo comparações ingênuas de contagem. Fonte detalhada: [auditoria revisada](AUDITORIA_REVALIDADA_IMPRESSORAS_E_JANELAS_20261027.md).

A PR #127 ainda não contém seletor de janela/categoria homologado nem altera a configuração de impressoras; o guard conservador fica ativo por segurança. O objetivo passa a ser substituir o bloqueio genérico por roteamento seletivo **sem envio à fila inativa**, com provas em código e aceitação posterior, e nunca permitir impressão em todas. Esta errata prevalece sobre trechos históricos abaixo que concluíam não haver utilidade operacional da alternância por janela.

## Atualização: proteção do atendimento presencial na substituição das comandas antigas

Uma inspeção posterior de 133 PHP instalados demonstrou que `IDIMPPEDPROD` é carregado **da configuração do caixa** para a sessão da Teknisa e utilizado também em **mesa, balcão e reimpressão**. Logo, usar `IDIMPPEDPROD=N` globalmente para neutralizar as vias antigas de delivery colocaria outros atendimentos em risco. A PR passou a **bloquear explicitamente** essa proposta, mesmo quando a entrada do avaliador declara que outros pedidos estão preservados. Apenas um eventual **override por chamada exclusivamente DLV_IFO**, ainda não demonstrado, pode continuar como hipótese técnica, jamais como autorização para alteração. A ponte Odhen Periféricos utiliza uma DLL Epson em certos caminhos, de modo que filas Windows não provam interceptação universal por `NUL`.

Relatos, caminhos PHP/linhas, testes e limites: [escopo compartilhado do caixa](AUDITORIA_ESCOPO_IDIMPPEDPROD_CAIXA_COMPARTILHADO_20261027.md) e [transporte nativo](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md). Tudo permanece **OFFLINE/DRAFT/HOLD** sem mudança física.

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

## 1. Leitura rápida: produto que se pretende entregar

O projeto procura substituir uma rotina de comandas propensa a inconsistências por um conjunto de **três apresentações coordenadas do mesmo pedido**, de forma legível para a equipe, sem duplicar impressão nem criar um segundo cadastro manual:

1. **Produção 1:** itens, quantidades e observações obtidos exclusivamente da **Teknisa nativa**, enviados à praça/destino autorizado para essa preparação;
2. **Produção 2:** mesma origem nativa, só com os produtos que competem à segunda praça/destino. Não é cópia necessariamente idêntica da Produção 1;
3. **Conferência do caixa:** usa a composição da Teknisa e, **somente nesta via**, cruza a identidade/presença independente do pedido no iFood. Caixa, sacola e kit devem vir de um motor de regras comprovado, sem chute.

**Nuance:** dois layouts/vias de produção foram solicitados, mas o planejador técnico atual agrupa intenções **por impressora física efetivamente roteada**. Um pedido com destinos distintos pode gerar zero, uma ou várias intenções no planner; o sistema não demonstrou ainda que o número material de tickets corresponda exatamente a duas vias para cada pedido real. Essa equivalência precisa ser resolvida no aceite de praças; não duplicar saídas para forçar uma contagem.

Todos carregam a mesma **sequência TATÁ** quando ela estiver atribuída de forma real e persistente. O fiscal/NFC-e continua fora das três vias.

## 2. Caminho do pedido — aquilo que é observado e aquilo que ainda é desconhecido

**Diagrama funcional desejado:**

`Pedido iFood → integração existente → venda/comanda Teknisa → Reader V2 (pedido + itens + observações + revisão) → prova de integridade da fonte → número TATÁ persistido → regras aprovadas → [duas projeções de produção] + [conferência iFood×Teknisa] → emissor exclusivo → impressoras`.

A posição do **evento real de PRIMEIRA VIA** nessa cadeia **não está comprovada**: o código instalado mostra `Account::order → commit → imprimePedidoMesaComanda` para **mesa**, `GeneralFunctions::reprintPedido` para **reimpressão**, e `Venda::liberaComandaDelivery → [opcional] imprimeDelivery` para **relatório de entrega**. Esses caminhos não provam qual callback emite a primeira via de produção dos pedidos iFood. Busca literal `DLV_IFO` nos 133 PHP examinados encontrou-o uma vez no cabeçalho do relatório, não na integração de entrada. Ver [topologia](TOPOLOGIA_EVENTO_IMPRESSAO_ORIGEM_NATIVA_20261026.md).

**Chave forte da comanda nativa:** `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`. O `NRCOMANDAEXT` é o **código curto iFood** em pedido `DLV_IFO` observado (por exemplo, `9627` em referência histórica), não uma chave UUID completa. Usar só horário ou os últimos dígitos para juntar registros é proibido.

A exportação iFood de 25/10 tinha **314 pedidos** e **não trazia itens nem observações**. O confronto com a Teknisa obteve **311 candidatos únicos** pela chave curta e recorte, com **3 só iFood** e **6 só Teknisa**. Isso prova candidatos de presença independente, **não** conteúdo igual, UUID→SQL autenticado ou causa das divergências. iFood identifica o estabelecimento `53069`, Teknisa a unidade `0001/01`; são **namespaces distintos**. A conferência exige um mapa explícito candidato entre os dois, que também não equivale a atestação independente.

## 3. Horários e operação

**Horário do delivery informado pela gestão:**

| Dia | Almoço | Jantar |
|---|---|---|
| Segunda a sexta | 11h–15h | 18h–23h |
| Sábado e domingo | 11h–16h30 | 18h–23h |

São horários de funcionamento, **não uma ordem para abrir ou fechar impressoras automaticamente**. O horário original do pedido já consta da comanda. Não instalar aprovador diário `LUNCH/DINNER`, não deduzir turno pelo relógio do computador e não criar uma tabela paralela de seleção de impressoras. Para agendados, pedidos fora das faixas, datas trocadas e exceções de feriado, o **tratamento automático não foi comprovado**: não inventar retenção, impressão ou descarte.

A data usada para sequência TATÁ é o **dia do calendário local da loja**, fornecido pela origem; não resetar por almoço/jantar nem por saída do operador. `23:59` e `00:00` representam dias locais diferentes, desde que a data da origem tenha sido validada.

## 4. O que aparece nas vias e de onde cada informação vem

| Informação | Produção | Conferência | Critério |
|---|---|---|---|
| Código iFood curto | Campo `NRCOMANDAEXT` da Teknisa | Mesma origem + confronto independente iFood | Nunca inventar/usar UUID inferido |
| Número interno Teknisa | `NRCOMANDA` | `NRCOMANDA` | Mesma chave/revisão |
| Número TATÁ | Mesmo número nas praças | Mesmo número | **Somente após binding persistido e rechecado** |
| Item/quantidade | Composição nativa exata | Composição nativa exata | Nome completo, quantidade positiva inteira, sem somas ou trocas silenciosas |
| Observação de item | Imediatamente abaixo do item | Preservada no escopo correto | `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN` quando ligadas por item/revisão |
| Observação geral | **Não copiar automaticamente** texto financeiro, fiscal ou misto | Exige canal/revisão/classificação apropriados | `DSOBSCOMANDA` não está classificada integralmente |
| Caixa, sacola, kit | Somente fatos relevantes e comprovados | Motor canônico aprovado da Academia | `A DEFINIR` só se motor realmente executado e inconclusivo; `NOT_EVALUATED` se não executado |
| Nota fiscal, pagamento, endereço e cliente | Não entram | Não entram nas vias de comanda | Fiscal independente, privacidade |

A hierarquia visual aprovada privilegia **praça, sequência TATÁ, caixa de montagem, quantidade+item e observação**, com letras legíveis, contraste e nenhum dado de cliente. O renderizador ESC/POS V4.6 produz **bytes apenas em memória em ambiente offline**. Perfil Epson TM-T20/80 mm e Fonte B/64 colunas permanecem não calibrados na impressora real. Sem teste em papel não há aceite óptico.

## 5. Motor de regras de produto e montagem

O Reader preserva o **produto comprado** e suas observações; a Academia decide, quando há versão autenticada e fatos suficientes, regras de **caixa, sacola, kit**, montagem e possíveis dependências de preparo. Misturar classificação derivada do nome, catálogo histórico e decisão real pode mandar ingredientes à praça errada.

Prova histórica: cache local com **554 identidades**, matriz de destino para **463 códigos**, 14 códigos sob `CLASSIFICATION_UNKNOWN` analisados: **14/14** identidade e nome coerentes com cache histórica, **0/14** alias aplicável, **13/14** com alguma rota histórica; Cookie Pistache `8.20.11.002.00` **sem rota nessa matriz**. Nada disso autoriza promover classificação para a loja atual. Casos Kids, Tataki, Carpaccio, Missoshiro exigem a regra/motor correto com identidade e fonte comprovadas.

A [PR #50 da Academia](https://github.com/cesarspichencoff-cmyk/tata-academia/pull/50) continua aberta e em rascunho no HEAD `030b44dabd95c836b38275016512488a98784245`; não assumir que o motor candidato foi publicado ou que seus resultados podem substituir o pin vigente. Não atribuir `A DEFINIR` a produtos, quantidades, ID iFood ou sequência TATÁ.

## 6. Praças, rotas e a correção de turno já implementada

O mapa histórico de 30/09 identifica entre outros: `00009` BALCÃO SUSHI 1, `00003` DELIVERY SUSHI 1, `00006` BALCÃO SUSHI 2, `00004` DELIVERY SUSHI 2; há ainda cozinha, caixa e outras praças.

Documento operacional antigo descrevia esses códigos como **alternativas almoço/jantar**, mas a inspeção posterior de origem física **não confirmou essa equivalência para a seleção automática**. O planejador antigo ainda aplicava a suposição, criando risco de impressão em local errado e de novo fingerprint da mesma produção após mudar o rótulo de turno.

A PR #127 agora **bloqueia ambos os destinos de um par ambíguo para aquele item**, independentemente de `LUNCH`, `DINNER` ou nulo; rotas únicas continuam representáveis e destinos independentes permanecem como diagnóstico. Em 463 produtos históricos, **106** têm ao menos um par desses códigos; **117** têm duas rotas configuradas por quaisquer motivos — as contagens **não são intercambiáveis**. O `intent_fingerprint` agora exclui metadados não causais de turno, evitando tratar como impressão nova o mesmo pedido/conteúdo/destino porque se alterou apenas o rótulo. O teste de tentativa ambígua anterior confirma bloqueio de reenvio após mudança de turno.

Essas mudanças são **código candidato/testes**, não homologação de portas, filas, drivers, dispositivo e papel da loja. Ver [correção de roteamento](CORRECAO_ROTEAMENTO_PRODUCAO_SEM_TURNO_20261027.md).

## 7. Estados reais — por que `P`, `X` e `A` não podem disparar papel

Recorte passivo de **650 revisões** de 25–26/10, não 650 pedidos: 327 chaves compostas. Cabeçalhos: `3=263`, `P=289`, `X=94`, `4=4`; `A=0`. Entre 1.901 aparições de itens: `4=1876`, `6=17`, `3=8`, `A=0`. Transições observadas `3→P=190`, `3→X=66`, `X→P=61`, `P→4=4`.

O código instalado indica que:
- `A` pode representar pedido **agendado**, não via pronta;
- `3` é um estado de fluxo nativo, não confirmação de cozinha;
- `P` pode ser atribuído **antes de tentativa opcional** de relatório, portanto não é recibo de impressão;
- `X` ocorre em alguns caminhos de retirada/conclusão automática, não deve ser confundido automaticamente com cancelamento;
- cabeçalho `4` é cancelamento no SQL examinado; item `4` é **um outro campo** e não significa a mesma coisa; item `6` representa cancelamento no caminho observado.

O Reader V2 de revisão da PR verifica `3/P/X` com item `4` para **autoconsistência de dados**, sem dar autoridade a nenhum estado para imprimir. Não usar transição `X→P` como prova de reimpressão. Um evento verdadeiro de primeira via, revisão, cancelamento ou reimpressão precisa ser atestado separadamente por seu emissor.

## 8. Bloqueios instalados versus evidência de laboratório

Inspeção anterior: serviço `TataComandaReader` estava `Running`; havia **2.047 decisões registradas como bloqueadas, 0 ready**. Amostra adicional de 500 decisões mais recentes tinha dois bloqueios herdados de serviço/turno em todas. Agrupando por chave e mantendo última revisão dentro da amostra: **250 chaves**, **56** apenas com família de turno/serviço e **194** também com outros motivos; destes, famílias observadas: sacolas **141**, kits **107**, classificação **67**, rota ausente **1**. As famílias se sobrepõem; não são métricas universais, e os períodos/amostras diferem das 650 revisões de eventos.

**Explicação:** serviço rodando não significa comanda pronta; consertar a trava de turno, sozinho, não resolve as outras 194. Motor inconclusivo, rota não homologada, falta de sequência e falta de evento continuam bloqueios independentes. Dados da amostra não autorizam despejar todas as vias em papel.

## 9. Sequência TATÁ — contrato, cálculo e estado real

**Regra aprovada:** três dígitos de `001` a `999` por **loja + dia do calendário local**. No dia seguinte a mesma loja recomeça em `001`; outra loja possui numeração independente. Mesmo pedido, nova observação da mesma comanda ou reimpressão **reutiliza o número original**, nunca consome outro. Na mesma loja/dia, o milésimo pedido **bloqueia**; não volta a `001`.

O planejamento `src/production/tataSequence.ts` é puro: `planDailyStoreTataSequence` calcula a próxima candidata pelos bindings existentes daquele escopo. O script de binding atômico `tools/tata_sequence_atomic_bind_v1.ps1` já dispõe de **DRY_RUN**, checagem de SHA, lock, replace atômico e releitura, com provas históricas de commit/replay **somente em arquivo temporário**. Não foi executado nesta apuração para gravar número real.

**Evidência fresca na `CAIXA_MOOCA` em 27/10:** `C:\ProgramData\TataComandaReader\state\tata-sequence-state.json` continua schema V1, `policy={width:3,min:1,max:999}`, `bindings=0`, `next_value=1`, SHA-256 `11004FBB4AECA6D9E37607D82E30D5ADC28D2C8835DE3DEC3FAACC0B4453C329`, modificado em **05/10/2026**. `001` está **disponível como candidato matemático**, não atribuído a qualquer pedido.

**Risco de identidade descoberto:** o `binding` V1 contém `scope_id`, `teknisa_order_id=NRCOMANDA` e `tata_sequence`. Não armazena `NRVENDAREST` nem o **snapshot forte** de quatro partes. Portanto, mesmo um número encontrado num estado fornecido não prova, por si só, que pertence à **mesma venda e revisão completa** observada agora. É necessária uma testemunha independente dessa ligação antes de usar o número em papel.

**Nova proteção offline desta auditoria:** `tools/comandas_sequence_v2_reconciliation_v1_offline.cjs`, testada em `tools/verificar_comandas_sequence_v2_reconciliation_v1_offline.cjs`, aceita somente um Reader V2 autoconsistente, examina **todos** os bindings sintéticos do estado recebido e bloqueia:
- colisão de número no mesmo dia/loja;
- dois números para o mesmo pedido, até linhas duplicadas idênticas;
- formato diferente de `DDD`, `000`, data impossível, escopo ilegível, política alterada;
- pedido/item cancelado, snapshot inválido ou quantidade/adulteração de origem;
- esgotamento depois de `999`;
- falsa promoção por `state.persisted=true`, `authorize_commit=true` ou outra autodeclaração.

Mesmo no caso positivo a saída é **`CANDIDATE_ONLY_NOT_PERSISTED`** ou **`EXISTING_BINDING_IN_SUPPLIED_STATE_NOT_ATTESTED`**. Em ambos: `number_for_operational_ticket=null`, `sequence_persisted_proven=false`, `strong_order_binding_proven=false`, `authorizes_sequence_commit=false`, `authorizes_first_print=false`. O campo `hypothetical_next_value` é **simulação declarada**, jamais número para a comanda.

**Prova:** 28/28 regressões em Foxxy, após corrigir uma fixture inicialmente incoerente; build TypeScript no checkout isolado. CI Linux e Windows foram adicionadas ao workflow e exigem conclusão no HEAD exato. **Sem binding em produção.**

## 10. Antiduplicidade, falhas e fronteira da impressão

Para uma emissão futura deverão existir:
- uma única identidade de pedido + revisão + via + destino;
- um único emissor autorizado por destino; convivência com Teknisa e estado do Gestor iFood comprovada **no dia**;
- `intent_fingerprint` estável, registro de tentativa, trava contra colisão, reinício e replay;
- classificação separada: **planejada ≠ submetida ≠ observada pelo spooler ≠ papel físico confirmado**;
- tentativa com efeito desconhecido exige **reconciliação**, jamais retry automático;
- reimpressão é um **ato distinto e explicitamente observado**, mantendo mesma TATÁ.

PrintService/Event 307 e testemunhas digitais anteriores fornecem contratos **offline** de reconciliação; evento de spooler não prova papel. Não instalar coletor de fila com autoridade de impressão sob rótulo "somente leitura". A evidência física final requer uma janela, impressoras corretas, inspeção óptica, ausência de segunda emissão e aceite humano explícito.

O Gestor iFood estava **com impressão de comandas desligada em 25/10**, conforme gestão, e não precisa ser ligado para que se compare a presença de pedidos no caixa. Esse estado histórico não comprova o estado de todos os dias posteriores; deve ser verificado antes de qualquer piloto físico.

## 11. Resultado adversarial por área

| Área | Conclusão que as fontes sustentam | Falta material |
|---|---|---|
| Escopo 3 vias | Regra humana e contrato/testes implementados offline | Vincular ao circuito real sem efeitos; quantidade real de impressoras/praças |
| Leitura Teknisa | Reader instalado, eventos e pares V2 presentes; 37 testes de integridade | Prova ponta a ponta de todas as revisões e origem atestada |
| Conferência iFood | 311 candidatos independentes por ID curto/loja/dia na exportação de 25/10 | Fonte atual autenticada, vínculo UUID/loja e conteúdo externo quando realmente disponível |
| Estados/cancelamentos | Semântica do PHP examinada e regras conservadoras | Evento inequívoco de primeira via/revisão/cancelamento |
| Turno/horário | Horário humano conhecido; seleção por turno removida do planejador candidato | Destino físico atual comprovado sem heurística de turno |
| Classificação/embalagem | Fontes/motor e regras de `A DEFINIR` mapeados | Aprovação/pin do motor, 14 casos e demais itens da loja |
| Sequência TATÁ | Algoritmo, estado real 0 bindings, script atômico histórico e 28 testes novos | Binding forte, autorizado, persistido, reread independente |
| ESC/POS visual | Prévia virtual; protótipos e testes offline | Calibração TM-T20/driver/fila e três papéis reais legíveis |
| Idempotência | Fingerprint estabilizado contra troca de turno; simulações/crash | Prova de tentativa/efeito, concorrência na loja e emissor único |
| Fiscal | Fluxo mantido separado | Não se propõe mudança fiscal |
| Liberação | PR #127 DRAFT/HOLD | CI HEAD final, deploy autorizado, prova real e aceite humano |

## 12. Caminho mínimo para sair de HOLD

1. **Fechar CI da candidata no commit exato** e corrigir regressões sem retomar uma lógica rejeitada.
2. **Fechar contrato forte da sequência**: ligar `scope+NRCOMANDA` do binder ao `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA` da revisão, sem autoatestar.
3. **Confirmar catálogo e roteamento da loja**, especialmente os 106 pares de códigos históricos suspeitos, os 14 casos sem classificação e o destino correto da conferência. Não pedir revisão de cada comanda manualmente se uma prova de configuração atual resolve a família.
4. **Demonstrar o evento verdadeiro da primeira via do pedido iFood** no emissor existente ou na ponte autorizada; separar de `P/X`, cobrança, relatório e reimpressão.
5. **Ensaiar atomicidade/releitura da sequência** no ambiente isolado para casos de concorrência, crash, troca de dia, mesmo pedido e recuperação. Não gravar `001` no caixa como teste informal.
6. Com todos os gates documentados, **pedir autorização humana específica**, com identidade da máquina, janela, pedido real de teste, destino de cada via, mudanças exatas, STOP e rollback.
7. **Piloto com prova em papel e aceite da equipe**, sem duplicate e sem alterar fiscal. Somente então reavaliar implantação.

## 13. Vocabulário de prova e honestidade

- **FACT/OBSERVED:** dados realmente vistos na origem com escopo definido.
- **CANDIDATE/INFERENCE:** correspondência plausível, não vínculo atestado.
- **SIMULATION:** número, via ou fluxo produzido apenas em memória/fixture.
- **UNKNOWN/HOLD:** ausência de prova material; nunca completar por suposição.
- **CODE_READY/TEST_PASS:** código/contrato validado no escopo dos testes.
- **DEPLOYED:** versão exata instalada e verificada no dispositivo correto.
- **WORLD_PROVEN:** emissão/reconciliação e papel observados no mundo real.
- **HUMAN_ACCEPTED:** operação aceita pela equipe e pela autoridade de gestão.

**Veredito:** houve evolução material comprovada em código e testes. A **sequência TATÁ ainda não foi ligada a nenhum pedido real**, o caminho real da primeira impressão segue não atestado e nenhuma via física foi liberada. O projeto **não está 10/10 operacional**, embora sua fronteira de segurança esteja mais explícita e várias regressões históricas tenham sido eliminadas.

### Fontes principais desta auditoria

- [Escopo, origem, dados históricos e decisões](CONVERGENCIA_VERTICE22_REQUISITOS_PROVAS_20261026.md)
- [Revisões de estados e limites da impressão](AMOSTRA_REAL_650_REVISOES_ESTADOS_E_EVENTO_PRODUCAO_20261026.md)
- [Topologia do código PHP](TOPOLOGIA_EVENTO_IMPRESSAO_ORIGEM_NATIVA_20261026.md)
- [Protocolo de piloto e autorização](PILOTO_PEDIDO_REAL_CRITERIOS_ACEITE_20261026.md)
- [Classificação local e bloqueios](ORIGEM_CLASSIFICACAO_CAIXA_MOOCA_READONLY_20261026.md)
- [Correção das impressoras e fingerprint](CORRECAO_ROTEAMENTO_PRODUCAO_SEM_TURNO_20261027.md)
- `src/production/tataSequence.ts`, `tools/tata_sequence_atomic_bind_v1.ps1`, `tools/comandas_sequence_v2_reconciliation_v1_offline.cjs`.
