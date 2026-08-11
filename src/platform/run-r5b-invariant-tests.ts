/**
 * GATE R5-B — INVARIANTES I1 a I10, EXECUTAVEIS
 * ============================================================================
 * O contrato da consciencia (`docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md` §6)
 * lista dez invariantes e diz, em letra propria: "Nenhuma destas foi testada
 * ainda." Este gate as torna executaveis.
 *
 * A REGRA DE QUALIDADE QUE GOVERNA CADA GUARDA AQUI:
 *
 *   Comentario, nome de variavel ou presenca de uma palavra NAO constitui prova
 *   de invariante. O gate verifica COMPORTAMENTO, estrutura executavel ou
 *   contrato de tipo real.
 *
 * Por isso I1 e I2 rodam o motor original de verdade, num harness isolado
 * (`require("../perfil-delivery/decisao.js")`), com situacoes construidas — e
 * nao procuram `dentroDoEscopo` por regex. Neutralizar a funcao muda o VALOR que
 * `decidir()` devolve, e e o valor que o teste examina.
 *
 * Cada invariante tem prova POSITIVA (a garantia vale quando deve) e NEGATIVA
 * (a garantia recusa quando deve). Sem o par, uma guarda passa com o cano
 * entupido: um `null` devolvido por defeito e indistinguivel de um `null`
 * devolvido por recusa deliberada.
 *
 * O QUE ESTE GATE NAO FAZ: nao conecta o motor ao Shadow, nao implementa
 * traducao, nao cria flag, nao ativa runtime, nao emite recomendacao. D43 de pe.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ESTADO_INICIAL,
  elegerModo,
  identidadeDaCausa,
  type CausaCandidata,
  type EstadoTemporal,
  type ResultadoDaEleicao,
} from "../product/atencao/politica-temporal";
import { homeVM } from "../product/viewmodels/home-vm";
import { AMBIENTES } from "../product/viewmodels/areas";
import {
  cenaAmbiente,
  cenaCalmo,
  cenaDegradado,
  cenaFoco,
} from "../product/demo/seed-home-demonstracao";

/**
 * FIM DO INTERVALO HISTORICO CERTIFICADO — M1A.1, decisao D-M1A1-10.
 *
 * O baseline do congelamento NAO mudou. O que entrou foi o SEGUNDO commit: sem
 * ele, `git diff <base> -- <paths>` comparava com a arvore ATUAL — intervalo
 * aberto a direita, que nunca fecha. A prova historica so continuava verde
 * enquanto o futuro nao existisse. Medido em M1A.1: UMA linha autorizada em
 * `home.css` deixava os DEZ gates de congelamento vermelhos de uma vez.
 *
 * Este e o ultimo commit em que a propriedade congelada foi verificada verde, e
 * tambem o baseline de M1. Trabalho autorizado depois dele e governado por
 * `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md`, nao por esta asercao.
 *
 * Uma prova historica protege o passado. Ela nao congela o futuro autorizado.
 * Controle antifalso-positivo: `run-m1-bridge-tests.ts`, familia C, que le os
 * caminhos DESTE arquivo — os dois nao podem divergir em silencio.
 */
const FIM_HISTORICO = "f87a36dfd39c9989344f0fed6ebf8db5db1a8c35";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Os artefatos cuja mutacao este gate precisa provar que EXECUTOU. */
const ARTEFATOS = [
  "src/perfil-delivery/decisao.js",
  "src/product/atencao/politica-temporal.ts",
  "src/product/viewmodels/home-vm.ts",
  
  "src/product/viewmodels/areas.ts",
] as const;

let passed = 0;
const failures: string[] = [];
const linhas: { inv: string; teste: string; resultado: string }[] = [];
function teste(inv: string, nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    linhas.push({ inv, teste: nome, resultado: "OK" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${inv} ${nome}: ${msg}`);
    linhas.push({ inv, teste: nome, resultado: "FALHOU" });
  }
}

/* ------------------------------------------------------------------ *
 * HARNESS ISOLADO DO MOTOR ORIGINAL                                   *
 * ------------------------------------------------------------------ *
 * Carrega `decisao.js` de verdade. Nada aqui conecta o motor a coisa
 * alguma: o harness monta a fotografia do minuto na mao, chama `decidir`
 * e inspeciona o retorno. E leitura de comportamento, nao integracao.   */

interface Situacao {
  readonly kind: string;
  readonly key: string;
  readonly praca?: string;
  readonly id?: string;
  readonly sev: number;
  readonly n?: number;
  readonly unblock?: number;
}
interface AcaoCandidata {
  readonly tipo: string;
  readonly praca?: string;
  readonly id?: string;
  readonly acao: string;
  readonly score: number;
}
type Decidir = (
  snap: { sits: readonly Situacao[]; ctx: { wE: unknown[]; wP: unknown[]; load: object } },
  INFO: object,
  opts: { active: { key: string; sit: Situacao } | null },
) => AcaoCandidata | null;

const requireCJS = createRequire(join(raiz, "package.json"));
const DECISAO = requireCJS("./src/perfil-delivery/decisao.js") as { decidir: Decidir };

const sitPraca = (praca: string, sev: number, n: number, unblock: number): Situacao => ({
  kind: "praca",
  key: `praca:${praca}`,
  praca,
  sev,
  n,
  unblock,
});
/** Uma causa de outra especie: conferencia de um pedido. */
const sitConferencia = (id: string): Situacao => ({
  kind: "conferencia",
  key: `conf:${id}`,
  id,
  sev: 2,
});

const snapDe = (sits: readonly Situacao[]) => ({
  sits,
  ctx: { wE: [], wP: [], load: {} },
});

/** A causa fraca fica no foco; a forte fica FORA do escopo, e pontua mais. */
const FRACA = sitPraca("combinados", 2, 3, 0);
const FORTE = sitPraca("enrolados", 3, 9, 6);

/* ================================================================== *
 * I1 — "A ação nunca troca a causa raiz do foco"                      *
 * Dono: motor original (`dentroDoEscopo`, decisao.js:46/175)          *
 * ================================================================== */

teste("I1", "positiva: com foco ativo, a acao eleita e da MESMA causa raiz", () => {
  const r = DECISAO.decidir(snapDe([FRACA, FORTE]), {}, {
    active: { key: FRACA.key, sit: FRACA },
  });
  assert.notEqual(r, null, "o motor nao devolveu acao para uma causa que tem candidato");
  assert.equal(r!.tipo, "priorizar_praca");
  assert.equal(
    r!.praca,
    "combinados",
    "a acao eleita pertence a OUTRA causa raiz — o escopo foi ignorado",
  );
});

teste("I1", "negativa: sem foco ativo, a mais forte vence — o escopo e o que muda", () => {
  // O par que da sentido ao teste positivo. Se `enrolados` nunca vencesse, o
  // teste acima passaria com um motor que so sabe devolver `combinados`.
  const r = DECISAO.decidir(snapDe([FRACA, FORTE]), {}, { active: null });
  assert.notEqual(r, null);
  assert.equal(
    r!.praca,
    "enrolados",
    "sem foco ativo a mais forte deveria vencer; o teste positivo nao prova nada",
  );
});

teste("I1", "a identidade da causa nao muda por texto semelhante", () => {
  const base: CausaCandidata = {
    codigo: "s5",
    severidade: 3,
    ambiente: "sushi",
    subarea: "enrolados_quentes",
    pedido_id: null,
    fonte_id: "carga_pracas",
    evidencias: 2,
  };
  const mesmaCausaOutroTexto: CausaCandidata = { ...base, evidencias: 9, severidade: 2 };
  assert.equal(identidadeDaCausa(mesmaCausaOutroTexto), identidadeDaCausa(base));
  const outraCausa: CausaCandidata = { ...base, subarea: "combinados" };
  assert.notEqual(identidadeDaCausa(outraCausa), identidadeDaCausa(base));
});

/* ================================================================== *
 * I2 — "Sem candidato no escopo, sai foco puro (nunca ação de outra causa)"
 * Dono: motor original (`elegiveis.length === 0` → null)              *
 * ================================================================== */

teste("I2", "positiva: foco sem candidato compativel devolve FOCO PURO (null)", () => {
  // Foco de conferencia; as unicas situacoes geram `priorizar_praca`, que
  // `dentroDoEscopo` recusa para `kind: "conferencia"`.
  const alvo = sitConferencia("C-301");
  const r = DECISAO.decidir(snapDe([FRACA, FORTE]), {}, {
    active: { key: alvo.key, sit: alvo },
  });
  assert.equal(r, null, "sem candidato no escopo o motor produziu acao de OUTRA causa");
});

teste("I2", "negativa: o mesmo snapshot COM candidato no escopo devolve acao", () => {
  // Sem este par, o `null` acima seria indistinguivel de um motor quebrado.
  const r = DECISAO.decidir(snapDe([FRACA, FORTE]), {}, {
    active: { key: FORTE.key, sit: FORTE },
  });
  assert.notEqual(r, null, "o motor devolve null tambem quando HA candidato: cano entupido");
  assert.equal(r!.praca, "enrolados");
});

teste("I2", "ausencia nao vira acao generica, motivacional nem execucao", () => {
  const alvo = sitConferencia("C-301");
  const r = DECISAO.decidir(snapDe([FRACA]), {}, { active: { key: alvo.key, sit: alvo } });
  assert.equal(r, null);
  // E o caminho de ausencia da propria superficie: foco puro nao inventa acao.
  const vm = homeVM(cenaCalmo(), { tipo: "demonstracao", motivo: "cena estatica de fixture" });
  assert.equal(vm.foco, null, "Calmo produziu foco");
});

/* ================================================================== *
 * I3 — "Calmo devolve `null` de orientação"                           *
 * Dono: politica temporal + view model                                *
 * ================================================================== */

const demo = { tipo: "demonstracao", motivo: "cena estatica de fixture" } as const;

teste("I3", "positiva: em Calmo nao existe orientacao, nem no dominio nem na tela", () => {
  const vm = homeVM(cenaCalmo(), demo);
  assert.equal(vm.modo, "calmo");
  assert.equal(vm.foco, null, "Calmo carregou foco");
  const r = elegerModo({
    estado: ESTADO_INICIAL,
    agora_min: 0,
    candidatas: [],
    fontes: [{ id: "x", estado: "saudavel" }],
    idade_da_leitura_min: 0,
  });
  assert.equal(r.modo, "calmo");
  assert.equal(r.orientacao_permitida, false, "Calmo liberou orientacao no dominio");
  assert.equal(r.causa, null);
});

teste("I3", "negativa: o Foco EXISTE e carrega orientacao — Calmo nao e o unico modo", () => {
  const vm = homeVM(cenaFoco(), demo);
  assert.equal(vm.modo, "foco");
  assert.notEqual(vm.foco, null);
  assert.notEqual(vm.foco!.orientacao, null, "nenhuma cena produz orientacao: o par nao existe");
});

teste("I3", "Calmo nao e inferido de fonte indisponivel, e ausencia nao vira zero", () => {
  const deg = homeVM(cenaDegradado(), demo);
  assert.ok(deg.selos.length > 0);
  // O pulso de uma leitura sem fonte de pedido e AUSENTE, nunca 0.
  const semFonte = homeVM(
    { ...cenaCalmo(), pedidos: [], fontes: cenaCalmo().fontes.map((f) => ({ ...f, estado: "indisponivel" as const })) },
    demo,
  );
  assert.equal(semFonte.pulso.observado, false, "ausencia de fonte virou pulso observado");
  // E no dominio: fonte obsoleta nunca produz Calmo.
  const r = elegerModo({
    estado: ESTADO_INICIAL,
    agora_min: 0,
    candidatas: [],
    fontes: [{ id: "x", estado: "stale" }],
    idade_da_leitura_min: 30,
  });
  assert.notEqual(r.modo, "calmo", "fonte obsoleta virou Calmo");
});

/* ================================================================== *
 * I4 — "Ambiente nunca carrega bloco de ação" (C1)                    *
 * Dono: view model (estrutura) + politica temporal (tipo)             *
 * ================================================================== */

teste("I4", "positiva: em Ambiente nao existe caminho estrutural ate a orientacao", () => {
  const vm = homeVM(cenaAmbiente(), demo);
  assert.equal(vm.modo, "ambiente");
  // A orientacao e campo de `foco`. Sem foco, nao existe onde ela caiba.
  assert.equal(vm.foco, null, "Ambiente carregou foco, e com ele a orientacao");
  const json = JSON.stringify(vm);
  assert.ok(!/"orientacao":\{/.test(json), "uma orientacao apareceu no Ambiente");
});

teste("I4", "negativa: o mesmo caminho ENTREGA orientacao quando o modo e Foco", () => {
  const vm = homeVM(cenaFoco(), demo);
  assert.match(JSON.stringify(vm), /"orientacao":\{/, "nenhuma cena entrega orientacao");
});

teste("I4", "no dominio, orientacao_permitida so e verdadeira no Foco", () => {
  const A: CausaCandidata = {
    codigo: "s5",
    severidade: 3,
    ambiente: "sushi",
    subarea: null,
    pedido_id: null,
    fonte_id: "carga_pracas",
    evidencias: 2,
  };
  let estado: EstadoTemporal = ESTADO_INICIAL;
  const vistos = new Set<string>();
  for (let t = 0; t <= 4; t += 1) {
    const r: ResultadoDaEleicao = elegerModo({
      estado,
      agora_min: t,
      candidatas: [A],
      fontes: [{ id: "carga_pracas", estado: "saudavel" }],
      idade_da_leitura_min: 0,
    });
    estado = r.estado;
    vistos.add(r.modo);
    assert.equal(
      r.orientacao_permitida,
      r.modo === "foco",
      `orientacao liberada fora do Foco (modo ${r.modo})`,
    );
  }
  assert.ok(vistos.has("ambiente") && vistos.has("foco"), "a sequencia nao cobriu os dois modos");
});

/* ================================================================== *
 * I5 — "Um ambiente vermelho nunca fica oculto"                       *
 * Dono: view model / sinais                                           *
 * ================================================================== */

teste("I5", "positiva: duas areas pressionadas continuam AMBAS visiveis", () => {
  const vm = homeVM(cenaAmbiente(), demo);
  const pressionadas = vm.ambientes.filter((a) => a.cor === "amarelo" || a.cor === "vermelho");
  assert.ok(pressionadas.length >= 2, `esperava 2+ areas pressionadas, veio ${pressionadas.length}`);
  // E no Foco, as demais nao somem.
  const foco = homeVM(cenaFoco(), demo);
  const outras = foco.ambientes.filter((a) => a.cor === "amarelo" || a.cor === "vermelho");
  assert.ok(outras.length >= 2, "o Foco escondeu as demais pressoes");
  assert.equal(foco.ambientes.length, AMBIENTES.length, "uma area sumiu da superficie");
});

teste("I5", "negativa: uma operacao calma NAO pinta areas — o teste distingue", () => {
  const vm = homeVM(cenaCalmo(), demo);
  const pressionadas = vm.ambientes.filter((a) => a.cor === "amarelo" || a.cor === "vermelho");
  assert.equal(pressionadas.length, 0, "Calmo apareceu com area pressionada");
  assert.equal(vm.ambientes.length, AMBIENTES.length);
});

/* ================================================================== *
 * I6 — "Área sem fonte nunca aparece verde"                           *
 * Dono: `areas.ts` (contrato) + view model                            *
 * ================================================================== */

teste("I6", "positiva: Caixa e Conferencia sem dado nunca aparecem saudaveis", () => {
  for (const cena of [cenaCalmo(), cenaAmbiente(), cenaFoco(), cenaDegradado()]) {
    const vm = homeVM(cena, demo);
    const caixa = vm.ambientes.find((a) => a.id === "caixa")!;
    // O texto canonico e "nunca aparece VERDE". Exigir sempre `sem_medicao`
    // seria inventar uma regra: um sinal pode apontar para a Caixa e deixa-la em
    // amarelo sem que ninguem tenha afirmado saude. O que nao pode existir e o
    // verde por ausencia de dado.
    assert.notEqual(caixa.cor, "verde", "a Caixa apareceu verde sem fonte");
    assert.equal(caixa.medicao, "sem_medicao_automatica");
    assert.ok(caixa.motivo.length > 0, "ausencia sem motivo vira normalidade");
    assert.equal(caixa.pressao.observado, false, "area sem fonte afirmou pressao medida");
  }
});

teste("I6", "negativa: uma area COM fonte aparece saudavel quando esta calma", () => {
  const vm = homeVM(cenaCalmo(), demo);
  const comFonte = vm.ambientes.filter((a) => a.cor === "verde");
  assert.ok(comFonte.length > 0, "nenhuma area fica verde: o teste positivo nao prova nada");
  for (const a of comFonte) {
    assert.notEqual(a.medicao, "sem_medicao_automatica", "area sem medicao ficou verde");
  }
});

/* ================================================================== *
 * I7 — "Exclusividade de slot: nunca dois focos"                      *
 * Dono: politica temporal (R5-A)                                      *
 * ================================================================== */

const causa = (codigo: string, sev: number, amb: CausaCandidata["ambiente"]): CausaCandidata => ({
  codigo,
  severidade: sev,
  ambiente: amb,
  subarea: null,
  pedido_id: null,
  fonte_id: "carga_pracas",
  evidencias: 2,
});

teste("I7", "positiva: duas situacoes severas produzem UM unico Foco, e ele nao troca", () => {
  const A = causa("s5", 3, "sushi");
  const B = causa("s1", 9, "motoboy");
  let estado: EstadoTemporal = ESTADO_INICIAL;
  const eleitos: (string | null)[] = [];
  for (let t = 0; t <= 9; t += 1) {
    const r = elegerModo({
      estado,
      agora_min: t,
      candidatas: t < 4 ? [A] : [A, B],
      fontes: [{ id: "carga_pracas", estado: "saudavel" }],
      idade_da_leitura_min: 0,
    });
    estado = r.estado;
    eleitos.push(r.modo === "foco" ? r.identidade : null);
    assert.ok(!Array.isArray(r.causa), "a causa eleita virou lista");
  }
  const distintos = new Set(eleitos.filter((x) => x !== null));
  assert.equal(distintos.size, 1, `dois focos distintos na mesma janela: ${[...distintos]}`);
  assert.equal([...distintos][0], identidadeDaCausa(A), "a causa mais severa roubou o slot");
});

teste("I7", "negativa: o slot LIBERA e aceita outra causa depois — nao esta travado", () => {
  const A = causa("s5", 3, "sushi");
  const B = causa("s1", 3, "motoboy");
  let estado: EstadoTemporal = ESTADO_INICIAL;
  let ultimo = "";
  for (let t = 0; t <= 20; t += 1) {
    const r = elegerModo({
      estado,
      agora_min: t,
      candidatas: t <= 11 ? [A] : [B],
      fontes: [{ id: "carga_pracas", estado: "saudavel" }],
      idade_da_leitura_min: 0,
    });
    estado = r.estado;
    if (r.modo === "foco") ultimo = r.identidade!;
  }
  assert.equal(ultimo, identidadeDaCausa(B), "o slot ficou preso na primeira causa para sempre");
});

/* ================================================================== *
 * I8 — "Nenhuma orientação executa ação"                              *
 * Dono: view model + Shadow                                           *
 * ================================================================== */

teste("I8", "positiva: a orientacao do Foco declara que NAO executa", () => {
  const vm = homeVM(cenaFoco(), demo);
  const o = vm.foco!.orientacao!;
  assert.equal(o.executa, false, "a orientacao passou a declarar execucao");
  assert.equal(typeof o.executa, "boolean");
});

teste("I8", "positiva: o Shadow nao tem estado `executed` e exige humano", () => {
  const shadow = ler("src/platform/copiloto/shadow.ts");
  // Contrato de TIPO, verificado na uniao de estados — nao por busca de palavra.
  const uniao = /export type RecommendationStatus =([\s\S]*?);/.exec(shadow);
  assert.ok(uniao, "o Shadow perdeu a uniao de estados do ciclo de vida");
  assert.doesNotMatch(uniao[1]!, /"executed"/, "o estado `executed` apareceu no Shadow");
  assert.match(shadow, /requires_human:\s*true/, "o Shadow parou de exigir humano");
});

teste("I8", "negativa: a superficie tem controle de NAVEGACAO — a ausencia e de EXECUCAO", () => {
  // Sem este par, I8 passaria numa home sem nenhum controle, o que provaria
  // apenas que a tela e inerte, e nao que a ACAO foi recusada.
  const html = ler("src/product/ui/surfaces/home.js");
  assert.match(html, /org-aprox__voltar|href=/, "a home nao tem nem navegacao: o par nao existe");
  assert.doesNotMatch(html, /<button(?![^>]*inspetor)/, "a home ganhou um botao de acao");
  assert.doesNotMatch(html, /<form|<input/, "a home ganhou entrada de dados");
});

/* ================================================================== *
 * I9 — "Confiança sem evidência não é apresentada"                    *
 * Dono: view model / `estados.ts`                                     *
 * ================================================================== */

teste("I9", "positiva: toda confianca apresentada vem acompanhada de evidencia", () => {
  const vm = homeVM(cenaFoco(), demo);
  const o = vm.foco!.orientacao!;
  if (o.confianca.observado) {
    assert.ok(vm.foco!.evidencias.length > 0, "confianca observada sem uma unica evidencia");
  }
  // E o sinal de segundo plano tambem sustenta o que afirma.
  for (const s of vm.sinais_em_segundo_plano) {
    assert.ok(s.evidencias.length > 0, `sinal ${s.codigo} chega a tela sem evidencia`);
  }
});

teste("I9", "negativa: confianca AUSENTE se declara ausente, e nao vira zero", () => {
  const vm = homeVM(cenaDegradado(), demo);
  const campos = [vm.pulso, ...vm.ambientes.map((a) => a.pressao)];
  const ausentes = campos.filter((c) => c.observado === false);
  assert.ok(ausentes.length > 0, "nenhum campo ausente na cena degradada: o par nao existe");
  for (const c of ausentes) {
    assert.ok(!("valor" in (c as object)), "campo ausente carregou valor — ausencia virou numero");
  }
});

/* ================================================================== *
 * I10 — "Procedência declarada em toda orientação"                    *
 * Dono: view model                                                    *
 * ================================================================== */

teste("I10", "positiva: a orientacao declara procedencia, e ela e distinguivel", () => {
  const vm = homeVM(cenaFoco(), demo);
  const o = vm.foco!.orientacao!;
  assert.ok(
    ["real", "simulado", "controle", "demonstracao"].includes(o.procedencia),
    `procedencia fora do vocabulario: ${o.procedencia}`,
  );
  assert.equal(vm.demonstracao, true);
  assert.notEqual(o.procedencia, "real", "uma cena de fixture declarou procedencia real");
});

teste("I10", "negativa: uma leitura REAL produz procedencia real — os dois lados existem", () => {
  const vm = homeVM(
    { ...cenaFoco(), procedencia: "real" },
    { tipo: "real", temporal: { modo: "foco", orientacao_permitida: true } },
  );
  assert.equal(vm.demonstracao, false);
  assert.equal(vm.foco!.orientacao!.procedencia, "real");
});

/* ================================================================== *
 * D29 — identidade de pedido nao se fabrica                           *
 * ================================================================== */

teste("D29", "sem `order_id` real nao existe identidade de pedido", () => {
  const semPedido = causa("s5", 3, "sushi");
  assert.equal(semPedido.pedido_id, null);
  const id = identidadeDaCausa(semPedido);
  assert.match(id, /\|-\|/, "a identidade sem pedido nao declara a ausencia");
  const politica = ler("src/product/atencao/politica-temporal.ts");
  // Nenhum substituto improvisado pode ocupar o lugar do identificador.
  for (const improviso of [
    /pedido_id\s*(\?\?|\|\|)\s*["'`]/,
    /pedido_id\s*(\?\?|\|\|)\s*String\(/,
    /pedido_id\s*(\?\?|\|\|)\s*(indice|index|posicao|hash)/i,
  ]) {
    assert.doesNotMatch(politica, improviso, "a identidade de pedido foi fabricada");
  }
  const comPedido = { ...semPedido, pedido_id: "B-201" };
  assert.notEqual(identidadeDaCausa(comPedido), id);
});

/* ================================================================== *
 * BYPASS DA POLITICA TEMPORAL                                         *
 * ================================================================== */

teste("BYPASS", "uma leitura REAL nao consegue omitir a eleicao temporal", () => {
  const real = { ...cenaFoco(), procedencia: "real" as const };
  // Omissao total.
  assert.throws(() => homeVM(real), /sem eleicao temporal/i, "chamador real pulou a politica");
  // Disfarce de demonstracao.
  assert.throws(
    () => homeVM(real, { tipo: "demonstracao", motivo: "quero pular" }),
    /sem eleicao temporal/i,
    "chamador real passou pela porta de demonstracao",
  );
  // O caminho legitimo funciona.
  const ok = homeVM(real, { tipo: "real", temporal: { modo: "ambiente", orientacao_permitida: false } });
  assert.equal(ok.modo, "ambiente", "a view model ignorou a eleicao temporal fornecida");
});

teste("BYPASS", "a demonstracao precisa DIZER por que pode pular a politica", () => {
  // `motivo` e obrigatorio no tipo: uma demonstracao sem justificativa nao
  // compila. Aqui a prova e de comportamento: a fixture segue funcionando.
  const vm = homeVM(cenaAmbiente(), demo);
  assert.equal(vm.modo, "ambiente");
  const vmTemporal = homeVM(cenaAmbiente(), {
    tipo: "real",
    temporal: { modo: "calmo", orientacao_permitida: false },
  });
  assert.equal(vmTemporal.modo, "calmo", "a eleicao temporal nao venceu a severidade instantanea");
});

/* ================================================================== *
 * CONGELAMENTO VISUAL                                                 *
 * ================================================================== */

teste("VISUAL", "diff vazio nos ativos congelados desde bd1ad55", () => {
  const BASE = "bd1ad55";
  const CONGELADOS = [
    "src/product/ui/surfaces/home.css",
    "src/product/ui/tokens/",
    "src/product/viewmodels/areas.ts",
    "docs/figma/",
  ];
  const saida = execFileSync("git", ["diff", "--name-only", BASE, FIM_HISTORICO, "--", ...CONGELADOS], {
    cwd: raiz,
    encoding: "utf8",
  }).trim();
  assert.equal(saida, "", `ativo visual congelado foi alterado:\n${saida}`);
});

teste("VISUAL", "os motores continuam desconectados — D43 de pe", () => {
  const politica = ler("src/product/atencao/politica-temporal.ts");
  const vm = ler("src/product/viewmodels/home-vm.ts");
  const semComentario = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // Sondar IMPORT, nunca a palavra: `rota: "/conference-brain"` e navegacao, e a
  // primeira versao desta guarda reprovou por causa dela. Presenca textual nao
  // prova codigo — e a licao que esta missao existe para aplicar.
  const imports = (fonte: string): string[] =>
    [...semComentario(fonte).matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g)].map(
      (m) => m[1]!,
    );
  for (const alvo of [politica, vm]) {
    for (const especificador of imports(alvo)) {
      for (const proibido of ["perfil-delivery", "copiloto/shadow", "conference-brain"]) {
        assert.ok(
          !especificador.includes(proibido),
          `um modulo de produto importou ${proibido} (R5-C/D): ${especificador}`,
        );
      }
    }
  }
  assert.ok(imports(vm).length > 0, "a sonda de import nao encontrou import nenhum");
});

/* ================================================================== */

void Promise.resolve().then(() => {
  // Prova de que o gate executou ESTES artefatos, e nao uma copia limpa.
  // O harness de mutacao compara estas marcas com as do original.
  const marcas = Object.fromEntries(ARTEFATOS.map((a) => [a, sha(ler(a)).slice(0, 16)]));
  console.log(`\nARTEFATOS ${JSON.stringify(marcas)}`);
  console.log("\n| Invariante | Teste | Resultado |");
  console.log("|---|---|---|");
  for (const l of linhas) console.log(`| ${l.inv} | ${l.teste} | ${l.resultado} |`);
  console.log(`\nR5-B — invariantes I1 a I10: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5B_INVARIANTS_GATE_GREEN");
});
