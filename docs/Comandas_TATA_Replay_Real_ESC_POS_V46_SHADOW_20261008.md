# Comandas de produção e conferência — prova V4.6 com pedidos reais (SHADOW)

**Estado:** replay factual arquivado + renderer ESC/POS de prova OFFLINE. Não faz leitura do caixa em tempo real, não transmite, não corta papel, não instala driver, não altera fiscal/estoque nem impressão atual.
**Data:** 2026-10-08.
**Master visual:** Figma produção V4.4 (node 30-2) e conferência V4.3 (node 20-2), arquivo nEjHuoJg2dMOqOzyutxXZ4.

## Fontes de pedidos reais, não sintéticos

**Caso A: pedido iFood real observado de 04/10, provado em 05/10.**
Fontes originais já arquivadas no DeliveryOS:
- data/tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json: identidade real CDARVPROD e roteamento atual para quatro linhas;
- data/tata_reader_real_order_observation_sanitized_20261005_v1.json: nenhuma observação de item encontrada nas superfícies inspecionadas; observação geral contém metadados de pagamento/cancelamento, que NÃO entram na impressão;
- data/tata_reader_real_order_packaging_reference_20261005_v3.json: comprova especificamente 3 Combinados Kids em três caixas 750, Edamame em 650 selada, Nasu no Misso em 650 selada e Sushi de Unagui em 240; total seis caixas;
- data/tata_reader_real_order_unified_replay_success_20261005_v2.json: replay de roteamento entre COZINHA/BALCAOSUSHI1, 3 Kit Kids, 1 Kit Quente e sequência TATÁ 001 em ESCOPO ISOLADO, não autoriza sequência live.
- data/packaging_source_lock_v3.json: captura da fonte de embalagem do TATÁ Academia; **para essa composição exata** mediu-se 1 sacola G externa com quente/frio separados internamente. Nunca generalizar para qualquer pedido misto.

Caso A: quatro linhas vendidas e seis unidades; seis caixas físicas; dois tíquetes de produção (COZINHA e BALCAOSUSHI1) e uma conferência. Kit é somente referência arquivada exata; NÃO foram usados os componentes do registro transitório de kits para fazer consumo/CMV.

**Caso B: pedido iFood real de 05/10 com uma regra de embalagem pendente.**
Fonte: data/tata_reader_post_cutover_first_live_order_20261005_v1.json; inclui 2 COMB EXEC SUSHI SALMAO, 2 COCA COLA ZERO 350ML e 2 URAMAKI EBITEN. A caixa exata do COMB EXEC está desconhecida nesse registro; também faltam a prova das observações de item e um plano completo de produção compatível. Resultado: todos os itens continuam visíveis em "EMBALAGEM A CONFERIR", sem sacola/kit inventados. Este pedido NÃO recebe arquivo físico imprimível.

Outros exemplos históricos de 20/06 a 01/07 estão documentados em docs/Relatorio_Evidencia_Composicao_Real_12_Janelas.md: 3.526 pedidos, mas o relatório agregado não é por si só um payload completo apto a gerar comanda atual. Recusar equivalência automática.

## Mudanças técnicas

- src/production/operationalTicketsV45.ts: preserva o motor e acrescenta suporte a modelos numéricos "650 selada"; divisão em C1/C2/C3 se, E SOMENTE SE, produto é comprovadamente combinado fechado, quantidade total coincide com número de caixas e a fonte atesta cada caixa física. Agrupamentos complexos sem prova permanecem UNKNOWN. A conferência herda os IDs de produção apenas quando iguais em todas as praças.
- src/production/operationalTicketEscposV46.ts: layout textual Epson 80mm **não calibrado**, Fonte B 64 colunas pressupostas, produto em maiúsculas numa linha, sequência no canto direito, caixa/operador, kit+sacola compactos, observação junto ao item. Linhas excessivas ou caracteres sem encoding confirmado bloqueiam o arquivo inteiro; nunca cortam o nome. Sem GS V de corte, spooler ou saída de dispositivo.
- tools/verificar_real_order_tickets_v46.js: reconcilia os arquivos archivados por identidade e nomes/códigos, dois casos reais, prova de regressão e fallback.
- tools/verificar_operational_escpos_v46.js: 12 testes físicos-simulados de organização, 64 colunas, quantidades, operador, kit, complementos, sequência, caracteres e bloqueio.
- tools/gerar_provas_termicas_v46.js: gera somente 3 arquivos .escpos e .txt de prova no diretório temporário da máquina mais manifesto SHA256, sem impressora. Os arquivos são EXPRESSAMENTE TESTE e NÃO PRODUZIR. Não fazem parte do fluxo live.
- package.json: comandos "verificar:tickets-reais-v46" e "gerar:provas-termicas-v46:offline".

## Portões e limites

CODE_READY + TEST_PASS de simulação NÃO são nem DEVICE_CALIBRATED nem WORLD_PROVEN.

1. Revalidar modelo exato, largura de mídia, dots imprimíveis, fonte A/B, codepage, margens, densidade, corte e transporte em cada Epson.
2. O cadastro de calibração do Itaim em data/production_printer_calibration_registry_v1.json ainda marca mídia real e acentuação como UNKNOWN; último teste documentado aponta TCP da DELIVERY SUSHI 1 indisponível. Não enviar bytes para testar indiscriminadamente.
3. O renderer ESC/POS textual é aproximação funcional, NÃO foi comprovado idêntico ao Figma condensado. Para paridade pixel a pixel, ainda requer raster ou medição física efetiva.
4. O conector em tempo real que converte TataComandaReader/TEKNISA para o contrato V4.5 ainda não está ligado. Exige materializar source_items e resource_input do MESMO pedido/evento, comprovar modificadores, revisão, roteamento, ID canônico e idempotência.
5. Finalizações frias só podem aparecer quando houver ficha HUMAN_CONFIRMED_RULE / LOCAL_RECIPE_VALIDATED / REAL_OBSERVED com source_ref, não por ingredientes extraídos do cardápio.
6. Quatro nomes de produtos extensos identificados na auditoria do Figma precisam de aliases aprovados, ou devem bloquear a via física.
7. Prova física deve ser autorizada de forma específica e feita por uma janela controlada com a equipe, sem cutover. Critérios: nenhuma perda de item/modificador, caixas não inventadas, leitura sob pico, quantidade/peças coerentes, rubrica com espaço real, largura/corte, bobina e tempo de conferência medidos.

**Proibido neste estágio:** conectar impressão automática, fazer merge/deploy/cutover, ler banco live sem autorização específica, promover heurística histórica a regra humana atual, fazer retrigger automático depois de efeito de impressão ambíguo.

Comandos a executar na branch isolada:
- npm run verificar:tickets-operacionais-v45
- npm run verificar:tickets-reais-v46
- npm run gerar:provas-termicas-v46:offline
- npm run verificar:production-ticket-v2
- npm run verificar:resource-consumption

Rollback: não usar nenhum módulo V4.6; os motores, drivers e prints operacionais existentes permanecem inalterados.
