# Q-018 — reavaliação contínua do portão de captura

Data: 2026-10-01
Host: Foxxy
Base Git: `02088eff08ca331719e0cd8cc0f414552b8c99ad`
Resultado: **CODE_READY + TEST_PASS no AVD; aparelho físico continua NOT_RUN**

## Gap reproduzido por leitura

O `TripLocationService` avaliava `GateSnapshot.evaluate(...)` em `beginTrip` e depois mantinha a captura sem reavaliar o portão completo. Assim, durante uma viagem já iniciada, desligar a localização do sistema, revogar permissão, atualizar a flag de captura ou invalidar o termo não possuía uma verificação periódica nativa independente da WebView.

## Correção

O loop de controle já existente, executado a cada 15 s, passou a reavaliar primeiro o portão local:

- permissão atual do Android;
- serviço de localização do sistema;
- flag local de captura;
- termo/aceite armazenado;
- viagem vinculada.

Se qualquer condição local deixa de ser válida, o serviço publica o bloqueio e executa `stopBecause(...)` antes de depender de rede.

Quando há rede, `GET /api/device/capture-state` continua usando a identidade do aparelho atestada pela plataforma e agora também exige, no piloto:

- `gps_capture_enabled=true`;
- termo vigente publicável;
- aceite vigente do mesmo motoboy **no mesmo aparelho**;
- viagem ainda ativa e vinculada ao mesmo ator/unidade.

Falha de identidade, timeout, 5xx ou indisponibilidade continuam UNKNOWN/KEEP; não viram desligamento inventado.

## Provas

- política pura de captura: **17/17 PASS**;
- piloto real + identidade HTTP sintética: **6/6 PASS**;
- sem aceite: `capture=false / term_not_acknowledged`;
- aceite em outro aparelho: continua `capture=false`;
- aceite no aparelho correto: `capture=true`;
- Android estrutural: **41/41 PASS**, incluindo prova de que o portão é reavaliado dentro de `verifyCaptureState` antes do teste de rede;
- consentimento nativo: **79/79 PASS**;
- `:app:testDebugUnitTest :app:compileDebugKotlin :app:connectedDebugAndroidTest`: **10/10 instrumentados PASS + BUILD SUCCESSFUL** no AVD Android 14.

## Fronteira

A classe de falha "portão avaliado uma vez só" está fechada no código e nas regressões do AVD. Ainda não foi executado o cenário físico de desligar GPS/permissão no celular real durante uma viagem; esse comportamento de campo permanece `NOT_RUN` no field gate físico.
