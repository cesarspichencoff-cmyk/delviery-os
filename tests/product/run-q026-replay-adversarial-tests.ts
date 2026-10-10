/**
 * Q-026 — prova ADVERSARIAL de equivalencia da projecao da Operacao Viva.
 *
 * Sem banco, sem rede, sem efeito. Compara a projecao desta arvore (candidata)
 * contra a ORIGINAL pinada (`d0716fd`) — e, independentemente, o PR #31
 * (`b20a847`) contra a mesma original — em todos os cenarios de
 * `q026-cenarios.ts`: deepStrictEqual E JSON byte a byte, excecao conta como
 * saida. Depois: pureza, aliasing, ordem de entrada, consumo vivo x replay,
 * e a particao por escopo que a porta de realidade passou a fazer.
 *
 * Saida: `Q026_REPLAY_ADVERSARIAL: n/n PASS`. Qualquer divergencia reprova.
 */
import assert from "node:assert/strict";
import type { EventEnvelope, SourceMode } from "../../src/platform/contracts/event-catalog";
import {
  consumir,
  MemoriaDaProjecao,
  projecaoAtual,
  reconstruirPorReplay,
  type MensagemDaPonte,
} from "../../src/platform/projections/consumidor";
import { mesmoEstadoLogico, projetar as candidata } from "../../src/platform/projections/operacao-viva";
import { cenarios, comparar, congelar, type Relatorio } from "./q026-cenarios";
import { carregarReferencia, REF_ORIGINAL, REF_PR31, type Projetar } from "./q026-referencias";
import { embaralhar, envelopeDaLinha, gerarLinhas, PERFIL_LOJA } from "./q026-replay-fixture";

let passou = 0;
let pulado = 0;
const falhas: string[] = [];
function teste(nome: string, fn: () => void | "PULADO"): void {
  try {
    const r = fn();
    if (r === "PULADO") {
      pulado += 1;
      console.log(`  -- PULADO  ${nome}`);
      return;
    }
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(nome);
    console.log(`  XX  ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
  }
}

function resumo(r: Relatorio): string {
  const fam = Object.entries(r.por_familia).map(([k, v]) => `${k}=${v}`).join(" ");
  return `${r.comparacoes} comparacoes (${fam}); ${r.excecoes_iguais} com a mesma excecao nas duas`;
}

function exigirZero(r: Relatorio): void {
  if (r.total_divergencias === 0) return;
  const linhas = r.divergencias.map((d) => `[${d.familia}] ${d.cenario} @ ${d.escopo}: ${d.motivo}`);
  throw new Error(`${r.total_divergencias} divergencia(s):\n${linhas.join("\n")}`);
}

const original = carregarReferencia(REF_ORIGINAL);
if (!original.referencia) {
  console.error(`A referencia ORIGINAL e obrigatoria e nao carregou: ${original.motivo}`);
  process.exit(1);
}
const ORIGINAL: Projetar = original.referencia.projetar;
const pr31 = carregarReferencia(REF_PR31);

const LISTA = cenarios();
console.log(`Q-026 — equivalencia adversarial (${LISTA.length} cenarios)`);

/* ------------------------------------------------------------------ */
console.log("\n1. EQUIVALENCIA CONTRA A ORIGINAL");

teste("E1 candidata == original d0716fd em todos os cenarios (deepStrictEqual + JSON byte a byte)", () => {
  const r = comparar(ORIGINAL, candidata, LISTA);
  exigirZero(r);
  console.log(`      ${resumo(r)}`);
});

teste("E2 PR #31 (b20a847) == original nos MESMOS cenarios (prova independente da alegacao 79/79)", () => {
  if (!pr31.referencia) {
    console.log(`      ${pr31.motivo}`);
    return "PULADO";
  }
  const r = comparar(ORIGINAL, pr31.referencia.projetar, LISTA);
  exigirZero(r);
  console.log(`      ${resumo(r)}`);
});

/* ------------------------------------------------------------------ */
console.log("\n2. PUREZA E ALIASING");

const LOJA = gerarLinhas({ ...PERFIL_LOJA, fatos: 5_000, semente: 77, aparelhos: 8, pontos_por_viagem: 60,
  unidades: ["ITAIM", "LAB-BANCADA"] }).map(envelopeDaLinha);
const OPC = { agora: PERFIL_LOJA.agora, unit_id: "ITAIM", source_mode: "simulated" as SourceMode };

teste("E3 entrada congelada a fundo nao e escrita; a mesma entrada da a mesma saida", () => {
  const entrada = congelar(embaralhar(LOJA, 5));
  const antes = JSON.stringify(entrada);
  const a = candidata(entrada, OPC);
  const b = candidata(entrada, OPC);
  assert.equal(JSON.stringify(entrada), antes, "a entrada mudou");
  assert.deepStrictEqual(a, b);
  assert.ok(a.viagens.length > 5, "cenario sem viagens suficientes");
});

teste("E4 a saida nao compartilha estado: mexer na lista de eventos de uma chamada nao contamina outra", () => {
  const a = candidata(LOJA, OPC);
  const b = candidata(LOJA, OPC);
  for (let i = 0; i < a.viagens.length; i++) {
    assert.notEqual(a.viagens[i].eventos, b.viagens[i].eventos, "lista de eventos compartilhada entre chamadas");
    if (i > 0) assert.notEqual(a.viagens[i].eventos, a.viagens[i - 1].eventos, "lista compartilhada entre viagens");
  }
  const json = JSON.stringify(b);
  (a.viagens[0].eventos as string[]).push("INTRUSO");
  (a.viagens[0] as { estado: string }).estado = "encerrada";
  assert.equal(JSON.stringify(b), json, "a segunda saida mudou quando a primeira foi alterada");
  assert.deepStrictEqual(candidata(LOJA, OPC), b, "uma terceira chamada viu a alteracao");
});

teste("E5 a ordem de entrada nao muda a saida (direta, invertida, embaralhada x3)", () => {
  const ref = JSON.stringify(candidata(LOJA, OPC));
  for (const lista of [[...LOJA].reverse(), embaralhar(LOJA, 1), embaralhar(LOJA, 2), embaralhar(LOJA, 3)]) {
    assert.equal(JSON.stringify(candidata(lista, OPC)), ref);
  }
});

/* ------------------------------------------------------------------ */
console.log("\n3. CONSUMO VIVO x REPLAY (reinicio)");

function mensagem(e: EventEnvelope, i: number): MensagemDaPonte {
  return {
    outbox_id: `ob-${i}`,
    kind: e.event_type,
    idempotency_key: e.idempotency_key,
    payload: {
      event_id: e.event_id, event_type: e.event_type, event_version: e.event_version, unit_id: e.unit_id,
      trip_id: e.trip_id, device_id: e.device_id, occurred_at: e.occurred_at, received_at: e.received_at,
      clock_trust: e.clock_trust, origin: e.origin, source_mode: e.source_mode, sequence: e.sequence,
    },
  };
}

teste("E6 memoria viva (fila fora de ordem, reenvios) == replay do log == original, escopo a escopo", () => {
  const viva = new MemoriaDaProjecao();
  const fila = embaralhar([...LOJA, ...LOJA.slice(0, 700), ...LOJA.slice(2_000, 2_300)], 11).map(mensagem);
  const r = consumir(fila, { memoria: viva });
  assert.equal(r.aplicados, LOJA.length);
  assert.equal(r.duplicados, 1_000);
  const reiniciada = new MemoriaDaProjecao();
  reconstruirPorReplay(embaralhar(LOJA, 12), reiniciada, OPC);
  assert.ok(viva.escopos().length >= 4, "cenario sem escopos suficientes");
  assert.deepStrictEqual(reiniciada.escopos(), viva.escopos());
  for (const e of viva.escopos()) {
    const o = { agora: PERFIL_LOJA.agora, ...e };
    const pv = projecaoAtual(viva, o);
    const pr = projecaoAtual(reiniciada, o);
    assert.ok(mesmoEstadoLogico(pv, pr), `replay divergiu da memoria viva em ${e.unit_id}|${e.source_mode}`);
    assert.equal(JSON.stringify(pr), JSON.stringify(ORIGINAL(reiniciada.fatos(e.unit_id, e.source_mode), o)),
      `candidata != original sobre a memoria reconstruida (${e.unit_id}|${e.source_mode})`);
  }
});

teste("E7 fato atrasado depois do reinicio: replay(log + atrasados) == original(log + atrasados)", () => {
  const atrasados: EventEnvelope[] = LOJA.slice(100, 400).map((e, i) => ({
    ...e,
    event_id: `atrasado-${i}`,
    idempotency_key: `atrasado-${i}`,
    // Capturado no passado, recebido agora: offline que sincronizou depois.
    occurred_at: new Date(Date.parse(e.occurred_at) - 3_600_000).toISOString(),
    received_at: new Date(PERFIL_LOJA.agora.getTime() - 1_000).toISOString(),
  }));
  const m = new MemoriaDaProjecao();
  reconstruirPorReplay(LOJA, m, OPC);
  consumir(atrasados.map(mensagem), { memoria: m });
  const depois = new MemoriaDaProjecao();
  reconstruirPorReplay(embaralhar([...atrasados, ...LOJA], 3), depois, OPC);
  for (const e of depois.escopos()) {
    const o = { agora: PERFIL_LOJA.agora, ...e };
    const esperado = JSON.stringify(ORIGINAL([...LOJA, ...atrasados], o));
    assert.equal(JSON.stringify(projecaoAtual(m, o)), esperado, `vivo+atrasados (${e.unit_id}|${e.source_mode})`);
    assert.equal(JSON.stringify(projecaoAtual(depois, o)), esperado, `replay+atrasados (${e.unit_id}|${e.source_mode})`);
  }
});

/* ------------------------------------------------------------------ */
console.log("\n4. A PARTICAO DA PORTA DE REALIDADE");

teste("E8 projetar(so os fatos do escopo) == original(log inteiro), para todo escopo do log da loja", () => {
  const log = embaralhar(gerarLinhas({ ...PERFIL_LOJA, fatos: 8_000, semente: 9, aparelhos: 16, pontos_por_viagem: 30,
    unidades: ["ITAIM", "LAB-BANCADA", "OUTRA"] }).map(envelopeDaLinha), 4);
  const porEscopo = new Map<string, EventEnvelope[]>();
  for (const f of log) {
    const k = `${f.unit_id}|${f.source_mode}`;
    porEscopo.set(k, [...(porEscopo.get(k) ?? []), f]);
  }
  assert.ok(porEscopo.size >= 6, `escopos insuficientes: ${porEscopo.size}`);
  for (const [k, fatos] of porEscopo) {
    const [unit_id, source_mode] = k.split("|") as [string, SourceMode];
    const o = { agora: PERFIL_LOJA.agora, unit_id, source_mode };
    assert.equal(JSON.stringify(candidata(fatos, o).viagens), JSON.stringify(ORIGINAL(log, o).viagens), k);
  }
});

teste("E9 o caminho antigo e NECESSARIO: filtrar-antes-de-ordenar SEM a guarda diverge da original", () => {
  // A original ordena a lista inteira; com um instante ilegivel em OUTRO escopo
  // o comparador fica inconsistente, e a ordem DESTE escopo depende daquele fato.
  const c = LISTA.find((x) => x.nome.startsWith("instante ilegivel em outro escopo"));
  assert.ok(c, "cenario ausente");
  const o = { agora: PERFIL_LOJA.agora, unit_id: "ITAIM", source_mode: "simulated" as SourceMode };
  const ingenua: Projetar = (eventos, op) =>
    ORIGINAL(eventos.filter((e) => e.unit_id === op.unit_id && e.source_mode === op.source_mode), op);
  const ref = JSON.stringify(ORIGINAL(c.eventos, o));
  assert.notEqual(JSON.stringify(ingenua(c.eventos, o)), ref, "o cenario nao demonstra a dependencia entre escopos");
  assert.equal(JSON.stringify(candidata(c.eventos, o)), ref, "a candidata nao reproduz a original no caminho antigo");
});

/* ------------------------------------------------------------------ */
console.log("\n5. OS CENARIOS SAO SIGNIFICATIVOS");

teste("E10 empates por id cobrem ordem de localeCompare diferente da ordem por codigo de caractere", () => {
  const c = LISTA.find((x) => x.nome.startsWith("mesmo instante e sequencia: id por localeCompare"));
  assert.ok(c);
  const ids = c.eventos.map((e) => e.event_id);
  const porLocale = [...ids].sort((a, b) => a.localeCompare(b)).join(",");
  const porCodigo = [...ids].sort().join(",");
  assert.notEqual(porLocale, porCodigo);
});

teste("E11 o fuzz exercita o caminho rapido E o caminho antigo, com duplicatas e empates", () => {
  const fuzz = LISTA.filter((x) => x.familia === "FUZZ");
  let consistentes = 0;
  let inconsistentes = 0;
  let comDup = 0;
  let comEmpate = 0;
  for (const c of fuzz) {
    const ok = c.eventos.every((e) => {
      const s = e.sequence ?? 0;
      return Number.isFinite(Date.parse(e.occurred_at)) && typeof s === "number" && Number.isFinite(s) && typeof e.event_id === "string";
    });
    if (ok) consistentes += 1;
    else inconsistentes += 1;
    if (new Set(c.eventos.map((e) => e.idempotency_key)).size < c.eventos.length) comDup += 1;
    if (new Set(c.eventos.map((e) => Date.parse(e.occurred_at))).size < c.eventos.length) comEmpate += 1;
  }
  console.log(`      fuzz: ${consistentes} consistentes, ${inconsistentes} pelo caminho antigo, ${comDup} com duplicata, ${comEmpate} com empate`);
  assert.ok(consistentes > 1_000 && inconsistentes > 50 && comDup > 1_000 && comEmpate > 1_000);
});

const total = passou + falhas.length;
console.log(`\n${passou}/${total} PASS${pulado ? `, ${pulado} PULADO(S)` : ""}`);
if (falhas.length) {
  console.error(`Q026_REPLAY_ADVERSARIAL_RED: ${falhas.join(" | ")}`);
  process.exit(1);
}
console.log(`Q026_REPLAY_ADVERSARIAL: ${passou}/${total} PASS${pulado ? ` (${pulado} PULADO — ver acima)` : ""}`);
