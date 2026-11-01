/**
 * A FILA DE PRONTOS OBSERVADA PELA PLATAFORMA — de onde ela vem, e o que não
 * pode virar.
 *
 * A fila mora no piloto: em `ready_orders.json` no modo arquivo (o do campo) e
 * em `entregas.ready_order` no PostgreSQL. A plataforma não sabe sozinha qual
 * dos dois é a verdade de uma unidade. Por isso a leitura do estado atual só
 * aceita uma fila de ORIGEM DECLARADA:
 *
 *  - `observacao_do_piloto`: a saída mínima do piloto (só pedido, canal,
 *    instante do registro e modo declarado; unidade, origem, instante da
 *    observação, disponibilidade e a marca do último fato publicado);
 *  - `postgres`: a tabela, quando ela é a autoridade daquela unidade;
 *  - nenhuma: a fila sai INDISPONÍVEL. Nunca zero.
 *
 * O que esta suíte prova: falso zero fechado; privacidade que falha fechada;
 * unidade; modo desconhecido nunca vira real; consulta recente não é evento
 * recente; atraso dos fatos declarado pela marca; falha da fonte; fora de
 * ordem; deduplicação com os fatos; e, em PostgreSQL isolado, a mesma coisa
 * pelo leitor somente-leitura com custo limitado pela fila.
 *
 * PostgreSQL: DELIVERYOS_PG_URL; sem ele, a parte de banco é PULADA EM VOZ ALTA.
 */
import assert from "node:assert/strict";
import { join } from "node:path";

const UNIT = "ITAIM";
let passed = 0;
const failures: string[] = [];

async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${nome}`);
  } catch (e) {
    failures.push(nome);
    console.error(`  FAIL ${nome}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

type Leituras = typeof import("./leitura/prontos-de-entregas");
async function leituras(): Promise<Leituras> {
  return await import(join(__dirname, "leitura", "prontos-de-entregas"));
}
/** A função nova, nomeada: ausente antes da correção (o vermelho diz isso). */
function exigir<K extends keyof Leituras>(L: Leituras, nome: K): NonNullable<Leituras[K]> {
  const f = (L as Record<string, unknown>)[nome as string];
  if (typeof f !== "function") throw new Error(`leitura sem ${String(nome)}: a fila observada não tem entrada`);
  return f as unknown as NonNullable<Leituras[K]>;
}

const H = (hhmm: string) => `2026-11-01T${hhmm}:00.000Z`;
type Modo = "real" | "simulated" | "control";

function pronto(o: { id: string; trip: string; entrega: string; pedido: string; registro: string; associacao: string; modo?: Modo }) {
  return {
    event_id: `ev-pronto-${o.id}`, event_type: "delivery_ready", unit_id: UNIT, trip_id: o.trip,
    occurred_at: H(o.registro),
    idempotency_key: `entregas-public:delivery_ready:${UNIT}:${o.pedido}:${H(o.registro)}`,
    source_mode: (o.modo ?? "simulated") as Modo,
    payload: { source_event_type: "delivery_ready", public_recorded_at: H(o.associacao), delivery_id: o.entrega,
      order_ref: o.pedido, ready_kind: "registro_expedicao" },
  };
}
const eventos = (fatos: ReturnType<typeof pronto>[]) => ({ disponivel: true as const, eventos: fatos });

/** A saída do piloto, como a rota a entrega. */
function observacao(o: {
  linhas: Array<{ pedido: string; registro: string; modo?: Modo | null; canal?: string | null }>;
  em?: string; unidade?: string; marca?: string | null; disponivel?: boolean; motivo?: string;
  extraLinha?: Record<string, unknown>; extraTopo?: Record<string, unknown>;
}): Record<string, unknown> {
  const disponivel = o.disponivel ?? true;
  return {
    schema: "deliveryos.ready-queue-observation.v1",
    unit_id: o.unidade ?? UNIT,
    origin: { system: "entregas-pilot", storage_backend: "file", process_started_at: H("09:00") },
    observed_at: o.em ?? H("10:10"),
    availability: disponivel ? "available" : "unavailable",
    reason: disponivel ? null : (o.motivo ?? "ready_queue_unreadable"),
    total: disponivel ? o.linhas.length : null,
    invalid_entries: disponivel ? 0 : null,
    entries: disponivel ? o.linhas.map((l) => ({
      order_ref: l.pedido, registered_at: H(l.registro), channel: l.canal === undefined ? "proprio" : l.canal,
      source_mode: l.modo === undefined ? "simulated" : l.modo, ...(o.extraLinha ?? {}),
    })) : [],
    facts_watermark: { availability: "available", covered_types: ["delivery_ready", "delivery_removed", "trip_started"],
      last_event_id: o.marca === undefined ? null : o.marca },
    ...(o.extraTopo ?? {}),
  };
}

function grupo<T extends { source_mode: string }>(grupos: readonly T[] | undefined, modo: string): T | undefined {
  return (grupos ?? []).find((g) => g.source_mode === modo);
}

async function main(): Promise<void> {
  console.log("FILA OBSERVADA — origem declarada, privacidade, unidade, modo, atraso");

  await teste("O2 a observação do piloto vira a fila: pedidos por modo, origem e instante da observação declarados", async () => {
    const L = await leituras();
    const fonte = exigir(L, "fonteDaObservacaoDoPiloto")(observacao({ linhas: [
      { pedido: "B", registro: "10:02" }, { pedido: "C", registro: "10:03" }, { pedido: "X", registro: "09:58", modo: null },
    ] }), { unit_id: UNIT, agora: H("10:10") });
    assert.equal(fonte.disponivel, true, JSON.stringify(fonte));
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fonte, eventos: eventos([]) });
    const na = atual.na_fila as unknown as { estado: string; origem: { sistema: string; armazenamento: string } | null;
      observado_em: string | null; grupos: Array<{ source_mode: string; total: number; pedidos: Array<{ order_ref: string }> }> };
    assert.equal(na.estado, "observado");
    assert.equal(na.origem?.sistema, "entregas-pilot");
    assert.equal(na.origem?.armazenamento, "file");
    assert.equal(na.observado_em, H("10:10"));
    assert.deepEqual(grupo(na.grupos, "simulated")?.pedidos.map((p) => p.order_ref), ["B", "C"]);
    assert.deepEqual(grupo(na.grupos, "nao_declarado")?.pedidos.map((p) => p.order_ref), ["X"]);
    assert.equal(grupo(na.grupos, "real"), undefined, "linha sem modo virou real");
  });

  await teste("O3 privacidade falha fechada: rótulo, autor ou campo desconhecido derrubam a observação inteira", async () => {
    const L = await leituras();
    const f = exigir(L, "fonteDaObservacaoDoPiloto");
    for (const [nome, obs] of [
      ["rótulo na linha", observacao({ linhas: [{ pedido: "B", registro: "10:02" }], extraLinha: { label: "Rua Sintética 9" } })],
      ["autor na linha", observacao({ linhas: [{ pedido: "B", registro: "10:02" }], extraLinha: { registered_by: { actor_id: "ops-1" } } })],
      ["campo no topo", observacao({ linhas: [{ pedido: "B", registro: "10:02" }], extraTopo: { ready_orders: [{ label: "x" }] } })],
    ] as const) {
      const fonte = f(obs, { unit_id: UNIT, agora: H("10:10") });
      assert.equal(fonte.disponivel, false, `${nome}: observação com campo não permitido foi aceita`);
      assert.equal((fonte as { motivo: string }).motivo, "campos_nao_permitidos", nome);
      assert.equal(JSON.stringify(fonte).includes("Rua Sintética"), false, `${nome}: o rótulo atravessou`);
    }
  });

  await teste("O4 unidade: observação de outra loja não entra (isolamento do Itaim)", async () => {
    const L = await leituras();
    const fonte = exigir(L, "fonteDaObservacaoDoPiloto")(observacao({ unidade: "MOOCA", linhas: [{ pedido: "B", registro: "10:02" }] }),
      { unit_id: UNIT, agora: H("10:10") });
    assert.equal(fonte.disponivel, false);
    assert.equal((fonte as { motivo: string }).motivo, "unidade_divergente");
  });

  await teste("O5 modo: desconhecido nunca vira real; modo inválido derruba; real e simulado não se somam", async () => {
    const L = await leituras();
    const f = exigir(L, "fonteDaObservacaoDoPiloto");
    const invalido = f(observacao({ linhas: [{ pedido: "B", registro: "10:02", modo: "REAL" as Modo }] }), { unit_id: UNIT, agora: H("10:10") });
    assert.equal(invalido.disponivel, false, "modo fora do vocabulário foi aceito");
    assert.equal((invalido as { motivo: string }).motivo, "linha_invalida");
    const misto = f(observacao({ linhas: [
      { pedido: "R1", registro: "10:01", modo: "real" }, { pedido: "S1", registro: "10:02" }, { pedido: "N1", registro: "10:03", modo: null },
    ] }), { unit_id: UNIT, agora: H("10:10") });
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: misto, eventos: eventos([]) });
    const g = (atual.na_fila as unknown as { grupos: Array<{ source_mode: string; total: number }> }).grupos;
    assert.equal(grupo(g, "real")?.total, 1);
    assert.equal(grupo(g, "simulated")?.total, 1);
    assert.equal(grupo(g, "nao_declarado")?.total, 1);
    assert.equal("total" in (atual.na_fila as object), false, "um total único somaria modos diferentes");
  });

  await teste("O6 consulta recente não é evento recente: espera e 'mais antigo' vêm do registro; a idade é da observação", async () => {
    const L = await leituras();
    const fonte = exigir(L, "fonteDaObservacaoDoPiloto")(observacao({ em: H("10:00"), linhas: [{ pedido: "B", registro: "09:50" }] }),
      { unit_id: UNIT, agora: H("10:10") });
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fonte, eventos: eventos([]) });
    const na = atual.na_fila as unknown as { idade_da_observacao_s: number | null; observado_em: string;
      grupos: Array<{ source_mode: string; mais_antigo_desde: string; pedidos: Array<{ registrado_em: string; espera_s: number }> }> };
    assert.equal(na.idade_da_observacao_s, 600, "a idade da observação não foi declarada");
    const s = grupo(na.grupos, "simulated")!;
    assert.equal(s.mais_antigo_desde, H("09:50"), "o instante da consulta virou instante do pedido");
    assert.equal(s.pedidos[0]!.registrado_em, H("09:50"));
    assert.equal(s.pedidos[0]!.espera_s, 1200, "a espera tem de contar do registro, não da observação");
  });

  await teste("O7 observação no futuro além da tolerância do relógio não é aceita", async () => {
    const L = await leituras();
    const fonte = exigir(L, "fonteDaObservacaoDoPiloto")(observacao({ em: H("10:20"), linhas: [{ pedido: "B", registro: "10:02" }] }),
      { unit_id: UNIT, agora: H("10:10") });
    assert.equal(fonte.disponivel, false);
    assert.equal((fonte as { motivo: string }).motivo, "observacao_no_futuro");
  });

  await teste("O8 atraso: a marca do último fato publicado decide se os fatos estão em dia; sem marca, 'desconhecida'", async () => {
    const L = await leituras();
    const f = exigir(L, "fonteDaObservacaoDoPiloto");
    const fatoA = pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" });
    const atrasado = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: f(observacao({ marca: "ev-pronto-B", linhas: [{ pedido: "C", registro: "10:03" }] }), { unit_id: UNIT, agora: H("10:10") }),
      eventos: eventos([fatoA]) }) as unknown as { consistencia_dos_fatos: string };
    assert.equal(atrasado.consistencia_dos_fatos, "fatos_atrasados", "B saiu da fila e o fato dele ainda não chegou: isso tem de aparecer");
    const emDia = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: f(observacao({ marca: "ev-pronto-A", linhas: [{ pedido: "C", registro: "10:03" }] }), { unit_id: UNIT, agora: H("10:10") }),
      eventos: eventos([fatoA]) }) as unknown as { consistencia_dos_fatos: string };
    assert.equal(emDia.consistencia_dos_fatos, "fatos_em_dia");
    const nenhum = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: f(observacao({ marca: null, linhas: [{ pedido: "C", registro: "10:03" }] }), { unit_id: UNIT, agora: H("10:10") }),
      eventos: eventos([]) }) as unknown as { consistencia_dos_fatos: string };
    assert.equal(nenhum.consistencia_dos_fatos, "fatos_em_dia", "nenhum fato publicado: nada pode estar atrasado");
    const semMarca = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: { disponivel: true, linhas: [{ order_ref: "C", registered_at: H("10:03"), channel: null }] },
      eventos: eventos([fatoA]) }) as unknown as { consistencia_dos_fatos: string };
    assert.equal(semMarca.consistencia_dos_fatos, "desconhecida", "fila sem marca afirmou consistência");
    const parcial = observacao({ marca: "ev-pronto-A", linhas: [{ pedido: "C", registro: "10:03" }] });
    (parcial.facts_watermark as Record<string, unknown>).covered_types = ["delivery_ready"];
    const naoCobre = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: f(parcial, { unit_id: UNIT, agora: H("10:10") }), eventos: eventos([fatoA]) }) as unknown as { consistencia_dos_fatos: string };
    assert.equal(naoCobre.consistencia_dos_fatos, "desconhecida", "marca que não cobre saída e retirada afirmou fatos em dia");
  });

  await teste("O9 fora de ordem e sem dupla contagem: observação mais velha que o fato conta o pedido uma vez", async () => {
    const L = await leituras();
    const f = exigir(L, "fonteDaObservacaoDoPiloto");
    const fatoA = pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" });
    const velha = f(observacao({ em: H("10:04"), marca: null, linhas: [{ pedido: "A", registro: "10:01" }, { pedido: "B", registro: "10:02" }] }),
      { unit_id: UNIT, agora: H("10:10") });
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: velha, eventos: eventos([fatoA]) });
    const g = (atual.na_fila as unknown as { grupos: Array<{ source_mode: string; pedidos: Array<{ order_ref: string }> }> }).grupos;
    assert.deepEqual(grupo(g, "simulated")?.pedidos.map((p) => p.order_ref), ["B"], "A contou na fila e na viagem");
    assert.equal(atual.fila_velha, 1);
    assert.equal(grupo(atual.aguardando_saida.grupos, "simulated")?.total, 1);
    const invertido = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: velha, eventos: eventos([fatoA].reverse()) });
    assert.deepEqual(invertido, atual, "a ordem de chegada mudou a leitura");
  });

  await teste("O10 falha da fonte: o piloto declara a fila ilegível e a leitura fica indisponível, sem zero; os fatos seguem", async () => {
    const L = await leituras();
    const fonte = exigir(L, "fonteDaObservacaoDoPiloto")(observacao({ disponivel: false, linhas: [] }), { unit_id: UNIT, agora: H("10:10") });
    assert.equal(fonte.disponivel, false);
    assert.equal((fonte as { motivo: string }).motivo, "ready_queue_unreadable");
    const fatoA = pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" });
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fonte, eventos: eventos([fatoA]) });
    assert.equal(atual.na_fila.estado, "indisponivel");
    assert.deepEqual((atual.na_fila as unknown as { grupos: unknown[] }).grupos, []);
    assert.equal(grupo(atual.aguardando_saida.grupos, "simulated")?.total, 1, "a falha da fila apagou os fatos");
    for (const lixo of [null, "texto", { schema: "outra" }, observacao({ linhas: [] , extraTopo: { schema: "deliveryos.ready-queue-observation.v0" } })]) {
      const r = exigir(L, "fonteDaObservacaoDoPiloto")(lixo, { unit_id: UNIT, agora: H("10:10") });
      assert.equal(r.disponivel, false, `observação malformada aceita: ${JSON.stringify(lixo)?.slice(0, 80)}`);
    }
  });

  await teste("O14 cliente da observação: falha vira ausência declarada, nunca exceção nem zero; o token não vaza", async () => {
    const { observarFilaDoPiloto } = await import(join(__dirname, "leitura", "fila-do-piloto")) as typeof import("./leitura/fila-do-piloto");
    const TOKEN = "tok-segredo-sintetico-observador";
    const pedidos: Array<{ url: string; auth: string | null }> = [];
    const falso = (resp: () => Promise<Response>): typeof fetch => (async (u: unknown, init?: RequestInit) => {
      pedidos.push({ url: String(u), auth: new Headers(init?.headers).get("authorization") });
      return await resp();
    }) as typeof fetch;
    const casos: Array<[string, typeof fetch, string]> = [
      ["rede fora", falso(async () => { throw new TypeError("fetch failed"); }), "piloto_inalcancavel"],
      ["credencial recusada", falso(async () => new Response("{}", { status: 403 })), "piloto_recusou_a_credencial"],
      ["erro do piloto", falso(async () => new Response("x", { status: 500 })), "piloto_respondeu_500"],
      ["resposta ilegível", falso(async () => new Response("<html>", { status: 200 })), "resposta_ilegivel"],
      ["sem resposta no prazo", ((_u: unknown, init?: RequestInit) => new Promise((_ok, falha) => {
        init?.signal?.addEventListener("abort", () => falha(new Error("abortado")));
      })) as typeof fetch, "piloto_sem_resposta_no_prazo"],
    ];
    for (const [nome, buscar, motivo] of casos) {
      const d = await observarFilaDoPiloto({ url_base: "http://127.0.0.1:9", token: TOKEN, prazo_ms: 50, buscar });
      assert.deepEqual(d, { origem: "observacao_do_piloto", indisponivel: motivo }, nome);
      assert.equal(JSON.stringify(d).includes(TOKEN), false, `${nome}: o token vazou`);
    }
    const ok = await observarFilaDoPiloto({ url_base: "http://127.0.0.1:9", token: TOKEN, prazo_ms: 50,
      buscar: falso(async () => new Response(JSON.stringify(observacao({ linhas: [] })), { status: 200 })) });
    assert.equal("observacao" in ok, true);
    assert.ok(pedidos.every((p) => p.url === "http://127.0.0.1:9/api/ready-orders/observation"), "o token ou parâmetro foi para a URL");
    assert.ok(pedidos.every((p) => p.auth === `Bearer ${TOKEN}`));
    const L = await leituras();
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: { disponivel: false, motivo: "piloto_inalcancavel" }, eventos: eventos([]) });
    assert.equal(atual.na_fila.estado, "indisponivel");
  });

  await bancoIsolado();

  const total = passed + failures.length;
  console.log(`FILA_OBSERVADA: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`FILA_OBSERVADA_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("FILA_OBSERVADA_GREEN");
}

/* ------------------------------------------------------------------ *
 * PostgreSQL isolado: o leitor somente-leitura                         *
 * ------------------------------------------------------------------ */

async function bancoIsolado(): Promise<void> {
  const url = process.env.DELIVERYOS_PG_URL?.trim();
  if (!url) {
    console.log("  PULADO PostgreSQL: DELIVERYOS_PG_URL ausente — O1, O11-O13 NAO rodaram");
    return;
  }
  const { bancoIsolado: criar } = await import("./banco-isolado");
  const L = await leituras();
  const db = await criar(url, undefined, "fila_observada");
  try {
    await db.cliente.query(`INSERT INTO identity.unit(unit_id,display_name) VALUES ($1,'Teste')`, [UNIT]);
    const inserir = async (f: ReturnType<typeof pronto>) => db.cliente.query(
      `INSERT INTO platform.event_log (event_id, event_type, occurred_at, recorded_at, unit_id,
         object_type, object_id, origin, idempotency_key, payload, source_mode, contract_version)
       VALUES ($1,$2,$3,$4,$5,'trip',$6,'entregas',$7,$8::jsonb,$9,'teste')`,
      [f.event_id, f.event_type, f.occurred_at, (f.payload as { public_recorded_at: string }).public_recorded_at,
        f.unit_id, f.trip_id, f.idempotency_key, JSON.stringify(f.payload), f.source_mode]);

    await teste("O1 falso zero fechado: a tabela da fila existe e está vazia, mas a unidade roda em arquivo — sem origem declarada, indisponível", async () => {
      const r = await L.lerProntosDeEntregas(db.cliente, { agora: new Date(H("10:10")), unit_id: UNIT });
      assert.equal(r.estado_atual.na_fila.estado, "indisponivel",
        `a tabela vazia virou fila vazia observada: ${JSON.stringify(r.estado_atual.na_fila)}`);
      assert.equal(r.estado_atual.na_fila.motivo, "origem_da_fila_nao_declarada");
    });

    const fatoA = pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" });
    await inserir(fatoA);

    await teste("O11 PostgreSQL com a observação do piloto: fila do arquivo, marca conferida no banco, fatos em dia", async () => {
      const obs = observacao({ marca: "ev-pronto-A", linhas: [{ pedido: "A", registro: "10:01" }, { pedido: "B", registro: "10:02" }] });
      const r = await L.lerProntosDeEntregas(db.cliente, { agora: new Date(H("10:10")), unit_id: UNIT,
        fila: { origem: "observacao_do_piloto", observacao: obs } } as never);
      const atual = r.estado_atual as unknown as { consistencia_dos_fatos: string; fila_velha: number | null;
        na_fila: { estado: string; grupos: Array<{ source_mode: string; pedidos: Array<{ order_ref: string }> }> } };
      assert.equal(atual.na_fila.estado, "observado");
      assert.deepEqual(grupo(atual.na_fila.grupos, "simulated")?.pedidos.map((p) => p.order_ref), ["B"]);
      assert.equal(atual.fila_velha, 1, "a linha velha de A não foi deduplicada contra o fato do banco");
      assert.equal(atual.consistencia_dos_fatos, "fatos_em_dia");
    });

    await teste("O12 PostgreSQL: marca que o banco ainda não tem vira 'fatos_atrasados' — nunca um estado completo inventado", async () => {
      const obs = observacao({ marca: "ev-pronto-NAO-INGERIDO", linhas: [{ pedido: "B", registro: "10:02" }] });
      const r = await L.lerProntosDeEntregas(db.cliente, { agora: new Date(H("10:10")), unit_id: UNIT,
        fila: { origem: "observacao_do_piloto", observacao: obs } } as never);
      assert.equal((r.estado_atual as unknown as { consistencia_dos_fatos: string }).consistencia_dos_fatos, "fatos_atrasados");
    });

    await teste("O13 PostgreSQL declarado como autoridade: a tabela é lida, sem rótulo, modo 'nao_declarado', consistência desconhecida", async () => {
      await db.cliente.query(`INSERT INTO entregas.ready_order (unit_id, order_ref, label, channel, created_at)
        VALUES ($1,'P1','Pedido P1 · Rua Sintética 9','proprio',$2)`, [UNIT, H("10:04")]);
      const r = await L.lerProntosDeEntregas(db.cliente, { agora: new Date(H("10:10")), unit_id: UNIT,
        fila: { origem: "postgres" } } as never);
      const atual = r.estado_atual as unknown as { consistencia_dos_fatos: string;
        na_fila: { estado: string; origem: { armazenamento: string } | null; grupos: Array<{ source_mode: string; pedidos: Array<{ order_ref: string }> }> } };
      assert.equal(atual.na_fila.estado, "observado");
      assert.equal(atual.na_fila.origem?.armazenamento, "postgres");
      assert.deepEqual(grupo(atual.na_fila.grupos, "nao_declarado")?.pedidos.map((p) => p.order_ref), ["P1"]);
      assert.equal(atual.consistencia_dos_fatos, "desconhecida");
      assert.equal(JSON.stringify(r).includes("Rua Sintética"), false, "o rótulo saiu do banco");
    });
  } finally {
    await db.descartar();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
