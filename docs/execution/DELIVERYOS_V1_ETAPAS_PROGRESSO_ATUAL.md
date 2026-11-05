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

