# Q-018 — execução no Foxxy / emulador — 2026-09-30

Escopo: build `debug`, emulador Android (`sdk_gphone64_x86_64`), laboratório local. Não é prova de aparelho físico em rua.

## PROVEN

- `TripLocationService` em foreground e `requestLocationUpdates success`.
- Helper exclusivo de `debug`: `setMockMode success` e `setMockLocation success` no Google Play Services.
- Callback real do Fused: `Q018Capture: onLocationResult count=1`.
- Persistência viva no Room, extraída com `run-as` incluindo DB + WAL + SHM.
- Sequência local contínua `1..10`, 10 linhas, contador persistente `gps_sequence_local = 10`, duplicatas `[]`.
- Sessão do aparelho renovada pela plataforma em `2026-09-30 05:59:30.368-03`.
- PostgreSQL: nova linha `platform.audit.action = device_session_issued` no mesmo instante; aparelho não revogado.
- Retry e envio funcionaram: pontos que estavam `failed` por `SocketTimeoutException` foram reenviados.
- Recibo do servidor foi aplicado no Room: os pontos mock ficaram `rejected`, não desapareceram nem ficaram presos em `failed`.

## Resultado observado do servidor

A instância atual recusou as localizações simuladas com `servidor_rejeitou: localização simulada em lote real`. Essa recusa é consistente com a trava de `is_mock` para lote real e não prova fato aceito em `platform.event_log`.

## Correção de evidência

O script temporário `q018_final_room_check.py` lia uma cópia estática em `Temp/q018-room-summary/entregas.db`; por isso reportava incorretamente `1..3 / contador 3`. A leitura viva do sandbox do app mostrou primeiro `1..5` e depois `1..10`. A cópia estática não deve ser usada como prova de estado atual.

## Ainda UNKNOWN / NOT_RUN

- primeiro ponto do app aceito no `platform.event_log` em `source_mode=simulated`;
- bateria física em aparelho real, tela bloqueada, segundo plano, offline prolongado, reboot, revogação e consumo ≥2 h;
- encerramento da viagem com a página em segundo plano.

## Fecho Q11

- `T-FOXXY-1` foi encerrada pelo comando oficial `CloseTripManually` do console de laboratório.
- Snapshot do piloto após o comando: viagem `encerrada`; `rid-1` voltou a `disponivel`.
- Após a reconciliação, `TripLocationService` deixou de aparecer nos serviços ativos.
- Room após o fecho: `active_trip_id = None`; 10 pontos preservados.
- O APK debug final, já sem o helper de mock, foi reinstalado com `:app:installDebug` e `BUILD SUCCESSFUL`.
- `dumpsys package` não expõe `DEBUG_MOCK_LOCATION` nem `MockLocationReceiver`.

Conclusão da bancada: captura Fused, persistência sequencial, restart do processo, recuperação de sync e encerramento da viagem estão PROVEN no emulador. Fecho final: `connectedDebugAndroidTest` executado sobre o APK final sem `DEBUG_MOCK_LOCATION` / `MockLocationReceiver`, com **10/10 testes instrumentados PASS** e **BUILD SUCCESSFUL** no AVD Android 14 do Foxxy. A prova física em aparelho real permanece separada e NOT_RUN.

## Controle remoto nativo de captura — fechamento adicional

Depois do fecho 10/10 do APK no AVD, o intervalo `WebView/processo de UI ausente -> viagem encerrada` ganhou um canal nativo autenticado: o `TripLocationService` consulta o piloto com o Bearer do aparelho; o piloto atesta a identidade/revogação na plataforma e decide sobre a mesma `TripRepository` dos comandos operacionais.

Travas finais: rede/timeout/5xx/estado desconhecido/403 genérico **não** encerram captura; somente `capture=false` conclusivo ou revogação terminal atestada (traduzida para HTTP 410) permitem STOP.

Provas: identidade 4/4; política 13/13; HTTP 4/4; Android project 41/41; runtime wiring 21/21; instrumentação 10/10; cadeia PostgreSQL/Linux 35/35; mutações 15/15, zero cegas.

A bateria em aparelho físico real permanece separada e `NOT_RUN`.