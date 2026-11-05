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
