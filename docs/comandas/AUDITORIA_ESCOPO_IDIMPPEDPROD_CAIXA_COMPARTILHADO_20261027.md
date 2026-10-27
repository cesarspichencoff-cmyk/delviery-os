# Auditoria de alcance do IDIMPPEDPROD — proteção de mesa, balcão e reimpressão

**27/10/2026 · ITAIM · CAIXA_MOOCA · revisão somente leitura. PR #127 em DRAFT/HOLD.**

## Conclusão operacional

Não aplicar `IDIMPPEDPROD=N` na configuração compartilhada do caixa para tentar neutralizar as vias antigas de iFood. A inspeção do código instalado mostrou que esse parâmetro **não é uma opção dedicada ao pedido `DLV_IFO`**: sua origem é cadastro do caixa, é carregado na sessão e é reutilizado em mais de um fluxo de atendimento. Desligá-lo no escopo do caixa poderia suprimir comandas legítimas de mesa, balcão e/ou reimpressão. O risco é material e não aceitável para um piloto que pretende somente substituir as vias de delivery.

## Evidência observada diretamente no código PHP instalado

Foi realizada busca textual **somente leitura** em **133 arquivos PHP** nas árvores `backend_74000/src` e `backend_74000/vendor/odhen/api/src` por `IDIMPPEDPROD` e chamadas de impressão. Foram obtidas 45 ocorrências relevantes, sem inspecionar pedidos, clientes ou credenciais.

| Caminho e linhas observadas | Fato observado |
|---|---|
| `src/Service/Operator.php:314–323` | `$sessao['IDIMPPEDPROD'] = $r_dados_caixa['IDIMPPEDPROD']`. O parâmetro vem de **dados do caixa**, não de uma chave `DLV_IFO`. O modo `N` também altera a compatibilidade `IDIMPPEDPRCIGE`. |
| `src/Controller/Account.php:138–141` | Após commit de operação de mesa, chama `imprimePedidoMesaComanda`. |
| `src/Service/Pedido.php:1293–1312` | `imprimePedidoMesaComanda` usa a sessão e somente chama `imprimePedido` quando `IDIMPPEDPROD != N`. **Afeta mesa**, não apenas delivery. |
| `src/Controller/Payment.php:550–556` | Fluxo de pagamento também testa `IDIMPPEDPROD != N` antes de solicitar impressão de balcão. |
| `src/Service/Payment.php:371–403` | `imprimePedidoBalcao` recebe o mesmo parâmetro e encaminha-o para `impressaoPedido->imprimePedido`. |
| `src/Service/GeneralFunctions.php:561–575` | A função `reprintPedido` passa `$session['IDIMPPEDPROD']` ao método de impressão. É um caminho de **reimpressão**, não uma primeira via de iFood. |
| `vendor/odhen/api/src/Service/ImpressaoPedido.php:199–264` | `N/S/M/T` governam os grupos de impressoras de produção e maquininha. Esse filtro é **compartilhado por chamadas**; não prova distinção `DLV_IFO`. |

### O que isto prova e o que não prova

**PROVADO NO CÓDIGO INSTALADO:** mudança do parâmetro de sessão/caixa alcança outras rotas funcionais além de delivery; o parâmetro `N` pode impedir produção nesses métodos; a configuração de caixa é sua fonte na sessão.

**NÃO PROVADO:** o **valor atual** do parâmetro em cada operação; o primeiro evento de impressão de `DLV_IFO`; se há um override seguro específico para o delivery em outro componente; todos os caminhos de impressão do iFood Gestor; se alguma impressão física determinada já saiu. Uma varredura com ocorrências não é prova de inexistência universal de outro emissor.

O diretório `odhen-perifericos` mostrou ponte HTTP e backend Epson nativo; isso também não autoriza o desvio automático das filas Windows para `NUL`.

## Mudança de estratégia

1. **Bloqueado:** `IDIMPPEDPROD=N` na configuração global/compartilhada do caixa, por risco de cortar mesa, balcão e reimpressão. NÃO alterar nem testar essa mudança no caixa vivo.
2. **Candidato condicionado:** supressão **por chamada exclusiva de `DLV_IFO`** que deixe `IDIMPPEDPROD` da sessão intocado. Ainda falta identificar e provar o callsite. Não presumir que tal override exista.
3. **Alternativa:** opção nativa de não imprimir especificamente a comanda antiga de delivery, se descoberta e verificada. O parâmetro de transporte `UTILIZA_IMPRESSAO_PONTE` não é essa opção.
4. **Alternativa condicional:** desvio somente da rota realmente comprovada como exclusivamente de via antiga, nunca da impressora física compartilhada com sala/cozinha/fiscal.
5. **Enquanto isso:** manter antigo emissor ativo em SHADOW, TATÁ sem saída física, Reader observando o pedido pela origem nativa. Só depois de sequência persistida, estações homologadas, primeiro evento comprovado e testes de exclusividade caberá o piloto especificamente autorizado.

## Proteção implantada em código de revisão

O módulo puro `tools/comandas_teknisa_native_print_mode_v1_offline.cjs` agora exige `proposed_application.kind=DELIVERY_ONLY_PER_INVOCATION_CLAIM` com declarações de preservação da sessão compartilhada e das vias de mesa/balcão; `CASH_REGISTER_CONFIG_CHANGE`, argumento ausente, prova de chamada ausente ou indicação de alteração da sessão retornam **`HOLD: CASHIER_WIDE_IDIMPPEDPROD_MUST_NOT_BE_CHANGED`**. Mesmo o cenário hipotético completo retorna apenas **`REVIEW_CANDIDATE_ONLY`**; nenhum input autoriza operação.

O contrato `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs` usa esse veto em `UPSTREAM_PRINT_OFF`. Os testes novos cobrem esse risco em cadeia, inclusive falso atestado de preservação de balcão. Em clone descartável Foxxy, commit `c3025be4306836d3ad7577ac420f4fcd24afad2f`, a regressão direcionada passou **24/24** (modo nativo), **23/23** (transporte), **41/41** (transição). **Não representa deploy ou sucesso de papel.**

**Fronteira de efeito:** nenhuma porta, fila, impressora, status de caixa, opção da Teknisa, configuração GP/iFood, SQL, sequência TATÁ, serviço, dados fiscais ou produção foram modificados. A PR permanece DRAFT/HOLD.

## Fingerprints dos seis caminhos observados (CAIXA_MOOCA, somente leitura)

| Fonte instalada | SHA-256 |
|---|---|
| `src/Service/Operator.php` | `6A9C41125589ACD16831D05535D39F3F2512B67D7651D398CAC4029415AFED4F` |
| `src/Service/Pedido.php` | `0617AAD392816F2B5CDB61B685AE2F77DF6FC2E08D630676C13584CE91BF9702` |
| `src/Controller/Account.php` | `D0A4358B040B8E42988DCC6B71766B2846E27C40526958F8483A9CC6754313D0` |
| `src/Controller/Payment.php` | `C3103513BA3EB3E2C166B3BF4892B16B51F6CA9EC3C0598FBE5C2353F5B5BA46` |
| `src/Service/Payment.php` | `345C529A2C6FCA4AD4791967C3E0A020283E96DE4D87017B9AA197D5B69D848A` |
| `src/Service/GeneralFunctions.php` | `B837F683615153AB8FBA461766BB9D7FF9D4048E1B1F32D71003A1348B666F94` |

Serviço Windows `Perifericos` observado **Running** no host na mesma inspeção. Esse fato comprova que o serviço existe e está executando; **não comprova** que ele recebeu ou imprimiu uma determinada primeira via `DLV_IFO`. Não houve leitura de documento de impressão ou manipulação do serviço.
