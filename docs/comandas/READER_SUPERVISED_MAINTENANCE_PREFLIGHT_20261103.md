# Reader Itaim — pré-ensaio de manutenção supervisionada — 03/11/2026

**Autorização de César:** "Sim" à manutenção supervisionada no Reader do Itaim com **possível interrupção breve do serviço**, para obter diagnóstico de isolamento SQL e uma revisão atual depois dos gates anteriores. A autorização permite avaliação e intervenção reversível controlada; **não exige parar o serviço quando isso não acrescenta prova**. Não foram autorizados impressão automática, alteração global do SQL Server, uso de credenciais de terceiro, abertura indiscriminada de ACL, parada de Teknisa/iFood ou cutover.

## Estado verificado (host real CAIXA_MOOCA, consultas por interface já autorizada)

- Dispositivo online. `list_processes` mostra `TataComandaReader.ContinuousService.exe` em execução PID **21020**, além de `sqlservr.exe` e `spoolsv.exe`.
- `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json` atualizado em **2026-11-04T00:21:39.224Z** (03/11 21:21 BRT): 250 arquivos examinados, 249 históricos, **1 projeção diagnóstica**, `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`. Este número NÃO prova pedido real.
- `TataComandaReader\bin\TataComandaReader.ContinuousService.exe`, watcher em `bin`, `evidence\continuous-host-status.json` e `state\reader-watch-checkpoint-v1.json` retornaram **EPERM** com a identidade do conector. **Sem bypass, sem tentativa de escrever no diretório protegido**. Por isso `INSTALLED_BINARY_HASH`, `INSTALLED_WATCHER_HASH`, `CHECKPOINT_DURABILITY` e `READER_EFFECTIVE_TOKEN` são UNKNOWN.
- O relatório acessível `TataComandaReader\reports\delivery-report-current.proof.json` foi produzido em 05/10 e declara `database_read=false` na sua materialização. Não serve para RCSI/SNAPSHOT ou revisão recente do serviço.
- O script legado `C:\Users\Tata\DeliveryOS-V1-Shadow-20261102\reader-acesso-minimo-itaim.ps1` possui `Apply` que modifica ACL sob elevação; foi lido, não executado.
- `sc qc` anterior identificou o logon CONFIGURADO `NT SERVICE\TataComandaReader` e `SERVICE_SID_TYPE_NONE`, mas `Win32_Process.GetOwner` respondeu `ReturnValue=2` (ACCESS_DENIED). Não substituir a identidade efetiva por essa informação declarativa.

## Problema específico de reiniciar sem preparar

**Código versionado, não provado como bytes instalados:** `runtime/windows/TataComandaReader.ContinuousService.v2.cs`, em `OnStop()`, executa `KillChild(_watcher)` e `KillChild(_shadow)`; `KillChild` usa `process.Kill()` e `WaitForExit(5000)`. NÃO aparece nesse fluxo uma drenagem de captura nem uma confirmação de checkpoint persistido antes de terminar os filhos. O watcher versionado `tools/tata_reader_continuous_watch_candidate_v1.ps1` salva o checkpoint após emitir eventos e trata polls de três segundos; interromper no meio da gravação pode alterar cobertura/recuperação. Isto é **risco inferido do código candidato**; não declarar perda real nem equivalência com o binário inacessível.

**Outro bloqueio:** o service wrapper versionado tem `OnStart`, `OnStop`, `OnShutdown`, mas não um comando autenticado de diagnóstico SQL no serviço existente. O código novo `tools/comandas_reader_actual_identity_isolation_probe_v1_NOT_DEPLOYED.ps1` exige `NT SERVICE\TataComandaReader` antes de qualquer SQL; foi testado em Foxxy (**12/12 PASS**, inclusive falsificação apenas do nome do host), não instalado. **Reiniciar a versão atual não faz esse diagnóstico aparecer.**

### Decisão da manutenção autorizada

`MAINTENANCE_PREFLIGHT=STOP_SAFE`:
- **Não** enviar `sc stop`, `sc start`, `Restart-Service`, `Stop-Process`, `taskkill`, `Set-Acl`, `ALTER DATABASE` ou executar o probe com a conta `CAIXA_MOOCA\Tata`.
- **Nenhum downtime** causado nesta rodada; serviço e produção preservados.
- A ausência de efeito não é uma homologação do SQL: `RCSI/SNAPSHOT=UNKNOWN`; `ONE_LIVE_ORDER=NOT_READ`.

## Menor condição necessária para intervenção efetiva

1. **Acesso administrativo legitimamente autorizado**, via canal oficial, que permita inspecionar os hashes/versionamento do Reader instalado e o checkpoint/eventos **sem copiar dados de clientes** ou alterar ACL geral. O conector atual não possui esse acesso.
2. **Rota documentada de execução como o Reader real** do único `SELECT` de catálogo já preparado (ou uma extensão de diagnóstico oficialmente revisada no mesmo serviço, com implantação assinada/reversível). Não substituí-la por `sqlcmd` da conta do operador ou `SYSTEM`.
3. Antes de qualquer restart: backup verificável e mecanismo de **drenagem/retomada sem perda/duplicação**, prova de estabilidade de pedidos ativos, verificação de horários/janela supervisionada, checklist de retorno ao mesmo HEAD/serviço e tempos máximos de parada. Sem essa prova, abortar mesmo com autorização para breve interrupção.
4. Somente após os gates 1–3: um único SELECT de metadados sob login efetivo, sem PII; isolar e registrar `DB_NAME`, `SUSER_SNAME`, RCSI ON/OFF, estado SNAPSHOT, horário e retorno do serviço. **Se isolamento inviável/SQL negar, abortar** e manter os pedidos reais bloqueados.
5. Uma revisão real recente de Itaim precisa de autorização/contrato distinto de dados, prova de observações/joins completos, origem Reader e UUID iFood independente. Nunca imprimir automaticamente como efeito colateral de um diagnóstico.

**Definição de prova:** `SCM_RUNNING=OBSERVED`; `APPROVED_SUPERVISED_MAINTENANCE=YES`; `ACTUAL_DIAGNOSTIC_CHANNEL=NOT_AVAILABLE`; `SAFE_RESTART_REHEARSAL=NOT_PROVEN`; `SERVICE_STOP=NOT_ATTEMPTED`; `SQL_QUERY=NOT_EXECUTED`; `CUSTOMER_DATA_READ=NO`; `PRINT=NO`.

**Próximo passo:** acesso administrativo oficialmente permitido e definição da rota sob identidade Reader; só então novo pré-ensaio de restart. A intervenção não pode ser aprovada apenas porque o serviço é tecnicamente parável.
