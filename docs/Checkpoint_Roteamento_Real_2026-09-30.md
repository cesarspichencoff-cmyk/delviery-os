# Checkpoint — roteamento real Odhen/Teknisa — 2026-09-30

## Estado

Branch de trabalho: `fix/odhen-routing-config-proof-20260930`.

Nenhuma mudança foi promovida para produção. Nenhum print, write no Odhen/Teknisa, ação fiscal, instalação de watcher/serviço ou cutover foi habilitado.

## PROVEN

- Cadastro atual de 463 produtos possui rota de produção configurada para todos os produtos.
- `9.05.05.080.00 — COMB EXEC SUSHI SALMAO` roteia somente para `00009 BALCAOSUSHI1 → 192.168.0.142`.
- A amostra real exportada de Executivo não sustenta atribuição a `.153`; Composição Padrão/Local vazias e Grupo de Produto Promocional sem esse produto foram observados na investigação.
- `9.15.00.075.00 — COMBINADO SALMAO 1 PESSOA` roteia para duas impressoras:
  - `00009 BALCAOSUSHI1 → 192.168.0.142`
  - `00003 DELIVERY SUSHI 1 → 192.168.0.153`
- Export real `Manuteno-de-Venda---Itens 2.xlsx` contém `COMBINADO SALMAO 1 PESSOA ×1`, total R$ 109,00. SHA-256: `f10d2e85689861ce5e61f5f86151dd8b5dfc43f74ed98afe30dee2d4c629cfa0`.
- O resolver puro `projectExpectedRouting` foi executado fora da loja contra essa amostra/configuração relevante e retornou `.142 + .153`, `ready=true`, sem efeitos.
- A cadeia de código preparada foi simplificada para o menor contrato necessário:
  `Odhen raw → normalizeOdhenRouting → product CDPRODUTO → projectExpectedRouting → printer code/name/IP`.
- `normalizeOdhenRouting` não exige observações de cliente/pedido; para roteamento, lê somente `NRCOMANDA + CDPRODUTO + NMPRODUTO + QTPRODCOMVEN` e não retém payload bruto/PII.
- O resolver agora falha fechado para pedido vazio, quantidade inválida, índice de item duplicado, código de impressora duplicado, alvo de rota duplicado e mistura de configurações de lojas diferentes.
- A auditoria do cadastro confirma coerência entre uso real e flags: somente `00002/00003/00004/00006/00007/00009` aparecem nas 463 rotas e são exatamente as impressoras marcadas `used_by_products=true`.
- Harness preparado: `tools/projetar_odhen_routing_stdin_v1.js` recebe snapshot JSON por stdin e devolve apenas a projeção minimizada, sem persistir o bruto.
- O export real de Produtos por Loja traz os códigos em formato compacto de 10 caracteres. A normalização determinística `1-2-2-3-2` foi conferida contra os 463 produtos: **463/463 códigos casaram**, com 0 faltantes e 0 extras; 19 códigos alfanuméricos também casaram. O resolver foi então executado contra os **463 códigos crus do export**: `ready=true` em 463/463 e 0 bloqueios. Ele aceita tanto `9150007500` quanto `9.15.00.075.00`. Evidência: `data/retail_product_code_format_proof_20260930.json`.

## APRIMORAMENTOS OFFLINE PREPARADOS

- `tools/gerar_retail_routing_config_v1.js`: regenera deterministicamente os mapas de produto/impressora a partir dos dois XLS oficiais do Retail, valida cabeçalhos, duplicidades, IPs e falha fechado se aparecer Puxa ou Backup ativo que a V1 não modele.
- `tools/verificar_routing_config_drift_v1.js`: compara um snapshot novo com a baseline atual e marca qualquer mudança material de produto, rota, impressora, IP, porta, servidor ou unidade; a política é bloquear roteamento live até revisão quando houver drift.
- `tools/verificar_retail_routing_config_tooling_v1.js`: cobre geração, rota dupla, detecção de drift e bloqueio de Puxa.
- Todos os novos scripts JS passaram por validação sintática nesta sessão. A execução integrada com `xlsx` ainda depende de um checkout com as dependências do projeto instaladas; não é declarada como TEST_PASS completo.

## NÃO PROVADO

- O XLS de Itens não expõe a identidade/número/hora da segunda venda; portanto a amostra comprova item real + roteamento configurado, não correlação temporal com um append físico específico de log.
- Roteamento esperado não prova que o papel saiu fisicamente.
- Ainda não foi executada leitura live de pedido real pelo endpoint/runtime Odhen nesta branch.
- Ainda não foi provado um vínculo live `pedido real lido diretamente → CDPRODUTO → projeção de impressoras` sem export manual.

## Próximo gate correto

`LIVE_READ_ONLY_ORDER_TO_EXPECTED_ROUTE`

Objetivo: em ambiente autorizado da loja, ler um snapshot minimizado e estritamente read-only de um pedido Odhen real contendo `NRCOMANDA + CDPRODUTO + NMPRODUTO + QTPRODCOMVEN`; passar diretamente por `normalizeOdhenRouting` e `projectExpectedRouting`; comparar a projeção com o cadastro atual. Observações de cliente não fazem parte deste gate.

A prova deve continuar separando:
- rota configurada esperada;
- ocorrência física real de impressão.

Até esse gate existir, nenhuma inferência por tamanho de arquivo IMP deve ser promovida a verdade de pedido.


## AUDITORIA DE PRAÇAS x ROTEAMENTO REAL

A auditoria offline das 8 praças lógicas contra o cadastro atual do Retail foi concluída sem alterar seed ou motor.

- 199 itens no seed.
- 463 produtos no Retail.
- 94 correspondências únicas determinísticas.
- 1 correspondência ambígua.
- 104 itens sem correspondência conservadora; nenhuma correspondência fuzzy foi promovida a fato.
- Invariante preservado: `LOGICAL_PLAZA != PHYSICAL_PRINTER_ROUTE`.
- O candidato `Tartar de Atum Spicy` foi **resolvido** por confirmação operacional de César: pertence a **Sushi Quentes** (`enrolados_quentes`).
- A fonte regenerável e o seed foram corrigidos; não houve promoção baseada apenas em topologia física.
- `Combinado Executivo Sushi Salmão` permanece exceção operacional conhecida e não deve ser normalizado pelo perfil dominante.
- `Missoshiro` possui dois códigos Retail, ambos em `00002 COZINHA`; identidade é ambígua, topologia sustenta a praça atual.

Evidências:
- `data/praca_routing_audit_snapshot_20260930.json`
- `data/praca_routing_review_candidates_v1.json`
- `docs/Auditoria_Pracas_vs_Roteamento_Real_2026-09-30.md`

Automação:
- o gerador Retail pode emitir catálogo de produtos com `--catalog-out`;
- `tools/auditar_pracas_vs_retail_v1.js` refaz a auditoria de forma determinística;
- `tools/verificar_pracas_vs_retail_v1.js` trava o comportamento esperado.

- Após as confirmações operacionais, o builder foi executado em memória contra `data/cardapio_fonte.txt` e regenerou **199/199 itens sem drift** em relação ao seed commitado.


## COBERTURA DO DELIVERY ATIVO — 30/09/2026

Cruzamento do relatório real de vendas do dia com o cadastro atual de roteamento:

- 120 SKUs distintos de delivery;
- 1.476 unidades;
- 116/120 SKUs possuem rota física direta = 96,67%;
- 1.439/1.476 unidades possuem rota física direta = 97,49%;
- 120/120 SKUs possuem praça lógica resolvida:
  - 68 SKUs / 977 unidades por correspondência exata com o seed;
  - 52 SKUs / 499 unidades por regra determinística marcada como inferência.

Quatro itens vendidos no delivery não aparecem no snapshot atual de Produtos por Loja:

- `8201100100 COOKIE NUTELLA` — 13 un;
- `9750003100 GENGIBRE PORÇÃO` — 17 un;
- `9750003000 WASABI` — 6 un;
- `9750003200 TARE` — 1 un.

Total: 4 SKUs / 37 unidades.

César confirmou operacionalmente que os quatro são **itens complementares/montados sem comanda própria de produção**. Estado promovido para `NO_OWN_PRODUCTION_TICKET`, registrado em `data/non_production_delivery_items_v1.json`.

Cobertura final do delivery observado:
- rota física direta: 116/120 SKUs = 96,67%;
- comportamento de produção resolvido: **120/120 SKUs = 100%**;
- unidades com comportamento de produção resolvido: **1.476/1.476 = 100%**;
- gaps físicos abertos: **0**.

Gate preparado:

- `tools/auditar_delivery_active_routing_coverage_v1.js`
- `tools/verificar_delivery_active_routing_coverage_v1.js`
- `data/active_delivery_routing_coverage_20260930.json`
- `docs/Auditoria_Cobertura_Delivery_Ativo_2026-09-30.md`

Comportamento travado: em pedido misto com item roteado + item humano-confirmado como `NO_OWN_PRODUCTION_TICKET`, o motor preserva as rotas conhecidas, atribui zero destinos ao complemento e mantém `ready=true`. Código ausente sem confirmação explícita continua `ready=false`.


## ÚNICO GATE MATERIAL RESTANTE

`LIVE_READ_ONLY_ORDER_TO_EXPECTED_ROUTE`

Comportamento esperado já coberto para os produtos observados:
- produto com rota → impressora(s) configurada(s);
- complemento sem comanda própria → zero impressoras, estado explícito `NO_OWN_PRODUCTION_TICKET`;
- código desconhecido sem prova → bloqueio fail-closed.

O que ainda falta provar no ambiente real:
`pedido Odhen real → NRCOMANDA + CDPRODUTO/NMPRODUTO/QTPRODCOMVEN → normalização → comportamento de produção esperado`.

Nenhum cutover, impressão, write ou ação fiscal está autorizado.


## EXPANSÃO — IMPRESSÃO ROBUSTA + RECURSOS/CMV — 2026-10-01

A missão foi ampliada sem ativar efeitos físicos.

### Impressão

Preparado:

- `data/production_printer_calibration_registry_v1.json`
- `src/production/productionPrintPlan.ts`
- `src/production/productionTicketV2.ts`
- `src/production/tataOsPrintHandoff.ts`
- `tools/production_printer_preflight_readonly.ps1`

Decisões:

- produto→impressora atual continua sendo autoridade de roteamento;
- tabela fixa almoço/jantar do Ticket V1 foi circuit-broken;
- DeliveryOS decide conteúdo/destino;
- execução confiável deve reutilizar o contrato provider-neutral do TATÁ OS;
- largura real 58/80, fila, driver, transporte, acentos, corte e observabilidade continuam gate por impressora;
- nenhuma submissão física foi autorizada.

### Embalagem e kits

O motor atual do TATÁ Academia foi copiado byte a byte para:

`vendor/tata_academia_packaging_current.js`

Source blob travado:
`d44e25e96e8e640a50cb087b0eea6fdbea1d8706`.

Fonte/proveniência:
`data/packaging_source_lock_v1.json`.

Prova executada em memória:
- 2 duplas → 1 caixa 450 → 1 sacola P;
- 4 temakis → 1 Kit p/2;
- funções `packComanda/kitVerdict/bagVerdict/bagSizeVerdict` carregadas.

Composição dos seis kits:
`data/kit_component_registry_v1.json`.

CLI preparado:
`tools/projetar_packaging_order_v1.js`.

### Consumo e relatórios

Preparado:

- `src/production/resourceConsumption.ts`
- `src/production/resourceCosting.ts`
- `src/production/operationalResourceReport.ts`
- `data/resource_cost_registry_v1.json`

O ledger distingue:
- item vendido;
- caixa;
- sacola;
- kit;
- componente de kit;
- complemento;
- dependência de cozinha;
- ingrediente de receita;
- item de estoque direto.

Semântica:
`THEORETICAL_EXPECTED_CONSUMPTION != STOCK_WRITE`.

CMV exige base explícita por produto:
- `RECIPE_BOM`;
- `DIRECT_STOCK_ITEM`;
- `NON_STOCK`;
- caso contrário permanece bloqueado.

### Receita/BOM

Registro:
`data/recipe_bom_registry_v1.json`.

A documentação pública da Teknisa prova a existência de `Receita Utilizada` com ingrediente, per capita, unidade, custo unitário e custo total, além de receita Padrão/Local/por Serviço.

Isso virou a fonte candidata preferencial para BOM.

Ainda NÃO existe export real da unidade que prove o shape de ingestão. Não criar parser final até uma amostra real.

### Documento arquitetural

`docs/Impressao_Producao_Robusta_Consumo_CMV_V1.md`.

### Gates abertos

1. `LIVE_READ_ONLY_ORDER_TO_EXPECTED_ROUTE`.
2. preflight real das seis Epson.
3. calibração física individual de papel/render/corte/status.
4. uma amostra física controlada por impressora antes de qualquer cutover.
5. uma amostra real de `Receita Utilizada` para promover o importador de BOM.
6. custos reais/provados para promover custo teórico.
7. estoque/baixa real permanece fora de autorização.


## CORREÇÃO SETORIAL E NÚCLEO ÚNICO — 2026-10-01

Feedback humano incorporado:

- não haverá motores autônomos de Academia / DeliveryOS / TATÁ OS;
- o destino canônico é um único núcleo compartilhado no TATÁ OS, branch reversível `feature/unified-tata-core-20261001`;
- a cópia do motor de embalagem do Academia neste branch foi rebaixada para `MIGRATION_SNAPSHOT_ONLY_NOT_RUNTIME_AUTHORITY`;
- produção recebe apenas sua informação útil:
  - destino;
  - caixa de montagem;
  - item;
  - ingrediente/componente ligado ao item;
  - observação ligada ao item;
  - check da própria praça;
- ingredientes estimados por internet/cardápio NÃO podem virar instrução de produção;
- DeliveryOS faz conferência de caixas/sacolas/kits/complementos em tela;
- não criar segunda comanda física para montagem/conferência;
- estimativa de consumo por descrição + baseline externo + venda mensal é permitida como hipótese operacional;
- relato “quanto vocês usam?” calibra a hipótese, mas não valida sozinho a receita.

Código de `productionTicketV2.ts` foi ajustado para carregar `prep_ingredients` por item, não como bloco agregado da comanda.

Nenhum efeito físico, impressão, baixa de estoque ou cutover foi habilitado.
