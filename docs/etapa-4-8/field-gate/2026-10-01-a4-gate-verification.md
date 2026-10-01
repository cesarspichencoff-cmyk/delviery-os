# Android A4 — gate-verification — prova de fechamento

Data: 2026-10-01  
Host: Foxxy  
Base: `60be13b14877bced20bd2770ea94834c441ede08`

## Gap reproduzido

O build JVM independente `android/gate-verification` falhava em
`compileKotlin` porque `EntregasApi.kt` chamava
`DeviceSession.semSegredo`. `DeviceSession.kt` depende de Room, fora da
fronteira intencional desse gate.

Falha observada antes da correção:

- `EntregasApi.kt:93:47 Unresolved reference 'DeviceSession'`;
- `EntregasApi.kt:99:47 Unresolved reference 'DeviceSession'`.

## Correção

A sanitização de mensagens foi extraída para
`sync/SecretRedaction.kt`, Kotlin puro.

- `EntregasApi` usa diretamente `semSegredo(...)`;
- `DeviceSession.semSegredo` permanece como delegação compatível, preservando
  a API e os testes existentes;
- o projeto `gate-verification` inclui o novo arquivo puro;
- nenhuma regra de credencial, Room, sessão, GPS ou rede foi alterada.

## Provas pós-correção

`android/gate-verification`:

- fontes verificadas: 3 principais + 1 teste;
- `CaptureGateTest`: **12/12 PASS**;
- `BUILD SUCCESSFUL`.

Regressão do app, com Android SDK 34 local do Foxxy:

- `:app:testDebugUnitTest`: **PASS**;
- `:app:compileDebugKotlin`: **PASS**;
- `BUILD SUCCESSFUL`.

Os únicos avisos observados foram de APIs WebView já marcadas como deprecated
em `MainActivity.kt`; não são introduzidos por esta mudança.

## Fronteira

A4 fica **PROVEN/PASS no Foxxy**. Isto fecha o blocker histórico específico do
build JVM independente. Não substitui a bateria em aparelho físico real, que
continua `NOT_RUN`.
