/**
 * GATE R5-D3 — CAMINHO OPERACIONAL EM SHADOW
 * ============================================================================
 * Integrado de proposito: um gate para os dois produtores e o ledger, cobrindo
 * apenas RISCOS MATERIAIS. Os vinte casos por componente ja estao provados nos
 * gates de R5-D1 e R5-D2, e recria-los aqui seria custo sem prova nova.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  produzirTrabalhoPraca,
  type RegistroDeTrabalho,
} from "../product/eventos/produtor-trabalho-praca";
import { estadoDaFonte, observarSaude } from "../product/eventos/observador-saude";
import { criarLedgerShadow } from "../product/eventos/ledger-shadow";
import { projetarLeitura } from "../product/eventos/projetar-leitura";
import type { EnvelopeOperacional } from "../product/eventos/catalogo-operacional";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const semComentario = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

let passed = 0;
const failures: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ------------------------------------------------------------------ */

const T = "tata";
const U = "demo-unit";
const CTX = { tenant: T, unidade: U, limite_stale_min: 10 };

const reg = (over: Partial<RegistroDeTrabalho> = {}): RegistroDeTrabalho => ({
  unidade: U,
  tenant: T,
  praca: "enrolados",
  pedido_id: "P1",
  grupo: "g1",
  estado: "aguardando",
  ocorrido_em: "2026-08-04T18:10:00.000Z",
  observado_em: "2026-08-04T18:10:00.000Z",
  operador: "term-3",
  revisao: 1,
  quantidade: 1,
  ...over,
});

const evento = (over: Partial<RegistroDeTrabalho> = {}): EnvelopeOperacional => {
  const r = produzirTrabalhoPraca(reg(over));
  assert.equal(r.ok, true, r.ok === false ? `${r.motivo}: ${r.detalhe}` : "");
  return (r as { ok: true; evento: EnvelopeOperacional }).evento;
};

function comLedger<X>(habilitado: boolean, fn: (l: ReturnType<typeof criarLedgerShadow>, dir: string) => X): X {
  const dir = mkdtempSync(join(tmpdir(), "r5d3-"));
  try {
    return fn(criarLedgerShadow({ arquivo: join(dir, "shadow.jsonl"), habilitado }), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ================================================================== *
 * 1-2 · DUPLICATA                                                     *
 * ================================================================== */

teste("S01 duplicata IDENTICA e idempotente, e o produtor ja da o mesmo id", () => {
  const a = evento();
  const b = evento();
  assert.equal(b.event_id, a.event_id, "o mesmo registro produziu ids diferentes");
  comLedger(true, (l) => {
    assert.equal(l.registrar(a).tipo, "gravado");
    assert.equal(l.registrar(b).tipo, "duplicata_identica");
    assert.equal(l.replay().length, 1, "a duplicata identica virou dois fatos");
  });
});

teste("S02 duplicata DIVERGENTE vira conflito, e nao sobrescreve", () => {
  const a = evento();
  // Mesma chave (mesmo estado e revisao), conteudo diferente.
  const b = { ...a, payload: { ...a.payload, quantidade: 99 } } as EnvelopeOperacional;
  comLedger(true, (l) => {
    assert.equal(l.registrar(a).tipo, "gravado");
    const r = l.registrar(b);
    assert.equal(r.tipo, "conflito", "a divergencia passou em silencio");
    const gravados = l.replay();
    assert.equal(gravados.length, 1);
    assert.equal((gravados[0]!.payload as { quantidade: number | null }).quantidade, 1);
  });
});

/* ================================================================== *
 * 3-4 · ORDEM E REGRESSAO                                             *
 * ================================================================== */

teste("S03/S04 fora de ordem nao regride: o projetor decide pelo occurred_at", () => {
  const inicio = evento({ estado: "iniciado", revisao: 2, ocorrido_em: "2026-08-04T18:20:00.000Z", observado_em: "2026-08-04T18:20:00.000Z" });
  const espera = evento({ estado: "aguardando", revisao: 1 });
  // Chegam invertidos no ledger; o replay preserva a ordem de gravacao e o
  // projetor reordena pelo tempo do FATO.
  const l = comLedger(true, (led) => {
    led.registrar(inicio);
    led.registrar(espera);
    return led.replay();
  });
  const opc = { agora_iso: "2026-08-04T19:00:00.000Z", tenant_id: T, unit_id: U };
  const p = projetarLeitura(l, opc);
  const carga = p.carga_por_praca.find((c) => c.praca_id === "enrolados")!;
  assert.equal(carga.iniciados, 1, "chegar invertido mudou o estado do trabalho");
  assert.equal(carga.aguardando, 0);
  // Chegar fora de ordem NAO e regressao: a ordenacao canonica resolve, e por
  // isso nao ha conflito nenhum aqui. Registrar um seria acusar a fonte de algo
  // que ela nao fez.
  assert.deepEqual(p.conflitos, [], "chegar invertido virou conflito");

  // A REGRESSAO DE VERDADE: um fato POSTERIOR dizendo que o trabalho voltou.
  const voltou = evento({
    estado: "aguardando",
    revisao: 3,
    ocorrido_em: "2026-08-04T18:30:00.000Z",
    observado_em: "2026-08-04T18:30:00.000Z",
  });
  const q = projetarLeitura([...l, voltou], opc);
  const cargaQ = q.carga_por_praca.find((c) => c.praca_id === "enrolados")!;
  assert.equal(cargaQ.iniciados, 1, "a regressao foi aplicada");
  assert.ok(
    q.conflitos.some((c) => c.motivo === "regressao_de_estado_recusada"),
    "a regressao passou sem registro",
  );
});

/* ================================================================== *
 * 5-6 · AUSENCIAS QUE O PRODUTOR RECUSA                               *
 * ================================================================== */

teste("S05 praca ausente e RECUSADA na origem — o produtor nao infere praca", () => {
  const r = produzirTrabalhoPraca(reg({ praca: "" as unknown as RegistroDeTrabalho["praca"] }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "praca_ausente");
  // E nao existe caminho de inferencia no produtor.
  const fonte = semComentario(ler("src/product/eventos/produtor-trabalho-praca.ts"));
  assert.doesNotMatch(fonte, /inferir|deduzir|adivinh|praca_padrao|praca\s*\?\?/i);
});

teste("S06 pedido ausente e recusado, e operador identificavel tambem", () => {
  assert.equal(
    (produzirTrabalhoPraca(reg({ pedido_id: "  " })) as { motivo: string }).motivo,
    "pedido_ausente",
  );
  assert.equal(
    (produzirTrabalhoPraca(reg({ grupo: "" })) as { motivo: string }).motivo,
    "grupo_ausente",
  );
  // PII: nome, e-mail, telefone e CPF nao passam como operador.
  for (const identificavel of ["Joao Silva", "joao@tata.com", "(11) 99999-1234", "123.456.789-00"]) {
    const r = produzirTrabalhoPraca(reg({ operador: identificavel }));
    assert.equal(r.ok, false, `aceitou operador ${identificavel}`);
    assert.equal(r.ok === false && r.motivo, "operador_parece_identificavel");
  }
  // O par: pseudonimo opaco passa.
  assert.equal(produzirTrabalhoPraca(reg({ operador: "term-3" })).ok, true);
});

/* ================================================================== *
 * 7 · REINICIO E REPLAY                                               *
 * ================================================================== */

teste("S07 reinicio e replay reconstroem a mesma leitura", () => {
  const dir = mkdtempSync(join(tmpdir(), "r5d3r-"));
  const arquivo = join(dir, "shadow.jsonl");
  try {
    const escritor = criarLedgerShadow({ arquivo, habilitado: true });
    escritor.registrar(evento({ estado: "aguardando", revisao: 1 }));
    escritor.registrar(evento({ estado: "iniciado", revisao: 2, ocorrido_em: "2026-08-04T18:20:00.000Z", observado_em: "2026-08-04T18:20:00.000Z" }));
    const s = observarSaude(
      { fonte_id: "odhen", respondeu: true, idade_min: 2, completa: true, observado_em: "2026-08-04T18:25:00.000Z", revisao: 1 },
      CTX,
    );
    assert.equal(s.ok, true, s.ok === false ? s.motivo : "");
    escritor.registrar((s as { ok: true; evento: EnvelopeOperacional }).evento);

    // Processo novo, mesmo arquivo.
    const leitor = criarLedgerShadow({ arquivo, habilitado: true });
    const eventos = leitor.replay();
    assert.ok(eventos.length >= 2, "o replay perdeu evento");
    const opc = { agora_iso: "2026-08-04T19:00:00.000Z", tenant_id: T, unit_id: U };
    const a = projetarLeitura(eventos, opc);
    const b = projetarLeitura(leitor.replay(), opc);
    assert.deepEqual(b, a, "o replay divergiu entre duas execucoes");
    assert.deepEqual(leitor.recusadas(), [], "o replay recusou linha valida");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ================================================================== *
 * 8 · AUSENCIA DE SINAL NAO VIRA SAUDAVEL                             *
 * ================================================================== */

teste("S08 ausencia de sinal NUNCA vira saudavel", () => {
  assert.equal(estadoDaFonte({ fonte_id: "f", respondeu: false, idade_min: null, completa: true, observado_em: "2026-08-04T18:00:00.000Z", revisao: 1 }, CTX), "indisponivel");
  assert.equal(estadoDaFonte({ fonte_id: "f", respondeu: true, idade_min: 40, completa: true, observado_em: "2026-08-04T18:00:00.000Z", revisao: 1 }, CTX), "stale");
  assert.equal(estadoDaFonte({ fonte_id: "f", respondeu: true, idade_min: 2, completa: false, observado_em: "2026-08-04T18:00:00.000Z", revisao: 1 }, CTX), "parcial");
  // Idade nao observada com resposta completa: `parcial`, nunca `saudavel`.
  assert.equal(estadoDaFonte({ fonte_id: "f", respondeu: true, idade_min: null, completa: true, observado_em: "2026-08-04T18:00:00.000Z", revisao: 1 }, CTX), "parcial");
  // O par: com tudo observado e fresco, sai `saudavel`.
  assert.equal(estadoDaFonte({ fonte_id: "f", respondeu: true, idade_min: 2, completa: true, observado_em: "2026-08-04T18:00:00.000Z", revisao: 1 }, CTX), "saudavel");
});

/* ================================================================== *
 * 9-10 · SHADOW DESLIGADO E FRONTEIRA DO PRODUTOR                     *
 * ================================================================== */

teste("S09 shadow DESLIGADO nao grava — e desligado e o padrao", () => {
  comLedger(false, (l, dir) => {
    assert.equal(l.habilitado, false);
    const r = l.registrar(evento());
    assert.equal(r.tipo, "ignorado_shadow_desligado");
    assert.equal(l.replay().length, 0, "o shadow desligado gravou");
    // Nem o arquivo nasce.
    assert.throws(() => readFileSync(join(dir, "shadow.jsonl"), "utf8"));
  });
  // O padrao do construtor: sem `habilitado`, fica desligado.
  const dir = mkdtempSync(join(tmpdir(), "r5d3p-"));
  try {
    const l = criarLedgerShadow({ arquivo: join(dir, "s.jsonl") });
    assert.equal(l.habilitado, false, "o ledger nasceu ligado");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // E o ledger de shadow nao aponta para o oficial.
  assert.throws(() => criarLedgerShadow({ arquivo: "/tmp/ledger-oficial.jsonl", habilitado: true }));
});

teste("S10 os produtores NAO emitem leitura nem recomendacao", () => {
  for (const arq of [
    "src/product/eventos/produtor-trabalho-praca.ts",
    "src/product/eventos/observador-saude.ts",
    "src/product/eventos/ledger-shadow.ts",
  ]) {
    const fonte = semComentario(ler(arq));
    for (const proibido of [
      /LeituraOperacional/,
      /Recomendacao/,
      /recomendar\s*\(/,
      /carga_por_praca/,
      /\bfetch\s*\(/,
      /Date\.now\s*\(/,
      /Math\.random\s*\(/,
      /randomUUID/,
      /FEATURE_|FLAG_/,
    ]) {
      assert.doesNotMatch(fonte, proibido, `${arq} ganhou ${proibido}`);
    }
  }
  // Cada produtor emite UMA especie de fato.
  const trab = semComentario(ler("src/product/eventos/produtor-trabalho-praca.ts"));
  assert.equal((trab.match(/event_type:/g) ?? []).length, 1);
  assert.match(trab, /event_type: "trabalho_praca_observado" as const/);
  const saude = semComentario(ler("src/product/eventos/observador-saude.ts"));
  assert.equal((saude.match(/event_type:/g) ?? []).length, 1);
  assert.match(saude, /event_type: "source_health_changed" as const/);
});

teste("S11 areas congeladas com diff vazio desde 1a35ebe", () => {
  const saida = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "1a35ebe",
      "--",
      "src/perfil-delivery/",
      "src/product/viewmodels/",
      "src/product/atencao/",
      "src/platform/copiloto/",
      "src/product/eventos/catalogo-operacional.ts",
      "src/product/eventos/projetar-leitura.ts",
      "src/product/ui/",
      "docs/figma/",
    ],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `area congelada foi alterada:\n${saida}`);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  console.log(`\nR5-D3 — caminho operacional em shadow: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D3_SHADOW_PATH_GATE_GREEN");
});
