# TATÁ Comandas — caminhos nativos de primeira impressão, reimpressão e delivery

**Fonte:** leitura estática, estritamente passiva, de PHP existente em `CAIXA_MOOCA` em 26/10/2026. **Validade:** `SOURCE_CODE_OBSERVED`, não `LIVE_CALL_PROVEN`, não `PRINT_EVENT_PROVEN`. Nenhuma execução de fluxo PHP, SQL, endpoint, impressora, spooler ou serviço.

## Arquivos e identidade dos bytes examinados

| Caminho relativo a `C:\TEKNISA\odhenPOS\backend_74000` | SHA-256 |
|---|---|
| `src/Controller/Account.php` | `D0A4358B040B8E42988DCC6B71766B2846E27C40526958F8483A9CC6754313D0` |
| `src/Service/Pedido.php` | `0617AAD392816F2B5CDB61B685AE2F77DF6FC2E08D630676C13584CE91BF9702` |
| `src/Service/GeneralFunctions.php` | `B837F683615153AB8FBA461766BB9D7FF9D4048E1B1F32D71003A1348B666F94` |
| `src/Controller/GeneralFunctions.php` | `023AE4192A207D6DF9F9803C48C97FEABB727189945A9B567403318616B2AB5A` |
| `src/Service/Payment.php` | `345C529A2C6FCA4AD4791967C3E0A020283E96DE4D87017B9AA197D5B69D848A` |
| `vendor/odhen/api/src/Service/ImpressaoPedido.php` | `BECAE373377F965C2DD2B8AB1DE9A904C71C6B820EB35980A894279C28670E52` (também registrado em auditoria anterior) |

## Três caminhos distintos no código

### A. Pedido de mesa / via de produção

`src/Controller/Account.php`, método `order()` (linhas ~56–150):
1. inicia transação e chama `pedidoService->fazPedido` para cada comanda (linha ~115);
2. após sucesso, executa `connection->commit()` (linha ~138);
3. **depois do commit**, chama `pedidoService->imprimePedidoMesaComanda` (linha ~141);
4. caso falhe a impressão, gera mensagem de que o pedido foi registrado mas não foi possível imprimir.

`src/Service/Pedido.php`: `fazPedido` acumula `impProdParams` a partir dos produtos tratados (~1083); `imprimePedidoMesaComanda` (~1293) consulta `session['IDIMPPEDPROD']`, itera esses parâmetros e chama `impressaoAPI->imprimePedido` (~1307). O método da biblioteca de impressão indexa produtos por `BUSCA_IMPRESSORAS` em trilhas de produção, produção 2 e puxa.

**Implicação:** na via demonstrada em código, gravação do pedido e tentativa de imprimir são etapas distintas. Um evento de status `P` sozinho não identifica a operação de impressão, um sucesso de `commit()` sozinho não comprova papel e uma falha posterior de impressora não implica ausência do pedido. O caminho aqui é `Account::order` de mesa; **não foi demonstrado ser o caminho da integração iFood**.

### B. Reimpressão explícita

`src/Controller/GeneralFunctions.php`, método `reprintPedido` (~46–60) chama `src/Service/GeneralFunctions.php::reprintPedido` (~561–570), que busca pedido prévio e executa `impressaoPedido->imprimePedido` com sinalizador de reimpressão `'S'` (~569–574). Portanto **reimpressão tem entrada própria**: não deve ser inferida de transição `X→P` nem disparada automaticamente após perda de confirmação.

### C. Balcão / pagamento e relatório de entrega

`src/Service/Payment.php::imprimePedidoBalcao` (~370–411) chama `impressaoPedido->imprimePedido` com `tipoVenda='B'`. Se `IDIMPPEDPROD` não indica só produção, pode chamar também `impressaoPedidoSmart`.

Separadamente, `vendor/odhen/api/src/Service/Venda.php` (~475–493) chama `comandaService->liberaComandaDelivery` após venda bem-sucedida e, **depois de atualizar o estado para `P` ou `X`**, só tenta `impressaoDelivery->imprimeDelivery` quando `IDIMPAUTENTREG='S'`. Esse é um caminho de *relatório de entrega*, não prova de via de produção ou de emissão do Gestor iFood. Assim, `P` não é testemunha da tentativa nem prova de papel.

## Gate técnico recomendado, sem nova burocracia de turno

A candidata deve manter **separados** `ORDER_CREATED`, `PRODUCTION_REQUEST_OBSERVED`, `PRINT_ATTEMPT_OBSERVED`, `PRINT_EFFECT_RECONCILED`, `REPRINT_REQUEST_OBSERVED`, `CANCELLATION_OBSERVED` e `UNKNOWN` como **categorias de investigação**, não como eventos automaticamente produzidos a partir de `IDSTCOMANDA`.

Para a primeira via futura, exigir um pedido real com identidade/revisão nativas, origem iFood independente e **prova da chamada/tentativa de produção no caminho efetivo do iFood ou do emissor autorizado**. `Account::order` oferece uma arquitetura de referência local, não prova o caminho do delivery; `GeneralFunctions::reprintPedido` demonstra um caminho separado de reimpressão. Não assumir que ambas as saídas de produção A/B são alternativas por horário. Não instalar hook, wrapper, leitor de spooler ou monitor de API para fabricar a evidência.

Os bloqueios restantes são por fato operacional: evento inicial, composição e observações da mesma revisão, classificações e praças atuais, binding TATÁ persistido e exclusivo, gerador de papel único, reconciliação de falha/retry e inspeção óptica. **PR continua DRAFT/HOLD.**
