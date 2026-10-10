# Auditoria de reuso das comandas térmicas — 10/10/2026

**Missão:** evitar retrabalho na evolução Cozinha / Sushi / Conferência, preservando o motor de embalagens já feito no TATÁ Academia e as provas de mundo anteriores. **Somente inventário de evidências; nenhuma alteração de runtime, regra de produto, impressão ou serviço.** Este documento é um checkpoint de revisão no PR #38 DRAFT, não autorização para produção.

**Fonte verificada:** repositório `cesarspichencoff-cmyk/delviery-os`, PR #38, commit pré-auditoria `89efcefb5b7f8844971f0ee9ff54974216f11fc7`; PR #21 `c62f6ae26835d8acc9f74027a5721d68d144537b`; TATÁ Academia `evolucao/v33-product-pass:lib/packaging-current.js`, Git blob `3167c309f02a0ad5a84fb43043b8866e3bee873c`; TATÁ OS Unified Kit Core `packages/unified-restaurant-core/src/kits.ts`, blob `42d69fea73e830bd6517e1230a0ec4c7fc9737a4`. VÉRTICE `vertice-active:VERTICE_ENTRY.md` revalidado.

## 1. Componentes que JÁ EXISTEM — reutilizar, não reconstruir

| Camada | Artefato já implementado | Prova / fronteira |
| --- | --- | --- |
| Motor de caixas e sacolas | `tata-academia/lib/packaging-current.js`: agrupamento praça/compatibilidade/temperatura, caixas numéricas 240/450/650/750/1.000/1.500/1.600, sacolas P/M/G, embalagem e kits | Fonte atual verificada pelo **blob 3167c309**, não usar o `lib/packaging.js` histórico. Regra desconhecida = UNKNOWN; não promover extrapolação a fato |
| Ponte fonte → plano | `src/production/currentPackagingBridgeV63.ts`: recebe motor EXATO pinado; valida pertencimento, quantidade, praça, caixa física, múltiplos produtos na mesma caixa, sacolas por volume e kits | `verificar_ponte_embalagem_v63.js` e `verificar_coerencia_tres_vias_v64.js`; CI do PR #38 verde. **Não** é consumo permanente no serviço Windows |
| Caixa física nas três vias | `packagingCoherenceV64.ts`, `operationalTicketsV45.ts`, renderer SVG e `operationalTicketEscposV46.ts` | Replay V6.5, motor original executado sem substituição: **Cozinha 2 caixas / Sushi 4 / Conferência 6**; os três SVGs coincidem em SHA-256 com replay V6.2; uma quantidade 3 de Kids em **três caixas individuais** foi reconciliada também no ESC/POS |
| Kits e recursos | TATÁ OS Unified Kit Core de seis kits; `pinnedUnifiedKitsV66.ts` confere blob `42d69fea` e snapshot `29d91703`; `resourceConsumption.ts` | Snapshot está explicitamente **PINNED / NOT LIVE AUTHORITY**; integração offline PASS, não inventar novo motor de kits nem tratar snapshot como conexão produtiva |
| Dados de pedido e praças | `deliveryProductionJoin.ts`, `productionPrintPlan.ts`, `readerIngressV66.ts`, `stableReaderShadowPairV68.ts` | Identidade, quantidade, praça, print intent, observações, revisões e fingerprints validados em fixture. V6.6 **14/14**, V6.8 **17/17** no CI; cliente real v1 ainda não alimenta observações completas no par estável |
| Cozinha | `twoKitchenTicketsV47.ts`, `kitchenSeparatedOfflineBundleV47.ts`, `kitchenSushiQuenteScopeV49.ts`, regra SKIN confirmada | Duas naturezas distintas: preparações HOT/EBITEN/SHISO e pratos; **SKIN em lote**, sem comanda por pedido. V4.9 **24/24** no CI; cobertura das dependências para todos os produtos segue PARTIAL, não recalcular por nome |
| Observações | `annotationLinePlanV67.ts` / `operationalTicketEscposV46.ts` | Quebra legível sem perder negações/acentos e nexo com linha; V6.7 **7/7**; não repetir planejador V5.6 |
| Segurança Epson | `escposByteInspectorV51.js`; suites V5.7/V5.11, política `thermal_test_target_policy_v53.json` | Falha de `GS ! 0x22`, `ESC @` e `ESC t` corrigida no inspetor original (Issue #22 **CLOSED**); CI final V5.11 **256/256**. Não recriar gate de byte. ESC/POS real permanece sem paridade óptica final |
| CI/Governança | `.github/workflows/deliveryos-thermal-shadow-gate.yml`; PRs #21 e #38 | [CI completa PR #38 run 38055506053](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38055506053) SUCCESS. Issue #23 **CLOSED** após prova API+captura de tela de check obrigatório em uma branch-base anterior; não extrapolar proteção administrativa à branch de destino do PR #38 sem revalidação |
| Leitor Windows | `ContinuousService.v2.cs`, watcher v1, `live_shadow_consumer_loop_v1.cjs`, auditoria V6.9, revisão humana V7.0 | Inspeção **passiva real** CAIXA_MOOCA (10/10): `Running`, 1.187 eventos, 12 pares com revisões compatíveis, **0/12 ready**; CI V6.9 **10/10**, V7.0 **13/13**. Nenhuma das duas funções novas foi instalada no serviço |
| Impressão física existente | Prova de calibração **V5.3** na Epson **CAIXA Itaim**, fotografia analisada no PR #21, documento `Auditoria_Optica_CAIXA_V54_Foto_20261008.md` | **Uma folha de teste já saiu**, não dizer que nunca houve papel. Segunda comparação V5.4 e aceite visual final **não** aconteceram; impressão da versão operacional das três vias não foi provada |

## 2. Provas anteriores de pedido REAL — não repetir por desconhecimento

- Em 05/10 houve `PROVEN_MINIMIZED_REAL_ORDER_READ_WITH_CDARVPROD` e `PROVEN_EXACT_ORDER_OBSERVATION_SURFACE_SANITIZED`. O acesso foi autorizado, sem escrita e sem impressão.
- O pedido histórico de 04/10 tem identidade e quantidade real reconciliadas, com **6 caixas internas, 3 Kits Kids, 1 Kit Quente e 1 Sacola G**, esta última com encaixe/medição humana **do caso exato**. `data/tata_reader_real_order_unified_replay_success_20261005_v2.json` e `data/tata_reader_real_order_packaging_reference_20261005_v3.json`.
- Naquele pedido específico, as quatro linhas tinham `DSOBSDESCIT/DSOBSPEDDIGCMD/TXPRODCOMVEN` ausentes; a observação geral era metadado não produtivo e foi excluída. Isso **não prova** ausência de observações em pedidos novos.
- Replay de fonte histórica + motor pinado em V6.5/V6.6/V6.8 gerou as três vias em **SHADOW**. Não foi ainda prova de um evento/decisão V6.8 bruto novo **capturado e conciliado com observações da mesma revisão**.

## 3. GAPS REAIS, sem confundi-los com motor não feito

1. **Freshness/contrato do turno no Windows** — estado observado em CAIXA_MOOCA ainda era `DINNER 07/10`, vencido. `shiftHumanReviewV70.ts` é apenas revisão sem efeitos; watcher v2 não aplica `valid_from_local`. Precisa de cadeia autorizada e retroatividade impossível, sem inferir turno pelo relógio. Não renovar estado, reiniciar serviço ou processar pedidos automaticamente por esta auditoria.
2. **Par nativo de pedido atual com observações** — watcher/evento estável v1 não traz `DSOBSDESCIT`, `DSOBSPEDDIGCMD` nem `TXPRODCOMVEN`; o canal de leitura histórica já existe, mas falta **ligá-lo a ordem, item e snapshot_hash da mesma revisão** de modo passivo e autorizado. Reusar o probe existente, não criar outro coletor integral.
3. **Casos atuais de classificação/kit/bolsa** — revisão do `packaging-current.js` pinado identifica `categoryOf` classificando prefixo `SASHIMI` como categoria sashimi antes de respeitar a família específica; isso pode divergir do Tataki na praça Duplas. A regra de `soloOnePerson750` exclui `Kids`; não aplicar automaticamente uma regra genérica à sua sacola. Relatos de ensaios paralelos de 10/10 apontaram divergências em um Kids solo e uma composição Temaki+Tataki (incluindo kit UNKNOWN), com candidato isolado testado; **esses achados recentes não estão integrados nem atestados pelo HEAD do PR #38**. Precisam de **difference check e testes de casos exatos** contra fonte humana atual, não de novo motor.
4. **Risco semântico de prévia direta (Issue #25 OPEN)** — o renderer individual V4.6 não consulta `ready_for_semantic_preview` por si; o bundle V5.10 já contém portões de bloqueio em testes. Preservar proteção existente e verificar o caminho direto, sem afirmar defeito físico.
5. **Integrar execução SHADOW ao serviço e validar prova real** — a CLI V6.8 só lê arquivos explicitamente passados e exige pacote de origem proveniente da mesma revisão. É intencional. Nenhum novo motor de embalagem, kit, cálculo de caixas ou renderer precisa ser reconstruído.
6. **Papel/identidade visual/release** — falta segunda prova óptica e exame da versão final na fila **CAIXA Itaim** sob autorização humana; outras impressoras estão excluídas para teste. Não implantar, fazer merge, emitir fiscal, nem enviar bytes ao spooler até aceite específico.

## 4. Rota de menor retrabalho, nesta ordem

A. **Congelar/reutilizar** `packaging-current.js` blob `3167c309`, kit core pinado, ponte V6.3, ingress V6.6, par V6.8 e renderers existentes. Não voltar para `packaging.js` antigo nem `packaging_source_lock_v4.json` como versão atual: o lock v4 aponta blob anterior `6875c432`, enquanto a ponte V6.3 confere explicitamente `3167c309`.

B. **Difference check pequeno** dos casos Kids solo / Sashimi Tataki / composição com kits antes de aceitar qualquer nova versão do motor. Reaproveitar candidato de outra sessão **somente depois de conferir seu arquivo/SHA**; não assumir que já esteja instalado ou aprovado. Uma mudança em regra humana precisa de teste no repositório da fonte e no adaptador V6.3.

C. **Conexão passiva** de observação por item + origem e revisão exata com par atual de evento/decisão, usando ferramentas read-only já existentes; não renomear nem duplicar o watcher por conveniência.

D. **Prova SHADOW de um pedido real de revisão atual** até as vias Cozinha/Sushi/Conferência, mantendo bloqueios e nenhum efeito.

E. **Aceite físico e humano separado**, exclusivamente CAIXA Itaim, apenas com autorização específica de papel/efeitos. A operação produtiva continua em HOLD.

## 5. Fronteira do resultado

**PROVEN/CODE:** motor e regras atuais pinados, ponte, kit snapshot, 3 vias offline, decisão SKIN, primeira calibração CAIXA, auditores e CI de PR #38.  
**LAST_KNOWN_WORLD:** leitor CAIXA_MOOCA ligado e estado de turno vencido na inspeção de 10/10. Não presumir que o estado permanece idêntico agora.  
**UNKNOWN/OPEN:** correção de Kids/Tataki em origem canônica, revisão atual do pedido/observações, integração do executor à instância Windows, relação com CAIXA Itaim, segunda prova em papel e aceite operacional.  
**AUTORIZAÇÃO:** `NO_PRINT`, `NO_DEPLOY`, `NO_MERGE`, `NO_SERVICE_STATE_WRITE`, `NO_SEQUENCE_BIND`, `NO_FISCAL_ACTION`.

**Resultado da auditoria:** trabalho novo deve ocorrer **apenas nas fronteiras e diferenças comprovadas**; reaproveitar o motor e todas as provas existentes. Não marcar Issue #35 concluída por CI verde.
