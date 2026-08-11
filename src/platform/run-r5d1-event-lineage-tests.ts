/**
 * GATE R5-D1 — FUNDACAO DE LINHAGEM OPERACIONAL BASEADA EM EVENTOS
 * ============================================================================
 * Prova que os fatos de origem estao definidos, que a `LeituraOperacional` e uma
 * PROJECAO reconstruivel por replay, e que duplicata, conflito e ausencia nunca
 * viram numero.
 *
 * O ledger e um arquivo JSONL de verdade em diretorio temporario: os casos
 * adversariais gravam, relem do disco e reprojetam. Nenhum produtor vivo e
 * criado, nenhuma flag existe, nenhuma recomendacao e emitida.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CATALOGO_OPERACIONAL_VERSAO,
  TIPOS_OPERACIONAIS,
  VERSOES_SUPORTADAS,
  chaveIdempotente,
  impressaoDoFato,
  validarEvento,
  type EnvelopeOperacional,
  type EstadoPedido,
  type EstadoTrabalho,
  type ModoCapacidade,
} from "../product/eventos/catalogo-operacional";
import { PROJETOR_VERSAO, projetarLeitura, type LeituraProjetada } from "../product/eventos/projetar-leitura";
import {
  CATALOGO_EVENTOS_COMPATIVEL,
  PRODUTOR_VIVO_DISPONIVEL,
  PROJECAO_COMPATIVEL,
  avaliarProntidaoR5D,
} from "../product/atencao/prontidao-r5d";
import type { PracaId } from "../product/viewmodels/areas";
import type { EstadoDeFonte } from "../product/viewmodels/sinais";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const ARTEFATOS = [
  "src/product/eventos/catalogo-operacional.ts",
  "src/product/eventos/projetar-leitura.ts",
  "src/product/atencao/prontidao-r5d.ts",
] as const;

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

/* ------------------------------------------------------------------ *
 * Ledger JSONL real, em disco                                         *
 * ------------------------------------------------------------------ */

const TENANT = "tata";
const UNIDADE = "demo-unit";
const AGORA = "2026-08-04T19:00:00.000Z";
const OPC = { agora_iso: AGORA, tenant_id: TENANT, unit_id: UNIDADE };

let seq = 0;
const env = (
  tipo: (typeof TIPOS_OPERACIONAIS)[number],
  payload: Record<string, unknown>,
  over: Partial<EnvelopeOperacional> = {},
): Record<string, unknown> => {
  seq += 1;
  const t = `2026-08-04T18:${String(10 + (seq % 40)).padStart(2, "0")}:00.000Z`;
  return {
    event_id: `evt-${String(seq).padStart(4, "0")}`,
    event_type: tipo,
    event_version: VERSOES_SUPORTADAS[tipo],
    tenant_id: TENANT,
    unit_id: UNIDADE,
    source: "odhen",
    source_event_id: `src-${String(seq).padStart(4, "0")}`,
    occurred_at: t,
    observed_at: t,
    ingested_at: AGORA,
    correlation_id: `cor-${String(seq).padStart(4, "0")}`,
    payload,
    ...over,
  };
};

const pedido = (
  pedido_id: string,
  estado: EstadoPedido,
  rev = 1,
  over: Partial<EnvelopeOperacional> = {},
): Record<string, unknown> =>
  env("pedido_ciclo_observado", { pedido_id, estado, source_revision: rev }, over);

const trabalho = (
  trabalho_id: string,
  pedido_id: string,
  praca_id: PracaId | null,
  estado: EstadoTrabalho,
  rev = 1,
  over: Partial<EnvelopeOperacional> = {},
): Record<string, unknown> =>
  env(
    "trabalho_praca_observado",
    { trabalho_id, pedido_id, praca_id, referencia: "item-1", quantidade: 1, estado, source_revision: rev },
    over,
  );

const capacidade = (
  praca_id: PracaId,
  modo: ModoCapacidade,
  cap: number | null,
  valido_ate: string | null = null,
  rev = 1,
): Record<string, unknown> =>
  env("capacidade_praca_observada", { praca_id, modo, capacidade: cap, valido_ate, source_revision: rev });

const fonte = (source_id: string, estado: EstadoDeFonte, rev = 1): Record<string, unknown> =>
  env("source_health_changed", { source_id, estado, detalhe: "d", source_revision: rev });

/** Grava no ledger JSONL, le de volta do disco e projeta — o caminho real. */
function comLedger<T>(eventos: readonly unknown[], fn: (linhas: unknown[], arquivo: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "r5d1-"));
  const arquivo = join(dir, "ledger.jsonl");
  try {
    // Ledger vazio e caso legitimo. Sem esta linha, "nenhum evento" viraria uma
    // falha de I/O — e o teste da confianca nao estimada com ledger vazio nunca
    // chegaria a exercitar a projecao.
    appendFileSync(arquivo, "");
    for (const e of eventos) appendFileSync(arquivo, JSON.stringify(e) + "\n");
    const linhas: unknown[] = [];
    for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
      if (linha.trim() === "") continue;
      try {
        linhas.push(JSON.parse(linha));
      } catch {
        // Linha corrompida NAO derruba o replay: ela entra como lixo, e a
        // projecao a registra como lacuna. Sumir com ela seria pior.
        linhas.push({ __corrompida: linha });
      }
    }
    return fn(linhas, arquivo);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const projetar = (eventos: readonly unknown[]): LeituraProjetada =>
  comLedger(eventos, (linhas) => projetarLeitura(linhas, OPC));

const temConflito = (l: LeituraProjetada, m: string): boolean =>
  l.conflitos.some((c) => c.motivo === m);
const temLacuna = (l: LeituraProjetada, m: string): boolean =>
  l.lacunas.some((c) => c.motivo === m);
const cargaDe = (l: LeituraProjetada, p: PracaId): number =>
  l.carga_por_praca.find((c) => c.praca_id === p)?.abertos ?? 0;

/* ================================================================== *
 * CATALOGO E ENVELOPE                                                 *
 * ================================================================== */

teste("E01 os quatro eventos obrigatorios estao definidos e versionados", () => {
  assert.deepEqual([...TIPOS_OPERACIONAIS].sort(), [
    "capacidade_praca_observada",
    "pedido_ciclo_observado",
    "source_health_changed",
    "trabalho_praca_observado",
  ]);
  for (const t of TIPOS_OPERACIONAIS) assert.equal(VERSOES_SUPORTADAS[t], 1);
  assert.equal(CATALOGO_OPERACIONAL_VERSAO, "evento-operacional@1");
});

teste("E02 o envelope exige os campos do contrato, e `causation_id` NAO e inventado", () => {
  const base = pedido("P1", "aceito") as Record<string, unknown>;
  assert.equal(validarEvento(base).ok, true);
  // `causation_id` e opcional: ausencia e legitima, e o envelope nao a preenche.
  assert.equal("causation_id" in base, false);
  for (const campo of [
    "event_id", "event_type", "event_version", "tenant_id", "unit_id",
    "source", "source_event_id", "occurred_at", "observed_at", "ingested_at",
    "correlation_id", "payload",
  ]) {
    const sem = { ...base };
    delete sem[campo];
    const r = validarEvento(sem);
    assert.equal(r.ok, false, `envelope passou sem ${campo}`);
    assert.equal(r.ok === false && r.motivo, "campo_obrigatorio_ausente");
  }
});

teste("E03 nao existe evento que declare a leitura criada — projecao nao e fato", () => {
  for (const t of TIPOS_OPERACIONAIS) {
    assert.doesNotMatch(t, /leitura/i, `o catalogo ganhou um evento de projecao: ${t}`);
  }
  // L36 em pessoa: a primeira versao desta guarda acusou o proprio comentario do
  // catalogo, que diz em letra propria que este evento NAO existe. Codigo sem
  // comentario — a guarda verifica o que roda, nao o que esta escrito.
  const semComentario = ler("src/product/eventos/catalogo-operacional.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(semComentario, /leitura_operacional_criada/);
});

/* ================================================================== *
 * OS VINTE CASOS ADVERSARIAIS                                         *
 * ================================================================== */

teste("A01 evento duplicado IDENTICO e idempotente", () => {
  const e = pedido("P1", "aceito");
  const um = projetar([e]);
  const dois = projetar([e, JSON.parse(JSON.stringify(e))]);
  assert.deepEqual(dois.pedidos_ativos, um.pedidos_ativos);
  assert.equal(dois.eventos_aplicados, 1, "a duplicata identica virou dois fatos");
  assert.equal(dois.eventos_ignorados, 1);
  assert.equal(dois.conflitos.length, 0, "duplicata identica gerou conflito");
});

teste("A02 evento duplicado DIVERGENTE vira conflito, e nao sobrescreve", () => {
  const a = pedido("P1", "aceito") as Record<string, unknown>;
  const b = { ...a, event_id: "evt-outro", payload: { pedido_id: "P1", estado: "pronto", source_revision: 1 } };
  const l = projetar([a, b]);
  assert.ok(temConflito(l, "duplicata_divergente"), "a divergencia passou em silencio");
  // O PRIMEIRO permanece: o segundo nao sobrescreve.
  assert.deepEqual(l.pedidos_aguardando_producao, ["P1"]);
  assert.deepEqual(l.pedidos_prontos, []);
});

teste("A03 evento FORA DE ORDEM nao regride o estado projetado", () => {
  const pronto = pedido("P1", "pronto", 2, { occurred_at: "2026-08-04T18:30:00.000Z", observed_at: "2026-08-04T18:30:00.000Z" });
  const aceito = pedido("P1", "aceito", 1, { occurred_at: "2026-08-04T18:10:00.000Z", observed_at: "2026-08-04T18:10:00.000Z" });
  // Chegam na ordem errada; a ordenacao canonica e por `occurred_at`.
  const l = projetar([pronto, aceito]);
  assert.deepEqual(l.pedidos_prontos, ["P1"], "o atrasado regrediu o estado");
  assert.deepEqual(l.pedidos_aguardando_producao, []);
});

teste("A04 evento ATRASADO que tentaria regredir vira conflito auditavel", () => {
  const aceito = pedido("P1", "aceito", 1, { occurred_at: "2026-08-04T18:10:00.000Z", observed_at: "2026-08-04T18:10:00.000Z" });
  const pronto = pedido("P1", "pronto", 2, { occurred_at: "2026-08-04T18:20:00.000Z", observed_at: "2026-08-04T18:20:00.000Z" });
  // Um terceiro fato, com carimbo POSTERIOR, dizendo que voltou para producao.
  const volta = pedido("P1", "em_producao", 3, { occurred_at: "2026-08-04T18:30:00.000Z", observed_at: "2026-08-04T18:30:00.000Z" });
  const l = projetar([aceito, pronto, volta]);
  assert.deepEqual(l.pedidos_prontos, ["P1"], "a regressao foi aplicada");
  assert.ok(temConflito(l, "regressao_de_estado_recusada"), "a regressao passou sem registro");
});

teste("A05 versao desconhecida e recusada, e vira lacuna", () => {
  const l = projetar([pedido("P1", "aceito", 1, { event_version: 9 })]);
  assert.equal(l.pedidos_ativos.length, 0);
  assert.ok(temLacuna(l, "evento_invalido"));
  assert.ok(l.lacunas.some((x) => x.referencia === "versao_desconhecida"));
});

teste("A06 tipo desconhecido e recusado, e vira lacuna", () => {
  const l = projetar([{ ...(pedido("P1", "aceito") as object), event_type: "pedido_teleportado" }]);
  assert.ok(l.lacunas.some((x) => x.referencia === "tipo_desconhecido"));
});

teste("A07 trabalho SEM PRACA nao vira carga, e a lacuna fica declarada", () => {
  const l = projetar([trabalho("W1", "P1", null, "aguardando")]);
  assert.equal(l.carga_por_praca.length, 0, "trabalho sem praca virou carga");
  assert.ok(temLacuna(l, "trabalho_sem_praca"), "a ausencia de praca sumiu");
});

teste("A08 trabalho CONCLUIDO antes de iniciado e conflito", () => {
  const l = projetar([trabalho("W1", "P1", "enrolados", "concluido")]);
  assert.ok(temConflito(l, "conclusao_antes_de_inicio"));
  const b = projetar([
    trabalho("W1", "P1", "enrolados", "criado", 1, { occurred_at: "2026-08-04T18:10:00.000Z", observed_at: "2026-08-04T18:10:00.000Z" }),
    trabalho("W1", "P1", "enrolados", "concluido", 2, { occurred_at: "2026-08-04T18:20:00.000Z", observed_at: "2026-08-04T18:20:00.000Z" }),
  ]);
  assert.ok(temConflito(b, "conclusao_antes_de_inicio"), "concluir sem passar por iniciado passou");
});

teste("A09 cancelamento APOS conclusao e conflito, e o cancelamento vale", () => {
  const l = projetar([
    trabalho("W1", "P1", "enrolados", "iniciado", 1, { occurred_at: "2026-08-04T18:10:00.000Z", observed_at: "2026-08-04T18:10:00.000Z" }),
    trabalho("W1", "P1", "enrolados", "concluido", 2, { occurred_at: "2026-08-04T18:20:00.000Z", observed_at: "2026-08-04T18:20:00.000Z" }),
    trabalho("W1", "P1", "enrolados", "cancelado", 3, { occurred_at: "2026-08-04T18:30:00.000Z", observed_at: "2026-08-04T18:30:00.000Z" }),
  ]);
  assert.ok(temConflito(l, "cancelamento_apos_conclusao"));
  assert.equal(cargaDe(l, "enrolados"), 0);
});

teste("A10 pedido cancelado com trabalho ABERTO: conflito, e a carga continua contada", () => {
  const l = projetar([
    trabalho("W1", "P1", "enrolados", "aguardando", 1, { occurred_at: "2026-08-04T18:10:00.000Z", observed_at: "2026-08-04T18:10:00.000Z" }),
    pedido("P1", "cancelado", 2, { occurred_at: "2026-08-04T18:20:00.000Z", observed_at: "2026-08-04T18:20:00.000Z" }),
  ]);
  assert.ok(temConflito(l, "pedido_cancelado_com_trabalho_aberto"));
  // Some-lo daria uma carga MENOR do que a bancada realmente tem.
  assert.equal(cargaDe(l, "enrolados"), 1, "a carga sumiu com o cancelamento do pedido");
  assert.deepEqual(l.pedidos_ativos, []);
});

teste("A11 capacidade EXPIRADA nao vira zero — vira modo proprio", () => {
  const l = projetar([capacidade("enrolados", "observada", 8, "2026-08-04T18:00:00.000Z")]);
  const c = l.capacidade_por_praca[0]!;
  assert.equal(c.modo, "observacao_expirada");
  assert.equal(c.capacidade, null, "capacidade expirada virou numero");
  assert.notEqual(c.capacidade, 0);
  assert.ok(temLacuna(l, "capacidade_expirada"));
});

teste("A12 capacidade AUSENTE nao vira zero, e os modos sao distintos", () => {
  for (const modo of ["indisponivel", "nao_fornecida", "praca_temporariamente_indisponivel"] as const) {
    const l = projetar([capacidade("cozinha_quentes", modo, null)]);
    const c = l.capacidade_por_praca[0]!;
    assert.equal(c.modo, modo, "os modos de ausencia foram fundidos");
    assert.equal(c.capacidade, null);
    assert.ok(temLacuna(l, "capacidade_ausente"));
  }
  // O par: capacidade observada, com validade no futuro, PASSA com numero.
  const ok = projetar([capacidade("cozinha_quentes", "observada", 6, "2026-08-04T20:00:00.000Z")]);
  assert.equal(ok.capacidade_por_praca[0]!.capacidade, 6);
  assert.equal(ok.capacidade_por_praca[0]!.modo, "observada");
});

teste("A13/A14 fonte degradada e indisponivel chegam a leitura como sao", () => {
  const l = projetar([fonte("odhen", "stale"), fonte("ifood", "indisponivel")]);
  assert.deepEqual(l.fontes, [
    { id: "ifood", estado: "indisponivel" },
    { id: "odhen", estado: "stale" },
  ]);
  // Uma fonte degradada NAO e promovida a saudavel em ponto nenhum.
  assert.equal(l.fontes.some((f) => f.estado === "saudavel"), false);
});

teste("A15 sequencia INCOMPLETA apos reinicio continua projetavel", () => {
  // Só a segunda metade do ledger sobreviveu: a leitura sai do que existe, e a
  // ausencia do inicio aparece como conflito, nao como invencao.
  const l = projetar([trabalho("W1", "P1", "enrolados", "concluido", 2)]);
  assert.ok(temConflito(l, "conclusao_antes_de_inicio"));
  assert.equal(l.eventos_aplicados, 1);
});

teste("A16 linha CORROMPIDA no ledger vira lacuna, e nao derruba o replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "r5d1c-"));
  const arquivo = join(dir, "ledger.jsonl");
  try {
    appendFileSync(arquivo, JSON.stringify(pedido("P1", "aceito")) + "\n");
    appendFileSync(arquivo, "{ isto nao e json\n");
    appendFileSync(arquivo, JSON.stringify(pedido("P2", "pronto")) + "\n");
    const linhas: unknown[] = [];
    for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
      if (linha.trim() === "") continue;
      try {
        linhas.push(JSON.parse(linha));
      } catch {
        linhas.push({ __corrompida: linha });
      }
    }
    const l = projetarLeitura(linhas, OPC);
    assert.equal(l.pedidos_ativos.length, 2, "a linha corrompida levou os vizinhos junto");
    assert.ok(temLacuna(l, "evento_invalido"), "a corrupcao passou sem registro");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("A17 replay executado DUAS VEZES produz o mesmo resultado", () => {
  const eventos = [
    pedido("P1", "aceito"),
    trabalho("W1", "P1", "enrolados", "aguardando"),
    capacidade("enrolados", "observada", 5, "2026-08-04T20:00:00.000Z"),
    fonte("odhen", "saudavel"),
  ];
  const a = projetar(eventos);
  const b = projetar(eventos);
  assert.deepEqual(b, a, "o replay divergiu");
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

teste("A18 duas ORDENS DE INGESTAO diferentes, mesma ordem causal, mesma leitura", () => {
  // As tres revisoes sao IGUAIS de proposito. Na primeira versao deste teste
  // elas eram 1, 2 e 1 — e o desempate por `source_revision` reproduzia a ordem
  // causal por acidente, deixando `occurred_at` sem carga. Uma mutacao que
  // ordenava por ingestao passava cega. Com revisoes iguais, so o instante do
  // fato distingue, e ele passa a ser o que o teste realmente mede.
  // A fixture e construida para que NADA alem de `occurred_at` acerte a ordem
  // causal. As revisoes sao iguais, o `ingested_at` e o mesmo, e o
  // `source_event_id` CONTRADIZ o tempo de proposito — o fato mais antigo tem a
  // chave lexicograficamente maior.
  //
  // As duas primeiras versoes deste teste nao discriminavam: numa, as revisoes
  // 1/2/1 reproduziam a ordem causal; noutra, o desempate por chave reproduzia.
  // Uma mutacao que ordenava por ingestao passava cega nas duas. Aqui, quem nao
  // ordenar por `occurred_at` inverte o ciclo do pedido e produz conflito.
  const eventos = [
    pedido("P1", "aceito", 1, {
      occurred_at: "2026-08-04T18:10:00.000Z",
      observed_at: "2026-08-04T18:10:00.000Z",
      source_event_id: "src-zzz",
    }),
    pedido("P1", "em_producao", 1, {
      occurred_at: "2026-08-04T18:20:00.000Z",
      observed_at: "2026-08-04T18:20:00.000Z",
      source_event_id: "src-aaa",
    }),
    trabalho("W1", "P1", "enrolados", "aguardando", 1, {
      occurred_at: "2026-08-04T18:15:00.000Z",
      observed_at: "2026-08-04T18:15:00.000Z",
      source_event_id: "src-mmm",
    }),
  ];
  const direta = projetar(eventos);
  const invertida = projetar([...eventos].reverse());
  // `ingested_at` nao entra na ordenacao: quem chegou primeiro no cano nao muda
  // o que aconteceu na cozinha.
  assert.deepEqual(invertida.pedidos_em_producao, direta.pedidos_em_producao);
  assert.deepEqual(invertida.carga_por_praca, direta.carga_por_praca);
  assert.deepEqual(invertida.conflitos, direta.conflitos);
  // E a prova positiva: ordenado pelo tempo do FATO, o ciclo nao regride e nao
  // ha conflito nenhum. Se aparecer, alguem ordenou por outra coisa.
  assert.deepEqual(direta.conflitos, [], "a ordem canonica produziu conflito");
});

teste("A19 `occurred_at` posterior a `observed_at` e recusado", () => {
  const l = projetar([
    pedido("P1", "aceito", 1, {
      occurred_at: "2026-08-04T18:40:00.000Z",
      observed_at: "2026-08-04T18:10:00.000Z",
    }),
  ]);
  assert.equal(l.pedidos_ativos.length, 0, "um fato do futuro entrou na leitura");
  assert.ok(l.lacunas.some((x) => x.referencia === "occurred_at_posterior_a_observed_at"));
});

teste("A20 conflito entre DUAS FONTES na mesma revisao fica registrado", () => {
  const l = projetar([
    fonte("odhen", "saudavel", 7),
    { ...(fonte("odhen", "indisponivel", 7) as object), source: "outra-origem" },
  ]);
  assert.ok(temConflito(l, "fontes_divergentes"), "duas fontes discordaram em silencio");
});

/* ================================================================== *
 * PROJECAO, CARGA E CONFIANCA                                         *
 * ================================================================== */

teste("P01 a carga nasce de trabalho ABERTO contado, nunca de numero recebido", () => {
  const l = projetar([
    trabalho("W1", "P1", "enrolados", "aguardando"),
    trabalho("W2", "P2", "enrolados", "iniciado"),
    trabalho("W3", "P3", "enrolados", "concluido"),
    trabalho("W4", "P4", "combinados", "criado"),
  ]);
  const en = l.carga_por_praca.find((c) => c.praca_id === "enrolados")!;
  assert.equal(en.abertos, 2, "concluido continuou contando como carga");
  assert.equal(en.aguardando, 1);
  assert.equal(en.iniciados, 1);
  assert.equal(cargaDe(l, "combinados"), 1);
  // Estrutural: nao existe caminho que receba carga pronta.
  const fonteProj = ler("src/product/eventos/projetar-leitura.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(fonteProj, /carga_recebida|carga_por_praca\s*:\s*payload/);
});

teste("P02 a projecao representa os estados de pedido e a idade do mais antigo", () => {
  const l = projetar([
    pedido("P1", "aceito"),
    pedido("P2", "em_producao"),
    pedido("P3", "pronto"),
    trabalho("W1", "P1", "enrolados", "aguardando", 1, {
      occurred_at: "2026-08-04T18:00:00.000Z",
      observed_at: "2026-08-04T18:00:00.000Z",
    }),
  ]);
  assert.deepEqual(l.pedidos_aguardando_producao, ["P1"]);
  assert.deepEqual(l.pedidos_em_producao, ["P2"]);
  assert.deepEqual(l.pedidos_prontos, ["P3"]);
  assert.deepEqual(l.pedidos_ativos, ["P1", "P2", "P3"]);
  const en = l.carga_por_praca.find((c) => c.praca_id === "enrolados")!;
  assert.equal(en.idade_do_mais_antigo_min, 60, "a idade do trabalho mais antigo saiu errada");
  assert.equal(l.evidencia_mais_recente !== null, true, "o freshness sumiu");
});

teste("P03 a confianca e NAO ESTIMADA — o projetor nao inventa a politica que falta", () => {
  const cheia = projetar([
    pedido("P1", "aceito"),
    trabalho("W1", "P1", "enrolados", "aguardando"),
    fonte("odhen", "saudavel"),
  ]);
  assert.deepEqual(cheia.confianca, { estado: "nao_estimada" });
  assert.equal("valor" in cheia.confianca, false, "a confianca ganhou numero");
  const vazia = projetar([]);
  assert.deepEqual(vazia.confianca, { estado: "nao_estimada" });
  // Nem com muitos eventos ela vira numero: quantidade nao e confianca.
  assert.notEqual(JSON.stringify(cheia.confianca), JSON.stringify({ estado: "apurada" }));
});

teste("P04 a linhagem carrega os ids aplicados e declara a natureza", () => {
  const l = projetar([pedido("P1", "aceito"), trabalho("W1", "P1", "enrolados", "aguardando")]);
  assert.equal(l.linhagem.input_event_ids.length, 2);
  assert.equal(l.linhagem.natureza, "real");
  assert.equal(l.linhagem.produtor, "operacao-viva");
  assert.equal(l.linhagem.transformacoes.includes(PROJETOR_VERSAO), true);
  // Fonte de fixture degrada a natureza inteira.
  const fx = projetar([{ ...(pedido("P1", "aceito") as object), source: "fixture-cena" }]);
  assert.equal(fx.linhagem.natureza, "demonstracao");
});

teste("P05 a leitura serializa e o replay do JSON restaurado da o mesmo resultado", () => {
  const eventos = [pedido("P1", "aceito"), trabalho("W1", "P1", "enrolados", "iniciado")];
  const l = projetar(eventos);
  assert.deepEqual(JSON.parse(JSON.stringify(l)), l, "a leitura nao sobrevive a JSON");
  const restaurados = JSON.parse(JSON.stringify(eventos)) as unknown[];
  assert.deepEqual(projetarLeitura(restaurados, OPC), l);
});

/* ================================================================== *
 * PREFLIGHT, PUREZA E ISOLAMENTO                                      *
 * ================================================================== */

teste("PF1 preflight: catalogo compativel, projecao compativel, produtor INDISPONIVEL", () => {
  assert.equal(CATALOGO_EVENTOS_COMPATIVEL, true);
  assert.equal(PROJECAO_COMPATIVEL, true);
  assert.equal(PRODUTOR_VIVO_DISPONIVEL, false, "alguem declarou produtor vivo sem haver um");
  const p = avaliarProntidaoR5D({
    linhagem: { elegivel: true, input_event_ids: ["evt-aaa"] },
    confianca: { suportada: true, valor: null },
    validador_compartilhado: true,
    pedido_qualificado: true,
    trabalho_praca_qualificado: true,
    capacidade_qualificada: true,
    caminho_de_leitura_seguro: true,
  });
  assert.equal(p.status, "blocked");
  assert.deepEqual(
    p.status === "blocked" && p.bloqueios.map((b) => b.motivo),
    ["live_event_producer_unavailable"],
    "o bloqueio deixou de ser exclusivamente o produtor vivo",
  );
});

teste("PF2 o projetor e PURO: sem relogio, sem random, sem I/O", () => {
  const fonteProj = ler("src/product/eventos/projetar-leitura.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const proibido of [/Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/, /readFile/, /writeFile/, /process\.env/]) {
    assert.doesNotMatch(fonteProj, proibido, `o projetor ganhou ${proibido}`);
  }
  assert.match(fonteProj, /agora_iso/, "o instante deixou de entrar pela entrada");
  const imports = [...fonteProj.matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1]!,
  );
  for (const esp of imports) {
    for (const proibido of ["store", "outbox", "pg", "bin/", "conference-brain", "perfil-delivery"]) {
      assert.ok(!esp.includes(proibido), `o projetor importou ${esp}`);
    }
  }
});

teste("PF3 nenhum produtor vivo, flag ou recomendacao nasceu", () => {
  for (const arq of [
    "src/product/eventos/catalogo-operacional.ts",
    "src/product/eventos/projetar-leitura.ts",
  ]) {
    const f = ler(arq).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const proibido of [/FEATURE_/, /FLAG_/, /\bfetch\s*\(/, /\bemit\s*\(/, /recomendar\s*\(/]) {
      assert.doesNotMatch(f, proibido, `${arq} ganhou ${proibido}`);
    }
  }
  // Ninguem no produto chama o projetor: ele existe como fundacao.
  let chamadores: string[] = [];
  try {
    chamadores = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "projetarLeitura", "--", "src/", "tools/"],
      { cwd: raiz, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => l.split("\\").join("/"));
  } catch {
    chamadores = [];
  }
  // GATES podem exercitar o projetor; o que ele nao pode e ter chamador de
  // RUNTIME. R5-D3 acrescentou o seu, e a lista continua fechada de proposito.
  //
  // M1A.1 acrescentou `run-m1-bridge-tests.ts`, POR NOME e nao alargando o
  // padrao: ele exercita o projetor para medir a unidade de `carga_por_praca`
  // (1 pedido / 5 itens). A lista continua fechada e enumerada — se ela virasse
  // `/run-.*-tests\.ts$/`, qualquer arquivo de teste novo entraria sozinho e a
  // guarda passaria a afirmar menos do que afirma hoje. Nenhum comportamento de
  // produto muda: o projetor continua sem chamador de runtime.
  for (const c of chamadores) {
    assert.ok(
      /\/run-r5[a-z0-9-]*-tests\.ts$/.test(c) ||
        c.endsWith("/run-m1-bridge-tests.ts") ||
        c.endsWith("projetar-leitura.ts"),
      `o projetor ganhou chamador de runtime: ${c}`,
    );
  }
  assert.ok(chamadores.length >= 2, "a busca por chamadores nao encontrou nada");
});

teste("PF4 areas congeladas com diff vazio desde 73f2f0b", () => {
  const saida = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "73f2f0b",
      "--",
      "src/perfil-delivery/",
      "src/product/viewmodels/",
      "src/product/atencao/politica-temporal.ts",
      "src/product/atencao/linhagem-eventos.ts",
      "src/platform/copiloto/confianca-duravel.ts",
      "src/product/ui/",
      "docs/figma/",
    ],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `area congelada foi alterada:\n${saida}`);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  const marcas = Object.fromEntries(ARTEFATOS.map((a) => [a, sha(ler(a)).slice(0, 16)]));
  console.log(`\nARTEFATOS ${JSON.stringify(marcas)}`);
  console.log(`\nR5-D1 — fundacao de linhagem operacional: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D1_EVENT_LINEAGE_GATE_GREEN");
});
