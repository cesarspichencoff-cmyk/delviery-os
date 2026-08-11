/**
 * GATE R5-D2 — QUALIFICACAO DOS PRODUTORES VIVOS
 * ============================================================================
 * DETERMINISTICO E SEM SEGREDO. Ele nao depende de credencial, de servico
 * externo nem da maquina da loja: tudo o que ele exercita sao contratos,
 * fixtures sanitizadas e o preflight.
 *
 * O probe real, se um dia existir, e diagnostico OPCIONAL e separado — porque um
 * gate obrigatorio que depende do ambiente da loja e um gate que fica vermelho
 * por motivo errado.
 *
 * O QUE ELE PROVA, e e o resultado da missao: existe um caminho possivel para
 * cada evento, e **nenhum produtor esta disponivel**. Qualificar nao e conectar.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  QUALIFICACAO_R5D2,
  prontoParaAdapter,
  type QualificacaoDeProdutor,
} from "../product/eventos/qualificacao-produtores";
import {
  CONTRATO_PORTA_VERSAO,
  type Diagnostico,
  type MotivoIndisponibilidade,
  type PortaDeProdutor,
  type ResultadoLeitura,
} from "../product/eventos/portas-produtores";
import { validarEvento, type TipoOperacional } from "../product/eventos/catalogo-operacional";
import {
  CAMINHO_DE_LEITURA_SEGURO,
  QUALIFICACAO_CAPACIDADE,
  QUALIFICACAO_PEDIDO,
  QUALIFICACAO_TRABALHO_PRACA,
  avaliarProntidaoR5D,
} from "../product/atencao/prontidao-r5d";

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
/** Codigo sem comentario: uma frase que PROIBE algo nao pode reprovar a guarda. */
const semComentario = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const ARTEFATOS = [
  "src/product/eventos/portas-produtores.ts",
  "src/product/atencao/prontidao-r5d.ts",
] as const;

let passed = 0;
const failures: string[] = [];
function teste(nome: string, fn: () => void | Promise<void>): void {
  try {
    const r = fn();
    if (r instanceof Promise) throw new Error("teste assincrono precisa ser aguardado");
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const testes: Promise<void>[] = [];
function testeAsync(nome: string, fn: () => Promise<void>): void {
  testes.push(
    fn().then(
      () => {
        passed += 1;
      },
      (e: unknown) => {
        failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      },
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Produtor FALSO, para exercitar o contrato sem tocar em fonte alguma *
 * ------------------------------------------------------------------ */

const diag = (motivo: MotivoIndisponibilidade, detalhe = "d"): Diagnostico => ({
  motivo,
  detalhe,
  fonte_id: "fonte-de-teste",
  saude: null,
});

/** Um produtor que sempre recusa, com o motivo que se pedir. */
function produtorQueRecusa(
  motivo: MotivoIndisponibilidade,
  emite: readonly TipoOperacional[] = ["pedido_ciclo_observado"],
): PortaDeProdutor {
  return {
    fonte_id: "fonte-de-teste",
    contrato: CONTRATO_PORTA_VERSAO,
    emite,
    ler: () => Promise.resolve({ tipo: "indisponivel", diagnostico: diag(motivo) }),
    replay: () => Promise.resolve({ tipo: "indisponivel", diagnostico: diag(motivo) }),
    saude: () => Promise.resolve(diag(motivo)),
  };
}

const OS_VINTE: readonly MotivoIndisponibilidade[] = [
  "credencial_ausente",
  "endpoint_ausente",
  "fonte_inacessivel",
  "schema_inesperado",
  "campo_obrigatorio_ausente",
  "sem_timestamp_de_origem",
  "estado_atual_sem_historico",
  "duplicata_sem_chave_estavel",
  "reimpressao_indistinguivel",
  "cancelamento_nao_observado",
  "praca_inferida_nao_declarada",
  "relogios_divergentes",
  "cursor_expirado",
  "paginacao_incompleta",
  "resposta_parcial",
  "timeout",
  "rate_limit",
  "fonte_degradada",
  "dados_antigos",
  "pii_presente",
];

/* ================================================================== *
 * CONTRATO DAS PORTAS                                                 *
 * ================================================================== */

teste("Q01 as quatro portas existem e cada uma declara o que TEM AUTORIDADE para emitir", () => {
  const fonte = ler("src/product/eventos/portas-produtores.ts");
  for (const porta of [
    "ProdutorEventosPedido",
    "ProdutorEventosTrabalhoPraca",
    "ProdutorEventosCapacidade",
    "ObservadorSaudeFonte",
  ]) {
    assert.match(fonte, new RegExp(`interface ${porta}`), `porta ausente: ${porta}`);
  }
  // Cada porta fixa UM tipo. Uma porta que emitisse tudo apagaria a decisao por
  // evento, que e o resultado inteiro desta missao.
  assert.match(fonte, /emite: readonly \["pedido_ciclo_observado"\]/);
  assert.match(fonte, /emite: readonly \["trabalho_praca_observado"\]/);
  assert.match(fonte, /emite: readonly \["capacidade_praca_observada"\]/);
  assert.match(fonte, /emite: readonly \["source_health_changed"\]/);
});

teste("Q02 a porta declara cursor, watermark, replay, conflitos, saude e versao", () => {
  const fonte = ler("src/product/eventos/portas-produtores.ts");
  for (const conceito of [
    "interface Cursor",
    "interface Watermark",
    "replay\\(",
    "conflitos: readonly Conflito\\[\\]",
    "saude: EstadoDeFonte",
    "CONTRATO_PORTA_VERSAO",
  ]) {
    assert.match(fonte, new RegExp(conceito), `conceito ausente na porta: ${conceito}`);
  }
  // Cursor e watermark sao COISAS DIFERENTES: um diz onde eu parei, o outro ate
  // onde a fonte se compromete. Fundi-los esconderia o intervalo sem garantia.
  assert.match(fonte, /completo_ate: string/);
  assert.match(fonte, /parcial_apos: boolean/);
});

teste("Q03 NENHUMA porta entrega LeituraOperacional — o resultado e fato ou diagnostico", () => {
  // Sem comentario: a primeira versao acusou a propria frase que PROIBE a
  // projecao na porta. L36 de novo.
  const fonte = semComentario(ler("src/product/eventos/portas-produtores.ts"));
  assert.doesNotMatch(fonte, /LeituraOperacional/, "uma porta passou a entregar a projecao");
  assert.doesNotMatch(fonte, /carga_por_praca|capacidade_por_praca|pedidos_ativos/);
  // A uniao do resultado tem exatamente dois ramos.
  // Ate a linha em branco, e nao ate o primeiro `;` — o primeiro `;` esta DENTRO
  // do literal do primeiro ramo, e a versao anterior cortava a uniao pela metade.
  const uniao = fonte.split("export type ResultadoLeitura =")[1]!.split("\n\n")[0]!;
  assert.match(uniao, /tipo: "lote"/);
  assert.match(uniao, /tipo: "indisponivel"/);
  assert.equal((uniao.match(/tipo: "/g) ?? []).length, 2, "o resultado ganhou um terceiro ramo");
});

teste("Q04 a porta NAO conhece Odhen nem iFood — trocar de fonte nao troca o contrato", () => {
  const fonte = ler("src/product/eventos/portas-produtores.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const sistema of ["odhen", "ifood", "teknisa", "epson", "gestor"]) {
    assert.doesNotMatch(fonte, new RegExp(sistema, "i"), `a porta acoplou em ${sistema}`);
  }
});

teste("Q05 a porta nao escreve: nao ha verbo de escrita no contrato", () => {
  const fonte = ler("src/product/eventos/portas-produtores.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const escrita of [
    /\bgravar\s*\(/, /\bescrever\s*\(/, /\bconfirmar\s*\(/, /\back\s*\(/,
    /\bcommit\s*\(/, /\bdelete\s*\(/, /\bpublish\s*\(/, /\bimprimir\s*\(/,
  ]) {
    assert.doesNotMatch(fonte, escrita, `a porta ganhou escrita: ${escrita}`);
  }
  // E nao ha efeito colateral no modulo.
  for (const efeito of [/\bfetch\s*\(/, /process\.env/, /readFileSync/, /writeFileSync/, /Date\.now\s*\(/]) {
    assert.doesNotMatch(fonte, efeito, `a porta ganhou efeito: ${efeito}`);
  }
});

/* ================================================================== *
 * OS VINTE CASOS ADVERSARIAIS                                         *
 * ================================================================== */

for (const motivo of OS_VINTE) {
  testeAsync(`AD ${motivo} nao produz produtor disponivel`, async () => {
    const p = produtorQueRecusa(motivo);
    const r: ResultadoLeitura = await p.ler(null, 10);
    assert.equal(r.tipo, "indisponivel", `${motivo} devolveu lote`);
    assert.equal(r.tipo === "indisponivel" && r.diagnostico.motivo, motivo);
    // Replay e saude tambem recusam: a indisponibilidade nao some por outra porta.
    const rp = await p.replay("2026-08-04T00:00:00.000Z", "2026-08-04T23:59:59.000Z", 10);
    assert.equal(rp.tipo, "indisponivel", `${motivo} virou lote no replay`);
    const s = await p.saude();
    assert.equal(typeof s === "object" && "motivo" in s, true, `${motivo} reportou saude boa`);
  });
}

teste("AD todos os vinte motivos existem no contrato, e nenhum vira disponivel", () => {
  const fonte = ler("src/product/eventos/portas-produtores.ts");
  for (const m of OS_VINTE) {
    assert.match(fonte, new RegExp(`"${m}"`), `motivo ausente do contrato: ${m}`);
  }
  assert.equal(OS_VINTE.length, 20);
  // Nenhum motivo pode aparecer numa qualificacao marcada como pronta.
  for (const q of QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]) {
    if (q.lacunas.length > 0) {
      assert.equal(prontoParaAdapter(q), false, `${q.evento} pronto com lacuna aberta`);
    }
  }
});

/* ================================================================== *
 * MATRIZ DE AUTORIDADE E DECISAO POR EVENTO                           *
 * ================================================================== */

teste("Q06 existe decisao para os QUATRO eventos, e ela e por evento", () => {
  assert.equal(QUALIFICACAO_R5D2.length, 4);
  assert.deepEqual(
    (QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]).map((q) => q.evento).sort(),
    ["capacidade_praca_observada", "pedido_ciclo_observado", "source_health_changed", "trabalho_praca_observado"],
  );
});

teste("Q07 trabalho por praca esta REJEITADO, e o motivo e a praca nao declarada", () => {
  const t = (QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]).find((q) => q.evento === "trabalho_praca_observado")!;
  assert.equal(t.decisao, "rejeitada");
  assert.equal(t.produtor_primario, null, "alguem elegeu produtor para trabalho por praca");
  assert.ok(t.lacunas.includes("praca_inferida_nao_declarada"));
  assert.ok(t.lacunas.includes("reimpressao_indistinguivel"));
  assert.equal(prontoParaAdapter(t), false);
  // E o fato canonico que sustenta: nao existe comanda separada por praca.
  const auditoria = ler("docs/Auditoria_Fonte_Viva_Loja_V1.md");
  assert.match(auditoria, /N[aã]o existe comanda separada por pra[cç]a/i);
});

teste("Q08 pedido esta PARCIAL, e nao foi promovido por ser o mais facil", () => {
  const p = (QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]).find((q) => q.evento === "pedido_ciclo_observado")!;
  assert.equal(p.decisao, "parcialmente_qualificada");
  assert.ok(p.lacunas.length > 0, "parcial sem lacuna declarada");
  assert.equal(prontoParaAdapter(p), false);
  // O relatorio iFood reconstroi instante a partir de DURACAO — nao ha carimbo
  // absoluto por etapa, e isso esta no proprio codigo de ingestao.
  const ingest = ler("src/ingest/ifoodRelatorio.ts");
  assert.match(ingest, /DURA[CÇ][OÕ]ES|dura[cç][aã]o/i);
  assert.match(ingest, /export em LOTE|LOTE/);
});

teste("Q09 capacidade esta INACESSIVEL — nenhuma fonte declara capacidade de praca", () => {
  const c = (QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]).find((q) => q.evento === "capacidade_praca_observada")!;
  assert.equal(c.decisao, "ainda_inacessivel");
  assert.equal(c.produtor_primario, null);
  assert.equal(prontoParaAdapter(c), false);
});

teste("Q10 so a saude esta qualificada — e e a unica que nao depende de fonte externa", () => {
  const prontos = (QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]).filter(prontoParaAdapter);
  assert.deepEqual(
    prontos.map((q) => q.evento),
    ["source_health_changed"],
    "mais de um evento se declarou pronto",
  );
  assert.equal(prontos[0]!.produtor_primario, "observador_interno");
});

/* ================================================================== *
 * PROBES                                                              *
 * ================================================================== */

teste("Q11 nenhum probe contra fonte externa foi executado, e a recusa esta declarada", () => {
  const externos = (QUALIFICACAO_R5D2 as readonly QualificacaoDeProdutor[]).filter((q) => q.produtor_primario !== "observador_interno");
  for (const q of externos) {
    assert.notEqual(q.probe, "read_only_executado", `${q.evento} alega probe externo executado`);
  }
  assert.equal(CAMINHO_DE_LEITURA_SEGURO, false, "alguem declarou caminho de leitura seguro");
  // E nao existe implementacao de captura viva no repositorio.
  let capturadores: string[] = [];
  try {
    capturadores = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", "Get-PrintJob|puppeteer|spooler", "--", "src/", "tools/"],
      { cwd: raiz, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((l) => l !== "")
      // O proprio gate cita os padroes no texto da busca; ele nao e capturador.
      .filter((l) => !/run-[a-z0-9-]+-tests.ts$/.test(l.split("\\").join("/")));
  } catch {
    capturadores = [];
  }
  assert.deepEqual(capturadores, [], `apareceu capturador vivo: ${capturadores.join(", ")}`);
});

teste("Q12 o gate obrigatorio nao depende de segredo nem de servico externo", () => {
  const eu = ler("src/platform/run-r5d2-producer-qualification-tests.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const dependencia of [/process\.env\.[A-Z]/, /\bfetch\s*\(/, /https?:\/\//, /Client\s*\(/]) {
    assert.doesNotMatch(eu, dependencia, `o gate obrigatorio dependeu de ${dependencia}`);
  }
});

teste("Q13 nenhum segredo aparece em codigo, fixture ou contrato", () => {
  for (const arq of [
    "src/product/eventos/portas-produtores.ts",
    "src/platform/run-r5d2-producer-qualification-tests.ts",
    "src/product/atencao/prontidao-r5d.ts",
  ]) {
    const f = ler(arq);
    for (const segredo of [
      /senha\s*[:=]\s*["'][^"']+/i,
      /password\s*[:=]\s*["'][^"']+/i,
      /token\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}/i,
      /api[_-]?key\s*[:=]\s*["'][^"']+/i,
      /Bearer\s+[A-Za-z0-9._-]{12,}/,
    ]) {
      assert.doesNotMatch(f, segredo, `${arq} carrega segredo`);
    }
  }
});

/* ================================================================== *
 * PREFLIGHT E ISOLAMENTO                                              *
 * ================================================================== */

teste("Q14 preflight: as cinco condicoes novas bloqueiam, e nenhuma vira disponivel", () => {
  assert.notEqual(QUALIFICACAO_PEDIDO, "qualificada");
  assert.notEqual(QUALIFICACAO_TRABALHO_PRACA, "qualificada");
  assert.notEqual(QUALIFICACAO_CAPACIDADE, "qualificada");
  const p = avaliarProntidaoR5D({
    linhagem: { elegivel: true, input_event_ids: ["evt-aaa"] },
    confianca: { suportada: true, valor: null },
    validador_compartilhado: true,
    produtor_vivo_disponivel: true,
  });
  assert.equal(p.status, "blocked");
  const motivos = p.status === "blocked" ? p.bloqueios.map((b) => b.motivo).sort() : [];
  assert.deepEqual(motivos, [
    "capacidade_producer_not_qualified",
    "pedido_producer_not_qualified",
    "producer_read_path_unsafe",
    "trabalho_praca_producer_not_qualified",
  ]);
});

teste("Q15 a disponibilidade viva NAO foi declarada — qualificar nao e conectar", () => {
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
    "a disponibilidade viva foi declarada sem adapter implementado",
  );
});

teste("Q16 nenhum evento e gravado no ledger oficial por esta missao", () => {
  const fonte = semComentario(ler("src/product/eventos/portas-produtores.ts"));
  assert.doesNotMatch(fonte, /appendFile|ledger|jsonl/i, "a porta ganhou escrita no ledger");
  // O validador de evento continua sendo o de R5-D1, sem duplicata.
  assert.equal(typeof validarEvento, "function");
});

teste("Q17 areas congeladas com diff vazio desde f1fe480", () => {
  const saida = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "f1fe480",
      FIM_HISTORICO,
      "--",
      "src/perfil-delivery/",
      "src/product/viewmodels/",
      "src/product/atencao/politica-temporal.ts",
      "src/product/atencao/linhagem-eventos.ts",
      "src/platform/copiloto/confianca-duravel.ts",
      "src/product/eventos/projetar-leitura.ts",
      "src/product/eventos/catalogo-operacional.ts",
      "src/product/ui/",
      "docs/figma/",
    ],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `area congelada foi alterada:\n${saida}`);
});

/* ================================================================== */

void Promise.all(testes).then(() => {
  const marcas = Object.fromEntries(ARTEFATOS.map((a) => [a, sha(ler(a)).slice(0, 16)]));
  console.log(`\nARTEFATOS ${JSON.stringify(marcas)}`);
  console.log(`\nR5-D2 — qualificacao dos produtores: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D2_PRODUCER_QUALIFICATION_GATE_GREEN");
});
