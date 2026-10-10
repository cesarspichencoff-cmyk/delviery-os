# Comandas V7.1 — diferença pontual do motor e bloqueio semântico direto

**Data:** 10/10/2026. **Missão:** reaproveitar a cadeia já construída e impedir a liberação de bytes ESC/POS a partir de uma projeção semanticamente recusada. DRAFT/SHADOW, nenhum efeito operacional.

## 1. Motor EXISTENTE; duas correções exatas isoladas

Fonte vigente e preservada no DeliveryOS: `tata-academia/evolucao/v33-product-pass:lib/packaging-current.js`, blob Git `3167c309f02a0ad5a84fb43043b8866e3bee873c`. **Não reescrito, não substituído, não repinado neste PR.**

A fonte humana preexistente `content-source/human-current/packaging_kids_alone_2026-10-07_cesar.md` (branch `docs/kids-alone-sacola-m-20261007`, já documentada antes desta fase) comprova **apenas** um COMBINADO KIDS como único item = caixa 750 + 1 Sacola M + 1 Kit Kids; não estender a dois Kids ou itens extras. A fonte operacional do pedido 1265 comprova `SASHIMI TATAKI DE SALMAO` como família `dupla`, praça `duplas` (não `sashimi`). A regra anterior de kits permite `1 temaki + 1 dupla = Kit p/1` mas **não** `1 temaki + 1 sashimi = Kit p/1`.

Para não alterar silenciosamente o runtime e para preservar o motor atual, foi aberto **[TATÁ Academia PR #50 DRAFT](https://github.com/cesarspichencoff-cmyk/tata-academia/pull/50)**, a partir da branch documental existente. Modifica apenas `lib/packaging-current.js` e a prova dirigida: 
- Kids exato recebe Sacola M e `size_source_ref=human:cesar:2026-10-07:1-combinado-kids-alone-sacola-m`; mantém kits existentes.
- Tataki com classificação atual Dupla/Duplas recebe a categoria Dupla para caixa e kit; sem essa classificação, resultado UNKNOWN em vez de classificar pelo prefixo SASHIMI.
- Não introduz outra regra genérica de sacola, categoria, mistura de kits ou embalagem.

**Prova:** [CI dirigida Academy #38070912937](https://github.com/cesarspichencoff-cmyk/tata-academia/actions/runs/38070912937) SUCCESS, `THERMAL_PACKAGING_KIDS_TATAKI: 16/16 PASS`, matriz histórica `124/124 asserções`, `kits-logic-v2: ok`, `THERMAL_PACKAGING_NO_EFFECTS=PASS`. **Portões amplo [#38070912990](https://github.com/cesarspichencoff-cmyk/tata-academia/actions/runs/38070912990) = FAILURE**: `BACKEND CLOUDFLARE:94/96`, comparação do hash histórico `data/app-data.json` e cadeia de runtime AOT; não atribuir essas falhas ao motor sem comparação independente com baseline. Nenhum merge ou deploy.

**DEPENDÊNCIA:** o DeliveryOS permanece apontando para o **blob antigo `3167c309`**. Não executar com novo blob sem teste da ponte V6.3/V6.8 e troca controlada do source pin; não aceitar duas versões tácitas.

## 2. Comandas V7.1: eliminação de falsa prévia ESC/POS

A Issue [#25](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/25) havia registrado que as funções diretas do renderer `operationalTicketEscposV46.ts` validavam layout e encoding, porém não recusavam a flag `ready_for_semantic_preview=false` do projector, embora o **bundle V5.10 já soubesse bloquear** por estação.

Correção mínima no **mesmo renderer**, sem substituir o bundle:
- `renderProductionTicketProofV46`: se a origem da estação não está aprovada, `STATION_SEMANTIC_NOT_READY`, `bytes=[]`, `byte_count=0`, preview negada.
- `renderConferenceTicketProofV46`: se a conferência não está aprovada, `CONFERENCE_SEMANTIC_NOT_READY`, zero bytes.
- `renderOperationalTicketsProofV46`: se o aggregate da fonte tem `ready_for_semantic_preview !== true` **ou** qualquer `blocking_reasons`, aplicar veto `GLOBAL_SOURCE_SEMANTIC_BLOCKED` a todas as saídas (mesmo que flags de estação contradigam). Isso impede bypass por chamadas diretas ao renderer.
- Manter `text_trace` exclusivamente para diagnóstico, sem legitimá-lo como autorização de impressão. `ready_for_operational_print=false`, efeitos físicos sempre false.
- **Não alterado**: motor de caixas, cálculo de kits, cozinha SKIN, roteamento de praças, histórico Q-016, fiscal, watcher Windows, spooler ou impressoras.

**Prova adversarial:** `tools/verificar_renderer_semantico_direto_v71.js`, **12/12**: replay histórico preservou bytes **340/538/849**; bloqueios local de Cozinha/Sushi e Conferência; bloqueio global com flags locais verdadeiras; presença de `SOLD_ITEM_MISMATCH` real no projector; array global de razões ausente; incoerências de flag; preservação de source e rastros sem bytes; todos os efeitos continuam falsos.

**Regressão identificada e corrigida:** teste de layout V6.2 sintético omitia sua flag semântica; o novo guarda corretamente recusou essa fixture. Ajustado **somente** o contrato explícito de fixture sintética, sem neutralizar testes negativos de caixa desconhecida. Primeiro CI após código era RED no V6.2 e foi reparado na fixture com prova posterior.

**CI final:** [run #38071145559](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38071145559) SUCCESS, `CONFERENCE_BOX_GROUPING_V62=8/8 PASS`, `thermal-semantic-gate-v510:25/25 PASS`, `THERMAL_DIRECT_RENDERER_SEMANTIC_V71=12/12 NO_PRINT_NO_SPOOLER` e matrizes ESC/POS verdes.

## 3. Próximos pontos REAIS, sem reconstrução

1. Após PR #50 estar tecnicamente e humanamente apto à integração, revalidar **blob do motor e pin** na ponte do DeliveryOS, replay de casos históricos e novos pedidos — **não** repinar só porque PR dirigido passou.
2. Obter evidência passiva da **mesma revisão** do evento/decisão do serviço Windows e de `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN`. Ferramentas de probe existentes devem ser reutilizadas, sem coletor paralelo nem dados sensíveis no GitHub.
3. Estado humano de turno do Windows observado em 10/10 permanecia vencido. Contrato `valid_from_local` ainda não instalado; **não atualizar o turno por inferência de relógio**.
4. Replay completo SHADOW de pedido **atual** para Cozinha, Sushi e Conferência e validação final da impressora na **CAIXA Itaim** somente com autorização específica.
5. PR #38 DRAFT; Issue #35 permanece aberta até prova real, papel e aceite. Não fazer merge/deploy/print/seq/fiscal.

**Status:** correção de fonte do motor `CODE_READY+TARGETED_TEST_PASS` em PR #50 separado (Portões geral RED); renderer V7.1 `CODE_READY+FULL_THERMAL_CI_PASS` no PR #38. Ambos **não** `DEPLOYED/WORLD_PROVEN/HUMAN_ACCEPTED`.
