# Frente C — rota de execução comprovadamente invisível no Foxxy (14/11/2026)

**Escopo:** medição no **FOXXY**. O **CAIXA_MOOCA não foi tocado** (regra inegociável: nenhuma
janela pode aparecer/piscar no caixa; o assistente não executa nada no caixa). Documento de
engenharia; não autoriza habilitar tarefa, instalar ou executar no caixa.

## (a) Como o `start_process` do Desktop Commander 0.3.2 lança o processo no Windows

Fonte pública lida no tag `v0.3.2` (`wonderwhy-er/DesktopCommanderMCP`):

- `src/terminal-manager.ts:1` — `import { spawn } from 'child_process';`. **Node `child_process`
  puro; sem `node-pty`, sem ConPTY.**
- `src/terminal-manager.ts:158` — comentário do autor: "No special stdio options needed here,
  Node.js handles pipes by default" → **stdio padrão = pipes** (não `inherit`, não console novo).
- `src/terminal-manager.ts:169-173` — `spawnOptions = { env: getShellEnvironment(), windowsHide: true }`
  com o comentário `// Prevent visible console windows on Windows`. **Há `windowsHide:true`; NÃO
  há `detached` (default = false), NÃO há `stdio` custom.**
- `src/terminal-manager.ts:176-178` — `shell` só é passado para **shell desconhecido**
  (`useShellOption`); para shells conhecidos o spawn é do executável direto, **sem `shell:true`**.
- `src/terminal-manager.ts:187-189` — `windowsVerbatimArguments = true` apenas para cmd.
- `src/terminal-manager.ts:192` — `const childProcess = spawn(spawnConfig.executable, spawnConfig.args, spawnOptions);`
- `src/utils/shell.ts` monta `executable/args`: powershell → `['-Command', command]` (`:315-317`);
  pwsh → `['-Login','-Command', command]`; cmd → `['/c', command]` + `windowsVerbatim` (`:324-327`);
  shell desconhecido → `executable=command, args=[], useShellOption=executable` (`:343-345`,
  único caso com `shell:true`).

**Mecânica Windows:** `windowsHide:true` vira, em libuv (`uv_process`), a flag
`UV_PROCESS_WINDOWS_HIDE` → `CREATE_NO_WINDOW` na criação do processo. Isso suprime o console do
**filho**. O risco documentado (issues [852](https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/852)
e [443](https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/443)) é que, quando o **aplicativo
de terminal padrão** do Windows é o **Windows Terminal** (handoff DefTerm/OpenConsole), o
`WindowsTerminal.exe` é um processo separado cuja janela **não é governada pelo `CREATE_NO_WINDOW`
do filho** — podendo piscar. Por isso a pergunta não se resolve só lendo o código: exige medição no
ambiente real, com o terminal padrão = Windows Terminal. Foi o que se fez abaixo.

## (b) Medidor local `tools/windows-local-lab/medir-janelas.ps1`

P/Invoke de leitura (`EnumWindows`/`IsWindowVisible`/`GetForegroundWindow`/`GetWindowThreadProcessId`/
`GetClassName`/`GetWindowTextW`/`GetWindowRect`/`GetWindow`). A cada ~15 ms registra em JSONL toda
janela de nível superior (owner==0, visível, área>0) que surge **depois** de uma baseline, e toda
mudança de janela em primeiro plano, com `hwnd/pid/processo/classe/título/rect` e horário em ms.
Recusa rodar no `CAIXA_MOOCA`.

**Controle positivo (`-PositiveControl`):** o próprio medidor abre um `cmd.exe /c timeout` **visível**.
Capturado como `NEW_WINDOW` em `tMs=2836`, `process=WindowsTerminal`, `class=CASCADIA_HOSTING_WINDOW_CLASS`,
`1129x635`. **Prova que o detector enxerga uma janela real** — e que no Foxxy o terminal padrão é o
Windows Terminal (mesma classe de risco dos issues 852/443).

## (c) Amostras de `start_process` disparadas pelo conector, no FOXXY, com medição

Conector **Remote Desktop Commander** (`mcp__a3b039dd-…`, DC 0.3.2) apontando para
`deviceId=21096000-6204-4bea-ac11-603171550ac1` (Foxxy). `get_config`: `defaultShell=powershell.exe`,
shells `powershell.exe|pwsh.exe|cmd.exe`, agente = `node.exe` pid 29924. As amostras confirmaram
`SESSION=1` — **o conector spawna na mesma sessão interativa (1) do medidor**, logo uma janela
apareceria no desktop medido.

Medidor local rodando `19:56:38 → 19:57:48` (70 s, 4667 amostras a 15 ms). Dentro dessa janela:

| # | shell | comando | resultado |
| - | ----- | ------- | --------- |
| 1 | cmd.exe | `schtasks /Query /TN \Microsoft\Windows\Defrag\ScheduledDefrag` | ok, sessão do spawn na janela medida |
| 2 | cmd.exe | idem | ok |
| 3 | powershell.exe | `(Get-Date); SESSION=$PID.SessionId` → `SESSION=1` | ok |
| 4 | powershell.exe | idem → `SESSION=1` | ok |

**Medição:** `NEW_WINDOW=0`, `FOREGROUND_CHANGE=0` em 4667 amostras. **Zero janela, zero troca de
foco** para os 4 disparos (2 cmd.exe + 2 powershell.exe).

## (d) Não necessária

Nenhuma janela apareceu em (c); a rota direta já é invisível. Não foi preciso buscar rota alternativa.

## Conclusão (uma linha)

**ROTA_INVISIVEL_PROVADA** — `start_process` do Remote Desktop Commander 0.3.2 (shells `cmd.exe` e
`powershell.exe`), **4 amostras no Foxxy, sessão 1, terminal padrão Windows Terminal**, com **0 janelas
e 0 trocas de foco** em 4667 amostras a 15 ms; detector validado por controle positivo que capturou
um `cmd` visível.

## Foxxy ≠ CAIXA_MOOCA (diferença registrada)

- **Foxxy (medido):** Windows 11 Pro **23H2, build 22631.6199**, **sessão 1 interativa (console)**,
  terminal padrão "Windows decide" → **Windows Terminal** (confirmado pelo controle positivo),
  conector spawna em sessão 1.
- **CAIXA_MOOCA (NÃO medido, proibido):** build do Windows, aplicativo de terminal padrão e sessão do
  agente DC = **UNKNOWN** nesta rodada. Docs anteriores registram `defaultShell=powershell.exe` no
  caixa e deixam a causa do piscar como `FLASH_CAUSALITY=UNKNOWN`, nunca atribuída ao `start_process`.
  A prova de invisibilidade acima vale para o **Foxxy**; não é prova de campo no caixa. Limite
  epistemológico mantido: 15 ms não certifica ausência de flash < 15 ms; sessão/terminal do caixa
  podem diferir e devem ser verificados por canal passivo autorizado antes de qualquer execução lá.

### Orçamento remoto
6 chamadas remotas, **todas no Foxxy**: `list_devices` (1), `get_config` (1), `start_process` (4).
Nenhuma chamada ao `CAIXA_MOOCA`.
