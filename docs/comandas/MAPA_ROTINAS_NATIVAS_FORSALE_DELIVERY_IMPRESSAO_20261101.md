# TATÁ Comandas — mapa das rotinas nativas de delivery e impressão

**Data:** 01/11/2026. **Escopo:** Itaim, dispositivo conectado `CAIXA_MOOCA`, fontes estáticas instaladas em `C:\Program Files\Teknisa Web\Bin\Client`. **Status:** observação read-only de símbolos PE; `FIRST_NATIVE_DISPATCH=UNKNOWN`; PR #127 em Draft/HOLD.

## Avanço que muda o alvo da investigação

A enumeração estritamente passiva da **tabela de exports de funções compiladas**, verificada contra a seção executável `CODE`, encontrou rotinas específicas de produção, entrega e impressão não fiscal, além das importações `winspool.drv` já atestadas. São identificadores presentes em binários concretos, **não apenas literais de interface**. Nenhum módulo foi executado, carregado, modificado, disassemblado ou instrumentado; nenhum pedido, credencial, dado fiscal ou cliente foi acessado.

| Arquivo instalado | SHA-256 e data local do arquivo | Funções/classes efetivamente exportadas no `CODE` | Conclusão limitada |
|---|---|---|---|
| `Pkg_Dlv00000.bpl` | `C29B66C0265B3876306FB6526A419615C66B6B5BEBD87BEC6187E5BFDDEDD8BD` · 09/01/2019 | `Cli_dlv00999.TdtmImpressao.ImpPedido_Producao` (`RVA 0xD79DC`), `ImpPedido_Entrega` (`0xD6828`), `Cli_dlv00200.TfrmProducao.btnImprimirClick` (`0xD9008`) | Rotinas distintas de produção, entrega e botão manual existem no módulo; arquivo antigo **não comprova execução atual**. |
| `PKG_DLV00100.bpl` | `40A1EFE58FE1916E39AE040CB746B74714F414142FE762D7272F01FBC32F968E` · 24/08/2026 | `Cli_dlv00100.TfrmVisualizacao.ImpPedido_Entrega`, `ImpControlEntrega`, `ImpPedidoTaaWeb`, `PreencheImprimePedido` | Módulo mais recente contém rotinas de visualização/entrega e marcadores de texto `DLV_IFO` e `iFood`; não prova primeira produção. |
| `PKG_DLV00300.bpl` | `CEA48CC343171D9673718AED6F8892FF4A56A7E387EFC8B2B0BE77952EF85F5C` · 24/08/2026 | `Cli_dlv00300.TfrmPedido.Vd_GravaPedidos` | Confirma uma rotina de gravação de pedido, não emissão de produção. |
| `PKG_IMP00000.bpl` | `5D2B1B672867FB78B71B1A4BAA185E4754C57ED4A253FEF8C5C7CFFA68646D49` · 24/08/2026 | `Cli_imp00000.DisparaImpressaoNaoFiscal` (`0x74D8`), `TImpNaoFiscalDlvThread` (construtor `0x7DAC`), `TrdmImpressoras.SendSpool` (`0x66474`), `cdsImprimePedidoDlvAfterOpen` (`0x62918`) | O módulo tem rotinas executáveis de impressão, delivery e envio à fila; também importa as APIs WinSpool `OpenPrinterA`, `StartDocPrinterA`, `WritePrinter`, `EndDocPrinter`, `GetPrinterA`, `ClosePrinter`. |
| `PKG_IMP00001.bpl` | `9E1D068021392656A014E5692C59840FB147845789BA11A2B482F2C6E2111E75` · 29/12/2025 | `Cli_imp00001.DisparaImpPedExpKDS` e export alias `DisparaImpPedExpKDS` (ambos em seção `CODE` executável) | Possível caminho distinto de despacho relacionado a KDS/expedição; não contém literais exatos `DLV_IFO` ou `iFood` nas formas ASCII/UTF-16 inspecionadas. |
| `FosSinc.exe` | `EED7C1C11A6DDC5A8E9A9D327DAC91744AE6534478CD5505ADAE975D438BA401` · 24/08/2026 | Aplicativo PE sem diretório de exportação | Presença de literais `DLV_IFO` e `iFood` na seção `CODE`; candidato ao lado de integração, sem importação direta WinSpool na tabela inspecionada. |
| `FosImp.exe` | `ACB10F7B0F6BC5531FA3A36C1036F9A49973426E2F95930F6E2BE5166910570B` · 22/06/2026 | Aplicativo PE sem diretório de exportação | Importa as seis APIs WinSpool citadas; foi visto em execução, mas não foi vinculado a uma revisão `DLV_IFO`. |

## Distinções e hipóteses que não podem virar fatos

- **Produção ≠ entrega ≠ reimpressão manual.** `ImpPedido_Producao` é um alvo concreto de análise; `ImpPedido_Entrega` não deve ser promovido ao mesmo evento. `btnImprimirClick` indica um evento de UI, não comprova a via automática.
- **Arquivo instalado ≠ arquivo carregado ≠ função chamada.** Especialmente importante para `Pkg_Dlv00000.bpl` com carimbo de modificação de 2019. `PKG_IMP00000.bpl` de 2026 também não prova que a função exportada foi usada em um pedido iFood de produção.
- **Nomes de símbolos ≠ fluxo causal.** `FosSinc → PKG_IMP → FosImp` segue hipótese. `DisparaImpPedExpKDS` sugere outro caminho possível, mas não prova que uma via de produção use KDS. DLL/exports podem ser carregados dinamicamente e não há dependência PE direta comprovada entre os componentes.
- **Evento Windows 307 ≠ processo de origem.** No subconjunto observado, o emissor do log foi `spoolsv`; o evento tem informação de fila/job, não a chave forte da revisão nativa nem a identidade do aplicativo requisitante.
- **Leitura de módulos vivos negada.** A solicitação anterior de `Get-Process.Modules` para `FosImp` recebeu acesso negado. Não contornar ACL, elevar privilégio, usar fonte equivalente protegida nem tentar instrumentar a aplicação.

## Próximo passo com melhor relação valor/risco

1. No projeto, concentrar a triagem **na existência de caminho automático** que possa usar `TdtmImpressao.ImpPedido_Producao` ou `TImpNaoFiscalDlvThread`; separar explicitamente dos eventos UI de impressão manual, relatório de entrega e expedição/KDS.
2. Quando uma sessão Retail legitimamente autorizada estiver acessível, conferir `IFO → filial 0001 → loja 01 → caixa` (ou vendedor padrão associado), **somente leitura e sem aba Token**. Não confundir o nome do equipamento com identidade de caixa lógico.
3. Usar fonte mínima e independente para vincular **uma ocorrência natural** de `DLV_IFO`, sua chave completa e revisão, à **primeira tentativa de produção**, destino e backup. Acesso a eventos com payload, instrumentação, monitor de API, mudanças de serviço ou impressão física exigem autorização separada; sem prova, manter `HOLD`.
4. Em paralelo, preservar a prévia digital offline como entrega sem efeito; sequência TATÁ V2 persistente, exclusividade, corte da via legada e piloto em papel continuam fora do escopo.

**Efeito desta inspeção: zero em produção.** Nenhum contato com fornecedor, nenhuma alteração de parâmetros, serviço, impressoras, banco, processos, fiscal, sequência, deploy ou merge. **Rota confirmada apenas até `STATIC_COMPILED_EXPORTS_IDENTIFIED`.**

## Teste adversarial de referências cruzadas e origem da via (01/11/2026)

**Método:** leitura local de bytes somente no `CAIXA_MOOCA`, interpretando a estrutura PE32 (`ImageBase`, RVA, seções `CODE`, `.idata`, exports) e detectando padrões estáticos `PUSH imm32` / `MOV reg, imm32` que contêm endereços de literais exatos `DLV_IFO`/`iFood`. Não houve execução ou instrumentação de processo. Trata-se de **heurística de instrução**, não disassembly validada por início de instrução ou grafo de chamadas completo; coincidências e referências a mensagens/cabeçalhos são possíveis.

| Binário | Referências em CODE identificadas por padrão | Região entre exports (limite superior não é fim comprovado da função) | Interpretação segura |
|---|---|---|---|
| `PKG_IMP00000.bpl` | `DLV_IFO`: `0xF4AF`; `iFood`: `0xF4BE` | entre `TrdmImpressoras.Cabecalho_Pedido_Brasil` `0xEF60` e `Cabecalho_Pedido_Colombia` `0x10060` | **Pista de formatação/cabeçalho**, não demonstra disparador de primeira produção |
| `PKG_DLV00100.bpl` | `DLV_IFO`: `0x2C524`, `0x2CE37`, `0x2FC89`; `iFood`: `0x2CE46` | duas primeiras e `iFood` entre `TfrmVisualizacao.ImpPedido_Entrega` `0x2BD34` e `cdsPedidosORIGEMGetText` `0x2FC50`; terceira depois de `cdsPedidosORIGEMGetText` | **Pista de via de entrega e exibição de origem**, não atestado de produção |
| `FosSinc.exe` | `DLV_IFO`: `0x12A42`, `0x134BB`, `0x13A68` e uma segunda referência a um desses endereços; `iFood`: `0x13A77`, `0x195BE` | executável não possui export directory para relacionar RVAs a nome de função | pista de processamento de origem iFood, sem atribuição à primeira via |

**Correção de rumo:** a presença de `DLV_IFO` no `PKG_IMP00000` e das APIs `StartDocPrinterA`/`WritePrinter` no mesmo binário **não une esses pontos em uma função**, muito menos prova um caminho `IFO→primeiro despacho`. O agrupamento estático aponta prioritariamente para **cabeçalho impresso**. Os textos `iFood` do `PKG_DLV00100` caem em região associada à **impressão de entrega**, não à função `ImpPedido_Producao` do módulo legado. A hipótese inicial de ligação causal fica **enfraquecida**, não reforçada, por essa observação. A rota equivalente de repetir busca por literais foi encerrada para não confundir metadado de origem com disparo.

**Revisão do estado do Windows:** o provedor de eventos `Microsoft-Windows-PrintService/Operational` atribui os 58 eventos 307 de uma amostra de 30 minutos ao processo `spoolsv`. É a identidade do emissor do evento, não a identidade do cliente do spooler. Uma pesquisa somente de **nomes de provedores** do Windows não encontrou fonte dedicada ForSale/Odhen/Teknisa nesta amostra; `Microsoft-Windows-RetailDemo` não é o produto Odhen Retail e não foi aberto. Nenhum payload de evento foi exportado. Não insistir na mesma rota como prova causal.

**CI base anterior:** run `41374598005` no commit `de4b7660` concluiu **success**, Linux 143/143 e Windows 131/131. Uma modificação documental posterior requer seu próprio status de commit; não transferir automaticamente esse sucesso para qualquer HEAD novo.

**Próxima evidência material, fora desta auditoria estática:** identificar **qual caixa lógico IFO da loja 0001/01** tem a integração, e registrar com autorização específica uma revisão nativa vinculada à chamada efetiva `ImpPedido_Producao` ou ao mecanismo correspondente — não ao cabeçalho/entrega. Se a informação estiver em tela/configuração com ACL ou os eventos forem sensíveis, respeitar o bloqueio. Nenhuma autorização de instalação, logs novos, chamadas diretas de função, impressão, ativação de equipamento, alteração de rota, merge ou deploy foi obtida. `FIRST_NATIVE_DISPATCH=UNKNOWN`, `PILOT=HOLD`.

## Descoberta de ligação PE por biblioteca intermediária — GPE (01/11/2026)

**Falha de hipótese corrigida:** a busca anterior só procurava importações diretas com nomes `PKG_IMP`, `PKG_DLV` ou `Fos`, e por isso **não detectou** a importação de uma camada compartilhada chamada `Pkg_Gpe00002.bpl`. A investigação estática posterior resolveu o nome do DLL **e o nome do símbolo na tabela de imports PE** de `PKG_DLV00100.bpl`; não é uma correspondência apenas por texto no binário.

### Fonte e vínculo exatos

- **`PKG_DLV00100.bpl` (24/08/2026; SHA-256 `40A1EFE58FE1916E39AE040CB746B74714F414142FE762D7272F01FBC32F968E`) importa de `Pkg_Gpe00002.bpl` os símbolos `@Gpe00002@DisparaImpressaoNaoFiscal` e `@Gpe00002@ImprimeEntrega`, além de outros símbolos de controle, fiscal e caixa.** O primeiro símbolo foi confirmado em um import descriptor PE, não deduzido pelo nome do arquivo.
- **`Pkg_Gpe00002.bpl` (24/08/2026; 183.296 bytes; SHA-256 `A4CE70CEAA564BF6D94409E69EB48CF7F166C1691C7978855FD32A9C138D321A`) exporta essas referências como dados da seção `BSS`, não endereços `CODE` executáveis.** `@Gpe00002@DisparaImpressaoNaoFiscal` está em `RVA 0x10190`, `@Gpe00002@DisparaImpNaoFiscalDlv` em `0x10194`, `@Gpe00002@DisparaImprimeCancProduto` em `0x10198`, `@Gpe00002@ImprimeEntrega` em `0x101E8`, `@Gpe00002@DisparaImpPedExpKDS` em `0x101F4`. Na arquitetura PE32, o espaçamento consecutivo de quatro bytes dos três primeiros é **compatível** com slots de ponteiros/callbacks compartilhados, mas a assinatura/valor atribuído em runtime não foi lida.
- **`PKG_IMP00001.bpl` (29/12/2025) também importa `@Gpe00002@DisparaImpressaoNaoFiscal`.** Em contraste, `PKG_IMP00000.bpl` importa a biblioteca GPE para outras referências, mas **não esse símbolo específico** na lista de importações estáticas examinadas. Sua exportação própria `@Cli_imp00000@DisparaImpressaoNaoFiscal` está na seção `CODE` e **não deve ser confundida** com o dado `@Gpe00002@DisparaImpressaoNaoFiscal`.
- `FosSinc.exe`, `FosImp.exe` e `Pkg_Dlv00000.bpl` **não** apresentaram importação PE direta de `Pkg_Gpe00002.bpl` na amostra examinada. A ausência de importação explícita não descarta uso indireto por package dinâmico, outro processo ou serviço.

### O que a prova resolve, e o que falta

| Elo | Situação |
|---|---|
| `PKG_DLV00100` → `Pkg_Gpe00002` (import estático de símbolo) | **COMPROVADO nos bytes dos arquivos instalados** |
| `Pkg_Gpe00002` expõe símbolo de impressão como slot de dados `BSS` | **COMPROVADO**; interpretação como ponteiro de função = **inferência técnica** |
| `PKG_IMP00000` oferece implementação compilada de nome semelhante e imports WinSpool | **COMPROVADO como capacidade estática**, sem provar que preenche o slot GPE |
| Valor corrente do slot/callback GPE e módulo que o preenche | **DESCONHECIDO**; não ler memória protegida nem contornar ACL |
| Alguma revisão `DLV_IFO` passa por esse callback e emite a primeira via de cozinha | **DESCONHECIDO**, sem vínculo caixa IFO + evento real + praça/backup |

**Impacto real:** deixou de ser correto descrever a cadeia como ausência completa de importações entre o delivery e a impressão. Existe uma **dependência compilada de símbolos GPE**, que deve ser tratada como um novo nível de indireção. **Não promover para cadeia causal `FosSinc → GPE → FosImp` nem afirmar que o `GPE` executa impressão:** seu export identificado é um dado, não uma função em `CODE`. Primeira via, exclusividade e papel continuam desconhecidos.

**Próximo experimento seguro de maior valor:** somente quando houver canal legitimamente autorizado para vínculo IFO e telemetria da primeira tentativa, testar se uma revisão real usa esse caminho sem coletar conteúdo de pedido/cliente. Observações de `spoolsv/307`, cabeçalhos contendo `iFood`, ou leitura de arquivo PE não substituem essa prova. Nenhum serviço, print, token, pedido, chamada nativa, SQL, fila, driver ou configuração foi modificado.

## Auditoria dos slots GPE por referências à IAT — 01/11/2026

Investigação somente leitura dos arquivos PE do `CAIXA_MOOCA`, sem executar código, abrir memória de outro processo, alterar configuração ou exportar bytes do sistema:

- `PKG_DLV00100.bpl` importa `@Gpe00002@ImprimeEntrega` e apresenta **cinco referências** do tipo `MOV`/load candidato à respectiva entrada na *Import Address Table* (RVAs `0x2EF6E`, `0x35408`, `0x3546A`, `0x354E4`, `0x35519`).
- No mesmo módulo, `@Gpe00002@DisparaImpressaoNaoFiscal` apresenta **três referências** do tipo load candidato (RVAs `0x233CE`, `0x236B2`, `0x238C4`).
- `PKG_IMP00001.bpl` apresenta **duas referências** de load candidato a `@Gpe00002@DisparaImpressaoNaoFiscal` (RVAs `0x817D`, `0x8957`).
- `PKG_IMP00000.bpl` **não apresentou importação direta desses símbolos específicos** na enumeração PE consultada.

O detector verificou a coincidência com os quatro bytes de endereço da IAT e opcode anterior. **Não** realizou decodificação completa x86, análise de fluxo de controle, resolução do valor em runtime nem observou chamada real; portanto são **candidatos estáticos**, sujeitos a falsos positivos e a código inalcançável. Nesse recorte não apareceu padrão direto `CALL [IAT]` ou atribuição `MOV [IAT], reg`; isso **não elimina chamadas indiretas**, inicialização do callback, outra biblioteca ou outros processos. **Uma referência ao slot não é o preenchimento do slot, nem o primeiro despacho IFO.**

**Nova barreira de integridade no código:** `tools/comandas_native_first_dispatch_lineage_v1_offline.cjs` agora classifica expressamente importação PE, slot BSS GPE, referência estática à IAT, export de função, literal de módulo e agregados de fila Windows como **não-gatilhos**. Cada categoria tem teste via iterador `NON_TRIGGER` no verificador já encadeado à CI Linux/Windows. Essa mudança previne a promoção acidental de capacidade estática em prova operacional.

**Bloqueio do acesso remoto respeitado:** a tentativa de classificar apenas metadados dos arquivos-fonte `ImpressaoPedido.php` e `odhen-perifericos/src/IMP/index.js` foi bloqueada pela política da ferramenta. Nenhum dado foi retornado; não houve repetição com rota equivalente, alteração de ACL, exportação do conteúdo ou uso de credenciais. Estado da leitura: `NOT_ACCESSIBLE_ON_THIS_TOOL_PATH`, não `SOURCE_ABSENT`.

**Próxima prova ainda decisiva:** configuração Retail `IFO→0001/01→caixa` por interface já autenticada e fonte de primeira tentativa `DLV_IFO` vinculada à revisão nativa, praça e efeito. Nenhuma destas provas foi obtida. Não contatar fornecedor, não alterar caixa/serviços/impressoras, não autorizar piloto ou merge pela presença dos símbolos.


## Rastreamento negativo de disparos manuais e relatórios — 02/11/2026

**Escopo:** análise estritamente estática dos bytes do PE32 instalado no `CAIXA_MOOCA`, sem execução das funções, pedido real, memória de processo, impressora, configuração, acesso fiscal ou mudança de serviço. Essa investigação não implica autorização de reprodução do ambiente, instrumentação ou emissão física.

### 1. Separação de UI manual e produção automática

O método compilado `Cli_dlv00999.TdtmImpressao.ImpPedido_Producao` de `Pkg_Dlv00000.bpl`, RVA `0xD79DC`, recebeu **um candidato de chamada relativa direta `E8 rel32`** na seção `CODE`: site `0xD90BD`. O endereço da chamada fica entre as entradas exportadas `Cli_dlv00200.TfrmProducao.btnImprimirClick` (RVA `0xD9008`) e `btnConcluirClick`. Os nomes da região correspondem a um evento de botão de imprimir, **não a um emissor de chegada automática IFO**.

A rotina separada `Cli_dlv00999.TdtmImpressao.ImpPedido_Entrega` (RVA `0xD6828`) recebeu também **um candidato de chamada relativa direta**, no RVA `0xF6C0F`, entre os exports `Cli_dlv00800.TfrmControleSaidaEnt.bldImpEntregaClick` e `dbgControlEntregaDrawColumnCell`. Esse é outro indício de evento manual para entrega/controle de saída, não da primeira via de cozinha.

**Rigor:** a busca inspecionou candidatos de opcode `E8` com deslocamento relativo para o RVA exportado. Não houve disassembly instrução a instrução nem reconstrução de limites reais de cada função; `E8` dentro de dados ou código não alcançável pode gerar falsos positivos. Mesmo uma chamada direta compilada válida **não prova que ela tenha sido executada**. As contagens de uma chamada direta por rotina não descartam ponteiros, métodos virtuais, outro módulo, scripts ou serviços.

### 2. Classificação das referências GPE já encontradas

Atribuição de cada RVA à vizinhança de exports mais próxima, que **não determina limite comprovado de função**:

| Módulo | RVAs das referências estáticas à IAT GPE | Export anterior mais próximo | Interpretação restrita |
|---|---|---|---|
| `PKG_DLV00100.bpl` | `0x2EF6E` (`ImprimeEntrega`) | `ImpPedido_Entrega` | Possível uso em geração/saída de entrega |
| `PKG_DLV00100.bpl` | `0x35408`, `0x3546A`, `0x354E4`, `0x35519` (`ImprimeEntrega`) | `btnImpRelPedAbeClick` | Região de evento de botão de relatório de pedido aberto |
| `PKG_DLV00100.bpl` | `0x233CE`, `0x236B2`, `0x238C4` (`DisparaImpressaoNaoFiscal`) | `FechaContaNormal` | Região de fechamento de conta; não confundir com primeiro despacho automático |
| `PKG_IMP00001.bpl` | `0x817D`, `0x8957` (`DisparaImpressaoNaoFiscal`) | `TrdmImpExpKds.FechaContaNormal` | Outra região de fechamento de conta, ainda não atestada em runtime |

Isso **reduz a prioridade da hipótese de que as referências GPE acima sejam a origem do primeiro despacho IFO**. Não demonstra ausência de caminho automático em `FosSinc`, `FosImp` ou outras bibliotecas, nem afirma que toda impressão de produção é manual.

### 3. Proteção versionada contra falso positivo

O verificador `tools/comandas_native_first_dispatch_lineage_v1_offline.cjs` passou a rejeitar adicionalmente `FORSALE_MANUAL_PRODUCTION_BUTTON_CALL`, `FORSALE_MANUAL_DELIVERY_BUTTON_CALL`, `FORSALE_OPEN_ORDER_REPORT_PRINT_HANDLER` e `FORSALE_CASH_CLOSE_PRINT_REFERENCE` como tipos de evento que atestariam a primeira tentativa **automática** de produção IFO. O verificador já exercita todos os `NON_TRIGGER` por tabela em Linux e Windows. Essa proteção **não exige que o fornecedor entre em contato** e não causa qualquer efeito físico.

**Estado remanescente:** `IFO_CASHBOX_MAPPING=UNKNOWN`; `AUTOMATIC_NATIVE_FIRST_DISPATCH=UNKNOWN`; `GPE_CALLBACK_VALUE=UNKNOWN`; `PHYSICAL_PRINT=NOT_PROVEN`; `PILOT=HOLD`. Provas necessárias continuam sendo a associação Retail legítima da integração e uma tentativa real com revisão, praça e destino observados. A rota de UI/manual foi despriorizada por evidência, não por suposição.
