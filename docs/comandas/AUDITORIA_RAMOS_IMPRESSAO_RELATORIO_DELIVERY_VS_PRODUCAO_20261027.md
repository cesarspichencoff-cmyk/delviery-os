# Caminhos comprovados de impressão de delivery — produção ≠ relatório de entrega

**27/10/2026 · Itaim · PR #127 · auditoria estática somente leitura em CAIXA_MOOCA, sem SQL e sem impressão**

## Descoberta nova: a Teknisa já possui controle específico para *relatório de entrega* depois da venda

No código instalado, o método de venda `Odhen\API\Service\Venda` em `vendor/odhen/api/src/Service/Venda.php:469–499` contém um ramo pós-venda que:
1. Executa somente depois de **venda bem-sucedida** (`!$result['error']`).
2. Quando `$DELIVERY` e `$TOTALVENDABRT > 0`, chama `Comanda::liberaComandaDelivery(...)`.
3. Consulta `IMPRIMEDLV_AUTOMATICO` com **CDFILIAL + CDLOJA + CDCAIXA**.
4. **Somente se `IDIMPAUTENTREG == 'S'`**, chama `ImpressaoDelivery::imprimeDelivery($orders)`.
5. Se o valor não for `S`, o ramo **não chama o relatório automático**. Isso não equivale a impedir a primeira via de cozinha, nem as vias manuais ou fiscais.

`vendor/odhen/api/src/Util/MSDEQuery.php:4815–4821`: a consulta `IMPRIMEDLV_AUTOMATICO` lê **`CAIXA.IDIMPAUTENTREG`**, não o produto nem um flag próprio de `DLV_IFO`. Portanto **NÃO alterar a configuração global do caixa** supondo que esse parâmetro desative apenas as comandas antigas de iFood; outros deliveries/relatórios podem ser afetados.

## Roteamento do relatório é distinto do roteamento dos produtos

`ImpressaoDelivery.php:18–88` obtém dados de entrega, itens do relatório e a impressora via `BUSCA_IMPRESSORA_DELIVERY`, antes de chamar `ImpressaoUtil::impressaoPedidos`. O cabeçalho é literalmente **`Relatorio De Entrega`**, não uma via de produção.

`MSDEQuery.php:4709–4719` e `OracleQuery.php:926–936` apontam para **`CAIXA.NRSEQIMPRLOJA7` com fallback para `NRSEQIMPRLOJA3`**, relacionado a `IMPRLOJA`/modelo/porta. Não confundir esse destino de relatório de entrega com a matriz dos produtos e seus pares Balcão/Delivery Sushi 1/2.

**A decisão de modificar a via antiga do relatório depende de sua função operacional real e do comprovante de que a nova conferência do caixa supre essa função.**

## O caminho de emissão manual continua separado

`src/Controller/Delivery.php:165–175` expõe `printDeliveryOrders`, que chama `imprimeDelivery($params['ORDERS'])` independentemente do `IDIMPAUTENTREG` do ramo automático de venda.

O frontend instalado demonstra **pelo menos duas entradas** para o relatório manual:
- `mobile/js/controllers/DeliveryController.js:137–155` — seleciona pedidos e solicita confirmação para imprimir **relatório de entrega**.
- `mobile/js/controllers/OrderDeliveryController.js:255–270` — reimprime o relatório de um pedido; o serviço `mobile/js/services/DeliveryService.js:100–110` envia `DeliveryPrint.download` ao backend.

Assim, desligar *somente* a opção de relatório automático **não neutraliza reimpressões manuais**, nem demonstra ausência de outras vias que cheguem à impressora. Também não existe prova de que a primeira via `DLV_IFO` use esse controlador.

## Atenção: liberar comanda não significa imprimir produção

O método `vendor/odhen/api/src/Service/Comanda.php:1916–1940` muda `IDSTCOMANDA` para `P` ou `X` conforme retirada no balcão/finalização automática, e retorna uma estrutura `$order` para o relatório de entrega. **Não chama `ImpressaoPedido::imprimePedido` nesse trecho** e **`P`/`X` não são recibo da primeira impressão de produção**.

O rastreamento de callsites numa árvore limitada a **133 PHP** identificou chamadas de `ImpressaoPedido::imprimePedido` associadas a **mesa, balcão e reimpressão**, mas **não encontrou nesse conjunto uma chamada demonstrada do evento de primeira produção `DLV_IFO`**. Esta negativa tem escopo delimitado: não é prova de inexistência de integração externa, SQL/job, outro serviço, app ou emissor. O sistema de POS mobile possui caminhos de impressão próprios; não assumir que um relatório pós-venda é a primeira comanda.

## Fontes instaladas — fingerprints SHA-256 (somente arquivos de código)

| Caminho relativo à instalação | SHA-256 |
|---|---|
| `backend_74000/vendor/odhen/api/src/Service/Venda.php` | `D5376156D3364A14F66ACCBC65EBAF3AA0F225C47199010CAFA2113DAC1D4B63` |
| `backend_74000/vendor/odhen/api/src/Service/ImpressaoDelivery.php` | `E734D51CAEE85D02D5BB1F4EB270B21601B806912A0115B353F7C24756C6BD0C` |
| `backend_74000/vendor/odhen/api/src/Service/Comanda.php` | `130E6BF073F1FAD0F7C2A04A4CA86585350C440E2C2FC1C878B7F0EDE33EAD36` |
| `backend_74000/src/Controller/Delivery.php` | `2AAD92AF4F3FF98ABABCF0B6906072D0D2E3012696C20386B155BEBF827B3D9C` |
| `backend_74000/vendor/odhen/api/src/Util/MSDEQuery.php` | `0F578882EDB25A67941452AE41CE53E62C5A624AAB651AD9325B43FAF045E115` |
| `mobile/js/controllers/DeliveryController.js` | `0B0D45DB68A44A8DD082FC0063160517E974CFCDA875E0F39BBA5F8BF67A750A` |
| `mobile/js/controllers/OrderDeliveryController.js` | `1452EC70010740C85EA3FF54FD94E261DC4E71C62518B811320770F68EBF8C76` |
| `mobile/js/services/DeliveryService.js` | `55B27E12676533F749BD86CBFE96DFD1F5F9A057EA24AEBFA5860A0878E39F7D` |

Os SHA fixam **bytes do código observado**. Não validam configuração de runtime ou identidade/autorização do emissor físico. Não foram lidos dados de pedidos, logs privados, banco, documentos de cliente ou valores efetivos do caixa.

## Implementação de segurança na PR

- `tools/comandas_teknisa_delivery_report_boundary_v1_offline.cjs` reproduz em modo *review* os predicados do ramo pós-venda/relatório e distingue explicitamente impressão **automática** de **solicitação manual**, ambas diferentes da primeira via de produção.
- `tools/verificar_comandas_teknisa_delivery_report_boundary_v1_offline.cjs` passou **21/21** testes em checkout descartável Foxxy. Nenhum caminho imprime, lê SQL ou autoriza alterar o `IDIMPAUTENTREG`.
- `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs` exige censo explícito do relatório automático, da emissão manual e da preservação da opção global do caixa, além dos requisitos anteriores de Reader, sequência TATÁ, iFood, rotas e backup. Sem isso, **HOLD**; contrato ampliado **55/55 PASS** em Foxxy isolado.
- CI Linux/Windows inclui o teste novo. Conferir o workflow no commit exato antes de declarar teste integral.

## Pesquisa externa específica: Gestor iFood

A documentação pública oficial do iFood descreve **configuração própria da impressão automática do Gestor**, separada do mecanismo de **aceite automático**: menu de Ajustes → Impressão → Impressão automática de pedidos. Ela também documenta um botão de **impressão manual**. Essas informações são **documentação pública do produto**, não configuração observada do Itaim em 27/10/2026. O relato da gestão de 25/10 de que o Gestor já estava sem impressão automática não foi revalidado por acesso à conta.

Fontes externas:
- https://blog-parceiros.ifood.com.br/aceite-automatico/ (atualizado em 18/07/2025)
- https://blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/ (funções de impressão automática/manual)

Implicação: o projeto precisa tratar separadamente **emissão do Gestor**, **relatório de entrega da Teknisa**, **produção nativa por praça** e **reimpressões manuais**. Não ativar impressão no Gestor para realizar o cruzamento de dados; também não alegar que a opção pública já esteja corretamente desativada na conta do Itaim.

## Próxima ação que realmente avança o projeto

1. Identificar a integração executável/serviço ou evento que **cria a primeira via de produção `DLV_IFO`**; não reutilizar o pós-venda `IDIMPAUTENTREG` como gatilho.
2. Censar, por função, os caminhos antigos: **produção 1/2**, relatório automático de entrega, pedido manual de relatório, papel eventualmente emitido pelo Gestor iFood, backup Odhen, fiscal/relatórios essenciais.
3. Associar cada saída antiga a um mecanismo de supressão **específico e reversível**, sem desativar `IDIMPPEDPROD` ou `IDIMPAUTENTREG` globalmente, sem desviar Epson para `NUL` sem prova.
4. Homologar o novo emissor físico apenas com sequência TATÁ persistida, impressoras por praça e janela e observação em papel autorizada, mantendo proteção contra backlog antigo.

**Estado: código/linhas instaladas comprovados, nenhuma execução de impressão comprovada, sem autorização de cutover, PR DRAFT/HOLD.**
