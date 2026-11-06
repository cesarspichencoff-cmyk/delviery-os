> **RETIFICAÇÃO MATERIAL — 05/11/2026, após leitura de identidade:** a tarefa `DeliveryOS-Itaim-Reader-Observe` tem `<UserId>S-1-5-18</UserId>` no XML físico, isto é, **LocalSystem**, e os recibos contemporâneos registram `principal=SISTEMA`, nome localizado da **mesma** identidade LocalSystem. A divergência de conta anteriormente inferida não existe nas três fontes examinadas. O `LogonType=InteractiveToken` por si só **não prova que o observador seja iniciado no desktop do operador**, já que a identidade de serviço descoberta muda a interpretação da sessão. Portanto, a hipótese abaixo de que o `node.exe` do Reader causa piscadas fica **rebaixada a NÃO CONFIRMADA**. O incidente de janelas pode ter outras origens, incluindo ferramentas remotas ou outras tarefas; não atribuir causalidade por nome ou frequência de tarefa. **S4U para LocalSystem é rota defeituosa** e foi bloqueada pelo validador. Não alterar task Windows por essa hipótese. Ver [gate corrigido](./DELIVERYOS_READER_OBSERVE_S4U_MINIMAL_NO_CONSOLE_GATE_20261105.md).

# Delivery OS Itaim — auditoria passiva de janelas CMD/PowerShell e tarefas Windows

**05/11/2026. Etapa de produto:** L1/8, N2/N3 ainda HOLD, 0/8 aceites de campo. **Objetivo paralelo:** eliminar janelas que atrapalhem o caixa, antes de qualquer execução de teste real. Este diagnóstico foi obtido somente por leitura de **definições XML de tarefas e código de observador**, sem acionar tarefas, executar PowerShell, tocar em pedidos, copiar dados de clientes ou alterar o Windows.

## Causas candidatas verificadas, não confundir com causalidade comprovada

| Tarefa no host Itaim (`CAIXA_MOOCA`) | XML Enabled | Programa da ação | Contexto | Frequência / nota |
| --- | --- | --- | --- | --- |
| `DeliveryOS-Itaim-Reader-Observe` | `true` | `node.exe` direto | `InteractiveToken`, `HighestAvailable`, `Hidden=false` | `PT2M` (cada 2 minutos), inclusive fora da janela operacional |
| `DeliveryOS-Itaim-Observer-AudioMute` | `true` | executável nativo, sem shell direto | `InteractiveToken`, `LeastPrivilege` | AtLogOn, não identificado como fonte de terminal |
| `DeliveryOS-Itaim-Edge-Gestor-Guard` | `false` | PowerShell | InteractiveToken | experimental, desativada |
| `DeliveryOS-Itaim-GestorOriginalCards-Shadow` | `false` | PowerShell | InteractiveToken | experimental, desativada |
| `DeliveryOS-Itaim-GestorV2-Edge-Sidecar-Guard` | `false` | PowerShell | InteractiveToken | experimental, desativada |
| `DeliveryOS-Itaim-GestorV2-Hidden-Guard` | `false` | PowerShell | InteractiveToken | experimental, desativada |
| `DeliveryOS-Itaim-GestorV2-Receiver-Guard` | `false` | PowerShell | InteractiveToken | experimental, desativada |
| `DeliveryOS-Itaim-SporeMirror-Shadow` | `false` | PowerShell | InteractiveToken | experimental, desativada |
| Quatro tarefas `TATA-GetIn-D1-Collector/Visual` (incluindo variantes de horário) | `true` | `node.exe` direto | `InteractiveToken`, `LeastPrivilege` | gatilhos de calendário em horários específicos; **outra frente operacional**, não alterar aqui |
| `TATA-PrintAgent-Itaim` | `false` | PowerShell | InteractiveToken | tarefa de impressão desativada; não tocar |

**Dado de código importante:** `C:\ProgramData\DeliveryOS-Itaim-Observer\observer.cjs` usa Node diretamente, grava `status.json` e `last-window-status.json`, e **não contém chamada a `child_process.spawn/exec`**. Assim, o ponto de risco do Reader Observe é a **inicialização do processo console no contexto interativo do Task Scheduler**, não uma invocação de PowerShell dentro do script. Isso é uma **hipótese causal**, não um registro real de flash correlacionado ao PID e horário. O `status.json` lido mostrou `OUTSIDE_SERVICE_WINDOW` com `observedAtUtc=2026-11-05T06:49:39.341Z`, mostrando que a rotina era atualizada fora do delivery; não identifica janela visível.

**Correção conceitual importante:** `Settings.Hidden=true` do Windows Task Scheduler **não suprime a janela de console do programa**; conforme Microsoft, esse campo apenas oculta a **entrada da tarefa na interface do Agendador**. Não resolver a queixa apenas mudando esse campo. Fonte: https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-hidden-settingstype-element .

**Risco confirmado na ferramenta remota (independente):** há incidente público ainda aberto no Desktop Commander Windows v0.2.52 relatando janelas PowerShell e roubo de foco por `start_process`: https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/852 . O host hoje informa Remote Commander 0.3.1, mas não existe prova específica da invocação invisível nessa sessão. Por isso, `start_process` e shells permanecem bloqueados no `CAIXA_MOOCA`.

## Mitigação já executada (fora do Windows do caixa)

Foram **atualizados e conferidos**, preservando `is_enabled=true` e os horários originais, os prompts de duas automações do ChatGPT:

- `Delivery OS — Reader e Edge no almoço`;
- `TATÁ — integridade Comandas e Academia`.

Ambas agora proíbem explicitamente no `CAIXA_MOOCA`: `start_process`, `interact_with_process`, PowerShell/CMD, scripts via shell, consultas de tarefas via comandos, disparo de programa, instalação ou alterações de serviço. Limitam-se a `list_devices`, `list_directory`, `get_file_info`, `read_file` **somente de status agregados existentes** e, quando necessário, `list_processes`. Metadados de tarefa não acessíveis de forma passiva viram `UNKNOWN`. Essa mitigação reduz risco de popup proveniente **dessas automações**; não prova que eram a causa das piscadas ou que outras fontes foram eliminadas.

## Rota mínima de correção, ainda NÃO autorizada para efeito

1. **Não desabilitar o Reader nem as tarefas TATÁ-GetIn às cegas.** O observador Reader pode sustentar diagnósticos úteis; as outras tarefas pertencem a processos operacionais independentes.
2. Reutilizar o padrão de **lançador nativo Windows `winexe` (subsistema GUI, sem terminal)** com `UseShellExecute=false`, `CreateNoWindow=true`, stdout/stderr redirecionados e um `node.exe` filho, já comprovado em **10 amostras de janela e foco** no Windows da CI #41976315120. Este padrão de LAB não é executável homologado para o host.
3. Preparar substituição exclusiva da ação `DeliveryOS-Itaim-Reader-Observe` **sem mudar** o agendamento `PT2M`, identidade da conta, diretório, argumentos, saídas de status, permissões, horários das tarefas independentes ou efeitos sobre pedidos. Incluir hash do script e todas as dependências e retorno de diagnóstico, sem exportar logs pessoais.
4. Primeiro comparar em laboratório **saída do observador original vs execução por lançador nativo** e medir janelas de **pai e filho** e foco, sem criar terminal visível. Comparar o risco de execução concorrente e preparar rollback exato da definição XML existente.
5. **Antes de mudança no caixa**, obter autorização **separada para alterar uma tarefa Windows**; a aprovação já recebida de uma revisão real, somente leitura, não autoriza essa alteração. Em ensaio de campo, verificar funcionamento do status e ausência de janelas no desktop ativo. Falha = rollback supervisionado, sem interrupção de Reader ou impressão.
6. Somente com **canal de invocação sem terminal comprovado** e autorização vigente, considerar a leitura de **uma comanda já emitida**, inteiramente local e sanitizada, para N2/N3. Não usar o conector `read_file` para extrair conteúdo bruto.

**Status:** `PASSIVE_SCHEDULE_AUDIT=PROVEN`; `POWER_SHELL_EXPERIMENTAL_TASKS_DISABLED=PROVEN`; `READER_NODE_PT2M=PROVEN_XML`; `READER_DESKTOP_INTERACTIVE=UNKNOWN`; `FLASH_CAUSALITY=UNKNOWN`; `CHATGPT_AUTOMATIONS_GUARDED=DONE`; `WINDOWS_TASK_CHANGED=NO`; `ORDER_CONTENT_READ=NO`; `L1_N2_N3=HOLD`.

## Evidência nova — shells ativos apesar das tarefas experimentais desativadas

**Amostra passiva de processos em 05/11/2026, tarde BRT:** `list_processes` no `CAIXA_MOOCA` retornou **4 processos powershell.exe**, **4 cmd.exe** e **8 node.exe**, além de outros processos do Windows. A lista revela nome, PID e consumo aproximado, **não** revela conta/SID efetivo, sessão Windows, árvore pai-filho, janela visível ou motivo de execução. Essas contagens são transitórias, não uma medida de frequência de piscadas. O monitor de sessões remotas retornou somente duas sessões identificadas como `node:local`, que **não permitem associar os oito shells aos processos remotos nem ao Reader**.

**Distinção essencial:** seis tarefas experimentais de PowerShell do Delivery OS estão efetivamente desativadas por definição XML, mas isso **não significa que o Windows não tenha outros processos CMD/PowerShell ativos**. Os terminais podem atender a outras rotinas, ferramentas ou usuários; a causa ainda é `UNKNOWN`. Não encerrar processos, desabilitar tarefas ou reiniciar serviços baseado nessas contagens.

**Efeito:** sem processo novo, sem shell executado pelo assistente, sem toque na área de trabalho ou dados de pedidos; apenas chamadas `list_processes`/`list_sessions` passivas. A rota `S4U` da tarefa Reader permanece **BLOCKED por principal LocalSystem**; os recibos `SISTEMA` e o SID `S-1-5-18` são consistentes quanto à identidade nominal. A primeira condição para uma intervenção futura é identificar **sessão/owner/PID/parent de uma janela que de fato aparece**, por canal passivo e autorizado, e não modificar a tarefa Reader por suspeita.



## Retificação de causa — 05/11/2026, leitura passiva de XML e recibos

`S-1-5-18` (XML) e `SISTEMA` (`install-receipt.json`/`verification.json`) representam LocalSystem, conforme https://learn.microsoft.com/pt-br/windows-server/identity/ad-ds/manage/understand-security-identifiers . A hipótese de **duas contas diferentes é descartada**; não confundir nome localizado com SID. Continua sem prova a sessão/token do processo e a correlação PID↔janela. `LogonType=InteractiveToken` permanece no XML; S4U **não é opção válida para LocalSystem** e a tarefa permanece intacta. A auditoria foi exclusivamente leitura de arquivos já existentes, sem comandos/shell/processos ou acesso a pedidos.

## Inspeção passiva adicional — tarefas independentes TATA-GetIn (05/11/2026)

Leitura direta, **sem iniciar comandos ou tarefas**, de quatro arquivos XML do Agendador no `CAIXA_MOOCA` e de dois arquivos-fonte locais (`TataGetinD1/src/scheduled-runner.mjs` e `TataGetinD1/src/render-visual.mjs`). Os quatro XMLs apresentam `Enabled=true`, `CalendarTrigger` diário (`DaysInterval=1`), `LogonType=InteractiveToken`, `RunLevel=LeastPrivilege` e ação **`node.exe` diretamente**, sem lançador GUI nativo na ação. Identificações das tarefas e horários extraídos literalmente do `StartBoundary`:

| Tarefa | StartBoundary XML | Conversão nominal São Paulo (UTC−03) | Ação |
| --- | --- | --- | --- |
| `TATA-GetIn-D1-Collector` | `2026-10-29T03:00:00Z` | 00:00 | `node.exe` → `scheduled-runner.mjs` |
| `TATA-GetIn-D1-Visual` | `2026-10-30T00:02:00-03:00` | 00:02 | `node.exe` → `render-visual.mjs` |
| `TATA-GetIn-D1-Collector-2050` | `2026-10-30T23:50:00Z` | 20:50 | `node.exe` → `scheduled-runner.mjs` |
| `TATA-GetIn-D1-Visual-2055` | `2026-10-30T23:55:00Z` | 20:55 | `node.exe` → `render-visual.mjs` |

São **instâncias distintas do Reader**, não tarefas experimentais previamente desabilitadas. A correspondência nominal de horário é apenas conversão dos campos XML: **sem prova de horário efetivo de execução, de janela visível, de host pai/filho nem de foco alterado**. Não deduzir que uma piscada ocorreu nesses minutos sem observação temporal.

Código: `scheduled-runner.mjs` chama `spawn(process.execPath, ['.../detail-report.mjs'], {windowsHide:true, stdio:['ignore','pipe','pipe']})`. Esse `windowsHide` protege o **processo filho** solicitado por `spawn`, não altera a forma como o **processo pai `node.exe`** é iniciado pelo Agendador. Documentação: https://nodejs.org/api/child_process.html. `render-visual.mjs` usa `chromium.launch({channel:'chrome',headless:true})`, indicando intenção de renderizar sem navegador visível, mas não suprime por si só um console do processo Node pai. `InteractiveToken` indica sessão interativa já conectada, conforme https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-logontype-principaltype-element .

**Difference Check:** a hipótese anterior centrada no Reader `LocalSystem` era insuficiente. As quatro ações GetIn possuem características que justificam **prioridade para correlação de campo** nos minutos nominais acima, porém continuam `CANDIDATE_NOT_CAUSALITY_PROVEN`. A rotina GetIn é independente: **não executar/desabilitar/reprogramar seus jobs nem alterar seus arquivos no escopo Delivery OS**. Se algum popup for objetivamente atribuído ao processo pai, preparar correção na frente responsável com lançador de subsistema GUI e prova de equivalência/rollback, sob autorização própria; não migrar essas tarefas S4U por padrão.

**Próxima prova real:** associação `evento de janela visível → timestamp → PID → parent PID → SessionId → usuário/token → definição de tarefa`, sem títulos, textos ou dados de cliente. Não há ainda canal passivo da ferramenta remota que comprove essa associação no desktop do caixa. Até lá: `FLASH_CAUSALITY=UNKNOWN`, `GETIN_CONSOLE_RISK=SOURCE_SUPPORTED_HYPOTHESIS`, `WINDOWS_TASK_CHANGED=NO`, `N2_N3=HOLD`, `V1_ACCEPTED=0/8`.

## Janela programada de 20h50/20h55 — confirmação por metadados de execução (05/11/2026)

No horário do jantar, feita somente **leitura passiva de arquivos já existentes** e enumeração de processos; não foi iniciada sessão de shell, ferramenta de tela, processo novo, navegador ou tarefa no caixa. O arquivo `C:\Users\Tata\AppData\Local\TataGetinD1\out\run-status.json` registrou `status=SUCCESS`, `mode=WINDOWS_SCHEDULER`, `targetDate=2026-11-06` e `finishedAt=2026-11-05T23:50:25.122Z` (**20h50min25s BRT**). O arquivo `out\reservas-20261106.png` teve modificação em **2026-11-05T23:55:03.594Z** (**20h55min03s BRT**), e `out\visual-state.json` foi modificado em **2026-11-05T23:55:03.604Z** (**20h55min03s BRT**) e declara `status=VISUAL_READY`. A dupla de modificações confirma escrita de arte e recibo no horário do segundo job nominal, **mas não comprova diretamente a instância específica da tarefa, seu token, PID ou comportamento visual**.

**Correção de interpretação de timestamp:** o campo `out\visual-state.json.updatedAtBR` continha o texto **`05/11, 20:50`**, embora o arquivo tenha sido gravado às **20h55min03s**. A inspeção do código `src\render-visual.mjs` mostrou que a propriedade `updatedAtBR` é preenchida **a partir de `r.updatedAtBR` (fonte da coleta de reservas)**, não de `new Date()` na conclusão da renderização. Não se trata de prova de renderização às 20h50 ou de não execução às 20h55; separar explicitamente **horário da coleta** de **horário da escrita do PNG**. Não alterar o rótulo operacional sem requisito de UX e revisão do projeto GetIn.

**Snapshot de processos:** a enumeração passiva reportou 8 `node.exe`, 4 `cmd.exe`, 4 `powershell.exe` e 10 `conhost.exe` em um instante posterior à janela investigada. São contagens transitórias; sem `ParentProcessId`, `SessionId`, token ou `GetWindowThreadProcessId`, a presença de console não demonstra *qual* programa causou uma piscada. `Node` executado diretamente pelo Agendador sob `InteractiveToken` continua hipótese plausível; não classificar como defeito provado apenas pela configuração. **Nenhuma janela real foi medida.**

**Status da investigação:** `GETIN_2050_RECEIPT=SUCCESS`, `GETIN_VISUAL_2055_FILE_WRITE=OBSERVED`, `GETIN_2055_TASK_INSTANCE=UNATTESTED`, `FLASH_CAUSALITY=UNKNOWN`, `WINDOWS_TASK_CHANGED=NO`, `ORDER_CONTENT_READ=NO`. A solução definitiva para o problema de tela depende de atribuir a janela real ao processo pai/filho e confirmar a sessão de execução, por canal de campo **passivo e comprovadamente invisível**. Não iniciar PowerShell, CMD, ferramenta de captura, tarefa ou programa do caixa para fabricar a prova.

## Laboratório isolado de atribuição HWND → processo — 05/11/2026

**Fonte de prova:** [GitHub Actions #42135867714](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42135867714), código no commit `cf8fd152acae9646eeee9cb3226fe711ec615d40`: **completed/success, 4/4 jobs**. O job Windows registrou `WINDOW_ATTRIBUTION_DISPOSABLE_LAB_PASS 30/30 SYNTHETIC_HWND_ONLY NO_FIELD_EXECUTION NO_PII`. Os demais jobs (contratos estáticos, vínculo Reader→praça e Edge V3 fictício) passaram. O Windows também manteve `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45`, os dois ensaios S4U no ambiente descartável e o one-shot Reader fictício sem janela visível nas amostras.

**Implementação exclusivamente de bancada:**
- `labs/window-attribution/WindowAttributionLab.cs`: compilado como `/target:winexe`; a execução é recusada no nome físico `CAIXA_MOOCA` e fora de `GITHUB_ACTIONS=true` + repositório esperado, marcador local e diretório temporário permitido. Recebe somente o PID explícito do processo fictício `WindowAttributionFixture.exe`, não enumera processos ou janelas de clientes por título nem realiza ações sobre o desktop.
- Confere **instância do processo** por PID e `CreationDate`, processo pai (`ParentProcessId`), `SessionId` e SID lido do **token de acesso nativo do alvo**, usando `OpenProcess` e `OpenProcessToken` com privilégios mínimos de consulta. A etapa de SID foi deliberadamente migrada de `Win32_Process.GetOwnerSid`, cuja invocação apresentou falha no executável do Windows descartável; não foi ignorada nem substituída por autodeclaração.
- Cruza `EnumWindows` → `GetWindowThreadProcessId` → `IsWindowVisible`, e consulta novamente os dados do processo para rejeitar troca de instância durante a observação. Só aceita **uma janela sintética com atributo visível**; janela sem `IsWindowVisible`, identidade, pai, sessão ou SID divergentes devolvem `HOLD`.
- `labs/window-attribution/SyntheticWindowFixture.cs` cria exclusivamente uma janela **fictícia, minúscula e fora da área do monitor** no Windows descartável. O resultado é calibração da flag `IsWindowVisible` e do vínculo HWND/PID, **não** registro de popup na área utilizável, variação de foco ou captura submilissegundo.
- `tests/silent-runner/verify-window-attribution-windows-lab.ps1` valida o subsistema GUI dos binários, resultados positivos e negativos, marcador de bancada e recibo sem PID, SID, `CreationDate`, títulos, screenshots, linha de comando ou dados de pedidos. Todos os arquivos são temporários da VM.

**Limite decisivo:** uma janela de console real pode pertencer ao `conhost.exe`, enquanto o processo Node/CMD que a originou é outro. O teste **não** comprova a cadeia completa `conhost.exe` → processo iniciador do job GetIn/Reader, nem a sessão, janela visível, hora ou causa de qualquer flash no `CAIXA_MOOCA`. Tampouco valida um canal de invocação de observador **intrinsecamente sem console e autorizado** na sessão operacional. O binário presente na PR é **deliberadamente incompatível com execução em campo**; não instalar, publicar, copiar ou executar nele.

**Histórico de falhas preservado:** a suíte nova falhou inicialmente no uso indevido da variável automática PowerShell `$PID`, depois na leitura do SID pela rota WMI; ambos foram corrigidos e provados na execução final. Um run intermediário também falhou numa fixture S4U antiga, sem executar o teste novo; a ordem da bancada passou a produzir prova independente antes dos ensaios S4U, **sem desativá-los**, e a CI final aprovou todos.

**Decisão operacional:** `LAB_HWND_PROCESS_LINK=TEST_PASS_30_30`; `FIELD_HWND_PARENT_SESSION_PROOF=UNKNOWN`; `FLASH_CAUSALITY=UNKNOWN`; `CASHIER_CHANGE=NONE`; `N2/N3=HOLD`; `V1_ACCEPTED=0/8`. Próximo gate: projetar uma testemunha passiva e silenciosa para sessão de campo, incluindo árvore de ancestrais/host do console e vínculo temporal; obter autorização separada para qualquer teste que execute código no caixa. Não usar o `start_process` do conector remoto como atalho, pois seu canal de lançamento não assegura ausência de janela.

## GetIn — candidato de lançador sem console validado em VM (05/11/2026)

**Prova exata:** [GitHub Actions #42137395512](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42137395512), código no commit `0dee990f4655b208f75dcb4e354779961b295b6b`: `completed/success`, **4/4 jobs**. O log Windows registrou `GETIN_GUI_SILENT_DISPOSABLE_LAB_PASS 80/80 SYNTHETIC_ONLY NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE`, preservando `WINDOW_ATTRIBUTION_DISPOSABLE_LAB_PASS 30/30`, `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45` e o teste de one-shot Reader fictício.

**Mudança material diferente do diagnóstico anterior:** o laboratório agora exercitou um **lançador GUI real (`/target:winexe`)** para os dois formatos sintéticos da rotina GetIn (`collector` e `visual`). O lançador inicia `node.exe` diretamente com `UseShellExecute=false`, `CreateNoWindow=true` e fluxos padrão redirecionados, sem CMD/PowerShell intermediários. Testes inspecionaram os HWNDs do processo GUI e do filho Node em dez amostras por modo, preservação do foco, um único filho, execução concluída e recibos fictícios sem dados pessoais. O campo `WindowStyle.Hidden` é apenas complementar: na versão .NET Framework a proteção material contra novo console deriva de `CreateNoWindow` com `UseShellExecute=false` e do subsistema GUI, não de assumir que `WindowStyle` funciona. Referência: https://learn.microsoft.com/pt-br/dotnet/api/system.diagnostics.processstartinfo.createnowindow .

Arquivos: `labs/getin-silent/LabGuiLauncher.cs`, `labs/getin-silent/synthetic-getin-job.cjs`, `tests/silent-runner/verify-getin-gui-launcher-windows-lab.ps1`. **Não são integração real GetIn**: o executável exige `GITHUB_ACTIONS=true`, repositório exato, marcador e diretório temporário e recusa explicitamente `CAIXA_MOOCA`. Os scripts fictícios não leem reserva, iFood, banco, navegador ou saída GetIn. A própria etapa Windows permaneceu isolada.

**Prova restante, antes de qualquer decisão em campo:** (1) inventário e pinagem íntegra dos dois scripts reais e de suas dependências; (2) preservação de identidade de execução/permissões e conta interativa; (3) comparação do produto funcional e da entrega de e-mail/PNG em homologação sem pedidos reais, sem duplicidade de disparos, com tarefas originais preservadas; (4) correlação independente de janela real com seu processo/conhost e sessão; (5) garantia de ausência de popup observada no desktop real por um canal aprovado e silencioso, com rollback definido e autorização separada para instalação/alteração. Sem essas provas, `LAB_GUI_LAUNCHER=TEST_PASS` não autoriza `FIELD_CHANGE`.

**Event logs vistos somente por metadados:** `C:\Windows\System32\winevt\Logs\Security.evtx` e `System.evtx` existem; na listagem realizada não apareceu `Microsoft-Windows-TaskScheduler%4Operational.evtx` (apenas a variante `%4Maintenance`). **Não foram abertos** logs binários; a existência do Security não comprova habilitação de auditoria 4688, nem causalidade de janelas. Não ativar auditoria, alterar política, instalar monitor, nem executar leitor EVTX ou shell no caixa.

**Fronteira de efeito:** `PR_137=DRAFT`, `LAB_GIT_CODE_READY=YES`, `LAB_TEST_PASS_80_80=YES`, `GETIN_REAL_EXECUTION_PROVEN=NO`, `FLASH_CAUSALITY=UNKNOWN`, `TASKS_ALTERED=NONE`, `CAIXA_CODE_EXECUTED=NO`, `L1_N2_N3=HOLD`, `V1_ACCEPTED=0/8`.
