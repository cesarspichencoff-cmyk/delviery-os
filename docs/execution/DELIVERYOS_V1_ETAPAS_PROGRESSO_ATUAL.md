# Delivery OS V1 Itaim — andamento por etapa (L1–L8)

**Checkpoint verificado em 05/11/2026.** Fonte vinculante: [contrato mínimo de lançamento](./DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md). Este arquivo mostra progresso verificável, não autoriza ações. **Etapa atual L1 (fonte nativa de pedidos); 0/8 etapas integralmente aceitas em operação.** O desenvolvimento das etapas posteriores continua preservado.

| Etapa | Objetivo | Estado comprovado | Gate aberto |
| --- | --- | --- | --- |
| **L1 — atual** | Pedidos, revisões, horário, itens e observações reais do Itaim | Reader V2 instalado e bytes/hash verificados; supervisor ativo; checkpoint com 250 entradas estabilizadas no escopo Itaim; arquivos de evento amostrados existentes | Provar conteúdo completo de uma revisão, isolamento da leitura, hash PowerShell↔Node, origem/autoridade e atualização real |
| L2 | Mapear cada item à praça certa | Taxonomia decidida; lógica disponível | Atestar exceções reais, sem confundir Quentes da Cozinha com Sushi Quentes |
| L3 | Estado da produção e pronto físico | Códigos 3/P/X observados em estudos; sem semântica física homologada | Evidência de item e praça, conferência e pronto, sem inferência automática |
| L4 | Copiloto integrado na Home | Motor e superfícies existem | Demonstrar Home atualizada com fatos do campo, fonte e Foco único |
| L5 | Conferência, kits, sacolas, lacres | Cadeia TATÁ Comandas com provas virtuais e gates de segurança | Ato físico, identidades vinculadas e observações críticas |
| L6 | Entregas motoboy, GPS, offline e recibos | Código Android/Room/WorkManager e testes históricos | Xiaomi real, autorização, reenvio/ACK de servidor e ciclo completo |
| L7 | Pedido até entrega em uma só jornada | Provas fragmentadas, sem cadeia completa | Um cenário operacional autorizado ponta a ponta |
| L8 | Execução silenciosa, privada e reversível | Suites Windows de laboratório aprovadas, inventário não ativado | Prova no caixa e aparelhos, sem janelas CMD/PowerShell ou efeitos involuntários |

## L1 — subdivisão do caminho crítico

| Gate | Situação |
| --- | --- |
| N1 — Reader instalado | **Parcialmente comprovado**: script V2 encontrado, hash independente coincide com o esperado; heartbeat + processo em atividade. Identidade SQL e privilégios continuam desconhecidos |
| N2 — revisão íntegra | **HOLD**: não abriram conteúdo de pedidos/observações; checkpoint de 250 entradas comprova somente metadados e emissão local |
| N3 — hash canônico | **HOLD**: Reader V2 usa serialização PowerShell legada; paridade com Node precisa ser provada na mesma revisão, incluindo acentos/apóstrofos |
| N4 — origem/frescor | **HOLD**: status de supervisor e existência de arquivo não atestam origem independente nem completude da fila |
| N5 — integração Home | **HOLD**: não publicar pedidos, contagens, praças ou estado pronto sem N2–N4 |

## Descoberta causal do projetor (somente leitura, 05/11)

- Fonte instalada inspecionada no `CAIXA_MOOCA`: `shadow/continuous_reporting_projector_v1.cjs` e `shadow/live_shadow_consumer_loop_v1.cjs`. **Nenhum dos programas foi executado ou modificado nesta auditoria.**
- O projetor usa `projector.lock` criado em modo exclusivo. Ao encontrar uma trava com menos de **120 segundos**, devolve `SKIPPED_LOCKED`, sem projetar. A observação registrada como `SKIPPED_LOCKED` ocorreu aproximadamente **66 segundos** após a atualização da trava. Logo, a observação **não comprova lock órfão naquele momento**. A ausência posterior do PID na lista de processos tampouco prova que o lock estava órfão quando houve o skip.
- O consumidor chama o projetor apenas se `envelopeChanged || !projectionBootstrapped`; depois marca `projectionBootstrapped=true`, inclusive quando o resultado foi `SKIPPED_LOCKED`. Em ausência de novo envelope, **não existe retentativa periódica nesse fluxo**. O status de consumidor e os indicadores de projeção observados são coerentes com esse mecanismo.
- Risco independente: a recuperação de trava antiga usa apenas `mtime > 120000` para remover arquivo, sem comprovar propriedade do lock/processo em execução; `releaseLock()` também remove o caminho sem conferir o proprietário. **Há risco de concorrência** em uma futura alteração precipitada. Não substituir a trava, forçar reinício nem confiar em envelhecimento do arquivo como prova isolada de segurança.
- **Divergência de fonte:** o código de loop publicado em `runtime/shadow/live_shadow_consumer_loop_v1.cjs` na PR #135 não corresponde à versão instalada no caixa (a PR #135 tem outra estrutura e não contém `continuous_reporting_projector_v1.cjs`). **Não aplicar patch no arquivo de branch como se fosse a fonte canônica do processo em execução.**
- **Critério para correção futura:** alinhar uma cópia versionada da implementação realmente instalada, construir retentativa limitada após `SKIPPED_LOCKED` sem excesso de processos e com identidade do detentor da trava; testar colisões, desligamento e recuperação no Foxxy/CI; só então solicitar autorização específica de mudança operacional, com rollback e prova de nenhuma janela visível.
- Relatório de projeção anterior continua com checkpoint de 30/10; **não** usar esses agregados como estado atual da Home.

## Mudança recente aprovada

A PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137), commit de código `3cdc18f67c0d02d359f97df1573de07c370b6238`, passou na [CI #41964180535](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41964180535) com 4/4 jobs, incluindo 12/12 novos testes do consumidor V2 para não produzir saúde falsamente verde. **Código no GitHub; não instalado no caixa.**

PR #135 TATÁ Comandas permanece DRAFT/HOLD. Consumidor com efeitos de arquivo e cadeia de relatório **não devem** ser executados no caixa a partir do manifesto inteiro. Nada foi mesclado ou implantado.

## Próximo passo de maior valor

**L1/N2–N3:** procurar recibo existente e previamente sanitizado para uma única revisão, que demonstre itens, quantidades e observações completos, com origem e hash sem expor identificadores/PII. Em paralelo, reconciliar **somente em código versionado e ambiente isolado** a implementação do projetor, antes de qualquer correção operacional. Não ativar novo coletor, SQL, impressão, task ou programa visível no caixa.

**Regra de comunicação:** em cada continuação, indicar etapa L1–L8 e subgate, avanço executado, evidência `CODE_READY / CI_PASS / FIELD_PROVEN`, bloqueio, próxima ação. Não declarar V1 completa com 0/8 aceites de campo.

## Checkpoint 05/11 — recuperação de projeção em laboratório

**Etapa:** permanece **L1/8 — Reader nativo, N2/N3 em HOLD**. Não há nenhum dos oito aceites completos em campo. A correção abaixo é uma frente adjacente da projeção/relatórios, útil para a futura L4, **não é evidência de itens/observações reais**.

**Causa reproduzida a partir do código instalado, somente leitura:** no `CAIXA_MOOCA`, `shadow/live_shadow_consumer_loop_v1.cjs` chama `runProjector()` apenas quando surge envelope novo ou no bootstrap. `projectionBootstrapped=true` é definido inclusive após retorno `SKIPPED_LOCKED`. Sem novos envelopes, o processo fica vivo sem retentar a projeção. O `continuous_reporting_projector_v1.cjs` usa lock exclusivo e uma janela de 120 s; o primeiro `SKIPPED_LOCKED` ocorreu cerca de 66 s depois do mtime, logo a hipótese anterior de lock órfão naquele instante era **não comprovada**. O auto-unlock do projetor por idade (sem identidade do detentor) é risco de concorrência separado.

**Código/prova nova na PR #137:**
- `labs/reporting/host-shadow-loop-lab-recovery-v1.cjs`: variante **LAB-ONLY** da lógica da versão encontrada no caixa; exige raiz temporária com marcador exclusivo, recusa hostname `CAIXA_MOOCA` e ciclos limitados. Reproduz baseline negativo e introduz retentativa com intervalo somente no laboratório. Verifica lock local antes de iniciar o projetor; lock antigo/incerto => `HOLD_STALE_LOCK_UNVERIFIED`, sem apagar, renomear ou chamar o processo.
- `tests/reporting/run-host-shadow-projection-retry-lab-tests.cjs`: fixtures inteiramente inventados e descartados, sem pedidos, SQL ou login. Controle original: **1 tentativa / fica em SKIPPED_LOCKED**. Candidato: **2 tentativas / recupera PROJECTED** quando a trava deixa de impedir a execução; bloqueio persistente tem chamadas limitadas; locks recente/antigo são preservados, sem nova execução; sem marcador o programa recusa rodar.
- [GitHub Actions #41966451312](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41966451312): **4/4 jobs SUCCESS**; log `TATA_REPORTING_LOCKED_RETRY_LAB_PASS 7/7 SYNTHETIC_ONLY`. Demais suites do projeto permanecem aprovadas. Principal commit de testes `436ab8e8065f08f30b0beb5f23b4d9f3ccc80013`.

**Limite:** prova `LAB_TEST_PASS` de algoritmo em arquivos fictícios, não prova de segurança do protocolo de lock do projetor em produção. O próprio projetor instalado pode remover um lock antigo só pela idade. Nenhuma variante foi copiada/instalada/iniciada no caixa; nenhuma alteração em processos, lock, impressão, arquivos de pedido, Home, Edge ou serviço; PR #135 e #137 seguem DRAFT/HOLD.

**Próximo passo:** localizar/projetar recibo **já sanitizado** de uma revisão única para fechar N2/N3, sem ler dados de cliente. Em paralelo, antes de homologar retentativa real, corrigir o lock no código da fonte instalada sob revisão de concorrência/rollback e obter autorização pontual para eventual piloto. Até lá, não usar relatório antigo como indicador de pedido atual.

## Checkpoint 05/11 — diferença de aquisição do Reader V2 instalado

**Etapa atual permanece L1/N2–N3 (0/8 aceites completos).** Comparação estrutural, somente código, do watcher V2 instalado com a candidata review-only da PR #135. Atestado que o V2 já seleciona os quatro campos de observações, mas a consulta instalada utiliza `IDORGCMDVENDA LIKE 'DLV[_]%'`, Top 50 por padrão e ordenação sem `NRCOMANDA` como desempate. Hash continua em `ConvertTo-Json` PowerShell antigo; divergência com Node é possível quando há apóstrofo. A candidata PR #135 usa `IDORGCMDVENDA='DLV_IFO'`, desempate completo e serializador canônico — **não instalada nem validada em SQL real**.

**Prova nova de saúde:** heartbeat 05/11 01:19h BRT `RUNNING` / último lote `OK` / zero falhas consecutivas, e checkpoint atualizado; comprovante histórico em `continuous-watch-proof-v1/checkpoint.json` permanece datado de 05/10. Nenhum evento de pedido ou texto de observação foi aberto.

**Documento técnico de decisão:** [`DELIVERYOS_L1_INSTALLED_V2_VS_PR135_DIFFCHECK_20261105.md`](./DELIVERYOS_L1_INSTALLED_V2_VS_PR135_DIFFCHECK_20261105.md). Gate N2 exige origem exata, consistência/limite de seleção e prova independente de completude de uma revisão. N3 exige hash canônico na mesma revisão. **Não basta** heartbeat ou `observation_scan_complete=true` autodeclarado. Próxima prova de campo necessita canal previamente autorizado, sanitização local e sem janela; até lá, HOLD. Não substituir watcher/Reader nem usar o consumidor da PR #135 com escrita.

**Continuidade L2–L8:** nenhuma alteração nos gates anteriores. A correção de `SKIPPED_LOCKED` continua exclusiva do laboratório, com testes 7/7 aprovados, sem implantação.

## Checkpoint 05/11 — aquisição V2 e horários de abertura sem fuso

**Etapa atual: L1/N2–N3. Aceite operacional V1: 0/8.** Auditoria estrutural no código instalado `tata_reader_continuous_watch_candidate_v2.ps1`, sem acessar SQL ou arquivo bruto de pedido. Identificadas diferenças materiais ante a candidata PR #135: filtro largo `IDORGCMDVENDA LIKE DLV[_]%` em vez da igualdade `DLV_IFO`; `TopOrders=50` com desempate incompleto por comanda; serialização PowerShell `ConvertTo-Json` ainda não reconciliada com `JSON.stringify` em observações que contêm apóstrofos. PR #135 tem consulta exata e serializador de laboratório, mas **não foram instalados/validados em fonte real**.

**Campo, metadados:** Reader heartbeat 05/11 01:19 BRT `RUNNING`, lote `OK`, nenhuma falha consecutiva; checkpoint atualizado. Das 250 entradas emitidas, 31 têm data de abertura textual em 03/11 e 219 em 04/11; nenhuma em 05/11. **Todas as 250 datas de abertura são horários sem offset** (`yyyy-MM-ddTHH:mm:ss.fffffff`); último relógio textual **04/11 22:59**, não 19:59. A primeira conversão de `Date.parse` era incorreta; foi corrigida pela leitura do formato original. A biblioteca existente `tata_source_time_v1.cjs` já exige política explícita de origem para converter horas sem fuso; preservar esse bloqueio.

**Diferença e critérios N2/N3 documentados em:** [`DELIVERYOS_L1_INSTALLED_V2_VS_PR135_DIFFCHECK_20261105.md`](./DELIVERYOS_L1_INSTALLED_V2_VS_PR135_DIFFCHECK_20261105.md). Nenhum recibo sanitizado **atual** de revisão completa foi identificado nos caminhos genéricos de evidência do caixa; os artefatos de provas nomeadas encontrados são históricos de outubro. **Não** promover evidência histórica para fato de novembro. Subgates N2/N3/N4/N5 permanecem HOLD, sem prova de completude, origem nem autorização de Home.

**Próximo passo de maior valor:** somente uma verificação real de revisão por canal local expressamente autorizado, sanitizada antes de qualquer exportação, com contagem/ligação dos itens, observações e hash canônico; e comprovação independente da política de horário. Nenhum SELECT ou sensor novo no caixa antes do gate. A recuperação do projetor permanece isolada com 7/7 testes aprovados em laboratório.

## Checkpoint 05/11 — legado SHA uppercase e falso OK de projeção bloqueado

**Etapa atual:** L1 (Reader nativo Itaim), N2/N3 pendentes; **0/8 aceites da V1**. A principal lacuna continua sendo uma revisão real com itens, quantidades, observações, origem, cobertura e hash comprovados **sem divulgar dados pessoais**. Nenhum evento bruto foi lido nesta rodada.

**N3, evidência real somente de metadados:** em `state/reader-watch-checkpoint-v1.json` do CAIXA_MOOCA, **250/250 snapshots têm SHA-256 com letras A–F exclusivamente maiúsculas**; nenhum em minúsculas nem misto. Supervisor `RUNNING`, último lote `OK`, sem falhas consecutivas na última leitura. O código já existente `runtime/reporting/native_reader_verified_legacy_hash_v1.cjs` não converte cegamente: recalcula `snapshotHash(order)` e compara a versão minúscula da entrada. Isso bloqueia revisões cujo conteúdo não seja igual à serialização canônica, inclusive notas com apóstrofo. Não afirmar que todos os 250 hashes divergem: **ainda não houve comparação do payload real**. Os 250 registros são histórico de checkpoint, não inventário de pedidos ativos nem fonte autenticada.

**Falha distinta no projetor e correção somente LAB:** leitura do `continuous_reporting_projector_v1.cjs` instalado confirmou que ele emite os três estados `CURRENT`, `PROJECTED` e `SKIPPED_LOCKED`. O consumidor antigo assumia `OK` na falha de parse de stdout, podendo reportar falsa conclusão. Alterado apenas `labs/reporting/host-shadow-loop-lab-recovery-v1.cjs` para rejeitar saída inválida e estados não reconhecidos, mantendo recuperação limitada e proteção de locks. Três testes novos, total **10/10** na fixture `tests/reporting/run-host-shadow-projection-retry-lab-tests.cjs`. Prova CI: [Actions #41968308498](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41968308498) `completed/success`, **4/4 jobs** aprovados; log `TATA_REPORTING_LOCKED_RETRY_LAB_PASS 10/10 SYNTHETIC_ONLY`. Último commit de teste `13d8befa590b0a4e1d0b588fa09f72cd1c42ccf1`.

**Limites:** nenhuma alteração no Reader, projetor, trava, serviço, processo, CMD/PowerShell, navegador, impressora, banco, arquivo de pedido ou Home do CAIXA_MOOCA. A correção existe somente na PR #137, não foi instalada e não é prova de segurança concorrente do projetor de produção. A PR #135 segue em DRAFT/HOLD. L1/N2/N3/N4/N5 continuam parcialmente ou totalmente bloqueados conforme o plano.

**Próximo passo de maior valor:** comprovar **uma** revisão real do `DLV_IFO` por canal aprovado que calcule localmente contagem de itens, quantidade/escopo de observações, igualdade de hash canônico e identidade/frescor independentes, exportando somente recibo sanitizado. Não criar outro conversor ou coletor e não confiar na mera caixa alta/baixa do hash. Sem canal autorizado e silencioso, manter HOLD em vez de executar no caixa.

## Checkpoint 05/11 — recibo N2/N3 sanitizado de revisão única

**Etapa atual:** **L1 de L8**, com **N2/N3 ainda em HOLD; 0/8 aceites operacionais**. O bloqueio de campo é o mesmo: a autenticidade da revisão real, o conjunto completo de itens/observações no SQL e o hash verificado localmente **não foram atestados**.

**Capacidade preparada na PR #137 (não instalada):** `runtime/reporting/native_reader_n2n3_sanitized_receipt_v1.cjs` compõe exclusivamente as duas funções puras já existentes — `normalizeVerifiedLegacyNativeHashV1()` e `native_reader_producer_contract_review_v1.review()`. Aceita um envelope já obtido por **chamador autorizado** e calcula *em memória* integridade canônica do conteúdo, relações item/observação e contagens. A saída é somente `state=HOLD`, categorias de bloqueio e contagens, **sem nomes, notas, chaves de pedido, hash bruto, arquivos ou valores individuais**. Preserva `ordersPublishable=0`, `sourceIdentityVerified=false`, `sourceFreshnessVerified=false`, `n2ObservationReadIndependentlyComplete=false`. Não tem API de SQL, leitura de disco, rede ou impressão.

**Prova sintética:** `tests/reporting/run-native-reader-n2n3-sanitized-receipt-tests.cjs` passou **11/11** na job `Static fixture contracts` da [GitHub Actions #41969060087](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41969060087), incluindo SHA maiúsculo reconciliável **somente quando os bytes canônicos batem**, apóstrofo com hash divergente, adulteração de quantidade, item com observação ligada a produto errado, origem DLV diferente, alegação de autenticidade arbitrária e ausência de dados pessoais no recibo. O código não é substituto de prova independente.

**Ações no caixa:** nenhuma. O Reader V2 instalado permanece intacto; nenhuma revisão real foi carregada em ChatGPT; não se executou o novo avaliador no `CAIXA_MOOCA`, não se consultou SQL e não houve serviço, janela, impressão ou Home alterados.

**Próxima fronteira material:** garantir **canal local de prova previamente autorizado e comprovadamente silencioso** que forneça uma única revisão real à função em memória e destrua o conteúdo bruto após produzir recibo sanitizado; confrontar a contagem de itens/notas com evidência da consulta e do esgotamento de linhas, e exigir atestação independente de origem/horário. Até então, o veredito não pode sair de `HOLD`, mesmo com hash autoconsistente.

## Checkpoint 05/11 — executor de recibo N2/N3 silencioso em Windows de laboratório

**Etapa atual: L1 de L8 — N2/N3 em HOLD; 0/8 aceites de campo.** A fonte de pedidos não foi ativada na Home. A CI confirmou um caminho completo **somente de laboratório** entre um evento fictício, o verificador N2/N3, um recibo sem dados pessoais e um aplicativo Windows GUI sem console.

**Evidência:** [CI #41970189987](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41970189987) `completed/success`, **4/4 jobs**. `NATIVE_READER_ONE_SHOT_LAB_PASS 10/10 SYNTHETIC_ONLY` (contratos e privacidade); `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10 NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII` (lançador Windows `winexe`, um Node filho, dez amostras sem janela visível e foco preservado na VM). Arquivos: `labs/reader-proof/native_reader_one_shot_lab_cli_v1.cjs`, `labs/reader-proof/NativeReaderOneShotLabLauncher.cs`, `tests/reporting/build-reader-one-shot-lab-fixture.cjs`, `tests/reporting/run-reader-one-shot-lab-tests.cjs`. Todos recusam ou dependem de proteção LAB; o lançador/CLI **recusam CAIXA_MOOCA**.

**Limite material:** confirmação de laboratório ≠ ausência absoluta de flash em campo, ≠ leitura de revisão real, ≠ autorização SQL, ≠ prova de completude/joins de origem. Nenhum executável ou arquivo novo foi copiado/instalado/rodado no caixa. O recibo sempre mantém `ordersPublishable=0` e `sourceIdentityVerified=false`; nenhuma observação de cliente foi exportada.

**Plano de passagem:** [`DELIVERYOS_READER_N2N3_ONE_SHOT_LAB_PROOF_20261105.md`](./DELIVERYOS_READER_N2N3_ONE_SHOT_LAB_PROOF_20261105.md). O próximo gate exige uma variante de uso único **autorizada separadamente**, com acesso mínimo a um evento **já emitido**, processo local comprovadamente silencioso e prova de origem/isolamento da consulta, sem abrir shell no caixa. Até esses itens estarem comprovados, **N2/N3=HOLD**, L1 ainda parcial, L2–L8 preservadas.

## Checkpoint 05/11 — identidade imutável do executor e gate de hash entre versões

**Etapa atual L1/8 — N2/N3 HOLD — 0/8 aceites de campo.** A variante de uso único continua inteiramente de laboratório. O próximo passo real é a **autorização explícita de uma leitura local de uma única revisão já emitida**, sem copiar evento bruto/PII, com processo intrinsecamente invisível e prova independente de origem/completude; a CI não autoriza esse efeito.

**Avanço verificável desta sessão:** uma auditoria mostrou que `NativeReaderOneShotLabLauncher.cs` aceitava apenas nomes de executável e script, sem identidade dos bytes. A versão corrigida exige GitHub Actions do repositório exato, script no caminho do checkout e hash Git blob de byte exato; dois testes negativos rejeitam script falso e arquivo adulterado. A primeira [CI #41972619037](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41972619037) detectou regressão real do checkout Windows (CRLF alterava o hash), **não** foi considerada aprovada. Corrigido apenas `.gitattributes` para `labs/reader-proof/native_reader_one_shot_lab_cli_v1.cjs -text`. A segunda [CI #41972968082](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41972968082) completou **4/4 jobs SUCCESS**, com `2/2` substituições rejeitadas e `10/10` amostras sem janela visível do pai/filho, mantendo privacidade. Detalhes em [`DELIVERYOS_READER_N2N3_ONE_SHOT_LAB_PROOF_20261105.md`](./DELIVERYOS_READER_N2N3_ONE_SHOT_LAB_PROOF_20261105.md).

**Diferença nativa importante para migração:** `TOP (@top)` seleciona **comandas** antes dos joins de itens (não corta diretamente linhas dos itens de uma comanda selecionada), mas não comprova cobertura de todas as comandas ou isolamento transacional. O V2 coloca a nota geral `DSOBSCOMANDA` antes das notas de item, enquanto o montador PR #135 a coloca depois; o array ordenado entra no hash. Mesmo conteúdo pode gerar hash distinto apenas pela ordem da serialização, sem nova revisão de cliente. Não disparar reimpressão, nova sequência ou alteração de trabalho por diferença de hash sem equivalência independente. [`DELIVERYOS_READER_V2_CANDIDATE_HASH_MIGRATION_HOLD_20261105.md`](./DELIVERYOS_READER_V2_CANDIDATE_HASH_MIGRATION_HOLD_20261105.md).

**Fronteira:** `CODE_READY + CI_PASS` para endurecimento de laboratório; `FIELD_EXECUTED=NO`, `READ_REAL_ORDER=NO`, `HOME_PUBLISH=HOLD`, `DEPLOY=NO`. PR #137 DRAFT/HOLD. Nenhum serviço, terminal, janela, impressora, lock ou banco do `CAIXA_MOOCA` foi alterado. L2–L8 preservadas.

## Checkpoint 05/11 — vínculo de metadados de um evento nativo

**Etapa atual: L1 de L8, N2/N3 HOLD, 0/8 aceites de campo.** Para reduzir a lacuna entre o Reader em funcionamento e o recibo N2/N3, foi criada uma função **sem qualquer I/O** em `runtime/reporting/native_reader_existing_event_binding_v1.cjs` que valida o checkpoint inteiro, seleciona uma única revisão estável e emitida e liga sua identidade/hash ao evento fornecido, sem publicar a chave e sem conceder `ordersPublishable`.

**Prova nova de campo estritamente sobre metadados:** leitura somente do checkpoint V2 no `CAIXA_MOOCA`: 250/250 entradas válidas no escopo `0001/01`, únicas, ordenadas, estabilidade >=2 e hash de emissão correspondente. Usando a fórmula de nome de arquivo do watcher instalado, `get_file_info` confirmou a existência do arquivo de **uma** revisão selecionada (5.227 bytes). **Arquivo de evento não foi aberto; itens, notas e hash interno não foram lidos.** Não houve comandos/processos/efeitos no host. Esta é a primeira ligação concreta **checkpoint → arquivo emitido**, não uma atestação de origem ou de completude.

**Prova sintética em CI:** [GitHub Actions #41974771649](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41974771649) **4/4 success**, incluindo `NATIVE_READER_EXISTING_EVENT_BINDING_PASS 16/16 SYNTHETIC_ONLY` e os 11 casos N2/N3 anteriores. A tentativa de editar o YAML do workflow foi bloqueada pelas configurações de segurança; em alternativa, a suíte foi integrada ao entrypoint de testes já existente, sem editar permissões de Actions.

**Documento de gate:** [`DELIVERYOS_READER_EXISTING_EVENT_BINDING_GATE_20261105.md`](./DELIVERYOS_READER_EXISTING_EVENT_BINDING_GATE_20261105.md). **Próxima fronteira:** autorização e prova de execução local invisível para comparar em memória uma única revisão já emitida, com resultado apenas sanitizado. Uma leitura desse arquivo ou execução no caixa não foi autorizada por esta implementação, e a atestação independente da origem/isolamento SQL permanece pendente. Não criar terceiro coletor, não copiar evento bruto, não mexer em impressoras/serviço/Edge. L2–L8 permanecem no plano original.

## Checkpoint 05/11 — prova integrada de uso único entre checkpoint e evento existente

**Etapa atual permanece L1 de L8, com N2/N3/N4/N5 em HOLD e 0/8 aceites de campo.** A entrega desta rodada está em `CODE_READY + CI_PASS`, sem `DEPLOYED` ou `WORLD_PROVEN`.

**Diferença importante:** o executor de laboratório passou a usar `synthetic-checkpoint.json → selectOne() → reader-events-v1/<arquivo emitido> → reviewOne() → receipt.json`, em vez de ler um evento por nome fixo. Nenhum segundo arquivo bruto é criado. O descritor privado não é enumerável em JSON; hashes ilegítimos em entradas não selecionadas e datas impossíveis provocam HOLD. A integridade de seis arquivos de código (script principal mais cinco dependências) agora é conferida antes de iniciar Node no Windows de CI, com `.gitattributes -text`.

**Campo somente metadados:** checkpoint existente do V2 no `CAIXA_MOOCA` reavaliado; **250/250** entradas válidas sob escopo Itaim, datas reais de calendário, ordem, digest e emissão estabilizada. Permanece a prova de existência de um arquivo emitido de **5.227 bytes**; **nenhum conteúdo foi aberto** nem programa executado no caixa.

**CI exata:** [#41976315120](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41976315120), `completed/success` 4/4 jobs. Contratos **20/20** de binding, **14/14** de uso único integrado, negativas Windows **3/3** para alterações de script/caminho/dependência e **10/10** verificações de janelas pai/filho não visíveis e foco preservado no laboratório.

**Prova, limites, próximo gate:** [`DELIVERYOS_READER_N2N3_EXISTING_EVENT_ONE_SHOT_INTEGRATED_GATE_20261105.md`](./DELIVERYOS_READER_N2N3_EXISTING_EVENT_ONE_SHOT_INTEGRATED_GATE_20261105.md). Sem autorização para executar a variante de laboratório no caixa; ela o proíbe. Próximo passo relevante **não é outro teste sintético semelhante**, mas uma autorização explícita e a homologação de uma variante mínima e silenciosa de campo que leia **uma única revisão já emitida no próprio host**, sem extrair bruto/PII, somada à atestação independente da leitura completa/origem SQL. N2/N3 seguem sem prova real; a Home não publica pedidos. L2–L8 preservadas no plano original.

## 05/11 — autorização condicional recebida; teste real bloqueado pelo canal de execução

**L1/N2–N3.** César autorizou **uma** revisão antiga, somente leitura e supervisionada, condicionada a zero janelas/terminal, zero alteração ou interferência no caixa e zero exportação de conteúdo bruto de cliente. **Não confundir autorização recebida com condição atendida ou execução concluída.**

O pré-check read-only no `CAIXA_MOOCA` encontrou checkpoint válido com 250/250 entradas estabilizadas, uma revisão selecionada e arquivo já emitido presente (5.227 bytes). O Reader segue `RUNNING`, com falhas consecutivas zero na amostra. **Nenhum pedido/observação foi aberto.** O canal `read_file` exportaria o bruto para a sessão; `start_process` usa shell PowerShell e não comprova invisibilidade no Windows efetivo. Nenhum dos dois satisfaz as condições; portanto, **FIELD_TEST=NOT_ATTEMPTED**, `N2/N3=HOLD`, `V1=0/8`, sem alteração no host.

A autorização e o blocker operacional ficam registrados em [`DELIVERYOS_READER_N2N3_EXISTING_EVENT_ONE_SHOT_INTEGRATED_GATE_20261105.md`](./DELIVERYOS_READER_N2N3_EXISTING_EVENT_ONE_SHOT_INTEGRATED_GATE_20261105.md). Próximo avanço: validar **invocação local sem terminal e sem exportação**; não solicitar repetição da mesma autorização nem substituir o bloqueio por execução arriscada.

## 05/11 — risco de janelas do Agendador e mitigação dos monitores ChatGPT

**Etapa L1 de L8 — N2/N3 HOLD, 0/8 aceites operacionais.** A autorização condicional de César para uma comanda antiga continua preservada; não autoriza alteração de tarefa/serviço nem execução de shell. Nenhum conteúdo de pedido foi aberto.

**Prova nova por leitura passiva do XML do Task Scheduler no `CAIXA_MOOCA`:** `DeliveryOS-Itaim-Reader-Observe` está habilitada e executa **Node.js diretamente em sessão interativa a cada dois minutos**, inclusive fora do horário do delivery, com `Hidden=false`. Seu `observer.cjs` não inicia processo filho, mas escreve diagnósticos existentes. A inicialização do próprio Node no desktop **pode** gerar uma janela; **não está comprovada causalidade de flashes**. Seis outras tarefas experimentais de PowerShell permanecem **desativadas**; a tarefa AudioMute chama executável nativo. Quatro tarefas independentes `TATA-GetIn-D1-*` também iniciam Node interativamente em horários de calendário específicos e não foram alteradas; PrintAgent está desativada. A configuração `Hidden` do Agendador só oculta a tarefa da lista do Windows, **não** oculta consola do programa.

**Mitigação preventiva realmente executada:** atualizados e conferidos os prompts das automações do ChatGPT `Delivery OS — Reader e Edge no almoço` e `TATÁ — integridade Comandas e Academia`, mantendo **ambas habilitadas e os horários**, para proibir `start_process`, PowerShell/CMD, shell e disparo de programa no caixa. Apenas leitura de status/metadados permitida. Não prova eliminação total das piscadas.

**Fonte externa de risco:** https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/852 , incidente conhecido de janelas e roubo de foco em Remote Desktop Commander Windows. Não assumir corrigido em v0.3.1 sem prova na máquina.

**Decisão de segurança:** manter intocada a tarefa Windows atual. Próxima rota é preparar, fora do caixa, um executável GUI sem console que preserve o observador, agendamento, permissões e arquivos de status; comprovar pai/filho sem janela no laboratório e planejar rollback. Mudança da tarefa no caixa exige **autorização distinta**. A prova N2/N3 de conteúdo real segue bloqueada até haver invocação silenciosa e privacidade local. Detalhes: [`DELIVERYOS_CAIXA_UI_FLASH_SCHEDULED_TASKS_PASSIVE_AUDIT_20261105.md`](./DELIVERYOS_CAIXA_UI_FLASH_SCHEDULED_TASKS_PASSIVE_AUDIT_20261105.md).

## 05/11 — S4U como rota mínima de execução não interativa

**Etapa permanece L1 de L8; N2/N3 em HOLD e 0/8 aceites operacionais.** A alternativa de uma execução sem janela para o `DeliveryOS-Itaim-Reader-Observe` passou a priorizar **`LogonType=S4U`** do Windows Task Scheduler, potencialmente dispensando novo launcher: o observador existente usa apenas arquivos locais, sem rede ou subprocessos no código auditado. A documentação Microsoft confirma S4U em desktop não interativo, mas sem acesso à rede/EFS. Permissões e direito `SeBatchLogonRight` da conta ainda **UNKNOWN**.

**Prova local passiva:** o XML atual está `InteractiveToken`, `Enabled=true`, `Interval=PT2M`, `MultipleInstancesPolicy=IgnoreNew` e `RunLevel=HighestAvailable`. Simulação em memória confirmou que **somente** substituir uma tag de `LogonType` preserva todos os demais campos byte a byte; nada foi registrado ou alterado. O Reader permaneceu `RUNNING` com zero falhas consecutivas; o observador continuou com `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`.

**Código/prova:** `runtime/silent-runner/reader_observer_noninteractive_xml_review_v1.cjs` é um validador puro e sem I/O que **sempre devolve HOLD**, bloqueando qualquer alteração ao XML além do único campo; `tests/silent-runner/run-reader-observer-noninteractive-review-tests.cjs` passou **12/12 sintéticos** e foi conectado ao workflow existente sem mudar permissões. [GitHub Actions #42031444001](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42031444001) completou **4/4 jobs success**, incluindo `READER_OBSERVER_S4U_XML_REVIEW_PASS 12/12 SYNTHETIC_ONLY_NO_TASK_CHANGE`. Isso **não é ensaio S4U real no Windows**, apenas revisão do XML em laboratório.

**Critérios para próxima intervenção:** provar direitos e ACL locais, equivalência de diagnósticos/status em VM isolada, execução não interativa sem foco/console e rollback por canal não intrusivo. Alteração da tarefa real requer **autorização distinta** daquela concedida para validar uma única comanda. Se S4U não funcionar, usar o launcher nativo sem console já testado; nunca reativar seis tarefas PowerShell experimentais. [Detalhamento e fontes](./DELIVERYOS_READER_OBSERVE_S4U_MINIMAL_NO_CONSOLE_GATE_20261105.md). A comanda real segue sem ser aberta e a Home sem publicar pedidos.

## 05/11 — S4U executado em VM Windows descartável, com arquivos locais e zero janela amostrada

**Etapa atual L1/8 — N2/N3 HOLD — 0/8 aceites operacionais.** Avançamos de revisão estática de XML para **execução efetiva da tarefa S4U numa VM GitHub descartável**: registro de uma tarefa temporária com conta da VM, `LogonType=S4U`, execução de Node sobre fixture local, leitura/gravação local, comprovante `LastTaskResult=0` após encerramento e remoção da tarefa temporária. **Nenhuma tarefa do caixa foi criada, modificada ou executada.**

**Prova:** [CI #42045292512](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42045292512), commit `3a233c4d463f3f5bc49cbb924a7a4f2447843231`, **4/4 jobs SUCCESS**. Log Windows: `S4U_DISPOSABLE_WINDOWS_LOCAL_IO_PASS 1/1 S4U_PRINCIPAL 10/10_NO_VISIBLE_HWND NO_FOCUS_CHANGE FICTIONAL_ONLY SESSION_0`; a suíte nativa anterior manteve `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45`. A primeira CI do novo teste falhou por enum `RunLevel` incorreto (`LeastPrivilege` vs `Limited` do cmdlet), e a segunda por leitura prematura do `0x41301` enquanto a tarefa ainda executava; ambas as falhas foram corrigidas com causa identificada, **não mascaradas**.

**Limite:** conta e ACLs do Windows do Itaim **não comprovadas**, nem execução real do `observer.cjs`, nem ausência total de flash na sessão operacional. A autorização anterior de César para **ler uma** revisão antiga, sob condições, **não autoriza modificar uma tarefa Windows**. Próximo gate é verificar permissões/identidade e planejar aplicação/reversão com autorização de efeito separada. Sem ação sobre Reader instalado, SQL, impressão, tela, Home ou pedidos. Evidência e gates: [`DELIVERYOS_READER_S4U_REAL_WINDOWS_LAB_PROOF_20261105.md`](./DELIVERYOS_READER_S4U_REAL_WINDOWS_LAB_PROOF_20261105.md). L2–L8 preservadas.

## 05/11 — discrepância LocalSystem x recibo: S4U de campo BLOQUEADO

**Etapa segue L1 de 8, N2/N3 pendentes, 0/8 aceites operacionais.** Uma revisão adversarial do estado instalado encontrou contradição **material** entre a tarefa Windows e seus recibos de instalação. No `CAIXA_MOOCA`, o XML original de `DeliveryOS-Itaim-Reader-Observe` declara `<UserId>S-1-5-18</UserId>` (**LocalSystem**), `LogonType=InteractiveToken`, `RunLevel=HighestAvailable` e `PT2M`. Os recibos contemporâneos `install-receipt.json` e `verification.json` citam a mesma tarefa, concordam entre si sobre outro principal e diferem literalmente do XML; `verification.json` declara `aclProtected=true`, mas **isso não comprova SID real, ACL NTFS nem direitos de execução**. Datas dos três artefatos confirmam que são do mesmo episódio de instalação, não apenas recibos de versão antiga. Nenhum nome de conta de pessoa, segredo, dado de pedido ou XML bruto foi transferido ao GitHub.

A documentação oficial de Task Scheduler separa `S4U` (conta de usuário) e `ServiceAccount` (LocalSystem, LocalService, NetworkService). A conclusão anterior de que bastaria alterar somente `InteractiveToken → S4U` estava **incorreta para o principal do XML instalado**; a prova na VM Windows com conta de usuário Limited/Highest continua válida para laboratório, mas é **inaplicável diretamente ao Itaim**. A suspeita de que a tarefa Reader pisca a tela porque contém `InteractiveToken` também foi rebaixada a hipótese **não confirmada**: principal de serviço pode não compartilhar desktop do operador. Não mudar `LogonType`, usuário, nível, Agendador ou serviço até autenticar a identidade efetiva de execução e origem das piscadas.

**Falha bloqueada com regra de código:** `runtime/silent-runner/reader_observer_noninteractive_xml_review_v1.cjs` recusa `S-1-5-18`, `S-1-5-19`, `S-1-5-20` com `BUILTIN_SERVICE_PRINCIPAL_NOT_ELIGIBLE_FOR_S4U`; a suíte `tests/silent-runner/run-reader-observer-noninteractive-review-tests.cjs` avançou para **15/15 casos** com este veto. Como a tarefa não foi registrada nem alterada, `FIELD=HOLD`. [Gate S4U corrigido](./DELIVERYOS_READER_OBSERVE_S4U_MINIMAL_NO_CONSOLE_GATE_20261105.md) e [auditoria de piscadas retificada](./DELIVERYOS_CAIXA_UI_FLASH_SCHEDULED_TASKS_PASSIVE_AUDIT_20261105.md).

**Próximo passo necessário:** obter prova passiva confiável da identidade efetiva e sessão onde a tarefa roda, comparando com XML e recibos, **sem chamar start_process/shell no caixa**; só depois decidir se há necessidade de mudar qualquer mecanismo de inicialização. A autorização anterior de César para ler uma única comanda não inclui modificar tarefa Windows. Nenhuma comanda, observação ou dado de cliente foi aberto; L2–L8 permanecem preservadas.

## 05/11 — shells ativos sem origem atribuída; não alterar o Reader por hipótese

Em uma amostra `list_processes` **somente leitura** no `CAIXA_MOOCA` foram encontrados 4 `powershell.exe`, 4 `cmd.exe` e 8 `node.exe`. Esses processos existem apesar das seis tarefas experimentais PowerShell estarem desativadas. **Não há evidência de que as instâncias estejam visíveis ao operador, nem correlação com a tarefa Reader, que no XML declara o principal `LocalSystem` (`S-1-5-18`).** A ferramenta não fornece conta/sessão/processo pai; não encerrar processos nem tocar nas tarefas sem prova adicional. [Diagnóstico de tela retificado](./DELIVERYOS_CAIXA_UI_FLASH_SCHEDULED_TASKS_PASSIVE_AUDIT_20261105.md).

**Prioridade corrigida:** reconciliar SID efetivo/recibos da tarefa e identificar processo-janelamento real por método passivo antes de propor qualquer alteração operacional. A rota S4U para a tarefa instalada está vetada em código (15/15 testes PASS). A prova Windows S4U de contas do laboratório não autoriza o caixa. Permanecem `L1=PARTIAL`, `N2/N3=HOLD`, `0/8` aceites de campo, com autorização condicional anterior restrita a uma leitura de pedido sem efeitos.



## Complemento L1 — proteção de tela e identificação da tarefa (05/11/2026)

Leitura passiva no `CAIXA_MOOCA`: definição XML da tarefa `DeliveryOS-Itaim-Reader-Observe` com `UserId=S-1-5-18`, `LogonType=InteractiveToken`, `PT2M`, `IgnoreNew` e `Enabled=true`; recibos contemporâneos registram `principal=SISTEMA`. `SISTEMA` é nome localizado da **mesma conta LocalSystem**, não usuário concorrente. Persistem UNKNOWN quanto ao token/sessão reais do processo e PID causador de eventual janela. `S4U` para esta identidade continua **BLOCKED**, com validador e casos de aliases/SIDs na PR #137.

Status agregado do observador em `2026-11-05T19:43:39.666Z`: `OUTSIDE_SERVICE_WINDOW`, `liveSourceVerified=false`, `operationalOrderTotal=null`. Último diagnóstico armazenado do almoço em `2026-11-05T17:59:39.254Z`: `UNAVAILABLE`, `SOURCE_CHANGED_DURING_READ`; esse registro **não comprova pedido válido nem prontidão**, e não autoriza alterar a fonte. Nenhum comando/shell/processo criado no caixa, nenhuma leitura de pedido bruto, nenhuma tarefa alterada. N2/N3, L1 e aceite da V1 permanecem **HOLD (0/8)**.

## Observação adicional do jantar — 05/11/2026, somente metadados

No `CAIXA_MOOCA` foi lido passivamente o arquivo de saúde já existente `state/reader-heartbeat-v1.json`, sem consultar SQL nem abrir arquivos de pedidos. O supervisor estava `RUNNING`, o `last_success_at` foi `2026-11-05T19:18:33.0134015-03:00`, `consecutive_failures=0`, e `last_batch.outcome=OK` (20 polls, zero erros de polling, sete eventos emitidos na contagem agregada do lote). **Sete eventos não significam sete comandas distintas, nem completude do universo.** No arquivo de diagnóstico `DeliveryOS-Itaim-Observer/status.json`, às `2026-11-05T22:17:39.273Z`, o estado `UNAVAILABLE` tinha motivo `SOURCE_REVISION_PENDING`, `liveSourceVerified=false` e total operacional nulo. A amostra do observador precede o término do lote bem-sucedido; não há prova de falha persistente nem de pedido publicável.

O levantamento passivo de quatro tarefas TATA-GetIn independentes identificou `node.exe` direto sob `InteractiveToken` em gatilhos diários com horários nominais 20h50, 20h55, 00h00 e 00h02 (São Paulo). A rotina `scheduled-runner.mjs` usa `windowsHide:true` no **filho**, não no processo pai criado pelo Agendador; `render-visual.mjs` usa navegador `headless:true`. Há risco plausível de janela do processo pai, **sem correlação PID↔janela e sem demonstração de popup**. Não mudar tarefas GetIn, Reader ou qualquer coisa de produção sob suspeita. Evidência completa: `DELIVERYOS_CAIXA_UI_FLASH_SCHEDULED_TASKS_PASSIVE_AUDIT_20261105.md`.

**Fronteira preservada:** `PRODUCTION_READER_RUNNING=OBSERVED`, `CURRENT_ORDER_COMPLETENESS=UNKNOWN`, `FLASH_CAUSALITY=UNKNOWN`, `WINDOWS_TASK_CHANGED=NO`, `ORDER_CONTENT_READ=NO`, `N2_N3=HOLD`, `V1_ACCEPTED=0/8`.

### Checkpoint posterior do jantar, 05/11 — 20h57 BRT

Leitura **somente de metadados preexistentes** no caixa: Reader `RUNNING`, `last_success_at=2026-11-05T20:57:47.8038677-03:00`, `consecutive_failures=0`, último lote `OK`, `polls=20`, `poll_errors=0`, `events_emitted=0` no lote. O observador à mesma janela declarou `OBSERVED_RECORDS`, `schedule=DINNER`, mas `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF` e `liveSourceVerified=false`. A saúde do processo e a existência de registros diagnósticos **não** promovem a fonte, a completude ou a autorização de Home.

A frente de janelas avançou por evidências independentes, não por intervenção: registro GetIn `SUCCESS` às 20h50min25s, PNG e recibo visual existentes gravados às **20h55min03s**. O rótulo `updatedAtBR='05/11, 20:50'` do visual é o horário da **fonte/coleta** (`r.updatedAtBR` no código), não o horário da renderização. Os quatro jobs GetIn com `node.exe` direto sob `InteractiveToken` continuam apenas candidatos de risco de console; falta atribuição da janela a PID/processo/sessão. Ver auditoria `DELIVERYOS_CAIXA_UI_FLASH_SCHEDULED_TASKS_PASSIVE_AUDIT_20261105.md`.

**Decisão:** não tocar em GetIn ou Reader no caixa sem prova de causalidade e mecanismo intrinsecamente silencioso. `FLASH_CAUSALITY=UNKNOWN`, `WINDOWS_TASK_CHANGED=NO`, `N2/N3=HOLD`, `L1=PARTIAL`, `V1_ACCEPTED=0/8`.
