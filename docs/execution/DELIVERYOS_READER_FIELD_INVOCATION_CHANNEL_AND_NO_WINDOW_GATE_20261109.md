# Delivery OS / Reader L1 — invocação de campo: evidências e bloqueio (09/11/2026)

**Escopo:** Itaim, host CAIXA_MOOCA. PR #137 em DRAFT/HOLD. Documento de engenharia; não é autorização de instalação, execução ou publicação.

## Por que não executar a prova real pelo canal remoto atual

O conector remoto **Desktop Commander 0.3.1** foi consultado em modo passivo por `get_config` no host: `defaultShell=powershell.exe`, com shells disponibilizados `powershell.exe` e `cmd.exe`. O contrato do `start_process` oferece `command`, `timeout_ms`, `shell`, `verbose_timing` e `deviceId` — **não oferece uma promessa documentada de ausência de janela ou mudança de foco** no Windows, inclusive para filhos.

A implementação pública do Desktop Commander registra uma classe de problemas de Windows com janelas de terminal e perda de foco:
- https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/852
- https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/443
- https://github.com/wonderwhy-er/DesktopCommanderMCP/releases/tag/v0.3.1

**Limite epistemológico:** relatos públicos em versões anteriores são evidência de *risco compatível*, não prova de que expliquem a tela deste host. A versão instalada foi verificada; nenhuma configuração global foi alterada.

A alternativa `node:local` aparece como sessão virtual no Desktop Commander, mas o código/documentação descreve execução de cada entrada por script Node temporário. **Não foi provada ausência de novos processos/janelas no host e não se autoriza experimentá-la em CAIXA_MOOCA**. Não usar `interact_with_process` em sessões virtuais preexistentes como contorno.

## Evidência real, somente telemetria minimizada

Leitura passiva do `C:\ProgramData\TataComandaReader\state\reader-heartbeat-v1.json` na sessão:
- `supervisor.pid=19140`, `state=RUNNING`, `watcher.sha256_verified=true`, `consecutive_failures=0`.
- Último lote `#16838 OK`, `polls=20`, `poll_errors=0`, `last_success_at=2026-11-09T19:43:04.1180121-03:00`.
- Total acumulado: `batches=16838`, `failed=625`, `events_emitted=7119`.
- Comparado à leitura passiva anterior nesta continuidade (`batches=16745`, `failed=625`, `events_emitted=7016`): **+93 lotes, +0 falhas acumuladas, +103 eventos emitidos**. Isso demonstra continuidade observada entre amostras, **não** completude do iFood, atomicidade SQL, pronta-entrega, duplicidade nem pedidos novos de clientes.

`list_processes` via conector passivo confirmou `powershell.exe` com **PID 19140**. A correspondência com o supervisor implica que matar `powershell.exe` indiscriminadamente pode interromper o próprio Reader. Outras instâncias de `cmd.exe`, `powershell.exe`, `WindowsTerminal.exe` e `conhost.exe` também existiam; sem vínculo de autoria, caminho de comando, janela e horário da aparição, **não atribuir o piscar a nenhuma delas**. Nenhuma foi encerrada.

Leitura passiva de `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json`:
- `schedule=DINNER`, `observedAtUtc=2026-11-09T22:47:40.069Z`, `state=OBSERVED_RECORDS`.
- `filesRead=250`, `ignoredHistorical=245`, `projectedOrderCount=5`.
- **`sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`**. Os cinco são projeções do diagnóstico, não cinco pedidos reais homologados.

Nenhuma revisão real, nota de cliente, identificador de pedido ou arquivo de conteúdo foi aberta nesta rodada. Não foram invocados `start_process` ou `interact_with_process`, nem shell/CMD/PowerShell por comando do assistente. Não houve consulta SQL, instalação, alteração de configuração, serviço, tarefa agendada, fila, impressora, merge ou deploy. **Não há instrumentação que permita afirmar ausência absoluta de subprocessos auxiliares internos às ferramentas passivas**; a garantia se limita às ações explicitamente solicitadas e ao não uso de rotas de execução.

## O que já existe — não repetir laboratório equivalente

PR #137, código no `7221acb0ba26482a3ed1d7d72e0db1d0f5f162ca`:
- Executor de uso único **LAB_ONLY** com seletores segregados de checkpoint histórico e canônico.
- Launcher `NativeReaderOneShotLabLauncher.cs` compilado `winexe`, com `CreateNoWindow`, pins do script/dependências e recusa explícita de `CAIXA_MOOCA`/ausência de `GITHUB_ACTIONS`.
- CI nesse código: **4/4 workflows sucesso**; Windows descartável mediu **10/10 amostras sem janela visível nem mudança de foco** para cada modo. As amostras não certificam ausência absoluta de flash de curta duração nem o processo de **invocação real** no caixa.

A versão de laboratório NÃO foi transformada em binário de campo, não foi instalada no host e não deve ter guardas removidos para criar avanço artificial.

## Portão mínimo para execução condicional de UMA revisão

Um canal só será elegível quando existir evidência independente dos pontos:
1. **Invocação real sem terminal:** uma superfície aprovada que execute diretamente um GUI-subsystem binário sem `cmd`/`powershell`/WindowsTerminal ou scripts intermediários, com demonstração de ausência de ativação de janela/foco **na sessão efetiva** antes de qualquer leitura de pedido. `start_process`/scripts `node:local` permanecem bloqueados até prova de compatibilidade.
2. **Identidade e custódia:** código/dependências versionados e verificados, conta executora e permissões mínimas, host/unidade exatos, nenhum privilégio de impressão, SQL, escrita no Reader ou rede; instalação e disparo exigem autorização específica caso haja novo efeito.
3. **Revisão única preexistente:** escolher uma entrada do checkpoint sem exportar chave privada; arquivo já existente selecionado e aberto **na origem**, sem cópia bruta para ferramenta/LLM; limite de bytes, recusa de links/reparse, verificação contra troca durante leitura.
4. **Recibo sanitizado e único:** somente flags e contagens permitidas, `HOLD`, `ordersPublishable=0`, sem nomes, IDs, notas, hash bruto ou caminhos, sem publicação Home, sem reprint.
5. **Separação de provas:** mesmo com sucesso da execução, N2-A exige segurança de locks/impacto em escritores; N2-B exige prova **independente** de completude da revisão SQL; N4 origem/frescor e N5 Home permanecem fechados.

**Decisão:** bloquear as rotas de execução que não comprovem a proteção de tela. Priorizar uma *nova superfície de invocação* de verdade em vez de repetir variações de `winexe` na CI. Não considerar novas suítes sintéticas substitutos para a prova em campo.

## Auditoria adicional — validade temporal do consumidor sombra

Inspeção passiva de arquivo de status já existente confirmou `deliveryos.live-shadow-consumer-status.v2`, `state=RUNNING` e `updated_at=2026-11-09T22:56:23.260Z`; sem dados de pedido exportados. Metadados do antigo `continuous-host-status.json` indicam última atualização em **29/10/2026**, apesar de marcar RUNNING — sua idade impede usá-lo como prova independente de atividade atual. O heartbeat recente continua a evidência própria de progresso do supervisor; host-status antigo não pode resgatar heartbeat parado.

**Falha de diagnóstico corrigida no código da PR #137:** o avaliador aceitava `consumer.state=RUNNING` sem validar `consumer.updated_at`. Agora registra `consumer_status_s` e degrada quando consumidor informado está desatualizado, sem horário válido ou com timestamp excessivamente futuro. Limite derivado da cadência de heartbeat, preservando `consumer=null` como ausência de prova específica. Validação **sintética** no SHA de código `1a9d745b1b5b0b854b3cd6dd4f2fdc363260a5f9`: **36/36** testes do avaliador e **4/4 workflows SUCCESS** (Windows/contratos [#42716463499](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42716463499), Room [#42716463454](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42716463454), HTTPS [#42716463306](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42716463306), WebView [#42716463378](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42716463378)).

**Efeito:** somente revisão de código e testes GitHub, **não** implantação do novo diagnóstico no caixa. Não melhora por inferência N2-A/N2-B, origem iFood ou sessão real. A PR #135 recebeu documento passivo de falhas SQL adicionais sob HEAD documental `2d84be98cc2c8b431e916fdd8e02c8fbba31c29f`; o hash do produtor da PR #135 fixado nos testes cruzados permanece o de código já validado, não se justifica recadastrar pins por mudança documental.

**Status:** `N1_FIELD_INVOCATION=UNPROVEN`; `N2/N3=HOLD`; `L1_PARTIAL`; `V1_OPERATIONAL_ACCEPTANCE=0/8`. PRs #135 e #137 DRAFT/HOLD; nenhuma homologação operacional alterada.
