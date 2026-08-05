/**
 * GATE DO LAB · OPERAÇÃO VIVA V4
 * ============================================================================
 * Duas metades, e a segunda existe porque a primeira sozinha não prova nada.
 *
 *   GUARDAS   — afirmam o comportamento. Rodam sempre.
 *   MUTAÇÕES  — quebram o código de propósito e exigem que uma guarda ACUSE.
 *
 * Uma suíte verde sobre um código que não faz nada é o defeito mais comum
 * deste repositório (L36–L41). Por isso cada garantia central tem uma mutação
 * semântica que a derruba, e cada mutação é verificada em quatro etapas:
 * **aplicada** (o arquivo mudou), **carregada** (o processo filho leu o arquivo
 * mudado), **material** (a execução mudou) e **acusada** (a guarda certa
 * reprovou). Restauração byte a byte, conferida por sha256.
 *
 * O processo filho existe justamente para a etapa "carregada": mutar um módulo
 * já importado não muda nada no processo atual.
 *
 * COMO RODAR
 *   npm run test:lab:v4              guardas + mutações
 *   npm run test:lab:v4 -- --guardas guardas apenas (usado pelo filho)
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { createRequire } from "node:module";

import {
  DESCRICOES,
  ESTADOS_DE_FONTE_V4,
  SEM_ORIGEM_CANONICA,
  deEstadoCanonico,
  paraEstadoCanonico,
  sustentaCalmo,
  type EstadoDeFonteV4,
} from "../dominio/estado-fonte";
import {
  CONDICOES_CAIXA,
  decidirConsolidacao,
  unidadeDaPraca,
  UNIDADES,
} from "../dominio/unidade-operacional";
import { operacaoVivaV4VM } from "../dominio/vm-v4";
import { IDS_DAS_CENAS, leitura, type CenaId } from "../fixtures/cenarios";
import { VERSAO_FIXTURE } from "../fixtures/base";
import { criarServidor } from "../servidor/servidor";
import type { EstadoDeFonte } from "../../../src/product/viewmodels/sinais";

const raiz = process.cwd();
const LAB = join(raiz, "labs", "operacao-viva-v4");
const requireCJS = createRequire(__filename);

/* ================================================================== *
 * Arcabouço
 * ================================================================== */

let passaram = 0;
const falhas: string[] = [];
const pendentes: Promise<void>[] = [];

function teste(nome: string, fn: () => void | Promise<void>): void {
  pendentes.push(
    Promise.resolve()
      .then(fn)
      .then(
        () => {
          passaram += 1;
        },
        (e: unknown) => {
          falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
        },
      ),
  );
}

const VMS = IDS_DAS_CENAS.map((id) => [id, operacaoVivaV4VM(leitura(id))] as const);
const vm = (id: CenaId) => {
  const achado = VMS.find(([x]) => x === id);
  if (!achado) throw new Error(`cena ausente do gate: ${id}`);
  return achado[1];
};

/* ================================================================== *
 * G1 — O congelamento continua intacto
 * ================================================================== */

/** Os pathspecs e o baseline do PF4, transcritos do gate que os define. */
const PF4_BASE = "73f2f0b";
const PF4_CAMINHOS = [
  "src/perfil-delivery/",
  "src/product/viewmodels/",
  "src/product/atencao/politica-temporal.ts",
  "src/product/atencao/linhagem-eventos.ts",
  "src/platform/copiloto/confianca-duravel.ts",
  "src/product/ui/",
  "docs/figma/",
];

teste("G1 PF4 continua vazio — o Lab não encostou em caminho protegido", () => {
  const saida = execFileSync(
    "git",
    ["diff", "--name-only", PF4_BASE, "--", ...PF4_CAMINHOS],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `caminho protegido pelo PF4 foi alterado:\n${saida}`);
});

teste("G1b o Lab não importa nada de dentro de src/product/ui", () => {
  const arquivos = [
    "dominio/vm-v4.ts",
    "dominio/unidade-operacional.ts",
    "dominio/estado-fonte.ts",
    "dominio/modo-v4.ts",
    "servidor/servidor.ts",
  ];
  for (const a of arquivos) {
    const fonte = readFileSync(join(LAB, a), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // Sonda o IMPORT, nunca a palavra: um comentário que cite o caminho não é
    // um acoplamento (L36).
    const imports = [
      ...fonte.matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g),
    ].map((m) => m[1]!);
    for (const i of imports) {
      assert.ok(
        !i.includes("product/ui"),
        `${a} importa de src/product/ui: ${i}`,
      );
    }
  }
});

/* ================================================================== *
 * G2 — Sushi Quentes não é absorvido
 * ================================================================== */

teste("G2 a praça do Sushi Quentes responde por unidade própria", () => {
  assert.equal(unidadeDaPraca("enrolados_quentes"), "sushi_quentes");
  // Controle simétrico: nenhuma outra praça do Sushi foi promovida junto.
  assert.equal(unidadeDaPraca("combinados"), "sushi");
  assert.equal(unidadeDaPraca("duplas"), "sushi");
  assert.equal(unidadeDaPraca("enrolados"), "sushi");
});

teste("G2b Sushi Quentes vermelho com o Sushi verde ao lado", () => {
  const v = vm("sushi-quentes-isolado");
  const sq = v.unidades.find((u) => u.id === "sushi_quentes")!;
  const s = v.unidades.find((u) => u.id === "sushi")!;
  assert.equal(sq.cor, "vermelho", "Sushi Quentes deveria estar em pressão máxima");
  // O PAR SIMÉTRICO. Sem ele, um CSS que pintasse tudo de vermelho passaria.
  assert.equal(s.cor, "verde", "o Sushi frio foi puxado junto — houve absorção");
});

teste("G2c a unidade experimental está declarada como experimental", () => {
  const exp = UNIDADES.filter((u) => u.experimental).map((u) => u.id);
  assert.deepEqual(exp, ["sushi_quentes"]);
  const u = UNIDADES.find((x) => x.id === "sushi_quentes")!;
  assert.equal(u.parent, "sushi");
  assert.equal(u.ambiente_canonico, "sushi");
  assert.equal(u.subarea_canonica, "enrolados_quentes");
});

/* ================================================================== *
 * G3 — Foco: exclusividade, sem sumiço e sem duplicata
 * ================================================================== */

teste("G3 no máximo um Foco por leitura, e ele não some dos ativos", () => {
  for (const [id, v] of VMS) {
    if (v.foco === null) continue;
    const duplicado = v.ambiente.filter(
      (s) =>
        s.codigo === v.foco!.sinal.codigo &&
        s.alvo_rotulo === v.foco!.sinal.alvo_rotulo &&
        s.resumo === v.foco!.sinal.resumo,
    );
    assert.equal(
      duplicado.length,
      0,
      `${id}: o sinal do Foco aparece também entre os secundários`,
    );
  }
});

teste("G3b um ambiente crítico não desaparece porque outro virou Foco", () => {
  const v = vm("ambiente-critico-persistente");
  assert.ok(v.foco !== null, "a cena precisa ter Foco para provar o ponto");
  assert.equal(v.foco!.unidade, "sushi_quentes");
  const cozinha = v.unidades.find((u) => u.id === "cozinha")!;
  assert.equal(cozinha.cor, "vermelho", "a Cozinha sumiu do vermelho");
  const sev3Fora = v.ambiente.filter((s) => s.severidade === 3);
  assert.ok(
    sev3Fora.length >= 1,
    "o segundo crítico não continua visível fora do Foco",
  );
});

teste("G3c o Foco carrega validade, retirada e motivo da escolha", () => {
  const v = vm("foco-com-secundarios");
  assert.ok(v.foco !== null);
  assert.ok(v.foco!.validade_ate !== null, "sem validade declarada");
  assert.ok(v.foco!.condicao_de_retirada !== null, "sem condição de retirada");
  assert.ok(v.foco!.motivo_da_escolha.length > 20, "motivo da escolha vazio");
  assert.equal(v.foco!.executa, false);
});

/* ================================================================== *
 * G4 — Confiança
 * ================================================================== */

teste("G4 confiança nunca é estimada, e a ausência é DITA", () => {
  for (const [id, v] of VMS) {
    if (v.foco === null) continue;
    assert.equal(
      v.foco.confianca.observado,
      false,
      `${id}: alguém apurou confiança onde nenhuma política apura`,
    );
    // Não basta ausente: a missão exige que o limite apareça na tela.
    assert.match(
      v.foco.confianca_texto,
      /não estimada/i,
      `${id}: a ausência de confiança não está declarada em texto`,
    );
    assert.ok(
      !/\d+\s*%/.test(v.foco.confianca_texto),
      `${id}: apareceu percentual no texto de confiança`,
    );
  }
});

/* ================================================================== *
 * G5 — Estados de fonte
 * ================================================================== */

teste("G5 os oito estados existem e cada um tem descrição completa", () => {
  assert.equal(ESTADOS_DE_FONTE_V4.length, 8);
  for (const e of ESTADOS_DE_FONTE_V4) {
    const d = DESCRICOES[e];
    assert.ok(d.significado.length > 20, `${e}: significado vazio`);
    assert.ok(d.consequencia.length > 20, `${e}: consequência vazia`);
    assert.ok(
      ["plena", "reduzida", "nenhuma"].includes(d.confianca_permitida),
      `${e}: confiança permitida inválida`,
    );
  }
});

teste("G5b só `saudavel` sustenta calma — nos oito", () => {
  const sustentam = ESTADOS_DE_FONTE_V4.filter((e) => sustentaCalmo(e));
  assert.deepEqual(sustentam, ["saudavel"]);
});

teste("G5c a tradução do canônico é TOTAL e nunca ganha saúde", () => {
  const canonicos: EstadoDeFonte[] = ["saudavel", "parcial", "stale", "indisponivel"];
  for (const c of canonicos) {
    const r = deEstadoCanonico(c, "sushi", ["sushi"]);
    assert.ok(
      ESTADOS_DE_FONTE_V4.includes(r.estado),
      `${c} traduziu para fora do vocabulário`,
    );
    if (c !== "saudavel" && c !== "parcial") {
      assert.notEqual(r.estado, "saudavel", `${c} virou saudável`);
    }
  }
});

teste("G5d `parcial` sem cobertura declarada NUNCA vira saudável", () => {
  const semCobertura = deEstadoCanonico("parcial", "sushi");
  assert.equal(semCobertura.estado, "indisponivel");
  assert.equal(semCobertura.declarado, false);
  // Par simétrico: COM cobertura declarada, a área coberta pode ser saudável.
  assert.equal(deEstadoCanonico("parcial", "sushi", ["sushi"]).estado, "saudavel");
  assert.equal(deEstadoCanonico("parcial", "sushi", ["cozinha"]).estado, "indisponivel");
});

teste("G5e o caminho de volta só produz `saudavel` a partir de `saudavel`", () => {
  for (const e of ESTADOS_DE_FONTE_V4) {
    const c = paraEstadoCanonico(e);
    if (c === "saudavel") {
      assert.equal(e, "saudavel", `${e} conseguiu virar saudável canônico`);
    }
  }
});

teste("G5f os quatro sem origem canônica estão declarados como tais", () => {
  assert.deepEqual([...SEM_ORIGEM_CANONICA].sort(), [
    "conectada",
    "desconhecida",
    "divergente",
    "recuperando",
    "sem_medicao_automatica",
  ].sort());
});

teste("G5g os oito estados aparecem em alguma cena", () => {
  const vistos = new Set<EstadoDeFonteV4>();
  for (const [, v] of VMS) for (const f of v.fontes) vistos.add(f.estado.estado);
  const faltando = ESTADOS_DE_FONTE_V4.filter((e) => !vistos.has(e));
  assert.deepEqual(faltando, [], `estados sem cena que os demonstre: ${faltando}`);
});

/* ================================================================== *
 * G6 — Calmo
 * ================================================================== */

teste("G6 Calmo é recusado quando fonte necessária não está saudável", () => {
  for (const [id, v] of VMS) {
    const fraca = v.fontes.find(
      (f) => f.necessaria_para_calmo && !f.estado.sustenta_calmo,
    );
    if (fraca === undefined) continue;
    assert.notEqual(v.modo, "calmo", `${id}: Calmo com ${fraca.rotulo} não saudável`);
  }
});

teste("G6b o rebaixamento SÓ acontece a partir de calmo, e nomeia o motivo", () => {
  for (const [id, v] of VMS) {
    if (!v.eleicao.rebaixado) continue;
    assert.equal(v.eleicao.modo_canonico, "calmo", `${id}: rebaixou algo que não era Calmo`);
    assert.equal(v.modo, "ambiente");
    assert.ok(v.eleicao.motivos.length > 0, `${id}: rebaixou sem dizer por quê`);
  }
});

teste("G6c CONTROLE POSITIVO: Calmo legítimo continua existindo", () => {
  // Sem este caso a regra passaria proibindo Calmo sempre — e uma regra que
  // nunca deixa nada passar não protege, só decora.
  const v = vm("calma-real");
  assert.equal(v.modo, "calmo");
  assert.equal(v.eleicao.rebaixado, false);
  // E ela tem ausência ESTRUTURAL declarada, que é justamente o que não proíbe.
  assert.ok(
    v.ausencias_materiais.some((a) => a.natureza === "estrutural"),
    "a cena calma precisa carregar ausência estrutural para o controle valer",
  );
});

teste("G6d Calmo nunca é tela vazia", () => {
  const v = vm("calma-real");
  assert.ok(v.pulso.observado, "o pulso sumiu do Calmo");
  assert.equal(v.unidades.length, 6);
  assert.ok(v.total_de_sinais > 0, "Calmo sem nenhum sinal de acompanhamento");
});

/* ================================================================== *
 * G7 — Ausência nunca vira zero
 * ================================================================== */

teste("G7 sem fonte de pedido, o pulso é AUSENTE e não `0`", () => {
  const v = vm("ausencia-de-dados");
  assert.equal(v.pulso.observado, false);
  assert.match(v.pulso.observado ? "" : v.pulso.explicacao, /não é zero|nao e zero/i);
});

/**
 * ESTA GUARDA JÁ TEVE UMA ISENÇÃO, E ELA ERA O DEFEITO.
 *
 * A primeira versão dizia `u.pressao.observado || u.id === "motoboy"`. Ou seja:
 * a guarda que existe para impedir "verde sem medição" foi ensinada a ignorar
 * **justamente a unidade que violava a regra** — e ficou verde por isso, em 15
 * das 18 cenas, até o avaliador independente encontrar pelo produto o que ela
 * estava desculpando (achado 5.1).
 *
 * A regra que fica: exceção dentro de guarda é confissão. Se um caso não passa,
 * ou o produto está errado, ou a regra está errada. Isentar não é nenhum dos
 * dois — é apagar a pergunta.
 */
teste("G7b área sem medição nunca aparece verde — SEM exceção para ninguém", () => {
  for (const [id, v] of VMS) {
    for (const u of v.unidades) {
      if (u.cor !== "verde") continue;
      assert.ok(
        u.pressao.observado,
        `${id}: ${u.id} está verde sem pressão observada`,
      );
      for (const f of u.fontes) {
        assert.ok(
          f.estado.sustenta_calmo,
          `${id}: ${u.id} verde com a fonte ${f.rotulo} em ${f.estado.estado}`,
        );
      }
    }
  }
});

teste("G7c Caixa, Conferência e Motoboy nunca aparecem verdes em cena nenhuma", () => {
  // As três unidades sem medição automática de carga. O Motoboy entrou aqui
  // depois do achado 5.1 — ele estava fora, e era exatamente o que faltava.
  for (const [id, v] of VMS) {
    for (const alvo of ["caixa", "conferencia", "motoboy"] as const) {
      const u = v.unidades.find((x) => x.id === alvo)!;
      assert.notEqual(u.cor, "verde", `${id}: ${alvo} apareceu verde`);
    }
  }
});

teste("G7d toda unidade sem medição de carga tem fonte que DECLARA a ausência", () => {
  // O par estrutural do 5.1: não basta o Motoboy não ficar verde por acidente
  // de severidade. Ele precisa ter, como Caixa e Conferência, uma fonte que
  // diga em voz alta que ninguém mede aquilo.
  for (const [id, v] of VMS) {
    for (const alvo of ["caixa", "conferencia", "motoboy"] as const) {
      const u = v.unidades.find((x) => x.id === alvo)!;
      assert.ok(
        u.fontes.some((f) => f.estado.estado === "sem_medicao_automatica"),
        `${id}: ${alvo} não tem fonte declarando ausência de medição`,
      );
    }
  }
});

teste("G7e nenhuma cena lista a mesma fonte duas vezes", () => {
  // Nasceu de um erro meu ao inserir a fonte do despacho em massa: o padrão
  // curto era SUBSTRING do indentado, e quatro cenas ficaram com a fonte
  // repetida. O sintoma na tela era discreto — "Fila do despacho e Fila do
  // despacho" no motivo — e nenhuma guarda existente pegava.
  for (const [id, v] of VMS) {
    const ids = v.fontes.map((f) => f.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `${id}: fonte repetida na leitura — ${ids.join(", ")}`,
    );
  }
});

/* ================================================================== *
 * G8 — Consolidação
 * ================================================================== */

teste("G8 pedido com Sushi consolida no Delivery, e é obrigatório", () => {
  const v = vm("consolidacao-com-sushi");
  for (const c of v.consolidacoes) {
    assert.equal(c.fluxo, "delivery_conferencia", `${c.pedido_id} saiu do Delivery`);
    assert.equal(c.obrigatorio, true);
    assert.equal(c.candidato_a_caixa, false, "pedido com Sushi foi avaliado para o Caixa");
  }
});

teste("G8b o Caixa só com as SEIS condições comprovadas", () => {
  const v = vm("consolidacao-caixa-comprovada");
  const p = v.consolidacoes.find((c) => c.pedido_id === "P-601")!;
  assert.equal(p.fluxo, "caixa");
  assert.equal(p.condicoes.length, CONDICOES_CAIXA.length);
  assert.ok(p.condicoes.every((c) => c.estado === "comprovada"));
});

teste("G8c condição não observada MANTÉM o fluxo normal", () => {
  const v = vm("consolidacao-caixa-nao-observada");
  const p = v.consolidacoes.find((c) => c.pedido_id === "Q-701")!;
  assert.equal(p.fluxo, "delivery_conferencia");
  assert.equal(p.candidato_a_caixa, true, "deveria ter sido avaliado");
  assert.ok(p.condicoes.some((c) => c.estado === "nao_observada"));
});

teste("G8d ausência de Sushi NUNCA é elegibilidade por omissão", () => {
  // Um pedido sem Sushi e sem nenhuma condição declarada: silêncio total.
  const p = decidirConsolidacao(
    {
      id: "X-1",
      itens: [
        { item_id: "i", nome: "Guioza", praca: "cozinha_quentes", qtd: 1, categoria: "prato_quente" },
      ],
      minutos_pronto_sem_sair: null,
      minutos_sem_ficar_pronto: null,
      minutos_em_rua: null,
      motivo_duas_sacolas: null,
      risco_de_conferencia: null,
    },
    {},
  );
  assert.equal(p.fluxo, "delivery_conferencia");
  assert.ok(p.condicoes.every((c) => c.estado === "nao_observada"));
});

teste("G8e todo pedido tem UM ponto de consolidação, sempre", () => {
  for (const [id, v] of VMS) {
    for (const c of v.consolidacoes) {
      assert.ok(
        c.fluxo === "caixa" || c.fluxo === "delivery_conferencia",
        `${id}/${c.pedido_id}: fluxo fora do contrato`,
      );
      assert.equal(c.regra, "ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT");
    }
  }
});

/* ================================================================== *
 * G9 — Procedência e vocabulário
 * ================================================================== */

teste("G9 toda cena é simulada, e `real` é recusado pela view model", () => {
  for (const [id, v] of VMS) {
    assert.equal(v.procedencia, "simulado", `${id} não é simulado`);
    assert.equal(v.demonstracao, true);
  }
  assert.throws(
    () => operacaoVivaV4VM({ ...leitura("calma-real"), procedencia: "real" }),
    /procedência real|procedencia real/i,
  );
});

teste("G9b nenhum identificador interno de praça chega ao texto da tela", () => {
  const crus = [
    "enrolados_quentes",
    "cozinha_quentes",
    "bar_bebidas",
    "montagem_outros",
  ];
  for (const [id, v] of VMS) {
    const textos = [
      ...v.unidades.flatMap((u) => [u.rotulo, u.estado_texto, u.motivo]),
      ...v.ambiente.map((s) => s.resumo),
      v.foco ? v.foco.situacao : "",
      v.titulo,
      v.apoio,
    ].join(" ");
    for (const c of crus) {
      assert.ok(!textos.includes(c), `${id}: identificador cru "${c}" no texto`);
    }
  }
});

/* ================================================================== *
 * G10 — Modo de Validação (regra pura, sem navegador)
 * ================================================================== */

const contrato = requireCJS(join(LAB, "validacao", "contrato.js")) as typeof import("../validacao/contrato.js");
const schema = requireCJS(join(LAB, "validacao", "schema.js")) as typeof import("../validacao/schema.js");
const repositorio = requireCJS(join(LAB, "validacao", "repositorio.js")) as typeof import("../validacao/repositorio.js");
const resumo = requireCJS(join(LAB, "validacao", "resumo-turno.js")) as typeof import("../validacao/resumo-turno.js");

/**
 * O resumo vem de um módulo JavaScript, então o TypeScript infere uma união de
 * `{observado, valor}` e `{observado, explicacao}`. Nas asserções o ramo é
 * conhecido, e este acessor evita espalhar `as` pelo arquivo.
 */
interface CampoDoResumo {
  observado: boolean;
  valor?: unknown;
  explicacao?: string;
  detalhe?: unknown;
}
const c = (x: unknown): CampoDoResumo => x as CampoDoResumo;

function registro(extra: Record<string, unknown> = {}) {
  return contrato.montarRegistro({
    scenario_id: "calma-real",
    reading_id: "calma-real::leitura",
    verdict: "CORRECT",
    versao_fixture: "teste",
    ...extra,
  });
}

teste("G10 veredito fora do contrato é recusado", () => {
  assert.throws(() => registro({ verdict: "TALVEZ" }), /Veredito fora do contrato/);
});

teste("G10b a marcação é literal: nunca autenticado, nunca sincronizado", () => {
  const r = registro({ marcacao: { autenticado: true, sincronizado: true } });
  assert.equal(r.marcacao.autenticado, false);
  assert.equal(r.marcacao.sincronizado, false);
  assert.equal(r.marcacao.local, true);
  assert.equal(r.ator, "LOCAL_ANONYMOUS_VALIDATOR");
});

teste("G10c os sete estados de validação, incluindo corrigido e expirado", () => {
  assert.equal(contrato.estadoDeValidacao(null), "nao_avaliado");
  assert.equal(contrato.estadoDeValidacao(null, { validadeVencida: true }), "expirado");
  assert.equal(contrato.estadoDeValidacao(registro()), "correto");
  assert.equal(
    contrato.estadoDeValidacao(registro({ verdict: "PARTIALLY_CORRECT" })),
    "parcialmente_correto",
  );
  assert.equal(contrato.estadoDeValidacao(registro({ verdict: "INCORRECT" })), "incorreto");
  assert.equal(
    contrato.estadoDeValidacao(registro({ verdict: "UNCONFIRMED" })),
    "nao_confirmado",
  );
  assert.equal(
    contrato.estadoDeValidacao(registro({ correcoes: ["reimpressao"] })),
    "corrigido",
  );
});

teste("G10d expirar NÃO apaga um veredito já dado dentro da validade", () => {
  assert.equal(
    contrato.estadoDeValidacao(registro(), { validadeVencida: true }),
    "correto",
  );
});

teste("G10e o repositório é idempotente pela chave natural", async () => {
  const repo = new repositorio.MemoryValidationRepository();
  const a = await repo.salvar(registro());
  const b = await repo.salvar(registro({ verdict: "INCORRECT" }));
  const todos = await repo.listar();
  assert.equal(todos.length, 1, "avaliar de novo empilhou um segundo registro");
  assert.equal(todos[0].verdict, "INCORRECT", "a correção não sobrescreveu");
  assert.equal(b.validation_id, a.validation_id, "o id mudou ao corrigir");
  assert.equal(b.created_at, a.created_at, "a hora de nascimento foi apagada");
});

teste("G10f o resumo declara ausência em vez de devolver zero", () => {
  const r = resumo.resumoDoTurno([]);
  assert.equal(c(r.unidade_de_maior_divergencia).observado, false);
  assert.equal(c(r.problemas_nao_detectados).observado, false);
  assert.equal(c(r.utilidade).observado, false);
  assert.equal(c(r.sinais_observados).observado, false);
  // Contagem de verdicts É zero legítimo: ninguém avaliou, e zero avaliações
  // é um número medido. A distinção é o ponto.
  assert.equal(c(r.total_avaliado).observado, true);
  assert.equal(c(r.total_avaliado).valor, 0);
});

teste("G10g o resumo conta o que foi registrado", () => {
  const r = resumo.resumoDoTurno([
    registro({ verdict: "INCORRECT", contexto: { unidade_id: "cozinha", fonte_id: "carga_cozinha" } }),
    registro({
      reading_id: "outra",
      verdict: "PARTIALLY_CORRECT",
      problema_nao_detectado: "A fila do caixa estava travada",
      utilidade: "ajudou",
      contexto: { unidade_id: "cozinha", fonte_id: "carga_cozinha" },
    }),
  ]);
  assert.equal(c(r.total_avaliado).valor, 2);
  assert.equal(c(r.incorreto).valor, 1);
  assert.equal(c(r.falsos_positivos).valor, 1);
  assert.equal(c(r.problemas_nao_detectados).valor, 1);
  assert.equal(c(r.unidade_de_maior_divergencia).valor, "cozinha");
});

/* ================================================================== *
 * G11 — Importação hostil
 * ================================================================== */

function pacote(registros: unknown[]) {
  return JSON.stringify({ schema: "deliveryos-lab-validation-export@1", registros });
}

teste("G11 importação recusa JSON inválido, schema errado e veredito inválido", () => {
  assert.equal(schema.importar("{").ok, false);
  assert.equal(schema.importar(JSON.stringify({ schema: "outro", registros: [] })).motivo, "schema_desconhecido");
  const r = schema.importar(pacote([{ ...registro(), verdict: "SIM" }]));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "veredito_invalido");
});

teste("G11b importação recusa PII — e recusa o pacote INTEIRO", () => {
  for (const veneno of [
    "cliente@exemplo.com",
    "(11) 98765-4321",
    "123.456.789-00",
    "Rua das Flores 200",
  ]) {
    const r = schema.importar(pacote([registro({ comentario: veneno })]));
    assert.equal(r.ok, false, `PII passou: ${veneno}`);
    assert.equal(r.motivo, "pii_detectada");
    assert.equal(r.registros.length, 0, "importou alguma coisa mesmo recusando");
  }
});

teste("G11c importação recusa marcação e URI executável", () => {
  for (const veneno of [
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "<script>x</script>",
  ]) {
    const r = schema.importar(pacote([registro({ comentario: veneno })]));
    assert.equal(r.ok, false, `executável passou: ${veneno}`);
    assert.equal(r.motivo, "conteudo_executavel");
  }
});

teste("G11d CONTROLE POSITIVO: um pacote legítimo do próprio Lab entra", () => {
  const r = schema.importar(pacote([registro({ comentario: "A bancada estava esperando reposicao" })]));
  assert.equal(r.ok, true, `o importador recusou um pacote válido: ${r.detalhe}`);
  assert.equal(r.registros.length, 1);
  assert.equal(r.registros[0].marcacao.autenticado, false);
});

teste("G11f campo estrutural NÃO é PII — e no texto livre ainda é", () => {
  // Este par nasceu de DOIS defeitos, os dois achados pelo gate:
  //
  //   `validation_id` é UUID, e um segmento com oito dígitos casava com CEP —
  //   a exportação recusava pacotes limpos DE VEZ EM QUANDO;
  //   `versao_fixture` vale `lab-v4-fixtures@1.0.0`, indistinguível de e-mail —
  //   e esse recusava TODA exportação, sempre.
  const idNumerico = "01310-100-4f2a-9c11-aa0000000001";
  const comId = schema.exportar([registro({ validation_id: idNumerico })], {});
  assert.equal(comId.ok, true, `identificador estrutural foi lido como PII: ${comId.detalhe}`);

  // A versão REAL da fixture, e não uma inventada para o teste passar.
  const comVersao = schema.exportar([registro({ versao_fixture: VERSAO_FIXTURE })], {});
  assert.equal(
    comVersao.ok,
    true,
    `a versão da fixture foi lida como PII: ${comVersao.detalhe}`,
  );

  // OS PARES SIMÉTRICOS, sem os quais o recorte acima viraria um buraco: as
  // MESMAS sequências, em campo que a pessoa digita, continuam recusadas.
  const cepNoTexto = schema.exportar([registro({ comentario: "entregar no 01310-100" })], {});
  assert.equal(cepNoTexto.ok, false, "CEP em campo de texto livre passou");
  assert.equal(cepNoTexto.json, null);

  const emailNoTexto = schema.exportar(
    [registro({ acao_mais_util: "avisar joao@exemplo.com.br" })],
    {},
  );
  assert.equal(emailNoTexto.ok, false, "e-mail em campo de texto livre passou");
});

teste("G11g conteúdo executável é procurado ATÉ nos campos estruturais", () => {
  // O recorte de PII não vale para marcação: não existe identificador legítimo
  // que contenha `<script`, e o custo de um falso positivo aqui é zero.
  const r = schema.importar(
    JSON.stringify({
      schema: "deliveryos-lab-validation-export@1",
      registros: [{ ...registro(), scenario_id: "<script>x</script>" }],
    }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "conteudo_executavel");
});

teste("G11e a exportação também recusa PII, na porta de saída", () => {
  const bom = schema.exportar([registro({ comentario: "tudo certo" })], {});
  assert.equal(bom.ok, true);
  const ruim = schema.exportar([registro({ comentario: "liga pro 11987654321" })], {});
  assert.equal(ruim.ok, false);
  assert.equal(ruim.json, null);
});

/* ================================================================== *
 * G12 — O servidor recusa escrita
 * ================================================================== */

function requisitar(
  porta: number,
  metodo: string,
  caminho: string,
): Promise<{ status: number; allow: string | undefined; corpo: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: porta, method: metodo, path: caminho },
      (res) => {
        let corpo = "";
        res.on("data", (d) => (corpo += d));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            allow: res.headers.allow,
            corpo,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

teste("G12 POST, PUT, PATCH e DELETE recebem 405 com Allow, sem mutação", async () => {
  const s = criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const porta = (s.address() as { port: number }).port;
  try {
    const antes = await requisitar(porta, "GET", "/lab/operacao-viva-v4/api/cena/calma-real");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await requisitar(porta, m, "/lab/operacao-viva-v4/api/cena/calma-real");
      assert.equal(r.status, 405, `${m} não recebeu 405`);
      assert.equal(r.allow, "GET, HEAD", `${m} não declarou Allow`);
      assert.match(r.corpo, /metodo_nao_permitido/);
    }
    const depois = await requisitar(porta, "GET", "/lab/operacao-viva-v4/api/cena/calma-real");
    assert.equal(depois.corpo, antes.corpo, "a recusa mudou o estado do servidor");
    assert.equal(depois.status, 200);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});

teste("G12b as dezoito cenas respondem, e uma desconhecida devolve 404", async () => {
  const s = criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const porta = (s.address() as { port: number }).port;
  try {
    assert.equal(IDS_DAS_CENAS.length, 18);
    for (const id of IDS_DAS_CENAS) {
      const r = await requisitar(porta, "GET", `/lab/operacao-viva-v4/api/cena/${id}`);
      assert.equal(r.status, 200, `${id} não respondeu`);
    }
    const nao = await requisitar(porta, "GET", "/lab/operacao-viva-v4/api/cena/inexistente");
    assert.equal(nao.status, 404);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});

/* ================================================================== *
 * MUTAÇÕES
 * ================================================================== */

interface Mutacao {
  readonly id: string;
  readonly arquivo: string;
  readonly de: string;
  readonly para: string;
  /** Prefixo da guarda que PRECISA acusar. */
  readonly acusa: string;
}

const MUTACOES: readonly Mutacao[] = [
  {
    id: "MD1 fonte atrasada passa a sustentar calma",
    arquivo: "dominio/estado-fonte.ts",
    de: `    confianca_permitida: "reduzida",
    acao_recomendada: "Confirmar no olho antes de agir sobre o que veio desta fonte.",
    sustenta_calmo: false,`,
    para: `    confianca_permitida: "reduzida",
    acao_recomendada: "Confirmar no olho antes de agir sobre o que veio desta fonte.",
    sustenta_calmo: true,`,
    acusa: "G5b",
  },
  {
    id: "MD2 parcial sem cobertura passa a valer como saudável",
    arquivo: "dominio/estado-fonte.ts",
    de: `      if (ambientesAindaCobertos === undefined) {
        return {
          estado: "indisponivel",`,
    para: `      if (ambientesAindaCobertos === undefined) {
        return {
          estado: "saudavel",`,
    acusa: "G5d",
  },
  {
    id: "MD3 Sushi Quentes volta a ser absorvido pelo Sushi",
    arquivo: "dominio/unidade-operacional.ts",
    de: `  if (praca === "enrolados_quentes") return "sushi_quentes";`,
    para: `  if (praca === "enrolados_quentes") return "sushi";`,
    acusa: "G2",
  },
  {
    id: "MD4 condição não declarada passa a valer como comprovada",
    arquivo: "dominio/unidade-operacional.ts",
    de: `      estado: d?.estado ?? "nao_observada",`,
    para: `      estado: d?.estado ?? "comprovada",`,
    acusa: "G8",
  },
  {
    id: "MD5 o rebaixamento do Calmo deixa de acontecer",
    arquivo: "dominio/modo-v4.ts",
    de: `  if (modoCanonico === "calmo" && motivos.length > 0) {`,
    para: `  if (false && modoCanonico === "calmo" && motivos.length > 0) {`,
    acusa: "G6",
  },
  {
    /**
     * A PRIMEIRA versão desta mutação era CEGA, e vale registrar por quê: ela
     * fazia `chaveDoSinal` devolver uma constante. Com isso, `sinais.find`
     * passava a devolver o PRIMEIRO sinal — e como a lista vem ordenada por
     * severidade decrescente, o primeiro já era o eleito. A mutação existia,
     * carregava, e **não mudava a execução**. É a L41 na prática: a fixture
     * reproduzia o resultado certo por acidente de ordenação.
     *
     * Esta versão é material: ela reintroduz o defeito ORIGINAL, que era pegar
     * a referência vinda do outro array (`homeVM` chama `sinaisDe` por dentro,
     * e devolve objetos diferentes). Aí `s !== focoSinal` nunca casa e o Foco
     * aparece duplicado entre os secundários.
     */
    id: "MD6 o Foco volta a ser comparado por referência de outro array",
    arquivo: "dominio/vm-v4.ts",
    de: `      ? (sinais.find((s) => chaveDoSinal(s) === chaveDoFoco) ?? null)
      : null;`,
    para: `      ? (canonica.foco !== null ? canonica.foco.sinal : null)
      : null;`,
    acusa: "G3",
  },
  {
    /**
     * A mutação que teria pego o achado 5.1 antes do avaliador. Ela remove a
     * fonte que declara a ausência de medição do despacho — e o Motoboy volta a
     * pintar verde sem nada por trás, exatamente como estava.
     */
    id: "MD9 o Motoboy perde a fonte que declara a ausência de medição",
    arquivo: "fixtures/cenarios.ts",
    de: `  FONTE_COMANDA,
  FONTE_MOTOBOY,
];`,
    para: `  FONTE_COMANDA,
];`,
    acusa: "G7",
  },
  {
    id: "MD7 a importação deixa de procurar PII",
    arquivo: "validacao/schema.js",
    de: `  const pii = acharPII(bruto);
  if (pii.length > 0) {`,
    para: `  const pii = acharPII(bruto);
  if (false && pii.length > 0) {`,
    acusa: "G11b",
  },
  {
    id: "MD8 a correção deixa de virar estado corrigido",
    arquivo: "validacao/contrato.js",
    de: `  if (registro.correcoes.length > 0 || registro.correcao_texto !== null) {
    return "corrigido";
  }`,
    para: `  if (false) {
    return "corrigido";
  }`,
    acusa: "G10c",
  },
];

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * As flags de carregamento que o `tsx` injetou neste processo.
 *
 * O filho precisa delas: sem `--require`/`--import`, o Node receberia um `.ts`
 * cru e morreria de erro de sintaxe — e uma mutação que derruba o filho por
 * motivo errado passaria por "acusada". Reaproveitar as flags do processo atual
 * é mais honesto do que adivinhar onde o `tsx` está instalado.
 */
function flagsDeCarregamento(): string[] {
  const flags: string[] = [];
  const argv = process.execArgv;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--require" || argv[i] === "--import") {
      flags.push(argv[i]!, argv[i + 1]!);
      i += 1;
    }
  }
  return flags;
}

function rodarGuardasEmFilho(): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync(
      process.execPath,
      [...flagsDeCarregamento(), process.argv[1]!, "--guardas"],
      { cwd: raiz, encoding: "utf8", env: { ...process.env, LAB_V4_FILHO: "1" } },
    );
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, saida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

async function rodarMutacoes(): Promise<void> {
  console.log("\nMUTAÇÕES — cada garantia precisa de uma quebra que a derrube\n");
  let acusadas = 0;
  const cegas: string[] = [];
  const naoAplicadas: string[] = [];

  for (const m of MUTACOES) {
    const caminho = join(LAB, m.arquivo);
    const original = readFileSync(caminho, "utf8");
    const hashOriginal = sha(original);

    if (!original.includes(m.de)) {
      naoAplicadas.push(`${m.id}: âncora não encontrada em ${m.arquivo}`);
      continue;
    }
    const mutado = original.replace(m.de, m.para);
    if (mutado === original) {
      naoAplicadas.push(`${m.id}: a substituição não mudou nada`);
      continue;
    }

    writeFileSync(caminho, mutado);
    try {
      // ETAPA "carregada": processo filho, senão o módulo já importado aqui
      // continuaria valendo e a mutação sairia cega por acidente de cache.
      const r = rodarGuardasEmFilho();
      if (r.ok) {
        cegas.push(`${m.id}: a suíte ficou VERDE com a mutação aplicada`);
      } else if (!r.saida.includes(m.acusa)) {
        cegas.push(
          `${m.id}: reprovou, mas NÃO por ${m.acusa} — outra guarda pegou, e a que deveria proteger não protege`,
        );
      } else {
        acusadas += 1;
        console.log(`  ✓ ${m.id}  →  acusada por ${m.acusa}`);
      }
    } finally {
      writeFileSync(caminho, original);
      const restaurado = sha(readFileSync(caminho, "utf8"));
      if (restaurado !== hashOriginal) {
        falhas.push(`${m.id}: RESTAURAÇÃO FALHOU — ${m.arquivo} não voltou byte a byte`);
      }
    }
  }

  console.log(
    `\nmutações: ${MUTACOES.length} · acusadas: ${acusadas} · cegas: ${cegas.length} · não aplicadas: ${naoAplicadas.length}`,
  );
  for (const c of cegas) falhas.push(`MUTAÇÃO CEGA — ${c}`);
  for (const n of naoAplicadas) falhas.push(`MUTAÇÃO NÃO APLICADA — ${n}`);
}

/* ================================================================== *
 * Execução
 * ================================================================== */

const soGuardas = process.argv.includes("--guardas");

void Promise.all(pendentes).then(async () => {
  if (!soGuardas) {
    console.log(`\nGuardas: ${passaram} passaram, ${falhas.length} falharam`);
  }
  for (const f of falhas) console.error(`  ✗ ${f}`);

  if (falhas.length > 0) {
    console.error("\nLAB_V4_GATE_RED");
    process.exit(1);
  }

  if (soGuardas) {
    console.log(`LAB_V4_GUARDAS_VERDES ${passaram}`);
    return;
  }

  await rodarMutacoes();
  if (falhas.length > 0) {
    for (const f of falhas) console.error(`  ✗ ${f}`);
    console.error("\nLAB_V4_GATE_RED");
    process.exit(1);
  }
  console.log("\nLAB_V4_GATE_GREEN");
});
