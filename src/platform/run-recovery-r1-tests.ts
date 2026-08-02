/**
 * R1 — gate da nomenclatura das areas.
 * ============================================================================
 * `motor.js` e nucleo: ele e a fonte de regra que roda no Auto Teste e no
 * protoripo, e a correcao de R1 toca o mapa que a operacao LE. Por isso ela tem
 * gate proprio, separado do gate do Product System.
 *
 * O defeito corrigido: `DISPLAY.cozinha_quentes` valia `"Quentes"` — exibia a
 * **Cozinha** com o nome que a operacao usa para **Sushi Quentes**
 * (`enrolados_quentes`). Uma home construida sobre esse mapa mostraria a area
 * errada com o nome certo, que e pior do que nao mostrar.
 *
 * METODO: toda afirmacao de "o nome esta certo" vem acompanhada da afirmacao
 * simetrica de que o nome do OUTRO nao colidiu. Um mapa que trocasse os dois
 * rotulos entre si passaria em metade destes testes — e falha na outra metade.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import {
  AMBIENTES,
  PRACAS,
  ambienteDaPraca,
  ambientePorId,
  ambientesSemMedicao,
  pracasDe,
  rotuloDaPraca,
  rotuloDoAmbiente,
  subareasDe,
  type PracaId,
} from "../product/viewmodels/areas";

const requireCJS = createRequire(__filename);
const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");

interface MotorAPI {
  PRACAS: string[];
  PRODUCAO: string[];
  CONFERENCIA: string[];
  DISPLAY: Record<string, string>;
  BASELINE: Record<string, number>;
  TEMPO_PRACA: Record<string, number>;
}
const MOTOR = requireCJS(join(raiz, "src/perfil-delivery/motor.js")) as MotorAPI;

interface ItemSeed {
  id: string;
  nome: string;
  praca_principal: string | null;
  temperatura: string;
}
const SEED = JSON.parse(ler("data/cardapio_knowledge_seed.json")) as {
  itens: ItemSeed[];
};

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

/* ================================================================== *
 * 1. Os dois rotulos, e a simetria que impede a troca
 * ================================================================== */

teste("R1.1 cozinha_quentes exibe Cozinha", () => {
  assert.equal(MOTOR.DISPLAY.cozinha_quentes, "Cozinha");
  assert.equal(rotuloDaPraca("cozinha_quentes"), "Cozinha");
});

teste("R1.2 enrolados_quentes exibe Sushi Quentes", () => {
  assert.equal(MOTOR.DISPLAY.enrolados_quentes, "Sushi Quentes");
  assert.equal(rotuloDaPraca("enrolados_quentes"), "Sushi Quentes");
});

teste("R1.3 Cozinha NUNCA aparece como Sushi Quentes", () => {
  assert.notEqual(MOTOR.DISPLAY.cozinha_quentes, "Sushi Quentes");
  assert.notEqual(rotuloDaPraca("cozinha_quentes"), "Sushi Quentes");
  assert.equal(ambienteDaPraca("cozinha_quentes"), "cozinha");
  assert.notEqual(ambienteDaPraca("cozinha_quentes"), "sushi");
});

teste("R1.4 Sushi Quentes NUNCA aparece como Cozinha", () => {
  assert.notEqual(MOTOR.DISPLAY.enrolados_quentes, "Cozinha");
  assert.notEqual(rotuloDaPraca("enrolados_quentes"), "Cozinha");
  assert.equal(ambienteDaPraca("enrolados_quentes"), "sushi");
  assert.notEqual(ambienteDaPraca("enrolados_quentes"), "cozinha");
});

teste("R1.5 nenhum rotulo e a palavra ambigua 'Quentes' sozinha", () => {
  // "Quentes" sem qualificador foi exatamente o rotulo que colidiu. Ele nao pode
  // voltar por nenhuma praca — nem pela que o tinha, nem por outra.
  for (const [id, rotulo] of Object.entries(MOTOR.DISPLAY)) {
    assert.notEqual(rotulo, "Quentes", `praca ${id} voltou a exibir "Quentes"`);
  }
  for (const p of PRACAS) {
    assert.notEqual(p.rotulo, "Quentes", `praca ${p.id} exibe "Quentes"`);
  }
  for (const a of AMBIENTES) {
    assert.notEqual(a.rotulo, "Quentes", `ambiente ${a.id} exibe "Quentes"`);
  }
});

teste("R1.6 o motor e o contrato de exibicao concordam praca a praca", () => {
  // Duas fontes de rotulo divergindo em silencio foi a causa raiz. Se um dia
  // divergirem, este teste cai antes de qualquer tela ser desenhada.
  assert.equal(PRACAS.length, MOTOR.PRACAS.length);
  for (const p of PRACAS) {
    assert.equal(
      p.rotulo,
      MOTOR.DISPLAY[p.id],
      `divergencia de rotulo em ${p.id}: contrato="${p.rotulo}" motor="${MOTOR.DISPLAY[p.id]}"`,
    );
  }
});

teste("R1.7 nenhum rotulo humano se repete entre pracas", () => {
  const vistos = new Set<string>();
  for (const p of PRACAS) {
    assert.ok(!vistos.has(p.rotulo), `rotulo duplicado: ${p.rotulo}`);
    vistos.add(p.rotulo);
  }
});

teste("R1.8 identificador interno nunca vaza como rotulo", () => {
  for (const p of PRACAS) {
    assert.ok(
      !/_/.test(p.rotulo),
      `rotulo parece identificador interno: ${p.rotulo}`,
    );
    assert.notEqual(p.rotulo, p.id);
  }
});

/* ================================================================== *
 * 2. O agrupamento de itens permanece igual
 * ================================================================== */

const CONTAGEM_CANONICA: Record<string, number> = {
  combinados: 20,
  duplas: 64,
  enrolados: 16,
  enrolados_quentes: 11,
  cozinha_quentes: 31,
  sobremesa: 9,
  bar_bebidas: 36,
  montagem_outros: 5,
};

teste("R1.9 a contagem de itens por praca nao mudou", () => {
  const contagem: Record<string, number> = {};
  for (const i of SEED.itens) {
    if (i.praca_principal === null) continue;
    contagem[i.praca_principal] = (contagem[i.praca_principal] || 0) + 1;
  }
  assert.deepEqual(contagem, CONTAGEM_CANONICA);
});

const LISTA_DO_CESAR = [
  "Ceviche",
  "Hot Roll",
  "Hot Roll Tatá",
  "Hot Roll com Shimeji",
  "Tartar de Salmão",
  "Temaki Ebiten",
  "Temaki de Salmão Skin",
  "Tuna Shisô Tartar",
  "Uramaki Ebiten",
  "Uramaki Ebiten Especial",
  "Uramaki de Salmão Skin",
];

teste("R1.10 os 11 itens de Sushi Quentes sao os mesmos de antes", () => {
  const nomes = SEED.itens
    .filter((i) => i.praca_principal === "enrolados_quentes")
    .map((i) => i.nome)
    .sort();
  assert.deepEqual(nomes, [...LISTA_DO_CESAR].sort());
});

teste("R1.11 nenhum item migrou entre Cozinha e Sushi Quentes", () => {
  const naCozinha = new Set(
    SEED.itens
      .filter((i) => i.praca_principal === "cozinha_quentes")
      .map((i) => i.id),
  );
  const noSushiQuentes = new Set(
    SEED.itens
      .filter((i) => i.praca_principal === "enrolados_quentes")
      .map((i) => i.id),
  );
  assert.equal(naCozinha.size, 31);
  assert.equal(noSushiQuentes.size, 11);
  for (const id of noSushiQuentes) {
    assert.ok(!naCozinha.has(id), `item em duas pracas: ${id}`);
  }
});

/* ================================================================== *
 * 3. A correcao de nome nao alterou a logica da praca
 * ================================================================== */

teste("R1.12 o vocabulario de pracas do motor esta intacto", () => {
  assert.deepEqual(MOTOR.PRACAS, [
    "combinados",
    "duplas",
    "enrolados",
    "enrolados_quentes",
    "cozinha_quentes",
    "sobremesa",
    "bar_bebidas",
    "montagem_outros",
  ]);
});

teste("R1.13 producao e conferencia continuam com as mesmas pracas", () => {
  assert.deepEqual(MOTOR.PRODUCAO, [
    "combinados",
    "duplas",
    "enrolados",
    "enrolados_quentes",
    "cozinha_quentes",
  ]);
  assert.deepEqual(MOTOR.CONFERENCIA, [
    "sobremesa",
    "bar_bebidas",
    "montagem_outros",
  ]);
});

teste("R1.14 baseline e tempo de praca nao foram tocados", () => {
  assert.deepEqual(MOTOR.BASELINE, {
    combinados: 3,
    duplas: 6,
    enrolados: 5,
    enrolados_quentes: 3,
    cozinha_quentes: 4,
  });
  assert.deepEqual(MOTOR.TEMPO_PRACA, {
    combinados: 22,
    duplas: 9,
    enrolados: 8,
    enrolados_quentes: 12,
    cozinha_quentes: 12,
  });
});

teste("R1.15 os identificadores internos NAO foram renomeados", () => {
  // A correcao devia viver na apresentacao. Se alguem renomear a chave, o seed,
  // o baseline e os replays historicos deixam de casar em silencio.
  const fonte = ler("src/perfil-delivery/motor.js");
  assert.ok(fonte.includes('"enrolados_quentes"'));
  assert.ok(fonte.includes('"cozinha_quentes"'));
  assert.ok(
    SEED.itens.some((i) => i.praca_principal === "enrolados_quentes"),
    "o seed perdeu a chave enrolados_quentes",
  );
  assert.ok(
    SEED.itens.some((i) => i.praca_principal === "cozinha_quentes"),
    "o seed perdeu a chave cozinha_quentes",
  );
});

/* ================================================================== *
 * 4. Nenhuma classificacao termica generica substitui o mapa canonico
 * ================================================================== */

teste("R1.16 temperatura NAO reproduz o mapa de pracas", () => {
  // O campo `temperatura` do seed marca os 11 itens de Sushi Quentes como
  // "quente" — inclusive Ceviche, Tartar de Salmao e Tuna Shiso Tartar, que sao
  // pratos FRIOS. O campo e sombra do nome da praca, nao classificacao
  // independente. Agrupar por temperatura produziria outra particao.
  const quentes = SEED.itens.filter((i) => i.temperatura === "quente");
  const cozinha = SEED.itens.filter(
    (i) => i.praca_principal === "cozinha_quentes",
  );
  assert.notEqual(
    quentes.length,
    cozinha.length,
    "se temperatura==quente coincidisse com Cozinha, a heuristica termica passaria por canonica",
  );
  assert.equal(quentes.length, 43);
  assert.equal(cozinha.length, 31);
});

teste("R1.17 pratos frios pertencem a Sushi Quentes — a praca e de fluxo", () => {
  const frios = ["Ceviche", "Tartar de Salmão", "Tuna Shisô Tartar"];
  for (const nome of frios) {
    const item = SEED.itens.find((i) => i.nome === nome);
    assert.ok(item, `item ausente do seed: ${nome}`);
    assert.equal(
      item.praca_principal,
      "enrolados_quentes",
      `${nome} saiu de Sushi Quentes — o nome voltou a ser lido como temperatura`,
    );
  }
});

teste("R1.18 o mapa canonico e o unico dono da classificacao", () => {
  // Controle: se alguem derivar o ambiente da palavra "quentes" no id, Cozinha e
  // Sushi Quentes caem no mesmo balde. O contrato os separa.
  const porPalavra = (["enrolados_quentes", "cozinha_quentes"] as PracaId[]).map(
    (id) => (/quentes/.test(id) ? "quentes" : "outro"),
  );
  assert.deepEqual(porPalavra, ["quentes", "quentes"]);
  const porContrato = (["enrolados_quentes", "cozinha_quentes"] as PracaId[]).map(
    (id) => ambienteDaPraca(id),
  );
  assert.deepEqual(porContrato, ["sushi", "cozinha"]);
});

/* ================================================================== *
 * 5. A estrutura de ambientes e subareas (D46)
 * ================================================================== */

teste("R1.19 Sushi e ambiente geral com quatro subareas visiveis", () => {
  const subs = subareasDe("sushi").map((p) => p.rotulo);
  assert.deepEqual(subs, ["Combinados", "Duplas", "Enrolados", "Sushi Quentes"]);
  assert.equal(rotuloDoAmbiente("sushi"), "Sushi");
});

teste("R1.20 Cozinha e ambiente proprio, nunca subarea de Sushi", () => {
  assert.equal(rotuloDoAmbiente("cozinha"), "Cozinha");
  const subsSushi = subareasDe("sushi").map((p) => p.id);
  assert.ok(!subsSushi.includes("cozinha_quentes"));
  assert.deepEqual(
    pracasDe("cozinha").map((p) => p.id),
    ["cozinha_quentes"],
  );
});

teste("R1.21 os cinco ambientes da operacao estao representados", () => {
  assert.deepEqual(
    AMBIENTES.map((a) => a.rotulo),
    ["Caixa", "Sushi", "Cozinha", "Conferencia", "Motoboy"],
  );
});

teste("R1.22 area sem medicao declara o motivo", () => {
  const sem = ambientesSemMedicao();
  assert.ok(sem.length >= 1);
  for (const a of sem) {
    assert.ok(
      typeof a.motivo_sem_medicao === "string" && a.motivo_sem_medicao.length > 0,
      `${a.id} nao declara por que nao tem medicao`,
    );
  }
  assert.equal(ambientePorId("caixa").medicao, "sem_medicao_automatica");
});

teste("R1.23 toda praca cai em exatamente um ambiente conhecido", () => {
  const ids = new Set(AMBIENTES.map((a) => a.id));
  for (const p of PRACAS) {
    assert.ok(ids.has(p.ambiente), `${p.id} aponta ambiente inexistente`);
  }
  const soma = AMBIENTES.reduce((n, a) => n + pracasDe(a.id).length, 0);
  assert.equal(soma, PRACAS.length);
});

/* ================================================================== *
 * 6. Regressao no protoripo original
 * ================================================================== */

teste("R1.24 o protoripo nao nomeia nenhum ambiente como 'Quentes'", () => {
  const fonte = ler("app-v1/app.js");
  assert.ok(
    !/nome:\s*"Quentes"/.test(fonte),
    'app-v1 voltou a nomear um ambiente como "Quentes"',
  );
  assert.ok(
    /nome:\s*"Sushi Quentes"/.test(fonte),
    "app-v1 perdeu o rotulo Sushi Quentes",
  );
});

/* ================================================================== */

void Promise.resolve().then(() => {
  console.log(`\nR1 — nomenclatura das areas: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R1_LABELS_GATE_GREEN");
});
