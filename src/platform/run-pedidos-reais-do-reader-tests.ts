/**
 * Reader V3, camada 1 — leitura de pedidos reais (src/platform/leitura/pedidos-reais-do-reader.ts).
 * Fixtures com o ESQUEMA medido no caixa em 15/11 (nomes de campo do diagnostico), valores inventados.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pedidosDaTeknisaVM } from "../product/viewmodels/home-pedidos-reader-vm";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { lerPedidosReaisDoReader, lerPedidosReaisDoReaderIncremental, novoCacheIncremental, turnoDe, lerPolitica } from "./leitura/pedidos-reais-do-reader";

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log("PASS " + nome); };

const raiz = mkdtempSync(join(tmpdir(), "reader-v3-"));
const EV = join(raiz, "state", "reader-events-v1");
const DE = join(raiz, "state", "reader-shadow-decisions-v1");
mkdirSync(EV, { recursive: true }); mkdirSync(DE, { recursive: true }); mkdirSync(join(raiz, "bin"));
copyFileSync(join(__dirname, "../../tools/windows-local-lab/production-service-weekly-policy.json"), join(raiz, "bin", "production-service-weekly-policy.json"));

interface Spec {
  filial?: string; loja?: string; venda: string; comanda: string; origem?: string; abertura: string;
  itens?: Array<{ cd: string; qt: string; st?: string }>; blockers?: unknown[]; servico?: unknown[]; ready?: boolean;
  obs?: { completa: boolean; linhas: Array<{ v: string; provada: boolean; item?: number; cd?: string }> } | null; nomes?: Record<string, string>;
  quebrarHash?: boolean;
}
const entradas: Record<string, unknown>[] = [];
function pedido(s: Spec) {
  const filial = s.filial ?? "0001", loja = s.loja ?? "01";
  const key = `${filial}|${loja}|${s.venda}|${s.comanda}`;
  const hash = createHash("sha256").update(key + s.abertura).digest("hex").toUpperCase();
  const order: Record<string, unknown> = { CDFILIAL: filial, CDLOJA: loja, NRVENDAREST: s.venda, NRCOMANDA: s.comanda, NRCOMANDAEXT: "4" + s.comanda.slice(-3),
    IDORGCMDVENDA: s.origem ?? "DLV_IFO", IDSTCOMANDA: "P", DTHRABERMESA: s.abertura,
    items: (s.itens ?? [{ cd: "1001", qt: "1" }]).map((i, k) => ({ NRPRODCOMVEN: String(k + 1), CDPRODUTO: i.cd, CDARVPROD: "x", QTPRODCOMVEN: i.qt, IDSTPRCOMVEN: i.st ?? "P" })) };
  // item_index e a posicao 0-based em items, e a linha traz o CDPRODUTO da linha apontada (esquema medido em 15/11).
  const its = order.items as Array<Record<string, string>>;
  if (s.obs) { order.observation_scan_complete = s.obs.completa; order.observation_rows = s.obs.linhas.map((l) => ({ source_field: "DSOBSDESCIT", value: l.v, scope_hint: "item", join_proven: l.provada,
    ...(l.item !== undefined ? { item_index: l.item, CDPRODUTO: l.cd ?? its[l.item]?.CDPRODUTO ?? "0" } : {}) })); }
  const ev = { schema: "deliveryos.tata-reader-stable-order-event.v1", order_key: key, snapshot_hash: s.quebrarHash ? "0".repeat(64) : hash,
    observed_at: "2026-11-14T22:00:00.000Z", order, service_resolution: { service: null, evidence: "x", source_ref: null, blockers: s.servico ?? [] },
    ready_for_downstream_shadow: s.ready ?? true, blockers: s.blockers ?? [], effects: {} };
  const arquivo = `${s.comanda}_${hash}.json`;
  writeFileSync(join(EV, arquivo), JSON.stringify(ev));
  if (s.nomes) writeFileSync(join(DE, arquivo.replace(/\.json$/, ".decision.json")),
    JSON.stringify({ items: Object.entries(s.nomes).map(([cd, nome]) => ({ CDPRODUTO: cd, product_name: nome })) }));
  entradas.push({ order_key: key, snapshot_hash: hash, emitted_hash: hash });
  return key;
}
const gravarCheckpoint = () => writeFileSync(join(raiz, "state", "reader-watch-checkpoint-v1.json"),
  JSON.stringify({ schema: "deliveryos.tata-reader-continuous-checkpoint.v1", bootstrap_complete: true, entries: entradas }));

// 14/11/2026 e sabado (dow 6): almoco 11:00-16:30, jantar 18:00-23:00 na politica versionada.
const kJantar = pedido({ venda: "900001", comanda: "100001", abertura: "2026-11-14T19:30:00.0000000",
  servico: ["SERVICE_STATE_EXPIRED_FOR_ORDER"], blockers: ["SERVICE_STATE_EXPIRED_FOR_ORDER"], ready: false,
  itens: [{ cd: "1001", qt: "2" }, { cd: "1002", qt: "1.500" }], nomes: { "1001": "Produto A" },
  obs: { completa: true, linhas: [{ v: "sem cebolinha", provada: true, item: 0 }, { v: "tocar a campainha", provada: true }] } });
const kDado = pedido({ venda: "900002", comanda: "100002", abertura: "2026-11-14T20:00:00.0000000", blockers: ["ITEM_ROWS_INCOMPLETE"], ready: false });
const kMadrugada = pedido({ venda: "900003", comanda: "100003", abertura: "2026-11-14T03:00:00.0000000", servico: ["SERVICE_STATE_EXPIRED_FOR_ORDER"], ready: false });
const kTextoLivre = pedido({ venda: "900004", comanda: "100004", abertura: "2026-11-14T12:00:00.0000000", blockers: ["cliente Fulano rua X 123"], ready: false });
const kSemCodigo = pedido({ venda: "900005", comanda: "100005", abertura: "2026-11-14T12:30:00.0000000", ready: false });
const kParcial = pedido({ venda: "900006", comanda: "100006", abertura: "2026-11-14T13:00:00.0000000", obs: { completa: true, linhas: [{ v: "alergia a camarao", provada: false, item: 0 }] } });
pedido({ filial: "0002", venda: "900007", comanda: "100007", abertura: "2026-11-14T13:00:00.0000000" });
pedido({ venda: "900008", comanda: "100008", abertura: "2026-11-14T13:00:00.0000000", origem: "MESA" });
pedido({ venda: "900009", comanda: "100009", abertura: "2026-11-14T13:10:00.0000000", quebrarHash: true });
const kNmo = pedido({ venda: "900010", comanda: "100010", abertura: "2026-11-14T13:20:00.0000000", origem: "DLV_NMO" });
gravarCheckpoint();

const r = lerPedidosReaisDoReader(raiz, new Date("2026-11-15T08:00:00Z"));
if (r.estado !== "lido") throw Error("nao leu: " + JSON.stringify(r));
const p = (k: string) => r.pedidos.find((x) => x.chave === k)!;

ok("R1 nao configurado e caminho relativo nunca viram leitura", () => {
  assert.equal(lerPedidosReaisDoReader(null).estado, "nao_configurado");
  assert.equal(lerPedidosReaisDoReader("relativo").estado, "indisponivel");
});
ok("R2 escopo do watcher: 0001/01 e origem DLV_*; filial e origem alheias ficam fora; evento corrompido nao cega o resto", () => {
  assert.equal(r.fora_do_escopo, 2);
  assert.equal(r.invalidos, 1);
  assert.equal(r.pedidos.length, 7);
  assert.ok(p(kNmo), "DLV_NMO e delivery do Itaim e entra");
});
ok("R3 turno pela politica: bloqueio SO de estado de turno e substituido e REGISTRADO; nada mais muda", () => {
  const x = p(kJantar);
  assert.equal(x.turno, "JANTAR");
  assert.equal(x.retido, false);
  assert.deepEqual(x.bloqueios_de_turno_substituidos, ["SERVICE_STATE_EXPIRED_FOR_ORDER"]);
});
ok("R4 bloqueio de DADO continua retendo, com o codigo", () => {
  assert.equal(p(kDado).retido, true);
  assert.deepEqual(p(kDado).motivos_de_retencao, ["ITEM_ROWS_INCOMPLETE"]);
});
ok("R5 fora do horario da politica: o bloqueio de turno NAO e substituido", () => {
  assert.equal(p(kMadrugada).turno, "FORA_DO_HORARIO");
  assert.equal(p(kMadrugada).retido, true);
  assert.deepEqual(p(kMadrugada).bloqueios_de_turno_substituidos, []);
});
ok("R6 texto livre de bloqueio nunca e ecoado (vira OUTRO_BLOQUEIO) e retem", () => {
  assert.deepEqual(p(kTextoLivre).motivos_de_retencao, ["OUTRO_BLOQUEIO"]);
  assert.doesNotMatch(JSON.stringify(r), /Fulano|rua X/);
});
ok("R7 retido pelo produtor sem codigo continua retido", () => {
  assert.deepEqual(p(kSemCodigo).motivos_de_retencao, ["RETIDO_PELO_PRODUTOR_SEM_CODIGO"]);
});
ok("R8 observacoes NUNCA 'completas': autodeclaracao vira campos_de_texto_lidos; ligacao nao provada vira parcial; sem linhas, nao lidas", () => {
  assert.equal(p(kJantar).completude.observacoes, "campos_de_texto_lidos");
  assert.deepEqual(p(kJantar).itens[0]!.observacoes, ["sem cebolinha"]);
  assert.deepEqual(p(kJantar).observacoes_do_pedido, ["tocar a campainha"]);
  assert.equal(p(kParcial).completude.observacoes, "parcial");
  assert.equal(p(kDado).completude.observacoes, "nao_lidas_pela_fonte");
  assert.equal(p(kDado).itens[0]!.observacoes, null, "observacao ausente nao pode virar lista vazia");
  for (const x of r.pedidos) {
    assert.equal(x.completude.observacoes_por_ocorrencia, "nao_lidas_pela_fonte");
    assert.equal(x.completude.componentes, "nao_lidos_pela_fonte");
    assert.equal(x.completude.complementos, "nao_lidos_pela_fonte");
  }
});
ok("R9 nome do Reader quando ha decisao; sem decisao, null; quantidade nao inteira fica null com o valor nativo", () => {
  assert.equal(p(kJantar).itens[0]!.nome, "Produto A");
  assert.equal(p(kJantar).itens[1]!.nome, null);
  assert.equal(p(kJantar).itens[1]!.quantidade, null);
  assert.equal(p(kJantar).itens[1]!.quantidade_nativa, "1.500");
});
ok("R10 sem politica utilizavel, turno SEM_POLITICA e o bloqueio de turno segue retendo", () => {
  rmSync(join(raiz, "bin", "production-service-weekly-policy.json"));
  const s = lerPedidosReaisDoReader(raiz);
  if (s.estado !== "lido") throw Error("nao leu");
  const x = s.pedidos.find((y) => y.chave === kJantar)!;
  assert.equal(s.politica.valida, false);
  assert.equal(x.turno, "SEM_POLITICA");
  assert.equal(x.retido, true);
  copyFileSync(join(__dirname, "../../tools/windows-local-lab/production-service-weekly-policy.json"), join(raiz, "bin", "production-service-weekly-policy.json"));
});
ok("R11 fronteiras da politica: inicio inclusivo, fim exclusivo, dia da semana correto", () => {
  const pol = lerPolitica(raiz);
  assert.equal(turnoDe(pol, "2026-11-14T18:00:00"), "JANTAR");
  assert.equal(turnoDe(pol, "2026-11-14T23:00:00"), "FORA_DO_HORARIO");
  assert.equal(turnoDe(pol, "2026-11-14T16:29:00"), "ALMOCO");
  assert.equal(turnoDe(pol, "2026-11-13T16:29:00"), "FORA_DO_HORARIO", "sexta: almoco so ate 15:00");
  assert.equal(turnoDe(pol, "2026-10-01T19:00:00"), "SEM_POLITICA", "antes da vigencia");
});
ok("R14 incremental: le pedido FORA do checkpoint (sem teto de 250), so arquivos novos, revisao mais nova vence, hash do nome confere, arquivo velho fica de fora", () => {
  const foraDoCk = pedido({ venda: "900011", comanda: "100011", abertura: "2026-11-14T21:00:00.0000000" });
  entradas.pop(); // escrito na pasta, mas NAO no checkpoint (o caso do dia 14/11: 313 pedidos, 250 no checkpoint)
  const cache = novoCacheIncremental();
  const agora = new Date();
  const a = lerPedidosReaisDoReaderIncremental(raiz, cache, agora);
  if (a.estado !== "lido") throw Error("nao leu");
  assert.ok(a.pedidos.some((x) => x.chave === foraDoCk), "o pedido fora do checkpoint precisa aparecer");
  assert.equal(a.pedidos.length, 8, "7 do checkpoint + 1 fora dele");
  assert.equal(a.invalidos, 1, "o arquivo com hash do nome diferente do conteudo e invalido");
  const b = lerPedidosReaisDoReaderIncremental(raiz, cache, agora);
  if (b.estado !== "lido") throw Error("nao leu");
  assert.equal((b as unknown as { arquivos_lidos_nesta_leitura: number }).arquivos_lidos_nesta_leitura, 0, "segunda leitura nao rele nada");
  assert.equal(b.pedidos.length, 8);
  // revisao nova do mesmo pedido, observada depois: substitui.
  const ev = JSON.parse(readFileSync(join(EV, readdirSync(EV).find((n) => n.startsWith("100011_"))!), "utf8"));
  ev.observed_at = "2026-11-14T23:30:00.000Z"; ev.order.items.push({ NRPRODCOMVEN: "2", CDPRODUTO: "1009", CDARVPROD: "x", QTPRODCOMVEN: "3", IDSTPRCOMVEN: "P" });
  const h2 = "B".repeat(64); ev.snapshot_hash = h2;
  writeFileSync(join(EV, `100011_${h2}.json`), JSON.stringify(ev));
  const c = lerPedidosReaisDoReaderIncremental(raiz, cache, agora);
  if (c.estado !== "lido") throw Error("nao leu");
  const x = c.pedidos.find((y) => y.chave === foraDoCk)!;
  assert.equal(x.itens.length, 2, "a revisao mais nova tem de substituir a anterior");
  assert.equal(c.pedidos.length, 8, "revisao nova nao duplica pedido");
  // arquivo antigo (fora da janela de horas) nao entra numa leitura nova.
  const velho = novoCacheIncremental();
  const d = lerPedidosReaisDoReaderIncremental(raiz, velho, new Date(Date.now() + 72 * 3600_000));
  if (d.estado !== "lido") throw Error("nao leu");
  assert.equal(d.pedidos.length, 0, "arquivos de mais de 36 h nao entram");
});

ok("R12 viewmodel da Home: dia mostrado, retidos com codigo, estado X so como codigo, completude dita", () => {
  const vm = pedidosDaTeknisaVM(r, new Date("2026-11-15T08:00:00Z"));
  if (!vm.disponivel) throw Error("indisponivel");
  assert.equal(vm.dia, "2026-11-14");
  assert.equal(vm.dia_e_hoje, false, "pedido de ontem nao pode aparecer como de hoje");
  assert.match(vm.titulo, /ultimo dia com pedidos/);
  assert.equal(vm.contagens.pedidos, 7);
  assert.equal(vm.contagens.retidos, 4);
  assert.match(vm.completude, /componentes de combinados e complementos ainda nao sao lidos/);
  const jantar = vm.pedidos.find((x) => x.hora === "19:30")!;
  assert.equal(jantar.retido, false);
  assert.equal(jantar.turno_resolvido_pela_politica, true);
  assert.equal(jantar.itens[0]!.descricao, "Produto A");
  assert.equal(jantar.itens[1]!.descricao, "produto 1002");
  assert.equal(pedidosDaTeknisaVM({ estado: "nao_configurado" }, new Date()).disponivel, false);
});

ok("R15 observacao por item: item_index e 0-based e o CDPRODUTO da linha tem de bater; senao vai para o pedido e a leitura vira parcial", () => {
  // Defeito medido em 15/11 nos dados reais (7079/7079 linhas em base 0): a leitura em base 1 pendurava
  // a observacao do cliente no item VIZINHO.
  const d = mkdtempSync(join(tmpdir(), "reader-obs-")); const ev = join(d, "state", "reader-events-v1"); mkdirSync(ev, { recursive: true });
  const escreve = (comanda: string, rows: unknown[]) => {
    const key = `0001|01|91${comanda}|${comanda}`; const hash = createHash("sha256").update(key).digest("hex").toUpperCase();
    const order = { CDFILIAL: "0001", CDLOJA: "01", NRVENDAREST: "91" + comanda, NRCOMANDA: comanda, NRCOMANDAEXT: "1234", IDORGCMDVENDA: "DLV_IFO", IDSTCOMANDA: "P", DTHRABERMESA: "2026-11-14T20:00:00.0000000",
      items: [{ CDPRODUTO: "A1", CDARVPROD: "X1", QTPRODCOMVEN: "1", IDSTPRCOMVEN: "4" }, { CDPRODUTO: "B2", CDARVPROD: "X2", QTPRODCOMVEN: "1", IDSTPRCOMVEN: "4" }],
      observation_scan_complete: true, observation_rows: rows };
    writeFileSync(join(ev, `${comanda}_${hash}.json`), JSON.stringify({ schema: "deliveryos.tata-reader-stable-order-event.v1", order_key: key, snapshot_hash: hash, observed_at: "2026-11-14T23:00:00.000Z", order, ready_for_downstream_shadow: true, blockers: [] }));
  };
  escreve("300001", [{ source_field: "TXPRODCOMVEN", value: "sem gergelim", scope_hint: "item", join_proven: true, item_index: 1, CDPRODUTO: "B2" }]);
  escreve("300002", [{ source_field: "TXPRODCOMVEN", value: "sem gergelim", scope_hint: "item", join_proven: true, item_index: 0, CDPRODUTO: "B2" }]);
  const l = lerPedidosReaisDoReaderIncremental(d, novoCacheIncremental(), new Date(), 36);
  if (l.estado !== "lido") throw Error("nao leu");
  const certo = l.pedidos.find((x) => x.chave.endsWith("300001"))!, quebrado = l.pedidos.find((x) => x.chave.endsWith("300002"))!;
  assert.deepEqual(certo.itens.map((i) => i.observacoes), [[], ["sem gergelim"]], "a observacao e do SEGUNDO item");
  assert.equal(certo.completude.observacoes, "campos_de_texto_lidos");
  assert.deepEqual(quebrado.itens.map((i) => i.observacoes), [[], []], "produto da observacao nao bate com a linha apontada: nao pendura em item");
  assert.deepEqual(quebrado.observacoes_do_pedido, ["sem gergelim"]);
  assert.equal(quebrado.completude.observacoes, "parcial");
  assert.equal(certo.itens[1]!.codigo_arvore, "X2");
  rmSync(d, { recursive: true, force: true });
});

void (async () => {
  const bin = join(__dirname, "../../dist/tools/product_system_server.js");
  if (!existsSync(bin)) { console.log("PULADO R13: dist/tools/product_system_server.js ausente (rode npm run build:platform) — NAO e verde"); return; }
  const porta = 9400 + Math.floor(Math.random() * 90);
  const filho = spawn(process.execPath, [bin], { cwd: join(__dirname, "../.."), env: { ...process.env, PRODUCT_UI_PORT: String(porta), TATA_READER_INSTALL_ROOT: raiz, DELIVERYOS_DATABASE_URL: "" }, stdio: "ignore" });
  try {
    let corpo: Record<string, any> | null = null;
    for (let i = 0; i < 80 && !corpo; i++) {
      try { const x = await fetch(`http://127.0.0.1:${porta}/api/home`); if (x.ok) corpo = await x.json(); } catch { /* subindo */ }
      if (!corpo) await new Promise((res) => setTimeout(res, 150));
    }
    ok("R13 /api/home (servidor de dist/) traz os pedidos da Teknisa da pasta do Reader, sem ecoar texto livre de bloqueio", () => {
      assert.ok(corpo, "a Home nao respondeu");
      const t = corpo!.pedidos_teknisa;
      assert.equal(t.disponivel, true);
      assert.equal(t.contagens.pedidos, 8, "incremental: os 7 do checkpoint + o que ficou fora dele (R14)");
      assert.doesNotMatch(JSON.stringify(t), /Fulano|rua X/);
    });
  } finally { filho.kill(); }
})().finally(() => {
  rmSync(raiz, { recursive: true, force: true });
  console.log(`PEDIDOS_REAIS_DO_READER_PASS ${n}/15 FIXTURE_COM_ESQUEMA_REAL`);
  if (n !== 15) process.exitCode = 1;
});
