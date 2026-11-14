/**
 * A Home em mais de um aparelho — processos reais, do executor ao navegador de fora.
 *
 *   executor real (página falsa) -> arquivo do feed -> servidor de apresentação REAL em loopback
 *     -> servidor piloto REAL, com a porta de operador ligada -> "aparelhos" por HTTP
 *
 * O "caixa" lê a apresentação direto no loopback; o "celular" e o "tablet"
 * entram pelo hostname da Home na porta do piloto, cada um com o seu código.
 * A prova é que os três veem a MESMA operação, que ela se atualiza para todos,
 * que a fonte parada aparece como parada para todos, e que sem código ninguém
 * vê nada. Tudo sintético: pedidos fabricados, códigos fabricados, modo simulado.
 *
 * NÃO prova: o proxy HTTPS de verdade, Safari/Chrome em aparelho, rede móvel,
 * o caixa. Isso é homologação física.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vm from "node:vm";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runner = require("../../runtime/reporting/gestor_mounted_demand_feed_v1.cjs") as {
  FEED_FILE: string;
  buildExpression: (sensor: string, mode: string) => string;
  createDemandFeed: (o: Record<string, unknown>) => { tick: () => Promise<Record<string, unknown>> };
};
const RAIZ = process.cwd();
const SENSOR = readFileSync(join(RAIZ, "runtime/reporting/gestor_v3_visible_sensor.js"), "utf8");
// HOME_CHAIN_PUBLIC_URL so existe para a prova em navegador: la o hostname carrega a porta do TLS de bancada.
const HOME = new URL(process.env["HOME_CHAIN_PUBLIC_URL"] || "https://copiloto.itaim.test").origin;
const HOME_HOST = new URL(HOME).host;
const SERVIR = process.env["HOME_CHAIN_SERVE"] === "1";
const COD = {
  gerente: "cod-gerente-home-sintetico-0001", lider: "cod-lider-home-sintetico-0002",
  motoboy: "cod-motoboy-home-sintetico-0003", caixa: "cod-caixa-home-sintetico-0004",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); ok += 1; console.log("PASS " + nome); }
  catch (e) { falhas.push(nome); console.error("FAIL " + nome + "\n     " + String((e as Error).message).split("\n").slice(0, 8).join("\n     ")); }
}
const portaLivre = () => new Promise<number>((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => res(typeof a === "object" && a ? a.port : 0)); });
});

interface Resposta { status: number; headers: http.IncomingHttpHeaders; body: string }
function pedir(port: number, o: { method?: string; path: string; host?: string; headers?: Record<string, string>; body?: string }): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: o.method ?? "GET", path: o.path,
      headers: { ...(o.host ? { host: o.host } : {}), ...(o.headers ?? {}) }, timeout: 20_000 }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(partes).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado em " + o.path)));
    req.on("error", reject);
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

type Linha = { name: string; quantity: number; observations: string; options: { name: string; quantity: number }[]; externalCode: null };
const item = (name: string, quantity: number, observations = "", options: Linha["options"] = []): Linha =>
  ({ name, quantity, observations, options, externalCode: null });
const pedido = (n: number, items: Linha[]) => ({
  id: "PRIVATE-ORDER-UUID-" + n, displayId: String(n), merchant: { id: "PRIVATE-MERCHANT-UUID" }, items,
  customer: { name: "NOME_SECRETO_DO_CLIENTE" }, createdAt: new Date(Date.now() - 6 * 60_000).toISOString(),
});

async function main(): Promise<void> {
  if (existsSync(join(RAIZ, "config", "entregas-unit-itaim.json"))) {
    console.log("PULADO EM VOZ ALTA: config/entregas-unit-itaim.json presente — a cadeia multiaparelho NAO rodou");
    process.exit(1);
  }
  const sep = process.platform === "win32" ? ";" : ":";
  const tsxCli = (process.env.PATH ?? "").split(sep).map((b) => join(b, "..", "tsx", "dist", "cli.mjs")).find((c) => existsSync(c));
  if (!tsxCli) throw new Error("tsx_cli_nao_localizado_no_path");

  const dir = mkdtempSync(join(tmpdir(), "home-multi-"));
  const feedDir = join(dir, "feed");
  mkdirSync(feedDir); mkdirSync(join(dir, "dados"));
  const portaPiloto = await portaLivre(), portaHome = await portaLivre();

  // Executor REAL sobre uma página falsa; o relógio é o da máquina, como no caixa.
  const estado = { pedidos: [pedido(5101, [item("Combinado Especial 1 Pessoa", 1, "Sem wasabi")]),
    pedido(5102, [item("Hot Roll", 2), item("Temaki Salmao", 1, "", [{ name: "Cream cheese", quantity: 1 }])])] };
  const url = "http://127.0.0.1:5399/gestor.html";
  const executor = runner.createDemandFeed({
    mode: "FIXTURE", pageUrl: url, sensorSha: "cadeia-multiaparelho", edgePort: () => 9222,
    targets: async () => ({ kind: "reply", value: [{ type: "page", url, webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/ABCDEF0123456789" }] }),
    evaluate: async () => {
      const doc = { location: { hostname: "127.0.0.1" }, visibilityState: "hidden", readyState: "complete",
        querySelectorAll: () => estado.pedidos.map((o) => ({
          get innerText() { return "Pedido #" + o.displayId; }, isConnected: true, parentElement: null, getClientRects: () => [{}],
          __reactFiber$lab: { memoizedProps: {}, return: { memoizedProps: { order: o }, return: null } } })) };
      const value = vm.runInNewContext(runner.buildExpression(SENSOR, "FIXTURE"), { document: doc, location: doc.location }) as unknown;
      return { kind: "value", value: JSON.parse(JSON.stringify(value)) as unknown };
    },
    clock: () => Date.now(), writeFeed: () => undefined,
  });
  const arquivoDoFeed = join(feedDir, runner.FEED_FILE);
  const escreverFeed = async () => { const doc = await executor.tick(); writeFileSync(arquivoDoFeed, JSON.stringify(doc)); return doc; };
  await escreverFeed();

  writeFileSync(join(dir, "pilot.json"), JSON.stringify({
    mode: "pilot", unit_id: "ITAIM", unit_name: "UNIDADE TESTE", timezone: "America/Sao_Paulo", port: portaPiloto,
    bind: "127.0.0.1", data_dir: join(dir, "dados"), max_stops: 5, banner: "PILOTO {unit_name}", source_mode: "simulated",
    users: [
      { actor_id: "ger-1", role: "gerente", label: "Gerente", token: COD.gerente },
      { actor_id: "lid-1", role: "lider_delivery", label: "Lider", token: COD.lider },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy", token: COD.motoboy },
      { actor_id: "ops-1", role: "operador_expedicao", label: "Caixa", token: COD.caixa },
    ],
    features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false, auto_assignment: false, copiloto: false, shell: false },
    backup: { auto_interval_minutes: 600, retain_count: 2, dir: join(dir, "backups") },
  }));
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
  writeFileSync(join(dir, "termo.json"), JSON.stringify({}));

  const filhos: ChildProcess[] = [];
  const logs: Record<string, string[]> = { piloto: [], home: [] };
  const subir = (nome: "piloto" | "home", script: string, env: Record<string, string | undefined>) => {
    const p = spawn(process.execPath, [tsxCli, script], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    p.stdout?.on("data", (d) => logs[nome].push(String(d)));
    p.stderr?.on("data", (d) => logs[nome].push(String(d)));
    filhos.push(p);
    return p;
  };
  const envPiloto: Record<string, string | undefined> = { ...process.env, ENTREGAS_UI_PORT: String(portaPiloto),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"), ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"), ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"),
    ENTREGAS_HOME_PUBLIC_URL: HOME, ENTREGAS_HOME_UPSTREAM: `http://127.0.0.1:${portaHome}` };
  for (const k of ["ENTREGAS_UNIT_CONFIG", "ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_STORAGE_BACKEND", "ENTREGAS_PLATFORM_URL",
    "ENTREGAS_USERS", "ENTREGAS_OPERATOR_CONFIG", "ENTREGAS_PUBLIC_URL"]) delete envPiloto[k];
  const envHome: Record<string, string | undefined> = { ...process.env, PRODUCT_UI_PORT: String(portaHome),
    DELIVERYOS_GESTOR_DEMAND_DIR: feedDir, DELIVERYOS_DATABASE_URL: "" };
  delete envHome["TATA_READER_INSTALL_ROOT"];
  let apresentacao = subir("home", "tools/product_system_server.ts", envHome);
  subir("piloto", "tools/entregas_pilot_server.ts", envPiloto);

  const esperar = async (nome: string, port: number, host?: string) => {
    for (let i = 0; i < 240; i++) {
      try { if ((await pedir(port, { path: "/api/health", host })).status === 200) return; } catch { /* subindo */ }
      await sleep(250);
    }
    throw new Error(nome + " nao subiu: " + logs[nome === "piloto" ? "piloto" : "home"].join("").slice(-500));
  };
  const entrar = async (codigo: string) => pedir(portaPiloto, { method: "POST", path: "/entrar", host: HOME_HOST,
    headers: { origin: HOME, "content-type": "application/x-www-form-urlencoded" }, body: "codigo=" + encodeURIComponent(codigo) });
  const cookieDe = (r: Resposta) => String((r.headers["set-cookie"] || [])[0] || "").split(";")[0];
  const homeDeFora = async (cookie: string) => {
    const r = await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST, headers: { cookie } });
    assert.equal(r.status, 200, "Home de fora: " + r.status + " " + r.body.slice(0, 120));
    return JSON.parse(r.body) as Record<string, any>;
  };
  const homeDoCaixa = async () => JSON.parse((await pedir(portaHome, { path: "/api/home" })).body) as Record<string, any>;
  const retrato = (h: Record<string, any>) => ({ titulo: h.titulo, demonstracao: h.demonstracao,
    pedidos: h.demanda_observada === null ? null : (h.demanda_observada.pedidos as any[]).map((p) =>
      [p.codigo, p.nivel, (p.itens as any[]).map((i) => [i.quantidade, i.nome, i.observacao, (i.opcoes as any[]).map((x) => [x.quantidade, x.nome])])]) });
  const ate = async (rotulo: string, fn: () => Promise<boolean>, ms = 30_000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { try { if (await fn()) return; } catch { /* ainda nao */ } await sleep(300); }
    throw new Error("TEMPO ESGOTADO: " + rotulo);
  };

  let celular = "", tablet = "";
  try {
    await esperar("home", portaHome);
    await esperar("piloto", portaPiloto);
    if (SERVIR) {
      // Bancada no ar para um navegador de verdade: reescreve o feed a cada 5 s e sai sozinha em 4 min.
      console.log("SERVINDO " + JSON.stringify({ piloto: portaPiloto, apresentacao: portaHome, home: HOME, codigo_sintetico: COD.gerente, pasta: dir }));
      const fim = Date.now() + 240_000;
      while (Date.now() < fim && !existsSync(join(dir, "parar"))) { await escreverFeed(); await sleep(5000); }
      return;
    }

    await teste("sem codigo ninguem ve a operacao: API 401, navegacao vai para a entrada, e a rota do piloto nao vira atalho", async () => {
      assert.equal((await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST })).status, 401);
      const nav = await pedir(portaPiloto, { path: "/", host: HOME_HOST });
      assert.equal(nav.status, 303);
      assert.equal(nav.headers.location, "/entrar");
      // Pelo hostname do piloto, /api/home nao e a Home: nenhum pedido sai por ali.
      const peloPiloto = await pedir(portaPiloto, { path: "/api/home", headers: { authorization: "Bearer " + COD.gerente } });
      assert.ok(!peloPiloto.body.includes("Combinado"), "a Home saiu pela porta do piloto, sem a porta de operador");
      // E com o codigo no cabecalho, sem sessao, o hostname da Home tambem nao entrega.
      assert.equal((await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST, headers: { authorization: "Bearer " + COD.gerente } })).status, 401);
    });

    await teste("motoboy e caixa de expedicao nao entram na Home com o codigo deles; gerente e lider entram", async () => {
      for (const codigo of [COD.motoboy, COD.caixa]) {
        const r = await entrar(codigo);
        assert.equal(r.status, 401);
        assert.equal(r.headers["set-cookie"], undefined);
      }
      const g = await entrar(COD.gerente), l = await entrar(COD.lider);
      assert.equal(g.status, 303); assert.equal(l.status, 303);
      celular = cookieDe(g); tablet = cookieDe(l);
      assert.notEqual(celular, tablet);
    });

    await teste("caixa, celular e tablet veem a MESMA operacao: mesmos pedidos, itens, opcoes e observacoes, como demonstracao", async () => {
      const [caixa, c, t] = [retrato(await homeDoCaixa()), retrato(await homeDeFora(celular)), retrato(await homeDeFora(tablet))];
      assert.deepEqual(c, caixa);
      assert.deepEqual(t, caixa);
      assert.equal(caixa.titulo, "Leitura parcial");
      assert.equal(caixa.demonstracao, true, "pedido de bancada apareceu como real");
      assert.deepEqual(caixa.pedidos!.map((p) => p[0]), ["5101", "5102"]);
      const corpo = (await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST, headers: { cookie: celular } })).body;
      for (const segredo of ["PRIVATE-ORDER-UUID", "PRIVATE-MERCHANT-UUID", "NOME_SECRETO", COD.gerente])
        assert.ok(!corpo.includes(segredo), "vazou para o aparelho: " + segredo);
    });

    await teste("a interface chega inteira ao aparelho: os mesmos bytes da pagina, do codigo e do estilo que o caixa recebe", async () => {
      for (const caminho of ["/", "/app.js", "/surfaces/home.js", "/surfaces/home.css", "/tokens/organismo-tokens.css"]) {
        const direto = await pedir(portaHome, { path: caminho });
        const fora = await pedir(portaPiloto, { path: caminho, host: HOME_HOST, headers: { cookie: celular } });
        assert.equal(direto.status, 200, caminho);
        assert.equal(fora.status, 200, caminho);
        assert.equal(fora.body, direto.body, "conteudo diferente em " + caminho);
        assert.equal(fora.headers["content-type"], direto.headers["content-type"], caminho);
      }
    });

    await teste("pedido novo e quantidade alterada aparecem para todos os aparelhos", async () => {
      estado.pedidos[1].items[0].quantity = 3;
      estado.pedidos.push(pedido(5103, [item("Sashimi de Salmao", 1, "Cortar fino")]));
      await escreverFeed();
      await ate("celular com o pedido novo", async () => retrato(await homeDeFora(celular)).pedidos?.length === 3);
      const [caixa, c, t] = [retrato(await homeDoCaixa()), retrato(await homeDeFora(celular)), retrato(await homeDeFora(tablet))];
      assert.deepEqual(c, caixa);
      assert.deepEqual(t, caixa);
      assert.deepEqual(caixa.pedidos!.map((p) => p[0]), ["5101", "5102", "5103"]);
      assert.equal((caixa.pedidos![1][2] as any[])[0][0], 3);
    });

    await teste("limite de tentativas do piloto vale na entrada da Home, e quem ja estava dentro nao cai", async () => {
      let ultima = 0;
      for (let i = 0; i < 7; i++) ultima = (await entrar("codigo-errado-" + i)).status;
      assert.equal(ultima, 429, "sete codigos errados seguidos nao travaram a origem");
      assert.equal((await entrar("outro-codigo-desconhecido")).status, 429);
      assert.equal(retrato(await homeDeFora(celular)).pedidos?.length, 3, "a trava derrubou quem ja estava dentro");
    });

    await teste("fonte parada: em todos os aparelhos os pedidos somem e a Home diz que esta sem leitura", async () => {
      // O executor para de escrever. Envelhecer o arquivo equivale a esperar 45 s.
      const doc = JSON.parse(readFileSync(arquivoDoFeed, "utf8")) as Record<string, unknown>;
      doc["written_at"] = new Date(Date.now() - 120_000).toISOString();
      writeFileSync(arquivoDoFeed, JSON.stringify(doc));
      await ate("celular sem leitura", async () => (await homeDeFora(celular)).titulo === "Sem leitura");
      for (const h of [await homeDoCaixa(), await homeDeFora(celular), await homeDeFora(tablet)]) {
        assert.equal(h.titulo, "Sem leitura");
        assert.equal(h.demanda_observada, null);
        assert.equal(h.pedidos_publicaveis, false);
        assert.ok(!JSON.stringify(h).includes("Sashimi"), "pedido antigo continuou visivel");
      }
    });

    await teste("a leitura volta: os aparelhos voltam a ver os pedidos sem entrar de novo", async () => {
      await escreverFeed();
      await ate("celular de volta", async () => retrato(await homeDeFora(celular)).pedidos?.length === 3);
      assert.deepEqual(retrato(await homeDeFora(tablet)), retrato(await homeDoCaixa()));
    });

    await teste("cookie que o piloto nao conhece nao abre nada, mesmo parecido com um valido", async () => {
      // NAO medido aqui: revogacao com o piloto real no ar (o piloto le os codigos no boot).
      // A revogacao por requisicao esta provada na suite da porta, com o cadastro mudando no meio.
      const forjado = celular.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
      assert.equal((await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST, headers: { cookie: forjado } })).status, 401);
    });

    await teste("apresentacao morta no caixa: os aparelhos recebem 'leitura indisponivel', nunca a tela antiga; ela volta e eles seguem com a mesma sessao", async () => {
      apresentacao.kill();
      await ate("apresentacao fora", async () => (await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST, headers: { cookie: celular } })).status === 502);
      const r = await pedir(portaPiloto, { path: "/api/home", host: HOME_HOST, headers: { cookie: tablet } });
      assert.deepEqual(JSON.parse(r.body), { erro: "apresentacao_indisponivel" });
      apresentacao = subir("home", "tools/product_system_server.ts", envHome);
      await esperar("home", portaHome);
      await escreverFeed();
      await ate("celular de volta apos religar", async () => retrato(await homeDeFora(celular)).pedidos?.length === 3);
    });

    await teste("as rotas do piloto seguem intactas no hostname dele, com a porta da Home ligada", async () => {
      const saude = await pedir(portaPiloto, { path: "/api/health" });
      assert.equal(saude.status, 200);
      const sessao = await pedir(portaPiloto, { path: "/api/session", headers: { authorization: "Bearer " + COD.caixa } });
      assert.equal(JSON.parse(sessao.body).actor.role, "operador_expedicao");
    });
  } finally {
    for (const p of filhos) { try { p.kill(); } catch { /* ja saiu */ } }
    await sleep(400);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* arquivo ainda preso */ }
  }
  if (falhas.length) { console.error("HOME_MULTIDEVICE_CHAIN_FAIL " + falhas.length + " falha(s)"); process.exit(1); }
  if (SERVIR) { console.log("BANCADA ENCERRADA"); process.exit(0); }
  console.log(`HOME_MULTIDEVICE_CHAIN_PASS ${ok}/${ok} REAL_PROCESSES_SYNTHETIC_ORDERS`);
  process.exit(0);
}
main().catch((e) => { console.error("FAIL " + ((e as Error).stack || e)); process.exit(1); });
