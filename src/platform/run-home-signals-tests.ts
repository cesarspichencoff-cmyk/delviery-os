/**
 * R2 + R4 — gate da home operacional e dos sinais sustentados.
 * ============================================================================
 * METODO herdado do 4B5 e da Unidade 6: toda afirmacao de ZERO vem em par com um
 * controle positivo pela MESMA cadeia. "Nenhuma orientacao executa" e
 * indistinguivel de "a home nao renderizou" sem o par que exige que UMA
 * orientacao exista e continue nao executando.
 *
 * O que este gate protege, em uma frase: que a home nunca seja o lugar onde a
 * ausencia vira normalidade, onde a Cozinha vira Sushi Quentes, ou onde uma
 * fixture passa por operacao real.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";

import { homeVM, type HomeVM } from "../product/viewmodels/home-vm";
import {
  CODIGOS_IMPLEMENTADOS,
  SINAIS_INDISPONIVEIS,
  sinaisDe,
  type LeituraOperacional,
} from "../product/viewmodels/sinais";
import {
  cena,
  cenaCalmo,
  cenaFoco,
  CENAS,
} from "../product/demo/seed-home-demonstracao";
import { AMBIENTES, subareasDe } from "../product/viewmodels/areas";
import { MODULOS } from "../product/viewmodels/modulos";
import { criarServidor } from "../../tools/product_system_server";

let passed = 0;
const failures: string[] = [];
const pend: Promise<void>[] = [];
function teste(nome: string, fn: () => Promise<void> | void): void {
  pend.push(
    Promise.resolve()
      .then(fn)
      .then(
        () => {
          passed += 1;
        },
        (e: unknown) => {
          failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
        },
      ),
  );
}

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");

const CALMO = homeVM(cena("calmo"));
const AMBIENTE = homeVM(cena("ambiente"));
const FOCO = homeVM(cena("foco"));
const DEGRADADO = homeVM(cena("degradado"));
const TODAS: [string, HomeVM][] = [
  ["calmo", CALMO],
  ["ambiente", AMBIENTE],
  ["foco", FOCO],
  ["degradado", DEGRADADO],
];

/* ================================================================== *
 * 1. Os quatro estados existem e sao distinguiveis
 * ================================================================== */

teste("H1 os quatro estados sao produzidos", () => {
  assert.equal(CALMO.modo, "calmo");
  assert.equal(AMBIENTE.modo, "ambiente");
  assert.equal(FOCO.modo, "foco");
  assert.equal(DEGRADADO.degradado, true);
});

teste("H2 CALMO NAO e tela vazia", () => {
  // A regra de D42, medida: em Calmo a home continua util.
  assert.ok(CALMO.pulso.observado, "Calmo perdeu o pulso");
  assert.ok(CALMO.pulso.valor > 0);
  assert.equal(CALMO.ambientes.length, 5, "Calmo escondeu ambientes");
  assert.ok(
    CALMO.total_de_sinais >= 5,
    `Calmo com apenas ${CALMO.total_de_sinais} sinais — virou tela vazia`,
  );
  assert.ok(
    CALMO.sinais_em_segundo_plano.length >= 5,
    "Calmo nao mostra os sinais ativos",
  );
  // Ele mostra itens em movimento, roteamento e areas acompanhadas.
  const cods = new Set(CALMO.sinais_em_segundo_plano.map((s) => s.codigo));
  assert.ok(cods.has("S18"), "Calmo perdeu 'item saindo rapido'");
  assert.ok(cods.has("S12"), "Calmo perdeu o roteamento 'so quentes'");
});

teste("H2b controle positivo: uma leitura realmente vazia produz menos", () => {
  // Sem este par, H2 passaria com o motor de sinais morto.
  const vazia: LeituraOperacional = {
    ...cenaCalmo(),
    pedidos: [],
    carga_por_praca: {},
    chegadas_na_hora: null,
    chegadas_normais: null,
    // Nenhuma fonte respondeu. Diferente de "as fontes responderam zero": este
    // e o caso em que o sistema nao sabe, e nao pode dizer que esta tudo bem.
    fontes: [],
  };
  const vm = homeVM(vazia);
  assert.equal(vm.total_de_sinais, 0);
  assert.ok(
    CALMO.total_de_sinais > vm.total_de_sinais,
    "a cena calma nao produz mais sinal que uma leitura vazia — o motor esta morto",
  );
  // E mesmo vazia, os ambientes continuam presentes e NENHUM fica verde.
  assert.equal(vm.ambientes.length, 5);
  for (const a of vm.ambientes) {
    assert.equal(
      a.cor,
      "sem_medicao",
      `${a.rotulo} ficou ${a.cor} numa leitura sem nenhuma fonte`,
    );
  }
});

/* ================================================================== *
 * 2. Exclusividade de slot e visibilidade simultanea
 * ================================================================== */

teste("H3 no maximo UMA orientacao principal", () => {
  for (const [nome, vm] of TODAS) {
    const orientacoes = vm.foco?.orientacao ? 1 : 0;
    assert.ok(orientacoes <= 1, `${nome} produziu mais de uma orientacao`);
  }
  assert.ok(FOCO.foco !== null);
  assert.ok(FOCO.foco!.orientacao !== null, "o Foco perdeu a orientacao");
});

teste("H4 varios problemas ficam visiveis ao mesmo tempo", () => {
  assert.ok(
    FOCO.sinais_em_segundo_plano.length >= 10,
    `o Foco escondeu os demais sinais (${FOCO.sinais_em_segundo_plano.length})`,
  );
  // O foco eleito NAO esta duplicado no segundo plano.
  assert.ok(
    !FOCO.sinais_em_segundo_plano.includes(FOCO.foco!.sinal),
    "o sinal do foco aparece duas vezes",
  );
  // A soma fecha: nada foi perdido no caminho.
  assert.equal(
    FOCO.sinais_em_segundo_plano.length + 1,
    FOCO.total_de_sinais,
    "sinais sumiram entre o motor e a home",
  );
});

teste("H5 dois ambientes VERMELHOS aparecem simultaneamente", () => {
  const vermelhos = FOCO.ambientes.filter((a) => a.cor === "vermelho");
  assert.ok(
    vermelhos.length >= 2,
    `so ${vermelhos.length} ambiente vermelho — o segundo foi escondido`,
  );
  const nomes = vermelhos.map((a) => a.rotulo).sort();
  assert.deepEqual(nomes, ["Cozinha", "Sushi"]);
});

teste("H6 problemas simultaneos apontam subareas diferentes", () => {
  const comSubarea = AMBIENTE.sinais_em_segundo_plano
    .filter((s) => s.subarea !== null && s.pinta_ambiente)
    .map((s) => s.subarea);
  assert.ok(
    new Set(comSubarea).size >= 2,
    "os problemas simultaneos apontam uma subarea so",
  );
});

/* ================================================================== *
 * 3. Sushi geral e subareas ao mesmo tempo (D46)
 * ================================================================== */

teste("H7 Sushi aparece como ambiente E com as quatro subareas", () => {
  for (const [nome, vm] of TODAS) {
    const sushi = vm.ambientes.find((a) => a.id === "sushi");
    assert.ok(sushi, `${nome}: Sushi sumiu`);
    assert.equal(sushi!.rotulo, "Sushi");
    assert.deepEqual(
      sushi!.subareas.map((s) => s.rotulo),
      ["Combinados", "Duplas", "Enrolados", "Sushi Quentes"],
      `${nome}: as subareas de Sushi mudaram`,
    );
  }
});

teste("H8 a subarea causadora do congestionamento e identificavel", () => {
  const sushi = FOCO.ambientes.find((a) => a.id === "sushi")!;
  const causadoras = sushi.subareas.filter((s) => s.causadora);
  assert.equal(causadoras.length, 1, "nenhuma ou mais de uma subarea causadora");
  assert.equal(causadoras[0]!.rotulo, "Sushi Quentes");
  assert.equal(causadoras[0]!.cor, "vermelho");
});

teste("H9 Cozinha e ambiente proprio, nunca subarea de Sushi", () => {
  for (const [nome, vm] of TODAS) {
    const sushi = vm.ambientes.find((a) => a.id === "sushi")!;
    assert.ok(
      !sushi.subareas.some((s) => s.rotulo === "Cozinha"),
      `${nome}: Cozinha virou subarea de Sushi`,
    );
    const cozinha = vm.ambientes.find((a) => a.id === "cozinha");
    assert.ok(cozinha, `${nome}: Cozinha sumiu`);
    assert.equal(cozinha!.rotulo, "Cozinha");
  }
});

teste("H10 nenhum identificador interno chega a uma pessoa", () => {
  // Todo campo de texto que a tela le. Um `enrolados_quentes` aqui seria a
  // volta exata do defeito de R1.
  const proibidos = [
    "enrolados_quentes",
    "cozinha_quentes",
    "bar_bebidas",
    "montagem_outros",
    "enrolado_quente",
    "prato_quente",
    "nao_producao",
  ];
  for (const [nome, vm] of TODAS) {
    const textos: string[] = [];
    for (const a of vm.ambientes) {
      textos.push(a.rotulo, a.estado_texto, a.motivo, a.descricao);
      for (const s of a.subareas) {
        textos.push(s.rotulo, s.estado_texto, s.motivo);
      }
    }
    for (const s of [...vm.sinais_em_segundo_plano, ...(vm.foco ? [vm.foco.sinal] : [])]) {
      textos.push(s.nome, s.resumo, s.alvo_rotulo, s.orientacao ?? "", s.limitacao);
    }
    for (const t of textos) {
      for (const p of proibidos) {
        assert.ok(
          !t.includes(p),
          `${nome}: identificador interno "${p}" vazou para a tela em "${t}"`,
        );
      }
    }
  }
});

/* ================================================================== *
 * 4. Ausencia nunca vira zero, nem verde
 * ================================================================== */

teste("H11 area sem fonte NUNCA aparece verde", () => {
  for (const [nome, vm] of TODAS) {
    const caixa = vm.ambientes.find((a) => a.id === "caixa")!;
    assert.notEqual(caixa.cor, "verde", `${nome}: Caixa ficou verde sem fonte`);
  }
  // E ela declara o motivo, sempre.
  const caixa = CALMO.ambientes.find((a) => a.id === "caixa")!;
  assert.equal(caixa.cor, "sem_medicao");
  assert.ok(caixa.motivo.length > 0);
  assert.ok(caixa.selos.length > 0, "sem_medicao sem selo");
});

teste("H12 pressao nao observada e AUSENCIA, nunca 0", () => {
  const caixa = CALMO.ambientes.find((a) => a.id === "caixa")!;
  assert.equal(caixa.pressao.observado, false);
  assert.ok(!("valor" in caixa.pressao), "ausencia carrega valor");
  // Degradado: as subareas do Sushi perdem a carga e nao viram zero.
  const sushi = DEGRADADO.ambientes.find((a) => a.id === "sushi")!;
  for (const s of sushi.subareas) {
    assert.equal(
      s.pressao.observado,
      false,
      `${s.rotulo} inventou pressao sem carga`,
    );
    assert.equal(s.cor, "sem_medicao");
  }
});

teste("H13 DEGRADADO identifica a fonte e nao converte ausencia em normalidade", () => {
  assert.ok(DEGRADADO.degradado);
  assert.ok(DEGRADADO.fontes_degradadas.length > 0);
  const stale = DEGRADADO.fontes.find((f) => f.estado === "stale");
  assert.ok(stale, "o degradado nao tem fonte stale");
  assert.ok(stale!.rotulo.length > 0 && stale!.detalhe.length > 0);
  const verdes = DEGRADADO.ambientes.filter((a) => a.cor === "verde");
  assert.ok(
    verdes.length <= 1,
    `${verdes.length} ambientes verdes com a fonte de tempo parada`,
  );
});

teste("H13b controle positivo: com as fontes saudaveis o verde volta", () => {
  // Sem este par, H13 passaria com um bug que pinta tudo de cinza sempre.
  const verdes = CALMO.ambientes.filter((a) => a.cor === "verde");
  assert.ok(
    verdes.length >= 2,
    "nenhum ambiente fica verde nem com fonte saudavel — o sinal de saude morreu",
  );
});

teste("H14 pulso ausente quando nao ha fonte alguma", () => {
  const semNada: LeituraOperacional = {
    ...cenaCalmo(),
    pedidos: [],
    fontes: [],
  };
  const vm = homeVM(semNada);
  assert.equal(vm.pulso.observado, false);
  assert.ok(!("valor" in vm.pulso));
});

/* ================================================================== *
 * 5. Os sinais de R4
 * ================================================================== */

teste("H15 os 11 sinais sustentados sao os da classificacao", () => {
  assert.deepEqual([...CODIGOS_IMPLEMENTADOS].sort(), [
    "S1",
    "S12",
    "S18",
    "S2",
    "S22",
    "S3",
    "S4",
    "S5",
    "S6",
    "S7",
    "S8",
  ]);
  assert.equal(CODIGOS_IMPLEMENTADOS.length, 11);
});

teste("H16 os 9 sinais sem fonte sao DECLARADOS, nunca omitidos", () => {
  assert.equal(SINAIS_INDISPONIVEIS.length, 9);
  const cods = SINAIS_INDISPONIVEIS.map((s) => s.codigo).sort();
  assert.deepEqual(cods, ["S11", "S13", "S15", "S16", "S17", "S19", "S20", "S21", "S9"]);
  for (const s of SINAIS_INDISPONIVEIS) {
    assert.ok(s.motivo.length > 0, `${s.codigo} sem motivo`);
    assert.ok(s.fonte_que_falta.length > 0, `${s.codigo} sem fonte declarada`);
  }
  // O bloqueado por SAC continua bloqueado.
  const s19 = SINAIS_INDISPONIVEIS.find((s) => s.codigo === "S19")!;
  assert.match(s19.fonte_que_falta, /SAC/);
  for (const [nome, vm] of TODAS) {
    assert.equal(vm.sinais_indisponiveis.length, 9, `${nome} escondeu os bloqueados`);
  }
});

teste("H17 nenhum sinal fora do catalogo implementado e produzido", () => {
  const permitidos = new Set([...CODIGOS_IMPLEMENTADOS, "S14", "S14c"]);
  for (const [nome, vm] of TODAS) {
    for (const s of vm.sinais_em_segundo_plano) {
      assert.ok(
        permitidos.has(s.codigo),
        `${nome}: sinal nao classificado foi inventado: ${s.codigo}`,
      );
    }
  }
});

teste("H18 'so quentes' e ROTEAMENTO para a bancada do caixa", () => {
  const s12 = FOCO.sinais_em_segundo_plano.filter((s) => s.codigo === "S12");
  assert.ok(s12.length > 0, "nenhum 'so quentes' na cena");
  for (const s of s12) {
    assert.match(s.orientacao ?? "", /bancada do caixa/i);
    // Nao implica prioridade — a regra e explicita no texto e na severidade.
    assert.equal(s.severidade, 1);
    assert.match(s.orientacao ?? "", /nao e prioridade/i);
    assert.equal(s.pinta_ambiente, false, "roteamento nao pode pintar ambiente");
  }
});

teste("H18b 'so quentes' NAO usa temperatura: e dependencia de praca", () => {
  // Um pedido de Sushi Quentes (praca do ambiente Sushi) nunca e "so quentes",
  // ainda que o seed marque seus itens como temperatura "quente".
  const comSushiQuentes = FOCO.sinais_em_segundo_plano.filter(
    (s) => s.codigo === "S12" && /C-301|C-304|C-306/.test(s.pedido_id ?? ""),
  );
  assert.equal(
    comSushiQuentes.length,
    0,
    "um pedido que depende do Sushi foi marcado como 'so quentes'",
  );
  // Sem comentario: a propria documentacao da regra cita "temperatura" para
  // dizer que NAO a usa, e um teste que lesse o comentario se auto-derrubaria.
  const semComentario = ler("src/product/viewmodels/sinais.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const corpoS12 = semComentario
    .split("function s12")[1]!
    .split("\nfunction")[0]!;
  assert.ok(
    !/temperatura/.test(corpoS12),
    "a regra de 'so quentes' passou a olhar temperatura",
  );
  assert.match(corpoS12, /ambienteDaPraca/, "a regra deixou de olhar a praca");
});

teste("H19 'duas sacolas' SO com motivo comprovado", () => {
  const comMotivo = CALMO.sinais_em_segundo_plano.filter((s) => s.codigo === "S14");
  assert.equal(comMotivo.length, 1, "a cena calma deveria ter exatamente 1");
  assert.match(comMotivo[0]!.resumo, /item quente e item frio/);
  // E o par: pedidos SEM motivo nao produzem o sinal, mesmo sendo grandes.
  const semMotivo: LeituraOperacional = {
    ...cenaCalmo(),
    pedidos: cenaCalmo().pedidos.map((p) => ({ ...p, motivo_duas_sacolas: null })),
  };
  const vm = homeVM(semMotivo);
  assert.equal(
    vm.sinais_em_segundo_plano.filter((s) => s.codigo === "S14").length,
    0,
    "duas sacolas nasceu sem motivo — a heuristica voltou",
  );
});

teste("H20 risco de conferencia existe POR PEDIDO sem medicao da area", () => {
  const conf = CALMO.ambientes.find((a) => a.id === "conferencia")!;
  assert.equal(conf.cor, "sem_medicao", "a area ganhou medicao que nao tem");
  const risco = CALMO.sinais_em_segundo_plano.filter((s) => s.codigo === "S14c");
  assert.ok(risco.length > 0, "o risco por pedido sumiu junto com a medicao");
  assert.ok(risco[0]!.pedido_id !== null, "risco de conferencia sem pedido");
  assert.match(risco[0]!.limitacao, /POR PEDIDO/);
});

teste("H21 praca sobrecarregada nomeia a subarea, nao so o ambiente", () => {
  const s5 = FOCO.sinais_em_segundo_plano.filter((s) => s.codigo === "S5");
  assert.ok(s5.length >= 2);
  for (const s of s5) {
    assert.ok(s.subarea !== null, "S5 sem subarea");
    assert.ok(s.ambiente !== null, "S5 sem ambiente");
  }
  const rotulos = s5.map((s) => s.alvo_rotulo).sort();
  assert.deepEqual(rotulos, ["Cozinha", "Sushi Quentes"]);
});

teste("H22 todo sinal produzido declara fonte, evidencia e limitacao", () => {
  for (const [nome, vm] of TODAS) {
    for (const s of vm.sinais_em_segundo_plano) {
      assert.ok(s.evidencias.length > 0, `${nome}/${s.codigo} sem evidencia`);
      for (const e of s.evidencias) {
        assert.ok(e.tipo.length > 0 && e.referencia.length > 0 && e.observado_em.length > 0);
      }
      assert.ok(s.limitacao.length > 0, `${nome}/${s.codigo} sem limitacao`);
      assert.ok(s.publico.length > 0, `${nome}/${s.codigo} sem usuario beneficiado`);
      assert.ok(
        ["real", "simulado", "controle", "controle_positivo_sintetico"].includes(
          s.procedencia,
        ),
        `${nome}/${s.codigo} sem procedencia`,
      );
    }
  }
});

/* ================================================================== *
 * 6. Nada executa, nada pausa
 * ================================================================== */

teste("H23 nenhuma orientacao executa acao", () => {
  assert.equal(FOCO.foco!.orientacao!.executa, false);
  const VERBOS = [
    /\bpausar\b/i,
    /\bpause\b/i,
    /\bcancelar\b/i,
    /\bdespachar\b/i,
    /\benviar\b/i,
    /\bexecutar\b/i,
    /\baplicar\b/i,
    /\bconfirmar\b/i,
  ];
  for (const [nome, vm] of TODAS) {
    const textos = [
      ...vm.sinais_em_segundo_plano.map((s) => s.orientacao ?? ""),
      vm.foco?.orientacao?.acao ?? "",
    ];
    for (const t of textos) {
      for (const v of VERBOS) {
        assert.ok(!v.test(t), `${nome}: verbo de execucao na orientacao: "${t}"`);
      }
    }
  }
});

teste("H24 nenhuma pausa automatica de praca", () => {
  for (const [nome, vm] of TODAS) {
    for (const s of vm.sinais_em_segundo_plano) {
      assert.ok(!/paus/i.test(s.orientacao ?? ""), `${nome}: ${s.codigo} sugere pausa executada`);
    }
  }
  // A pausa (S15/S17) esta declarada como sem fonte, e o motivo diz isso.
  const s15 = SINAIS_INDISPONIVEIS.find((s) => s.codigo === "S15")!;
  assert.match(s15.motivo, /nunca pausa praca sozinho/i);
});

teste("H25 a superficie nao tem controle operacional", () => {
  const fonte = ler("src/product/ui/surfaces/home.js");
  // A pilula de orientacao e uma DIV. Nao existe <button> de acao na home.
  assert.ok(!/<button(?![^>]*inspetor)/.test(fonte), "a home ganhou um botao");
  assert.ok(!/<form/.test(fonte), "a home ganhou um formulario");
  assert.ok(!/<input/.test(fonte), "a home ganhou um campo de entrada");
  assert.ok(/onclick|addEventListener/.test(fonte) === false, "a home ganhou handler");
  // Classe renomeada com a expressao canonica (`home-` -> `org-`). A garantia e
  // a mesma: a orientacao e uma DIV, e o unico controle da superficie e o link
  // que aproxima de uma area — navegacao, nunca execucao.
  assert.match(fonte, /org-acao__pilula/);
  assert.match(fonte, /class="org-acao__pilula"/);
});

teste("H26 o Copiloto nao esta conectado", () => {
  const vm = ler("src/product/viewmodels/home-vm.ts");
  assert.ok(!/perfil-delivery\/decisao/.test(vm), "a home importou decisao.js (R5)");
  assert.ok(!/copiloto\/shadow/.test(vm), "a home importou o Copiloto Shadow (R5)");
  const sin = ler("src/product/viewmodels/sinais.ts");
  assert.ok(!/decisao|shadow/i.test(sin.replace(/\*[\s\S]*?\*\//g, "")));
});

/* ================================================================== *
 * 7. Demonstracao nunca passa por real
 * ================================================================== */

teste("H27 toda cena de demonstracao se declara", () => {
  for (const [nome, vm] of TODAS) {
    assert.equal(vm.demonstracao, true, `${nome} nao se declara demonstracao`);
    assert.notEqual(vm.procedencia, "real", `${nome} se declarou real`);
    assert.ok(
      vm.selos.some((s) => s.estado === "somente_demonstracao"),
      `${nome} sem selo de demonstracao`,
    );
    assert.ok(
      vm.limitacoes.some((l) => /demonstracao/i.test(l.titulo)),
      `${nome} sem limitacao de demonstracao`,
    );
  }
});

teste("H28 a fixture NAO consegue se declarar real", () => {
  const fonte = ler("src/product/demo/seed-home-demonstracao.ts");
  assert.ok(
    !/procedencia:\s*"real"/.test(fonte),
    "a fixture da home passou a produzir procedencia real",
  );
  // A prova de verdade e a saida das quatro cenas, nao a contagem no texto.
  for (const nome of Object.keys(CENAS)) {
    assert.equal(
      cena(nome as keyof typeof CENAS).procedencia,
      "simulado",
      `a cena ${nome} perdeu a marcacao de simulado`,
    );
  }
});

teste("H28b controle positivo: leitura REAL nao e marcada como demonstracao", () => {
  // Sem este par, H27 passaria com uma home que grita "demonstracao" sempre.
  const real: LeituraOperacional = { ...cenaFoco(), procedencia: "real" };
  // R5-B: uma leitura REAL passou a exigir a eleicao temporal da Operacao Viva
  // (C3). O que este controle prova continua o mesmo — real nao vira
  // demonstracao —, mas ele nao pode mais chamar a home pela porta de fixture.
  const vm = homeVM(real, {
    tipo: "real",
    temporal: { modo: "foco", orientacao_permitida: true },
  });
  assert.equal(vm.demonstracao, false);
  assert.ok(vm.selos.some((s) => s.estado === "real"));
  assert.ok(!vm.limitacoes.some((l) => /Leitura de demonstracao/i.test(l.titulo)));
  assert.equal(vm.foco!.orientacao!.procedencia, "real");
});

teste("H29 a fixture nao entra no runtime critico", () => {
  for (const arq of [
    "src/platform/bin/critical.ts",
    "src/platform/bin/async-runtime.ts",
  ]) {
    const fonte = ler(arq);
    assert.ok(!/seed-home-demonstracao/.test(fonte), `${arq} importou a fixture`);
    assert.ok(!/home-vm/.test(fonte), `${arq} importou a home`);
  }
});

/* ================================================================== *
 * 8. Rotas e telas tecnicas preservadas
 * ================================================================== */

teste("H30 a rota inicial abre a home operacional", () => {
  const app = ler("src/product/ui/app.js");
  assert.match(app, /return h && h\.startsWith\("\/"\) \? h : "\/";/);
  assert.match(app, /"\/": \{ api: "\/api\/home", tela: telaHome \}/);
});

teste("H31 as quatro superficies tecnicas continuam existindo", () => {
  const rotas = MODULOS.filter((m) => m.disponibilidade === "implementado").map(
    (m) => m.rota,
  );
  for (const r of ["/entregas", "/operacao-viva", "/conference-brain", "/copiloto"]) {
    assert.ok(rotas.includes(r), `a superficie ${r} foi removida`);
  }
  assert.ok(rotas.includes("/"), "a home nao esta na navegacao");
  // E a home aponta para elas como aprofundamento.
  assert.equal(CALMO.aprofundamentos.length, 4);
  for (const a of CALMO.aprofundamentos) {
    assert.ok(rotas.includes(a.rota));
    assert.ok(a.papel.length > 0, `${a.rota} sem papel declarado`);
  }
});

teste("H32 a navegacao nao expoe estrutura interna de codigo", () => {
  for (const m of MODULOS) {
    assert.ok(!/src\/|\.ts|\.js/.test(m.nome + m.descricao));
  }
});

/* ================================================================== *
 * 9. Contextos por funcao
 * ================================================================== */

teste("H33 as quatro funcoes tem contexto proprio", () => {
  const funcoes = FOCO.contextos.map((c) => c.funcao);
  assert.deepEqual(funcoes, ["gerente", "boqueta", "caixa", "atendimento"]);
  for (const c of FOCO.contextos) {
    assert.ok(c.pergunta.length > 0, `${c.funcao} sem pergunta`);
  }
  const gerente = FOCO.contextos.find((c) => c.funcao === "gerente")!;
  assert.ok(gerente.sinais.length >= 3, "o gerente perdeu a visao completa");
  const caixa = FOCO.contextos.find((c) => c.funcao === "caixa")!;
  assert.ok(
    caixa.sinais.some((s) => s.codigo === "S12"),
    "o caixa nao ve os pedidos que pode montar na bancada",
  );
  assert.match(caixa.ausencia ?? "", /sem medicao automatica/i);
  const atendimento = FOCO.contextos.find((c) => c.funcao === "atendimento")!;
  assert.ok(
    atendimento.sinais.some((s) => s.codigo === "S3" || s.codigo === "S1"),
    "o atendimento nao ve atraso",
  );
  assert.match(atendimento.ausencia ?? "", /SAC/);
});

/* ================================================================== *
 * 10. Determinismo e servidor
 * ================================================================== */

teste("H34 a mesma leitura produz sempre a mesma home", () => {
  const a = JSON.stringify(homeVM(cena("foco")));
  const b = JSON.stringify(homeVM(cena("foco")));
  assert.equal(a, b, "a home nao e deterministica");
});

teste("H35 o servidor entrega as quatro cenas e recusa escrita", async () => {
  const s = await criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;

  const pegar = (caminho: string, metodo = "GET"): Promise<{ code: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: caminho, method: metodo },
        (res) => {
          let b = "";
          res.on("data", (d) => (b += d));
          res.on("end", () => resolve({ code: res.statusCode ?? 0, body: b }));
        },
      );
      req.on("error", reject);
      req.end();
    });

  try {
    for (const c of Object.keys(CENAS)) {
      const r = await pegar(`/api/home?cena=${c}`);
      assert.equal(r.code, 200, `cena ${c} nao respondeu`);
      const vm = JSON.parse(r.body) as HomeVM & { cena: string };
      assert.equal(vm.cena, c);
      assert.equal(vm.demonstracao, true);
      assert.equal(vm.ambientes.length, 5);
    }
    // Cena desconhecida NAO inventa dado: cai na cena padrao, declarada.
    const invalida = await pegar("/api/home?cena=inexistente");
    assert.equal(invalida.code, 200);
    assert.equal((JSON.parse(invalida.body) as { cena: string }).cena, "ambiente");

    const escrita = await pegar("/api/home", "POST");
    assert.equal(escrita.code, 405, "o servidor aceitou metodo de escrita");

    const css = await pegar("/surfaces/home.css");
    assert.equal(css.code, 200, "a folha da home nao e servida");
    const js = await pegar("/surfaces/home.js");
    assert.equal(js.code, 200, "a superficie da home nao e servida");
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});

teste("H36 a home nao inventa token novo", () => {
  const css = ler("src/product/ui/surfaces/home.css");
  const definidos = css.match(/^\s*--[a-z0-9-]+\s*:/gm);
  assert.equal(definidos, null, "a home definiu token proprio em vez de reusar");
});

teste("H37 reduced motion e teclado", () => {
  const css = ler("src/product/ui/surfaces/home.css");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none/);
  assert.match(css, /transition: none/);
  const js = ler("src/product/ui/surfaces/home.js");
  // So links nativos sao focaveis. Nenhuma div com tabindex ou role de botao.
  assert.ok(!/tabindex/.test(js), "a home criou ordem de foco propria");
  assert.ok(!/role="button"/.test(js), "a home criou botao falso");
});

teste("H38 todo ambiente carrega rotulo textual alem da cor", () => {
  for (const [nome, vm] of TODAS) {
    for (const a of vm.ambientes) {
      assert.ok(a.estado_texto.length > 0, `${nome}/${a.rotulo} sem rotulo textual`);
      for (const s of a.subareas) {
        assert.ok(s.estado_texto.length > 0, `${nome}/${s.rotulo} sem rotulo textual`);
      }
    }
  }
  // Os quatro estados de cor tem textos distintos entre si.
  const textos = new Set(
    TODAS.flatMap(([, vm]) => vm.ambientes.map((a) => `${a.cor}=${a.estado_texto}`)),
  );
  const porCor = new Map<string, Set<string>>();
  for (const t of textos) {
    const [cor, txt] = t.split("=");
    if (!porCor.has(cor!)) porCor.set(cor!, new Set());
    porCor.get(cor!)!.add(txt!);
  }
  for (const [cor, s] of porCor) {
    assert.equal(s.size, 1, `a cor ${cor} tem mais de um rotulo textual`);
  }
});

teste("H39 os cinco ambientes aparecem em toda leitura", () => {
  for (const [nome, vm] of TODAS) {
    assert.deepEqual(
      vm.ambientes.map((a) => a.id),
      AMBIENTES.map((a) => a.id),
      `${nome}: a lista de ambientes mudou`,
    );
  }
  assert.equal(subareasDe("sushi").length, 4);
  assert.equal(subareasDe("cozinha").length, 0);
});

teste("H40 a ordem dos sinais e estavel e por severidade", () => {
  const s = sinaisDe(cena("foco"));
  for (let i = 1; i < s.length; i += 1) {
    assert.ok(
      s[i - 1]!.severidade >= s[i]!.severidade,
      "os sinais nao estao em ordem de severidade",
    );
  }
});

/* ================================================================== */

void Promise.all(pend).then(() => {
  console.log(`\nR2 + R4 — home operacional e sinais: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("HOME_SIGNALS_GATE_GREEN");
});
