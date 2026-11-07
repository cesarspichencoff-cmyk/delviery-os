# Reader Itaim — execução da prova de isolamento SQL (03/11/2026)

**Pedido atual de César:** realizar a verificação somente leitura já descrita no projeto. **A autorização cobre a consulta sem efeitos**: não autoriza alteração de serviço, ACL, binário, configuração da conexão SQL, impressão, tarefas ou configuração global. O operador não deve ser substituído pelo serviço para criar aparência de autenticidade.

## Evidência vigente, não interpretação

- Fonte VÉRTICE canônica revalidada: `cesarspichencoff-cmyk/vertice-runtime.` / `vertice-active` / `VERTICE_ENTRY.md`.
- Windows SCM do host Itaim `CAIXA_MOOCA` aponta `TataComandaReader` RUNNING, `StartName=NT SERVICE\TataComandaReader`, SQL Express local e service-SID tipo NONE. Isso **não prova o token atual**; tentativa anterior de GetOwner retornou `ACCESS_DENIED`, respeitado.
- O watcher versionado do Reader confere `WindowsIdentity.GetCurrent().Name` e `SUSER_SNAME()` ao iniciar, mas **não oferece canal documentado de controle para executar consulta pontual de catálogo**. O serviço Windows `ContinuousService.v2.cs` inicia watcher/shadow e emite status; não expõe endpoint autorizado de diagnóstico de SQL e a versão efetivamente instalada continua não verificada.
- O arquivo `C:\Users\Tata\DeliveryOS-V1-Shadow-20261102\reader-acesso-minimo-itaim.ps1` foi **lido, não executado**. Possui modos Audit/Apply/Rollback; Apply usa `Set-Acl` e exige elevação, para expor estado ao operador. Não executar Apply para resolver a prova do SQL: ampliaria a fronteira de acesso e não provaria a identidade SQL do Reader.
- `C:\ProgramData\TataComandaReader\reports\delivery-report-current.proof.json` declara projeção materializada de arquivos e `database_read=false`, histórico de 05/10, não prova isolamento atual. `DeliveryOS-Itaim-Observer\status.json` publica `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, nunca prova revisão atual. Pastas Reader `state/evidence/bin` continuam sob ACL.
- Sem alteração de SQL no Itaim. A configuração real RCSI/SNAPSHOT e a revisão nativa atual permanecem **UNKNOWN**.

## Preparação concluída — sem executar SQL

**Arquivos no branch DRAFT da PR #135**:

- `tools/comandas_reader_actual_identity_isolation_probe_v1_NOT_DEPLOYED.ps1`: candidato de one-shot read-only. Recusa host distinto de `CAIXA_MOOCA` e `WindowsIdentity.GetCurrent().Name` diferente de `NT SERVICE\TataComandaReader`, ambos **antes de instanciar SqlConnection**. Sob identidade efetivamente permitida e em alteração futura separadamente autorizada, executaria apenas **um SELECT da tabela de metadados `sys.databases`** pela conexão local de segurança integrada; confere `SUSER_SNAME()` e `DB_NAME()`. Retorna somente RCSI ON/OFF, estado de SNAPSHOT, hora e flags negativas de pedido/print. Não consulta `TEKNISA.COMANDAVEN` nem exporta dados de clientes.
- `tools/verificar_reader_actual_identity_probe_v1_offline.cjs`: **12/12 PASS no Foxxy**; provocou recusa `WRONG_HOST_NO_SQL` com exit code 61, `sqlExecuted=false`. Em segunda tentativa, falsificou somente `COMPUTERNAME` no ambiente do processo filho de laboratório: o verificador recusou por `WRONG_PROCESS_IDENTITY_NO_SQL` (exit code 62) antes de abrir SQL. Verificou os guards antes da conexão e ausência de comandos DDL/DML. Não significa autenticação de fonte real.
- Os códigos de isolamento já preparados `comandas_reader_isolation_catalog_v1_REVIEW_ONLY.sql` e `comandas_reader_sql_consistency_gate_v1_review_only.cjs` continuam apenas revisão/fixture, com testes 23/23; misturas de revisões 6/6.

## Portão de execução ainda não satisfeito

Para obter a prova real **sob a conta e sessão certas**, falta um canal técnico oficialmente aprovado **dentro do serviço já instalado** para executar o diagnóstico uma única vez, sem shell na tela do caixa. A rota de execução não pode ser improvisada por `psexec`, conta administrativa, ACL temporariamente aberta, conta do operador ou alteração clandestina do serviço. Não iniciar `sqlcmd` pela identidade `CAIXA_MOOCA\Tata` e depois afirmar que o login SQL é do Reader.

**Uma futura janela de manutenção deve ser autorizada separadamente antes de qualquer alteração ao serviço:**
1. Verificar binário/script instalado, assinatura/sha e identidade efetiva pelo canal aprovado, com rollback e evidência de origem; nenhuma cópia irrestrita da pasta privada.
2. Validar se a consulta pontual pode ser invocada pelo Reader existente sem reiniciar, alterar ACL ou interromper os pedidos. Se exigir mudança de serviço/binário, preparar avaliação de impacto e obter autorização específica.
3. Executar somente a consulta de catálogo e confirmar login/isolamento, registrar metadados mínimos sem PII. Parar caso RCSI OFF, login divergente, ACL, latência ou token não comprovado.
4. Só em passo e autorização próprios, consultar uma revisão nativa de pedido atual de Itaim com captura transacional/consistência demonstrada, contagem completa de itens e observações, somente metadados sanitizados; em seguida vínculo independente com iFood.
5. Preservar impressoras da Teknisa, Cozinha e Sushi; contraste noturno da Conferência é outro gate físico, com autorização específica.

## Estados comprovados

`CODE_READY_METADATA_PROBE=YES`; `LAB_IDENTITY_GUARDS_PASS=12`; `LIVE_SQL_METADATA_READ=NOT_EXECUTED`; `SERVICE_OFFICIAL_INVOKE_ROUTE=NOT_AVAILABLE_OR_NOT_VERIFIED`; `READER_PROCESS_EFFECTIVE_IDENTITY=UNKNOWN`; `CURRENT_NATIVE_ORDER=UNKNOWN`; `PRODUCTION_PRINT=HOLD`.

**Princípio:** uma ferramenta tecnicamente capaz de ler SQL **não** constitui autorização ou prova de que a leitura foi feita pelo Reader. Preservar funcionamento silencioso do caixa acima de um diagnóstico conveniente.
