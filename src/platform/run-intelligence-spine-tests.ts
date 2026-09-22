/**
 * C3.3 e C3.4 — a espinha de inteligência não pode ferir a rua.
 *
 * A invariante que estas unidades defendem tem um custo assimétrico: se a
 * espinha estiver errada e contida, alguém perde uma recomendação em sombra;
 * se estiver errada e VAZANDO, um fato operacional já processado volta para
 * retry, a outbox acumula e a rua sente. Por isso as provas aqui não olham
 * para o estado da espinha primeiro — olham para o que aconteceu com o tick,
 * com os fatos e com a outbox ENQUANTO a espinha queimava.
 *
 * A falha é injetada trocando o módulo, não forjando dado ruim: dado ruim
 * prova o tratamento do dado: o que precisa de prova aqui é o tratamento da
 * EXCEÇÃO, inclusive a de um módulo que nem deveria poder explodir.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { OutboxMessage } from "./contracts/messaging";
import type { SourceMode } from "./contracts/event-catalog";
import { montarPonteDaOperacaoViva } from "./runtime/handler-operacao-viva";
import { montarEspinhaDeInteligencia, SPINE_VERSION } from "./runtime/intelligence-spine";
import type { Conclusao } from "./copiloto/conference-bridge";
import { AsyncRuntime } from "./runtime/async-worker";
import { MemoryOutboxRepository, MemoryJobRepository } from "./messaging/memory-queues";
import { loadPlatformConfig } from "./config/platform-config";

let passed = 0;
const failures: string[] = [];
const pend: Promise<void>[] = [];
function teste(nome: string, fn: () => Promise<void> | void): void {
  pend.push(
    Promise.resolve().then(fn).then(
      () => {
        passed += 1;
      },
      (e: unknown) => {
        failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      },
    ),
  );
}

const AGORA = new Date("2026-07-27T12:00:00.000Z");

/** Uma mensagem de outbox que a Operação Viva entende de verdade. */
function mensagem(seq: number, modo: SourceMode = "real", unidade = "ITAIM"): OutboxMessage {
  return {
    outbox_id: `o-${modo}-${seq}`,
    stream: "entregas",
    kind: "trip_created",
    payload: {
      event_id: `e-${modo}-${seq}`,
      event_type: "trip_created",
      unit_id: unidade,
      occurred_at: new Date(AGORA.getTime() - (10 - seq) * 1000).toISOString(),
      source_mode: modo,
      trip_id: `t-${modo}-${seq}`,
    },
    idempotency_key: `k-${modo}-${seq}`,
    correlation_id: "",
    state: "pending",
    attempts: 0,
    created_at: AGORA.toISOString(),
    available_at: AGORA.toISOString(),
  };
}

async function comFatos(msgs: readonly OutboxMessage[]) {
  const outbox = new MemoryOutboxRepository();
  for (const m of msgs) await outbox.enqueue(m);
  const ponte = montarPonteDaOperacaoViva();
  const runtime = new AsyncRuntime({
    identity: { version: "t", commit: "t", instance_id: "w1" },
    outbox,
    jobs: new MemoryJobRepository(),
    outboxHandlers: ponte.handlers,
    jobHandlers: {},
    worker_id: "w1",
    now: () => AGORA,
  });
  return { outbox, ponte, runtime };
}

/** Módulo que explode no ponto pedido. Nada de dado ruim: exceção mesmo. */
const EXPLODE = {
  adapter: {
    criarFetchOrders(): () => Promise<unknown> {
      throw new TypeError("adapter explodiu");
    },
    runIdDe: (u: string, m: string) => `x:${u}:${m}`,
  },
  store: { createStore: () => ({}) },
  observer: { createLiveObserver: () => ({ runCycle: async () => ({}) }) },
  conclusoes: { extrairConclusoes: () => ({ conclusoes: [], recusadas: [] }) },
};

console.log("=== C3.3/C3.4 — espinha de inteligência: isolamento e replay ===");

/* ================================================================== *
 * C3.3 — ISOLAMENTO DE FALHA
 * ================================================================== */

teste("C3.3-1 CONTROLE: sem espinha, o tick processa e a projeção enche", async () => {
  const { ponte, runtime } = await comFatos([mensagem(1), mensagem(2)]);
  const r = await runtime.tick();
  assert.equal(r.outbox_processed, 2);
  assert.equal(r.outbox_failed, 0);
  assert.equal(ponte.projecao({ agora: AGORA, unit_id: "ITAIM", source_mode: "real" }).viagens.length, 2);
});

teste("C3.3-2 espinha explodindo NÃO muda o resultado do tick", async () => {
  const { ponte, runtime, outbox } = await comFatos([mensagem(1), mensagem(2)]);
  const r = await runtime.tick();

  const espinha = montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    modulos: EXPLODE,
  });
  const antesDaOutbox = JSON.stringify(outbox.all());

  await espinha.executar();

  // O tick já tinha decidido; nada da espinha pode revisá-lo.
  assert.equal(r.outbox_processed, 2, "a espinha mexeu no processado");
  assert.equal(r.outbox_failed, 0, "a espinha transformou processado em falho");
  assert.equal(JSON.stringify(outbox.all()), antesDaOutbox, "a outbox mudou por causa da espinha");
});

teste("C3.3-3 executar() NUNCA lança, nem com o módulo explodindo", async () => {
  const { ponte } = await comFatos([mensagem(1)]);
  await (await comFatos([mensagem(1)])).runtime.tick();
  const { ponte: p2, runtime } = await comFatos([mensagem(1)]);
  await runtime.tick();
  const espinha = montarEspinhaDeInteligencia({ ponte: p2, agora: () => AGORA, modulos: EXPLODE });
  // Sem try/catch de propósito: se lançar, o teste falha por exceção, que é
  // exatamente o defeito que esta unidade existe para impedir.
  const s = await espinha.executar();
  assert.ok(s, "executar() não devolveu estado");
  void ponte;
});

teste("C3.3-4 a falha da espinha NÃO altera a projeção da Operação Viva", async () => {
  const { ponte, runtime } = await comFatos([mensagem(1), mensagem(2)]);
  await runtime.tick();
  const opc = { agora: AGORA, unit_id: "ITAIM", source_mode: "real" as SourceMode };
  const antes = JSON.stringify(ponte.projecao(opc));
  const tamanhoAntes = ponte.memoria.tamanho;

  await montarEspinhaDeInteligencia({ ponte, agora: () => AGORA, modulos: EXPLODE }).executar();

  assert.equal(JSON.stringify(ponte.projecao(opc)), antes, "a projeção mudou byte a byte");
  assert.equal(ponte.memoria.tamanho, tamanhoAntes, "a memória de fatos mudou de tamanho");
});

teste("C3.3-5 a falha FICA OBSERVÁVEL no estado da espinha", async () => {
  const { ponte, runtime } = await comFatos([mensagem(1)]);
  await runtime.tick();
  const espinha = montarEspinhaDeInteligencia({ ponte, agora: () => AGORA, modulos: EXPLODE });
  const s = await espinha.executar();

  assert.equal(s.falhas, 1, "falha não foi contada");
  assert.equal(s.passadas, 0, "passada que quebrou foi contada como boa");
  assert.ok(s.ultimo_erro, "erro não ficou registrado");
  assert.equal(s.ultimo_erro?.classe, "TypeError", "a classe do erro se perdeu");
  assert.equal(s.ultimo_erro?.escopo, "ITAIM|real", "o escopo que quebrou não foi nomeado");
});

teste("C3.3-6 só a CLASSE atravessa — a mensagem do erro não vaza para o estado", async () => {
  const { ponte, runtime } = await comFatos([mensagem(1)]);
  await runtime.tick();
  const segredo = "rua-das-flores-127-apto-42";
  const espinha = montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    modulos: {
      ...EXPLODE,
      adapter: {
        criarFetchOrders(): () => Promise<unknown> {
          throw new RangeError(segredo);
        },
        runIdDe: (u: string, m: string) => `x:${u}:${m}`,
      },
    },
  });
  const s = await espinha.executar();
  assert.equal(s.ultimo_erro?.classe, "RangeError");
  assert.ok(!JSON.stringify(s).includes(segredo), "a mensagem do erro vazou para o estado");
});

teste("C3.3-7 um escopo que explode não impede o outro de ser percorrido", async () => {
  const { ponte, runtime } = await comFatos([
    mensagem(1, "real"),
    mensagem(2, "simulated"),
  ]);
  await runtime.tick();

  let vistos = 0;
  const espinha = montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    modulos: {
      ...EXPLODE,
      adapter: {
        criarFetchOrders(o: Record<string, unknown>): () => Promise<unknown> {
          vistos++;
          // Só o `real` explode. O `simulated` precisa seguir.
          if (o.source_mode === "real") throw new TypeError("só o real");
          return async () => ({ orders: [], health: { state: "unavailable", reason: "teste" } });
        },
        runIdDe: (u: string, m: string) => `x:${u}:${m}`,
      },
    },
  });
  const s = await espinha.executar();

  assert.equal(s.escopos_vistos, 2, "a espinha parou no escopo que quebrou");
  assert.equal(vistos, 2, "o segundo escopo nunca foi tentado");
  assert.equal(s.ultimo_erro?.escopo, "ITAIM|real");
});

teste("C3.3-8 ESTRUTURAL: o runtime crítico não conhece a espinha", () => {
  const critico = readFileSync("src/platform/bin/critical.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.ok(
    !/intelligence-spine|montarEspinhaDeInteligencia/.test(critico),
    "o crítico passou a importar a espinha — /ready deixaria de ser independente dela",
  );
});

/* ================================================================== *
 * FLAG — desligada por padrão
 * ================================================================== */

teste("C3.3-9 a espinha vem DESLIGADA por padrão, em todo ambiente", () => {
  const base = { DELIVERYOS_DATABASE_URL: "postgres://localhost:5432/x" };
  for (const ambiente of ["local", "pilot", "production"]) {
    const cfg = loadPlatformConfig({
      ...base,
      DELIVERYOS_ENV: ambiente,
      DELIVERYOS_COMMIT: "abcdef1234",
      DELIVERYOS_DATABASE_SSL: "false",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.spine_enabled, false, `espinha ligada por padrão em ${ambiente}`);
  }
});

teste("C3.3-10 a flag liga, e só ela", () => {
  const cfg = loadPlatformConfig({
    DELIVERYOS_ENV: "local",
    DELIVERYOS_DATABASE_URL: "postgres://localhost:5432/x",
    DELIVERYOS_INTELLIGENCE_SPINE: "true",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.spine_enabled, true);
});

teste("C3.3-11 ESTRUTURAL: o worker só monta a espinha sob a flag", () => {
  const worker = readFileSync("src/platform/bin/async-runtime.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.match(
    worker,
    /cfg\.spine_enabled\s*\?\s*montarEspinhaDeInteligencia/,
    "a espinha deixou de ser condicionada à flag",
  );
  // E roda DEPOIS do tick: o `executar()` não pode estar dentro do try do tick.
  const posTick = worker.slice(worker.indexOf("await runtime.tick()"));
  assert.ok(
    posTick.includes("espinha.executar()"),
    "a espinha não é executada depois do tick",
  );
});

/* ================================================================== *
 * C3.4 — REPLAY / RESTART
 * ================================================================== */

/** Cadeia real, sem módulo injetado: é o caminho que roda na rua. */
async function espinhaReal(msgs: readonly OutboxMessage[]) {
  const { ponte, runtime } = await comFatos(msgs);
  await runtime.tick();
  return {
    ponte,
    espinha: montarEspinhaDeInteligencia({ ponte, agora: () => AGORA }),
  };
}

teste("C3.4-1 duas passadas seguidas não duplicam recomendação", async () => {
  const { espinha } = await espinhaReal([mensagem(1), mensagem(2)]);
  const a = await espinha.executar();
  const b = await espinha.executar();
  assert.equal(b.recomendacoes_ativas, a.recomendacoes_ativas, "a segunda passada duplicou");
  assert.equal(b.falhas, 0, `a cadeia real falhou: ${JSON.stringify(b.ultimo_erro)}`);
});

teste("C3.4-2 a LEITURA VIGENTE é estável entre passadas iguais", async () => {
  const { espinha } = await espinhaReal([mensagem(1)]);
  const a = await espinha.executar();
  const b = await espinha.executar();
  const c = await espinha.executar();
  // `conclusoes_lidas` NÃO entra aqui de propósito: ela é o log de ciclos e
  // cresce por desenho. O que precisa ser estável é a leitura de agora.
  const vigente = (s: typeof a) => ({
    escopos: s.escopos_vistos,
    vigentes: s.conclusoes_vigentes,
    recusas: s.recusas,
    ativas: s.recomendacoes_ativas,
    pedido: s.recomendacoes_de_pedido,
  });
  assert.deepEqual(vigente(b), vigente(a), "a segunda passada relatou outra leitura");
  assert.deepEqual(vigente(c), vigente(a), "a terceira passada relatou outra leitura");
});

teste("C3.4-2b o histórico cresce, a leitura vigente NÃO — o corte é contável", async () => {
  // Medido antes da correção: 3 passadas produziam 3 recomendações ativas
  // sobre a mesma fonte, crescendo sem limite. Este teste trava isso.
  const { espinha } = await espinhaReal([mensagem(1)]);
  const lidas: number[] = [];
  const vigentes: number[] = [];
  const ativas: number[] = [];
  for (let i = 0; i < 3; i++) {
    const s = await espinha.executar();
    lidas.push(s.conclusoes_lidas);
    vigentes.push(s.conclusoes_vigentes);
    ativas.push(s.recomendacoes_ativas);
  }
  assert.deepEqual(lidas, [1, 2, 3], `o log de ciclos não cresceu como esperado: ${lidas}`);
  assert.deepEqual(vigentes, [1, 1, 1], `a leitura vigente cresceu: ${vigentes}`);
  assert.deepEqual(ativas, [1, 1, 1], `as recomendações ativas cresceram: ${ativas}`);
});

teste("C3.4-3 source_mode NÃO cruza modos: cada escopo é percorrido sozinho", async () => {
  const { ponte, runtime } = await comFatos([
    mensagem(1, "real"),
    mensagem(2, "simulated"),
    mensagem(3, "control"),
  ]);
  await runtime.tick();

  const modosVistos: string[] = [];
  const espinha = montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    modulos: {
      ...EXPLODE,
      adapter: {
        criarFetchOrders(o: Record<string, unknown>): () => Promise<unknown> {
          modosVistos.push(String(o.source_mode));
          return async () => ({ orders: [], health: { state: "unavailable", reason: "teste" } });
        },
        runIdDe: (u: string, m: string) => `x:${u}:${m}`,
      },
    },
  });
  await espinha.executar();

  assert.equal(modosVistos.length, 3, "nem todos os modos foram percorridos");
  assert.equal(new Set(modosVistos).size, 3, "dois escopos receberam o mesmo source_mode");
  assert.deepEqual([...modosVistos].sort(), ["control", "real", "simulated"]);
});

teste("C3.4-4 o run_id carrega o modo — dois escopos nunca compartilham identidade", async () => {
  const { ponte, runtime } = await comFatos([mensagem(1, "real"), mensagem(2, "simulated")]);
  await runtime.tick();
  const ids: string[] = [];
  await montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    modulos: {
      ...EXPLODE,
      adapter: {
        criarFetchOrders: () => async () => ({ orders: [], health: { state: "unavailable", reason: "t" } }),
        runIdDe: (u: string, m: string) => {
          const id = `${u}:${m}`;
          ids.push(id);
          return id;
        },
      },
    },
  }).executar();
  assert.equal(new Set(ids).size, ids.length, "dois escopos produziram o mesmo run_id");
});

teste("C3.4-5 LACUNA DECLARADA: reinício zera a memória da espinha", async () => {
  // Não é um defeito escondido atrás de um teste verde: é a lacuna que a
  // Q-016 registra. A espinha guarda `anteriores` no processo, e um worker
  // reiniciado recomeça sem elas. Este teste PROVA a lacuna para que ela não
  // possa ser esquecida — e quebra no dia em que alguém a fechar, forçando a
  // Q-016 a ser respondida em vez de silenciosamente superada.
  const { espinha: primeira } = await espinhaReal([mensagem(1)]);
  await primeira.executar();

  const { espinha: reiniciada } = await espinhaReal([mensagem(1)]);
  const depois = reiniciada.estado();
  assert.equal(depois.passadas, 0, "a espinha reiniciada herdou passadas");
  assert.equal(depois.ultima_em, null, "a espinha reiniciada herdou carimbo");
});

teste("C3.4-6 a cadeia real não inventa pedido a partir de viagem", async () => {
  const { espinha } = await espinhaReal([mensagem(1), mensagem(2)]);
  const s = await espinha.executar();
  // A projeção de hoje é de VIAGEM. O Brain trabalha com PEDIDO e não recebe
  // identidade legítima para atravessar. Recomendação de escopo `pedido`
  // aqui significaria pedido fabricado.
  assert.equal(s.falhas, 0, `a cadeia real falhou: ${JSON.stringify(s.ultimo_erro)}`);
  assert.equal(
    s.recomendacoes_de_pedido,
    0,
    "viagem virou pedido inferido — ausência deixou de ser ausência",
  );
  // O que a cadeia PODE dizer com o que existe hoje é saúde da fonte. Zero
  // aqui significaria espinha muda, que é outro defeito.
  assert.ok(s.recomendacoes_ativas >= 0 && s.conclusoes_vigentes >= 1, "a cadeia não leu nada");
});

teste("C3.3-12 nem enumerar escopos pode escapar — o último anteparo existe", () => {
  // A suíte adversarial (MS2) mostrou que o catch externo nunca era exercido:
  // tudo quebrava dentro do laço e era contido lá. Um anteparo que nenhum
  // teste atravessa é um anteparo que ninguém sabe se funciona.
  const ponteQuebrada = {
    handlers: {},
    memoria: {
      escopos() {
        throw new EvalError("escopos explodiu");
      },
    },
    projecao: () => ({}),
  } as never;
  return montarEspinhaDeInteligencia({ ponte: ponteQuebrada, agora: () => AGORA })
    .executar()
    .then((s) => {
      assert.equal(s.falhas, 1, "a falha na enumeração não foi contada");
      assert.equal(s.ultimo_erro?.classe, "EvalError", "a classe do erro se perdeu");
      assert.equal(s.ultimo_erro?.escopo, "passada", "o anteparo externo não se identificou");
    });
});

/** Módulo cujo ciclo NUNCA resolve. Não lança: trava. É outro defeito. */
const TRAVA = {
  ...EXPLODE,
  adapter: {
    criarFetchOrders: () => async () => ({ orders: [], health: { state: "unavailable", reason: "t" } }),
    runIdDe: (u: string, m: string) => `x:${u}:${m}`,
  },
  observer: { createLiveObserver: () => ({ runCycle: () => new Promise<unknown>(() => {}) }) },
};

teste("C3.3-13 passada PRESA não segura o laço do worker", async () => {
  // MEDIDO antes de existir prazo: `executar()` não voltava em 4 s, e como o
  // laço do worker faz `await` nele, a outbox parava de ser consumida.
  // Contenção de exceção não é contenção de travamento.
  const { ponte, runtime } = await comFatos([mensagem(1)]);
  await runtime.tick();
  const espinha = montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    prazo_ms: 150,
    modulos: TRAVA,
  });

  const comeco = Date.now();
  const s = await espinha.executar();
  const levou = Date.now() - comeco;

  assert.ok(levou < 3000, `executar() segurou o laço por ${levou} ms`);
  assert.equal(s.prazos_vencidos, 1, "o prazo vencido não foi contado");
  assert.equal(s.ultimo_erro?.classe, "PrazoEsgotado");
});

teste("C3.3-14 passada seguinte NÃO começa enquanto a presa não voltou", async () => {
  const { ponte, runtime } = await comFatos([mensagem(1)]);
  await runtime.tick();
  const espinha = montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    prazo_ms: 100,
    modulos: TRAVA,
  });
  await espinha.executar();
  const s = await espinha.executar();
  assert.equal(s.sobreposicoes, 1, "a segunda passada começou sobre a primeira");
  // E continua voltando rápido — a guarda não pode virar outro travamento.
  const comeco = Date.now();
  await espinha.executar();
  assert.ok(Date.now() - comeco < 1000, "a guarda de sobreposição travou");
});

teste("C3.3-15 CONTROLE: com a cadeia sã, nada de prazo nem sobreposição", async () => {
  const { espinha } = await espinhaReal([mensagem(1)]);
  const s = await espinha.executar();
  assert.equal(s.prazos_vencidos, 0, "passada sã venceu prazo");
  assert.equal(s.sobreposicoes, 0, "passada sã acusou sobreposição");
  assert.equal(s.passadas, 1);
});

/* ================================================================== *
 * CONTROLE POSITIVO DA MEDIDA DE PEDIDO
 * ================================================================== */

/** Conclusão de PEDIDO legítima — a que a projeção de hoje NÃO consegue produzir. */
function conclusaoDePedidoLegitima(podeAfirmar: boolean): Conclusao {
  return {
    conclusion_version: "conference-brain-conclusion@1.0.0",
    conclusion_kind: "order_dimension" as const,
    conclusion_ref: "order_dimension:PED-1",
    unit_id: "ITAIM",
    source_mode: "real" as SourceMode,
    shadow: true,
    observed_at: AGORA.toISOString(),
    source_health: "available",
    pode_afirmar: podeAfirmar,
    evidence: [{ tipo: "live_observation", ref: "obs-1" }],
    limitacoes: [],
    external_id: "PED-1",
    order_state: "ready",
    readiness_state: "ready_notified",
    saida_observada: false,
  };
}

async function espinhaComConclusao(c: Conclusao) {
  const { ponte, runtime } = await comFatos([mensagem(1)]);
  await runtime.tick();
  return montarEspinhaDeInteligencia({
    ponte,
    agora: () => AGORA,
    modulos: {
      ...EXPLODE,
      adapter: {
        criarFetchOrders: () => async () => ({ orders: [], health: { state: "available", reason: "t" } }),
        runIdDe: (u: string, m: string) => `x:${u}:${m}`,
      },
      conclusoes: { extrairConclusoes: () => ({ conclusoes: [c], recusadas: [] }) },
    },
  }).executar();
}

teste("C3.4-8 CONTROLE POSITIVO: o contador de pedido CONTA quando há pedido legítimo", async () => {
  // Sem este controle, `recomendacoes_de_pedido === 0` na cadeia real seria
  // afirmação vazia: um contador quebrado dá zero do mesmo jeito. A suíte
  // adversarial (MS15) provou que era exatamente esse o caso.
  const s = await espinhaComConclusao(conclusaoDePedidoLegitima(true));
  assert.equal(s.falhas, 0, `a cadeia falhou: ${JSON.stringify(s.ultimo_erro)}`);
  assert.ok(
    s.recomendacoes_de_pedido >= 1,
    `o contador de pedido não contou um pedido legítimo (${s.recomendacoes_de_pedido})`,
  );
});

teste("C3.4-9 sem autorização para afirmar, o MESMO pedido não vira recomendação", async () => {
  const s = await espinhaComConclusao(conclusaoDePedidoLegitima(false));
  assert.equal(s.falhas, 0, `a cadeia falhou: ${JSON.stringify(s.ultimo_erro)}`);
  assert.equal(
    s.recomendacoes_de_pedido,
    0,
    "conclusão sem pode_afirmar virou recomendação de pedido",
  );
});

/* ================================================================== *
 * FRONTEIRAS QUE A ESPINHA NÃO PODE ATRAVESSAR
 * ================================================================== */

/** Código do runtime da espinha, sem comentário: comentário que cita a
 *  proibição já casou com ela antes. */
function codigoDaEspinha(): string {
  return [
    "src/platform/runtime/intelligence-spine.ts",
    "src/platform/bin/async-runtime.ts",
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

teste("C3.5-G1 Q-003 CONTINUA ABERTA: a espinha não toca o motor de decisão", () => {
  // Ligar `perfil-delivery/decisao.js` ao Copiloto escolheria, por código, qual
  // motor é dono da atenção — que é exatamente a pergunta que espera o César.
  assert.ok(
    !/perfil-delivery|decisao\.js|decidir\(/.test(codigoDaEspinha()),
    "a espinha passou a conhecer o motor de decisão — Q-003 respondida por conveniência técnica",
  );
});

teste("C3.5-G2 Q-004 CONTINUA ABERTA: conversation-crm segue sem wiring", () => {
  assert.ok(
    !/conversation-crm|conversationCrm/.test(codigoDaEspinha()),
    "o runtime passou a referenciar conversation-crm — Q-004 respondida por código",
  );
});

teste("C3.5-G3 shadow não executa efeito externo: a espinha não tem como agir", () => {
  // Não basta a recomendação dizer `shadow: true`. O processo que a produz não
  // pode ter, em mãos, nenhum meio de agir no mundo.
  const codigo = codigoDaEspinha();
  for (const proibido of ["child_process", "node:http", "node:https", "fetch(", "execFile", "spawn("]) {
    assert.ok(
      !codigo.includes(proibido),
      `a espinha ganhou acesso a ${proibido} — sombra com meio de execução não é sombra`,
    );
  }
});

teste("C3.5-G4 a espinha não escreve em disco nem cria tabela", () => {
  const espinha = readFileSync("src/platform/runtime/intelligence-spine.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.ok(/memoryOnly:\s*true/.test(espinha), "o store da espinha deixou de ser memoryOnly");
  for (const proibido of ["writeFileSync", "appendFileSync", "CREATE TABLE", "INSERT INTO"]) {
    assert.ok(!espinha.includes(proibido), `a espinha passou a persistir por conta própria: ${proibido}`);
  }
});

teste("C3.4-7 a versão da espinha é declarada e estável", () => {
  assert.match(SPINE_VERSION, /^intelligence-spine@\d+\.\d+\.\d+$/);
});

void (async () => {
  await Promise.all(pend);
  console.log(`\n${passed} passaram, ${failures.length} falharam`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length) process.exit(1);
})();
