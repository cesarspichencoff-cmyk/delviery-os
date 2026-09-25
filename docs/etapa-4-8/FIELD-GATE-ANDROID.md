---
lifecycle:
  artefato: docs/etapa-4-8/FIELD-GATE-ANDROID.md
  status: ACTIVE
  authority_scope: field_gate_android
  superseded_by: null
  atualizado_em: "2026-09-25"
  state_basis: c24b4ec
---

# Field gate físico do Android — roteiro

> **Nada deste roteiro foi executado em aparelho.** Todo resultado nasce `NOT_RUN` e só muda
> com evidência anexada: `PASS`, `FAIL` ou `BLOCKED`. Nunca inferido, nunca "deve funcionar".
> Emulador é evidência de emulador; o que vale aqui é o aparelho na rua.

## 0 — Estado de partida (2026-09-25)

| dimensão | estado | fonte |
|---|---|---|
| contrato de bootstrap, sessão e sincronização | **PROVEN** com aparelho LÓGICO e os binários reais | `test:platform:cadeia` 35/35; `docs/etapa-4-8/CADEIA-REAL.md` |
| relógio do aparelho no servidor | **PROVEN**: relógio adiantado vira `suspect`, não fabrica frescor, sobrevive ao replay | `test:platform:relogio`; `docs/etapa-4-8/RELOGIO.md` |
| papéis mínimos na composição oficial | **PROVEN** em containers | `tools/papeis_compose_real.sh` |
| comportamento físico do Android | **UNKNOWN** | este roteiro |
| build do app (`testDebugUnitTest`, `assembleDebug`, instrumentados) | **BLOCKED no sandbox de nuvem**: a rede nega `dl.google.com`, de onde vêm o plugin Android e o SDK | `docs/execution/BLOCKERS.md`, "Android — o app não compila neste ambiente" |

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
| A1 unit tests | `BUILD SUCCESSFUL` e o relatório em `app/build/reports/tests/testDebugUnitTest/` sem falha | NOT_RUN |
| A2 APK de debug | o arquivo existe e `aapt dump badging` mostra `br.com.tata.entregas.debug` | NOT_RUN |
| A3 instrumentado | `connectedDebugAndroidTest` sem falha, no aparelho do teste | NOT_RUN |
| A4 `android/gate-verification` | **FAIL_PREEXISTENTE conhecido** desde `4456f2e`: `EntregasApi.kt` usa `DeviceSession.semSegredo`, que importa o Room. Não é regressão. Conserto: levar `semSegredo` para um arquivo Kotlin puro — feito ali, onde o app compila | NOT_RUN |

**Compilar não é instalar, e instalar não é testar em campo.** Um `BUILD SUCCESSFUL` fecha A1–A2;
nada da seção 3.

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
4. **Descobrir o `device_id`.** O app o gera e o guarda no Room (`entregas.db`, tabela
   `device_state`, chave `device_id`).
   - Build `debug`: `adb exec-out run-as br.com.tata.entregas.debug cat databases/entregas.db > entregas.db`
     (copie também `-wal` e `-shm`, se existirem) e
     `sqlite3 entregas.db "SELECT value FROM device_state WHERE key = 'device_id'"`.
   - Build `pilot`: **não há caminho hoje** — a variante não é depurável, o app não mostra o ID na
     tela e o crítico não registra o ID de sessão recusada. **BLOCKED** até existir um dos dois;
     o primeiro gate físico pode ser feito com o `debug`.
5. **Autorizar o aparelho** — ato humano, no banco da composição:

   ```sql
   INSERT INTO identity.unit (unit_id, display_name) VALUES ('<UNIDADE>', '<nome>') ON CONFLICT DO NOTHING;
   INSERT INTO identity.actor (actor_id, unit_id, role, label) VALUES ('<ENTREGADOR>', '<UNIDADE>', 'motoboy_interno', '<rótulo>') ON CONFLICT DO NOTHING;
   INSERT INTO identity.device (device_id, unit_id, actor_id, label) VALUES ('<DEVICE_ID>', '<UNIDADE>', '<ENTREGADOR>', 'field gate');
   ```
6. **APK de piloto** (item 1 da bateria): exige os domínios reais e uma assinatura.
   `sh gradlew :app:assemblePilot -Pentregas.baseUrl=https://<PILOTO> -Pentregas.platformUrl=https://<PLATAFORMA>`
   gera um APK **sem assinatura** (`signingConfig = null`: nenhuma chave no repositório). Assinar é
   do César, com a chave dele, fora do Git. Sem isso: **BLOCKED**, e o gate roda com o `debug`.

## 3 — A bateria principal

Cada linha anota: **quem**, **quando** (UTC), **aparelho** (modelo e Android), **evidência**
(arquivo, print, saída de SQL) e o **resultado**. As consultas `Q1`–`Q6` estão na seção 5.

| # | ação | evidência | PASS se | resultado |
|---|---|---|---|---|
| 1 | instalar o APK de piloto (ou o de debug — anotar qual) | `adb install` e versão na tela | instala e abre | NOT_RUN |
| 2 | confirmar data e hora automáticas | print da configuração; diferença para `date -u` do servidor | automáticas ligadas e diferença < 2 min | NOT_RUN |
| 3 | autorizar o aparelho (§2.5) | `Q1` | uma linha, `revoked_at` nulo, `vinculado` falso | NOT_RUN |
| 4 | obter sessão (abrir o app com rede) | `Q1`, `Q6` | `vinculado` verdadeiro e `last_session_at` preenchido; 1 linha `device_session_issued` | NOT_RUN |
| 5 | iniciar viagem | tela do app | viagem ativa; termo aceito antes da permissão | NOT_RUN |
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
| 20 | revogar o aparelho | `UPDATE identity.device SET revoked_at = now(), revoked_by = '<quem>' WHERE device_id = '<DEVICE_ID>'` | — | NOT_RUN |
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

## 6 — O que o campo pode revelar (não re-verificado aqui)

Defeitos do Android registrados em `docs/execution/BLOCKERS.md` e **não reavaliados** desde
2026-08-01. O campo é onde eles aparecem:

- **C2** — o portão de captura é avaliado uma vez só: revogar permissão, termo ou localização
  durante a viagem pode não parar a captura (§4);
- **C3** — corrida na `sequenceLocal`: `Q5` pega repetição;
- **recusa por conteúdo some do aparelho, por desenho.** Qualquer 2xx marca o lote inteiro como
  `sent` (`SyncWorker.kt`); o app não lê `rejeitados` nem `ack_through_sequence`. É o contrato da
  ingestão — reenviar o que foi recusado por conteúdo não mudaria nada —, mas o motivo da recusa só
  existe na resposta HTTP, e no servidor o ponto aparece apenas como **buraco** na `sequence_local`
  (`Q5`). Localização simulada (`is_mock`) é recusada assim (`device-ingest.ts`). Buraco é para
  investigar, nunca para somar como perda de rede;
- **B3** — token sem cifragem por Keystore: não aparece em campo, mas pesa na decisão de piloto;
- **relógio atrasado** passa como `trusted`: é indistinguível de ponto capturado sem rede e só faz o
  dado parecer mais velho — limite declarado em `docs/etapa-4-8/RELOGIO.md`.

## 7 — Registro

Um arquivo por execução, em `docs/etapa-4-8/field-gate/<data>-<aparelho>.md`, com a tabela das
seções 1, 3 e 4 preenchida e as saídas das consultas. Evidência bruta (prints, logs, dumps de
banco) **não entra no Git** sem aprovação (CLAUDE.md §9); o registro cita onde ela está.
