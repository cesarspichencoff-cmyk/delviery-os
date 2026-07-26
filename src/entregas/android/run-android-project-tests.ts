/**
 * Verificação estrutural do projeto Android.
 *
 * Por que isto existe: não há JDK, Gradle nem Android SDK neste ambiente, e
 * portanto o projeto NÃO foi compilado. Sem compilador, o risco é entregar
 * uma pasta que parece um app e não é. Estes testes atacam exatamente esse
 * risco — eles verificam o que dá para verificar sem compilar:
 *
 *  - o projeto tem as peças que um projeto Gradle Android precisa ter;
 *  - toda dependência usada no Kotlin está declarada no build;
 *  - toda classe referenciada entre arquivos existe;
 *  - toda permissão usada está no manifesto, e nenhuma a mais;
 *  - as regras de privacidade estão no código, não só no comentário;
 *  - e o mais importante: a fórmula de idempotência do Kotlin é IDÊNTICA
 *    à do TypeScript. Se elas divergirem, o servidor para de deduplicar e a
 *    fila offline duplica ponto no reenvio — falha silenciosa e cara.
 *
 * O que estes testes NÃO provam: que o Kotlin compila, que o serviço roda,
 * que a notificação aparece. Isso exige `./gradlew` e um aparelho.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pointId } from "../gps/validate";

const ROOT = process.cwd();
const ANDROID = join(ROOT, "android");

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Remove comentários antes de procurar por código.
 *
 * Sem isto o teste mede prosa: um comentário dizendo "ACCESS_BACKGROUND_LOCATION
 * NÃO é declarada" fazia o teste acusar que ela estava declarada. O que
 * interessa é o que o compilador vê.
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, " ") // XML
    .replace(/\/\*[\s\S]*?\*\//g, " ") // bloco
    .replace(/\/\/.*/g, " "); // linha
}

function read(rel: string): string {
  const p = join(ANDROID, rel);
  assert.ok(existsSync(p), `arquivo ausente: android/${rel}`);
  return readFileSync(p, "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const kotlinFiles = walk(join(ANDROID, "app", "src")).filter((f) => f.endsWith(".kt"));
const kotlinSource = kotlinFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const mainKotlin = kotlinFiles
  .filter((f) => f.includes(`${join("src", "main")}`))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
/** Versões sem comentário — usadas por tudo que verifica CÓDIGO. */
const kotlinCode = stripComments(kotlinSource);
const mainKotlinCode = stripComments(mainKotlin);

/* ------------------------------------------------------------------ *
 * 1. O projeto existe e está completo
 * ------------------------------------------------------------------ */

test("projeto Gradle tem os arquivos obrigatórios", () => {
  for (const f of [
    "settings.gradle.kts",
    "build.gradle.kts",
    "gradle.properties",
    "gradle/libs.versions.toml",
    "gradle/wrapper/gradle-wrapper.properties",
    "app/build.gradle.kts",
    "app/proguard-rules.pro",
    "app/src/main/AndroidManifest.xml",
  ]) {
    assert.ok(existsSync(join(ANDROID, f)), `falta android/${f}`);
  }
});

test("há código Kotlin de verdade, não esqueleto vazio", () => {
  assert.ok(kotlinFiles.length >= 8, `poucos arquivos Kotlin: ${kotlinFiles.length}`);
  const lines = kotlinSource.split("\n").length;
  assert.ok(lines > 800, `código Kotlin curto demais: ${lines} linhas`);
});

test("package name próprio e coerente entre manifesto e build", () => {
  const build = read("app/build.gradle.kts");
  assert.match(build, /namespace = "br\.com\.tata\.entregas"/);
  assert.match(build, /applicationId = "br\.com\.tata\.entregas"/);
  for (const f of kotlinFiles) {
    const src = readFileSync(f, "utf8");
    assert.match(
      src,
      /^package br\.com\.tata\.entregas/m,
      `pacote errado em ${relative(ROOT, f)}`,
    );
  }
});

test("debug e release configurados, sem chave de assinatura no repositório", () => {
  const build = read("app/build.gradle.kts");
  assert.match(build, /debug \{/);
  assert.match(build, /release \{/);
  assert.match(build, /isMinifyEnabled = true/);
  assert.equal(/signingConfigs/.test(build), false, "nenhuma config de assinatura versionada");
  assert.equal(/storePassword|keyPassword|keyAlias/.test(build), false, "nenhuma senha no build");
});

/* ------------------------------------------------------------------ *
 * 2. Dependências: tudo que o código usa está declarado
 * ------------------------------------------------------------------ */

test("toda biblioteca usada no Kotlin está declarada no build", () => {
  const build = read("app/build.gradle.kts");
  const versions = read("gradle/libs.versions.toml");
  const required: Array<[string, RegExp, RegExp]> = [
    ["Room", /androidx\.room/, /room\.runtime/],
    ["WorkManager", /androidx\.work/, /work\.runtime/],
    ["Fused Location", /com\.google\.android\.gms\.location/, /play\.services\.location/],
    ["Coroutines", /kotlinx\.coroutines/, /coroutines\.android/],
    ["AppCompat", /androidx\.appcompat/, /androidx\.appcompat/],
    ["Lifecycle", /androidx\.lifecycle/, /androidx\.lifecycle/],
    ["Core KTX", /androidx\.core/, /androidx\.core\.ktx/],
  ];
  for (const [nome, importPattern, depPattern] of required) {
    if (importPattern.test(mainKotlin)) {
      assert.match(build, depPattern, `${nome} é usado no Kotlin mas não está no build.gradle.kts`);
    }
  }
  // Room usa processador de anotação: sem KSP, @Dao não gera implementação.
  assert.match(build, /ksp\(libs\.room\.compiler\)/, "Room sem processador KSP não compila");
  assert.match(versions, /\[versions\]/);
  assert.match(versions, /\[libraries\]/);
  assert.match(versions, /\[plugins\]/);
});

test("catálogo de versões não tem alias órfão no build", () => {
  const build = read("app/build.gradle.kts");
  const versions = read("gradle/libs.versions.toml");
  const used = [...build.matchAll(/libs\.([a-zA-Z0-9.]+)/g)].map((m) => m[1]);
  for (const alias of new Set(used)) {
    // libs.plugins.x -> seção [plugins]; libs.x.y -> [libraries] com hífen
    const key = alias.replace(/^plugins\./, "").replace(/\./g, "-");
    assert.ok(
      versions.includes(`${key} =`),
      `alias libs.${alias} não existe em libs.versions.toml (esperado "${key}")`,
    );
  }
});

test("toda classe do projeto referenciada entre arquivos existe", () => {
  const declared = new Set<string>();
  for (const f of kotlinFiles) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^(?:internal |private )?(?:abstract |open |data |sealed )*(?:class|object|interface|enum class) (\w+)/gm)) {
      declared.add(m[1]);
    }
  }
  const projectImports = [...mainKotlin.matchAll(/^import br\.com\.tata\.entregas\.[\w.]*?(\w+)$/gm)]
    .map((m) => m[1])
    .filter((n) => /^[A-Z]/.test(n));
  for (const name of new Set(projectImports)) {
    if (name === "BuildConfig" || name === "R") continue; // gerados pelo build
    assert.ok(declared.has(name), `import de br.com.tata.entregas...${name}, mas a classe não existe`);
  }
});

/* ------------------------------------------------------------------ *
 * 3. Manifesto e permissões
 * ------------------------------------------------------------------ */

test("permissões usadas estão declaradas — e nada além do necessário", () => {
  const manifest = stripComments(read("app/src/main/AndroidManifest.xml"));
  for (const p of [
    "ACCESS_FINE_LOCATION",
    "ACCESS_COARSE_LOCATION",
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_LOCATION",
    "POST_NOTIFICATIONS",
    "INTERNET",
  ]) {
    assert.ok(manifest.includes(p), `permissão ausente: ${p}`);
  }
  // Background location daria acesso FORA da viagem — o contrato proíbe.
  assert.equal(
    manifest.includes("ACCESS_BACKGROUND_LOCATION"),
    false,
    "ACCESS_BACKGROUND_LOCATION não pode ser declarada",
  );
  for (const p of ["READ_CONTACTS", "READ_PHONE_STATE", "CAMERA", "RECORD_AUDIO", "READ_SMS"]) {
    assert.equal(manifest.includes(p), false, `permissão desnecessária declarada: ${p}`);
  }
});

test("serviço declarado como foregroundServiceType location e não exportado", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:name="\.location\.TripLocationService"/);
  assert.match(manifest, /android:foregroundServiceType="location"/);
  assert.match(manifest, /android:exported="false"/);
});

test("tráfego em texto puro é proibido, inclusive no debug", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  const release = read("app/src/main/res/xml/network_security_config.xml");
  const debug = read("app/src/main/res/xml/network_security_config_debug.xml");
  assert.match(release, /cleartextTrafficPermitted="false"/);
  assert.match(debug, /cleartextTrafficPermitted="false"/);
  // O certificado local vale por confiança de usuário, não desligando TLS.
  assert.match(debug, /<certificates src="user" \/>/);
  assert.equal(
    /<certificates src="user"/.test(release),
    false,
    "release não pode confiar em certificado instalado pelo usuário",
  );
});

test("backup e transferência não levam o banco com coordenadas", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:allowBackup="false"/);
  const rules = read("app/src/main/res/xml/data_extraction_rules.xml");
  assert.match(rules, /<exclude domain="database" path="\." \/>/);
});

/* ------------------------------------------------------------------ *
 * 4. Idempotência atravessa as duas linguagens
 * ------------------------------------------------------------------ */

test("fórmula de point_id do Kotlin é idêntica à do TypeScript", () => {
  const src = read("app/src/main/java/br/com/tata/entregas/location/CanonicalPoint.kt");
  const m = src.match(/fun pointId\([^)]*\)\s*:\s*String\s*=\s*\n?\s*"([^"]+)"/);
  assert.ok(m, "não encontrei a fórmula de pointId no Kotlin");
  // Kotlin: "gps:$deviceId:$tripId:$occurredAt"
  const kotlinTemplate = m![1]
    .replace("$deviceId", "dev-1")
    .replace("$tripId", "trip-1")
    .replace("$occurredAt", "2026-04-01T12:00:00.000Z");
  const tsValue = pointId("dev-1", "trip-1", "2026-04-01T12:00:00.000Z");
  assert.equal(
    kotlinTemplate,
    tsValue,
    "Kotlin e TypeScript geram point_id diferentes — a deduplicação do servidor quebraria",
  );
});

test("Kotlin usa a mesma schema_version de GPS do TypeScript", () => {
  const src = read("app/src/main/java/br/com/tata/entregas/location/CanonicalPoint.kt");
  assert.match(src, /const val SCHEMA_VERSION = "gps@1\.0\.0"/);
});

test("chave primária do Room é o point_id, com inserção IGNORE", () => {
  const src = read("app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt");
  assert.match(src, /@PrimaryKey val pointId: String/);
  assert.match(src, /@Insert\(onConflict = OnConflictStrategy\.IGNORE\)/);
  assert.equal(
    /fallbackToDestructiveMigration/.test(stripComments(src)),
    false,
    "migração destrutiva apagaria ponto de viagem",
  );
});

/* ------------------------------------------------------------------ *
 * 5. Privacidade e travas — no código, não só no comentário
 * ------------------------------------------------------------------ */

test("não existe caminho que ligue o serviço sem trip_id", () => {
  const svc = read("app/src/main/java/br/com/tata/entregas/location/TripLocationService.kt");
  assert.match(svc, /require\(tripId\.isNotBlank\(\)\)/, "start() exige trip_id");
  assert.match(svc, /if \(stored\.isNullOrBlank\(\)\)[\s\S]{0,120}stopBecause/,
    "recriação sem viagem ativa não pode voltar a rastrear");
  const bridge = read("app/src/main/java/br/com/tata/entregas/bridge/EntregasBridge.kt");
  assert.match(bridge, /if \(tripId\.isNullOrBlank\(\)\) return/, "ponte exige trip_id");
});

test("o portão é consultado antes de pedir posição ao Fused", () => {
  const svc = stripComments(
    read("app/src/main/java/br/com/tata/entregas/location/TripLocationService.kt"),
  );
  const gateAt = svc.indexOf("GateSnapshot.evaluate");
  const requestAt = svc.indexOf("fused.requestLocationUpdates");
  assert.ok(gateAt > 0, "serviço não consulta o portão");
  assert.ok(requestAt > 0, "serviço não pede posição");
  assert.ok(gateAt < requestAt, "portão precisa vir antes de requestLocationUpdates");
  assert.match(svc, /if \(!gate\.allowed\)[\s\S]{0,200}stopBecause/, "portão bloqueado derruba o serviço");
});

test("stop remove o callback do Fused e limpa a viagem ativa", () => {
  const svc = read("app/src/main/java/br/com/tata/entregas/location/TripLocationService.kt");
  const stopBody = svc.slice(svc.indexOf("private fun stopBecause"));
  assert.match(stopBody, /removeLocationUpdates\(callback\)/);
  assert.match(stopBody, /clear\(EntregasDatabase\.KEY_ACTIVE_TRIP\)/);
  assert.match(stopBody, /stopSelf\(\)/);
});

test("nenhuma coordenada é escrita em log pelo código Android", () => {
  const logCalls = [...mainKotlinCode.matchAll(/Log\.[dviwe]\([^)]*\)/g)].map((m) => m[0]);
  for (const call of logCalls) {
    for (const term of ["latitude", "longitude", "point.lat", "point.lon", "coords"]) {
      assert.equal(
        call.toLowerCase().includes(term),
        false,
        `log com coordenada: ${call}`,
      );
    }
  }
  assert.equal(
    /println\(/.test(mainKotlinCode),
    false,
    "println em app Android vaza para o logcat sem controle",
  );
});

test("notificação tem regra de conteúdo aplicada, não só documentada", () => {
  const n = read("app/src/main/java/br/com/tata/entregas/notify/TripNotification.kt");
  assert.match(n, /require\(isSafe\(TEXT\)\)/);
  assert.match(n, /require\(isSafe\(statusLine\)\)/);
  assert.match(n, /TATÁ Entregas — localização ativa durante a viagem/);
});

test("o WebView é trancado na origem do piloto e sem geolocalização própria", () => {
  const a = read("app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt");
  assert.match(a, /setGeolocationEnabled\(false\)/, "quem captura é o serviço nativo");
  assert.match(a, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(a, /allowFileAccess = false/);
  assert.match(a, /class OriginLockedClient/);
});

test("WebView: superfície reduzida — sem arquivo, janela, download ou form data", () => {
  const a = stripComments(read("app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt"));
  for (const [regra, padrao] of [
    ["acesso a arquivo por file://", /allowFileAccessFromFileURLs = false/],
    ["acesso universal por file://", /allowUniversalAccessFromFileURLs = false/],
    ["banco do WebView", /databaseEnabled = false/],
    ["popup automático", /javaScriptCanOpenWindowsAutomatically = false/],
    ["múltiplas janelas", /setSupportMultipleWindows\(false\)/],
    ["autocompletar de formulário", /saveFormData = false/],
    ["download", /setDownloadListener/],
    ["cookie de terceiro", /setAcceptThirdPartyCookies\([^,]+, false\)/],
  ] as Array<[string, RegExp]>) {
    assert.match(a, padrao, `WebView sem trava de ${regra}`);
  }
});

test("inspeção remota do WebView só existe em debug", () => {
  const a = stripComments(read("app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt"));
  assert.match(
    a,
    /setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/,
    "em release, USB conectado poderia ler a tela e chamar a ponte",
  );
  assert.equal(
    /setWebContentsDebuggingEnabled\(true\)/.test(a),
    false,
    "debugging nunca pode ser ligado incondicionalmente",
  );
});

test("certificado inválido é sempre recusado — nunca proceed()", () => {
  const a = stripComments(read("app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt"));
  assert.match(a, /override fun onReceivedSslError/, "a decisão precisa ser explícita no código");
  assert.match(a, /handler\?\.cancel\(\)/);
  assert.equal(
    /handler\??\.proceed\(\)/.test(a),
    false,
    "aceitar certificado inválido anula o HTTPS inteiro",
  );
});

test("nenhuma credencial viaja em URL", () => {
  // Token vai por header Authorization. Query string entra em histórico,
  // em log de servidor e em Referer.
  for (const f of kotlinFiles) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const padrao of [/\?token=/, /&token=/, /\?password=/, /\?senha=/]) {
      assert.equal(
        padrao.test(src),
        false,
        `credencial em URL em ${relative(ROOT, f)}`,
      );
    }
  }
  const api = stripComments(read("app/src/main/java/br/com/tata/entregas/sync/EntregasApi.kt"));
  assert.match(api, /setRequestProperty\("Authorization", "Bearer \$it"\)/);
});

test("nenhum trust-all de TLS no cliente HTTP", () => {
  const api = read("app/src/main/java/br/com/tata/entregas/sync/EntregasApi.kt");
  for (const perigo of [
    "setHostnameVerifier",
    "TrustAllCerts",
    "X509TrustManager",
    "ALLOW_ALL_HOSTNAME_VERIFIER",
    "setDefaultSSLSocketFactory",
  ]) {
    assert.equal(
      stripComments(api).includes(perigo),
      false,
      `desvio de TLS encontrado: ${perigo}`,
    );
  }
});

test("nenhum identificador de aparelho persistente do sistema é usado", () => {
  for (const proibido of ["ANDROID_ID", "getDeviceId", "getImei", "getSubscriberId", "getMacAddress"]) {
    assert.equal(
      mainKotlinCode.includes(proibido),
      false,
      `identificador não pseudonimizado: ${proibido}`,
    );
  }
  const g = read("app/src/main/java/br/com/tata/entregas/location/GateSnapshot.kt");
  assert.match(g, /UUID\.randomUUID\(\)/, "device_id é pseudônimo gerado localmente");
});

test("nenhum segredo, token ou URL de produção embutido no Kotlin", () => {
  assert.equal(/BEGIN (RSA |EC )?PRIVATE KEY/.test(kotlinSource), false);
  const build = read("app/build.gradle.kts");
  assert.match(build, /entregas\.baseUrl/, "endereço vem de propriedade do Gradle");
  assert.equal(
    /https:\/\/(?!10\.0\.2\.2)[a-z0-9-]+\.[a-z]{2,}/i.test(mainKotlinCode),
    false,
    "URL externa embutida no Kotlin",
  );
});

test("o domínio não é duplicado no Kotlin", () => {
  // Máquina de estados, validação de transição e confirmação de entrega são
  // do servidor. O Kotlin captura, guarda e envia — mais nada.
  for (const proibido of [
    "applyArrivalDetected",
    "applyDeliveryConfirmed",
    "evaluateReturn",
    "closeTripAutomatic",
    "INVALID_TRANSITION",
  ]) {
    assert.equal(
      kotlinCode.includes(proibido),
      false,
      `regra de domínio duplicada no Kotlin: ${proibido}`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * 6. Sincronização
 * ------------------------------------------------------------------ */

test("worker só marca enviado quando o servidor confirmou", () => {
  const w = read("app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt");
  assert.match(w, /is ApiResult\.Ok -> db\.gpsPoints\(\)\.markSent\(ids\)/);
  assert.match(w, /is ApiResult\.Retryable -> \{[\s\S]{0,120}markFailed/);
  assert.match(w, /Result\.retry\(\)/);
});

test("erro do servidor distingue retentável de recusa definitiva", () => {
  const api = read("app/src/main/java/br/com/tata/entregas/sync/EntregasApi.kt");
  assert.match(api, /status in 400\.\.499 -> ApiResult\.Rejected/);
  assert.match(api, /else -> ApiResult\.Retryable/);
});

test("sincronização exige rede e tem backoff exponencial", () => {
  const w = read("app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt");
  assert.match(w, /setRequiredNetworkType\(NetworkType\.CONNECTED\)/);
  assert.match(w, /BackoffPolicy\.EXPONENTIAL/);
  assert.match(w, /ExistingWorkPolicy\.KEEP/, "não empilha um trabalho por ponto");
});

test("lote sai ordenado por sequence_local", () => {
  const db = read("app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt");
  assert.match(db, /ORDER BY sequenceLocal ASC/);
});

test("expurgo de retenção só remove o que já subiu", () => {
  const db = read("app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt");
  assert.match(db, /DELETE FROM gps_point WHERE syncState = 'sent' AND createdAtMs < :beforeMs/);
});

/* ------------------------------------------------------------------ *
 * 7. Testes do lado Kotlin existem
 * ------------------------------------------------------------------ */

test("existem testes unitários e instrumentados escritos", () => {
  const unit = kotlinFiles.filter((f) => f.includes(join("src", "test")));
  const instr = kotlinFiles.filter((f) => f.includes(join("src", "androidTest")));
  assert.ok(unit.length > 0, "nenhum teste unitário Kotlin");
  assert.ok(instr.length > 0, "nenhum teste instrumentado");
  const all = [...unit, ...instr].map((f) => readFileSync(f, "utf8")).join("\n");
  const count = (all.match(/@Test/g) ?? []).length;
  assert.ok(count >= 25, `poucos testes Kotlin: ${count}`);
});

test("fixtures Kotlin usam coordenada sintética, nunca real", () => {
  const tests = kotlinFiles
    .filter((f) => f.includes(join("src", "test")) || f.includes(join("src", "androidTest")))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const coords = [...tests.matchAll(/-?\d{1,3}\.\d{4,}/g)].map((m) => m[0]);
  assert.deepEqual(coords, [], `coordenada com precisão real em fixture: ${coords.join(", ")}`);
});

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

console.log("=== Projeto Android — verificação estrutural ===");
console.log(`arquivos Kotlin: ${kotlinFiles.length}`);
if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} android project tests OK ===`);
