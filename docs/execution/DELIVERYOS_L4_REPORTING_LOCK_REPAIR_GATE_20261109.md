# Delivery OS Itaim — L4: protocolo de trava do projetor, porta de reparo (09/11/2026)

**Foco único:** restaurar a capacidade de projeção **sem duplicar trabalho, imprimir, abrir pedido nem interromper o caixa**. Projeto ainda L1/8, sem aceitar L4 ou qualquer etapa operacional.

## Evidência de campo (somente leitura, sem comando)
- `CAIXA_MOOCA` é o host físico do Itaim. `state/reporting-v1/projection-checkpoint.json` e `projection-ledger.jsonl` mantêm mtime `2026-10-30T21:09:29.213Z`. O ledger de aproximadamente 115 MB **não foi aberto/copied**.
- `evidence/shadow-consumer-status.json` indicava `RUNNING` e `last_projection_status=SKIPPED_LOCKED`, com `updated_at=2026-11-09T23:45:23.376Z`; `reporting-projector-status.json` também registrou `SKIPPED_LOCKED` em `23:44:24Z`.
- `state/reporting-v1/projector.lock` continha PID `40640`; **não localizado na amostra posterior** de processos. O arquivo foi reescrito/renovado perto de `23:52Z`; não afirmar proprietário órfão por PID ausente em consulta posterior. É possível o titular já ter terminado. Não remover/reiniciar.
- `reporting-enrichment-diagnostic.json` apresentou `PROCESS_EXIT_NONZERO` numa execução sobre dia histórico. Ainda não provou que esse diagnóstico causou a projeção parada, nem se relaciona à ingestão iFood.
- Heartbeat do Reader mais recente na investigação: lote `#16900 OK`, sem falhas consecutivas, contagem acumulada `627` falhas. É monitoramento de leitura, **não** comprovante de completude da comanda.
- Esses metadados provam **projeção não atualizada no período observado** e `SKIPPED_LOCKED` recorrente, não estabelecem causa única nem uma trava permanentemente abandonada.

## Defeito localizado no código instalado
No arquivo instalado `shadow/continuous_reporting_projector_v1.cjs`, as funções de travamento usam:
- `fs.openSync(lockPath,'wx')` e gravam `process.pid` no arquivo;
- em `EEXIST`, `mtime > 120000 ms` pode ocasionar `fs.rmSync(lockPath)` sem comprovar que o detentor terminou;
- `releaseLock()` remove incondicionalmente por caminho, sem verificar identidade, incluindo no `finally`.

Se um detentor estiver apenas lento, outra execução pode removê-lo por idade, adquirir a mesma trava, e a primeira poderá remover a trava da segunda quando encerrar. **Esta é uma vulnerabilidade de protocolo observada no código, não comprovação de que a corrida causou o incidente em campo.**

A rotina instalada do consumidor pode também consolidar `SKIPPED_LOCKED` como bootstrap e deixar de retentar sem envelope novo; a PR #137 já contém reprodução e retentativa **LAB-ONLY**, com provas anteriores. Não inventar nova correção de retry.

## Correção delimitada em GitHub — sem alcance de produção
- `labs/reporting/projector_owner_lock_lab_v1.cjs` (PR #137): modo experimental com `openSync('wx')`, nonce criptográfico por aquisição e verificação do detentor antes de liberar. Não remove qualquer lock por idade: **stale=HOLD**. Não existe modo de recuperar automaticamente um lock abandonado.
- Restrições: execução somente em GitHub Actions do repositório esperado, diretório descartável dentro de `os.tmpdir()`, marcador `LAB_ONLY.txt`, recusa explícita ao hostname `CAIXA_MOOCA`, sem shell/SQL/rede/impressão nem importação do código produtivo.
- `tests/reporting/run-host-shadow-projection-retry-lab-tests.cjs`: oito contraprovas novas (um detentor, bloqueio de segundo detentor, idade >120s sem eviction, tentativa de liberação com token alheio, substituição do registro de dono, lock inválido preservado, reacquisição após liberação legítima, segredo não serializado e root impróprio). Total esperado: **18/18**, sem novos testes sobre a mesma hipótese fora do gate existente.
- **Limite explícito:** a liberação por verificação de token + unlink **não é atômica perante terceiros que deliberadamente apaguem/substituam a trava**, inclusive o projetor antigo. Portanto, a candidata **não pode coexistir com o protocolo produtivo velho** nem ser promovida diretamente à máquina. Não chamar `FIELD_PROVEN`.

## Gate de transição para ação real
1. **Atribuir o processo titular e a origem de lançamento** com observação própria, sem alterar janelas ou serviços. Se a atribuição continuar `UNKNOWN`, recuperação automática permanece proibida.
2. **Troca de protocolo é uma migração coordenada de todos os escritores**, não alteração só no `releaseLock()`; provar ausência de participantes com o mecanismo anterior, preservar rollback e manutenção assistida de lock antigo, sem limpar arquivo ativo.
3. Uma futura ferramenta de campo requer identidade verificável, conta de menor privilégio, invocação sem janelas **comprovada no host** e autorização de César para qualquer parada, instalação, processo, manutenção de trava ou mudança no fluxo.
4. **Prova pós-mudança:** o checkpoint e o ledger devem realmente avançar por revisão válida; `RUNNING` e `PROJECTED` isolados não bastam. Confirmar privacidade, ausência de impressão/SQL escrito e não interferência no caixa.
5. A própria projeção não valida `N2-A` locking SQL, `N2-B` origem e semântica de todos os itens/observações nem `N4` frescor autenticado. **Não publicar Home** sem esses gates.

**Estado:** `L4_REPORTING_STALE=FIELD_OBSERVED`, `LOCK_PROTOCOL_DESIGN_REVIEW=CODE_CANDIDATE`, `PRODUCTION_LOCK_REPAIR=NOT_AUTHORIZED`, `N2_A/N2_B=HOLD`, `V1_OPERATIONAL_ACCEPTANCE=0/8`, `PRINT/MERGE/DEPLOY/CUTOVER=HOLD`. Zero ação de escrita no caixa.
