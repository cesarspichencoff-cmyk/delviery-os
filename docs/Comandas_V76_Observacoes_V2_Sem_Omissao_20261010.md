# Comandas V7.6 — observações do watcher V2 sem omissão silenciosa

**Checkpoint:** 10/10/2026. PR #38 DRAFT/HOLD. Sem serviço Windows, SQL, impressora, spooler, deploy, merge ou alteração visual.

## Diferença real

A inspeção autorizada anterior de **um** pedido do leitor CAIXA_MOOCA confirmou watcher **V2**, embora o envelope de evento ainda se identifique como `*.event.v1`. O watcher instalado produz `order.observation_scan_complete`, `order.observation_rows` e inclui linhas de nota no `snapshot_hash` quando existem. O pedido examinado tinha cinco itens, zero notas preenchidas por item e **uma observação geral** presente, idêntica à fonte SQL. A **relevância operacional dessa observação é UNKNOWN**. O motor, desenhos e regras existentes não devem ser reconstruídos para resolver isso.

O projetor V6.8 anteriormente validava provas das observações dos itens, mas **não verificava o hash V2** nem impedia que uma nota geral do evento fosse descartada no pacote de projeção. Uma prévia poderia ficar visualmente correta omitindo silenciosamente um dado ainda sem classificação.

## Correção cirúrgica no reconciliador existente

Em `src/production/stableReaderShadowPairV68.ts`:

- Identifica a presença do contrato V2 por `observation_scan_complete` ou `observation_rows`, nunca pelo nome do schema de envelope;
- Reconstitui o `hashBasis` técnico do watcher instalado (oito campos de cabeçalho, cinco campos de cada item, linhas ordenadas de observação quando presentes) e valida SHA-256;
- Valida origem, escopo, índice zero-based, código do item e ausência de duplicidades/linhas desconhecidas. Falha fechada se o contrato V2 estiver incompleto ou adulterado;
- **Qualquer `DSOBSCOMANDA` não classificada bloqueia as três vias offline** com `WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF`, mesmo que a projeção downstream tenha omitido a nota;
- Para notas por item, exige que o mesmo texto e proveniência estejam nas provas independentes do item (campos `DSOBS*` no lado de entrega, `TXPRODCOMVEN` no lado de produção); nada pode desaparecer nem surgir na projeção;
- Mantém `print_authorized=false`, sem conceder autorização à origem ou à impressão por um simples hash válido;
- Eventos legados V1 continuam na rota anterior, sujeitos aos controles e provas já existentes.

**Essa é uma trava de segurança, NÃO uma regra de classificação automática do conteúdo da observação geral.** Para liberar a nota, será necessária prova de sua relevância ou exclusão segura, ligada à mesma revisão. Não transformar o texto do cliente em inferência de preparo.

## Prova independente na CI

[Run 38087921900](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38087921900) **SUCCESS** no commit `d9bf08048188565c81521931766a209389846d0d`:

- `STABLE_READER_SHADOW_PAIR_V68=27/27` — dez testes novos: nota geral não descartável, adulteração do hash, nota de item correta, ausência e excesso de nota, fonte desconhecida, varredura incompleta, identidade trocada, campo de produção e combinação nota geral + item.
- `PASSIVE_READER_AUDIT_V69=21/21`, `READER_SHIFT_HUMAN_REVIEW_V70=29/29`, `THERMAL_DIRECT_RENDERER_SEMANTIC_V71=12/12`.
- **`THERMAL_DESIGN_LOCK_V72=12/12; SVG_GOLDENS_MATCH`**: Figma Produção V4.4 e Conferência V4.3, três SVGs históricos e bytes Epson offline não foram modificados.

## O que permanece aberto

O pedido real com a nota geral segue sem relevância operacional comprovada, com turno de leitor vencido na última inspeção. Não há prova de três vias vivas prontas. Ainda são necessários contrato de turno prospectivo autorizado, prova de classificação segura da nota geral, demais identidades/praças e caixas da mesma revisão, pacote V6.8 completo, seguida de teste físico óptico **CAIXA Itaim** sujeito a autorização separada.

**Estado:** CODE_READY / CI_PASS em DRAFT; não DEPLOYED, não WORLD_PROVEN, não PRINT_ACCEPTED.
