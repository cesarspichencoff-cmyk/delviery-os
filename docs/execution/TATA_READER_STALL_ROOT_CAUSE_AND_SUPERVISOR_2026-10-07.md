# TATÁ Comanda Reader — causa raiz do "RUNNING mas parado" e o supervisor de lotes

**Data:** 2026-10-07 · **Branch:** `feat/cloud-solo-reader-resilience-20261007` · **Base:** `73626d0`
**Classificação:** causa raiz = FACT em sandbox (SQL Server 2022 real, dados sintéticos) + INFERENCE de alta confiança para produção · correção = CODE_READY + TEST_PASS · **nada instalado na CAIXA** (não WORLD_PROVEN).

## 1. O que aconteceu em 05/10 (handoff)

Serviço `TataComandaReader` RUNNING, watcher e shadow vivos, sessão SQL `sleeping`, último request real `21:55:51`, último checkpoint `21:55:45` — 6 s antes. Nenhuma linha de erro em lugar nenhum.

## 2. Causa raiz — reproduzida

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

A revisão posterior `a1808d8` (SHA `F5747293…`) só muda `Read-ServiceState` — o laço é idêntico. O **v2** (SHA `77C16940…`, só na CAIXA) não está no Git: UNKNOWN; como ele acrescenta result sets ao mesmo comando, a exposição tende a ser **maior** (erro em `NextResult()`/`Read()` dos sets 2 e 3). O harness do v2 rodou em modo limitado (MaxPolls=2), em que o erro **lança** — por isso não podia ver o defeito.

## 3. Correção — supervisor de lotes

`runtime/tata-reader/tata_reader_supervisor_v1.ps1` roda o watcher auditado **sem alterar um byte**, em lotes `-MaxPolls N` — exatamente o modo em que ele foi provado (o erro lança, o `finally` externo fecha a conexão, o processo sai ≠ 0). Cada lote = processo novo + conexão nova: o veneno não atravessa lotes.

Entre lotes: SHA-256 do watcher conferido a cada lote (código instalado = código auditado, continuamente) · resultado do lote validado (schema, `COMPLETED`, `polls`, `poll_errors=0`) · **efeito proibido declarado no resultado para o supervisor (FATAL, 78)** · lote sem checkpoint novo por `progress_stall_seconds` é encerrado (`PROGRESS_STALL`) · lote acima de `batch_timeout_seconds` é encerrado · backoff exponencial limitado · instância única por lock · lote órfão de host morto é encerrado antes do próximo (PID + hora de início, tolerância 1 s; PID reutilizado nunca é tocado) · heartbeat atômico `deliveryos.tata-reader-heartbeat.v1`.

**Privacidade do heartbeat:** só contadores, horários, SHAs e uma **classe fechada** de erro (`LOCK_TIMEOUT`, `OPEN_DATAREADER`, `COMMAND_TIMEOUT`, `SQL_CONNECTION`, …) com o número SQL quando houver. Texto bruto do erro — que pode citar valor de linha — fica só no log local do host. Provado com stderr contendo número de pedido e nome: nada disso chega ao heartbeat.

**Instalação sem recompilar o host:** o host (C# v2) tem o caminho do watcher compilado. O supervisor aceita a mesma linha de comando e é instalado **nesse caminho fixo**; o v2 fica ao lado com nome próprio; a configuração (`tata_reader_supervisor_v1.config.json`, validada fail-closed) diz qual watcher e qual SHA.

**Orçamento do SCM:** a recuperação do serviço é 5 s, 15 s e depois *nenhuma* (reset 24 h). Por isso o supervisor **não** sai por erro de SQL — ele mesmo refaz o lote com backoff e diz a verdade no heartbeat. Ele só sai em erro de configuração/adulteração (78) ou lock tomado (75).

## 4. Saúde real

`runtime/tata-reader/tata_reader_health_v1.cjs` (função pura + CLI): só **progresso** prova saúde — heartbeat vivo, último lote OK recente, checkpoint recente. Status do host e do consumidor **só pioram** o veredito. Vocabulário de saída = o do observador de saúde de fonte do produto (`saudavel | parcial | stale | indisponivel`). A assinatura de 05/10 (host RUNNING + consumidor RUNNING + checkpoint parado) dá `STALLED`. Limiares derivados da cadência declarada no próprio heartbeat.

## 5. Auditoria estática

`runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs <watcher.ps1>`: acusa leitor fora de `finally`, erro engolido sem sinal durável, conexão não refeita; confere as três propriedades que o supervisor exige (modo limitado lança; checkpoint a cada poll; resultado no schema); proíbe verbo SQL de escrita, rede, impressão e ausência de checagem de identidade. v1 → `INSTALL_ONLY_UNDER_SUPERVISOR`. **Rodar sobre o v2 na CAIXA é o primeiro passo do cutover** (o script de cutover já faz isso no `-Mode Plan`).

## 6. Cutover com rollback automático (CODE_READY — só roda na CAIXA)

`runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1`:

1. `-Mode Plan` (padrão, só leitura): identidade do serviço, SHA do v2 = `77C16940…`, auditoria do v2, **checkpoint do v2 compatível com o atual** (outro schema = migração de estado = decisão humana), saúde antes. Imprime o SHA do watcher instalado.
2. `-Mode Apply -ExpectedInstalledWatcherSha256 <o SHA impresso no Plan>`: backup com manifesto SHA → v2 em `bin\…_v2.ps1` → config → supervisor no caminho fixo → `Restart-Service` → gates por até 480 s: SCM Running · host RUNNING depois do restart · heartbeat novo · SHA do supervisor e do v2 · ≥ 2 lotes OK · zero falhas consecutivas · checkpoint andou · saúde `HEALTHY` · sem efeito proibido · consumidor não FAILED; opcionais que só reprovam com FAIL: sessão SQL nova (`-SqlSessionCheck`, só leitura de DMV como o operador) e privacidade dos eventos novos (`truth.privacy`, tempos de produção/entrega nulos).
3. Qualquer gate falhou → **rollback automático**: para o serviço, restaura watcher e checkpoint conferindo SHA, retira a config, inicia, prova checkpoint andando. Recibo JSON sanitizado em `state\supervisor-cutover-v1\<carimbo>\`.

Saída: 0 aplicado saudável · 3 rollback provado · 2 qualquer outro desfecho (humano).

**Não provado aqui:** `Get-Service`/`Restart-Service`, ACL, comportamento do Windows PowerShell 5.1 e do host C# — só existem na CAIXA. As funções puras do cutover e o contrato com o supervisor estão provados (`test:tata-reader:cutover` 8/8).

## 7. Gates

| gate | resultado | onde roda |
|---|---|---|
| `test:tata-reader:health` | 15/15 | Node puro |
| `test:tata-reader:static` | 10/10 | Node puro |
| `test:tata-reader:supervisor` | 12/12 | PowerShell 7.4.6 (Linux), watcher falso |
| `test:tata-reader:cutover` | 8/8 | PowerShell 7.4.6, dot-source |
| `test:tata-reader:sqlserver` | 3/3 | PowerShell 7.4.6 + SQL Server 2022 Developer (digest `4402d880…`), dados sintéticos |

Suítes que precisam de ferramenta se declaram **PULADAS em voz alta** quando ela falta. Para o harness: `TATA_HARNESS_SA_PASSWORD=… tools/tata_reader_harness_sqlserver.sh start`, depois `TATA_HARNESS_SQLSERVER=127.0.0.1,14333 TATA_PWSH=$(which pwsh) npm run test:tata-reader:sqlserver`.

**Limites do harness:** PowerShell 7/.NET 8 no Linux, não Windows PowerShell 5.1/.NET Framework; login SQL em vez de `NT SERVICE` + SSPI (as únicas cinco trocas, ancoradas uma a uma em `tests/tata-reader/harness/make_watcher_fixture.ps1`); `ConvertFrom-Json` do PS 7 converte data ISO em `[datetime]` (o supervisor trata os dois casos; o watcher, no PS 7, ordena o checkpoint por texto de data cultural — irrelevante com 60 pedidos sintéticos < 250 entradas).

## 8. Próximo passo seguro na CAIXA (ordem exata)

1. Recuperar o v2 e conferir `77C16940…` (`Get-FileHash`).
2. `node runtime\tata-reader\tata_reader_watch_static_audit_v1.cjs <v2>` — esperado `INSTALL_ONLY_UNDER_SUPERVISOR`. Publicar o v2 byte a byte no Git **antes** de instalar.
3. `powershell -File runtime\tata-reader\tata_reader_supervisor_cutover_v1.ps1 -Mode Plan -RepoRuntimeDir <checkout>\runtime\tata-reader` → `PLAN_OK…` com o SHA instalado.
4. Fora do pico: `-Mode Apply -ExpectedInstalledWatcherSha256 <SHA do passo 3> -SqlSessionCheck`.
5. Publicar o recibo sanitizado. Só então `LIVE_READER_WORLD_PROVEN`.
