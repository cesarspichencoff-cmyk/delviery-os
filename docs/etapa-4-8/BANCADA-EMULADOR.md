---
lifecycle:
  artefato: docs/etapa-4-8/BANCADA-EMULADOR.md
  status: ACTIVE
  authority_scope: bancada_emulador_android
  superseded_by: null
  atualizado_em: "2026-09-25"
  state_basis: 46921f5
  question_refs: ["Q-018"]
---

# Bancada do emulador — do app até o event log, em laboratório

> Tudo aqui é laboratório `simulated`. Emulador é evidência de emulador. Nada deste documento muda
> `pilot`, `release`, produção ou contrato de API. **Esta análise rodou na nuvem, sem acesso ao
> Foxxy:** o que depende do emulador está `NOT_RUN` até alguém executar a §3 lá.

## 0 — Respostas (2026-09-25)

| pergunta | resposta | onde |
|---|---|---|
| causa do `RETRY` | **o próprio app recusa `http://`.** O APK de bancada foi gerado com `http://10.0.2.2:5193` e `http://10.0.2.2:8080`, e **toda** variante — `debug` inclusive — usa uma política de rede com `cleartextTrafficPermitted="false"` e nenhuma exceção. A requisição morre dentro do processo, antes de abrir socket; o `SyncWorker` devolve `RETRY` | §1 |
| caminho de rede | HTTPS de bancada, **sem código novo**: emulador → `https://10.0.2.2:8080` → loopback do Windows → encaminhamento de localhost do WSL → `socat` TLS → crítico em `127.0.0.1:18080`; piloto com o HTTPS nativo dele em `5193`; CA de laboratório instalada como CA de usuário no emulador — que o `debug` aceita e `pilot`/`release` recusam | §2 |
| bootstrap | **`NOT_RUN` no emulador.** **PASS na bancada TLS da nuvem**, com os binários reais e o mesmo `HttpsURLConnection` do app | §3.8, §5 |
| primeiro fato do app até o `event_log` | **`BLOCKED` — o app não tem gatilho legítimo para ligar a captura.** Nenhuma página chama a ponte `EntregasNative`, em toda a história do repositório. `Q-018`. O lado da plataforma — sessão, lote, `event_log` simulated, assíncrono, replay — está PASS na bancada da nuvem | §4, §5 |
| Entregas lendo o fato | **`NOT_RUN` no emulador** (depende do fato). Na bancada da nuvem, **PASS**: `/api/entregas` mostra o aparelho — credencial vinculada, GPS `fresh`, modo `simulated` — em bloco separado da demonstração. Depois do bootstrap no Foxxy dá para provar a parte do aparelho, sem fato | §3.10, §5 |

## 1 — O `RETRY`, lido no código

**A política de rede.** O `debug` usa `@xml/network_security_config_debug`
(`android/app/build.gradle.kts`, `manifestPlaceholders`), e o arquivo diz, inteiro:
`<base-config cleartextTrafficPermitted="false">` confiando em `system` **e** `user` — com o comentário
"HTTP puro não é aceito nem no debug". `pilot` e `release` usam `network_security_config.xml`, igual
mas só com `system`. O manifesto ainda declara `android:usesCleartextTraffic="false"`. Não há
`domain-config` com exceção em nenhum dos dois.

**O mal-entendido.** O `build.gradle.kts` deixa o `debug` fora do *gate de endereço*: é ele que
permite gerar um APK apontando para `10.0.2.2`. Esse gate roda em tempo de build; ele não muda a
política de rede, que é aplicada pelo Android em tempo de execução. Gerar com `http://` compila e
instala — e não fala com ninguém.

**Como vira `RETRY`.** No Android, `HttpURLConnection` para `http://` com cleartext proibido lança
`java.net.UnknownServiceException` ("CLEARTEXT communication to 10.0.2.2 not permitted by network
security policy"), que é um `IOException`. `EntregasApi.request` transforma todo `IOException` em
`ApiResult.Retryable(e.javaClass.simpleName)`; `DeviceSession.autenticar` o devolve como
`FalhouTemporariamente`; o `SyncWorker`, sem sessão, faz `return Result.retry()`.

**O banco confirma que o pedido não chegou.** Para um aparelho autorizado e não revogado, com
`device_id` e segredo de 32 hex — o que o app manda —, o crítico faz primeiro
`UPDATE identity.device SET secret_hash … WHERE secret_hash IS NULL` (`auth/device-session.ts`,
`PgDeviceRegistry.vincularSegredo`). Nenhuma recusa anterior se aplica a esse aparelho. Depois do
worker, o Foxxy relatou `vinculado = false` e `last_session_at` nulo: o pedido não chegou ao crítico.

**O que o código NÃO permite afirmar.** O app não registra nem loga o motivo da falha (o `motivo` de
`FalhouTemporariamente` é descartado; não há `Log` em `sync/`). Então `RETRY` sozinho não separa
cleartext, rede, TLS ou 401 — e as hipóteses de rede (A e B do pedido) **não foram refutadas**: o
teste com `toybox nc` sem pedido HTTP e sem `-q` não prova nem desprova nada. O cleartext (C) basta
para explicar o `RETRY` e é certo por construção; A/B só importam depois do HTTPS, e a §3.5 as mede.

## 2 — O caminho de laboratório, sem código novo

```
emulador (APK debug, defaults do build)          WSL (tudo em loopback)
  https://10.0.2.2:8080  ── Windows 127.0.0.1:8080 ──► socat TLS 127.0.0.1:8080 ──► crítico 127.0.0.1:18080
  https://10.0.2.2:5193  ── Windows 127.0.0.1:5193 ──► piloto HTTPS nativo 127.0.0.1:5193
  confia na CA de laboratório (CA de usuário; o debug aceita)
```

- **Por que TLS e não liberar cleartext:** liberar HTTP no `debug` seria mudar a política que o
  próprio arquivo declara, e é código. O desenho já previa o laboratório com CA local: o `debug`
  confia em CA de usuário exatamente para isso.
- **Por que as portas padrão:** os defaults do `build.gradle.kts` são `https://10.0.2.2:5193` e
  `https://10.0.2.2:8080`. Com o crítico movido para `18080` e o TLS em `8080`, o APK é o `debug`
  de sempre — sem `-P` especial.
- **O crítico não fala TLS** (a borda faz isso, §10 de `docs/etapa-4-8/CADEIA-REAL.md`); o `socat`
  é a borda de bancada. **O piloto fala TLS nativo** (`ENTREGAS_HTTPS=1`, `ENTREGAS_TLS_CERT`,
  `ENTREGAS_TLS_KEY`) e, em loopback, continua em modo local.
- **Não usar `ENTREGAS_BIND=0.0.0.0` aqui:** bind fora de loopback põe o piloto em modo remoto, e ele
  recusa subir sem `ENTREGAS_USERS` e `ENTREGAS_ALLOWED_ORIGINS` (medido, §6).
- **O certificado precisa cobrir `10.0.2.2`.** É o host que o app vê. Sem ele, a verificação de nome
  recusa (a mutação da §5 prova).

## 3 — Procedimento no Foxxy

Cada passo anota **quem**, **quando** e a **saída**. Nenhum comando imprime token ou segredo.

### 3.1 PKI de laboratório (WSL, fora do Git)

```bash
mkdir -p ~/deliveryos-lab-tls && cd ~/deliveryos-lab-tls && chmod 700 .
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -sha256 -keyout ca.key -out ca.pem \
  -subj "/CN=DeliveryOS Bancada CA (laboratorio)" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl req -newkey rsa:2048 -nodes -keyout srv.key -out srv.csr -subj "/CN=bancada 10.0.2.2"
printf 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:10.0.2.2,IP:127.0.0.1,DNS:localhost\n' > srv.ext
openssl x509 -req -in srv.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 365 -sha256 -extfile srv.ext -out srv.pem
openssl verify -CAfile ca.pem srv.pem                  # srv.pem: OK
openssl x509 -in ca.pem -outform der -out ca.crt       # a CA que vai para o emulador
chmod 600 ca.key srv.key
cp ca.pem ca.crt /mnt/c/Users/<USUARIO_WINDOWS>/       # só a CA pública; as chaves ficam no WSL
```

`tools/entregas_cert_local.sh` **não** serve aqui: o certificado dele não cobre `10.0.2.2` (§6).

### 3.2 Crítico atrás do TLS (WSL)

1. Parar o crítico de hoje e subir de novo **com as mesmas variáveis**, trocando só a porta:
   `DELIVERYOS_PORT=18080` (continua `DELIVERYOS_SOURCE_MODE=simulated` e `127.0.0.1`).
2. `sudo apt-get install -y socat`, e num terminal próprio:

```bash
socat OPENSSL-LISTEN:8080,bind=127.0.0.1,reuseaddr,fork,cert=$HOME/deliveryos-lab-tls/srv.pem,key=$HOME/deliveryos-lab-tls/srv.key,verify=0 TCP:127.0.0.1:18080
```

### 3.3 Piloto com HTTPS nativo (WSL)

Parar o piloto HTTP e subir de novo, sem `ENTREGAS_BIND`:

```bash
cd ~/deliveryos-lab
ENTREGAS_HTTPS=1 ENTREGAS_TLS_CERT=$HOME/deliveryos-lab-tls/srv.pem ENTREGAS_TLS_KEY=$HOME/deliveryos-lab-tls/srv.key \
ENTREGAS_PILOT_CONFIG=config/entregas-pilot.example.json node dist/tools/entregas_pilot_server.js
```

### 3.4 Conferir do Windows (PowerShell)

```powershell
curl.exe --ssl-no-revoke --cacert $env:USERPROFILE\ca.pem https://127.0.0.1:8080/health
curl.exe --ssl-no-revoke --cacert $env:USERPROFILE\ca.pem -o NUL -w "%{http_code}`n" https://127.0.0.1:5193/rider-mobile/
```

PASS: JSON de saúde do crítico e `200` do piloto. (`--ssl-no-revoke`: a CA de laboratório não tem
lista de revogação, e o Schannel do Windows reclamaria disso, não do certificado.)

### 3.5 Rede do emulador — hipóteses A e B, sem TLS no meio

A porta interna `18080` é HTTP puro, e o encaminhamento do WSL a expõe no loopback do Windows:

```powershell
adb shell "printf 'GET /health HTTP/1.0\r\n\r\n' | toybox nc -q 5 10.0.2.2 18080"
```

- `HTTP/1.1 200` → o emulador alcança o loopback do WSL pelo Windows: **A refutada**.
- recusado ou sem resposta → **A confirmada**. Saída de laboratório, sem código:
  `adb reverse tcp:8080 tcp:8080` e `adb reverse tcp:5193 tcp:5193`, e gerar o APK com
  `https://127.0.0.1:8080` e `https://127.0.0.1:5193` (o certificado cobre `127.0.0.1`).
- Se `-q` não existir nesta `toybox`, trocar por `-W 5`.

### 3.6 CA de laboratório no emulador

```powershell
adb push $env:USERPROFILE\ca.crt /sdcard/Download/deliveryos-bancada-ca.crt
```

No emulador: Configurações → Segurança e privacidade → Mais configurações de segurança →
Criptografia e credenciais → Instalar um certificado → **Certificado de CA** → Instalar mesmo assim →
`deliveryos-bancada-ca.crt`. Se o Android exigir bloqueio de tela, só no laboratório:
`adb shell locksettings set-pin 1234`. Conferir em Credenciais confiáveis → aba **Usuário** →
"DeliveryOS Bancada CA (laboratorio)".

### 3.7 APK com HTTPS

```powershell
cd android
.\gradlew.bat :app:assembleDebug "-Pentregas.baseUrl=https://10.0.2.2:5193" "-Pentregas.platformUrl=https://10.0.2.2:8080"
```

Os `-P` explícitos sobrepõem qualquer `http://` que tenha ficado em `gradle.properties`. Conferir no
binário, pelo WSL: `unzip -p app/build/outputs/apk/debug/app-debug.apk 'classes*.dex' | strings | grep -E '^https?://10\.0\.2\.2'`
— **só** `https://`. Instalar **mantendo os dados**: `adb install -r app\build\outputs\apk\debug\app-debug.apk`.
O `-r` preserva o Room: o mesmo `device_id` (`dev-341c9a37d33d4d88`) e o mesmo segredo. Desinstalar
geraria outro aparelho, que precisaria de nova autorização.

### 3.8 Bootstrap

```powershell
adb shell dumpsys jobscheduler | findstr /C:"br.com.tata.entregas.debug"    # o id do job
adb shell cmd jobscheduler run -f br.com.tata.entregas.debug <JOB_ID>
adb logcat -d -s WM-WorkerWrapper | findstr /C:"Worker result"
```

A linha do worker **não** é a prova: depois da sessão ele ainda fala com o piloto (políticas, termo),
e uma falha ali devolve `RETRY` mesmo com a sessão emitida. A prova é o banco e o Room:

```bash
psql '<URL do laboratório>' \
  -c "SELECT device_id, secret_hash IS NOT NULL AS vinculado, secret_bound_at, last_session_at, app_version, revoked_at FROM identity.device WHERE device_id = 'dev-341c9a37d33d4d88'" \
  -c "SELECT at, action FROM platform.audit WHERE object_id = 'dev-341c9a37d33d4d88' ORDER BY at"
```

Room, extraído como já foi feito (por `cmd /c "adb exec-out run-as br.com.tata.entregas.debug cat databases/entregas.db > entregas.db"`,
e o mesmo para `-wal` e `-shm`; nunca pelo `>` do PowerShell 5, que grava texto e corrompe binário):

```bash
sqlite3 entregas.db "SELECT key, length(value) AS tamanho FROM device_state WHERE key = 'session_token'" \
                    "SELECT key, value FROM device_state WHERE key = 'session_token_expires_at'"
```

| item | PASS se | resultado |
|---|---|---|
| B1 vínculo | `vinculado = t`, `secret_bound_at` preenchido | NOT_RUN |
| B2 sessão | `last_session_at` preenchido e ≥ 1 `device_session_issued` | NOT_RUN |
| B3 token no Room | `session_token` com `tamanho > 0` — o valor nunca é impresso | NOT_RUN |
| B4 validade no Room | `session_token_expires_at` ≈ agora + 12 h, em ms desde a época | NOT_RUN |

### 3.9 O experimento que separa C de A

Mesmo emulador, mesmo caminho de rede, mesmo aparelho: o APK `http://` não vinculou (relatado); se
o APK `https://` vincular (B1), a causa era o cleartext. Se a §3.5 der 200 e mesmo assim B1 falhar,
o problema é TLS — quase sempre a CA não instalada na aba **Usuário**.

### 3.10 Entregas, a parte do aparelho (sem fato)

```bash
cd ~/deliveryos-lab
PRODUCT_UI_PORT=5290 DELIVERYOS_DATABASE_URL='<URL do laboratório>' npx tsx tools/product_system_server.ts
curl -s http://127.0.0.1:5290/api/entregas | python3 -c "import json,sys; r=json.load(sys.stdin)['realidade']; print([(a['device_id'], a['credencial'].get('valor'), a['ultima_sessao'].get('valor'), a['gps'].get('valor')) for a in r['aparelhos']])"
```

Com as mesmas variáveis de banco dos runtimes. PASS: o aparelho aparece em `realidade.aparelhos` com
`credencial` `vinculada` e `ultima_sessao` preenchida; o GPS fica sem lote — e **tem** de aparecer
assim, nunca como fresco.

## 4 — O primeiro fato: `BLOCKED`

O app tem a captura nativa pronta — `TripLocationService` → Room → `SyncWorker` →
`/api/gps/batch` — e **nenhuma tela a liga**:

- o serviço é `android:exported="false"` e só é ligado por `MainActivity.startTripCapture`, que só é
  alcançado pela ponte JavaScript `EntregasNative` (`bridge/EntregasBridge.kt`);
- a WebView carrega `${ENTREGAS_BASE_URL}/rider-mobile/`, presa a essa origem. O `index.html` carrega
  **só** `rider.js`, que manda comandos ao piloto (`ConfirmTripDeparture` e outros, com identidade de
  demonstração `demo-unit`/`rid-demo`) e **nunca** chama a ponte;
- `consent-screen.js` e `gps-status.js` — "a tela do termo e o status de GPS já foram construídos e
  testados em JavaScript", diz o `MainActivity` — têm suítes próprias verdes que importam o
  arquivo-fonte (`run-field-tests`, 36; `run-native-consent-tests`, 79), mas **nenhuma página os
  carrega**;
- `git log -S EntregasNative` acha só `4a4fefa` (2026-07-25, a criação do app);
  `git log -S startTripCapture` em `*.js`, `*.html` e `*.ts` não acha nada. A ponte **nunca** teve o
  lado JavaScript.

Consequência: não existe mecanismo legítimo, hoje, para o app produzir um ponto. Ligar o serviço por
`adb` como root ainda esbarraria no portão de captura — o aceite do termo só entra no Room pela mesma
ponte — e gravar esse aceite à mão seria fabricar consentimento. **Não foi feito.**

Para destravar, três coisas, nenhuma de laboratório:

1. **`Q-018`** — quem liga a captura: a página `rider-mobile` do piloto passar a chamar a ponte
   (`src/entregas/**`, Preservation Set) ou um gatilho nativo no app. `PAUSE` até o César responder;
2. **o termo publicável** — os campos que só o César decide, já listados em
   `docs/entregas/pilot/CHECKLIST_ATIVACAO.md` §A (razão social, CNPJ, canal, vigência, retenção,
   `approved`). Não foram inventados, nem para laboratório;
3. **a flag de GPS do piloto** (`config/entregas-gps-flags.json`, `gps_capture_enabled`) — essa sim
   é configuração de laboratório, fora do Git.

A mesma lacuna trava a bateria física: o passo 5 de `docs/etapa-4-8/FIELD-GATE-ANDROID.md` e todos os
que dependem de ponto capturado.

## 5 — O que a bancada TLS da nuvem provou (`tools/bancada_tls_real.sh`)

A topologia da §2, com o crítico e o assíncrono de `dist/`, PostgreSQL real em banco isolado, o
piloto com HTTPS nativo, `socat`, e relays TCP em `10.0.2.2` fazendo o papel do Windows e do
emulador. O cliente (`tools/bancada_tls_cliente.java`) é o `HttpsURLConnection` do app, confiando só
na CA de laboratório, sem verificador de nome customizado.

| medida | resultado |
|---|---|
| N1 — sem a CA de laboratório | `SSLHandshakeException`, PKIX: a confiança vem dela |
| N2 — mesmo listener por `10.0.2.3`, fora do SAN | `No subject alternative names matching IP address 10.0.2.3 found` |
| sessão, corpo exato de `DeviceSession.autenticar` | `200`, `device_token` presente, `expires_in_s=43200`; renovação `200` |
| lote, formato do `SyncWorker` | `200`, `aceito`, `accepted=1`, `ack_through_sequence=1`; sem token, `401` |
| banco | vinculado, `secret_bound_at` e `last_session_at` preenchidos; `device_session_issued`; 1 fato `simulated`, `clock_trust=trusted` |
| assíncrono | outbox drenada; Operação Viva aplicou 1; depois de reinício, replay `lidas 1, aptos 1, aplicados 1` |
| `/api/entregas` | o aparelho na realidade: credencial `vinculada`, GPS `fresh`, modo `simulated`, 1 fato; demonstração em blocos separados |
| mutação: certificado sem `10.0.2.2` | **`BANCADA_TLS_RED (8)`**: SAN, cliente e a cadeia inteira abaixo |

`BANCADA_TLS_GREEN`, sem processo, porta, banco ou alias sobrando.

**O que ela não prova:** nada do Android — a política de rede de verdade, a CA de usuário, a
WebView, o NAT do emulador, o encaminhamento do WSL. Isso é a §3.

## 6 — Achados laterais, registrados e não corrigidos

- `tools/entregas_cert_local.sh` emite para `localhost`, `127.0.0.1`, `::1` e o IP da LAN — **não**
  para `10.0.2.2` — e manda subir o piloto com `ENTREGAS_BIND=0.0.0.0` sem `ENTREGAS_USERS` e
  `ENTREGAS_ALLOWED_ORIGINS`. Medido: com esse bind o piloto recusa subir ("obrigatório em modo
  remoto"). Serve a um celular na LAN com as duas variáveis; não serve ao emulador.
- O app descarta o motivo da falha de sessão. Diagnóstico de campo depende do banco do servidor.
  Registrar o motivo seria código no Android, fora desta missão.

## 7 — UNKNOWN

- se o emulador alcança o loopback do WSL por `10.0.2.2` (§3.5);
- se a imagem do AVD aceita CA de usuário sem bloqueio de tela, e se a WebView do piloto a respeita
  (a política do `debug` diz que sim; não medido);
- a classe exata da exceção no aparelho: o app não a registra.
