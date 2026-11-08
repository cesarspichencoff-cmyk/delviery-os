# TATÁ Comandas — persistência de falhas de leitura no jantar (07/11/2026)

**PR #135 · Etapa 3 · evidência de arquivo preexistente, não de SQL novo.** Atualizado em 08/11/2026 por leitura estritamente passiva do `CAIXA_MOOCA` (host físico do Itaim). Não equivale a prova do plano da candidata nem da causa da não integração iFood→Teknisa.

## Observação nova

- Fonte: trecho de log já existente `evidence/continuous-watcher.stderr.log`, leitura de cauda por conector de arquivos, sem iniciar processo ou executar consulta.
- No intervalo **07/11/2026 18:12–22:41 BRT**, o trecho lido registra **20 eventos `BATCH_FAILED` do Reader V2**:
  - **11** com erro de tempo de espera por bloqueio SQL, na leitura de resultados (`Read`);
  - **9** com tempo limite de execução da consulta (`ExecuteReader`).
- Esses 20 eventos são **lotes falhos do Reader**, não 20 pedidos perdidos, 20 deadlocks ou 20 ocorrências comprovadas de escritores bloqueados.
- Leitura adicional dos JSONs de diagnóstico em **08/11/2026 às 02:53 BRT**: Reader `RUNNING`, último lote concluído `#14422` `OK` com 20 polls e zero erros nesse lote; `consecutive_failures=0`, `watcher.sha256_verified=true`. Totais acumulados no heartbeat: **14.422 lotes, 13.817 OK, 605 failed**, `events_emitted=6.194`. Os **605** incluem falhas históricas de toda a execução, não apenas desse jantar.
- Comparação limitada: o registro passivo de 06/11 22:22 BRT tinha `failed=577`; agora `failed=605`, portanto houve **+28 falhas acumuladas entre os dois checkpoints**. Não atribuir as 28 à mesma hora, à mesma raiz ou à integração de pedidos.
- Consumidor sombra em 08/11 02:53 BRT: `RUNNING`, `processed=6305`, `ready_count=1150`, `blocked_count=5155`, `print=false`, `spooler_write=false`. Esses indicadores são internos e não medem pedidos físicos, completude semântica ou papel.
- Verificação *somente de existência do caminho exato* do logException da Teknisa nos dias 07/11 e 08/11 retornou `ENOENT` nesses dois caminhos. Isso **não prova ausência de deadlock**, porque a fonte pode não ter sido gravada, estar em outra localização ou ser incompleta.

## Interpretação e decisão

**FACT:** as falhas por espera de lock e por execução SQL continuaram a ocorrer no jantar de 07/11; o Reader estava em operação com último lote normal na observação de 08/11. A CI do commit `1b27f77558d311e8ce8d52ae9f1a036f741d4d3f` foi **`completed/success`** em Linux e Windows, workflow [#42443919273](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42443919273).

**UNKNOWN:** quem bloqueou quem, se o Reader participou de deadlock, se houve escritores prejudicados, se pedidos iFood deixaram de integrar nesses mesmos intervalos, plano e impacto da consulta `SERIALIZABLE` candidata, e se uma revisão já estava semanticamente completa.

**Decisão:** não executar a candidata `SERIALIZABLE` no caixa para experimentar solução, pois aumentar o isolamento pode elevar a contenção e não provar o fechamento semântico dos commits. Continuar separando falha de leitura do Reader de falha de ingestão iFood/Teknisa. O próximo teste material para causalidade é a análise **off-host** de um grafo XEL real após obtenção íntegra por canal autorizado e validado; a PR #143 contém um analisador offline, mas os bytes reais permanecem não adquiridos. Em paralelo, reconciliar ingestão nativa e exportação oficial iFood por janela e chave com autorização e minimização de dados.

## Fronteira de efeitos

Nenhum CMD, PowerShell, processo, SQL de pedidos, SHOWPLAN, cópia binária XEL, serviço, alteração de Reader, impressão, sequência, spooler, instalador ou merge foi executado no host nesta observação. O registro no GitHub é **documentação apenas**, não mudança do serviço.

`STAGE_3=IN_PROGRESS` · `N2_A_LOCK_SAFETY=UNKNOWN` · `N2_B_SEMANTIC_COMPLETENESS=UNKNOWN` · `READER_CAUSALITY=UNKNOWN` · `STAGE_4=NOT_AUTHORIZED` · `PRINT/CUTOVER=HOLD`.
