# TATÁ Comanda Reader — causa raiz do "RUNNING mas parado" e o supervisor de lotes

**Data:** 2026-10-07 · **Revisão:** 2026-10-08 (revisão independente incorporada) · **Branch:** `feat/cloud-solo-reader-resilience-20261007` · **Base:** `73626d0`
**Classificação:** causa raiz = FACT em sandbox (SQL Server 2022 real, dados sintéticos, PowerShell 7/.NET 8) + **INFERENCE de alta confiança para produção** · correção = CODE_READY + TEST_PASS · **nada instalado na CAIXA** (não WORLD_PROVEN).

## 1. O que aconteceu em 05/10 (handoff)

Serviço `TataComandaReader` RUNNING, watcher e shadow vivos, sessão SQL `sleeping`, último request real `21:55:51`, último checkpoint `21:55:45` — 6 s antes. Nenhuma linha de erro em lugar nenhum.

## 2. Causa raiz — reproduzida em sandbox, inferida em produção

O watcher instalado (`tools/tata_reader_continuous_watch_candidate_v1.ps1` @ `256dc42`, SHA-256 `4507304C…CAA9A`, **o mesmo SHA** de `candidate.reader_sha256` na evidência do cutover de 05/10 14:36) faz, a cada poll:

```
$reader=$cmd.ExecuteReader()
while($reader.Read()){ ... }      # sem try/finally
$reader.Close()
...
} catch { $result.poll_errors++; if($MaxPolls -gt 0){throw} }   # modo contínuo: engole
```

Com `SET LOCK_TIMEOUT 2000`, uma espera de lock acima de 2 s dentro de `Read()` lança SQL 1222 **depois** de o leitor estar aberto. O `Close()` nunca roda. A conexão é única e nunca refeita. Daí em diante, todo `ExecuteReader()` falha **no próprio cliente** — `There is already an open DataReader associated with this Command which must be closed first.` — sem chegar ao SQL Server. O `catch` incrementa um contador em memória e o laço segue para sempre.

Reprodução (harness, `npm run test:tata-reader:sqlserver`, X1): lock X de 5 s nos itens de **um** pedido, como o PDV faz no pico. Resultado:

| sinal | 05/10 produção | harness |
|---|---|---|
| processo | vivo | vivo |
| sessão SQL | `sleeping` | `sleeping` |
| último request depois do último checkpoint | +6 s (poll 3 s + lock 2 s + ~1 s) | +3 s (poll 1 s + lock 2 s) |
| checkpoint depois de liberar o lock | parado | parado (≥ 8 s observados) |
| stderr | vazio | vazio |

Mensagens capturadas com uma cópia de diagnóstico (só para leitura do erro engolido): 1ª falha `Exception calling "Read"… "Lock request time out period exceeded."`, todas as seguintes `…already an open DataReader…`, uma por segundo, para sempre.

Derrubar a conexão (KILL da sessão) **não** reproduz: o SqlClient reconecta conexão ociosa sozinho. O defeito é especificamente o leitor aberto.

**Ressalva (revisão independente):** o stall exige que o 1222 apareça **dentro de `Read()`** e não no `ExecuteReader()`, apesar do `ORDER BY` externo que bloqueia. Isso só foi demonstrado com o SqlClient do PowerShell 7/.NET 8 no Linux. No Windows PowerShell 5.1/.NET Framework 4.8 da CAIXA, o mesmo código e a mesma mensagem existem, mas o momento em que a espera de lock aparece (buffer TDS) **não foi medido**. Por isso a causa em produção continua **INFERENCE**, não FACT.

A revisão posterior `a1808d8` (SHA `F5747293…`) só muda `Read-ServiceState` — o laço é idêntico. O **v2** (SHA `77C16940…`, só na CAIXA) não está no Git: UNKNOWN; como ele acrescenta result sets ao mesmo comando, a exposição tende a ser **maior** (erro em `NextResult()`/`Read()` dos sets 2 e 3). O harness do v2 rodou em modo limitado (MaxPolls=2), em que o erro **lança** — por isso não podia ver o defeito.

## 3. Correção — supervisor de lotes

`runtime/tata-reader/tata_reader_supervisor_v1.ps1` roda o watcher auditado **sem alterar um byte**, em lotes `-MaxPolls N` — exatamente o modo em que ele foi provado (o erro lança, o `finally` externo fecha a conexão, o processo sai ≠ 0). Cada lote = processo novo + conexão nova: o veneno não atravessa lotes.

Entre lotes: SHA-256 do watcher conferido a cada lote · resultado do lote validado (schema, `COMPLETED`, `polls`, `poll_errors=0`) · **efeito proibido declarado, ou efeitos não declarados, param o supervisor (FATAL, 78)** · lote sem checkpoint novo por `progress_stall_seconds` é encerrado (`PROGRESS_STALL`) · lote acima de `batch_timeout_seconds` é encerrado · backoff exponencial limitado · instância única por lock · heartbeat atômico `deliveryos.tata-reader-heartbeat.v1`.

**Nunca dois escritores.** O lote filho é registrado (PID + hora de início) antes de ler; se o registro falha, o filho é morto e a morte confirmada (`CHILD_RECORD_WRITE_FAILED`); se um filho não morre, nenhum lote novo começa (`BLOCKED_CHILD_ALIVE`); registro ilegível de uma execução anterior vira quarentena. PID reutilizado nunca é tocado (PID + hora de início, tolerância 1 s).

**Nunca cai por acidente.** A recuperação do serviço é 5 s, 15 s e depois *nenhuma* (reset 24 h). Erro de SQL, de arquivo (antivírus, indexador, a janela do `File.Replace` em que o checkpoint não existe), de processo ou interno vira lote falho com backoff (`SUPERVISOR_INTERNAL_ERROR:<classe>`) e verdade no heartbeat. Saídas: **75** (outra instância viva, depois de 15 s), **78** (configuração inválida, watcher adulterado ou ausente por 5 lotes, efeito proibido ou não declarado), **0** só com `-MaxBatches` (testes) e **70** só se um erro escapar de todas as proteções.

**Privacidade do heartbeat:** só contadores, horários, SHAs e uma **classe fechada** de erro (`LOCK_TIMEOUT`, `OPEN_DATAREADER`, `COMMAND_TIMEOUT`, `SQL_CONNECTION`, …) com o número SQL quando houver. Texto bruto do erro fica só no log local do host. Provado com stderr contendo número de pedido e nome: nada disso chega ao heartbeat.

**Instalação sem recompilar o host:** o host C# v2 tem o caminho do watcher compilado. O supervisor aceita a mesma linha de comando e é instalado **nesse caminho fixo**; o v2 fica ao lado com nome próprio; a configuração (`tata_reader_supervisor_v1.config.json`, validada fail-closed) diz qual watcher e qual SHA.

**Lote órfão:** `Stop-Service` mata só o supervisor (o host chama `Process.Kill()` no filho direto); o lote em curso segue até o próprio limite. Caso típico: 20 polls × 3 s ≈ 1 min. Pior caso: `batch_timeout_seconds` = 20 × (3 + 20) + 60 = **520 s**; quarentena de órfão sem registro legível = 20 × (3 + 10) + 30 = **290 s**. O rollback do cutover não espera: encerra pela linha de comando e confirma.

## 4. Saúde real

`runtime/tata-reader/tata_reader_health_v1.cjs` (função pura + CLI): só **progresso** prova saúde — heartbeat vivo, último lote OK recente, checkpoint recente. Status do host e do consumidor **só pioram** o veredito. Vocabulário de saída = o do observador de saúde de fonte do produto (`saudavel | parcial | stale | indisponivel`). A assinatura de 05/10 (host RUNNING + consumidor RUNNING + checkpoint parado) dá `STALLED`. Limiares derivados da cadência declarada no próprio heartbeat.

**Leitura tolerante à troca de arquivo do NTFS** (`0153592`): `File.Replace` são dois renames e, entre eles, o caminho não existe. A leitura antiga (`existsSync` + `statSync`) caía nessa janela — o CLI morria com pilha no stderr e `/api/fontes` respondia 500 com o caminho local. Num escritor que reabre a janela em laço, 1,5 s de leitura antiga lançou 406 vezes e viu "ausente" 7480 vezes; a nova, em ~40 mil leituras, zero e zero. Agora: 3 tentativas com 15 ms; ausente = sinal ausente; ilegível ou sem acesso = sinal inválido; nunca lança. Na superfície, assíncrona (a pausa não bloqueia o servidor).

## 5. Auditoria estática — heurística, não leitura humana

`runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs <watcher.ps1>` (schema `…static-audit.v2`) tokeniza o PowerShell (strings, here-strings, comentários) e:
- acusa leitor fora de `finally`, erro engolido sem sinal durável, conexão não refeita;
- confere as três propriedades que o supervisor exige (modo limitado lança; checkpoint a cada poll; resultado no schema);
- **proíbe** forma de escrita SQL em **qualquer** literal; `ExecuteNonQuery`/`SqlBulkCopy`/`BeginTransaction`; código dinâmico (`Invoke-Expression`/`iex`, `Add-Type`, `[ScriptBlock]::Create`, `-EncodedCommand`, `Start-Process`, `Invoke-Command`, `Start-Job`, `DllImport`); `CommandText` que não seja exatamente um literal sem interpolação; rede; impressão; ausência de checagem de identidade.

v1 → `INSTALL_ONLY_UNDER_SUPERVISOR` (achados: `READER_NOT_CLOSED_IN_FINALLY`, `POLL_ERRORS_SWALLOWED_IN_CONTINUOUS_MODE`, `CONNECTION_NOT_RESET_AFTER_ERROR`). Os três contornos que a revisão achou em `d48bd42` (UPDATE entre aspas simples + `ExecuteNonQuery`, SQL montado por variável, `iex` em base64) agora dão `DO_NOT_INSTALL` (A11–A13). **Ainda é heurística** (`human_review_required: true`): o v2 tem de ser **lido por uma pessoa** antes de instalar. A barreira real contra escrita continua sendo o login do serviço só com SELECT.

## 6. Cutover com rollback automático

`runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1` (recibo `…cutover-receipt.v2`):

1. `-Mode Plan` (padrão, só leitura): identidade do serviço, SHA do v2 = `77C16940…`, auditoria do v2, checkpoint do v2 compatível com o atual (outro schema = migração de estado = decisão humana), saúde antes. Devolve em `apply_requires` os **três** SHA que o Apply exige de volta: watcher instalado, binário do host e supervisor.
2. `-Mode Apply -ExpectedInstalledWatcherSha256 … -ExpectedHostBinarySha256 … -SupervisorSha256 …`: qualquer SHA diferente aborta **antes** de qualquer efeito. Depois, cada fase é protegida por rollback: **parar** (e confirmar que nenhum watcher antigo ficou vivo) → **backup** com manifesto SHA → **instalar** por temporário + SHA + troca atômica (v2 em `bin\…_v2.ps1`, config, supervisor no caminho fixo; heartbeat velho fora do caminho) → linha de base do checkpoint com o serviço parado → **iniciar** e **observar** por até 480 s: SCM Running · host atualizado depois do restart · heartbeat da **mesma** execução do supervisor (troca de `run_id` ou de PID do serviço = reinício = falha imediata) · SHA do supervisor e do v2 · ≥ 2 lotes OK · zero falhas consecutivas · último lote OK · efeitos **declarados** pelo watcher dentro da política do cutover · checkpoint andou · saúde `HEALTHY` · consumidor não FAILED; opcionais que só reprovam com FAIL: sessão SQL nova (`-SqlSessionCheck`, só leitura de DMV) e privacidade dos eventos novos.
3. Gate reprovado ou **qualquer exceção** depois do primeiro efeito → **rollback**: parar; encerrar todo processo PowerShell cuja linha de comando cite o candidato ou o caminho fixo, e confirmar — **se algum não morrer, não restaura** (dois escritores no checkpoint) e pede humano; restaurar watcher e checkpoint conferindo SHA; tirar candidato, config e heartbeat do caminho; iniciar; só é `ROLLBACK_PROVEN` com checkpoint andando, watcher restaurado byte a byte e zero processo do candidato.

Saída: **0** `PLAN_OK`/`APPLIED_HEALTHY` · **3** rollback provado · **2** qualquer outro desfecho (humano). Erro inesperado vira recibo e 2; saída 1 só se o PowerShell falhar antes de o script rodar (por exemplo, parâmetro inválido).

**Provado até aqui:** funções puras e contrato com o supervisor (`test:tata-reader:cutover` 13/13, inclusive o fuso UTC-3 — C12); o script **inteiro** com Apply e rollback **executados** contra SCM simulado (`test:tata-reader:e2e` 7/7, em UTC e em UTC-3). **Preparado e ainda não executado:** o mesmo script contra o **SCM real** do Windows, com o host C# v2 real compilado pelo `csc.exe` e a conta virtual (`tests/tata-reader/windows/real_scm_cutover_e2e.ps1`, job `windows-real-scm`) — depende do push. **Nunca executado:** na CAIXA.

## 7. Gates

| gate | resultado | onde roda |
|---|---|---|
| `test:tata-reader:health` | 17/17 | Node puro (H17: janela real dos dois renames) |
| `test:tata-reader:static` | 13/13 | Node puro |
| `test:tata-reader:supervisor` | 22/22 (o supervisor de `d48bd42` passa 14/22) | PowerShell 7.4.6 (Linux), watcher falso |
| `test:tata-reader:cutover` | 13/13 | PowerShell 7.4.6, dot-source |
| `test:tata-reader:e2e` | 7/7 (UTC e America/Sao_Paulo) | PowerShell 7.4.6, SCM simulado |
| `tests/tata-reader/ps51_compat_check.ps1` | 0 achados, controle 3/3 | PSScriptAnalyzer 1.23.0, perfil WinPS 5.1 |
| `test:tata-reader:sqlserver` | 3/3 | PowerShell 7.4.6 + SQL Server 2022 Developer (digest `4402d880…`), dados sintéticos |
| `test:platform:saude-fontes` | 9/9 | Node + servidor HTTP real |

Suítes que precisam de ferramenta se declaram **PULADAS em voz alta** quando ela falta. Harness: `TATA_HARNESS_SA_PASSWORD=… tools/tata_reader_harness_sqlserver.sh start`, depois `TATA_HARNESS_SQLSERVER=127.0.0.1,14333 TATA_PWSH=$(which pwsh) npm run test:tata-reader:sqlserver`.

**Windows PowerShell 5.1 — o que é e o que não é prova.** Estático: o PSScriptAnalyzer com perfil `5.1.17763 / .NET Framework 4.x` sobre supervisor, cutover e watcher instalado dá 0 achados, com controle positivo. Membros .NET chamados em variável o analisador não enxerga; conferidos à mão contra o .NET Framework 4.5: `File.Replace` de 4 argumentos com backup não nulo, `File.Move` de 2, `File.GetLastWriteTimeUtc`, `DateTime.FromFileTimeUtc`, `Process.Kill()`/`WaitForExit(int)`/`StartTime`, `StreamReader.ReadToEndAsync`, `String.IndexOf(string, StringComparison)`, `Path.Combine`, `DateTime.ParseExact`/`Parse` com `DateTimeStyles`. `Process.Kill($true)`, `ProcessStartInfo.ArgumentList` e `File.Move` de 3 argumentos (só .NET Core) **não** são usados. **Em execução, o 5.1 ainda não rodou**: é exatamente o que o job `windows-real-scm` prova.

**Limites do harness SQL:** PowerShell 7/.NET 8 no Linux, não Windows PowerShell 5.1/.NET Framework; login SQL em vez de `NT SERVICE` + SSPI (as únicas cinco trocas, ancoradas uma a uma em `tests/tata-reader/harness/make_watcher_fixture.ps1`).

## 8. Próximo passo seguro na CAIXA (ordem exata)

1. Recuperar o v2 e conferir `77C16940…` (`Get-FileHash`). Publicar o v2 byte a byte no Git e **uma pessoa lê o v2** (a auditoria é heurística).
2. `node runtime\tata-reader\tata_reader_watch_static_audit_v1.cjs <v2>` — esperado `INSTALL_ONLY_UNDER_SUPERVISOR`.
3. `powershell -File runtime\tata-reader\tata_reader_supervisor_cutover_v1.ps1 -Mode Plan -RepoRuntimeDir <checkout>\runtime\tata-reader` → `PLAN_OK` e os três SHA em `apply_requires`. O supervisor publicado neste commit tem SHA-256 `F6E17EB9A14D575ED7C572D2C59B551AD9E75809903E6540875AEF49093BF580`; o Plan tem de mostrar o mesmo (checkout sem CRLF — `.gitattributes`).
4. Fora do pico: `-Mode Apply -ExpectedInstalledWatcherSha256 <…> -ExpectedHostBinarySha256 <…> -SupervisorSha256 <…> -SqlSessionCheck` → `APPLIED_HEALTHY` (saída 0) ou rollback provado (saída 3); saída 2 = parar e chamar humano.
5. Publicar o recibo sanitizado. Só então `LIVE_READER_WORLD_PROVEN`.

## 9. O que esta revisão corrigiu no próprio relato de `d48bd42`

| estava escrito | o que é verdade |
|---|---|
| "causa raiz reproduzida" (handback §0.1) para 05/10 | Reproduzida **em sandbox** (.NET 8). Em produção é **INFERENCE** de alta confiança — §2, ressalva. |
| "rollback automático", "saída 3 = rollback provado" | Em `d48bd42` nenhum teste executava Apply nem rollback, e exceção depois do primeiro efeito saía com 1 sem rollback. Hoje: rollback em toda falha pós-efeito, executado no ensaio com SCM simulado (7/7); SCM real ainda pendente. |
| "o supervisor só sai com 78 ou 75" | Falso em `d48bd42` (a revisão o derrubou com saída 1). Corrigido em `3215447`; ver §3 para as saídas reais. |
| "compatível com Windows PowerShell 5.1" | Só análise estática. Execução no 5.1: job `windows-real-scm`, pendente. |
| "código instalado = código auditado" | O v2 é fixado por SHA e passa por uma heurística; **ninguém o leu**. Leitura humana é passo obrigatório (§8). |
| gate "sem efeito proibido" | Era sempre verde (lia um campo que o supervisor fixa em falso). Trocado por efeitos declarados contra a política do cutover. |
| "órfão vive ≤ ~1 min" | Caso típico. Pior caso 520 s (tempo máximo de lote); o rollback o encerra sem esperar. |
