# TATÁ Comandas — ponte do Reader existente para observações completas e hash canônico (03/11/2026)

**Escopo de autorização executada:** apenas desenvolvimento, testes fictícios offline no Foxxy e commits em PR #135 DRAFT. **Sem** SELECT real, serviço, ACL, chave, Gestor, impressão, SQL DDL ou ativação. Não introduzir outro watcher ou tarefa que possa piscar no caixa.

## Descoberta material, baseada em código

1. O watcher versionado `tools/tata_reader_continuous_watch_candidate_v1.ps1` (blob `8cc7415047bb982d236c1224fd9fdc1c7f1fb620`) lê cabeçalho e itens, mas não seleciona `DSOBSCOMANDA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD` nem `TXPRODCOMVEN`. Não emite `observation_rows`/`observation_scan_complete`. Consumidor e replayer exigem observações comprovadamente completas; não inventar lista vazia.
2. O hash antigo usa `ConvertTo-Json -Compress` seguido de `BitConverter` (SHA uppercase), enquanto `snapshotHash` canônico dos dois projetos usa `JSON.stringify` e lower-case. Diferencial real em Foxxy demonstrou que `ConvertTo-Json` escapa o **apóstrofo** (`\\u0027`) de maneira distinta de `JSON.stringify`. Só fazer `ToLowerInvariant()` não resolve; não normalizar ou alterar o texto da observação.
3. Não temos prova da versão efetivamente instalada dentro de `C:\ProgramData\TataComandaReader\bin`: ACL respeitada. A configuração Windows mostra o Reader em execução sob conta configurada `NT SERVICE\TataComandaReader`; token efetivo e integridade do binário permanecem desconhecidos. Nenhuma prova de pedido real atual.

## Conjunto mínimo de código preparado

- `tools/comandas_reader_native_note_rowset_v1_review_only.cjs` (já na PR #135): monta evento canônico em memória a partir de linhas fictícias coerentes, observações de pedido e itens, ordenação determinística e hash da função canônica já pinada. **Sempre mantém `ready_for_downstream_shadow=false`** e `sourceAuthenticated=false`. `source_read_exhausted=true` é uma declaração do chamador, não prova independente do SQL.
- `tools/comandas_reader_notes_single_select_v1_REVIEW_ONLY.sql`: template de **uma única instrução SELECT** com filtros exatos da filial/loja/origem Itaim e as 17 colunas previstas (8 cabeçalho, 5 item, 4 observações). Referências seguem joins nativos conhecidos, sem `NOLOCK` nem comandos de escrita. **Não executado**. A instrução isolada NÃO prova isolamento de snapshot sob READ COMMITTED, permissões ou bloqueios de concorrência.
- `tools/comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1`: serializador de subconjunto de valores deliberadamente estrito no PowerShell 5.1; gera o mesmo JSON e SHA-256 lower-case da função Node para objetos ordenados, itens, observações, acentos, apóstrofos, barras e caracteres de controle. Rejeita dicionários sem ordem, números fora do intervalo seguro de JS, tipos arbitrários, surrogates inválidos e profundidade excessiva. Não altera strings.
- Testes: `verificar_comandas_reader_canonical_json_cross_runtime_v1_offline.cjs` (**16/16 paridades byte-a-byte PowerShell↔Node**), `verificar_comandas_reader_canonical_json_safety_v1_REVIEW_ONLY.ps1` (**10/10 casos de segurança**), `verificar_comandas_reader_notes_single_select_v1_offline.cjs` (**13/13 inspeções estáticas**, zero SQL) e `verificar_comandas_reader_native_note_rowset_v1_review_only.cjs` (**24/24**). Total dos quatro grupos **63/63 testes locais**, todos no Foxxy. **Integração adicional real entre os dois runtimes (1/1 PASS):** `verificar_comandas_reader_multi_note_canonical_v1_offline.cjs` e seu fixture PowerShell produzem exatamente o mesmo JSON UTF-8 e SHA-256 do montador nativo para dois itens e três observações fictícias (inclusive apóstrofo). Isso soma **64/64 cenários/verificações locais**, mas não autoriza fonte real nem impressão. Comparação cruzada independente entre esse montador e o replayer da PR #137 também havia sido demonstrada com dois itens/três observações, terminando em `HOLD`.

## O que esses testes NÃO provam

A presença de 17 colunas em uma query estática não prova que o SQL Server aceita essa consulta, que a conta Reader possui `SELECT` em todos os campos, que o resultado é livre de truncamento, que `TOP` não corta linhas, nem que a leitura foi feita sobre uma versão atômica. O serializador testado cobre o **subconjunto** usado no envelope e os vetores realizados, não todos os objetos .NET possíveis. Nenhum teste comprova data/frescor, semântica de estados 3/P/X, UUID iFood independente, sequência TATÁ assinada ou ausência de duplicação na impressão.

## Gates para próxima execução autorizada

1. Validar a versão dos **arquivos realmente executados** do Reader por um canal oficial e com permissão específica, sem contornar ACL. Confirmar que o mesmo serviço existente continuará a operar silenciosamente.
2. Antes de qualquer mudança de serviço, fazer ensaio estático/diferencial de **um snapshot fictício completo** no mesmo formato usado pelo watcher — cabeçalho, itens, notas, hash — e definir prova de isolamento transacional/estabilidade de revisão para a execução futura.
3. Em janela acordada, com backup/rollback e autorização específica, executar **uma** leitura atual limitada de Itaim sob a identidade comprovada do Reader existente; sem exportar dados de cliente ou observações brutas ao ChatGPT. `source_read_exhausted` não pode ser autoatestado; exigir contagem, origem e resultado da consulta real.
4. Só após essa prova, obter ID/UUID iFood único por canal independente legitimamente autorizado, confirmar ciclo de vida, assinar/atestar sequência TATÁ com identidades distintas e testar emissão exclusiva da Conferência.
5. Manter as comandas de Cozinha e Sushi na Teknisa. Candidatas de densidade noturna 110/120/130% continuam apenas offline até teste de papel forte **e** nítido, com autorização própria.

**Fronteira atual:** `CODE_REVIEW_READY=YES`, `TEST_FIXTURES_PASS=64`, `LIVE_SQL_TEST=NOT_ATTEMPTED`, `INSTALLED_WATCHER_VERSION=UNKNOWN`, `OPERATIONAL_PRINT=HOLD`, `NEW_DEPLOY=NO`.
