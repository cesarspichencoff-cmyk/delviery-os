# DeliveryOS — Produção e Conferência V4.5 (SHADOW)

Data: 2026-10-08
Estado: CODE_READY / SHADOW_TEST_PASS; NÃO IMPRESSO, NÃO DEPLOYADO, NÃO CONECTADO A PEDIDOS REAIS.
Autoridade final: César. Figma aprovado não é autorização de produção.

## Referências visuais

- Produção V4.4: https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4?node-id=30-2
- Conferência V4.3: https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4?node-id=20-2

## Decisões operacionais preservadas

Compartilhadas: bobina 80 mm; largura útil estimada em 72 mm (a calibrar na Epson real); iFood, TEKNISA e sequência TATÁ à direita; produto completo em maiúsculas e UMA linha; quantidade com máxima prioridade; sem logo/desenho; nenhuma abreviação ou truncamento não aprovado; observação junto do item. A calibração física da linha única ainda não ocorreu.

Produção: praça e roteamento definidos pelo motor atual; caixa discreta; quantidade e produto dominantes; dependência da cozinha só com projeção comprovada; FINALIZAR só com regra local explícita de finalidade COLD_FINISHING, prova e fonte. Descrição do cardápio e BOM de CMV não são ficha de finalização.

Conferência: modelos numéricos de caixa 240, 450, 650, 750, 1000, 1500, 1600; identificação C1/C2 por grupo físico comprovado; campo manuscrito Op. ________ por caixa; kit por nome e quantidade, sem componentes internos; somente GARI, WASABI ou TARE se explícitos no pedido; sacola/kit compactos; sem campos de lacre, envio ou assinatura geral. Combinado fechado não compartilha caixa com extra. Quando a associação é incerta, manter o item visível em lista sem caixa comprovada.

Quantidade de itens diferente de quantidade de peças: 2 unidades de URAMAKI SKIN (8) equivalem a 2 produtos que contêm 8 peças cada; o motor não transforma isso em 8 ou 16 produtos.

## O que entrou no código

- src/production/operationalTicketsV45.ts: contrato side-effect-free deliveryos.operational-tickets.v45.shadow.v1, com mapeamento por índice/código do item.
- projectOperationalTicketsFromMotorsV45: invoca projectOrderResources existente e une o resultado ao production_plan existente; não implementa motor paralelo de caixa/sacola/kit.
- projectOperationalTicketsV45: aceita projeções já calculadas e valida correspondência com itens de origem.
- tools/projetar_operational_tickets_v45_stdin.js: recebe snapshot JSON no stdin e emite JSON, sem acessar impressora ou rede.
- tools/verificar_operational_tickets_v45.js: testes de regressão sem efeito físico.

Para testar, no repositório: npm run verificar:tickets-operacionais-v45

Para projetar um snapshot JSON ANONIMIZADO: npm run projetar:tickets-operacionais-v45:shadow < snapshot-anonimizado.json

Entrada da projeção automática: order_id, source_items completos (índice único, código, nome, quantidade, observações e papel físico comprovado), production_plan, resource_input; opcionalmente finishing_rules, approved_aliases, kitchen_needs_by_fingerprint e revision. Os source_items e resource_input devem partir do MESMO evento real. Esta branch ainda não implementa o consumidor de eventos de pedidos.

## Evidência

- TypeScript compilou.
- 26/26 testes de integração/segurança passaram.
- Testes existentes production-ticket-v2, resource-consumption e production-ticket-escpos-v34 passaram.
- ready_for_semantic_preview indica apenas possibilidade de inspecionar dados, nunca liberação de impressão.
- ready_for_automatic_operational_print é sempre false.
- Efeitos fixos: print=false; spooler_write=false; odhen_write=false; stock_write=false.

## Bloqueios e falhas deliberadas

- A ligação de source_items a eventos reais do iFood/TEKNISA/Odhen ainda não está conectada. O perfil DeliveryOS documenta uma origem sintética para parte do motor de praça; não transformá-la em prova real.
- Quatro rótulos do catálogo de 199 itens ainda precisam de nome operacional curto aprovado. Sem isso, manter nome completo e impedir truncamento na camada física futura.
- A relação exata CAIXA → SACOLA não tem prova completa no contrato de recursos atual; não inferir essa alocação.
- O componente finalizador de pratos frios só aparece quando existir regra COLD_FINISHING de fonte validada; os ingredientes de exemplo no Figma não são receita aprovada.
- A Epson TM-T20 instalada, fonte/acentos, 80 mm/72 mm, densidade, pontos, pós-corte e legibilidade não foram testados fisicamente.
- O contrato semântico não é ainda o renderer ESC/POS/raster e não modifica o fluxo de impressão existente.
- Nenhuma integração ao spooler, estoque, fiscal, corte ou produção foi autorizada/feita.

## Próxima sequência técnica

1. Bridge somente leitura de evento real completo com itens, observações e revisão, sem perda de identidade dos itens.
2. Renderizador físico TESTE da V4.5 em ESC/POS/raster, reproduzindo o Figma em bobina real, sem spooler de produção.
3. Prova física controlada na Epson, com ticket explicitamente TESTE - NÃO PRODUZIR e autorização operacional, medindo largura/altura, acentos, nomes longos, densidade, velocidade, corte e campo Op.
4. Piloto com pedidos reais anonimizados e equipe: quantidade de produtos/peças, observações, extras de combinado, pratos frios, cozinha, sacolas, kits, acompanhantes e reimpressão; registrar tempo, erros e uso de papel.
5. Depois dos testes e aceite humano, discutir ativação limitada e reversível. Não declarar WORLD_PROVEN ou 10/10 antes disso.

Rollback: nenhum arquivo de produção existente foi substituído; deixar a nova projeção desconectada não altera a operação.
