/**
 * GATE R5-D0-C — CONTRATO HONESTO DE CONFIANCA
 * ============================================================================
 * A confianca deixa de ser inventada. Este gate prova que o DeliveryOS
 * distingue **nao estimada** de **apurada**, e que nenhuma das conversoes
 * proibidas voltou pela porta dos fundos.
 *
 * A regra de forma, e ela e o coracao da mudanca: `confidence?: number` deixaria
 * a ausencia AMBIGUA — um campo que some nao diz se ninguem apurou, se a
 * apuracao falhou, ou se alguem esqueceu. Com a uniao discriminada, nao estimar
 * e uma decisao declarada.
 *
 * `nao_estimada` NAO e zero e NAO e confianca baixa. Zero e uma apuracao de
 * valor zero — uma afirmacao. Nao estimada e a recusa de afirmar.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POLICY_VERSION,
  recomendar,
  validarDraftShadow as validadorDoShadow,
  type Recomendacao,
} from "./copiloto/shadow";
import {
  ENTRADA_SUPORTADA,
  SAIDA_SUPORTADA,
  VERSAO_TRADUCAO,
  traduzirParaShadow,
  validarDraftShadow as validadorDaFronteira,
  type EntradaTraducaoMotorShadow,
  type EscopoDoSujeito,
} from "../product/atencao/traducao-motor-shadow";
import { avaliarProntidaoR5D, conferirConfianca } from "../product/atencao/prontidao-r5d";
import { homeVM } from "../product/viewmodels/home-vm";
import { cenaFoco } from "../product/demo/seed-home-demonstracao";

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
const ARTEFATOS = [
  "src/platform/copiloto/shadow.ts",
  "src/product/atencao/traducao-motor-shadow.ts",
  "src/product/atencao/prontidao-r5d.ts",
  "src/product/viewmodels/home-vm.ts",
  "src/product/ui/surfaces/home.js",
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
 * Fixtures                                                            *
 * ------------------------------------------------------------------ */

const CAUSA = "s5|sushi|enrolados_quentes|-|carga_pracas";
const AGORA = "2026-08-03T20:40:00.000Z";
const SUJEITO: EscopoDoSujeito = { tipo: "subarea", subarea: "enrolados_quentes" };

const APURADA = {
  estado: "apurada" as const,
  valor: 0.72,
  politica: "capacidade-saturada",
  versao_da_politica: SAIDA_SUPORTADA,
  evidencias: ["evt-1", "evt-2"],
};

const entrada = (over: Partial<EntradaTraducaoMotorShadow> = {}): EntradaTraducaoMotorShadow => ({
  versao_entrada: ENTRADA_SUPORTADA,
  versao_saida: SAIDA_SUPORTADA,
  foco: { modo: "foco", identidade: CAUSA, orientacao_permitida: true },
  acao: {
    contrato: ENTRADA_SUPORTADA,
    tipo: "priorizar_praca",
    acao: "Priorizar Sushi Quentes",
    porque: "5 pedidos na praca",
    impacto: "libera 2 saidas",
    confianca_rotulo: "alta",
    praca: "enrolados_quentes",
    id_curto_exibido: null,
    causa_da_acao: CAUSA,
  },
  escopo: SUJEITO,
  evidencias: {
    evento_ids: ["evt-1", "evt-2"],
    vinculo_causa: CAUSA,
    vinculo_sujeito: SUJEITO,
    observado_em: AGORA,
    qualidade: "completa",
  },
  procedencia: {
    natureza: "real",
    source_mode: "real",
    projection_version: "operacao-viva@1.0.0",
    transformacao: "projecao",
    regra: VERSAO_TRADUCAO,
    limitacoes: [],
  },
  confianca: APURADA,
  risco: "medio",
  validade: { validade_s: 600, origem: "politica_documentada", politica_id: "p" },
  retirada: { quando: ["validade_expirou"] },
  agora_iso: AGORA,
  recommendation_id: "rec-1",
  policy_id: "p",
  destino: "real",
  indisponivel: [],
  ...over,
});

const draft = (over: Partial<Recomendacao> = {}): Recomendacao => ({
  recommendation_id: "rec-1",
  policy_id: "p",
  policy_version: POLICY_VERSION,
  input_event_ids: ["evt-1"],
  projection_version: "v",
  source_mode: "real",
  confianca: { ...APURADA, versao_da_politica: POLICY_VERSION },
  risk_level: "medio",
  recommended_action: "a",
  reason: "r",
  indisponivel: [],
  requires_human: true,
  created_at: AGORA,
  expires_at: "2026-08-03T20:50:00.000Z",
  status: "proposed",
  ...over,
});

const bloqueio = (e: EntradaTraducaoMotorShadow): string => {
  const r = traduzirParaShadow(e);
  return r.tipo === "bloqueada" ? r.motivo : `<${r.tipo}>`;
};

/* ================================================================== *
 * NAO ESTIMADA                                                        *
 * ================================================================== */

teste("C01 `nao_estimada` e aceita pelo validador e NAO vira zero", () => {
  const d = draft({ confianca: { estado: "nao_estimada" } });
  const v = validadorDoShadow(d);
  assert.equal(v.aceito, true, v.aceito === false ? v.motivo : "");
  assert.equal(d.confianca.estado, "nao_estimada");
  // O tipo nao tem onde guardar zero neste ramo — a ausencia e ESTRUTURAL.
  assert.equal("valor" in d.confianca, false, "nao estimada carregou valor");
  // E zero, quando apurado, e coisa diferente e legitima.
  const zero = draft({ confianca: { ...APURADA, versao_da_politica: POLICY_VERSION, valor: 0 } });
  assert.equal(validadorDoShadow(zero).aceito, true);
  assert.equal(zero.confianca.estado === "apurada" && zero.confianca.valor, 0);
});

teste("C02 recomendacao `nao_estimada` continua exigindo evidencia, procedencia, validade e retirada", () => {
  const semConfianca = { confianca: { estado: "nao_estimada" as const } };
  // Traduz quando tudo o mais esta presente.
  const ok = traduzirParaShadow(entrada(semConfianca));
  assert.equal(ok.tipo, "traduzida", bloqueio(entrada(semConfianca)));
  // E continua bloqueando quando falta qualquer um dos outros contratos.
  assert.equal(bloqueio(entrada({ ...semConfianca, evidencias: null })), "evidencia_insuficiente");
  assert.equal(bloqueio(entrada({ ...semConfianca, procedencia: null })), "procedencia_ausente");
  assert.equal(bloqueio(entrada({ ...semConfianca, validade: null })), "validade_ausente");
  assert.equal(bloqueio(entrada({ ...semConfianca, retirada: null })), "retirada_ausente");
  assert.equal(
    bloqueio(entrada({ ...semConfianca, acao: { ...entrada().acao!, causa_da_acao: "outra" } })),
    "causa_raiz_divergente",
  );
});

/* ================================================================== *
 * APURADA EXIGE LASTRO                                                *
 * ================================================================== */

teste("C03 confianca apurada sem politica, versao ou evidencia e RECUSADA", () => {
  assert.equal(bloqueio(entrada({ confianca: { ...APURADA, politica: "" } })), "confianca_sem_politica");
  assert.equal(
    bloqueio(entrada({ confianca: { ...APURADA, versao_da_politica: "" } })),
    "confianca_sem_politica",
  );
  assert.equal(bloqueio(entrada({ confianca: { ...APURADA, evidencias: [] } })), "confianca_sem_evidencia");
  // E no validador do Shadow, os mesmos tres.
  assert.equal(
    validadorDoShadow(draft({ confianca: { ...APURADA, versao_da_politica: POLICY_VERSION, politica: "" } })).aceito,
    false,
  );
  assert.equal(
    validadorDoShadow(draft({ confianca: { ...APURADA, versao_da_politica: POLICY_VERSION, evidencias: [] } })).aceito,
    false,
  );
});

teste("C04 valor fora do intervalo e recusado, e zero nao e fora", () => {
  for (const fora of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(bloqueio(entrada({ confianca: { ...APURADA, valor: fora } })), "confianca_fora_de_faixa", `${fora}`);
  }
  for (const dentro of [0, 0.5, 1]) {
    const r = traduzirParaShadow(entrada({ confianca: { ...APURADA, valor: dentro } }));
    assert.equal(r.tipo, "traduzida", `recusou ${dentro}`);
  }
});

/* ================================================================== *
 * CONVERSOES PROIBIDAS                                                *
 * ================================================================== */

teste("C05 severidade e rotulo qualitativo NAO produzem confianca", () => {
  const sev = conferirConfianca(
    { tipo: "apurada", valor: 0.8, regra: "severidade >= 3 vira 0.8" },
    2,
  );
  assert.equal(sev.suportada, false);
  assert.equal(sev.suportada === false && sev.motivo, "severity_used_as_confidence");
  for (const regra of ["rotulo alta", "label media do motor", "baixa vira 0.3"]) {
    const r = conferirConfianca({ tipo: "apurada", valor: 0.9, regra }, 2);
    assert.equal(r.suportada, false, `converteu com "${regra}"`);
    assert.equal(r.suportada === false && r.motivo, "qualitative_label_not_convertible");
  }
  // O rotulo do motor continua existindo no adaptador e NAO vira numero.
  const fonte = ler("src/product/atencao/traducao-motor-shadow.ts");
  assert.match(fonte, /confianca_rotulo: "alta" \| "média" \| "baixa"/);
  const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(semComentario, /confianca_rotulo\s*===/, "o rotulo passou a ser lido como valor");
});

teste("C06 fixture nao pode declarar confianca apurada no caminho REAL", () => {
  const r = traduzirParaShadow(
    entrada({ procedencia: { ...entrada().procedencia!, natureza: "fixture", source_mode: "real" } }),
  );
  assert.equal(r.tipo, "bloqueada");
  assert.equal(r.tipo === "bloqueada" && r.motivo, "procedencia_incompativel");
  // Mesmo com confianca apurada impecavel: a procedencia barra antes.
  assert.equal(
    bloqueio(
      entrada({
        confianca: APURADA,
        procedencia: { ...entrada().procedencia!, natureza: "demonstracao", source_mode: "control" },
      }),
    ),
    "procedencia_incompativel",
  );
});

/* ================================================================== *
 * O TRADUTOR PRESERVA, NUNCA CALCULA                                  *
 * ================================================================== */

teste("C07 o tradutor PRESERVA a confianca recebida, byte a byte", () => {
  const r = traduzirParaShadow(entrada());
  assert.equal(r.tipo, "traduzida");
  if (r.tipo !== "traduzida") return;
  assert.deepEqual(r.draft.confianca, APURADA, "o tradutor alterou a confianca");
  const sem = traduzirParaShadow(entrada({ confianca: { estado: "nao_estimada" } }));
  assert.equal(sem.tipo, "traduzida");
  if (sem.tipo !== "traduzida") return;
  assert.deepEqual(sem.draft.confianca, { estado: "nao_estimada" });
  // Estrutural: o tradutor nao tem aritmetica de confianca nem default.
  const fonte = ler("src/product/atencao/traducao-motor-shadow.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const proibido of [/confianca\s*[*+/-]\s*\d/, /confianca\s*(\?\?|\|\|)\s*[\d{]/, /Math\.(min|max|round)\(.*confianca/]) {
    assert.doesNotMatch(fonte, proibido, `o tradutor passou a calcular confianca: ${proibido}`);
  }
});

/* ================================================================== *
 * HOME                                                                *
 * ================================================================== */

teste("C08 a home NAO tem mais a derivacao 0.8/0.6", () => {
  const vm = ler("src/product/viewmodels/home-vm.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(vm, /severidade\s*>=\s*3\s*\?\s*0\.8\s*:\s*0\.6/, "a derivacao voltou");
  assert.doesNotMatch(vm, /observado\(\s*sinal\.severidade/, "severidade voltou a virar confianca");
});

teste("C09 a home NAO apresenta porcentagem para confianca nao estimada", () => {
  const vm = homeVM(cenaFoco(), { tipo: "demonstracao", motivo: "fixture" });
  assert.notEqual(vm.foco, null);
  const o = vm.foco!.orientacao!;
  assert.equal(o.confianca.observado, false, "a home voltou a afirmar confianca");
  assert.ok(!("valor" in (o.confianca as object)), "confianca ausente carregou valor");
  // E a superficie omite o campo em vez de desenhar um bloco de ausencia.
  const home = ler("src/product/ui/surfaces/home.js");
  assert.match(
    home,
    /o\.confianca && o\.confianca\.observado === true\s*\?\s*campo\("Confianca", o\.confianca\)/,
    "a home voltou a renderizar o campo incondicionalmente",
  );
});

/* ================================================================== *
 * VALIDADOR UNICO E PREFLIGHT                                         *
 * ================================================================== */

teste("C10 runtime e harness continuam com o MESMO validador", () => {
  assert.equal(validadorDaFronteira, validadorDoShadow, "o validador voltou a se duplicar");
  const fonte = ler("src/platform/copiloto/shadow.ts");
  assert.match(fonte, /if \(!validarDraftShadow\(candidata\)\.aceito\) continue;/);
  // Comportamento: politica que apura numero invalido nao emite recomendacao.
  const saida = recomendar(
    { projection_version: "v", source_mode: "real", viagens: [], dimensoes: {} } as never,
    {
      agora: new Date(AGORA),
      politicas: [
        {
          policy_id: "ruim",
          validade_s: 300,
          avaliar: () => ({
            recommended_action: "x",
            reason: "y",
            confidence: 1.7,
            risk_level: "medio" as const,
            input_event_ids: ["evt-1"],
            requires_human: true,
          }),
        },
      ],
    },
  );
  assert.equal(saida.length, 0, "recomendar() emitiu com confianca fora de faixa");
});

teste("C11 o preflight passa a SUPORTAR confianca e continua bloqueado por linhagem", () => {
  const conf = conferirConfianca({ tipo: "nao_estimada", motivo: "sem apuracao" }, 2);
  assert.equal(conf.suportada, true, "nao estimada continua bloqueando");
  assert.equal(conf.suportada === true && conf.valor, null, "nao estimada virou numero");
  // R5-D0-L acrescentou a QUARTA condicao (compatibilidade duravel). Isolando-a,
  // o bloqueio que sobra da confianca continua sendo um so: a linhagem.
  const p = avaliarProntidaoR5D({
    linhagem: { elegivel: false, motivo: "event_lineage_unavailable" },
    confianca: conf,
    validador_compartilhado: true,
    confianca_duravel_compativel: true,
    produtor_vivo_disponivel: true,
    pedido_qualificado: true,
    trabalho_praca_qualificado: true,
    capacidade_qualificada: true,
    caminho_de_leitura_seguro: true,
  });
  assert.equal(p.status, "blocked");
  assert.equal(p.status === "blocked" && p.bloqueios.length, 1, "sobrou mais de um bloqueio");
  assert.equal(p.status === "blocked" && p.bloqueios[0]!.motivo, "event_lineage_unavailable");
});

teste("C12 nenhum runtime, flag ou recomendacao nasceu nesta missao", () => {
  for (const arq of [
    "src/product/atencao/traducao-motor-shadow.ts",
    "src/product/atencao/prontidao-r5d.ts",
  ]) {
    const fonte = ler(arq).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const proibido of [/FEATURE_/, /FLAG_/, /\bput\s*\(/, /\bemit\s*\(/, /Date\.now\s*\(/]) {
      assert.doesNotMatch(fonte, proibido, `${arq} ganhou ${proibido}`);
    }
  }
  // CSS, tokens de movimento, sinais, areas e Figma seguem intocados.
  const saida = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "b100943",
      FIM_HISTORICO,
      "--",
      "src/product/ui/surfaces/home.css",
      "src/product/ui/tokens/",
        "src/product/viewmodels/areas.ts",
      "docs/figma/",
    ],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `ativo congelado alterado:\n${saida}`);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  const marcas = Object.fromEntries(ARTEFATOS.map((a) => [a, sha(ler(a)).slice(0, 16)]));
  console.log(`\nARTEFATOS ${JSON.stringify(marcas)}`);
  console.log(`\nR5-D0-C — contrato honesto de confianca: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D0_CONFIDENCE_GATE_GREEN");
});
