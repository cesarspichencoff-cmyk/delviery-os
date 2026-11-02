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
