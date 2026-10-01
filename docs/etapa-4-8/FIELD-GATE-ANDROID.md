---
lifecycle:
  artefato: docs/etapa-4-8/FIELD-GATE-ANDROID.md
  status: ACTIVE
  authority_scope: field_gate_android
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: 375521b
---

# Field gate físico do Android — roteiro

> **Nada da bateria física deste roteiro foi executado em aparelho real.** Os pré-requisitos A1–A3
> foram executados em 2026-09-25 numa máquina Windows ("Foxxy"), com A3 em emulador Android 14/API 34.
> Resultado físico continua `NOT_RUN` até evidência de aparelho real. Emulador é evidência de emulador;
> o que vale para comportamento de campo continua sendo o aparelho na rua.

## 0 — Estado de partida (2026-09-25)

| dimensão | estado | fonte |
|---|---|---|
| contrato de bootstrap, sessão e sincronização | **PROVEN** com aparelho LÓGICO e os binários reais | `test:platform:cadeia` 35/35; `docs/etapa-4-8/CADEIA-REAL.md` |
| relógio do aparelho no servidor | **PROVEN**: relógio adiantado vira `suspect`, não fabrica frescor, sobrevive ao replay | `test:platform:relogio`; `docs/etapa-4-8/RELOGIO.md` |
| papéis mínimos na composição oficial | **PROVEN** em containers | `tools/papeis_compose_real.sh` |
| comportamento físico do Android | **UNKNOWN** | este roteiro |
| gatilho da captura nativa no app | **PROVEN NO AVD; FÍSICO `NOT_RUN`**: a rider-mobile liga pela ponte depois de termo, permissão e saída confirmada (`Q-018`); o Kotlin foi compilado e exercitado no Foxxy. A cadeia Fused → Room → sync e o encerramento remoto sem WebView foram observados em runtime; o stop remoto ocorreu em 13,286 s | `docs/etapa-4-8/Q018-RIDER-CAPTURA.md`; `field-gate/2026-10-01-q018-remote-stop-runtime.md` |
| build do app (`testDebugUnitTest`, `assembleDebug`, instrumentados) | **PROVEN no Foxxy/AVD**: build Android 14/API 34; o APK final sem helper de mock fechou 10/10 e a regressão atual, já com retenção + Keystore, fechou **19/19 PASS**; aparelho físico continua `NOT_RUN` | execução Foxxy, 2026-09-30/2026-10-01; `Q018-RIDER-CAPTURA.md` §§15–17; `field-gate/2026-10-01-android-keystore-credentials.md`; `field-gate/2026-10-01-device-prebinding.md` |

## 1 — Pré-requisito A: compilar e testar numa máquina com SDK

Máquina com **JDK 17**, **Android SDK 34** (platform `android-34`, `build-tools` 34.x,
`platform-tools` com `adb`) e acesso a `dl.google.com` — ou o SDK já instalado. O wrapper do
repositório (Gradle 8.9) baixa o resto. `android/gradlew` está versionado sem bit de execução:
rode com `sh gradlew`.

```bash
cd android
export JAVA_HOME=/caminho/do/jdk-17
sh gradlew :app:testDebugUnitTest          # CanonicalPointTest, CaptureGateTest, DeviceSessionTest
sh gradlew :app:assembleDebug              # app/build/outputs/apk/debug/app-debug.apk
sh gradlew :app:connectedDebugAndroidTest  # PersistenceInstrumentedTest — exige aparelho ou emulador conectado
```

| item | PASS se | resultado |
|---|---|---|
| A1 unit tests | `BUILD SUCCESSFUL` e o relatório em `app/build/reports/tests/testDebugUnitTest/` sem falha | **PASS** — `:app:testDebugUnitTest`, JDK 17.0.19 + SDK 34, Windows |
| A2 APK de debug | o arquivo existe e `aapt dump badging` mostra `br.com.tata.entregas.debug` | **PASS** — `assembleDebug`; pacote `br.com.tata.entregas.debug`, target/compile 34 |
| A3 instrumentado | `connectedDebugAndroidTest` sem falha, no aparelho do teste | **PASS (EMULADOR)** — regressão atual **19/19** no AVD Android 14/API 34 em 2026-10-01; o marco anterior do APK final era 10/10. **FÍSICO `NOT_RUN`** |
| A4 `android/gate-verification` | build JVM independente compila o cliente HTTP real + portão de captura sem puxar Room; `semSegredo` foi extraído para Kotlin puro e a API de `DeviceSession` foi preservada | **PASS (Foxxy, 2026-10-01)** — falha `Unresolved reference DeviceSession` reproduzida antes; depois 12/12 `CaptureGateTest` PASS + `BUILD SUCCESSFUL`; regressão `:app:testDebugUnitTest :app:compileDebugKotlin` PASS. Ver `field-gate/2026-10-01-a4-gate-verification.md` |

**Compilar não é instalar, e instalar não é testar em campo.** Em 2026-09-25 o APK debug também foi
instalado e abriu no emulador com `MainActivity` em primeiro plano e sem crash `AndroidRuntime`.
Isso é smoke test de emulador, não fecha nenhum item da seção 3.

## 2 — Pré-requisito B: servidor, identidade do aparelho e decisões

1. **A composição oficial no ar**, alcançável pelo aparelho **em HTTPS** (`deploy/compose.platform.yaml`:
   crítico, assíncrono, papéis, backup). O app recusa HTTP. O `debug` aceita certificado instalado
   pelo usuário (`network_security_config_debug`); `pilot` e `release` só aceitam certificado de
   sistema.
2. **Modo da instância (Q-017).** Teste de campo é teste: `DELIVERYOS_SOURCE_MODE=simulated` é a
   recomendação. `real` só por decisão do César — é o que faz o fato entrar como operação.
3. **Data e hora automáticas no aparelho** (Configurações → Sistema → Data e hora). Conferido de
   novo no item 2 da bateria. Relógio adiantado não quebra o servidor — vira `suspect` e perde a
   autoridade sobre o frescor —, mas um gate de campo com relógio errado mede a coisa errada.
4. **Descobrir o `device_id` e o código de vínculo.** O app gera o pseudônimo do aparelho e
   um segredo local de 128 bits cifrado no Android Keystore. A rider-mobile mostra, inclusive
   **antes do login humano do piloto**, apenas:
   - **“ID deste aparelho · dev-…”**;
   - **“Código de vínculo”** = SHA-256 do segredo local.
   O segredo bruto, token, IMEI, telefone e coordenadas nunca entram nessa superfície. O código
   de vínculo é o valor que o responsável pré-vincula em `identity.device.secret_hash`.
   - Controle de laboratório/debug continua disponível por `adb run-as`, mas deixou de ser
     requisito operacional.
   - Prova automatizada: rider-bridge **30/30**, incluindo navegador comum sem ID inventado,
     app nativo com ID visível e app nativo **sem token humano** com o mesmo ID visível.
     Ver `field-gate/2026-10-01-device-id-visible.md`.
5. **Autorizar o aparelho** — ato humano, fail-closed. A unidade e o ator já precisam existir,
   estar ativos, pertencer à mesma unidade e o ator precisa ser `motoboy_interno`. A ferramenta
   **não cria unidade/ator e não reativa aparelho revogado**.

   Primeiro, gerar o plano sem escrita, usando o **mesmo código de vínculo** mostrado no aparelho:

   ```bash
   npm run admin:entregas:device -- authorize --device <DEVICE_ID> --unit <UNIDADE> --actor <ENTREGADOR> --label "field gate" --proof <CODIGO_DE_VINCULO>
   ```

   Conferir `current`, `target`, `conflicts` e o `fingerprint`. Só depois executar, com o
   mesmo estado do banco:

   ```bash
   npm run admin:entregas:device -- authorize --device <DEVICE_ID> --unit <UNIDADE> --actor <ENTREGADOR> --label "field gate" --proof <CODIGO_DE_VINCULO> --apply=YES --expect <FINGERPRINT>
   ```

   Se o estado mudar entre plano e aplicação, o fingerprint diverge e a escrita é recusada.
6. **APK de piloto** (item 1 da bateria): exige os domínios reais e uma assinatura.
   `sh gradlew :app:assemblePilot -Pentregas.baseUrl=https://<PILOTO> -Pentregas.platformUrl=https://<PLATAFORMA>`
   gera um APK **sem assinatura** (`signingConfig = null`: nenhuma chave no repositório). Assinar é
   do César, com a chave dele, fora do Git. Sem isso: **BLOCKED**, e o gate roda com o `debug`.
7. **Gatilho da captura nativa (`Q-018`, respondida em 2026-09-25).** A rider-mobile liga o
   `TripLocationService` pela ponte (`docs/etapa-4-8/Q018-RIDER-CAPTURA.md`). O passo 5 deixa de
   ser BLOCKED por decisão e passa a depender de cinco coisas, todas verificáveis antes de ir à rua:
   - **build identificado**: A1–A3 já foram refeitos no AVD após as mudanças do Kotlin. No aparelho físico,
     anotar o commit/hash do APK realmente instalado; repetir o build apenas se o código Android tiver mudado;
   - **sessão do motoboy no WebView**: o piloto só responde com o token do motoboy
     (`entregasPilotLogin("<TOKEN>")` no console do WebView — no `debug`, por `chrome://inspect`);
   - **flag de GPS ligada no piloto** (`gps_capture_enabled: true`; o caminho pode vir de
     `ENTREGAS_GPS_FLAGS_CONFIG`, absoluto ou relativo);
   - **termo publicável**: no aparelho físico, os campos do César (`docs/entregas/pilot/CHECKLIST_ATIVACAO.md`
     §A); **no emulador**, a fixture sintética que o César autorizou em 2026-09-26
     (`tools/bancada_termo_sintetico.json`, "SEM VALOR LEGAL — APENAS TESTE SIMULADO"), com
     `ENTREGAS_LABORATORIO=1` e o piloto em modo local — fora disso o piloto recusa subir. Ela
     **nunca** vale para a bateria física: aceite de texto sem valor legal não autoriza ninguém;
   - **viagem montada no console para o motoboy da sessão** — viagem de outro motoboy não liga
     captura neste aparelho, de propósito.

   Para emulador, o HTTPS de laboratório e o bootstrap estão em `docs/etapa-4-8/BANCADA-EMULADOR.md`
   §2 e §3: o `debug` recusa `http://`.

## 3 — A bateria principal

Cada linha anota: **quem**, **quando** (UTC), **aparelho** (modelo e Android), **evidência**
(arquivo, print, saída de SQL) e o **resultado**. As consultas `Q1`–`Q6` estão na seção 5.

| # | ação | evidência | PASS se | resultado |
|---|---|---|---|---|
| 1 | instalar o APK de piloto (ou o de debug — anotar qual) | `adb install` e versão na tela | instala e abre | NOT_RUN |
| 2 | confirmar data e hora automáticas | print da configuração; diferença para `date -u` do servidor | automáticas ligadas e diferença < 2 min | NOT_RUN |
| 3 | autorizar o aparelho (§2.5) | ID + código exibidos no app; saída do `admin:entregas:device` + `Q1` | `applied=true`; uma linha, `revoked_at` nulo, `vinculado` **verdadeiro antes do bootstrap** e `secret_bound_at` preenchido | NOT_RUN |
| 4 | obter sessão (abrir o app com rede) | `Q1`, `Q6` | o mesmo vínculo permanece; `last_session_at` preenchido; 1 linha `device_session_issued`; o runtime não altera `secret_hash/secret_bound_at` | NOT_RUN |
| 5 | iniciar viagem: aceitar o termo, permitir a localização, confirmar a saída | tela do app; `Q1`; linha em `term-acks.jsonl` do piloto | o termo aparece ANTES do pedido de permissão; antes da saída o indicador diz "GPS DESLIGADO — AGUARDANDO A SAÍDA"; depois da saída confirmada, notificação do serviço e "GPS ATIVO — VIAGEM …" | NOT_RUN — depende de §2.7 |
| 6 | verificar captura em primeiro plano | notificação de serviço em primeiro plano; `Q2` | notificação visível; pontos chegando | NOT_RUN |
| 7 | bloquear a tela | `Q2` depois de 5 min | pontos continuam chegando | NOT_RUN |
| 8 | deixar o app em segundo plano | `Q2` depois de 5 min | pontos continuam chegando | NOT_RUN |
| 9 | caminhar ou deslocar o aparelho (≥ 500 m) | `Q2` com coordenadas; `Q5` | trilha coerente com o percurso; nenhum buraco na `sequence_local` (localização simulada é recusada pelo servidor e só aparece como buraco — §6) | NOT_RUN |
| 10 | desligar Wi-Fi e dados | hora do corte | — | NOT_RUN |
| 11 | acumular pontos sem rede (≥ 10 min) | `Q2` não cresce | nada chega; nada some no aparelho | NOT_RUN |
| 12 | reiniciar o app, ainda sem rede | hora do reinício; notificação do serviço | a viagem ativa continua a mesma (`active_trip_id` fica no Room) e a captura segue; sem rede a tela do piloto pode não carregar — anotar o que aparece | NOT_RUN |
| 13 | confirmar a fila persistida | build `debug`: `SELECT syncState, count(*) FROM gps_point GROUP BY syncState` no `entregas.db` | pontos `pending`/`failed` presentes, nenhum perdido | NOT_RUN |
| 14 | reconectar | hora da volta | — | NOT_RUN |
| 15 | sincronizar | `Q2`, `Q3` | todos os pontos do intervalo chegam, `captured_offline` verdadeiro nos do corte | NOT_RUN |
| 16 | confirmar o event log | `Q2`, `Q4`, `Q5` | uma linha por ponto: sem duplicata, sem buraco; `clock_trust = 'trusted'`; `source_mode` = o da instância | NOT_RUN |
| 17 | confirmar Entregas | `/entregas` do Product System com `DELIVERYOS_DATABASE_URL`; print | o aparelho no bloco Realidade, procedência do modo, sem selo de relógio | NOT_RUN |
| 18 | reiniciar o assíncrono | `docker restart deliveryos-async` | — | NOT_RUN |
| 19 | confirmar o replay | `docker logs deliveryos-async` (linha `[assincrono] replay`); `Q7` | `"estado":"completo"`; no escopo da unidade e do modo, `fatos` = `Q7` | NOT_RUN |
| 20 | revogar o aparelho | `npm run admin:entregas:device -- revoke --device <DEVICE_ID> --by <quem>` para gerar o plano; depois repetir com `--apply=YES --expect <FINGERPRINT>` | `revoked_at` e `revoked_by` preenchidos; histórico preservado | NOT_RUN |
| 21 | confirmar que os pontos locais não somem | capturar mais pontos; `Q2` não cresce; `gps_point` no aparelho (build `debug`) | nada novo chega; o app para de insistir e avisa; os pontos locais continuam lá | NOT_RUN |
| 22 | bateria e estabilidade para piloto | `adb shell dumpsys batterystats` antes/depois de ≥ 2 h de viagem; travamentos | consumo medido e anotado; nenhum travamento. O limite aceitável é decisão do César | NOT_RUN |

## 4 — Cenários adicionais

| cenário | como provocar | PASS se | resultado |
|---|---|---|---|
| Wi-Fi → 4G/5G | desligar o Wi-Fi no meio da viagem, com dados ligados | nenhum ponto perdido nem duplicado (`Q2`, `Q4`) | NOT_RUN |
| GPS degradado | ambiente fechado ou sob estrutura por 5 min | pontos com `accuracy_m` alta chegam como estão; nenhum inventado | NOT_RUN |
| localização desativada durante a viagem | desligar a localização do sistema | a captura para e o app avisa; ao religar, retoma. **Atenção a C2** (§6) | NOT_RUN |
| permissão revogada | revogar a permissão de localização nas configurações | a captura para. **Atenção a C2** (§6) | NOT_RUN |
| app morto pelo sistema | `adb shell am kill br.com.tata.entregas.<variante>` ou pressão de memória | o serviço volta ou o app avisa; a fila sobrevive | NOT_RUN |
| aparelho reiniciado | reiniciar no meio da viagem, sem rede | depois do boot a fila está lá (item 13) e sincroniza na volta da rede | NOT_RUN |
| viagem encerrada com a página ABERTA | encerrar a viagem no console com o app na frente | notificação some e o indicador diz "GPS DESLIGADO" em até ~15 s; `Q2` para de crescer | NOT_RUN |
| viagem encerrada com o app em SEGUNDO PLANO | abrir o mapa (ou a tela inicial) e encerrar a viagem no console | o serviço nativo consulta o estado remoto e a notificação deve sumir em até ~15 s; **AVD PROVEN em 2026-10-01, aparelho físico ainda NOT_RUN** | NOT_RUN |
| app reaberto depois de a viagem acabar | matar a UI/app com a viagem ativa, encerrar no console e depois abrir o app | o serviço deve ter encerrado pela rota nativa antes da reabertura; ao abrir, a UI apenas reflete o estado já encerrado. **AVD PROVEN em 2026-10-01, aparelho físico ainda NOT_RUN** | NOT_RUN |
| motoboy recusa o termo | tocar em "NÃO CONCORDAR / VOLTAR" | nenhum pedido de permissão; saída confirma normalmente; indicador "TERMO NÃO ACEITO"; reabrir não oferece o termo de novo | NOT_RUN |
| telefone compartilhado | outro motoboy entra no mesmo aparelho | o termo aparece de novo para ele: o aceite é por motoboy E aparelho | NOT_RUN |

## 5 — Consultas de evidência

```sql
-- Q1 · o aparelho no cadastro
SELECT device_id, unit_id, actor_id, secret_hash IS NOT NULL AS vinculado, secret_bound_at,
       last_session_at, last_seen_at, app_version, revoked_at
  FROM identity.device WHERE device_id = '<DEVICE_ID>';

-- Q2 · o que chegou, na ordem do aparelho
SELECT sequence_local, occurred_at, recorded_at, clock_trust, source_mode,
       (payload->>'captured_offline')::boolean AS offline,
       (payload->>'accuracy_m')::float AS precisao_m
  FROM platform.event_log
 WHERE device_id = '<DEVICE_ID>' AND event_type = 'gps_batch_received'
 ORDER BY sequence_local;

-- Q3 · latência de sincronização (o relógio do servidor contra o do aparelho)
SELECT (payload->>'captured_offline')::boolean AS offline, count(*) AS pontos,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM recorded_at - occurred_at)) AS mediana_s,
       max(extract(epoch FROM recorded_at - occurred_at)) AS pior_s
  FROM platform.event_log
 WHERE device_id = '<DEVICE_ID>' AND event_type = 'gps_batch_received'
 GROUP BY 1;

-- Q4 · duplicata, relógio e modo (tem de dar zero duplicata e zero suspect)
SELECT count(*) AS fatos, count(DISTINCT idempotency_key) AS chaves,
       count(*) FILTER (WHERE clock_trust <> 'trusted') AS relogio_sem_autoridade,
       string_agg(DISTINCT source_mode, ',') AS modos
  FROM platform.event_log WHERE device_id = '<DEVICE_ID>';

-- Q5 · sequência: repetição (C3) e buraco (ponto recusado pelo servidor ou perdido). As duas vazias.
SELECT sequence_local, count(*) AS vezes FROM platform.event_log
 WHERE device_id = '<DEVICE_ID>' AND event_type = 'gps_batch_received'
 GROUP BY sequence_local HAVING count(*) > 1;
SELECT anterior + 1 AS buraco_de, sequence_local - 1 AS buraco_ate FROM (
  SELECT sequence_local, lag(sequence_local) OVER (ORDER BY sequence_local) AS anterior
    FROM platform.event_log WHERE device_id = '<DEVICE_ID>' AND event_type = 'gps_batch_received') s
 WHERE sequence_local - anterior > 1;

-- Q6 · a sessão auditada
SELECT at, action, detail FROM platform.audit WHERE object_id = '<DEVICE_ID>' ORDER BY at;

-- Q7 · o que o replay tem de reconstruir: fatos da unidade no modo da instância
SELECT count(*) AS fatos FROM platform.event_log
 WHERE unit_id = '<UNIDADE>' AND source_mode = '<MODO>';
```

## 6 — O que o campo ainda precisa revelar

Os defeitos antigos foram reavaliados no código/AVD; o roteiro físico continua necessário para
provar o comportamento no aparelho real:

- **C2 — fechado no código/AVD:** o portão é reavaliado durante a viagem e o controle remoto
  também exige flag/termo/aceite vigentes. Revogar permissão ou desligar localização em telefone
  físico continua `NOT_RUN`;
- **C3 — fechado no código/AVD:** a sequência local é reservada dentro de transação Room e a
  persistência é serializada. `Q5` continua como controle de campo contra regressão;
- **receipt GPS — corrigido:** o Android interpreta aceitos/rejeitados por ponto; receipt
  inconsistente vira falha/retry, e rejeitado não volta ao lote. `Q5` ainda serve para investigar
  buracos reais/recusas, nunca para somar automaticamente como perda de rede;
- **B3 — fechado no código/AVD:** token e segredo do aparelho ficam cifrados com Android Keystore
  + AES-GCM; a regressão atual passou 18/18 instrumentados. O campo ainda precisa provar a
  experiência do aparelho físico; a cifra não protege um telefone comprometido enquanto o app roda;
- **relógio atrasado** passa como `trusted`: é indistinguível de ponto capturado sem rede e só faz o
  dado parecer mais velho — limite declarado em `docs/etapa-4-8/RELOGIO.md`.

## 7 — Registro

Um arquivo por execução, em `docs/etapa-4-8/field-gate/<data>-<aparelho>.md`, com a tabela das
seções 1, 3 e 4 preenchida e as saídas das consultas. Evidência bruta (prints, logs, dumps de
banco) **não entra no Git** sem aprovação (CLAUDE.md §9); o registro cita onde ela está.
