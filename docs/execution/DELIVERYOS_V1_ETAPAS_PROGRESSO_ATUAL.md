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
