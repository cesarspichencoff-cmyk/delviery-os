# Reader TATÁ Comandas → Delivery OS — prova cruzada de integração em laboratório (03/11/2026)

**Natureza:** teste real de módulos versionados, entradas integralmente fictícias, sem atividade operacional. Não é deploy nem liberação de pedidos.

## Fontes e escopo exatamente testados
- **Produtor e join nativo de Comandas:** PR #135, commit fixado `168a9faa9c2350231dd97f3e3957d6ca323d94ce`; módulo `tools/comandas_reader_native_note_rowset_v1_review_only.cjs`, hash original `tata_comanda_reader_native_essentials_v857_offline.cjs` e `dist/src/production/nativeReaderChainV1.js` compilado da mesma árvore.
- **Consumidores reais do Delivery OS:** PR #137, commit testado `2c48685dac59d693875f4166841d556b684d1f22`; `runtime/reporting/native_reader_producer_contract_review_v1.cjs` e `runtime/reporting/native_reader_shadow_replay_v1.cjs`.
- **Script durável:** `tests/reporting/run-reader-comandas-deliveryos-cross-branch-tests.cjs`, no commit `2c48685da`.
- **Ambiente:** somente máquina **Foxxy**, dois worktrees destacados e isolados dentro de `C:\Users\italo\comandas-v2-foxxy-isolated-20261103\proof\`. Não executar no caixa `CAIXA_MOOCA`.

## Resultado verificado (processo Node concluído, exit code 0)

`READER_PR135_TO_DELIVERYOS_PR137_CROSS_BRANCH_PASS 28/28 SYNTHETIC_ONLY`

A suíte usa **a função `build()` da PR #135**, recebe seu objeto `privateEvent` e o passa diretamente a **`review()` e `replay()` da PR #137**, além de `joinNativeReaderSnapshotV1()` e `nativeTicketItemsV1()` da PR #135. O **objeto `decision` é construído como fixture fictícia em memória**, porque o serviço/consumidor que produz a decisão em operação não foi executado. Isto não é validação de uma decisão real já emitida pelo Windows.

Amostra inteiramente sintética: duas linhas, três observações com acento e apóstrofo, quantidades 2 e 1; variações de estado de cabeçalho 3/P/X, cancelamento de item 6, alterações de hash, item/note join adulterados, quantidade divergente, linhas duplicadas, revisões concorrentes sem ordem, dados de outra loja e scan incompleto. Nenhum campo de cliente foi extraído de pedido real.

**Provas:**
1. Evento do produtor é reconhecido como estruturalmente coerente pelo revisor do Delivery OS; hash SHA-256 e ordem de observações coincidem entre os módulos, inclusive com caracteres especiais. Dois itens/três notas preservados com o vínculo correto.
2. Replayer mantém `HOLD`, `ordersPublishable=0`, `nativeSourceAuthenticated=false`, `sourceFreshnessProven=false` e não promove 3/P/X a pronto. Estados de linha 6 não passam como pedido normal; inconsistências são retidas.
3. Duplicata exata é deduplicada; duas revisões distintas sem prova de ordenação mantêm `CONFLICTING_NATIVE_REVISIONS_NO_ORDERING_PROOF`.
4. A saída do revisor e replayer não expõe o código curto, chave nativa, texto de observações nem nomes fictícios; a origem externa não recebe prova imaginária.
5. O vínculo de produção `joinNativeReaderSnapshotV1` preserva `DSOBS*` como observações de delivery e `TXPRODCOMVEN` como instrução de produção, incluindo `nativeTicketItemsV1`. O `join.ready=true` **é apenas um resultado estrutural** e não significa pronto em praça, fonte autenticada, validade de impressão ou liberação operacional. Prova disso: `provenance.independent_source_attested=false` e `effects.print=false`.
6. Quantidade divergente e vínculo alterado item↔observação são recusados no join nativo, mesmo com referência de código previamente conhecida.

## Regressões executadas no mesmo ambiente
- `verificar_comandas_reader_native_note_rowset_v1_review_only.cjs`: **24/24**.
- `run-native-reader-producer-contract-review-tests.cjs`: **27/27**.
- `run-native-reader-shadow-replay-tests.cjs`: **48/48**.
- `verificar_comandas_reader_canonical_json_cross_runtime_v1_offline.cjs`: **16/16**, PowerShell ↔ Node UTF-8 e hash (15 com notas).
- `verificar_comandas_reader_multi_note_canonical_v1_offline.cjs`: **1/1**, dois itens/três observações inclusive apóstrofo.
- TypeScript completo da árvore PR #135: compilação `tsc -p` exit code **0**, após fornecer ao worktree isolado as dependências **já existentes** do `repo/node_modules` por junction temporária. A primeira execução sem acesso a `xlsx` no laboratório tinha falhado (erro de dependência disponível na outra árvore, não uma falha apontada no código do Reader); foi repetida após corrigir o ambiente e concluiu sem erro. Não houve instalação online de pacote.

## Fronteira estrita da conclusão
**Fechado no laboratório:** incompatibilidade imediata de objeto/header/itens/observações/hash entre os módulos testados. O código está apto para revisão adicional **sem reescrever o Reader ou o Copiloto**.

**Ainda aberto:** 
- a geração da decisão efetiva pelo serviço instalado, sob a identidade real do Reader; a fixture não a substitui;
- o SQL atual, isolamento transacional, versão/hashes do watcher instalado, fonte autorizada, vínculo independente iFood↔Teknisa, frescor, revisão completa e cardinalidade;
- semântica física de “pronto por praça”, conferência/lacre, Home recebendo dados ao vivo;
- APK Xiaomi, GPS consentido, reenvio real, teste de almoço e jantar e aceite humano.

**Gate operacional preservado:** PR #135 `docs/comandas/READER_SUPERVISED_MAINTENANCE_PREFLIGHT_20261103.md` concluiu `STOP_SAFE`: manutenção supervisionada já autorizada por César nos limites definidos, mas o serviço real não possui canal aprovado e demonstrado de diagnóstico, os diretórios protegidos retornaram EPERM e não houve prova de parada/restart com drenagem segura. Não contornar ACL, trocar usuário, reiniciar por tentativa, ativar leitor alternativo ou criar shell no caixa.

**Efeitos comprovadamente ausentes neste trabalho:** SQL real, leitura de pedido de cliente, modificação de serviço, cron, coletor novo, impressão, GPS, deploy, merge e custo adicional. GitHub recebeu somente o teste de integração e este registro. 

**Próxima etapa de maior valor:** no código/canal oficialmente autorizado da PR #135, definir e testar um procedimento de diagnóstico/atestado mínimo com identidade efetiva e drenagem/rollback — não reabrir motor de decisão. Depois, com os gates operacionais atendidos, provar uma única revisão atual de Itaim e a ligação com a Home. Não declarar lançamento antes desse fato.

**Status:** `LAB_INTEGRATION_PASS=28/28`; `CI_FOR_CROSS_BRANCH=NOT_CLAIMED`; `INSTALLED_READER_SAME_BYTES=UNKNOWN`; `LIVE_ORDER_SOURCE=UNKNOWN`; `REAL_READY_BY_AREA=UNKNOWN`; `PRODUCTION_PILOT=HOLD`.
