# TATÁ Comandas / Delivery OS — auditoria da identidade Windows do Reader (03/11/2026)

**Foco:** comprovar uma revisão atual de Itaim sem interferir no caixa. **Tipo da prova:** configuração SCM do Windows + contrato existente; **não** é prova de token efetivo, comanda operacional, impressão ou vínculo iFood.

## Observado no host CAIXA_MOOCA, somente leitura
- `sc.exe qc TataComandaReader`: serviço instalado `WIN32_OWN_PROCESS`, `AUTO_START (DELAYED)`, executável **`C:\ProgramData\TataComandaReader\bin\TataComandaReader.ContinuousService.exe`**, conta de inicialização **`NT SERVICE\TataComandaReader`**, dependência **`MSSQL$SQLEXPRESS`**.
- `sc.exe queryex TataComandaReader`: **RUNNING**, PID **21020**, Win32 exit code 0, service exit code 0. A lista de processos do conector também exibe `TataComandaReader.ContinuousService.exe` no PID 21020.
- `sc.exe qsidtype TataComandaReader`: **`SERVICE_SID_TYPE_NONE`**. Não inferir grupo de service SID adicional no token. **Distinto** da conta virtual `NT SERVICE\TataComandaReader` definida no `StartName`: uma conta virtual pode continuar existindo como identidade primária. Referências: https://learn.microsoft.com/en-us/windows/win32/api/winsvc/ns-winsvc-service_sid_info ; https://devblogs.microsoft.com/oldnewthing/20231004-00/?p=108849%2F ; https://learn.microsoft.com/pt-br/windows-server/identity/ad-ds/manage/understand-service-accounts
- `sc.exe qprivs TataComandaReader`: consulta respondeu sem privilégios adicionais listados. Isto não comprova que o token efetivo não tem privilégios nem confirma identidade do processo.
- `Win32_Process.GetOwner` via CIM para PID 21020: `ReturnValue=2`, `User=null`, `Domain=null`. Código **2 = Access denied**: https://learn.microsoft.com/pt-br/windows/win32/cimwin32prov/getowner-method-in-class-win32-process. Não houve elevação, acesso alternativo a token nem alteração de segurança.
- `wevtutil el` e `wevtutil ep` consultados apenas quanto a **nomes** de canais/provedores, sem correspondências próprias evidentes para `TataComandaReader`/`DeliveryOS`; não permite concluir que o serviço não registra eventos em canais padrão.
- `C:\ProgramData\TataComandaReader\shadow-native-v1\data\tata_sequence_attesters_v1.json`: `store=0001|01`, **`attesters=[]`**, **`writer_key_ids=[]`**, com texto explícito `EMPTY ON PURPOSE`. Essa cópia de candidata não comprova ausência de outras chaves em todo o computador; comprova que a candidata inspecionada ainda **não aceita sequência LIVE_ATTESTED**.
- `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json`, leitura anterior da mesma rodada: **2026-11-03T22:05:39.777Z** (19:05 BRT), `DINNER`, 250 lidos/248 históricos/2 projetados, **`CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`**, `liveSourceVerified=false`, `operationalOrderTotal=null`. Não converter projeções em pedidos reais.
- Relatórios detalhados acessíveis `TataComandaReader\reports\delivery-report-current{,.proof}.json` têm última modificação **05/10**, não prova de pedido atual. `TataComandaReader\state/evidence/bin` permanece inacessível ao conector (EPERM), respeitado.

## Diferenças de prova que NÃO podem ser confundidas
1. **CONFIGURED_START_ACCOUNT:** comprovado por SCM `NT SERVICE\TataComandaReader`.
2. **RUNNING_PROCESS:** comprovado por SCM/lista de processos, PID 21020 no momento da consulta; PID pode mudar.
3. **SERVICE_SID_TYPE:** comprovado como `NONE`. Isto não invalida automaticamente a conta virtual, tampouco prova isolamento/ACL efetivos.
4. **PROCESS_EFFECTIVE_OWNER/TOKEN:** **UNKNOWN**, pois `GetOwner` retornou acesso negado. Não promover o campo StartName a prova do token em execução.
5. **TRUSTED_INDEPENDENT_ATTESTER:** **NOT PROVISIONED** no cadastro inspecionado. Nenhuma chave ou segunda identidade autenticada.
6. **LIVE_SOURCE_ORDER_REVISION/IFOOD_UUID:** **UNKNOWN**, observação atual em modo CONTROL. Nenhuma legitimidade de pedido real.
7. **REAL_CONFERENCE_PRINT:** **HOLD**; somente primeira folha fictícia #3026 teve aceitação física por foto, em etapa distinta.

## Menor intervenção futura que realmente pode destravar
**Não** modificar o tipo de SID, identidade ou ACL do serviço existente por inferência. Em janela operacional aprovada e com rollback, validar primeiro qual serviço/usuário efetivo pode assinar um digest de **uma** revisão nativa atual e publicar comprovante sanitizado por **mecanismo oficialmente autorizado**, sem liberar arquivos privados ao operador, sem instalação de terceiro monitor e sem qualquer dependência do trabalho de produção do SQL/caixa. O atestador independente e seu registro pinado exigem autorização separada e prova de isolamento entre identidades; um documento self-signed/caller-provided trust continua **HOLD** pelo módulo `runtime/reporting/native_reader_source_receipt_review_v1.cjs`.

Depois disso, comprovar o UUID iFood e vínculo único por fonte independente autorizada; então ledger sequencial diário, emissor exclusivo da Conferência, prevenção de duplicações, densidade noturna validada fisicamente e piloto reversível. **Não** contatar Teknisa sem nova iniciativa de César; preservar Cozinha/Sushi.

## Limites de execução desta auditoria
Todas as operações em CAIXA_MOOCA foram **consultas de configuração, status e metadados**. Nenhuma edição de registro, serviço, ACL, tarefa, firewall, SQL, iFood, fila, impressora, arquivo de status, credencial, navegador ou motor de pedidos. Consultas ao serviço **não** são prova de que o conteúdo da sua produção foi inspecionado. O contrato de recibos foi testado no Foxxy com **31/31 fixtures** e permanece sem conexão com produção.

`CURRENT_CANONICAL_VERIFIED=VERTICE_ACTIVE`, `SCM_CONFIG_READ_PROVEN=YES`, `SERVICE_EFFECTIVE_TOKEN=UNKNOWN`, `SID_TYPE_NONE=FACT`, `LIVE_SOURCE=UNKNOWN`, `ATTESTER_PINSET=EMPTY_IN_INSPECTED_CANDIDATE`, `DEPLOYED_NEW_SIGNER=NO`.
