# TATÁ Comandas — origem do primeiro despacho de produção (Retail / ForSale / iFood)

**27/10/2026 — Itaim — PR #127 DRAFT/HOLD — pesquisa pública + código review offline + host em leitura seletiva**

## Achado que muda a rota da investigação

A [documentação oficial de APIs e integrações Teknisa](https://www.teknisa.com/api) diferencia **pedido captado de marketplace** de **venda efetivada no PDV**: o iFood é integrado ao Retail como **pré-pedido** e só vira venda quando emitida pelo PDV. O [manual de integração Teknisa × iFood](https://ead.teknisa.com/wp-content/uploads/2025/11/Manual-Integracao-Teknisa-iFood.pdf) é material específico do conector iFood (Order), enquanto um exemplar anterior reproduzido como *Manual iFood 4.2.0* indica geração de comanda no **ForSale** como parte do fluxo automatizado. Para o Retail como produto, a documentação da própria Teknisa também descreve o encaminhamento dos pedidos externos ao PDV e à cozinha, sem redigitação.

Essas fontes indicam **um caminho mais provável para procurar o primeiro despacho nativo de produção** do que o `Venda.php → IDIMPAUTENTREG → ImpressaoDelivery`. Porém **não provam** o tipo de executável/serviço de integração que o Itaim utiliza, o momento exato da primeira via `DLV_IFO`, a estação acionada, uma tentativa de impressão ou a configuração real do Retail.

### Fronteira dos eventos: não confundir fases

| Evento candidato | O que a evidência permite afirmar | O que NÃO comprova |
|---|---|---|
| `RETAIL_MARKETPLACE_PREORDER` | Pedido externo recebido para processamento | Impressão, comanda de produção concluída ou venda fiscal |
| `FORSALE_COMANDA_CREATED` | Comanda criada no fluxo de PDV/ForSale, segundo o modelo de integração | Despacho real à impressora da praça, nem papel |
| `NATIVE_FIRST_PRODUCTION_DISPATCH_CLAIM` | **Apenas hipótese de evento** que precisará conectar `DLV_IFO`, revisão nativa e estação com primeira tentativa | Não foi observado ou atestado nesta sessão |
| `FORSALE_SALE_EXPORT` | Uma exportação de vendas do ForSale não é, por si, envio de cozinha | Primeira via de produção |
| `TEKNISA_POST_SALE_DELIVERY_REPORT` | Relatório de entrega condicionado a `IDIMPAUTENTREG` do caixa | Primeira via da cozinha |
| `IFOOD_GP_HTTP_PRINT` / `IFOOD_GESTOR_IPC_PRINT` | Emissores de impressão **do iFood** instalados no host, potencialmente via Windows | Primeira via **Teknisa-nativa** |
| `ODHEN_BRIDGE_QUEUE_ACK` | Trabalho aceito/salvo na fila interna do periférico | Papel impresso, origem autenticada, inexistência de backup |
| `WINDOWS_PRINTED_JOB_STATUS` | Estado ou processamento na fila Windows | Papel físico ou identidade do pedido |

No host, `FosExp.exe` foi observado executando em `C:\Program Files\Teknisa Web\Bin\Client`. **Somente nome/processo/caminho foram observados; não existe prova de que este processo dispare a primeira via de produção**. Documentação de revisão do ForSale menciona rotinas de exportação de vendas, mas o vínculo com o executável do host não foi atestado. **Não identificar `FosExp` como impressor por inferência.**

O exame de uma configuração operacional do Retail foi **bloqueado pelos controles de segurança**. A investigação parou nessa fronteira: sem contornar o bloqueio, extrair conteúdo alternativo, inspecionar credenciais, nomes de clientes ou perturbar a produção. A configuração ativa da integração `IFO`, a revisão dos pedidos e a prova da primeira tentativa continuam **UNKNOWN**.

## Trabalho efetivamente codificado e testado

O módulo puro `tools/comandas_native_first_dispatch_lineage_v1_offline.cjs` introduz **identidade do evento como obrigação**, e não apenas um hash genérico:
- rejeita pré-pedido, comanda criada, exportação, relatório, impressão GP/Gestor, recibo de fila Odhen e status `Printed` como prova de primeiro despacho;
- exige que qualquer alegação de primeiro despacho nativo informe origem `DLV_IFO`, revisão nativa, referência/fingerprint do componente, praça, identidade da primeira tentativa e conciliação de cancelamentos;
- mantém `actual_first_native_print_event_proven=false`, `physical_paper_proven=false` e `can_authorize_cutover=false`, mesmo quando um fixture inventa todos os campos.

A revisão `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs` agora exige essa trilha tipada **além** dos outros gates de impressoras, sequência, Reader, fiscal, fila e backup. A transição retorna HOLD se for apresentada evidência de fase errada.

**Prova isolada no Foxxy:** `26/26` testes do novo módulo e `70/70` testes do contrato global PASS no checkout descartável `d7a37a8150d1147329c19cea35639fe2b8d7a835`; `23/23` testes duplo iFood e `21/21` relatório Teknisa mantiveram PASS. Os casos usam dados sintéticos, portanto **não provam integração viva ou primeira via física**. A CI hospedada do HEAD final precisa ser conferida separadamente.

## Próxima investigação capaz de resolver o bloqueio

A prova mínima necessária não é imprimir um pedido adicional nem desligar nada. É identificar, em **fonte permitida do conector iFood/Retail/ForSale da unidade** ou em diagnóstico autorizado pelo fornecedor:
1. **Entrada do pedido marketplace** — componente/versão responsável, origem `IFO`/`DLV_IFO`, referência de pedido nativo e revisão;
2. **Momento de geração de comanda ForSale** e transição para **evento de primeira produção**, com componente ou função específica e resultado observado;
3. **Destino principal, destino reserva e exclusividade** da tentativa de imprimir a via antiga por estação; provar se a mesma fila serve mesa, balcão ou fiscal;
4. **Mecanismo cirúrgico de supressão** daquela via de integração, sem afetar os outros atendimentos ou o acompanhamento fiscal;
5. **Backlog antigo e reversão** antes de qualquer piloto físico, com persistência da sequência TATÁ e reconciliação de tentativas ambíguas.

Se o fornecedor não expuser o evento internamente, o plano alternativo é fazer **correlação read-only autorizada**, por um único pedido real supervisionado, da revisão nativa do Reader com a tentativa específica de impressão da produção no equipamento aprovado, sem solicitar segunda via nem mexer em fila/spooler. Esse plano continua dependente da autorização operacional específica e do mecanismo seguro, não foi executado.

### Provas e status

- **Fonte canônica VÉRTICE 2.2** revalidada em `vertice-active`; método publicado `0.7.0-alpha1`.
- **PR #127** permanece `OPEN/DRAFT/HOLD`, sem merge/deploy.
- **NÃO realizado:** impressora virtual, chamada `POST /print`, mudança de parâmetro do Retail, desvio de NUL, reinício serviço, alterações de fila, cancelamento de impressão, SQL, fiscal, consumo da sequência TATÁ ou captura de pedido de cliente.
- **Limite real:** o primeiro disparo da produção `DLV_IFO` **ainda não está atestado**, logo não anunciar o projeto como 10/10 operacional.

### Fontes

- https://www.teknisa.com/api
- https://www.teknisa.com/produtos/retail/delivery
- https://ead.teknisa.com/wp-content/uploads/2025/11/Manual-Integracao-Teknisa-iFood.pdf
- https://universidade.teknisa.com/wp-content/uploads/2025/04/01_MANUAL_INTEGRACOES-MARKETPLACES_V1.pdf
- https://pt.scribd.com/document/894646438/Manual-iFood (reprodução de edição anterior; contextual, não prova da unidade)
