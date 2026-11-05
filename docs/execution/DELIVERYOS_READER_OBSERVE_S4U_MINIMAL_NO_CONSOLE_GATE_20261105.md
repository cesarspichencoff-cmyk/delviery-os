# Delivery OS Itaim — Reader Observe sem janela: alternativa S4U de mudança mínima

**05/11/2026. Etapa L1 de L8, N2/N3 pendentes, 0/8 aceites de campo.** Resultado: alternativa tecnicamente fundamentada, **não implementada no caixa**, sem garantia de direitos, ACLs ou equivalência operacional ainda. Autorização de César para **uma leitura de revisão real** é condicional e **não autoriza** mudar tarefa do Windows.

## Diagnóstico baseado no estado instalado (somente leitura)

A tarefa existente `DeliveryOS-Itaim-Reader-Observe` no computador `CAIXA_MOOCA`, que serve o Itaim, está `Enabled=true`, `LogonType=InteractiveToken`, `RunLevel=HighestAvailable`, `Hidden=false`, `MultipleInstancesPolicy=IgnoreNew` e `Interval=PT2M`. A ação executa diretamente `node.exe` com `observer.cjs`; **não é um PowerShell em segundo plano**.

O script `C:\ProgramData\DeliveryOS-Itaim-Observer\observer.cjs`, inspecionado apenas como código, é um processo de diagnóstico: usa um `readTataFileFeed()` local, grava apenas `status.json` e `last-window-status.json` e não chama `child_process.spawn/exec` nem rede. Seu módulo `copiloto_tata_file_feed_v1.cjs` trabalha com `fs`/arquivos locais, sem uso de HTTP/Net/child process no código examinado. Ele **não prova pedidos reais**, pois a saída preserva `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF` e `liveSourceVerified=false`. Exemplo de saúde já existente em 05/11: heartbeat `RUNNING`, `consecutive_failures=0`, `last_success_at=2026-11-05T09:56:33.3721809-03:00`; observer status `OUTSIDE_SERVICE_WINDOW`, `observedAtUtc=2026-11-05T12:55:39.952Z`.

A inicialização em `InteractiveToken` **pode** criar uma janela console no desktop. **Não existe prova temporal PID ↔ janela piscando**; jamais atribuir causalidade confirmada. As seis tarefas experimentais de PowerShell continuam desativadas. Há quatro tarefas GetIn de outra frente que também iniciam Node interativamente em horários específicos: não alterá-las no escopo Reader.

## Contra-rota de menor complexidade: mudar apenas LogonType

A documentação oficial da Microsoft distingue:
- `InteractiveToken`: executa na sessão interativa do usuário já conectado;
- `S4U`: a tarefa executa em desktop **não interativo**, sem armazenar senha, mas **sem acesso à rede ou a arquivos EFS**. Exige verificar direito de logon em lote e acesso ao disco local. Ver https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype e https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_logon_type e https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/log-on-as-a-batch-job.

**Proposta mais simples que instalar um novo executável:** preservar literalmente o XML agendado e alterar **exatamente** `<LogonType>InteractiveToken</LogonType>` para `<LogonType>S4U</LogonType>`. Nenhum outro campo deve mudar; não mexer em `Hidden`, cronograma, conta, `RunLevel`, `MultipleInstancesPolicy`, script, argumentos, disparos ou arquivos de status.

A comparação **em memória** com o XML real retornou `hasSingleCurrentToken=true`, `simulationExactlyOneToken=true` e `allOtherFieldsByteStable=true`. Essa é uma **proposta de diferença exata**, não uma tarefa registrada ou aprovada. O XML bruto, contendo `UserId` e caminho interno, **não foi publicado no GitHub**.

## Código e evidência

- `runtime/silent-runner/reader_observer_noninteractive_xml_review_v1.cjs`: validador **puro e sem I/O** de uma proposta de modificação de XML, que exige `PT2M`, `IgnoreNew`, `HighestAvailable` e preservação byte a byte de tudo exceto a tag `LogonType`. Mesmo com diferença correta, retorna sempre `state=HOLD_FIELD_CHANGE`, `taskRegistrationAuthorized=false`, `noWindowProvenOnCashier=false`, `sourceAclProven=false`, `batchLogonRightProven=false`, `ordersPublishable=0`, `changesExecuted=0`.
- `tests/silent-runner/run-reader-observer-noninteractive-review-tests.cjs`: doze verificações sintéticas que rejeitam alteração de horário, conta, privilégio, estado habilitado, programa, tag duplicada, XML incorreto e outros desvios. Conectadas ao entrypoint CI existente `tests/silent-runner/run-contract-tests.cjs`, **sem mudar a configuração do workflow**.

## Gates obrigatórios antes de alterar qualquer tarefa

1. **Direito e privacidade:** provar em VM descartável que a identidade do usuário programado tem direito `SeBatchLogonRight`, acessa os mesmos arquivos locais e grava apenas os mesmos relatórios; S4U não deve solicitar armazenamento de senha, acesso a rede ou alteração de ACL no caixa.
2. **Equivalência:** com *dados fictícios*, mesma janela de tempo e mesmos parâmetros, conferir schema/status/horário do observador, `LastTaskResult`, repetição de 2 minutos, `IgnoreNew` e recuperação de erro. Se não houver equivalência, não migrar.
3. **Zero janela na realidade certa:** confirmar que a própria tarefa em sessão não interativa não possui janela no desktop operacional; depois verificação de foco, CPU, áudio, não interferência no Gestor. Prova isolada Windows não equivale a aceitação humana no caixa.
4. **Rollback garantido:** guardar o XML exato de forma protegida e elaborar canal de aplicação e reversão **sem PowerShell/CMD aparecendo no caixa**; se esse canal não existir, **HOLD**.
5. **Fronteira de autorização:** antes de alterar a tarefa real, requer autorização **separada e explícita** de César, pois o consentimento atual só cobre leitura de uma revisão real, não modifica serviço/tarefa.
6. **Pedidos e Copiloto:** esse passo é de **proteção de tela**, não aprova N2/N3, SQL, origem iFood, criação de pedidos, impressão, GPS, Home ou L1.

**Fallback se S4U falhar por ACL ou privilégios:** lançar `node.exe` por executável nativo GUI `winexe` sem console, usando o mesmo observador, sem reescrever o Reader. O padrão já passou em CI sintética, mas requer validação real/rollback e autorização distinta; não tentar repetidamente o mesmo S4U sem evidência.

**Conclusão:** `ACTIVE_READER=PROVEN`; `EXACT_MINIMAL_XML_DIFF=PROVEN_REVIEW_ONLY`; `S4U_COMPATIBILITY=UNKNOWN`; `SILENT_CAIXA=UNKNOWN`; `TASK_CHANGED=NO`; `FIELD_ORDER_READ=NO`; `L1_N2_N3=HOLD`; `V1_ACCEPTED=0/8`. Sem comando ou modificação no caixa.
