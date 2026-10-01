# Q-018 — encerramento remoto do GPS sem WebView — prova de bancada

Data: 2026-10-01
Host: Foxxy
AVD: Android 14 / emulator-5554
Base Git: `b954bac9f3722eba83fa44f92014a261533aa001`
Resultado: **PROVEN no AVD; aparelho físico continua NOT_RUN**

## Objetivo

Fechar a única observação runtime que permanecia aberta na seção 16 de
`Q018-RIDER-CAPTURA.md`: provar que o `TripLocationService` nativo encerra
sozinho depois que a viagem termina no servidor, sem depender de
`MainActivity`, WebView ou timers da página.
## Bancada isolada

- piloto real do HEAD atual em HTTPS local `127.0.0.1:5293`;
- identidade de aparelho sintética apenas para a bancada, em `127.0.0.1:18081`;
- CA já embutida no debug APK, fingerprint SHA-256
  `A6:D6:77:EC:64:5E:2B:06:B0:C1:EE:19:94:D9:F7:04:70:F9:68:F4:41:EF:90:A6:B3:FF:78:9D:E3:98:71:D2`;
- viagem `Q018-RUNTIME-20261001`, motoboy `rid-1`, aparelho `dev-q019`;
- `adb reverse tcp:5293 tcp:5293`;
- APK principal construído do HEAD, sem mudança em `android/app/src/main`.
Hashes da execução:

- app debug: `B5EE5533F74D799F7A1E936589D4928CBDFDDF64FD93FF4029D68FF09BF02A28`;
- androidTest temporário: `75F09BDFF5CEE9864EAA9C48268EBD6E5C22DF348DD05A5D057A79698511B6E2`.

O harness de `androidTest` foi criado apenas para preparar Room/termo/sessão
e iniciar o serviço sem abrir Activity. Ele não altera o código principal e
não deve ser promovido como teste hermético permanente porque depende da
bancada HTTP externa.
## Evidência antes do encerramento

O piloto recebeu `CreateTrip` e `ConfirmTripDeparture`; a viagem ficou
`em_rota` e `GET /api/device/capture-state` devolveu `capture:true`.

No AVD:

- `TripLocationService` apareceu em `dumpsys activity services`;
- `isForeground=true`, `foregroundId=4201`, `startRequested=true`;
- havia notificação foreground no canal `entregas_viagem`;
- `Q018RuntimeProof: READY ... no_activity_started=true` às 05:03:23.672Z;
- `topResumedActivity` era o Nexus Launcher, não o app TATÁ;
- a identidade recebeu chamadas `GET /api/device/identity` com 200.
## Ação e resultado

O console de bancada executou `CloseTripManually`. A mesma viagem passou a
`encerrada` e o piloto respondeu:

`capture=false`, `reason=trip_not_active`,
`checked_at=2026-10-01T05:03:53.383Z`.

Às 05:04:06.669Z o Android registrou
`Q018RuntimeProof: FINAL active_trip=null`: 13,286 s depois do recibo remoto,
dentro do ciclo de controle de 15 s.
Depois disso:

- `dumpsys activity services br.com.tata.entregas.debug` não listou mais
  `TripLocationService`;
- `pidof br.com.tata.entregas.debug` não retornou processo;
- `cmd notification list` não retornou notificação ativa do app/ID 4201;
- a Activity resumida continuou sendo o Launcher;
- instrumentation: `OK (1 test)`, 48,369 s;
- build da bancada: `BUILD SUCCESSFUL`.

## Fronteira da prova

Esta execução fecha como **PROVEN no AVD** a observação runtime que estava
`NOT_RUN` na seção 16: o encerramento remoto chega ao serviço nativo e ele
limpa `active_trip_id`, remove o foreground service/notificação e termina
sem WebView.

Não prova comportamento em aparelho físico real, tela bloqueada prolongada,
reboot físico, troca de rede ou bateria. Esses itens continuam no field gate
físico como `NOT_RUN`. Nenhum deploy, ativação de produção ou efeito
operacional real foi realizado.
