/**
 * Gestor local + conciliacao Gestor x Teknisa + bloco da Home.
 * Fixtures: LevelDB REAL (diario .log e tabela .ldb no formato do Chromium) com o ESQUEMA de pedido
 * medido no caixa em 15/11 (nomes de campo), valores inventados e canarios de dado pessoal.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { snappy } from "./leitura/leveldb-somente-leitura";
import { lerPedidosDoGestorLocal, type PedidoDoGestor } from "./leitura/pedidos-do-gestor-local";
import { conciliarGestorTeknisa } from "./leitura/conciliacao-gestor-teknisa";
import type { PedidoReal } from "./leitura/pedidos-reais-do-reader";
import { operacaoDoIfoodVM } from "../product/viewmodels/home-operacao-ifood-vm";

let n = 0;
const TOTAL = 12;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log("PASS " + nome); };

// ---------- escritor LevelDB minimo (so para a fixture) ----------
const vint = (x: number) => { const o: number[] = []; while (x >= 0x80) { o.push((x & 0x7f) | 0x80); x = Math.floor(x / 128); } o.push(x); return Buffer.from(o); };
const ORIGEM = "_https://gestordepedidos.ifood.com.br\u0000\u0001";
const chave = (k: string, origem = ORIGEM) => Buffer.from(origem + k, "latin1");
const valor = (v: unknown) => Buffer.concat([Buffer.from([0]), Buffer.from(JSON.stringify(v), "utf16le")]);
type Op = { k: Buffer; v: Buffer | null };
function diario(ops: Op[], seq0: number): Buffer {
  const partes = [Buffer.alloc(12)]; partes[0]!.writeUInt32LE(seq0, 0); partes[0]!.writeUInt32LE(ops.length, 8);
  for (const o of ops) partes.push(Buffer.from([o.v ? 1 : 0]), vint(o.k.length), o.k, ...(o.v ? [vint(o.v.length), o.v] : []));
  const lote = Buffer.concat(partes);
  // registros FIRST/MIDDLE/LAST em blocos de 32 KiB, como o Chromium escreve
  const out: Buffer[] = []; let pos = 0, noBloco = 0, primeiro = true;
  while (pos < lote.length || primeiro) {
    if (32768 - noBloco < 7) { out.push(Buffer.alloc(32768 - noBloco)); noBloco = 0; }
    const cabe = 32768 - noBloco - 7; const pedaco = lote.subarray(pos, pos + cabe); pos += pedaco.length;
    const ultimo = pos >= lote.length; const tipo = primeiro && ultimo ? 1 : primeiro ? 2 : ultimo ? 4 : 3;
    const h = Buffer.alloc(7); h.writeUInt16LE(pedaco.length, 4); h[6] = tipo; out.push(h, pedaco);
    noBloco = (noBloco + 7 + pedaco.length) % 32768; primeiro = false;
  }
  return Buffer.concat(out);
}
function tabelaCrua(ops: { k: Buffer; v: Buffer; seq: number }[]): Buffer {
  const ents = [...ops].sort((a, b) => Buffer.compare(a.k, b.k)).map((o) => { const t = Buffer.alloc(8); const num = o.seq * 256 + 1; t.writeUInt32LE(num % 2 ** 32, 0); t.writeUInt32LE(Math.floor(num / 2 ** 32), 4); const ik = Buffer.concat([o.k, t]); return Buffer.concat([vint(0), vint(ik.length), vint(o.v.length), ik, o.v]); });
  const dados = Buffer.concat([...ents, Buffer.from([0, 0, 0, 0, 1, 0, 0, 0])]);
  const trailer = Buffer.alloc(5); // tipo 0 (cru) + crc nao conferido pelo leitor
  const handle = Buffer.concat([vint(0), vint(dados.length)]);
  const idxBloco = Buffer.concat([vint(0), vint(3), vint(handle.length), Buffer.from("zzz"), handle, Buffer.from([0, 0, 0, 0, 1, 0, 0, 0])]);
  const ioff = dados.length + 5;
  const footer = Buffer.alloc(48); const hs = Buffer.concat([vint(0), vint(0), vint(ioff), vint(idxBloco.length)]); hs.copy(footer, 0);
  Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb]).copy(footer, 40);
  return Buffer.concat([dados, trailer, idxBloco, trailer, footer]);
}

// ---------- pedidos de fixture ----------
const AGORA = Date.now();
const iso = (minAtras: number) => new Date(AGORA - minAtras * 60_000).toISOString();
const localTeknisa = (minAtras: number) => new Date(AGORA - minAtras * 60_000 - 3 * 3600_000).toISOString().slice(0, 19) + ".0000000";
let uu = 0; const uuid = () => `00000000-0000-4000-8000-${String(++uu).padStart(12, "0")}`;
interface GSpec { curto: string; placedMin: number; itens: Array<{ code: string; q: number; nome: string; obs?: string; opcoes?: Array<{ code: string; q: number; nome: string }> }>; eventos?: string[]; teste?: boolean; prepMin?: number; prepInicioMin?: number }
function pedidoGestor(s: GSpec) {
  const id = uuid(); const evs: Record<string, unknown> = {};
  for (const [i, e] of ["PLACED", ...(s.eventos ?? ["CONFIRMED"])].entries())
    evs[e] = { id: uuid(), code: e, fullCode: e, orderId: id, createdAt: iso(s.placedMin - i * 0.5), metaData: e === "ASSIGN_DRIVER" ? { workerName: "CANARIO_ENTREGADOR", workerExternalUuid: "x" } : {} };
  return { id, category: "PREPARATION", source: "FOOD", localizer: "CANARIO_LOCALIZADOR",
    customer: { id: "c", name: "CANARIO_CLIENTE", phone: "CANARIO_TELEFONE", documentNumber: "CANARIO_CPF", address: { streetName: "CANARIO_RUA" } },
    payments: [{ code: "CREDIT", value: 99.9, card: { brand: "VISA" } }], summary: { orderTotal: 123.45 },
    items: s.itens.map((i) => ({ id: uuid(), externalCode: i.code, name: i.nome, quantity: i.q, observations: i.obs ?? "", unitPrice: 10, options: (i.opcoes ?? []).map((o) => ({ externalCode: o.code, name: o.nome, quantity: o.q, groupName: "Escolha" })) })),
    details: { shortReference: s.curto, isTest: s.teste ?? false, scheduled: false, createdAt: iso(s.placedMin), type: "DELIVERY", deliveryBy: "IFOOD", salesChannel: "IFOOD",
      preparationStartDateTime: iso(s.prepInicioMin ?? s.placedMin), preparationTimeInSeconds: (s.prepMin ?? 15) * 60, deliveryDateTime: iso(s.placedMin - 45), pickupCode: "CANARIO_RETIRADA", deliveryNotes: "CANARIO_NOTA apto 12" },
    history: { events: evs, lastStatusEventCode: (s.eventos ?? ["CONFIRMED"]).slice(-1)[0] }, cancelledItemsIds: [], changedItems: [] };
}
const gA = pedidoGestor({ curto: "1111", placedMin: 30, itens: [{ code: "2000000001", q: 2, nome: "Combinado Salmao", obs: "sem cebolinha" }, { code: "2000000002", q: 1, nome: "Temaki" }] });
const gB = pedidoGestor({ curto: "2222", placedMin: 25, itens: [{ code: "2000000003", q: 1, nome: "Poke", opcoes: [{ code: "12|34", q: 1, nome: "Molho tare" }] }], eventos: ["CONFIRMED", "READY_TO_PICKUP", "ASSIGN_DRIVER"] });
const gC = pedidoGestor({ curto: "3333", placedMin: 2, itens: [{ code: "2000000004", q: 1, nome: "Uramaki" }] });
const gD = pedidoGestor({ curto: "4444", placedMin: 40, itens: [{ code: "2000000005", q: 3, nome: "Hot roll" }], prepMin: 10 });
const gT = pedidoGestor({ curto: "9999", placedMin: 5, itens: [{ code: "1", q: 1, nome: "Teste" }], teste: true });
const gConc = pedidoGestor({ curto: "5555", placedMin: 90, itens: [{ code: "2000000006", q: 1, nome: "Sashimi" }], eventos: ["CONFIRMED", "READY_TO_PICKUP", "DISPATCHED", "CONCLUDED"] });

const raizG = mkdtempSync(join(tmpdir(), "gestor-local-"));
const dirLS = join(raizG, "Local Storage", "leveldb"); mkdirSync(dirLS, { recursive: true });
// Tabela: versao ANTIGA de gA (1 item so), gConc e um pedido que sera apagado no diario.
const gApagado = pedidoGestor({ curto: "7777", placedMin: 20, itens: [{ code: "2000000007", q: 1, nome: "Apagado" }] });
const gAantigo = { ...gA, items: gA.items.slice(0, 1) };
writeFileSync(join(dirLS, "000005.ldb"), tabelaCrua([
  { k: chave("order/" + gA.id), v: valor(gAantigo), seq: 10 }, { k: chave("order/" + gConc.id), v: valor(gConc), seq: 11 },
  { k: chave("order/" + gApagado.id), v: valor(gApagado), seq: 12 },
]));
writeFileSync(join(dirLS, "000007.log"), diario([
  { k: chave("order/" + gA.id), v: valor(gA) }, { k: chave("order/" + gB.id), v: valor(gB) }, { k: chave("order/" + gC.id), v: valor(gC) },
  { k: chave("order/" + gD.id), v: valor(gD) }, { k: chave("order/" + gT.id), v: valor(gT) }, { k: chave("order/" + gApagado.id), v: null },
  { k: chave("orderIds"), v: valor([gA.id, gB.id, gC.id, gD.id, gConc.id, uuid()]) },
  { k: chave("user/singleton"), v: valor({ username: "u", auth: { access_token: "CANARIO_TOKEN", refresh_token: "CANARIO_REFRESH" } }) },
  { k: chave("order/" + uuid(), "_https://outra-origem.example\u0000\u0001"), v: valor({ ...gA, details: { ...gA.details, shortReference: "6666" } }) },
], 100));

// ---------- testes ----------
ok("G1 Snappy: literal + copia decodificam; copia apontando antes do inicio e recusada", () => {
  const comp = Buffer.from([9, (3 - 1) << 2, 0x61, 0x62, 0x63, ((6 - 4) << 2) | 1, 3]);
  assert.equal(snappy(comp).toString(), "abcabcabc");
  assert.throws(() => snappy(Buffer.from([4, ((4 - 4) << 2) | 1, 9])));
});

const g = lerPedidosDoGestorLocal(raizG, new Date(AGORA));
ok("G2 diario + tabela: revisao mais nova vence, remocao respeitada, teste descartado, lista de ids contada", () => {
  assert.equal(g.estado, "lido");
  if (g.estado !== "lido") return;
  const curtos = g.pedidos.map((p) => p.codigo_curto).sort();
  assert.deepEqual(curtos, ["1111", "2222", "3333", "4444", "5555"]);
  assert.equal(g.pedidos.find((p) => p.codigo_curto === "1111")!.itens.length, 2, "a versao do diario (seq maior) vence a da tabela");
  assert.equal(g.ids_na_lista, 6);
  assert.equal(g.descartados, 1);
});
ok("G3 privacidade: nenhum canario de cliente, pagamento, entregador, token ou nota sai; nota vira booleano", () => {
  const s = JSON.stringify(g);
  assert.doesNotMatch(s, /CANARIO_/);
  assert.doesNotMatch(s, /99\.9|123\.45/);
  if (g.estado === "lido") assert.equal(g.pedidos[0]!.tem_nota_de_entrega, true);
});
ok("G4 so a origem do Gestor e lida: o pedido de outra origem com outro codigo nao aparece", () => {
  if (g.estado === "lido") assert.equal(g.pedidos.some((p) => p.codigo_curto === "6666"), false);
});
ok("G5 travas: sem pasta = nao configurado; relativo e inexistente = indisponivel", () => {
  assert.equal(lerPedidosDoGestorLocal(null).estado, "nao_configurado");
  assert.equal(lerPedidosDoGestorLocal("relativo\\pasta").estado, "indisponivel");
  assert.equal(lerPedidosDoGestorLocal(join(raizG, "nao-existe")).estado, "indisponivel");
});

// Teknisa (PedidoReal) sintetica
const pr = (curto: string, minAtras: number, itens: Array<{ arv: string | null; cd?: string; q: number; obs?: string[] }>, extra: Partial<PedidoReal> = {}): PedidoReal => ({
  chave: `0001|01|${curto}${minAtras}|x`, codigo_curto: curto, origem: "DLV_IFO", aberto_em_local: localTeknisa(minAtras).slice(0, 19), dia: localTeknisa(minAtras).slice(0, 10),
  turno: "JANTAR", revisao: "a".repeat(64), observado_em: new Date(AGORA).toISOString(), estado_nativo: "P", retido: false, motivos_de_retencao: [], bloqueios_de_turno_substituidos: [],
  itens: itens.map((i, k) => ({ indice: k + 1, codigo: i.cd ?? "1" + k, codigo_arvore: i.arv, nome: null, quantidade: i.q, quantidade_nativa: String(i.q), estado_nativo: "4", observacoes: i.obs ?? [] })),
  observacoes_do_pedido: [], completude: { itens: "observados", observacoes: "campos_de_texto_lidos", observacoes_por_ocorrencia: "nao_lidas_pela_fonte", componentes: "nao_lidos_pela_fonte", complementos: "nao_lidos_pela_fonte" },
  ...extra,
} as PedidoReal);
const ped = (curto: string) => (g.estado === "lido" ? g.pedidos.find((p) => p.codigo_curto === curto)! : (null as unknown as PedidoDoGestor));

ok("G6 identidade: mesmo codigo + horario + CDARVPROD = correspondencia; o CDPRODUTO igual NAO basta", () => {
  const t = [pr("1111", 29, [{ arv: "2000000001", q: 2, obs: ["sem cebolinha"] }, { arv: "2000000002", q: 1 }])];
  assert.equal(conciliarGestorTeknisa([ped("1111")], t, new Date(AGORA)).pares[0]!.classe, "correspondencia_comprovada");
  const soCdproduto = [pr("1111", 29, [{ arv: "9", cd: "2000000001", q: 2 }, { arv: "8", cd: "2000000002", q: 1 }])];
  assert.equal(conciliarGestorTeknisa([ped("1111")], soCdproduto, new Date(AGORA)).pares[0]!.classe, "item_ou_quantidade_divergente");
  const longe = [pr("1111", 29 + 30, [{ arv: "2000000001", q: 2 }, { arv: "2000000002", q: 1 }])];
  assert.equal(conciliarGestorTeknisa([ped("1111")], longe, new Date(AGORA)).pares[0]!.classe, "sem_comanda_na_teknisa", "mesmo codigo 30 min depois nao e o mesmo pedido");
});
ok("G7 observacao: divergente, nao lida pela fonte; complemento sem linha = nao lido; quantidade diferente = divergente", () => {
  const sem = [pr("1111", 29, [{ arv: "2000000001", q: 2, obs: ["outra coisa"] }, { arv: "2000000002", q: 1 }])];
  assert.equal(conciliarGestorTeknisa([ped("1111")], sem, new Date(AGORA)).pares[0]!.classe, "observacao_divergente");
  const naoLida = [pr("1111", 29, [{ arv: "2000000001", q: 2 }, { arv: "2000000002", q: 1 }], { completude: { itens: "observados", observacoes: "nao_lidas_pela_fonte", observacoes_por_ocorrencia: "nao_lidas_pela_fonte", componentes: "nao_lidos_pela_fonte", complementos: "nao_lidos_pela_fonte" } } as Partial<PedidoReal>)];
  assert.equal(conciliarGestorTeknisa([ped("1111")], naoLida, new Date(AGORA)).pares[0]!.classe, "observacao_nao_lida_pela_teknisa");
  assert.equal(conciliarGestorTeknisa([ped("2222")], [pr("2222", 24, [{ arv: "2000000003", q: 1 }])], new Date(AGORA)).pares[0]!.classe, "complemento_nao_lido_pela_teknisa");
  assert.equal(conciliarGestorTeknisa([ped("2222")], [pr("2222", 24, [{ arv: "2000000003", q: 1 }, { arv: "12|34", q: 1 }])], new Date(AGORA)).pares[0]!.classe, "correspondencia_comprovada");
  assert.equal(conciliarGestorTeknisa([ped("4444")], [pr("4444", 39, [{ arv: "2000000005", q: 2 }])], new Date(AGORA)).pares[0]!.classe, "item_ou_quantidade_divergente");
});
ok("G8 tempo: sem comanda ate 6 min = aguardando; depois = sem comanda; dois candidatos que os itens nao desempatam = ambigua; so-Teknisa contada na janela", () => {
  assert.equal(conciliarGestorTeknisa([ped("3333")], [], new Date(AGORA)).pares[0]!.classe, "aguardando_teknisa");
  assert.equal(conciliarGestorTeknisa([ped("3333")], [], new Date(AGORA + 5 * 60_000)).pares[0]!.classe, "sem_comanda_na_teknisa");
  const dois = [pr("4444", 39, [{ arv: "1", q: 1 }]), pr("4444", 38, [{ arv: "2", q: 1 }])];
  assert.equal(conciliarGestorTeknisa([ped("4444")], dois, new Date(AGORA)).pares[0]!.classe, "identidade_ambigua");
  const c = conciliarGestorTeknisa([ped("1111"), ped("4444")], [pr("8888", 35, [{ arv: "1", q: 1 }]), pr("8888", 300, [{ arv: "1", q: 1 }])], new Date(AGORA));
  assert.equal(c.contagens.somente_na_teknisa_na_janela, 1, "so a que abriu dentro da janela do Gestor");
});
ok("G9 Home: etapa oficial, preparo acima do informado, atencao so para ativos, concluido fora da atencao", () => {
  const t = { estado: "lido" as const, lido_em: "", politica: { versao: null, valida: false }, pedidos: [pr("1111", 29, [{ arv: "2000000001", q: 2, obs: ["sem cebolinha"] }, { arv: "2000000002", q: 1 }]), pr("5555", 89, [{ arv: "2000000006", q: 1 }]), pr("2222", 24, [{ arv: "2000000003", q: 1 }])], fora_do_escopo: 0, invalidos: 0, bytes_lidos: 0, duracao_ms: 0 };
  const vm = operacaoDoIfoodVM(g, t, new Date(AGORA));
  assert.equal(vm.disponivel, true);
  if (!vm.disponivel) return;
  const p = (c: string) => vm.pedidos.find((x) => x.codigo === c)!;
  assert.equal(p("2222").etapa, "pronto");
  assert.equal(p("5555").etapa, "concluido");
  assert.equal(p("5555").ativo, false);
  assert.ok(p("4444").preparo!.passou_min! >= 29, "preparo informado de 10 min, pedido de 40 min em preparo");
  assert.ok(vm.atencao.some((a) => a.codigo === "4444" && /passou .* do preparo informado/.test(a.motivo)));
  assert.ok(vm.atencao.some((a) => a.codigo === "2222" && /complemento/.test(a.motivo)), "o complemento do 2222 nao tem linha na Teknisa");
  assert.ok(vm.atencao.filter((a) => a.codigo === "1111").every((a) => /preparo informado/.test(a.motivo)), "o 1111 confere com a Teknisa: so o preparo (30 min contra 15 informados) pede atencao");
  assert.equal(vm.atencao.some((a) => a.codigo === "5555"), false);
  assert.equal(vm.contagens.em_andamento, 4);
  assert.doesNotMatch(JSON.stringify(vm), /CANARIO_/);
});
ok("G10 Home sem Gestor configurado: bloco declarado, nunca zero", () => {
  const vm = operacaoDoIfoodVM({ estado: "nao_configurado" }, { estado: "nao_configurado" }, new Date(AGORA));
  assert.equal(vm.disponivel, false);
});
ok("G11 diario truncado no meio do lote (o Gestor escrevendo): o lote incompleto e descartado inteiro", () => {
  const d2 = mkdtempSync(join(tmpdir(), "gestor-trunc-")); const ls = join(d2, "Local Storage", "leveldb"); mkdirSync(ls, { recursive: true });
  const cheio = diario([{ k: chave("order/" + gC.id), v: valor(gC) }], 1);
  writeFileSync(join(ls, "000003.log"), cheio.subarray(0, cheio.length - 40));
  const r = lerPedidosDoGestorLocal(d2, new Date(AGORA));
  assert.equal(r.estado, "lido");
  if (r.estado === "lido") assert.equal(r.pedidos.length, 0);
  rmSync(d2, { recursive: true, force: true });
});

// ---------- HTTP pelo servidor de dist/ ----------
const raizR = mkdtempSync(join(tmpdir(), "reader-ifood-"));
const EV = join(raizR, "state", "reader-events-v1"); mkdirSync(EV, { recursive: true });
function eventoTeknisa(curto: string, minAtras: number, itens: Array<{ arv: string; q: string }>) {
  const key = `0001|01|77${curto}|55${curto}`; const abertura = localTeknisa(minAtras);
  const hash = createHash("sha256").update(key + abertura).digest("hex").toUpperCase();
  const order = { CDFILIAL: "0001", CDLOJA: "01", NRVENDAREST: "77" + curto, NRCOMANDA: "55" + curto, NRCOMANDAEXT: curto, IDORGCMDVENDA: "DLV_IFO", IDSTCOMANDA: "P", DTHRABERMESA: abertura,
    items: itens.map((i, k) => ({ NRPRODCOMVEN: String(k + 1), CDPRODUTO: "10" + k, CDARVPROD: i.arv, QTPRODCOMVEN: i.q, IDSTPRCOMVEN: "4" })), observation_scan_complete: true,
    observation_rows: [{ source_field: "DSOBSDESCIT", value: "sem cebolinha", scope_hint: "item", join_proven: true, item_index: 0, CDPRODUTO: "100" }] };
  writeFileSync(join(EV, `55${curto}_${hash}.json`), JSON.stringify({ schema: "deliveryos.tata-reader-stable-order-event.v1", order_key: key, snapshot_hash: hash,
    observed_at: new Date(AGORA - (minAtras - 1) * 60_000).toISOString(), order, ready_for_downstream_shadow: true, blockers: [], effects: {} }));
}
eventoTeknisa("1111", 29, [{ arv: "2000000001", q: "2.000" }, { arv: "2000000002", q: "1.000" }]);
void (async () => {
  const bin = join(__dirname, "../../dist/tools/product_system_server.js");
  if (!existsSync(bin)) { console.log("PULADO G12: dist/tools/product_system_server.js ausente (rode npm run build:platform) — NAO e verde"); return; }
  const porta = 9500 + Math.floor(Math.random() * 90);
  const filho = spawn(process.execPath, [bin], { cwd: join(__dirname, "../.."), env: { ...process.env, PRODUCT_UI_PORT: String(porta), TATA_READER_INSTALL_ROOT: raizR, DELIVERYOS_GESTOR_LOCAL_DIR: raizG, DELIVERYOS_DATABASE_URL: "" }, stdio: "ignore" });
  try {
    let corpo: Record<string, any> | null = null;
    for (let i = 0; i < 80 && !corpo; i++) {
      try { const x = await fetch(`http://127.0.0.1:${porta}/api/home`); if (x.ok) corpo = await x.json(); } catch { /* subindo */ }
      if (!corpo) await new Promise((res) => setTimeout(res, 150));
    }
    ok("G12 /api/home (servidor de dist/) traz o bloco do iFood conciliado com a Teknisa, sem nenhum canario", () => {
      assert.ok(corpo, "a Home nao respondeu");
      const o = corpo!.operacao_ifood;
      assert.equal(o.disponivel, true);
      assert.equal(o.contagens.no_gestor, 5);
      assert.equal(o.pedidos.find((p: any) => p.codigo === "1111").teknisa.classe, "correspondencia_comprovada");
      assert.doesNotMatch(JSON.stringify(corpo), /CANARIO_/);
    });
  } finally {
    // GESTOR_LOCAL_PRENDER=1: deixa a Home da fixture no ar para a prova visual (nada real nela).
    if (process.env.GESTOR_LOCAL_PRENDER) console.log(`PRENDER http://127.0.0.1:${porta}/`); else filho.kill();
  }
})().finally(() => {
  if (!process.env.GESTOR_LOCAL_PRENDER) { rmSync(raizG, { recursive: true, force: true }); rmSync(raizR, { recursive: true, force: true }); }
  console.log(`GESTOR_LOCAL_PASS ${n}/${TOTAL} FIXTURE_COM_ESQUEMA_REAL`);
  if (n !== TOTAL) process.exitCode = 1;
});
