/**
 * GATE R5-C — CONTRATO TIPADO DE TRADUCAO MOTOR -> SHADOW
 * ============================================================================
 * O harness e uma cadeia isolada, e nenhuma parte dela toca runtime:
 *
 *   saida legada do motor -> tradutor puro -> validador puro do Shadow
 *
 * Ele confirma que o rascunho SERIA aceito pelo contrato, sem inseri-lo.
 * Nao chama `recomendar()`, nao toca store, nao emite evento, nao persiste.
 *
 * L36 e L37 valem aqui: presenca textual nao prova codigo, e mutacao que nao
 * aplica nao e invariante verde. As guardas de "ausencia de efeito" leem a
 * ARVORE do modulo — imports e chamadas —, nunca a palavra solta.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ENTRADA_SUPORTADA,
  SAIDA_SUPORTADA,
  VERSAO_TRADUCAO,
  identidadeDePedidoLegitima,
  traduzirParaShadow,
  validarDraftShadow,
  type AcaoCandidataDoMotor,
  type EntradaTraducaoMotorShadow,
  type EscopoDoSujeito,
  type ResultadoTraducaoMotorShadow,
} from "../product/atencao/traducao-motor-shadow";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const semComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const FONTE = "src/product/atencao/traducao-motor-shadow.ts";
const ARTEFATOS = [FONTE, "src/platform/copiloto/shadow.ts"] as const;

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
 * Fixtures da cadeia                                                  *
 * ------------------------------------------------------------------ */

const CAUSA = "s5|sushi|enrolados_quentes|-|carga_pracas";
const AGORA = "2026-08-03T20:40:00.000Z";

const acao = (over: Partial<AcaoCandidataDoMotor> = {}): AcaoCandidataDoMotor => ({
  contrato: ENTRADA_SUPORTADA,
  tipo: "priorizar_praca",
  acao: "Priorizar Sushi Quentes",
  porque: "5 pedidos na praca, 167% do normal",
  impacto: "libera 2 saidas · reduz atraso",
  confianca_rotulo: "média",
  praca: "enrolados_quentes",
  id_curto_exibido: null,
  causa_da_acao: CAUSA,
  ...over,
});

const SUJEITO_SUBAREA: EscopoDoSujeito = { tipo: "subarea", subarea: "enrolados_quentes" };

const entrada = (over: Partial<EntradaTraducaoMotorShadow> = {}): EntradaTraducaoMotorShadow => ({
  versao_entrada: ENTRADA_SUPORTADA,
  versao_saida: SAIDA_SUPORTADA,
  foco: { modo: "foco", identidade: CAUSA, orientacao_permitida: true },
  acao: acao(),
  escopo: SUJEITO_SUBAREA,
  evidencias: {
    evento_ids: ["evt-1", "evt-2"],
    vinculo_causa: CAUSA,
    vinculo_sujeito: SUJEITO_SUBAREA,
    observado_em: AGORA,
    qualidade: "completa",
  },
  procedencia: {
    natureza: "real",
    source_mode: "real",
    projection_version: "operacao-viva@1.0.0",
    transformacao: "projecao -> fotografia do minuto",
    regra: VERSAO_TRADUCAO,
    limitacoes: [],
  },
  confianca: APURADA,
  risco: "medio",
  validade: { validade_s: 600, origem: "politica_documentada", politica_id: "capacidade-saturada" },
  retirada: { quando: ["validade_expirou", "causa_deixou_de_coincidir"] },
  agora_iso: AGORA,
  recommendation_id: "rec-0001",
  policy_id: "capacidade-saturada",
  destino: "real",
  indisponivel: [],
  ...over,
});

/** Confianca apurada legitima: valor, politica, versao e evidencias. */
const APURADA = {
  estado: "apurada" as const,
  valor: 0.72,
  politica: "capacidade-saturada",
  versao_da_politica: SAIDA_SUPORTADA,
  evidencias: ["evt-1", "evt-2"],
};

const bloqueio = (r: ResultadoTraducaoMotorShadow): string =>
  r.tipo === "bloqueada" ? r.motivo : `<${r.tipo}>`;

/* ================================================================== *
 * 1-3 · MODOS DA OPERACAO VIVA                                        *
 * ================================================================== */

teste("T01 Calmo nao traduz", () => {
  const r = traduzirParaShadow(entrada({ foco: { modo: "calmo", identidade: null, orientacao_permitida: false } }));
  assert.equal(r.tipo, "retida");
  assert.equal(r.tipo === "retida" && r.motivo, "modo_sem_orientacao");
});

teste("T02 Ambiente nao traduz, nem quando o chamador diz que pode", () => {
  const r = traduzirParaShadow(entrada({ foco: { modo: "ambiente", identidade: CAUSA, orientacao_permitida: false } }));
  assert.equal(r.tipo, "retida");
  assert.equal(r.tipo === "retida" && r.motivo, "ambiente_informa_sem_orientar");
  // O caso que faz a guarda de MODO ser carregada sozinha. Sem ele, remover a
  // linha do modo passava despercebido: `orientacao_permitida: false` prendia o
  // Ambiente por OUTRA protecao, e a mutacao dirigida ficava cega.
  const mentindo = traduzirParaShadow(
    entrada({ foco: { modo: "ambiente", identidade: CAUSA, orientacao_permitida: true } }),
  );
  assert.equal(mentindo.tipo, "retida", "Ambiente traduziu porque o chamador disse que podia (C1)");
  assert.equal(mentindo.tipo === "retida" && mentindo.motivo, "ambiente_informa_sem_orientar");
});

teste("T03 Foco sem acao produz Foco puro, e nao retira o Foco", () => {
  const r = traduzirParaShadow(entrada({ acao: null }));
  assert.equal(r.tipo, "retida");
  assert.equal(r.tipo === "retida" && r.motivo, "foco_puro_sem_acao_candidata");
  // O Foco eleito atravessa intacto na auditoria: o tradutor nao o desfaz.
  assert.equal(r.tipo === "retida" && r.auditoria.causa_do_foco, CAUSA);
});

/* ================================================================== *
 * 4-6 · I1 — CAUSA RAIZ                                               *
 * ================================================================== */

teste("T04 acao valida da MESMA causa traduz", () => {
  const r = traduzirParaShadow(entrada());
  assert.equal(r.tipo, "traduzida", `esperava traduzida, veio ${bloqueio(r)}`);
  if (r.tipo !== "traduzida") return;
  assert.equal(r.draft.recommended_action, "Priorizar Sushi Quentes");
  assert.equal(r.draft.status, "proposed");
  assert.equal(r.draft.requires_human, true);
});

teste("T05 acao de causa diferente e BLOQUEADA, e a causa nao e reescrita", () => {
  const r = traduzirParaShadow(entrada({ acao: acao({ causa_da_acao: "s1|motoboy|-|-|ifood_tempos" }) }));
  assert.equal(bloqueio(r), "causa_raiz_divergente");
  // A auditoria preserva as DUAS causas: nada foi alterado para caber.
  assert.equal(r.tipo === "bloqueada" && r.auditoria.causa_do_foco, CAUSA);
  assert.equal(r.tipo === "bloqueada" && r.auditoria.causa_da_acao, "s1|motoboy|-|-|ifood_tempos");
});

teste("T06 acao sem identidade de causa e bloqueada", () => {
  assert.equal(bloqueio(traduzirParaShadow(entrada({ acao: acao({ causa_da_acao: "" }) }))), "identidade_de_causa_ausente");
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ foco: { modo: "foco", identidade: null, orientacao_permitida: true } }))),
    "identidade_de_causa_ausente",
  );
});

/* ================================================================== *
 * 7-14 · SUJEITO E D29                                                *
 * ================================================================== */

teste("T07 sujeito FONTE valido traduz", () => {
  const s: EscopoDoSujeito = { tipo: "fonte", fonte_id: "carga_pracas" };
  const r = traduzirParaShadow(
    entrada({ escopo: s, evidencias: { ...entrada().evidencias!, vinculo_sujeito: s } }),
  );
  assert.equal(r.tipo, "traduzida", bloqueio(r));
});

teste("T08 sujeito AMBIENTE valido traduz", () => {
  const s: EscopoDoSujeito = { tipo: "ambiente", ambiente: "sushi" };
  const r = traduzirParaShadow(
    entrada({ escopo: s, evidencias: { ...entrada().evidencias!, vinculo_sujeito: s } }),
  );
  assert.equal(r.tipo, "traduzida", bloqueio(r));
});

teste("T09 sujeito SUBAREA valido traduz", () => {
  assert.equal(traduzirParaShadow(entrada()).tipo, "traduzida");
});

teste("T10 sujeito PEDIDO com order_id real traduz", () => {
  const s: EscopoDoSujeito = { tipo: "pedido", order_id: "3f8a17c2-9d44-4b21-8e0a-77c1b9de5510" };
  const r = traduzirParaShadow(
    entrada({ escopo: s, evidencias: { ...entrada().evidencias!, vinculo_sujeito: s } }),
  );
  assert.equal(r.tipo, "traduzida", bloqueio(r));
});

teste("T11 sujeito PEDIDO sem order_id e bloqueado", () => {
  const s: EscopoDoSujeito = { tipo: "pedido", order_id: "" };
  const r = traduzirParaShadow(
    entrada({ escopo: s, evidencias: { ...entrada().evidencias!, vinculo_sujeito: s } }),
  );
  assert.equal(bloqueio(r), "identidade_de_pedido_ausente");
});

teste("T12 numero visual NAO e aceito como order_id", () => {
  for (const falso of ["#301", "301", "B-205", "C-301"]) {
    assert.equal(identidadeDePedidoLegitima(falso), false, `aceitou ${falso}`);
    const s: EscopoDoSujeito = { tipo: "pedido", order_id: falso };
    const r = traduzirParaShadow(
      entrada({ escopo: s, evidencias: { ...entrada().evidencias!, vinculo_sujeito: s } }),
    );
    assert.equal(bloqueio(r), "identidade_de_pedido_improvisada", `passou com ${falso}`);
  }
});

teste("T13 indice e posicao NAO sao aceitos como order_id", () => {
  for (const falso of ["indice-3", "index_7", "posicao:2", "pos-11"]) {
    assert.equal(identidadeDePedidoLegitima(falso), false, `aceitou ${falso}`);
  }
});

teste("T14 hash improvisado, horario e chave de fixture NAO sao order_id", () => {
  for (const falso of [
    "sha256-abc",
    "hash:1234",
    "d41d8cd98f00b204e9800998ecf8427e",
    "17:42",
    "2026-08-03T20:40:00.000Z",
    "fixture-1",
    "demo_9",
    "seed:3",
  ]) {
    assert.equal(identidadeDePedidoLegitima(falso), false, `aceitou ${falso}`);
  }
  // Controle positivo: um uuid real passa. Sem ele, a guarda passaria com uma
  // funcao que simplesmente devolve `false` sempre.
  assert.equal(identidadeDePedidoLegitima("3f8a17c2-9d44-4b21-8e0a-77c1b9de5510"), true);
});

teste("T33 nao existe downgrade silencioso de pedido para fonte", () => {
  // A acao fala de um pedido (`#301`), mas o sujeito declarado e subarea.
  // Trocar o sujeito para caber e exatamente o que D29 proibe.
  const r = traduzirParaShadow(entrada({ acao: acao({ id_curto_exibido: "#301" }) }));
  assert.equal(bloqueio(r), "identidade_de_pedido_ausente");
  assert.equal(r.tipo === "bloqueada" && r.auditoria.escopo.tipo, "subarea", "o sujeito foi trocado");
});

/* ================================================================== *
 * 15-17 · EVIDENCIA E CONFIANCA                                       *
 * ================================================================== */

teste("T15 evidencia ausente ou vazia bloqueia", () => {
  assert.equal(bloqueio(traduzirParaShadow(entrada({ evidencias: null }))), "evidencia_insuficiente");
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ evidencias: { ...entrada().evidencias!, evento_ids: [] } }))),
    "evidencia_insuficiente",
  );
});

teste("T16 evidencia sem vinculo com a causa, ou com o sujeito, bloqueia", () => {
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ evidencias: { ...entrada().evidencias!, vinculo_causa: "outra" } }))),
    "evidencia_sem_vinculo_com_a_causa",
  );
  assert.equal(
    bloqueio(
      traduzirParaShadow(
        entrada({
          evidencias: { ...entrada().evidencias!, vinculo_sujeito: { tipo: "fonte", fonte_id: "outra" } },
        }),
      ),
    ),
    "evidencia_sem_vinculo_com_o_sujeito",
  );
});

teste("T17 confianca apurada exige lastro, e NAO estimada e legitima", () => {
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ confianca: { ...APURADA, evidencias: [] } }))),
    "confianca_sem_evidencia",
  );
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ confianca: { ...APURADA, politica: "" } }))),
    "confianca_sem_politica",
  );
  for (const fora of [-0.1, 1.5, Number.NaN]) {
    assert.equal(
      bloqueio(traduzirParaShadow(entrada({ confianca: { ...APURADA, valor: fora } }))),
      "confianca_fora_de_faixa",
      `${fora}`,
    );
  }
  // Zero NAO e ausencia: e uma confianca APURADA de valor zero.
  const zero = traduzirParaShadow(entrada({ confianca: { ...APURADA, valor: 0 } }));
  assert.equal(zero.tipo, "traduzida", bloqueio(zero));
  assert.equal(zero.tipo === "traduzida" && zero.draft.confianca.estado, "apurada");
  // E `nao_estimada` traduz sem inventar numero.
  const sem = traduzirParaShadow(entrada({ confianca: { estado: "nao_estimada" } }));
  assert.equal(sem.tipo, "traduzida", bloqueio(sem));
  assert.equal(sem.tipo === "traduzida" && sem.draft.confianca.estado, "nao_estimada");
});

/* ================================================================== *
 * 18-20 · PROCEDENCIA                                                 *
 * ================================================================== */

teste("T18 procedencia ausente bloqueia", () => {
  assert.equal(bloqueio(traduzirParaShadow(entrada({ procedencia: null }))), "procedencia_ausente");
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ procedencia: { ...entrada().procedencia!, projection_version: "" } }))),
    "procedencia_ausente",
  );
});

teste("T19 fixture marcada como real bloqueia", () => {
  const r = traduzirParaShadow(
    entrada({ procedencia: { ...entrada().procedencia!, natureza: "fixture", source_mode: "real" } }),
  );
  assert.equal(bloqueio(r), "procedencia_incompativel");
  // E o contrario tambem: natureza `real` com origem que nao e real.
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ procedencia: { ...entrada().procedencia!, source_mode: "simulated" } }))),
    "procedencia_incompativel",
  );
});

teste("T20 demonstracao nao chega ao caminho real", () => {
  const r = traduzirParaShadow(
    entrada({ procedencia: { ...entrada().procedencia!, natureza: "demonstracao", source_mode: "control" } }),
  );
  assert.equal(bloqueio(r), "procedencia_incompativel");
  // No destino de demonstracao, a mesma procedencia passa — o par existe.
  const demo = traduzirParaShadow(
    entrada({
      destino: "demonstracao",
      procedencia: { ...entrada().procedencia!, natureza: "demonstracao", source_mode: "control" },
    }),
  );
  assert.equal(demo.tipo, "traduzida", bloqueio(demo));
  assert.equal(demo.tipo === "traduzida" && demo.draft.source_mode, "control");
});

/* ================================================================== *
 * 21-24 · VALIDADE, RETIRADA, VERSAO                                  *
 * ================================================================== */

teste("T21 validade ausente bloqueia", () => {
  assert.equal(bloqueio(traduzirParaShadow(entrada({ validade: null }))), "validade_ausente");
  assert.equal(
    bloqueio(traduzirParaShadow(entrada({ validade: { ...entrada().validade!, validade_s: 0 } }))),
    "validade_ausente",
  );
});

teste("T22 validade nao reutiliza DEBOUNCE, COOLDOWN, MAXFOCUS nem STALE", () => {
  // Estrutural: o tradutor nao importa a politica temporal, entao nao ha como
  // aqueles parametros virarem validade por descuido.
  const fonte = semComentarios(ler(FONTE));
  assert.doesNotMatch(fonte, /politica-temporal/, "o tradutor importou a politica temporal");
  assert.doesNotMatch(fonte, /POLITICA_CANONICA|debounce_min|cooldown_min|max_foco_min/);
  // Comportamental: a validade vem inteira da entrada.
  const r = traduzirParaShadow(entrada({ validade: { validade_s: 137, origem: "fornecida", politica_id: "p" } }));
  assert.equal(r.tipo, "traduzida");
  if (r.tipo !== "traduzida") return;
  const dur = (Date.parse(r.draft.expires_at) - Date.parse(r.draft.created_at)) / 1000;
  assert.equal(dur, 137, "a validade nao veio da entrada");
});

teste("T23 retirada ausente ou vazia bloqueia", () => {
  assert.equal(bloqueio(traduzirParaShadow(entrada({ retirada: null }))), "retirada_ausente");
  assert.equal(bloqueio(traduzirParaShadow(entrada({ retirada: { quando: [] } }))), "retirada_ausente");
});

teste("T24 versao desconhecida e INCOMPATIVEL, e nao ha migracao implicita", () => {
  for (const e of [
    entrada({ versao_entrada: "motor-decisao@0" }),
    entrada({ versao_saida: "copiloto-shadow@0.9.0" }),
    entrada({ acao: acao({ contrato: "motor-decisao@2" }) }),
  ]) {
    const r = traduzirParaShadow(e);
    assert.equal(r.tipo, "incompativel");
    assert.equal(r.tipo === "incompativel" && r.motivo, "versao_nao_suportada");
    assert.ok(r.tipo === "incompativel" && r.divergencia.length > 0, "a divergencia nao foi declarada");
  }
  const fonte = semComentarios(ler(FONTE));
  assert.doesNotMatch(fonte, /migrar|migracao/i, "migracao implicita apareceu no tradutor");
});

/* ================================================================== *
 * 25-27 · DETERMINISMO, SERIALIZACAO, VALIDADOR SHADOW                *
 * ================================================================== */

teste("T25 mesma entrada produz mesma saida", () => {
  const a = traduzirParaShadow(entrada());
  const b = traduzirParaShadow(entrada());
  assert.deepEqual(b, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

teste("T26 o resultado e serializavel", () => {
  const r = traduzirParaShadow(entrada());
  const texto = JSON.stringify(r);
  assert.deepEqual(JSON.parse(texto), r, "o resultado nao sobrevive a JSON");
  for (const v of Object.values(r as unknown as Record<string, unknown>)) {
    assert.notEqual(typeof v, "function", "o resultado carrega funcao");
  }
});

teste("T27 traduzir -> serializar -> restaurar -> validador puro do Shadow", () => {
  // A cadeia isolada inteira. O validador confirma que o draft SERIA aceito,
  // sem inseri-lo em runtime nenhum.
  const r = traduzirParaShadow(entrada());
  assert.equal(r.tipo, "traduzida", bloqueio(r));
  if (r.tipo !== "traduzida") return;
  const restaurado = JSON.parse(JSON.stringify(r.draft)) as typeof r.draft;
  assert.deepEqual(restaurado, r.draft, "a serializacao alterou o draft");
  const v = validarDraftShadow(restaurado);
  assert.equal(v.aceito, true, v.aceito === false ? v.motivo : "");
});

teste("T39 o Shadow REJEITA draft adulterado — o validador nao e carimbo", () => {
  const r = traduzirParaShadow(entrada());
  assert.equal(r.tipo, "traduzida");
  if (r.tipo !== "traduzida") return;
  const casos: [Record<string, unknown>, string][] = [
    [{ input_event_ids: [] }, "evidencia_vazia"],
    [{ confianca: { ...APURADA, valor: 1.4 } }, "confianca_invalida"],
    [{ confianca: { ...APURADA, evidencias: [] } }, "confianca_sem_evidencia"],
    [{ confianca: { ...APURADA, politica: "" } }, "confianca_sem_politica"],
    [{ status: "accepted_for_future" }, "status_nao_proposto"],
    [{ requires_human: false }, "sem_exigencia_humana"],
    [{ policy_version: "outra@9" }, "versao_de_politica_divergente"],
    [{ expires_at: r.draft.created_at }, "validade_incoerente"],
  ];
  for (const [patch, motivo] of casos) {
    const adulterado = { ...r.draft, ...patch } as typeof r.draft;
    const v = validarDraftShadow(adulterado);
    assert.equal(v.aceito, false, `o validador aceitou ${JSON.stringify(patch)}`);
    assert.equal(v.aceito === false && v.motivo, motivo);
  }
});

/* ================================================================== *
 * 28-32, 36-38, 40 · PROPRIEDADE DO FOCO E AUSENCIA DE EFEITO         *
 * ================================================================== */

teste("T28 o tradutor nao modifica o Foco recebido", () => {
  const e = entrada();
  const congelado = JSON.stringify(e.foco);
  traduzirParaShadow(e);
  assert.equal(JSON.stringify(e.foco), congelado, "o Foco foi mutado pelo tradutor");
});

teste("T29 o tradutor nao conhece nem toca o estado temporal", () => {
  const e = entrada();
  const antes = JSON.stringify(e);
  traduzirParaShadow(e);
  assert.equal(JSON.stringify(e), antes, "o tradutor mutou a propria entrada");
  const fonte = semComentarios(ler(FONTE));
  for (const proibido of ["EstadoTemporal", "elegerModo", "FocoAtivo", "marcada_em_min"]) {
    assert.ok(!fonte.includes(proibido), `o tradutor alcancou o estado temporal: ${proibido}`);
  }
});

teste("T30 o tradutor nao executa: nenhum campo executavel no draft", () => {
  const r = traduzirParaShadow(entrada());
  assert.equal(r.tipo, "traduzida");
  if (r.tipo !== "traduzida") return;
  for (const [k, v] of Object.entries(r.draft as unknown as Record<string, unknown>)) {
    assert.notEqual(typeof v, "function", `o draft carrega funcao em ${k}`);
  }
  assert.equal(r.draft.requires_human, true);
  assert.equal("executed" in (r.draft as object), false, "o estado `executed` apareceu");
  const fonte = semComentarios(ler(FONTE));
  assert.ok(!fonte.includes("requires_human: false"), "existe caminho que dispensa humano");
});

teste("T31/T32 o tradutor nao persiste, nao emite e nao chama o runtime", () => {
  // Sonda de IMPORT e de CHAMADA, nunca de palavra (L36).
  const fonte = semComentarios(ler(FONTE));
  const imports = [...fonte.matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1]!,
  );
  assert.ok(imports.length > 0, "a sonda de import nao encontrou import nenhum");
  for (const esp of imports) {
    for (const proibido of ["store", "outbox", "conference-brain", "projections/", "pg", "bin/"]) {
      assert.ok(!esp.includes(proibido), `o tradutor importou ${esp}`);
    }
  }
  // O Shadow entra apenas por TIPO e por funcao pura.
  const doShadow = /import \{([\s\S]*?)\} from "\.\.\/\.\.\/platform\/copiloto\/shadow"/.exec(fonte);
  assert.ok(doShadow, "o tradutor deixou de declarar o que importa do Shadow");
  assert.doesNotMatch(doShadow[1]!, /\brecomendar\b|\binvalidarSuperadas\b|\benvelhecer\b/);
  // Nenhuma chamada de efeito no corpo.
  for (const efeito of [
    /\brecomendar\s*\(/,
    /\bput\s*\(/,
    /\bsave\s*\(/,
    /\bemit\s*\(/,
    /\bpublish\s*\(/,
    /\bfetch\s*\(/,
    /\bwriteFile/,
    /process\.env/,
    /Date\.now\s*\(/,
    /Math\.random\s*\(/,
    /randomUUID/,
  ]) {
    assert.doesNotMatch(fonte, efeito, `o tradutor ganhou um efeito: ${efeito}`);
  }
});

teste("T36/T37/T38 uma acao entra, uma orientacao sai — o tradutor nao escolhe", () => {
  const r = traduzirParaShadow(entrada());
  assert.equal(r.tipo, "traduzida");
  if (r.tipo !== "traduzida") return;
  // O tipo da entrada admite UMA acao, nao uma lista: o tradutor nao tem de onde
  // escolher uma segunda.
  const fonte = ler(FONTE);
  assert.match(fonte, /readonly acao: AcaoCandidataDoMotor \| null;/, "a entrada passou a aceitar lista");
  assert.equal(r.draft.recommended_action, entrada().acao!.acao, "o texto nao veio da acao do motor");
  // E a saida e um draft, nunca uma colecao.
  assert.ok(!Array.isArray(r.draft), "a traducao devolveu mais de uma recomendacao");
  assert.doesNotMatch(semComentarios(fonte), /\.sort\(|\.filter\(.*score|melhor|ranquear/i);
});

teste("T40 traducao valida NAO cria Foco quando o Foco nao existe", () => {
  const r = traduzirParaShadow(
    entrada({ foco: { modo: "calmo", identidade: null, orientacao_permitida: false } }),
  );
  assert.equal(r.tipo, "retida");
  assert.equal(r.tipo === "retida" && r.auditoria.causa_do_foco, null, "o tradutor inventou uma causa");
  // Mesmo com tudo o mais presente e valido.
  const comTudo = traduzirParaShadow(
    entrada({ foco: { modo: "ambiente", identidade: CAUSA, orientacao_permitida: false } }),
  );
  assert.equal(comTudo.tipo, "retida");
});

teste("T34/T35 texto alterado mantem a causa, e ausencia nunca vira zero", () => {
  // Trocar TODO o texto da acao, mantendo a identidade, continua traduzindo.
  const outroTexto = traduzirParaShadow(
    entrada({
      acao: acao({ acao: "Outra frase inteira", porque: "outra razao", impacto: "outro impacto" }),
    }),
  );
  assert.equal(outroTexto.tipo, "traduzida", bloqueio(outroTexto));
  assert.equal(outroTexto.tipo === "traduzida" && outroTexto.auditoria.causa_da_acao, CAUSA);
  // Ausencia de confianca e `null`, e ela bloqueia — nunca vira 0.
  const semLastro = traduzirParaShadow(entrada({ confianca: { ...APURADA, evidencias: [] } }));
  assert.equal(bloqueio(semLastro), "confianca_sem_evidencia");
  assert.equal(semLastro.tipo === "bloqueada" && semLastro.auditoria.evidencias_recebidas, 2);
});

/* ================================================================== *
 * CONGELAMENTO VISUAL E FRONTEIRAS                                    *
 * ================================================================== */

teste("VISUAL diff vazio nos ativos congelados desde ad3b1bc", () => {
  const saida = execFileSync(
    "git",
    [
      // Escopo do congelamento: folha de estilo, tokens de movimento, sinais,
      // areas e Figma. `home.js`, `home-vm.ts` e `copiloto-vm.ts` mudaram em
      // R5-D0-C por autorizacao explicita — a correcao de severidade->confianca
      // e semantica, e a home passou a nao apresentar confianca nao estimada.
      "diff",
      "--name-only",
      "ad3b1bc",
      "--",
      "src/product/ui/surfaces/home.css",
      "src/product/ui/tokens/",
        "src/product/viewmodels/areas.ts",
      "docs/figma/",
    ],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `ativo congelado foi alterado:\n${saida}`);
});

teste("VISUAL os motores continuam desconectados — D43 de pe", () => {
  // Ninguem no caminho de produto chama o tradutor: ele existe como contrato.
  // `--untracked` porque o proprio tradutor pode ainda nao estar commitado, e um
  // `git grep` que ignora o arquivo novo daria a resposta certa pelo motivo
  // errado. Exit 1 significa "nenhum resultado", nao erro.
  let bruto = "";
  try {
    bruto = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "traduzirParaShadow", "--", "src/", "tools/"],
      { cwd: raiz, encoding: "utf8" },
    );
  } catch (e) {
    bruto = (e as { stdout?: string }).stdout ?? "";
  }
  const chamadores = bruto
    .trim()
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => l.replace(/\\/g, "/"));
  assert.deepEqual(
    chamadores.sort(),
    // O tradutor pode ser exercitado por GATES; o que ele nao pode e ter
    // chamador de runtime. Qualquer arquivo fora de `run-*.ts` e do proprio
    // modulo significa que a conexao nasceu.
    [
      "src/platform/run-r5c-translation-tests.ts",
      "src/platform/run-r5d0-confidence-tests.ts",
      "src/product/atencao/traducao-motor-shadow.ts",
    ],
    `o tradutor ganhou chamador de runtime: ${chamadores.join(", ")}`,
  );
  // E a guarda que importa de verdade: nenhum chamador fora de gate e do modulo.
  for (const c of chamadores) {
    assert.ok(
      /\/run-r5[a-z0-9-]*-tests\.ts$/.test(c) || c.endsWith("traducao-motor-shadow.ts"),
      `chamador de runtime: ${c}`,
    );
  }
});

/* ================================================================== */

void Promise.resolve().then(() => {
  const marcas = Object.fromEntries(ARTEFATOS.map((a) => [a, sha(ler(a)).slice(0, 16)]));
  console.log(`\nARTEFATOS ${JSON.stringify(marcas)}`);
  console.log(`\nR5-C — traducao motor -> Shadow: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5C_TRANSLATION_GATE_GREEN");
});
