# Delivery OS Itaim — L1: bloqueio de observações incompletas integrado à PR #135 (08/11/2026)

**Estado e autoridade:** continuação da PR #137, branch `feat/gestor-shadow-observer-20261103`, **DRAFT/HOLD**. Revalidação canônica: `cesarspichencoff-cmyk/vertice-runtime.` (ponto final literal), `vertice-active`, `VERTICE_ENTRY.md`, Git blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`. A validação cruzada usa **PR #135 fixada no commit `17e332e18532678a217c921a584d389f5125c4ea`**. Não afirmar compatibilidade com um HEAD futuro sem executar o teste outra vez.

## Por que esta correção era material

A PR #135 (TATÁ Comandas, Etapa 3 de 6) encontrou por leitura passiva de código PHP instalado que observações, modificadores e componentes também podem estar nas tabelas filhas `OBSITCOMANDAVEN`, `OBSITCOMANDAEST` e `ITCOMANDAEST`, com textos de `OCORRENCIA`. A candidata SQL de quatro tabelas não demonstra cobertura dessas estruturas. Além disso, o esquema das filhas e seus relacionamentos entre lojas ainda não foram comprovados, e os commits da ingestão real não foram atestados. Não se deve acrescentar JOINs sob `SERIALIZABLE` por suposição. Fonte: `docs/comandas/ETAPA3_GRAVACAO_SEQUENCIAL_E_FONTES_OBSERVACOES_20261108.md` da PR #135.

O produtor real `tools/comandas_reader_native_note_rowset_v1_review_only.cjs` (blob `2c68d09e45f3cce5c79c88aeff7162195a39d558`) é explícito: emite `order.observation_scan_complete=false`, `ready_for_downstream_shadow=false` e `blockers=['SOURCE_ROWSET_CALLER_NOT_AUTHENTICATED','READ_COMPLETENESS_NOT_INDEPENDENTLY_ATTESTED','NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ']`. Também declara `native_child_item_coverage_proven=false`, `native_child_observation_coverage_proven=false`, `semantic_observation_coverage_proven=false`. São **alegações negativas da própria fonte**, não atestação do banco.

**Diferença de integração encontrada:** o revisor e o replay da PR #137 exigiam `observation_scan_complete=true`, mas não davam precedência explícita ao veto do produtor transportado em `ready_for_downstream_shadow` e `blockers`. Um intermediário poderia declarar `observation_scan_complete=true`, recalcular o hash e montar uma decisão sintética consistente, criando uma **candidata HMAC em sombra** mesmo com o produtor declarando filhas não verificadas. Esse comportamento nunca autorizou envio à Home ou impressão (ambos já eram `HOLD`), mas distorceria a contagem e a origem de candidatos.

## Mudanças restritas e verificáveis

1. `runtime/reporting/native_reader_producer_contract_review_v1.cjs`: se o evento declarar `ready_for_downstream_shadow=false` ou tiver `blockers` não vazios, o resultado imediato é `HOLD / NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER`, antes de avaliar completude autodeclarada de observações.
2. `runtime/reporting/native_reader_shadow_replay_v1.cjs`: a mesma declaração negativa impede a criação de linhas HMAC e `selfConsistentCandidates` para o evento. `ordersPublishable=0` permanece inalterado e não existe emissão de evento operacional.
3. Os testes de revisor (32) e replay (51) agora incluem contraprovas para `ready=false`, filhos não lidos e flag de observações indevidamente promovida.
4. `tests/reporting/run-pr135-native-child-observation-l1-contract.cjs`: importa **o produtor real da PR #135 pinada**, compilado num checkout descartável do GitHub, cria **uma linha fictícia** e verifica que tanto a leitura privada original quanto uma versão sintética com flag adulterada/rehash ficam `HOLD` e não geram candidato. Nenhum dado do caixa, pedido de cliente ou consulta SQL.
5. O lançador de ensaio Windows `labs/reader-proof/NativeReaderOneShotLabLauncher.cs` confere **cinco hashes Git blob exatos**, além do script principal. Como os itens 1 e 2 mudaram legitimamente, atualizaram-se **apenas esses dois pins**: `70528fe678db944a4c098688fa608bbaef0ec3c0` e `0d9fbe032e30371becc1fa1d469dac05131a92b5`. A verificação foi preservada; não se relaxaram host, caminho, credenciais, console, integridade ou privacidade.
6. `tests/reporting/run-reader-one-shot-dependency-pin-tests.cjs` agora falha **antes do Windows** se qualquer um dos cinco blobs divergir, inclusive por alteração de módulo ou troca de hash do lançador. Cobre também remoção da verificação de dependências e adulteração do script principal. Integrado à CI principal.

## Provas da versão exata

**Commit de código/CI:** `4840efdd9e5f16ee209c2e70b515d6e677f0cb3f`. 

- [GitHub Actions `Delivery OS silent fixture` #42460460166](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42460460166) — **`completed/success`, 4/4 jobs**, após correção dos pins. Linux registrou `NATIVE_READER_PRODUCER_CONTRACT_REVIEW_PASS 32/32`, `NATIVE_READER_SHADOW_REPLAY_PASS 51/51`, `PR135_ACTUAL_PRODUCER_PR137_CHILD_NOTE_HOLD_PASS 5/5` e `READER_ONE_SHOT_EXACT_PIN_INTEGRITY_PASS 5/5`. Tudo com entradas fictícias.
- No Windows, `NATIVE_READER_LAB_SCRIPT_IDENTITY_PASS 3/3` rejeitou caminho/byte/dependência adulterados. `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10` atestou ausência de janela visível, roubo de foco ou exportação de PII **somente no runner de laboratório**, não no CAIXA_MOOCA.
- [GitHub Actions `Android Room Recovery` #42460460179](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42460460179) — **`completed/success`, `BUILD SUCCESSFUL`, 26 suítes, 272 testes, 0 falhas, 0 erros**. Alterações L1 não regrediram o Android.
- Falhas que **não foram ocultadas**: CI anterior (#42459929335) carecia de `dist/` da PR #135 pinada; passou após compilar suas dependências no runner. CI seguinte (#42460008756), inclusive após um rerun do Windows, falhou determinística e corretamente com `ONE_SHOT_EARLY_EXIT_88` por pins obsoletos. Não se atribuiu esse erro a temporização; a causa foi identificada na comparação exata de blobs e corrigida.

## Fronteiras operacionais e próximos gates

- **Fechado no laboratório:** o consumidor respeita o veto de filhas/observações declaradas incompletas; não transforma hash autoconsistente em prova de fonte. A proteção de hash cruzada é executada antes do Windows.
- **Não demonstrado:** que a PR #135 captura todas as filhas e observações de pedidos reais, que o leitor SQL enxerga uma revisão semanticamente concluída, custo e ausência de bloqueio de escritores sob `SERIALIZABLE`, identidade externa iFood, fidelidade física das vias, semelhança com tela/Home real.
- **Prova pendente do caminho crítico L1:** `N2-A` plano/impacto de escritores e `N2-B` completude semântica independente. A PR #135 segue Etapa 3 de 6; **Etapa 4 não autorizada**. O Delivery OS V1 segue **0/8 aceites integrais de campo**; a L6 avançou em paralelo em laboratório, mas não desbloqueia L1.
- **Limites absolutos:** `CAIXA_MOOCA` tem proteção de tela e **somente leitura passiva**, sem processo, shell, SQL, serviços, spooler ou impressão. Esta rodada não usou o caixa. Nenhum serviço ou software instalado, iFood/Teknisa, banco, cliente, GPS real, APK, Home, merge/deploy ou infraestrutura paga foi alterado.

**Próximo passo útil:** reusar as evidências e a pesquisa da PR #135 para definir um **sinal independente de completude da gravação e de cobertura das relações filhas** sem ampliar o risco de SQL em produção. Nenhuma consulta `SERIALIZABLE` ou alteração de impressão foi autorizada nesta rodada. `CODE_READY + CI_PASS` ≠ `WORLD_PROVEN`.
