/**
 * LEITURAS DO PRONTO — duas perguntas diferentes, duas respostas separadas.
 *
 *  1. ESTADO ATUAL — o que está esperando AGORA.
 *     - na fila: registrado como pronto e ainda não associado. Evidência: a
 *       própria fila (`entregas.ready_order`). A fila não guarda modo, então o
 *       grupo é `nao_declarado` — nunca vira real.
 *     - aguardando saída: já numa entrega de viagem que ainda não saiu.
 *       Evidência: fatos duráveis (`delivery_ready` sem `trip_started` da
 *       viagem e sem `delivery_removed` da entrega).
 *     Cada pedido conta uma vez: linha velha da fila com o MESMO registro de um
 *     fato (pedido + instante original) sai da fila e entra em `fila_velha`.
 *
 *  2. TRAJETÓRIA — registro → associação → saída, só com fatos duráveis e
 *     vínculos provados (mesma viagem, mesma entrega). O `delivery_ready` é
 *     gravado na associação e preserva, para trás, o instante do registro:
 *       registrado_em = occurred_at        (relógio do servidor, no registro)
 *       associado_em  = public_recorded_at (relógio do servidor, na associação)
 *       saiu_em       = trip_started.occurred_at (relógio de quem confirmou)
 *     A ordem entre associação e saída é decidida pelos carimbos do SERVIDOR;
 *     o relógio do aparelho só dá o valor. Intervalo negativo não é publicado:
 *     vira `inconsistente`, com motivo.
 *
 * Ausência nunca vira zero: fonte indisponível sai `indisponivel` com total
 * `null`. Fila lida e vazia é zero OBSERVADO. Real e simulado nunca se somam.
 * Fora de ordem não muda nada: o cálculo é sobre conjuntos, não sobre a ordem
 * de chegada. Nenhum rótulo, endereço ou autor sai daqui.
 */
import type { SqlClient, TransactionalSqlClient } from "../persistence/sql-client";
import { SOURCE_MODES, type SourceMode } from "../contracts/event-catalog";

export const LEITURA_DO_PRONTO_VERSAO = "prontos-de-entregas@1.0.0";

/** Tipos que a leitura usa. A Operação Viva não consome os dois primeiros. */
export const TIPOS_DA_LEITURA_DO_PRONTO: readonly string[] = ["delivery_ready", "delivery_removed", "trip_started"];

export interface LinhaDaFilaDePronto {
  readonly order_ref: string;
  readonly registered_at: string;
  readonly channel?: string | null;
}

export type FonteDaFila =
  | { readonly disponivel: true; readonly linhas: readonly LinhaDaFilaDePronto[] }
  | { readonly disponivel: false; readonly motivo: string };

export interface FatoDoPronto {
  readonly event_id: string;
  readonly event_type: string;
  readonly unit_id: string;
  readonly trip_id: string | null;
  readonly occurred_at: string;
  readonly idempotency_key: string;
  readonly source_mode: SourceMode | null;
  readonly payload: Record<string, unknown>;
}

export type FonteDosFatos =
  | { readonly disponivel: true; readonly eventos: readonly FatoDoPronto[] }
  | { readonly disponivel: false; readonly motivo: string };

export type SituacaoDoTrecho =
  | "saiu"
  | "aguardando_saida"
  | "retirado_antes_da_saida"
  | "associado_depois_da_saida"
  | "inconsistente";

export interface TrechoDoPronto {
  readonly trip_id: string;
  readonly delivery_id: string;
  readonly order_ref: string;
  readonly registrado_em: string;
  readonly associado_em: string;
  readonly saiu_em: string | null;
  readonly retirado_em: string | null;
  readonly situacao: SituacaoDoTrecho;
  readonly motivo: string | null;
  readonly registro_ate_associacao_s: number | null;
  readonly associacao_ate_saida_s: number | null;
  readonly registro_ate_saida_s: number | null;
}

export interface TrajetoriaDoPronto {
  readonly contrato: "trajetoria-do-pronto@1";
  readonly unit_id: string;
  readonly estado: "observado" | "indisponivel";
  readonly motivo: string | null;
  readonly grupos: readonly { readonly source_mode: SourceMode; readonly entregas: readonly TrechoDoPronto[] }[];
  /** Fatos sem modo declarado: fora da leitura, contados. `null` = sem fonte. */
  readonly sem_modo: number | null;
  /** Fatos sem os campos do contrato: fora da leitura, contados. */
  readonly invalidos: number | null;
  readonly conflitos: readonly { readonly delivery_id: string; readonly motivo: string }[];
}

export interface PedidoNaFila {
  readonly order_ref: string;
  readonly registrado_em: string;
  readonly espera_s: number | null;
}

export interface EntregaAguardandoSaida {
  readonly trip_id: string;
  readonly delivery_id: string;
  readonly order_ref: string;
  readonly registrado_em: string;
  readonly associado_em: string;
  readonly espera_s: number | null;
}

export interface EstadoAtualDoPronto {
  readonly contrato: "estado-atual-do-pronto@1";
  readonly unit_id: string;
  readonly lido_em: string;
  readonly na_fila: {
    readonly estado: "observado" | "indisponivel";
    readonly motivo: string | null;
    readonly source_mode: "nao_declarado";
    readonly total: number | null;
    readonly mais_antigo_desde: string | null;
    readonly pedidos: readonly PedidoNaFila[];
  };
  readonly aguardando_saida: {
    readonly estado: "observado" | "indisponivel";
    readonly motivo: string | null;
    readonly grupos: readonly {
      readonly source_mode: SourceMode;
      readonly total: number;
      readonly mais_antigo_desde: string | null;
      readonly entregas: readonly EntregaAguardandoSaida[];
    }[];
  };
  /** Retirados da viagem antes da saída e sem registro novo: paradeiro desconhecido. */
  readonly retirados_sem_novo_registro: {
    readonly estado: "observado" | "indisponivel";
    readonly motivo: string | null;
    readonly grupos: readonly { readonly source_mode: SourceMode; readonly total: number }[];
  };
  /** Linhas da fila cujo registro já virou fato: fora da fila, contadas aqui. */
  readonly fila_velha: number | null;
  readonly nenhuma_acao_executada: true;
}

/* ------------------------------------------------------------------ *
 * Utilidades puras                                                     *
 * ------------------------------------------------------------------ */

function ms(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function segundos(de: number, ate: number): number {
  return Math.round((ate - de) / 1000);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const chaveDoRegistro = (pedido: string, instante: number) => `${pedido}\u0000${instante}`;

function ordemDosModos(a: SourceMode, b: SourceMode): number {
  return SOURCE_MODES.indexOf(a) - SOURCE_MODES.indexOf(b);
}

/** Escopo comum: unidade, tipo, chave idempotente e modo. */
function noEscopo(unit_id: string, fatos: readonly FatoDoPronto[]): {
  porModo: Map<SourceMode, FatoDoPronto[]>;
  semModo: number;
} {
  const tipos = new Set(TIPOS_DA_LEITURA_DO_PRONTO);
  const vistos = new Set<string>();
  const porModo = new Map<SourceMode, FatoDoPronto[]>();
  let semModo = 0;
  for (const f of fatos) {
    if (f.unit_id !== unit_id || !tipos.has(f.event_type)) continue;
    if (vistos.has(f.idempotency_key)) continue;
    vistos.add(f.idempotency_key);
    if (f.source_mode === null || !SOURCE_MODES.includes(f.source_mode)) {
      semModo += 1;
      continue;
    }
    const lista = porModo.get(f.source_mode) ?? [];
    lista.push(f);
    porModo.set(f.source_mode, lista);
  }
  return { porModo, semModo };
}

/* ------------------------------------------------------------------ *
 * Trajetória                                                           *
 * ------------------------------------------------------------------ */

interface Registro {
  readonly trip_id: string;
  readonly delivery_id: string;
  readonly order_ref: string;
  readonly registrado: number;
  readonly registrado_em: string;
  readonly associado: number;
  readonly associado_em: string;
}

interface Marco {
  readonly servidor: number;
  readonly declarado: number;
  readonly declarado_em: string;
}

function marcoDe(f: FatoDoPronto): Marco | null {
  const declarado = ms(f.occurred_at);
  if (declarado === null) return null;
  return { servidor: ms(f.payload.public_recorded_at) ?? declarado, declarado, declarado_em: f.occurred_at };
}

function maisCedo(atual: Marco | undefined, novo: Marco): Marco {
  if (!atual) return novo;
  if (novo.servidor !== atual.servidor) return novo.servidor < atual.servidor ? novo : atual;
  return novo.declarado < atual.declarado ? novo : atual;
}

function trechosDoModo(fatos: readonly FatoDoPronto[]): {
  entregas: TrechoDoPronto[];
  conflitos: { delivery_id: string; motivo: string }[];
  invalidos: number;
} {
  let invalidos = 0;
  const conflitos: { delivery_id: string; motivo: string }[] = [];
  const registros = new Map<string, Registro[]>();
  const retiradas = new Map<string, Marco>();
  const saidas = new Map<string, Marco>();

  for (const f of fatos) {
    if (f.event_type === "trip_started") {
      const m = marcoDe(f);
      if (!f.trip_id || !m) { invalidos += 1; continue; }
      saidas.set(f.trip_id, maisCedo(saidas.get(f.trip_id), m));
      continue;
    }
    const delivery_id = texto(f.payload.delivery_id);
    const order_ref = texto(f.payload.order_ref);
    if (!f.trip_id || !delivery_id || !order_ref) { invalidos += 1; continue; }
    if (f.event_type === "delivery_removed") {
      const m = marcoDe(f);
      if (!m) { invalidos += 1; continue; }
      retiradas.set(delivery_id, maisCedo(retiradas.get(delivery_id), m));
      continue;
    }
    const registrado = ms(f.occurred_at);
    const associado = ms(f.payload.public_recorded_at);
    if (registrado === null || associado === null) { invalidos += 1; continue; }
    const lista = registros.get(delivery_id) ?? [];
    lista.push({
      trip_id: f.trip_id, delivery_id, order_ref, registrado, registrado_em: f.occurred_at,
      associado, associado_em: String(f.payload.public_recorded_at),
    });
    registros.set(delivery_id, lista);
  }

  const entregas: TrechoDoPronto[] = [];
  for (const [delivery_id, lista] of registros) {
    const ordenada = [...lista].sort((a, b) => a.registrado - b.registrado || a.associado - b.associado);
    const r = ordenada[0]!;
    const distintos = new Set(ordenada.map((x) => `${x.trip_id}|${x.order_ref}|${x.registrado}|${x.associado}`));
    const base = {
      trip_id: r.trip_id, delivery_id, order_ref: r.order_ref,
      registrado_em: r.registrado_em, associado_em: r.associado_em,
    };
    if (distintos.size > 1) {
      conflitos.push({ delivery_id, motivo: "registros_diferentes_para_a_mesma_entrega" });
      entregas.push({ ...base, saiu_em: null, retirado_em: null, situacao: "inconsistente",
        motivo: "registros_diferentes_para_a_mesma_entrega",
        registro_ate_associacao_s: null, associacao_ate_saida_s: null, registro_ate_saida_s: null });
      continue;
    }
    if (r.associado < r.registrado) {
      entregas.push({ ...base, saiu_em: null, retirado_em: null, situacao: "inconsistente",
        motivo: "associacao_antes_do_registro",
        registro_ate_associacao_s: null, associacao_ate_saida_s: null, registro_ate_saida_s: null });
      continue;
    }
    const regAssoc = segundos(r.registrado, r.associado);
    const saida = saidas.get(r.trip_id);
    const retirada = retiradas.get(delivery_id);
    const retiradoEm = retirada?.declarado_em ?? null;

    if (retirada && (!saida || retirada.servidor < saida.servidor)) {
      entregas.push({ ...base, saiu_em: null, retirado_em: retiradoEm, situacao: "retirado_antes_da_saida",
        motivo: null, registro_ate_associacao_s: regAssoc, associacao_ate_saida_s: null, registro_ate_saida_s: null });
      continue;
    }
    if (!saida) {
      entregas.push({ ...base, saiu_em: null, retirado_em: null, situacao: "aguardando_saida",
        motivo: null, registro_ate_associacao_s: regAssoc, associacao_ate_saida_s: null, registro_ate_saida_s: null });
      continue;
    }
    if (saida.servidor < r.associado) {
      // A viagem já tinha saído quando esta entrega entrou nela: a saída da
      // viagem não é a desta entrega, e nenhum fato diz quando ela saiu.
      entregas.push({ ...base, saiu_em: null, retirado_em: retiradoEm, situacao: "associado_depois_da_saida",
        motivo: null, registro_ate_associacao_s: regAssoc, associacao_ate_saida_s: null, registro_ate_saida_s: null });
      continue;
    }
    if (saida.declarado < r.associado) {
      entregas.push({ ...base, saiu_em: saida.declarado_em, retirado_em: retiradoEm, situacao: "inconsistente",
        motivo: "relogio_da_saida_antes_da_associacao",
        registro_ate_associacao_s: regAssoc, associacao_ate_saida_s: null, registro_ate_saida_s: null });
      continue;
    }
    entregas.push({ ...base, saiu_em: saida.declarado_em, retirado_em: retiradoEm, situacao: "saiu", motivo: null,
      registro_ate_associacao_s: regAssoc,
      associacao_ate_saida_s: segundos(r.associado, saida.declarado),
      registro_ate_saida_s: segundos(r.registrado, saida.declarado) });
  }
  entregas.sort((a, b) => (ms(a.registrado_em)! - ms(b.registrado_em)!) || a.delivery_id.localeCompare(b.delivery_id));
  conflitos.sort((a, b) => a.delivery_id.localeCompare(b.delivery_id));
  return { entregas, conflitos, invalidos };
}

export function lerTrajetoriaDoPronto(entrada: { unit_id: string; eventos: FonteDosFatos }): TrajetoriaDoPronto {
  const base = { contrato: "trajetoria-do-pronto@1" as const, unit_id: entrada.unit_id };
  if (!entrada.eventos.disponivel) {
    return { ...base, estado: "indisponivel", motivo: entrada.eventos.motivo, grupos: [],
      sem_modo: null, invalidos: null, conflitos: [] };
  }
  const { porModo, semModo } = noEscopo(entrada.unit_id, entrada.eventos.eventos);
  const grupos: { source_mode: SourceMode; entregas: TrechoDoPronto[] }[] = [];
  const conflitos: { delivery_id: string; motivo: string }[] = [];
  let invalidos = 0;
  for (const modo of [...porModo.keys()].sort(ordemDosModos)) {
    const r = trechosDoModo(porModo.get(modo)!);
    invalidos += r.invalidos;
    conflitos.push(...r.conflitos);
    grupos.push({ source_mode: modo, entregas: r.entregas });
  }
  return { ...base, estado: "observado", motivo: null, grupos, sem_modo: semModo, invalidos, conflitos };
}

/* ------------------------------------------------------------------ *
 * Estado atual                                                         *
 * ------------------------------------------------------------------ */

export function lerEstadoAtualDoPronto(entrada: {
  unit_id: string;
  agora: string;
  fila: FonteDaFila;
  eventos: FonteDosFatos;
}): EstadoAtualDoPronto {
  const agora = ms(entrada.agora);
  const espera = (desde: number): number | null => (agora === null ? null : Math.max(0, segundos(desde, agora)));
  const trajetoria = lerTrajetoriaDoPronto({ unit_id: entrada.unit_id, eventos: entrada.eventos });

  // Registros que já viraram fato, em qualquer modo: a identidade do registro
  // (pedido + instante original) não depende do modo de quem a leu.
  const consumidos = new Set<string>();
  const registrosPorPedido = new Map<string, number[]>();
  if (entrada.eventos.disponivel) {
    for (const g of trajetoria.grupos) {
      for (const t of g.entregas) {
        const r = ms(t.registrado_em);
        if (r === null) continue;
        consumidos.add(chaveDoRegistro(t.order_ref, r));
        const lista = registrosPorPedido.get(t.order_ref) ?? [];
        lista.push(r);
        registrosPorPedido.set(t.order_ref, lista);
      }
    }
  }

  let na_fila: EstadoAtualDoPronto["na_fila"];
  let fila_velha: number | null = null;
  const naFilaPorPedido = new Map<string, number[]>();
  if (!entrada.fila.disponivel) {
    na_fila = { estado: "indisponivel", motivo: entrada.fila.motivo, source_mode: "nao_declarado",
      total: null, mais_antigo_desde: null, pedidos: [] };
  } else {
    let velhas = 0;
    const pedidos: { order_ref: string; registrado_em: string; registrado: number; espera_s: number | null }[] = [];
    for (const l of entrada.fila.linhas) {
      const r = ms(l.registered_at);
      const pedido = texto(l.order_ref);
      if (r === null || !pedido) continue;
      const lista = naFilaPorPedido.get(pedido) ?? [];
      lista.push(r);
      naFilaPorPedido.set(pedido, lista);
      if (consumidos.has(chaveDoRegistro(pedido, r))) { velhas += 1; continue; }
      pedidos.push({ order_ref: pedido, registrado_em: l.registered_at, registrado: r, espera_s: espera(r) });
    }
    pedidos.sort((a, b) => a.registrado - b.registrado || a.order_ref.localeCompare(b.order_ref));
    // A contagem de fila velha só é afirmável quando os fatos foram lidos.
    fila_velha = entrada.eventos.disponivel ? velhas : null;
    na_fila = {
      estado: "observado", motivo: null, source_mode: "nao_declarado", total: pedidos.length,
      mais_antigo_desde: pedidos[0]?.registrado_em ?? null,
      pedidos: pedidos.map(({ order_ref, registrado_em, espera_s }) => ({ order_ref, registrado_em, espera_s })),
    };
  }

  let aguardando_saida: EstadoAtualDoPronto["aguardando_saida"];
  let retirados: EstadoAtualDoPronto["retirados_sem_novo_registro"];
  if (!entrada.eventos.disponivel) {
    aguardando_saida = { estado: "indisponivel", motivo: entrada.eventos.motivo, grupos: [] };
    retirados = { estado: "indisponivel", motivo: entrada.eventos.motivo, grupos: [] };
  } else {
    aguardando_saida = {
      estado: "observado", motivo: null,
      grupos: trajetoria.grupos.map((g) => {
        const entregas = g.entregas
          .filter((t) => t.situacao === "aguardando_saida")
          .map((t) => ({ trip_id: t.trip_id, delivery_id: t.delivery_id, order_ref: t.order_ref,
            registrado_em: t.registrado_em, associado_em: t.associado_em, espera_s: espera(ms(t.registrado_em)!) }));
        return { source_mode: g.source_mode, total: entregas.length,
          mais_antigo_desde: entregas[0]?.registrado_em ?? null, entregas };
      }),
    };
    if (!entrada.fila.disponivel) {
      // "Sem novo registro" exige olhar a fila; sem ela, não se afirma.
      retirados = { estado: "indisponivel", motivo: entrada.fila.motivo, grupos: [] };
    } else {
      retirados = {
        estado: "observado", motivo: null,
        grupos: trajetoria.grupos.map((g) => ({
          source_mode: g.source_mode,
          total: g.entregas.filter((t) => {
            if (t.situacao !== "retirado_antes_da_saida") return false;
            const r = ms(t.registrado_em)!;
            const novoNaFila = (naFilaPorPedido.get(t.order_ref) ?? []).some((x) => x > r);
            const novoFato = (registrosPorPedido.get(t.order_ref) ?? []).some((x) => x > r);
            return !novoNaFila && !novoFato;
          }).length,
        })),
      };
    }
  }

  return {
    contrato: "estado-atual-do-pronto@1",
    unit_id: entrada.unit_id,
    lido_em: entrada.agora,
    na_fila,
    aguardando_saida,
    retirados_sem_novo_registro: retirados,
    fila_velha,
    nenhuma_acao_executada: true,
  };
}

/* ------------------------------------------------------------------ *
 * Leitor PostgreSQL — somente leitura por construção                   *
 * ------------------------------------------------------------------ */

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function classe(e: unknown): string {
  return e instanceof Error ? e.name : "Error";
}

async function lerFatos(tx: SqlClient, unit_id: string): Promise<FonteDosFatos> {
  const linhas = await tx.query(
    `SELECT event_id, event_type, unit_id, object_type, object_id, occurred_at, idempotency_key, source_mode, payload
       FROM platform.event_log
      WHERE unit_id = $1 AND event_type = ANY($2)`,
    [unit_id, TIPOS_DA_LEITURA_DO_PRONTO],
  );
  return {
    disponivel: true,
    eventos: linhas.map((l) => ({
      event_id: String(l.event_id),
      event_type: String(l.event_type),
      unit_id: String(l.unit_id),
      trip_id: l.object_type === "trip" ? String(l.object_id) : null,
      occurred_at: iso(l.occurred_at),
      idempotency_key: String(l.idempotency_key),
      source_mode: (l.source_mode ?? null) as SourceMode | null,
      payload: (l.payload ?? {}) as Record<string, unknown>,
    })),
  };
}

/**
 * Lê fila e fatos na MESMA transação somente-leitura e devolve as duas
 * leituras. A fila é lida sem `label` (pode ter endereço). Se a fila não puder
 * ser lida (papel sem permissão, tabela ausente), ela sai indisponível — os
 * fatos continuam valendo, e nada vira zero.
 */
export async function lerProntosDeEntregas(
  cliente: TransactionalSqlClient,
  opcoes: { agora: Date; unit_id: string },
): Promise<{ estado_atual: EstadoAtualDoPronto; trajetoria: TrajetoriaDoPronto }> {
  const { fila, eventos } = await cliente.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    let eventos: FonteDosFatos;
    await tx.query("SAVEPOINT leitura_fatos");
    try {
      eventos = await lerFatos(tx, opcoes.unit_id);
      await tx.query("RELEASE SAVEPOINT leitura_fatos");
    } catch (e) {
      await tx.query("ROLLBACK TO SAVEPOINT leitura_fatos");
      eventos = { disponivel: false, motivo: `event_log_indisponivel:${classe(e)}` };
    }
    let fila: FonteDaFila;
    await tx.query("SAVEPOINT leitura_fila");
    try {
      const linhas = await tx.query(
        `SELECT order_ref, channel, created_at FROM entregas.ready_order WHERE unit_id = $1`,
        [opcoes.unit_id],
      );
      await tx.query("RELEASE SAVEPOINT leitura_fila");
      fila = {
        disponivel: true,
        linhas: linhas.map((l) => ({
          order_ref: String(l.order_ref),
          registered_at: iso(l.created_at),
          channel: l.channel === null || l.channel === undefined ? null : String(l.channel),
        })),
      };
    } catch (e) {
      await tx.query("ROLLBACK TO SAVEPOINT leitura_fila");
      fila = { disponivel: false, motivo: `fila_indisponivel:${classe(e)}` };
    }
    return { fila, eventos };
  });
  const agora = opcoes.agora.toISOString();
  return {
    estado_atual: lerEstadoAtualDoPronto({ unit_id: opcoes.unit_id, agora, fila, eventos }),
    trajetoria: lerTrajetoriaDoPronto({ unit_id: opcoes.unit_id, eventos }),
  };
}
