/**
 * GATE R5-A — POLITICA TEMPORAL DA ATENCAO
 * ============================================================================
 * Prova a semantica temporal da Operacao Viva com RELOGIO CONTROLADO. Nenhum
 * teste aqui chama `Date.now()`, e a guarda T-REL falha se a politica chamar.
 *
 * O que ele cobre: semantica temporal · determinismo · serializacao · replay ·
 * relogio injetavel · exclusividade · debounce · cooldown · teto de Foco ·
 * obsolescencia · C1 · C3 · congelamento visual.
 *
 * O que ele NAO prova, e vale dizer: nada aqui exercita fonte real. As
 * sequencias sao construidas, e e exatamente por isso que elas conseguem provar
 * tempo — as fixtures da home sao instantes isolados, sem eixo temporal.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ESTADO_INICIAL,
  POLITICA_CANONICA,
  elegerModo,
  identidadeDaCausa,
  restaurar,
  serializar,
  type CausaCandidata,
  type EntradaDaEleicao,
  type EstadoTemporal,
  type ResultadoDaEleicao,
} from "../product/atencao/politica-temporal";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
/**
 * Codigo sem comentario. Existe porque um comentario que EXPLICA uma proibicao
 * nao pode reprovar a guarda que verifica se ela foi violada — foi exatamente
 * assim que a primeira versao de R5A-07 acusou preempcao lendo a frase que diz
 * que preempcao nao existe.
 */
const semComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const FONTE_POLITICA = "src/product/atencao/politica-temporal.ts";

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
 * Instrumentos                                                        *
 * ------------------------------------------------------------------ */

function causa(
  codigo: string,
  severidade: number,
  extra: Partial<CausaCandidata> = {},
): CausaCandidata {
  return {
    codigo,
    severidade,
    ambiente: "sushi",
    subarea: null,
    pedido_id: null,
    fonte_id: "carga_pracas",
    evidencias: 2,
    ...extra,
  };
}

const FONTES_SAS = [{ id: "carga_pracas", estado: "saudavel" as const }];
const FONTES_STALE = [{ id: "carga_pracas", estado: "stale" as const }];

interface Leitura {
  readonly t: number;
  readonly candidatas: readonly CausaCandidata[];
  readonly fontes?: EntradaDaEleicao["fontes"];
  readonly idade?: number | null;
}

/** Roda uma sequencia com relogio controlado e devolve todos os resultados. */
function sequencia(
  leituras: readonly Leitura[],
  inicial: EstadoTemporal = ESTADO_INICIAL,
): readonly ResultadoDaEleicao[] {
  const saidas: ResultadoDaEleicao[] = [];
  let estado = inicial;
  for (const l of leituras) {
    const r = elegerModo({
      estado,
      agora_min: l.t,
      candidatas: l.candidatas,
      fontes: l.fontes ?? FONTES_SAS,
      // `?? 0` transformaria uma idade declarada como NAO OBSERVADA em zero —
      // exatamente a mentira que o produto inteiro existe para nao contar.
      idade_da_leitura_min: "idade" in l ? (l.idade ?? null) : 0,
    });
    saidas.push(r);
    estado = r.estado;
  }
  return saidas;
}

const ultimo = (rs: readonly ResultadoDaEleicao[]): ResultadoDaEleicao => rs[rs.length - 1]!;
/** Leituras de minuto em minuto com as mesmas candidatas. */
const manter = (de: number, ate: number, cs: readonly CausaCandidata[]): Leitura[] =>
  Array.from({ length: ate - de + 1 }, (_, i) => ({ t: de + i, candidatas: cs }));

const A = causa("s5", 3);
const B = causa("s1", 3, { ambiente: "motoboy", fonte_id: "ifood_tempos" });

/* ================================================================== *
 * 1-7 · DEBOUNCE, CONTINUIDADE E EXCLUSIVIDADE                        *
 * ================================================================== */

teste("R5A-01 pico abaixo do debounce NAO cria Foco", () => {
  const rs = sequencia([...manter(0, 2, [A]), { t: 3, candidatas: [] }]);
  assert.ok(
    rs.slice(0, 3).every((r) => r.modo !== "foco"),
    "um pico de 2 minutos virou Foco",
  );
  assert.equal(ultimo(rs).modo, "calmo");
  assert.equal(ultimo(rs).causa, null);
});

teste("R5A-02 pressao sustentada cruza o debounce e vira Foco", () => {
  const rs = sequencia(manter(0, 3, [A]));
  assert.equal(rs[2]!.modo, "ambiente", "virou Foco antes dos 3 minutos");
  assert.equal(rs[3]!.modo, "foco");
  assert.equal(rs[3]!.motivo, "debounce_cumprido");
  assert.equal(rs[3]!.identidade, identidadeDaCausa(A));
  assert.equal(rs[3]!.auditoria.debounce_decorrido_min, POLITICA_CANONICA.debounce_min);
  assert.equal(rs[3]!.entrou_min, 3);
  assert.equal(rs[3]!.retirada_prevista_min, 3 + POLITICA_CANONICA.max_foco_min);
});

teste("R5A-03 pressao que desaparece antes do debounce apaga o pendente", () => {
  const rs = sequencia([...manter(0, 1, [A]), { t: 2, candidatas: [] }]);
  assert.equal(ultimo(rs).modo, "calmo");
  assert.equal(ultimo(rs).motivo, "pendente_apagado");
  assert.equal(ultimo(rs).estado.pendente, null);
});

teste("R5A-04 causa que muda durante o debounce REINICIA o relogio", () => {
  const rs = sequencia([...manter(0, 1, [A]), ...manter(2, 4, [B])]);
  const naTroca = rs[2]!;
  assert.equal(naTroca.motivo, "debounce_reiniciado_por_troca_de_causa");
  assert.equal(naTroca.estado.pendente!.desde_min, 2, "o relogio nao reiniciou na troca");
  assert.notEqual(rs[4]!.modo, "foco", "B virou Foco com 2 minutos, herdando o tempo de A");
  const depois = sequencia([...manter(0, 1, [A]), ...manter(2, 5, [B])]);
  assert.equal(ultimo(depois).modo, "foco");
  assert.equal(ultimo(depois).identidade, identidadeDaCausa(B));
});

teste("R5A-05 a MESMA causa em leituras sucessivas nao reinicia nada", () => {
  const rs = sequencia(manter(0, 2, [A]));
  for (const r of rs) assert.equal(r.estado.pendente!.desde_min, 0);
  assert.equal(rs[2]!.motivo, "debounce_em_curso");
});

teste("R5A-06 causa secundaria NAO rouba o slot por oscilacao", () => {
  const maisSevera = { ...B, severidade: 9 };
  const rs = sequencia([...manter(0, 3, [A]), ...manter(4, 9, [A, maisSevera])]);
  assert.equal(rs[3]!.modo, "foco");
  for (const r of rs.slice(4)) {
    assert.equal(r.modo, "foco", "o Foco caiu com uma causa nova aparecendo");
    assert.equal(r.identidade, identidadeDaCausa(A), "uma causa mais severa roubou o slot");
  }
});

teste("R5A-07 precedencia: NAO existe preempcao, e isso e o comprovado", () => {
  // O motor so elege quando nao ha foco ativo (`motor.js:277`). Nenhuma excecao
  // de precedencia existe nas fontes, e a missao proibe inventar uma. Este teste
  // fixa a ausencia para que ela nao seja introduzida por acidente.
  const fonte = ler(FONTE_POLITICA);
  assert.match(
    fonte,
    /if \(foco === null && sustentado !== null && !repetido\)/,
    "a guarda de slot livre sumiu da eleicao",
  );
  assert.doesNotMatch(
    semComentarios(fonte),
    /preemp|substituiFoco|trocaDeFocoPorSeveridade/i,
    "apareceu preempcao, que nao existe nas fontes",
  );
});

/* ================================================================== *
 * 8-11 · COOLDOWN E TETO                                              *
 * ================================================================== */

teste("R5A-08 a retirada por teto grava a marcacao e inicia o cooldown", () => {
  const rs = sequencia(manter(0, 11, [A]));
  const retirada = ultimo(rs);
  assert.equal(retirada.motivo, "teto_de_foco_atingido");
  assert.equal(retirada.modo, "ambiente", "apos o teto o modo caiu para Calmo");
  assert.equal(retirada.estado.foco, null);
  assert.equal(retirada.estado.marcada_em_min[identidadeDaCausa(A)], 11);
  assert.ok(
    retirada.cooldown.em_vigor.some((c) => c.identidade === identidadeDaCausa(A)),
    "a causa retirada nao entrou em cooldown",
  );
});

teste("R5A-09 a mesma causa nao volta durante o cooldown", () => {
  const rs = sequencia(manter(0, 20, [A]));
  const depoisDoTeto = rs.slice(12);
  for (const r of depoisDoTeto) {
    assert.notEqual(r.modo, "foco", "a causa voltou dentro do cooldown");
  }
  assert.equal(ultimo(rs).motivo, "cooldown_em_vigor");
});

teste("R5A-10 a causa volta depois do cooldown, e a comparacao e ESTRITA", () => {
  const base = manter(0, 20, [A]);
  // marcada em 11; `t - 11 > 45` exige t >= 57. Em t = 56 ainda nao pode.
  const noLimite = sequencia([...base, { t: 56, candidatas: [A] }]);
  assert.notEqual(ultimo(noLimite).modo, "foco", "`>` virou `>=` no cooldown");
  const depois = sequencia([...base, { t: 56, candidatas: [A] }, { t: 57, candidatas: [A] }]);
  assert.equal(ultimo(depois).modo, "foco");
  assert.equal(ultimo(depois).motivo, "cooldown_vencido");
});

teste("R5A-11 o Foco alcanca a duracao maxima e nao a renova", () => {
  const rs = sequencia(manter(0, 10, [A]));
  const emFoco = rs.filter((r) => r.modo === "foco");
  assert.equal(emFoco.length, POLITICA_CANONICA.max_foco_min, "o teto nao foi respeitado");
  for (const r of emFoco) {
    assert.equal(r.retirada_prevista_min, 11, "o teto foi renovado durante o Foco");
    assert.equal(r.entrou_min, 3);
  }
  assert.equal(emFoco[emFoco.length - 1]!.ultima_confirmacao_min, 10);
});

/* ================================================================== *
 * 12-14 · OBSOLESCENCIA DE FONTE                                      *
 * ================================================================== */

teste("R5A-12 fonte obsoleta durante o Ambiente: degrada, nao promove", () => {
  const rs = sequencia(manter(0, 5, [A]).map((l) => ({ ...l, fontes: FONTES_STALE })));
  for (const r of rs) {
    assert.notEqual(r.modo, "foco", "promoveu a Foco com a fonte parada");
    assert.equal(r.obsolescencia.degradado, true);
    assert.deepEqual(r.obsolescencia.fontes_obsoletas, ["carga_pracas"]);
  }
  assert.equal(ultimo(rs).motivo, "fonte_obsoleta");
});

teste("R5A-13 fonte obsoleta durante o Foco preserva a ultima verdade conhecida", () => {
  const rs = sequencia([
    ...manter(0, 4, [A]),
    { t: 5, candidatas: [A], fontes: FONTES_STALE, idade: 12 },
  ]);
  const durante = ultimo(rs);
  assert.equal(durante.modo, "foco", "o Foco vivo foi apagado pela degradacao");
  assert.equal(durante.obsolescencia.degradado, true);
  assert.equal(durante.obsolescencia.idade_da_leitura_min, 12);
  // E a retirada por obsolescencia tem motivo proprio, distinto do fim da tensao.
  const somem = sequencia([
    ...manter(0, 4, [A]),
    { t: 5, candidatas: [], fontes: FONTES_STALE, idade: 12 },
  ]);
  assert.equal(ultimo(somem).motivo, "fonte_obsoleta");
  const acabou = sequencia([...manter(0, 4, [A]), { t: 5, candidatas: [] }]);
  assert.equal(ultimo(acabou).motivo, "causa_desapareceu");
});

teste("R5A-14 fonte obsoleta NUNCA vira Calmo e nunca vira verde", () => {
  const rs = sequencia([{ t: 0, candidatas: [], fontes: FONTES_STALE, idade: 30 }]);
  assert.notEqual(ultimo(rs).modo, "calmo", "fonte parada virou Calmo");
  assert.equal(ultimo(rs).modo, "ambiente");
  assert.equal(ultimo(rs).motivo, "fonte_obsoleta");
  assert.equal(ultimo(rs).obsolescencia.idade_da_leitura_min, 30);
  const parcial = sequencia([
    { t: 0, candidatas: [], fontes: [{ id: "x", estado: "parcial" }], idade: null },
  ]);
  assert.equal(ultimo(parcial).modo, "ambiente", "fonte parcial virou Calmo");
  assert.equal(
    ultimo(parcial).obsolescencia.idade_da_leitura_min,
    null,
    "idade nao observada virou zero",
  );
});

/* ================================================================== *
 * 15-19 · ORDEM, DETERMINISMO, SERIALIZACAO, REPLAY                   *
 * ================================================================== */

teste("R5A-15 carimbo repetido e IDEMPOTENTE", () => {
  const uma = sequencia(manter(0, 2, [A]));
  const repetida = sequencia([...manter(0, 2, [A]), { t: 2, candidatas: [A] }]);
  assert.deepEqual(ultimo(repetida).estado, ultimo(uma).estado, "reprocessar o minuto mudou o estado");
  assert.equal(ultimo(repetida).motivo, "carimbo_repetido");
  // E nao pode adiantar o debounce nem envelhecer o Foco.
  const noTeto = sequencia([...manter(0, 10, [A]), { t: 10, candidatas: [A] }]);
  assert.equal(ultimo(noTeto).modo, "foco", "o minuto repetido derrubou o Foco pelo teto");
});

teste("R5A-16 carimbo fora de ordem e REJEITADO, com motivo e estado intacto", () => {
  const antes = sequencia(manter(0, 4, [A]));
  const estado = ultimo(antes).estado;
  const r = elegerModo({
    estado,
    agora_min: 2,
    candidatas: [A],
    fontes: FONTES_SAS,
    idade_da_leitura_min: 0,
  });
  assert.equal(r.motivo, "carimbo_retrocedido");
  assert.deepEqual(r.estado, estado, "um carimbo retrocedido alterou o estado");
});

teste("R5A-17 serializar, reiniciar e restaurar continua a MESMA sequencia", () => {
  const continua = sequencia(manter(0, 11, [A]));
  const primeira = sequencia(manter(0, 5, [A]));
  // O "reinicio de processo": o estado atravessa texto e volta.
  const texto = serializar(ultimo(primeira).estado);
  assert.equal(typeof texto, "string");
  const restaurado = restaurar(texto);
  assert.deepEqual(restaurado, ultimo(primeira).estado, "a serializacao perdeu estado");
  const retomada = sequencia(manter(6, 11, [A]), restaurado);
  assert.deepEqual(
    ultimo(retomada).estado,
    ultimo(continua).estado,
    "a sequencia divergiu depois do reinicio",
  );
  assert.equal(ultimo(retomada).motivo, ultimo(continua).motivo);
});

teste("R5A-18 replay da mesma sequencia produz estado identico", () => {
  const roteiro = [
    ...manter(0, 3, [A]),
    ...manter(4, 6, [A, B]),
    { t: 7, candidatas: [B] },
    ...manter(8, 60, [A]),
  ];
  const um = sequencia(roteiro);
  const dois = sequencia(roteiro);
  assert.deepEqual(ultimo(dois).estado, ultimo(um).estado);
  assert.deepEqual(
    dois.map((r) => [r.modo, r.motivo, r.identidade]),
    um.map((r) => [r.modo, r.motivo, r.identidade]),
    "o replay divergiu em algum ponto da sequencia",
  );
});

teste("R5A-19 zero candidatas produz ausencia de Foco", () => {
  const rs = sequencia([{ t: 0, candidatas: [] }]);
  assert.equal(ultimo(rs).modo, "calmo");
  assert.equal(ultimo(rs).causa, null);
  assert.equal(ultimo(rs).identidade, null);
  assert.equal(ultimo(rs).motivo, "sem_candidato");
  assert.equal(ultimo(rs).orientacao_permitida, false);
});

/* ================================================================== *
 * 20-24 · C1, C3, IDENTIDADE E D29                                    *
 * ================================================================== */

teste("R5A-20 C1: Ambiente e Calmo NUNCA liberam orientacao", () => {
  const rs = sequencia(manter(0, 11, [A]));
  for (const r of rs) {
    assert.equal(
      r.orientacao_permitida,
      r.modo === "foco",
      `orientacao liberada fora do Foco (modo ${r.modo})`,
    );
  }
  assert.ok(rs.some((r) => r.modo === "ambiente"), "a sequencia nao passou por Ambiente");
  assert.ok(rs.some((r) => r.modo === "foco"), "a sequencia nao passou por Foco");
  // E nao existe outro caminho no codigo para liberar orientacao.
  const fonte = ler(FONTE_POLITICA);
  // So as ATRIBUICOES contam: a declaracao de tipo (`: boolean;`) nao e caminho.
  const atribuicoes = (fonte.match(/orientacao_permitida:\s*([^,\n]+)/g) ?? []).filter(
    (a) => !/boolean;?$/.test(a.trim()),
  );
  assert.equal(atribuicoes.length, 1, "orientacao_permitida ganhou mais de um caminho");
  assert.match(atribuicoes[0]!, /modo === "foco"/);
});

teste("R5A-21 o Foco produz no maximo UMA causa — e o tipo nao admite duas", () => {
  const rs = sequencia([...manter(0, 3, [A, { ...B, severidade: 9 }])]);
  const emFoco = ultimo(rs);
  assert.equal(emFoco.modo, "foco");
  assert.ok(!Array.isArray(emFoco.causa), "a causa eleita virou lista");
  assert.equal(emFoco.estado.foco !== null, true);
  assert.ok(!Array.isArray(emFoco.estado.foco), "o slot virou lista");
  const fonte = ler(FONTE_POLITICA);
  assert.match(fonte, /readonly foco: FocoAtivo \| null;/, "o slot deixou de ser zero-ou-um");
});

teste("R5A-22 trocar TEXTO nao reinicia a causa — o tipo nem conhece texto", () => {
  const fonte = ler(FONTE_POLITICA);
  const bloco = /export interface CausaCandidata \{[\s\S]*?\n\}/.exec(fonte)![0];
  for (const proibido of ["resumo", "orientacao", "alvo_rotulo", "detalhe", "titulo"]) {
    assert.doesNotMatch(
      bloco,
      new RegExp(`\\b${proibido}\\b`),
      `texto apresentado entrou na identidade da causa: ${proibido}`,
    );
  }
  // E a identidade e estavel sob qualquer variacao de campo nao-identificador.
  const outra = { ...A, evidencias: 99, severidade: 2 };
  assert.equal(identidadeDaCausa(outra), identidadeDaCausa(A));
  const rs = sequencia([
    { t: 0, candidatas: [A] },
    { t: 1, candidatas: [{ ...A, evidencias: 7 }] },
    { t: 2, candidatas: [{ ...A, evidencias: 1 }] },
    { t: 3, candidatas: [A] },
  ]);
  assert.equal(ultimo(rs).modo, "foco", "o debounce reiniciou sem a identidade mudar");
  for (const r of rs) assert.equal(r.estado.pendente!.desde_min, 0);
});

teste("R5A-23 troca REAL de identidade e auditavel", () => {
  const outraSubarea = causa("s5", 3, { subarea: "enrolados_quentes" });
  assert.notEqual(identidadeDaCausa(outraSubarea), identidadeDaCausa(A));
  const rs = sequencia([{ t: 0, candidatas: [A] }, { t: 1, candidatas: [outraSubarea] }]);
  assert.equal(ultimo(rs).motivo, "debounce_reiniciado_por_troca_de_causa");
  assert.equal(ultimo(rs).estado.pendente!.identidade, identidadeDaCausa(outraSubarea));
  assert.equal(ultimo(rs).estado.pendente!.desde_min, 1);
});

teste("R5A-24 sem `order_id` nao existe identidade de pedido — D29 de pe", () => {
  const semPedido = identidadeDaCausa(A);
  assert.equal(A.pedido_id, null);
  assert.match(semPedido, /\|-\|/, "a identidade sem pedido nao declara a ausencia");
  const comPedido = identidadeDaCausa(causa("s1", 3, { pedido_id: "B-201" }));
  assert.notEqual(comPedido, semPedido);
  assert.match(comPedido, /\|B-201\|/);
  const fonte = ler(FONTE_POLITICA);
  assert.doesNotMatch(
    fonte,
    /pedido_id\s*(\?\?|\|\|)\s*["'`]/,
    "a politica fabrica identidade de pedido quando ela falta",
  );
});

/* ================================================================== *
 * ESTRUTURA: relogio, pureza, C3 e congelamento visual                *
 * ================================================================== */

teste("R5A-25 o relogio e INJETADO: a politica nao le relogio global", () => {
  const fonte = ler(FONTE_POLITICA).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const global of ["Date.now(", "new Date(", "performance.now(", "Math.random("]) {
    assert.ok(
      !fonte.includes(global),
      `a politica passou a ler estado global: ${global}`,
    );
  }
  assert.match(fonte, /agora_min: number/, "o instante deixou de entrar pela entrada");
});

teste("R5A-26 o estado e serializavel: sem classe, sem Map, sem Date", () => {
  const fonte = ler(FONTE_POLITICA).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["class ", "new Map", "new Set", ": Date"]) {
    assert.ok(!fonte.includes(proibido), `o estado deixou de ser JSON puro: ${proibido}`);
  }
  const rs = sequencia(manter(0, 5, [A]));
  const estado = ultimo(rs).estado;
  assert.deepEqual(JSON.parse(JSON.stringify(estado)), estado, "o estado nao sobrevive a JSON");
});

teste("R5A-27 C3: a politica e a dona, e o view model apenas consome", () => {
  const vm = ler("src/product/viewmodels/home-vm.ts");
  // O view model consome o resultado.
  assert.match(vm, /temporal !== undefined\s*\?\s*temporal\.modo/, "a view model deixou de consumir");
  // E nao possui estado temporal proprio.
  // Sondas de IDENTIFICADOR. "pendente" sozinho seria sonda ruim: `integracao_pendente`
  // e um estado legitimo de fonte na propria home, e reprovaria por homonimia.
  for (const proibido of [
    "debounce",
    "cooldown",
    "MAXFOCUS",
    "firedAt",
    "marcada_em",
    "EstadoTemporal",
  ]) {
    assert.doesNotMatch(
      semComentarios(vm),
      new RegExp(proibido, "i"),
      `estado temporal vazou para o view model: ${proibido}`,
    );
  }
  // A politica nao mora na interface.
  for (const visual of ["src/product/ui/surfaces/home.js", "src/product/ui/surfaces/home.css"]) {
    assert.doesNotMatch(ler(visual), /politica-temporal|elegerModo/, `a politica vazou para ${visual}`);
  }
});

teste("R5A-28 os quatro parametros sao os COMPROVADOS no motor, em minutos", () => {
  const motor = ler("src/perfil-delivery/motor.js");
  const floors = /const FLOORS = \{([\s\S]*?)\};/.exec(motor)![1]!;
  const valor = (n: string): number => Number(new RegExp(`${n}:\\s*(\\d+)`).exec(floors)![1]);
  assert.equal(POLITICA_CANONICA.debounce_min, valor("DEBOUNCE"));
  assert.equal(POLITICA_CANONICA.cooldown_min, valor("COOLDOWN"));
  assert.equal(POLITICA_CANONICA.max_foco_min, valor("MAXFOCUS"));
  // STALE NAO entra como limiar de frescor: no motor ele e teto de plausibilidade
  // da espera observada de um pedido. Confundir os dois inventaria uma regra.
  const contrato = ler("docs/product/CONTRATO_TEMPORAL_ATENCAO.md");
  assert.match(contrato, /`STALE`\s*\|\s*\*\*120 min\*\*\s*\|\s*\*\*NÃO é frescor de fonte\*\*/);
  const politica = ler(FONTE_POLITICA);
  assert.doesNotMatch(politica, /stale_min|frescor_min|staleness_min/, "um limiar de frescor foi inventado");
  assert.match(contrato, /Unidade: minutos/i, "o contrato perdeu a unidade comprovada");
});

teste("R5A-29 os motores continuam desconectados — D43 de pe", () => {
  const politica = ler(FONTE_POLITICA);
  for (const proibido of ["decisao", "shadow", "conference", "copiloto"]) {
    assert.doesNotMatch(
      politica.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
      new RegExp(proibido, "i"),
      `a politica temporal encostou em ${proibido} (R5-B/C/D)`,
    );
  }
  assert.doesNotMatch(politica, /import .*perfil-delivery/, "a politica importou o motor original");
});

teste("R5A-30 congelamento visual: diff vazio nos arquivos congelados", () => {
  // O ponto fixo e o HEAD do inicio de R5-A. Este pino existe ENQUANTO o
  // congelamento vigorar; levanta-lo e decisao, nunca efeito colateral.
  const BASE = "4365c61";
  const CONGELADOS = [
    "src/product/ui/surfaces/home.js",
    "src/product/ui/surfaces/home.css",
    "src/product/ui/tokens/organismo-tokens.css",
    "src/product/viewmodels/sinais.ts",
    "src/product/viewmodels/areas.ts",
  ];
  const saida = execFileSync("git", ["diff", "--name-only", BASE, "--", ...CONGELADOS], {
    cwd: raiz,
    encoding: "utf8",
  }).trim();
  assert.equal(saida, "", `arquivo visual congelado foi alterado:\n${saida}`);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  console.log(`\nR5-A — politica temporal da atencao: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5A_TEMPORAL_GATE_GREEN");
});
