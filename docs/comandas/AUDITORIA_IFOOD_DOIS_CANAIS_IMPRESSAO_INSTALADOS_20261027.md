# TATÁ Comandas — auditoria dos dois caminhos iFood instalados no caixa

**27/10/2026 — Itaim — dispositivo denominado CAIXA_MOOCA — somente leitura de metadados de processo, sockets em LISTEN e arquivos instalados. PR #127 DRAFT/HOLD.**

## Achado que altera o desenho de transição

A instalação local do iFood **não possui somente um processo de impressão**. Foram observados **dois aplicativos Electron**, instalados e em execução, com mecanismos de impressão separados:

| Emissor identificado no código | Versão instalada | Interface de impressão identificada | Prova |
|---|---|---|---|
| Impressora GP iFood | `order-manager-printer` **1.2.0** | Express local `POST /print`, porta padrão `4013`, `@ifood/thermal-printer.print(invoice, printerConfig)` | Aplicativo instalado e processo em execução; **TCP :4013 em LISTEN** no momento da consulta, vinculado ao processo GP |
| Gestor de Pedidos | `ifood-order-manager` **8.10.4** | Electron `ipc.on('printOrder')` → **`@ifood/thermal-printer.print`** diretamente no próprio Gestor | Código instalado e processo em execução, mas **nenhum evento `printOrder` real observado** |

Ambos incluem **`@ifood/thermal-printer` versão 1.0.32**. Portanto, desligar o servidor local da Impressora GP **não demonstra** que o Gestor deixou de imprimir pelo seu próprio evento IPC. A presença de ambos os programas em execução **não comprova** que a impressão automática do Itaim esteja habilitada, que um pedido tenha sido enviado a cada via, ou que haja duplicatas atuais.

A consulta de `Get-NetTCPConnection` encontrou `:4013` em `LISTEN` no processo `Impressora GP iFood`, com `LocalAddress=0.0.0.0` (bind `ALL_INTERFACES`). Isso **não comprova acessibilidade remota** — firewall, regras de entrada e autenticação não foram testados. Nenhuma requisição TCP/HTTP foi disparada.

## Provas delimitadas por arquivo/trecho instalado

**GP**, `C:\Program Files (x86)\Impressora GP iFood\resources\app.asar`:
- SHA-256 `7BC345A96B8BFD448917C219B3BA16445766FAC5C08820E7927BA9B4C7E19CB3`, tamanho 14.402.515 bytes, mtime 05/11/2025 13:25:50 UTC.
- `dist-electron/electron/local-server/index.js`: `process.env.PORT || 4013`, lista de impressoras Windows em `GET /printers`, aceitação de conteúdo em `POST /print` e resposta com `jobId`/mensagem de sucesso. **A existência da rota e uma resposta de software não provam emissão física**.
- `dist-electron/electron/main.js`: inicia `startLocalPrinterServer` quando o aplicativo está pronto.

**Gestor**, `C:\Program Files (x86)\Gestor de Pedidos\resources\app.asar`:
- SHA-256 `B627F24D2AEE191A48DEAD554E1E9DB795885642F526D8BDDA8AB51E52D7FF79`, tamanho 32.139.224 bytes, mtime 02/10/2026 15:06:18 UTC.
- `src/ipcHandler.js:21–50`: recebe evento `printOrder`, chama a função **assíncrona** `iFoodThermalPrinter.print(invoice, {...})` e imediatamente envia `printOrderReply` com mensagem **`Successfully printed`**, **sem `await`** e sem `.then` ligado à conclusão. Portanto, o próprio *ack* do IPC pode anteceder erro/sucesso da impressão e **não pode ser tratado como papel impresso**.
- `src/ipcHandler.js:52–55`: enumera impressoras pelo nome. A interface publicada ao usuário por frontend web **não foi auditada no runtime**; evento possível ≠ evento ocorrido.

**Biblioteca `@ifood/thermal-printer` 1.0.32, presente nos dois aplicativos:**
- `src/lib/thermal-printer/printer.ts`: para conteúdo texto chama `simplePrint`; para conteúdo ESC/POS cria `ThermalPrinter({type: EPSON, interface: 'printer:' + nome, driver: nodePrinter})`, seguido de `execute()`.
- `src/lib/thermal-printer/simplePrinter.ts`: utiliza o driver `@niick555/node-printer`, com `printDirect({printer: nome, type:'RAW'})` e *callback* `success(jobID)`. **Um `jobID` não é recibo físico de impressão**.
- `src/lib/node-printer/printer.js`: delega `getPrinters` e `printDirect` à biblioteca de impressoras do sistema. Portanto, **o Windows spooler é parte material desses caminhos**. Mas não foi comprovado qual nome de fila foi selecionado na operação da unidade, se é compartilhada com o fiscal, se alguma impressão real passou por ela ou se o driver entregou papel.

**Distinção fundamental:** isso não é equivalente ao ramo **Odhen Periféricos/Epson**, que utiliza uma DLL nativa e fila própria, nem ao **Relatório de Entrega** pós-venda da Teknisa. Não aplicar a mesma porta `NUL` indistintamente aos emissores.

## Matriz atual de conhecimento

| Pergunta | Estado |
|---|---|
| GP local possui endpoint estático de impressão? | **PROVADO_NO_CÓDIGO** |
| Porta 4013 estava em LISTEN por processo GP? | **OBSERVADO_NO_HOST** |
| Gestor possui evento de impressão próprio independente do GP HTTP? | **PROVADO_NO_CÓDIGO** |
| Dois aplicativos utilizam a biblioteca de impressora Windows? | **PROVADO_NO_CÓDIGO** |
| Gestor `printOrderReply` confirma papel real? | **NÃO**; resposta no código ocorre antes da conclusão da Promise |
| Impressão automática iFood Itaim estava habilitada? | **UNKNOWN**, sem leitura de configuração real |
| GP e Gestor estão ambos efetivamente imprimindo comandas? | **UNKNOWN**, sem observar trabalhos |
| Quais filas reais atendem a cada caminho? | **UNKNOWN**, sem ler documentos/fila/estado de configuração |
| A via antiga pode ser neutralizada sem atingir documento fiscal? | **NÃO PROVADO** |
| Quem dispara primeira produção `DLV_IFO` na Teknisa? | **UNKNOWN**; não inferir do IPC ou `/print` do Gestor |

## Mudança implementada — revisão sem efeito

`tools/comandas_ifood_installed_print_channels_v1_offline.cjs` exige, como pré-voo de **revisão**, censo separado para os canais `GP_HTTP_PRINT` e `GESTOR_IPC_PRINTORDER`, configuração realmente observada, caminhos manuais, reconciliação de trabalhos antigos e mecanismo de desativação específico. Se for cogitada `WINDOWS_QUEUE_SINK_REVIEW`, exige alegação verificável de fila efetiva, exclusiva e **não fiscal**, jamais apenas nome de impressora.

Nenhuma entrada ao módulo concede autoridade física: `can_activate=false`, `any_old_paper_suppressed_proven=false`, `gp_listener_proves_paper=false`, `gestor_ipc_ack_proves_paper=false`. Os dados de laboratório são **fixtures hipotéticos, não configurações comprovadas**.

O contrato global `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs` passa a bloquear a transição se um desses canais não for censado, ainda que o outro esteja declarado desligado. A separação também mantém as restrições anteriores da produção nativa Teknisa, relatório automático/manual, fiscal, fila antiga Odhen, backup, sequência TATÁ e janela/praça.

Prova isolada no Foxxy no commit `84cfc3fccb76de3fdae46a09a2ae11f6608f6acf`: **23/23** casos iFood duplo, **62/62** contrato de transição, **21/21** relatório Teknisa e **19/19** ponte Odhen, todos PASS. O workflow Linux/Windows recebeu testes dedicados; CI hospedada do **HEAD final** precisa ser confirmada separadamente.

## Melhor caminho restante

A escolha preferencial continua **desativar a emissão redundante na origem comprovada**, sem desligar processos essenciais ou impressoras físicas compartilhadas. Para o iFood, investigar a opção de impressão automática/manual do Gestor **sem pressupor que desligar a Impressora GP cobre também o IPC embutido**. Se necessário desviar para saída virtual sem papel, só numa **fila Windows comprovadamente exclusiva** dos trabalhos antigos — nunca uma Epson/caixa/fiscal compartilhada. A investigação da **primeira impressão da cozinha recebida pelo Odhen Retail** permanece independente e pendente.

**Sem leitura de pedidos, payloads, credenciais, configuração de conta, arquivos de clientes, eventos de impressão, spooler ou logs; sem HTTP /print, NUL, alteração de serviço, driver, firewall, impres­sora, Teknisa, Gestor, SQL, fiscal, sequência TATÁ, deploy ou merge. PR OPEN/DRAFT/HOLD.**
