/**
 * Q-018 — a regra de captura da rider-mobile e o adaptador da ponte, sozinhos.
 *
 * `capture-rule.js`, `native-bridge.js` e `gps-status.js` são ESM de
 * navegador (não passam pelo tsc): o MESMO código é copiado para um `.mjs`
 * temporário e executado, como em `run-field-tests.ts`. Comportamento real,
 * não texto.
 *
 * E três conferências estruturais que impedem a deriva silenciosa entre as
 * pontas da ponte: os métodos `@JavascriptInterface` do Kotlin, a lista que a
 * página conhece, e a ponte falsa da prova com navegador
 * (`run-rider-bridge-tests.ts`) são o mesmo conjunto de nomes.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = process.cwd();
const RIDER = join(RAIZ, "src/entregas/ui/rider-mobile");

let passou = 0;
const falhas: string[] = [];
function teste(nome: string, corpo: () => void): void {
  try {
    corpo();
    passou += 1;
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}

// `new Function` preserva o import() nativo: o tsc o trocaria por require().
const importar = new Function("s", "return import(s)") as (s: string) => Promise<Record<string, unknown>>;

async function carregar(nome: string, dir: string): Promise<Record<string, unknown>> {
  const mjs = join(dir, `${nome}.mjs`);
  writeFileSync(mjs, readFileSync(join(RIDER, `${nome}.js`), "utf8"));
  return importar(pathToFileURL(mjs).href);
}

type Ctx = Record<string, unknown>;
type Decisao = { capture: boolean; trip_id: string | null; reason: string | null };

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "rider-capture-"));
  try {
    const regra = await carregar("capture-rule", dir);
    const ponte = await carregar("native-bridge", dir);
    const status = await carregar("gps-status", dir);
    const decidir = regra.captureDecision as (c: Ctx) => Decisao;
    const TEXTO = regra.OFF_REASON_TEXT as Record<string, string | null>;

    /** Tudo válido: é daqui que cada teste tira UMA condição. */
    const valido = (): Ctx => ({
      native: true,
      actor: { actor_id: "rid-1", role: "motoboy_interno" },
      policies: { flags: { gps_capture_enabled: true }, term: { publishable: true, hash: "h-1" } },
      ack: { rider_id: "rid-1", device_id: "dev-1", term_hash: "h-1", status: "accepted" },
      deviceId: "dev-1",
      permission: "granted",
      trip: { trip_id: "T-1", state: "em_rota", courier_actor_id: "rid-1" },
    });

    console.log("\n=== Q-018 — regra de captura e adaptador da ponte ===\n");

    teste("R1 tudo válido e saída confirmada (em_rota): liga a MESMA viagem", () => {
      assert.deepEqual(decidir(valido()), { capture: true, trip_id: "T-1", reason: null });
    });
    teste("R2 retornando ainda é viagem ativa: segue ligada", () => {
      const c = valido();
      (c.trip as Ctx).state = "retornando";
      assert.equal(decidir(c).capture, true);
    });

    // Cada linha remove UMA garantia do contexto válido e exige o motivo certo.
    const quebras: [string, (c: Ctx) => void, string][] = [
      ["sem ponte", (c) => (c.native = false), "sem_ponte"],
      ["sem sessão", (c) => (c.actor = null), "sem_motoboy"],
      ["sessão de operador", (c) => ((c.actor as Ctx).role = "operador_expedicao"), "sem_motoboy"],
      ["sem políticas", (c) => (c.policies = null), "gps_desligado"],
      ["flag desligada", (c) => ((c.policies as { flags: Ctx }).flags.gps_capture_enabled = false), "gps_desligado"],
      ["flag como texto", (c) => ((c.policies as { flags: Ctx }).flags.gps_capture_enabled = "true"), "gps_desligado"],
      ["termo não publicável", (c) => ((c.policies as { term: Ctx }).term.publishable = false), "termo_indisponivel"],
      ["termo sem hash", (c) => ((c.policies as { term: Ctx }).term.hash = null), "termo_indisponivel"],
      ["sem aceite", (c) => (c.ack = null), "sem_aceite"],
      ["aceite de outro motoboy", (c) => ((c.ack as Ctx).rider_id = "rid-2"), "sem_aceite"],
      ["aceite de outro aparelho", (c) => ((c.ack as Ctx).device_id = "dev-2"), "sem_aceite"],
      ["aparelho desconhecido", (c) => (c.deviceId = null), "sem_aceite"],
      ["aceite de outro texto", (c) => ((c.ack as Ctx).term_hash = "h-velho"), "termo_desatualizado"],
      ["termo recusado", (c) => ((c.ack as Ctx).status = "declined"), "termo_recusado"],
      ["permissão por pedir", (c) => (c.permission = "needs"), "sem_permissao"],
      ["permissão negada", (c) => (c.permission = "denied"), "sem_permissao"],
      ["permissão desconhecida", (c) => (c.permission = "unknown"), "sem_permissao"],
      ["sem viagem", (c) => (c.trip = null), "sem_viagem"],
      ["viagem de outro motoboy", (c) => ((c.trip as Ctx).courier_actor_id = "rid-2"), "viagem_de_outro"],
      ["saída não confirmada", (c) => ((c.trip as Ctx).state = "preparando_saida"), "saida_nao_confirmada"],
      ["viagem encerrada", (c) => ((c.trip as Ctx).state = "encerrada"), "saida_nao_confirmada"],
      ["viagem cancelada", (c) => ((c.trip as Ctx).state = "cancelada"), "saida_nao_confirmada"],
    ];
    for (const [nome, quebrar, motivo] of quebras) {
      teste(`R3 ${nome} -> não liga (${motivo})`, () => {
        const c = valido();
        quebrar(c);
        assert.deepEqual(decidir(c), { capture: false, trip_id: null, reason: motivo });
      });
    }
    teste("R4 contexto vazio não liga nem lança", () => {
      assert.equal(decidir({}).capture, false);
      assert.equal(decidir(undefined as unknown as Ctx).capture, false);
    });
    teste("R5 todo motivo tem frase no indicador; 'sem viagem' fica com o texto original", () => {
      for (const [, , motivo] of quebras) {
        assert.ok(motivo in TEXTO, `motivo sem frase: ${motivo}`);
        if (motivo !== "sem_viagem") assert.ok(TEXTO[motivo], `frase vazia: ${motivo}`);
      }
      assert.equal(TEXTO.sem_viagem, null);
      for (const extra of ["ligando", "bloqueado_no_aparelho", "ponte_incompativel"]) assert.ok(TEXTO[extra]);
    });

    /* ---------------------------- adaptador ---------------------------- */
    const detectar = ponte.detectNativeBridge as (w: unknown) => { present: boolean; bridge: Record<string, (...a: unknown[]) => unknown> | null };
    const METODOS = ponte.NATIVE_METHODS as string[];

    function ponteFalsa(sem: string[] = []) {
      const chamadas: [string, unknown][] = [];
      const n: Record<string, (...a: unknown[]) => unknown> = {};
      for (const m of METODOS) {
        if (sem.includes(m)) continue;
        n[m] = (...a: unknown[]) => {
          chamadas.push([m, a[0]]);
          return m === "capabilities" ? '{"device_id":"dev-1"}' : '{"ok":true}';
        };
      }
      return { win: { EntregasNative: n }, chamadas };
    }

    teste("N1 navegador comum: sem ponte, e isso não é erro", () => {
      assert.deepEqual(detectar({}), { present: false, bridge: null });
    });
    teste("N2 aplicativo sem applyServerPolicies é DESATUALIZADO, não navegador", () => {
      const r = detectar(ponteFalsa(["applyServerPolicies"]).win);
      assert.equal(r.present, true);
      assert.equal(r.bridge, null);
    });
    teste("N3 políticas passam como o servidor deu — o mesmo texto, byte a byte", () => {
      const f = ponteFalsa();
      const b = detectar(f.win).bridge!;
      const corpo = '{"api_version":"device-api@1.0.0","flags":{"gps_capture_enabled":true}}';
      b.applyServerPolicies(corpo);
      assert.deepEqual(f.chamadas, [["applyServerPolicies", corpo]]);
    });
    teste("N4 registro do termo vai como JSON do objeto recebido; capacidades voltam objeto", () => {
      const f = ponteFalsa();
      const b = detectar(f.win).bridge!;
      b.recordTermAcknowledgement({ acknowledgement_id: "a1", device_id: "dev-1" });
      assert.deepEqual(f.chamadas, [["recordTermAcknowledgement", '{"acknowledgement_id":"a1","device_id":"dev-1"}']]);
      assert.deepEqual(b.capabilities(), { device_id: "dev-1" });
    });
    teste("N5 permissão: o que o Android diz vira granted/denied/needs", () => {
      const p = ponte.permissionFromNative as (s: unknown) => string;
      assert.equal(p("granted_precise"), "granted");
      assert.equal(p("granted_approximate"), "granted");
      assert.equal(p("denied"), "denied");
      assert.equal(p("revoked"), "denied");
      assert.equal(p("not_requested"), "needs");
      assert.equal(p(undefined), "needs");
      const s = ponte.permissionFromStatus as (s: unknown) => string;
      assert.equal(s({ blocks: "capture_disabled,permission_denied" }), "needs");
      assert.equal(s({ blocks: "no_active_trip" }), "granted");
      assert.equal(s({ blocks: "" }), "granted");
      assert.equal(s(null), "unknown");
    });
    teste("N6 geolocalização de escuta: posição nativa chega ao status; clearWatch solta", () => {
      const geo = (ponte.createNativeGeolocation as () => {
        watchPosition(a: (p: unknown) => void, b: (e: unknown) => void): number;
        clearWatch(id: number): void;
        feed(m: Ctx): void;
      })();
      const vistas: unknown[] = [];
      const erros: unknown[] = [];
      const id = geo.watchPosition((p) => vistas.push(p), (e) => erros.push(e));
      geo.feed({ type: "location", latitude: -23.5, longitude: -46.6, accuracy_m: 8, time_ms: 1000 });
      geo.feed({ type: "error", error: "permission_denied", detail: "negada" });
      assert.equal(vistas.length, 1);
      const p = vistas[0] as { coords: Ctx; timestamp: number };
      assert.equal(p.coords.accuracy, 8);
      assert.equal(p.timestamp, 1000);
      assert.equal((erros[0] as Ctx).code, 1);
      geo.clearWatch(id);
      geo.feed({ type: "location", latitude: -23.5, longitude: -46.6, accuracy_m: 8, time_ms: 2000 });
      assert.equal(vistas.length, 1);
    });

    /* ---------------------- deriva entre as pontas ---------------------- */
    const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*/g, " ");
    const kotlin = semComentario(
      readFileSync(join(RAIZ, "android/app/src/main/java/br/com/tata/entregas/bridge/EntregasBridge.kt"), "utf8"),
    );
    const doKotlin = [...kotlin.matchAll(/@JavascriptInterface\s+fun\s+(\w+)\s*\(/g)].map((m) => m[1]).sort();

    teste("S1 a página conhece exatamente os métodos @JavascriptInterface do Kotlin", () => {
      assert.ok(doKotlin.length >= 10, `poucos métodos lidos do Kotlin: ${doKotlin.join(",")}`);
      assert.deepEqual([...METODOS].sort(), doKotlin);
    });
    teste("S2 a ponte falsa da prova com navegador tem os MESMOS nomes do Kotlin", () => {
      const spec = readFileSync(join(RAIZ, "src/entregas/ui/run-rider-bridge-tests.ts"), "utf8");
      const ini = spec.indexOf("window.EntregasNative = {");
      const fim = spec.indexOf("\n    };", ini);
      assert.ok(ini > 0 && fim > ini, "bloco da ponte falsa não encontrado");
      const nomes = [...spec.slice(ini, fim).matchAll(/^ {6}(\w+):/gm)].map((m) => m[1]).sort();
      assert.deepEqual(nomes, doKotlin);
    });
    teste("S3 a página não liga GPS do navegador nem fala de ponto com o servidor", () => {
      for (const arq of ["rider.js", "native-bridge.js", "capture-rule.js"]) {
        const src = semComentario(readFileSync(join(RIDER, arq), "utf8"));
        assert.equal(/navigator\.geolocation/.test(src), false, `${arq} usa navigator.geolocation`);
        assert.equal(src.includes("/api/gps/batch"), false, `${arq} manda ponto ao servidor`);
      }
    });

    /* --------------------------- status de GPS --------------------------- */
    type Status = {
      start(t: string): unknown;
      stop(): void;
      setOffReason(t: string | null): void;
      state(): Ctx;
    };
    const criar = status.createGpsStatus as (o: Ctx) => Status;
    const desenhar = status.renderGpsStatus as (el: Ctx, s: Ctx) => void;
    const semGeo = { watchPosition: () => 1, clearWatch: () => undefined };

    teste("G1 sem motivo, o indicador fica byte a byte como era", () => {
      const g = criar({ geolocation: semGeo });
      const el: Ctx = { dataset: {} };
      desenhar(el, g.state());
      assert.equal(el.textContent, "GPS DESLIGADO — SEM VIAGEM ATIVA · Sem viagem ativa");
    });
    teste("G2 com viagem na tela e captura desligada, diz o porquê — nunca 'sem viagem ativa'", () => {
      const g = criar({ geolocation: semGeo });
      g.setOffReason("AGUARDANDO A SAÍDA");
      const el: Ctx = { dataset: {} };
      desenhar(el, g.state());
      assert.equal(el.textContent, "GPS DESLIGADO — AGUARDANDO A SAÍDA");
      g.setOffReason(null);
      desenhar(el, g.state());
      assert.equal(el.textContent, "GPS DESLIGADO — SEM VIAGEM ATIVA · Sem viagem ativa");
    });
    teste("G3 ligado, o motivo não aparece: o indicador mostra a viagem", () => {
      const g = criar({ geolocation: semGeo });
      g.setOffReason("AGUARDANDO A SAÍDA");
      g.start("T-1");
      assert.match(String(g.state().banner), /^GPS ATIVO — VIAGEM T-1/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`${passou}/${passou + falhas.length} provas`);
  if (falhas.length) {
    for (const f of falhas) console.log(`  XX  ${f}`);
    console.log("\nRIDER_CAPTURE_RED");
    process.exit(1);
  }
  console.log("\nRIDER_CAPTURE_GREEN");
}

void main().catch((e) => {
  console.error("falha ao executar a suíte:", e);
  process.exit(1);
});
