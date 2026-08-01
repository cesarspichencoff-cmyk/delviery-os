/**
 * Unidade 6 — gate do Product System.
 *
 * O que este arquivo protege, em uma frase: que a interface nunca seja o lugar
 * onde a verdade tecnica ja provada nas Unidades 1 a 5 se perde.
 *
 * Metodo herdado do 4B5 e reaplicado aqui: toda afirmacao de ZERO vem em par com
 * um controle positivo. "Zero recomendacao de pedido" e indistinguivel de "cano
 * entupido" sem o par que exige UMA observacao pela mesma cadeia (L26, D32).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";

import {
  ESTADOS,
  EIXOS,
  ausente,
  confiancaApresentavel,
  deValorPossivelmenteAusente,
  observado,
} from "../product/viewmodels/estados";
import { MODULOS, GRUPOS } from "../product/viewmodels/modulos";
import { operacaoVivaVM } from "../product/viewmodels/operacao-viva-vm";
import { conferenceBrainVM } from "../product/viewmodels/conference-vm";
import { copilotoVM } from "../product/viewmodels/copiloto-vm";
import { entregasVM } from "../product/viewmodels/entregas-vm";
import {
  montarCadeiaDemo,
  montarEntregasDemo,
  AGORA_DEMO,
} from "../product/demo/seed-demonstracao";
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

const TOKENS_JSON = "docs/figma/DESIGN_TOKENS.json";
const MOTION_JSON = "docs/figma/MOTION_TOKENS.json";
const CSS_PRODUTO = "src/product/ui/tokens/product-tokens.css";
const CSS_CANONICO = "src/entregas/ui/shared/tokens.css";
const CSS_SHELL = "src/product/ui/shell/shell.css";
const CSS_COMPONENTES = "src/product/ui/components/components.css";
const HTML_SHELL = "src/product/ui/index.html";
const SEED = "src/product/demo/seed-demonstracao.ts";

interface TokensJson {
  foundation: Record<string, Record<string, string>>;
  ink: Record<string, string>;
  wash: Record<string, string>;
  grid: Record<string, string>;
  foco: Record<string, string>;
  estados: Record<string, Record<string, string>>;
}
interface MotionJson {
  duracao: Record<string, string>;
  easing: Record<string, string>;
  distancia: Record<string, string>;
  escala: Record<string, string>;
  opacidade: Record<string, string>;
  stagger: Record<string, string | number>;
  padroes: Record<string, unknown>;
  regras: Record<string, string>;
  reduced_motion: Record<string, string>;
}

const tokens = JSON.parse(ler(TOKENS_JSON)) as TokensJson;
const motion = JSON.parse(ler(MOTION_JSON)) as MotionJson;
const cssTudo = ler(CSS_PRODUTO) + "\n" + ler(CSS_CANONICO);

/** Normaliza para comparar declaracao CSS sem sofrer com espaco em branco. */
function declara(css: string, nome: string, valor: string): boolean {
  const alvo = `--${nome}:${valor}`.replace(/\s+/g, "").toLowerCase();
  return css.replace(/\s+/g, "").toLowerCase().includes(alvo);
}

/* ------------------------------------------------------------------ *
 * Contraste — a conta, nao a impressao
 * ------------------------------------------------------------------ */

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ *
 * 1. Tokens
 * ------------------------------------------------------------------ */

teste("tokens: DESIGN_TOKENS.json e valido e tem estrutura estavel", () => {
  for (const chave of ["foundation", "ink", "wash", "grid", "foco", "estados"]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(tokens, chave),
      `falta o bloco ${chave}`,
    );
  }
  assert.equal(ler(TOKENS_JSON).includes("//"), false, "JSON nao aceita comentario de linha");
});

teste("tokens: DESIGN_TOKENS.json e o CSS nao divergem", () => {
  const faltando: string[] = [];
  for (const [chaveGrupo, grupo] of Object.entries(tokens.foundation)) {
    // `_nota` e uma string, e `Object.entries` de string devolve caracteres.
    if (chaveGrupo.startsWith("_") || typeof grupo !== "object") continue;
    for (const [nome, valor] of Object.entries(grupo)) {
      if (nome.startsWith("_")) continue;
      if (!declara(cssTudo, nome, valor)) faltando.push(`${nome}=${valor}`);
    }
  }
  for (const bloco of [tokens.ink, tokens.wash, tokens.grid, tokens.foco]) {
    for (const [nome, valor] of Object.entries(bloco)) {
      if (nome.startsWith("_")) continue;
      if (!declara(cssTudo, nome, valor)) faltando.push(`${nome}=${valor}`);
    }
  }
  assert.deepEqual(faltando, [], `tokens declarados no JSON e ausentes no CSS: ${faltando.join(", ")}`);
});

teste("tokens: um token tem UM lugar de nascimento (sem redeclaracao)", () => {
  const produto = ler(CSS_PRODUTO);
  const canonico = ler(CSS_CANONICO);
  const nomesDe = (css: string): string[] => {
    const m = css.match(/^\s*--([a-z0-9-]+)\s*:/gim) || [];
    return m.map((s) => s.trim().replace(/^--/, "").replace(/\s*:$/, ""));
  };
  const nosDois = nomesDe(produto).filter((n) => nomesDe(canonico).includes(n));
  assert.deepEqual(
    nosDois,
    [],
    `estes tokens nascem nas DUAS folhas e podem divergir: ${nosDois.join(", ")}`,
  );
});

teste("motion: MOTION_TOKENS.json e o CSS nao divergem", () => {
  const faltando: string[] = [];
  for (const bloco of [
    motion.duracao,
    motion.easing,
    motion.distancia,
    motion.escala,
    motion.opacidade,
  ]) {
    for (const [nome, valor] of Object.entries(bloco)) {
      if (!declara(cssTudo, nome, String(valor))) faltando.push(nome);
    }
  }
  if (!declara(cssTudo, "motion-stagger-step", String(motion.stagger["motion-stagger-step"]))) {
    faltando.push("motion-stagger-step");
  }
  assert.deepEqual(faltando, [], `tokens de motion ausentes no CSS: ${faltando.join(", ")}`);
});

teste("motion: nenhuma dependencia de biblioteca foi adicionada", () => {
  const pkg = JSON.parse(ler("package.json")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const todas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const proibida of ["originkit", "framer-motion", "gsap", "motion", "animejs", "lottie"]) {
    assert.equal(
      todas.some((d) => d.toLowerCase().includes(proibida)),
      false,
      `dependencia de motion adicionada: ${proibida}`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * 2. Estados semanticos
 * ------------------------------------------------------------------ */

teste("estados: o vocabulario TS e o JSON sao a mesma lista", () => {
  const doJson = Object.keys(tokens.estados).filter((k) => !k.startsWith("_")).sort();
  const doTs = [...ESTADOS].sort();
  assert.deepEqual(doTs, doJson, "o TS e o JSON descrevem estados diferentes");
  assert.equal(doTs.length, 22, "as 21 especies pedidas mais o controle positivo sintetico");
});

teste("estados: os eixos do TS e do JSON cobrem os mesmos estados", () => {
  const eixosJson = (JSON.parse(ler(TOKENS_JSON)) as { estados: { _eixos: Record<string, string[]> } })
    .estados._eixos;
  for (const [eixo, lista] of Object.entries(EIXOS)) {
    assert.deepEqual([...lista].sort(), [...eixosJson[eixo]].sort(), `eixo ${eixo} divergente`);
  }
  const planos = Object.values(EIXOS).flat().sort();
  assert.deepEqual(planos, [...ESTADOS].sort(), "ha estado fora de eixo ou em dois eixos");
});

teste("estados: cada estado funciona SEM cor", () => {
  for (const [nome, def] of Object.entries(tokens.estados)) {
    if (nome.startsWith("_")) continue;
    assert.ok(def.rotulo && def.rotulo.length > 1, `${nome}: sem rotulo textual`);
    assert.ok(def.glifo && def.glifo.length >= 1, `${nome}: sem glifo`);
    assert.ok(
      ["solid", "hatch", "dashed", "dotted"].includes(def.padrao),
      `${nome}: padrao de borda invalido (${def.padrao})`,
    );
    assert.ok(
      def.texto_acessivel && def.texto_acessivel.length > 20,
      `${nome}: texto acessivel ausente ou curto demais para explicar o estado`,
    );
  }
});

teste("estados: nenhum estado se distingue apenas por verde/amarelo/vermelho", () => {
  // Dois estados podem compartilhar cor; nao podem compartilhar cor E glifo E padrao.
  const assinaturas = new Map<string, string[]>();
  for (const [nome, def] of Object.entries(tokens.estados)) {
    if (nome.startsWith("_")) continue;
    const a = `${def.ink}|${def.glifo}|${def.padrao}`;
    assinaturas.set(a, [...(assinaturas.get(a) || []), nome]);
  }
  const colisoes = [...assinaturas.entries()].filter(([, ns]) => ns.length > 1);
  assert.deepEqual(
    colisoes.map(([a, ns]) => `${a} -> ${ns.join("+")}`),
    [],
    "estados indistinguiveis em todos os canais nao textuais",
  );
});

teste("estados: o ink de badge passa 4.5:1 sobre as duas superficies claras", () => {
  const fundos = [tokens.foundation.cor["surface-elevated"], tokens.foundation.cor["surface-work"]];
  const reprovados: string[] = [];
  for (const [nome, hex] of Object.entries(tokens.ink)) {
    if (nome.startsWith("_")) continue;
    for (const fundo of fundos) {
      const r = contraste(hex, fundo);
      if (r < 4.5) reprovados.push(`${nome} sobre ${fundo} = ${r.toFixed(2)}`);
    }
  }
  assert.deepEqual(reprovados, [], `contraste insuficiente: ${reprovados.join("; ")}`);
});

teste("estados: o controle positivo do contraste — signal/* REPROVA e por isso ink existe", () => {
  // Sem este par, o teste acima passaria com uma paleta escolhida por sorte e
  // ninguem saberia por que os tokens `ink` foram criados.
  const fundo = tokens.foundation.cor["surface-work"];
  assert.ok(
    contraste(tokens.foundation.cor["signal-calm"], fundo) < 4.5,
    "signal-calm passou 4.5:1 — se isso mudou, a justificativa dos tokens ink caiu e o JSON precisa ser corrigido",
  );
  assert.ok(
    contraste(tokens.ink["ink-calm"], fundo) >= 4.5,
    "ink-calm precisa passar onde signal-calm reprova",
  );
});

/* ------------------------------------------------------------------ *
 * 3. Ausencia nunca vira zero
 * ------------------------------------------------------------------ */

teste("null nao vira zero: `Campo` ausente nao carrega valor algum", () => {
  const c = deValorPossivelmenteAusente<number>(null, "real", AGORA_DEMO, "nao medido");
  assert.equal(c.observado, false);
  assert.equal(Object.prototype.hasOwnProperty.call(c, "valor"), false);
  const zeroLegitimo = deValorPossivelmenteAusente<number>(0, "real", AGORA_DEMO, "x");
  assert.equal(zeroLegitimo.observado, true, "zero MEDIDO continua sendo zero");
  assert.equal(zeroLegitimo.observado === true ? zeroLegitimo.valor : -1, 0);
});

teste("confianca sem evidencia nao e apresentada", () => {
  const semEvidencia = confiancaApresentavel(0.9, []);
  assert.equal(semEvidencia.observado, false);
  assert.equal(
    semEvidencia.observado === false ? semEvidencia.motivo : "",
    "evidencia_insuficiente",
  );
  const foraDeFaixa = confiancaApresentavel(1.4, [
    { tipo: "t", referencia: "r", observado_em: AGORA_DEMO },
  ]);
  assert.equal(foraDeFaixa.observado, false);
  // Controle positivo: com evidencia e dentro da faixa, ela APARECE.
  const ok = confiancaApresentavel(0.75, [
    { tipo: "t", referencia: "r", observado_em: AGORA_DEMO },
  ]);
  assert.equal(ok.observado, true);
});

teste("Operacao Viva: capacidade desconhecida vira ausencia, nunca zero", async () => {
  const { projecao } = await montarCadeiaDemo();
  const vm = operacaoVivaVM(projecao);
  const cap = vm.dimensoes.find((d) => d.id === "capacidade_operacional");
  assert.ok(cap);
  assert.equal(projecao.dimensoes.capacidade_operacional, "desconhecida");
  assert.equal(cap.valor.observado, false, "capacidade desconhecida virou valor");
  assert.equal(cap.selo.estado, "indisponivel");
  const serial = JSON.stringify(cap);
  assert.equal(/"valor"\s*:\s*0/.test(serial), false, "ausencia serializada como zero");
});

teste("Operacao Viva: viagem sem posicao e ausencia, nao posicao parada", async () => {
  const { projecao } = await montarCadeiaDemo();
  const vm = operacaoVivaVM(projecao);
  const gama = vm.viagens.find((v) => v.viagem_id === "t-gama");
  assert.ok(gama, "a fixture precisa manter uma viagem que nunca reportou posicao");
  assert.equal(gama.ultima_posicao_em.observado, false);
  assert.equal(gama.frescor, "unknown");
  assert.equal(gama.selo_frescor.estado, "indisponivel");
  // Controle positivo: quem reportou tem valor.
  const alfa = vm.viagens.find((v) => v.viagem_id === "t-alfa");
  assert.ok(alfa && alfa.ultima_posicao_em.observado === true);
});

/* ------------------------------------------------------------------ *
 * 4. Viagem nao e pedido
 * ------------------------------------------------------------------ */

teste("viagem nao e pedido: nenhum campo de pedido recebe trip_id", async () => {
  const { projecao } = await montarCadeiaDemo();
  const vm = operacaoVivaVM(projecao);
  const ids = projecao.viagens.map((v) => v.trip_id);
  for (const v of vm.viagens) {
    assert.equal(v.rotulo_identidade, "Viagem");
    const chaves = Object.keys(v);
    for (const k of chaves) {
      if (/pedido|order|external/i.test(k)) {
        assert.fail(`a view model de viagem ganhou o campo de pedido "${k}"`);
      }
    }
  }
  // E o trip_id nao pode aparecer em NENHUM campo de pedido do Copiloto.
  const { resultadoCopiloto } = await montarCadeiaDemo();
  const cop = copilotoVM(resultadoCopiloto);
  for (const r of [...cop.ativas, ...cop.fora_de_atividade]) {
    if (r.pedido_ref.observado === true) {
      assert.equal(
        ids.includes(r.pedido_ref.valor),
        false,
        "um trip_id apareceu como identidade de pedido",
      );
    }
  }
});

teste("Entregas: a identidade da viagem nunca ocupa o campo de pedido da parada", async () => {
  const f = await montarEntregasDemo();
  const snap = await f.snapshot();
  const vm = entregasVM(snap, AGORA_DEMO, f.getPolicyMaxStops());
  assert.ok(vm.viagens.length > 0, "a demonstracao precisa ter viagem montada");
  const idsViagem = vm.viagens.map((v) => v.viagem_id);
  for (const v of vm.viagens) {
    for (const p of v.paradas) {
      assert.equal(
        idsViagem.includes(p.pedido_ref),
        false,
        `a parada ${p.delivery_id} recebeu um id de viagem como pedido`,
      );
    }
  }
});

teste("Entregas: parada removida e preservada, nunca apagada", async () => {
  const f = await montarEntregasDemo();
  const vm = entregasVM(await f.snapshot(), AGORA_DEMO, f.getPolicyMaxStops());
  const removida = vm.viagens.flatMap((v) => v.paradas).filter((p) => p.ativa === false);
  assert.ok(removida.length > 0, "a demonstracao precisa exercitar remocao");
});

teste("Entregas: o aparelho declara integracao pendente em vez de zero", async () => {
  const f = await montarEntregasDemo();
  const vm = entregasVM(await f.snapshot(), AGORA_DEMO, f.getPolicyMaxStops());
  for (const [nome, c] of Object.entries(vm.dispositivo)) {
    assert.equal(c.observado, false, `${nome} afirmou valor sem rota de leitura`);
    assert.equal(
      c.observado === false ? c.motivo : "",
      "integracao_pendente",
      `${nome} usou o motivo errado`,
    );
  }
  // Controle positivo: a fila DESTA SESSAO e medida e aparece.
  assert.equal(vm.fila_da_sessao.observado, true);
});

teste("Entregas: offline e sincronizando sao estados distintos", async () => {
  const f = await montarEntregasDemo();
  const vmSync = entregasVM(await f.snapshot(), AGORA_DEMO, 5);
  assert.equal(vmSync.conexao.estado, "sincronizando");
  f.setConnection("offline");
  const vmOff = entregasVM(await f.snapshot(), AGORA_DEMO, 5);
  assert.equal(vmOff.conexao.estado, "offline");
  assert.notEqual(vmSync.conexao.estado, vmOff.conexao.estado);
});

/* ------------------------------------------------------------------ *
 * 5. Conference Brain — o par que da sentido ao zero
 * ------------------------------------------------------------------ */

teste("Brain: a cadeia real devolve ZERO pedido E o controle positivo devolve UM", async () => {
  const c = await montarCadeiaDemo();
  const real = conferenceBrainVM(c.leituraBrain);
  const ctrl = conferenceBrainVM(c.leituraControlePositivo);

  assert.equal(real.observacoes_de_pedido.observado, true);
  assert.equal(
    real.observacoes_de_pedido.observado === true ? real.observacoes_de_pedido.valor : -1,
    0,
    "a cadeia real deveria recusar pedido",
  );
  // O par. Sem ele, o zero acima passaria com o observador quebrado.
  assert.equal(
    ctrl.observacoes_de_pedido.observado === true ? ctrl.observacoes_de_pedido.valor : -1,
    1,
    "o controle positivo nao produziu observacao — o cano esta entupido, e o zero acima nao significa recusa",
  );
  assert.equal(real.procedencia, "simulado");
  assert.equal(ctrl.procedencia, "controle_positivo_sintetico");
  assert.notEqual(real.procedencia, ctrl.procedencia);
});

teste("Brain: nenhuma conclusao de pedido nasce da cadeia real", async () => {
  const c = await montarCadeiaDemo();
  const real = conferenceBrainVM(c.leituraBrain);
  assert.ok(real.conclusoes.length > 0, "a cadeia real precisa produzir conclusao de FONTE");
  for (const k of real.conclusoes) {
    assert.equal(k.especie, "source_health", "conclusao de pedido nasceu da cadeia real");
  }
  // Controle positivo: pela fonte legitima, ela nasce.
  const ctrl = conferenceBrainVM(c.leituraControlePositivo);
  assert.ok(
    ctrl.conclusoes.some((k) => k.especie === "order_dimension"),
    "o controle positivo deveria produzir conclusao de pedido",
  );
});

teste("Brain: linha recusada nao tem por onde exibir conteudo", async () => {
  const c = await montarCadeiaDemo();
  const vm = conferenceBrainVM(c.leituraBrain);
  const serial = JSON.stringify(vm.armazenamento.linhas_invalidas);
  for (const proibido of ["conteudo", "content", "raw", "registro", "record", "payload"]) {
    assert.equal(serial.includes(proibido), false, `linha invalida carregou ${proibido}`);
  }
  const fonte = ler("src/product/viewmodels/conference-vm.ts");
  const iface = fonte.slice(
    fonte.indexOf("interface LinhaInvalidaLida"),
    fonte.indexOf("interface SaudeStoreLida"),
  );
  for (const proibido of ["conteudo", "content", "raw", "payload"]) {
    assert.equal(
      iface.includes(proibido),
      false,
      `o tipo de linha invalida ganhou o campo ${proibido}`,
    );
  }
});

teste("Brain: parcial nao e apresentado como saudavel", async () => {
  const c = await montarCadeiaDemo();
  const vm = conferenceBrainVM(c.leituraBrain);
  const parciais = c.leituraBrain.ciclos.filter((x) => x.source_health === "partial");
  assert.ok(parciais.length > 0, "a fixture precisa exercitar `partial`");
  for (const f of vm.fontes) {
    if (f.selo_saude.estado === "saudavel") {
      assert.fail("um ciclo `partial` foi apresentado como saudavel");
    }
  }
  assert.ok(vm.fontes.every((f) => f.selo_saude.estado === "parcial"));
});

/* ------------------------------------------------------------------ *
 * 6. Copiloto — sombra e ausencia de acao
 * ------------------------------------------------------------------ */

teste("Copiloto: nada executa, e o estado `executed` nao existe", async () => {
  const c = await montarCadeiaDemo();
  const vm = copilotoVM(c.resultadoCopiloto);
  assert.equal(vm.nenhuma_acao_executada, true);

  /**
   * A checagem anda pelos VALORES, nao pelo texto serializado inteiro. Buscar a
   * palavra no JSON cru acusava a propria frase que NEGA a execucao ("o estado
   * `executed` nao existe") — um teste que reprova a garantia que ele deveria
   * proteger nao mede nada.
   */
  const valores: string[] = [];
  const andar = (v: unknown): void => {
    if (typeof v === "string") valores.push(v.toLowerCase());
    else if (Array.isArray(v)) v.forEach(andar);
    else if (v && typeof v === "object") Object.values(v).forEach(andar);
  };
  andar(vm);
  for (const proibido of ["executed", "executar", "auto_apply", "aplicar"]) {
    const vazou = valores.filter((s) => s === proibido);
    assert.deepEqual(vazou, [], `um valor do vocabulario de execucao vazou: ${proibido}`);
  }
  for (const r of vm.ativas) {
    assert.equal(r.selo_shadow.estado, "shadow");
    assert.equal(r.selo_decisao_humana.estado, "acao_humana_necessaria");
    assert.ok(r.porque_nao_executada.includes("sombra"));
  }
});

teste("Copiloto: a cadeia real so produz recomendacao de FONTE", async () => {
  const c = await montarCadeiaDemo();
  const vm = copilotoVM(c.resultadoCopiloto);
  assert.ok(vm.ativas.length > 0, "a cadeia real precisa produzir recomendacao de fonte");
  for (const r of [...vm.ativas, ...vm.fora_de_atividade]) {
    assert.equal(r.escopo, "fonte");
    assert.equal(
      r.pedido_ref.observado,
      false,
      "recomendacao de fonte nao pode ter identidade de pedido",
    );
  }
});

teste("Copiloto: a superficie nao oferece execucao", () => {
  const js = ler("src/product/ui/surfaces/copiloto.js");
  // Nenhum controle alem do inspetor (que so mostra mais texto).
  const botoes = js.match(/<button[^>]*>/g) || [];
  for (const b of botoes) {
    assert.ok(
      b.includes("inspetor__botao"),
      `a tela do Copiloto ganhou um botao que nao e inspetor: ${b}`,
    );
  }
  assert.equal(/<form/i.test(js), false, "formulario na tela do Copiloto");
  assert.equal(/<input/i.test(js), false, "campo de entrada na tela do Copiloto");
  const semComentario = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const verbo of ["Executar", "Aplicar", "Aceitar", "Despachar", "Mover", "Retirar"]) {
    assert.equal(
      semComentario.includes(`>${verbo}`),
      false,
      `rotulo de acao operacional na tela: ${verbo}`,
    );
  }
});

teste("Copiloto: expirado, retirado e invalidado sao estados distintos", () => {
  const json = JSON.parse(ler(TOKENS_JSON)) as TokensJson;
  const e = json.estados;
  const assinatura = (n: string): string => `${e[n].glifo}|${e[n].padrao}|${e[n].ink}`;
  const tres = ["expirado", "retirado", "invalidado"].map(assinatura);
  assert.equal(new Set(tres).size, 3, "os tres estados terminais colidiram");
});

/* ------------------------------------------------------------------ *
 * 7. Fixture, runtime e direcao de dependencia
 * ------------------------------------------------------------------ */

teste("fixture: a demonstracao nao entra em runtime de producao", () => {
  for (const entrada of [
    "src/platform/bin/critical.ts",
    "src/platform/bin/async-runtime.ts",
  ]) {
    const t = ler(entrada);
    assert.equal(t.includes("seed-demonstracao"), false, `${entrada} importa a fixture`);
    assert.equal(t.includes("product/"), false, `${entrada} importa o Product System`);
    assert.equal(t.includes("product_system_server"), false, `${entrada} importa o servidor de UI`);
  }
});

teste("fixture: nenhuma superficie visual importa a fixture", () => {
  for (const arquivo of [
    "src/product/ui/app.js",
    "src/product/ui/surfaces/entregas.js",
    "src/product/ui/surfaces/operacao-viva.js",
    "src/product/ui/surfaces/conference-brain.js",
    "src/product/ui/surfaces/copiloto.js",
    "src/product/ui/components/ui.js",
  ]) {
    const t = ler(arquivo);
    assert.equal(t.includes("seed-demonstracao"), false, `${arquivo} importa a fixture`);
    assert.equal(t.includes("demo/"), false, `${arquivo} importa o diretorio de demonstracao`);
  }
});

teste("dependencia: componente visual nao importa modulo interno do Brain nem do Copiloto", () => {
  for (const arquivo of [
    "src/product/ui/surfaces/conference-brain.js",
    "src/product/ui/surfaces/copiloto.js",
    "src/product/viewmodels/conference-vm.ts",
  ]) {
    const t = ler(arquivo);
    assert.equal(t.includes("conference-brain/"), false, `${arquivo} importa o Brain por dentro`);
    assert.equal(t.includes("require("), false, `${arquivo} usa require para alcancar o Brain`);
  }
});

teste("fixture: a fixture esta rotulada e o rotulo nao e comentario solto", () => {
  const t = ler(SEED);
  assert.ok(t.includes("ESTE ARQUIVO E FIXTURE"));
  const vm = ler("src/product/viewmodels/entregas-vm.ts");
  assert.ok(vm.includes("somente_demonstracao"), "a superficie precisa se declarar demonstracao");
});

/* ------------------------------------------------------------------ *
 * 8. Navegacao
 * ------------------------------------------------------------------ */

teste("navegacao: modulo futuro nunca se apresenta como disponivel", () => {
  const implementados = MODULOS.filter((m) => m.disponibilidade === "implementado");
  const futuros = MODULOS.filter((m) => m.disponibilidade === "futuro");
  assert.equal(implementados.length, 4, "as quatro superficies prioritarias");
  assert.equal(MODULOS.length, 11, "os onze modulos da arquitetura");
  for (const m of futuros) {
    assert.equal(m.estado, "futuro", `${m.id} nao carrega o estado futuro`);
    assert.ok(m.visao.length > 40, `${m.id} precisa declarar a visao`);
  }
  for (const m of implementados) {
    assert.equal(m.visao, "", "modulo implementado nao usa o campo de visao");
  }
  for (const m of MODULOS) {
    assert.ok(
      GRUPOS.some((g) => g.id === m.grupo),
      `${m.id} esta num grupo inexistente`,
    );
  }
});

teste("navegacao: modulo futuro nao tem tela de dado", () => {
  const t = ler("src/product/ui/surfaces/modulo-futuro.js");
  assert.equal(t.includes("metric("), false, "a tela de modulo futuro mostra metrica");
  assert.equal(t.includes("tabela("), false, "a tela de modulo futuro mostra tabela");
  assert.ok(t.includes("Nenhum dado foi fabricado"));
});

/* ------------------------------------------------------------------ *
 * 9. Acessibilidade e responsividade
 * ------------------------------------------------------------------ */

teste("a11y: o shell tem atalho, marcos e regiao viva educada", () => {
  const html = ler(HTML_SHELL);
  assert.ok(html.includes('class="skip-link"'), "sem link de pular para o conteudo");
  assert.ok(html.includes("<main"), "sem marco main");
  assert.ok(html.includes("<nav"), "sem marco nav");
  assert.ok(html.includes('aria-label="Modulos do DeliveryOS"'));
  assert.ok(html.includes('aria-live="polite"'), "a regiao que troca precisa ser polite");
  assert.equal(html.includes('aria-live="assertive"'), false, "assertive interrompe quem le");
  assert.ok(html.includes('aria-expanded="false"'), "o botao de menu precisa declarar estado");
  assert.ok(html.includes('aria-controls="navPrincipal"'));
  assert.ok(html.includes('lang="pt-BR"'));
});

teste("a11y: o glifo do badge e escondido e o rotulo viaja em texto", () => {
  const ui = ler("src/product/ui/components/ui.js");
  assert.ok(ui.includes('aria-hidden="true"'), "o glifo precisa ser escondido do leitor");
  assert.ok(ui.includes('class="sr-only"'), "o texto acessivel precisa existir");
  assert.ok(ui.includes("texto_acessivel"), "o badge precisa usar o texto do dicionario");
  const icons = ler("src/product/ui/components/icons.js");
  assert.ok(icons.includes('aria-hidden="true"'), "icone precisa ser decorativo");
  assert.ok(icons.includes('focusable="false"'), "icone nao pode receber foco");
});

teste("a11y: foco visivel e nunca atrasado por transicao", () => {
  const css = ler(CSS_PRODUTO);
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("--focus-ring-width"));
  const bloco = css.slice(css.indexOf(".ds :focus-visible"), css.indexOf("ESTADO SEMANTICO"));
  assert.equal(/transition/.test(bloco), false, "o anel de foco nao pode ter transicao");
});

teste("responsivo: as tres folhas defendem a tela pequena", () => {
  const shell = ler(CSS_SHELL);
  const comp = ler(CSS_COMPONENTES);
  assert.ok(shell.includes("overflow-x: hidden"), "o conteudo precisa conter estouro lateral");
  assert.ok(shell.includes("@media (min-width: 905px)"), "sem ponto de virada do rail");
  assert.ok(comp.includes("min-width: 0"), "grade sem min-width:0 estoura com texto longo");
  assert.ok(comp.includes("overflow-wrap: anywhere"), "texto tecnico longo precisa quebrar");
  assert.ok(comp.includes("@media (max-width: 599px)"), "a tabela precisa virar lista");
  assert.ok(comp.includes("data-rotulo"), "a tabela em lista precisa carregar o rotulo da coluna");
  assert.ok(shell.includes("--touch-min"), "alvo de toque precisa vir do token");
});

teste("motion: reduced motion existe e nada informativo vive so no movimento", () => {
  const css = ler(CSS_PRODUTO);
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  const bloco = css.slice(css.lastIndexOf("@media (prefers-reduced-motion"));
  assert.ok(bloco.includes("animation: none"), "reduced motion precisa parar a animacao");
  assert.ok(bloco.includes("--motion-instant"), "reduced motion precisa zerar a transicao");
  // Nenhuma classe de animacao carrega texto: o conteudo ja esta no DOM.
  const ui = ler("src/product/ui/components/ui.js");
  assert.equal(
    /ds-reveal[^"]*"[^>]*>\s*<\/[a-z]/.test(ui),
    false,
    "elemento animado sem conteudo proprio",
  );
});

teste("motion: nenhuma animacao move layout", () => {
  const css = ler(CSS_PRODUTO);
  const keyframes = css.match(/@keyframes[\s\S]*?\n}/g) || [];
  assert.ok(keyframes.length > 0, "sem keyframes para inspecionar");
  for (const k of keyframes) {
    for (const propriedade of ["height:", "margin", "padding", "font-size", "top:", "left:"]) {
      assert.equal(
        k.includes(propriedade),
        false,
        `keyframe anima propriedade que move layout: ${propriedade}`,
      );
    }
  }
});

/* ------------------------------------------------------------------ *
 * 10. O servidor de apresentacao
 * ------------------------------------------------------------------ */

function pedir(
  servidor: http.Server,
  caminho: string,
  metodo = "GET",
): Promise<{ status: number; corpo: string }> {
  return new Promise((resolve, reject) => {
    const endereco = servidor.address();
    if (typeof endereco === "string" || endereco === null) {
      reject(new Error("servidor sem porta"));
      return;
    }
    const req = http.request(
      { host: "127.0.0.1", port: endereco.port, path: caminho, method: metodo },
      (res) => {
        let corpo = "";
        res.on("data", (c) => {
          corpo += String(c);
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, corpo }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

teste("servidor: as rotas prioritarias respondem e nenhuma escrita e aceita", async () => {
  const s = await criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  try {
    for (const rota of [
      "/api/health",
      "/api/estados",
      "/api/navegacao",
      "/api/entregas",
      "/api/operacao-viva",
      "/api/conference-brain",
      "/api/copiloto",
      "/",
      "/app.js",
      "/tokens/product-tokens.css",
      "/shared/tokens.css",
    ]) {
      const r = await pedir(s, rota);
      assert.equal(r.status, 200, `${rota} respondeu ${r.status}`);
    }
    // A trava: escrita e recusada antes de qualquer roteamento.
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await pedir(s, "/api/copiloto", metodo);
      assert.equal(r.status, 405, `${metodo} nao foi recusado`);
      assert.ok(r.corpo.includes("metodo_nao_permitido"));
    }
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});

teste("servidor: nao existe rota de escrita para desativar", () => {
  const t = ler("tools/product_system_server.ts");
  const semComentario = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const escrita of ['"POST"', '"PUT"', '"DELETE"', '"PATCH"']) {
    const ocorrencias = (semComentario.match(new RegExp(escrita, "g")) || []).length;
    assert.equal(ocorrencias, 0, `o servidor menciona ${escrita} fora do bloco de recusa`);
  }
  assert.ok(semComentario.includes('req.method !== "GET"'));
  assert.equal(semComentario.includes("readBody"), false, "o servidor le corpo de requisicao");
});

teste("servidor: o CSS canonico e servido do arquivo original, sem copia", async () => {
  const s = await criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  try {
    const r = await pedir(s, "/shared/tokens.css");
    assert.equal(r.corpo, ler(CSS_CANONICO), "a folha canonica servida divergiu do arquivo");
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});

teste("servidor: travessia de diretorio e recusada", async () => {
  const s = await criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  try {
    for (const alvo of ["/../../package.json", "/shared/../../../package.json"]) {
      const r = await pedir(s, alvo);
      assert.notEqual(r.status, 200, `${alvo} foi servido`);
    }
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});

/* ------------------------------------------------------------------ *
 * Encerramento
 * ------------------------------------------------------------------ */

void (async () => {
  await Promise.all(pend);
  if (failures.length > 0) {
    console.error(`\n=== Product System: ${failures.length} FALHAS ===`);
    for (const f of failures) console.error(`  FAIL  ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} testes do Product System OK ===\n`);
})();
