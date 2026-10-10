# Comandas V6.8 — par de evento/decisão do leitor Windows (SHADOW)

**Em 10/10/2026.** PR #38, derivado do PR #21. Escopo executado: contrato puro, CLI de arquivos locais explicitamente fornecidos e replay offline. **Não houve acesso ao serviço ao vivo, reinicialização, nova consulta à base, autorização de impressão, spooler, NFC-e, cutover, merge ou deploy.**

## Qual é realmente a fonte nativa

O serviço atual `runtime/windows/TataComandaReader.ContinuousService.v2.cs` executa o watcher `tools/tata_reader_continuous_watch_candidate_v1.ps1` e o consumidor `runtime/shadow/live_shadow_consumer_loop_v1.cjs`.

- Watcher escreve `deliveryos.tata-reader-stable-order-event.v1` com `order_key`, `snapshot_hash`, filial/loja, números da comanda, `IDORGCMDVENDA`, estado de turno e itens `NRPRODCOMVEN`, `CDPRODUTO`, `CDARVPROD`, `QTPRODCOMVEN` e `IDSTPRCOMVEN`; **não emite no evento v1** textos de observação, `TXPRODCOMVEN` ou `ProductionPrintPlan`.
- Consumidor escreve `deliveryos.live-shadow-decision.v1` com `order_key/snapshot_hash`, `fingerprint` do conteúdo, itens enriquecidos, identidades, `targets`, classificação, `packaging`, `kits`, candidato de sequência e proveniência dos arquivos instalados. `ready:true` não confirma observações ausentes nem autoriza impressão.
- O próprio código antigo do consumidor usa `Math.max(1, Number(raw.QTPRODCOMVEN)||1)`, potencialmente coerção de quantidade inválida para **1**. A nova V6.8 mantém o serviço intacto, mas valida **separadamente a quantidade bruta do evento**, recusando zero, negativo, fração e texto inválido.

## Contratos implementados

- `src/production/stableReaderShadowPairV68.ts`: examina par de revisões pelo mesmo `order_key` e `snapshot_hash`, recalcula SHA-256 do conteúdo exato da decisão conforme algoritmo instalado do consumidor; valida loja, origem, seq. iFood/Teknisa, prova de turno, 2 namespaces de produto, quantidade segura, índice de linha, ausência de duplicação, classificação, praças/targets, kit, embalagem e ausência de consumo de sequência.
- Antes de chamar o motor de caixa/papéis e gerar as três vias, precisa receber **separadamente** `DeliveryJoinProjection`, `ProductionJoinProjection`, `ProductionPrintPlan`, `ProvenReaderProductV66[]` e `ReaderObservationProofV68[]`. Cada prova de observação inclui `snapshot_hash`, código canônico, referência de origem, **texto capturado do cliente** e **texto capturado da produção** para comparação exata com a reconciliação. Alegar `PROVEN_NONE` quando existe texto bloqueia.
- `tools/gerar_tres_vias_par_leitor_v68_offline.js`: recebe quatro caminhos explícitos `--event`, `--decision`, `--proof` e `--motor`. Só processa motor com Git blob `3167c309f02a0ad5a84fb43043b8866e3bee873c`; valida par/entrada; produz SVGs e manifesto em pasta temporária **apenas se** todas as vias passarem no renderer offline. Não lê pastas fixas de serviço, portas ou SQL.
- `tools/verificar_par_evento_leitor_v68.js` tem **17/17** provas adversariais em fixtures sintéticas: revisão trocada, alteração da decisão com `ready` preservado, produto/quantidade/turno falsos, identificação duplicada, rota divergente, observação omitida, campo `SEM/COM` discordante e referência de prova errada.
- `tools/verificar_par_leitor_motor_real_v68_local.js` executado em ambiente de desenvolvimento com **evento/decisão reconstruídos sinteticamente do replay histórico** de 04/10 e motor TATÁ Academia exato; resultado `PASS`: Cozinha 2 caixas/2 linhas, Sushi 4 caixas/4 linhas, Conferência 6 caixas/6 linhas. SVG hashes coincidem com V6.5; **não é uma nova captura de evento vivo**, não legitima histórico de turno LUNCH e não configura liberação da impressora.

## Fronteiras de prova restantes

1. Obter, apenas sob escopo/autorização operacional apropriada, um **par bruto existente** evento+decisão do serviço Windows, em observação passiva sem restart, com hash e origem. Provar que os dados têm as versões e campos esperados e não expor observações sensíveis desnecessariamente.
2. Produzir conciliação **real por revisão** de textos e natureza operacional `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN` e da observação do pedido. `data/tata_reader_real_order_observation_sanitized_20261005_v1.json` prova apenas ausência de observações nos quatro itens do **pedido histórico 0000348850**, e que a observação geral daquele pedido é metadado não produtivo; não provaria pedidos futuros.
3. Ligar apenas a prévia/reconciliação ao host real com gates de identidade de fonte, instalação controlada, retenção mínima e recuperação sem duplicidade; **não** alterar `ContinuousService.v2.cs`, watcher ou consumidor até ter o contrato e consentimento de efeitos relevantes.
4. Validar regras SKIN (não inferir receita), casos cross-station, kits/embalagens novas, Figma/ESC-POS/raster, impressoras físicas e aceite humano.

**Estado:** `CODE_READY/SHADOW`, `TEST_PASS/OFFLINE`. Não `DEPLOYED`, não `WORLD_PROVEN` de V6.8, não `HUMAN_ACCEPTED`. `NO_MERGE, NO_DEPLOY, NO_PRINT`.
