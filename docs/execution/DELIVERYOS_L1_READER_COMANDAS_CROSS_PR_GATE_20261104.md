# Delivery OS Itaim — Gate L1 da fonte nativa (Reader ↔ TATÁ Comandas)

**Checkpoint:** 04/11/2026 BRT. **Escopo:** revisão de código e provas documentais, sem acesso ao SQL ou pedidos vivos. PR Delivery OS **#137**, branch `feat/gestor-shadow-observer-20261103`; PR TATÁ Comandas **#135**, branch `audit/comandas-native-chain-20261102`. Ambas DRAFT/HOLD, sem merge.

## 1. Decisão vinculante recuperada

O contrato de lançamento `docs/execution/DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md` exige L1→L8; para L1 (pedidos/itens/observações reais do Itaim), a **primeira opção** é reusar o Reader nativo existente, com autorização, comprovação de instalação e leitura estritamente read-only. A captura do DOM do Gestor é uma rota auxiliar de prova, **não** fonte total nem requisito para continuar estudando o Reader. Não habilitar API oficial, terceiro coletor, licença, instalação de extensão ou tarefas visíveis.

## 2. Contrato que efetivamente encaixa — e onde PARA

**Produtor puro da PR #135:** `tools/comandas_reader_native_note_rowset_v1_review_only.cjs`, lido na branch da PR #135 (Git blob `6ad65f3e0265f5312483019e9ec6eeefdab8f46f`). A partir de um *rowset sintético de uma consulta*, monta `privateEvent` com:
- schema `deliveryos.tata-reader-stable-order-event.v1`;
- `order_key=CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`;
- `snapshot_hash` canônico SHA-256 em letras minúsculas;
- 8 campos de cabeçalho, 5 de cada item, `observation_rows` ligadas por `item_index`/`CDPRODUTO`, `observation_scan_complete=true`;
- três campos possíveis de observação por item (DSOBSDESCIT, DSOBSPEDDIGCMD, TXPRODCOMVEN) e DSOBSCOMANDA por pedido, só uma vez.
O montador **não lê SQL, arquivos nem rede**; é função pura. `source_read_exhausted=true` é apenas uma alegação de quem fornece as linhas.

**Consumidor puro da PR #137:** `runtime/reporting/native_reader_producer_contract_review_v1.cjs` (Git blob `c753ac8c16aa1266b3eba2ba478614e49fc94e85`). Valida o schema, escopo `0001/01/DLV_IFO`, 4 partes da chave, hash canônico, linhas de item sem duplicidade e observações coerentes e completas. Sempre devolve `state:HOLD`, `ordersPublishable:0`, `actualNativeSourceAuthenticated:false`, `observationScanIndependentlyProven:false`, sem exportar as observações.

**Diferença crítica de autoridade:** o candidato do produtor #135 define `ready_for_downstream_shadow=false`, `sourceAuthenticated=false` e bloqueios explícitos. O adaptador `runtime/reporting/copiloto_tata_reader_adapter_v1.cjs` da #137 exige, além da forma válida, `ready_for_downstream_shadow=true`, `blockers=[]`, resolução de serviço, `observed_at` com fuso, `effects.database_read=true` e efeitos de escrita falsos. O montador #135 **não fornece nem atesta esses fatos**; não preencher os campos artificialmente nem mudar os bloqueios para passar no adaptador.

**Fronteira extra no arquivo de leitura:** `runtime/reporting/copiloto_tata_file_feed_v1.cjs` consegue projetar revisões de um *fixture* de checkpoint, mas mantém `live_source_verified:false` e `operational_order_total:null`. O modo declarado `sourceMode:'real'` e `mappingEvidenceRef` em string não são atestação independente. O estado `observed_records` nesse modelo é observação de arquivos, **não** prova de pedidos atuais no iFood nem autorização para Home.

## 3. Bloqueio novo confirmado ao ler o manifesto da PR #135

O manifesto `docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json` inclui explicitamente `file_write` para `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs`. O próprio `docs/comandas/CANDIDATA_FINAL_HOMOLOGACAO_20261102.md` registra um **STOP vigente de 04/11/2026**: esse consumidor pode ler `C:\ProgramData\TataComandaReader\state\tata-sequence-state.json`, escrever JSON em `outPath` e expor conteúdo/observações em stdout; o piloto de copiar o manifesto inteiro para o caixa está suspenso. Este checkpoint **não autoriza contornar esse STOP**. O montador puro pode ser analisado em laboratório; o consumidor com efeitos não deve ser executado no caixa.

## 4. Próxima prova que de fato libera o caminho L1

| Gate | Prova concreta necessária | Estado |
|---|---|---|
| N1 — binário original | Verificar versão/hash, identidade e permissões do Reader **efetivamente instalado** por canal autorizado, sem contornar ACL | UNKNOWN |
| N2 — rowset | Consulta limitada, de uma revisão real do Itaim, com permissão específica, sem escrita; provar isolamento da revisão, contagem de linhas, join de itens/notas e fim real de leitura | HOLD |
| N3 — canonicalidade | Demonstrar a paridade PowerShell↔Node e hash SHA-256 no envelope real sanitizado, sem transportar texto de clientes | LAB PASS, FIELD UNKNOWN |
| N4 — autorização e frescor | Comprovar unidade/origem e horário da fonte, serviço correto, ausência de efeitos, bloqueios resolvidos por evidência independente; emitir recibo sanitizado | HOLD |
| N5 — Home | Provar só a projeção em shadow do Copiloto existente, com `live_source_verified` separado de `sourceMode`, status físico desconhecido e sem recomendação de praça não medida | HOLD |

**Próximo ato de maior valor autorizado sem efeitos:** revisão estática da lacuna Reader instalado ↔ produtor completo da PR #135; preparar um protocolo de verificação `N1` **somente de leitura** para a identidade responsável pelo serviço, sem abrir SQL, copiar dados de cliente, executar Comandas com escrita, iniciar console no caixa, alterar ACL/serviço ou acionar impressora. Se N1 não puder ser executado por um canal comprovadamente silencioso, registrar bloqueio, não inventar verificação.

## 5. Resultado e escopo preservados

- **FACT:** PR #135 já possui montador puro e testes offline de observações; PR #137 possui verificador puro de envelope com bloqueio de publicação. Não significa que produtor real e consumidor operacional estejam conectados.
- **FACT:** manifesto da candidata inteira inclui escrita de arquivos e está em STOP para piloto no caixa.
- **UNKNOWN:** bytes/identidade do watcher instalado, autenticidade/frescor do rowset, autorização do SQL, exposição de UUID iFood e prontidão física por praça.
- **PROHIBITED:** ativação, merge, deploy, instalação de novo Reader, SQL em produção, captura de clientes, alteração do Gestor, impressão, ocultação automática do Edge ou qualquer comando que possa piscar CMD/PowerShell.
- **PR #137 permanece DRAFT/HOLD**. Este documento é decisão de contrato; **não** prova de campo nem liberação da V1.

## 6. Inspeção passiva do Reader V2 instalado — 05/11 00h BRT

**Nova evidência do CAIXA_MOOCA, SOMENTE leitura via API de arquivos, sem comandos, execução ou acesso a pedidos:**

1. **Arquivo presente:** `C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2.ps1`, 17.871 bytes (387 linhas), modificado em `2026-10-27T02:19:00.598Z`. O arquivo V1 também existe no diretório, mas o heartbeat identifica **V2** como watcher da execução vigente.
2. **Integridade independente do arquivo:** conteúdo textual completo lido pelo conector de arquivos (sem imprimir source, credenciais, observações nem IDs); calculado SHA-256 em JavaScript puro com implementação aferida no vetor conhecido `abc`. Retirado exclusivamente o `\n` acrescentado pelo envelope de transporte do conector, mantendo 17.871 bytes, hash calculado **`92B33E82ED72426BE46FE20BCB2A4F4557F9716108886F89E15A4E262C506D44`** = `watcher.expected_sha256` do heartbeat, que também relata `sha256_verified:true`. **Prova: conteúdo do watcher instalado corresponde ao hash esperado pelo supervisor**; não autentica SQL, serviço sob a identidade esperada ou dados do iFood.
3. **Saúde informada pelo heartbeat:** `deliveryos.tata-reader-heartbeat.v1`, `state=RUNNING`, última amostra observada pouco após 00h BRT de 05/11, `consecutive_failures=0`. Último lote com `outcome=OK`, 20 polls, 1000 snapshots observados, 0 eventos novos, 1000 revisões repetidas suprimidas. Totais históricos declarados pelo supervisor: 4.123 eventos emitidos em toda a vida do supervisor (NÃO pedidos únicos ou simultâneos), com falhas históricas, sem falhas consecutivas na verificação. A existência de heartbeat atualizado e lotes `OK` é evidência útil de atividade local, **não** de integridade/proveniência de cada revisão.
4. **Códigos de observações no V2 real:** a inspeção estrutural do script instalado verificou referências explícitas a `DSOBSCOMANDA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN`, `observation_rows` e `observation_scan_complete`. No ramo de evento o V2 monta `order.items`, marca `observation_scan_complete=true` e emite `observation_rows`. Isso **não é atestação independente do fim do SELECT/isolamento da revisão**.
5. **Diferença de hash confirmada por código:** instalado V2 usa `Hash-Text ($hashBasis|ConvertTo-Json -Depth 12 -Compress)`. O `snapshotHash()` no Delivery OS utiliza `JSON.stringify` canônico e exige SHA-256 minúsculo; a implementação PowerShell antiga pode escapar apóstrofos de modo diferente, como já demonstrado na auditoria da PR #135. **Correção de precisão:** `observation_scan_complete` é requisito de verificação estrutural, mas NÃO entra no `hashBasis` do V2 nem no `snapshotHash()` canônico; não atribuir divergência a esse campo. `observation_rows` entra no hash apenas quando não vazia em ambos.
6. **Janela de serviço:** arquivo `bin/production-service-weekly-policy.json` existe, `enabled=true`, escopo `ITAIM/0001/01`, efetivo desde 26/10, sete dias com almoço/jantar; no script instalado `Read-ServiceState` consulta essa política semanal. O `state/production-service-state.json` histórico datado de 14/10, **por si só**, não prova bloqueio do V2 atual.
7. **Cadeia sombra ativa, limite de valor:** `evidence/shadow-consumer-status.json` reporta `RUNNING` e processamento local, mas a projeção de relatório mostrou `SKIPPED_LOCKED` em status próprio; não afirmar cobertura/ready/completude da Home. O diagnóstico de Gestor V2 segue de 03/11 e não é fonte atual. Nenhum arquivo de revisão ou observação de cliente foi aberto nesta auditoria.

**N1 atualizado:** arquivo V2 instalado, conteúdo/hash e autodeclaração de saúde local **VERIFICADOS**, mas identidade efetiva da conta/serviço, prova de dados nativos reais completos, isolação SQL e permissão operacional continuam **UNKNOWN**. **N2–N5 continuam HOLD**; evento do watcher não se torna apto automaticamente porque existe e tem hash esperado. A PR #135 inclui um montador/serializador novos somente em laboratório; não copiar scripts nem executar consumidor `live_shadow_consumer_v2_candidate_v714.cjs`, cuja execução em host foi suspensa.

**Próximo teste material apropriado:** investigar um recibo **já existente e sanitizado** que demonstre `observation_scan_complete`, identidade de versão e hash sobre **uma mesma revisão corrente** sem acesso a texto de cliente. Se inexistente, definir atestação de origem/isolamento com operador autorizado, sem executar SELECT novo ou produzir tarefas com console no caixa.

## 7. Checkpoint de estabilização: metadados sanitizados, não conteúdo de pedido

**Data:** 05/11/2026, inspeção passiva no CAIXA_MOOCA. **Escopo de acesso:** API de arquivos para ler exclusivamente o checkpoint de metadados do watcher e status agregados, consultar informações de arquivos e listar nomes/PIDs de processos; **nenhum arquivo de evento com itens/observações foi aberto**, nenhum comando executado.

### Recibo do watcher
- `state/reader-watch-checkpoint-v1.json` já existe e apresenta `schema=deliveryos.tata-reader-continuous-checkpoint.v1`, `bootstrap_complete=true`, **250 entradas** (limite do checkpoint). Todas as 250 chaves de quatro partes começam pelo escopo `CDFILIAL=0001` e `CDLOJA=01` (Itaim); 250/250 têm `stable_count>=2`, `emitted_hash===snapshot_hash`, e hashes textuais de 64 caracteres hexadecimais.
- Estatísticas de arquivo (somente `get_file_info`, conteúdo **não lido**): três amostras em posições 0, 125 e 249 apontam para arquivos locais de evento existentes, de tamanhos 5.227, 4.519 e 3.791 bytes. Isso sustenta existência de emissão local persistida, **não** que linhas de pedido, anotações, cliente ou hash interno do JSON estejam corretos. As 250 entradas **não são 250 pedidos ativos** nem comprovam a completude da fila do iFood.
- `reader-heartbeat-v1.json`: supervisor relata `RUNNING`, `sha256_verified=true`, último lote `OK`, 20 polls, 1000 snapshots observados, nenhuma revisão nova, 1000 repetições suprimidas, zero falhas consecutivas; totais históricos `events_emitted=4123` e `failed=540` abrangem a vida da rotina, **não** pedidos atuais. Verificação anterior do SHA-256 do script instalado já conferiu o hash esperado, mas heartbeat e checkpoint são informações locais, não um recibo assinado da origem.
- Processo `powershell.exe` com PID 19140 apareceu na listagem de processos e coincide com PID declarado pelo supervisor no heartbeat; o serviço `TataComandaReader.ContinuousService.exe` também aparece ativo. **Isso não atesta** qual usuário/token executa o processo, isolamento transacional ou permissões do SQL.

### Bloqueio independente de projeção
- `evidence/shadow-consumer-status.json` relata `state=RUNNING`, `processed=4180` e `last_projection_status=SKIPPED_LOCKED` com contador `projection_runs=2314`. São **contadores históricos locais**, não pedidos presentes no salão/delivery.
- `evidence/reporting-projector-status.json` relata `SKIPPED_LOCKED`, atualizado em 05/11 02:01Z; `state/reporting-v1/projection-checkpoint.json` foi modificado em 30/10 21:09Z. `state/reporting-v1/projector.lock` contém somente PID decimal 31492 e teve mtime em 05/11 02:00Z. **PID 31492 não foi encontrado na amostra única de lista de processos** obtida depois. Isso cria a hipótese testável de lock persistente/órfão, mas **não prova** que esteja órfão agora, não demonstra qual rotina o mantém e **não autoriza** deletar o lock, matar processos ou reiniciar o projetor.
- `evidence/reporting-enrichment-diagnostic.json` informa `PROCESS_EXIT_NONZERO`, para diagnóstico referente ao dia 28/10, capturado em 05/11 02:01Z. Esse erro de enriquecimento não é prova de falha do Reader nem deve ser tratado como resolução do bloqueio de projeção.

### Difference Check e próximos critérios
1. **N1 (watcher instalado)**: arquivo/hash e atividade do supervisor verificados por fontes distintas; identidade efetiva da conta e atestação SQL ainda UNKNOWN.
2. **N2 (revisão e observações)**: checkpoint local indica emissões estabilizadas, mas sem inspeção autorizada e sanitizada do corpo de um evento não há evidência independente de `observation_scan_complete`, join, quantidade, nem isolamento de um único snapshot. Não classificar N2 como aprovado.
3. **N3 (hash canônico)**: permanece em HOLD por potencial divergência `ConvertTo-Json` V2 vs `JSON.stringify` (acentos/apóstrofo/observações). Só comparações sintéticas foram homologadas na PR #135.
4. **Projeção**: abrir investigação **de código/status, somente laboratório**, sobre `SKIPPED_LOCKED` e o ciclo de lock/heartbeat. Antes de qualquer intervenção no host exigir prova dupla de ausência de detentor, integridade de concorrência, rollback e autorização pontual. Não converter checkpoint de 30/10 em feed atual de Home.
5. **N4/N5** permanecem bloqueados; nenhuma alteração na aplicação operacional, SQL, tela, serviços, impressora, Edge ou Copiloto.

**Prova e efeito:** somente leitura e documentação versionada. Nenhuma carga de dados de cliente foi extraída para ChatGPT; a comparação dos metadados foi executada sem apresentar chaves individuais. Os resultados do checkpoint são **metadata-level**, não `WORLD_PROVEN`.

