/**
 * LEITURAS DO PRONTO — duas perguntas diferentes, duas respostas separadas.
 *
 *  1. ESTADO ATUAL — o que está esperando AGORA.
 *     - na fila: registrado como pronto e ainda não associado. Evidência: a
 *       própria fila, de ORIGEM DECLARADA — a saída mínima do piloto
 *       (`fonteDaObservacaoDoPiloto`, o caminho do modo arquivo) ou a tabela
 *       `entregas.ready_order` quando ela é a autoridade da unidade. Sem
 *       origem declarada, a fila é INDISPONÍVEL: a tabela existe em todo banco
 *       da plataforma e, vazia, viraria um zero falso para quem roda em arquivo.
 *       Cada linha traz o modo declarado no registro; sem modo, o grupo é
 *       `nao_declarado` — nunca vira real. A idade da observação é declarada e
 *       nunca vira instante de pedido.
 *     - consistência: a marca da observação (último fato publicado entre os
 *       tipos lidos aqui) presente no event log = fatos em dia com a fila;
 *       ausente = atrasados; sem marca = desconhecida.
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
import { TOLERANCIA_DO_RELOGIO_MS } from "../contracts/relogio";

export const LEITURA_DO_PRONTO_VERSAO = "prontos-de-entregas@2.0.0";

/** Tipos que a leitura usa. A Operação Viva não consome os dois primeiros. */
export const TIPOS_DA_LEITURA_DO_PRONTO: readonly string[] = ["delivery_ready", "delivery_removed", "trip_started"];

/** Modo de uma linha da fila: o declarado no registro, ou não declarado. */
export type ModoDaLinha = SourceMode | "nao_declarado";

export interface LinhaDaFilaDePronto {
  readonly order_ref: string;
  readonly registered_at: string;
  readonly channel?: string | null;
  /** Ausente = não declarado (a tabela PostgreSQL não guarda modo). */
  readonly source_mode?: ModoDaLinha;
}

/** De onde a fila foi lida. */
export interface OrigemDaFila {
  readonly sistema: string;
  readonly armazenamento: string;
  readonly processo_iniciado_em: string | null;
}

export type FonteDaFila =
  | {
      readonly disponivel: true;
      readonly linhas: readonly LinhaDaFilaDePronto[];
      readonly origem?: OrigemDaFila;
      readonly observado_em?: string;
      /**
       * `event_id` do último fato publicado pela origem entre os tipos lidos
       * aqui. `null` = nada publicado ainda; ausente = a origem não informa.
       */
      readonly marca_dos_fatos?: string | null;
      /** Conferido pelo leitor no banco (busca pela chave): a marca já chegou? */
      readonly marca_ingerida?: boolean;
    }
  | {
      readonly disponivel: false;
      readonly motivo: string;
      readonly origem?: OrigemDaFila;
      readonly observado_em?: string;
    };

/** Como quem chama declara a origem da fila da unidade. */
export type DeclaracaoDaFila =
  | { readonly origem: "observacao_do_piloto"; readonly observacao: unknown }
  /** A observação não pôde ser obtida (rede, prazo, credencial): ausência declarada. */
  | { readonly origem: "observacao_do_piloto"; readonly indisponivel: string }
  | { readonly origem: "postgres" };

export type ConsistenciaDosFatos = "fatos_em_dia" | "fatos_atrasados" | "desconhecida";

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
  readonly contrato: "estado-atual-do-pronto@2";
  readonly unit_id: string;
  readonly lido_em: string;
  /**
   * Um grupo por modo declarado no registro. Não existe total único: ele
   * somaria real com simulado. Observada e vazia = `observado` sem grupos.
   */
  readonly na_fila: {
    readonly estado: "observado" | "indisponivel";
    readonly motivo: string | null;
    readonly origem: OrigemDaFila | null;
    readonly observado_em: string | null;
    readonly idade_da_observacao_s: number | null;
    readonly grupos: readonly {
      readonly source_mode: ModoDaLinha;
      readonly total: number;
      readonly mais_antigo_desde: string | null;
      readonly pedidos: readonly PedidoNaFila[];
    }[];
  };
  /** A fila e os fatos falam do mesmo momento? Decidido pela marca da origem. */
  readonly consistencia_dos_fatos: ConsistenciaDosFatos;
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
  const origem = entrada.fila.origem ?? null;
  const observado_em = entrada.fila.observado_em ?? null;
  const observado = ms(observado_em);
  const idade = observado === null || agora === null ? null : Math.max(0, segundos(observado, agora));
  if (!entrada.fila.disponivel) {
    na_fila = { estado: "indisponivel", motivo: entrada.fila.motivo, origem, observado_em,
      idade_da_observacao_s: idade, grupos: [] };
  } else {
    let velhas = 0;
    type Pedido = { order_ref: string; registrado_em: string; registrado: number; espera_s: number | null };
    const porModo = new Map<ModoDaLinha, Pedido[]>();
    for (const l of entrada.fila.linhas) {
      const r = ms(l.registered_at);
      const pedido = texto(l.order_ref);
      if (r === null || !pedido) continue;
      const lista = naFilaPorPedido.get(pedido) ?? [];
      lista.push(r);
      naFilaPorPedido.set(pedido, lista);
      if (consumidos.has(chaveDoRegistro(pedido, r))) { velhas += 1; continue; }
      // Só um modo do vocabulário vale; qualquer outra coisa é não declarado.
      const modo: ModoDaLinha = l.source_mode !== undefined && (SOURCE_MODES as readonly string[]).includes(l.source_mode)
        ? l.source_mode : "nao_declarado";
      const doModo = porModo.get(modo) ?? [];
      // A espera conta do REGISTRO; o instante da consulta não é instante do pedido.
      doModo.push({ order_ref: pedido, registrado_em: l.registered_at, registrado: r, espera_s: espera(r) });
      porModo.set(modo, doModo);
    }
    // A contagem de fila velha só é afirmável quando os fatos foram lidos.
    fila_velha = entrada.eventos.disponivel ? velhas : null;
    const ordem = (m: ModoDaLinha) => (m === "nao_declarado" ? SOURCE_MODES.length : SOURCE_MODES.indexOf(m));
    na_fila = {
      estado: "observado", motivo: null, origem, observado_em, idade_da_observacao_s: idade,
      grupos: [...porModo.keys()].sort((a, b) => ordem(a) - ordem(b)).map((modo) => {
        const pedidos = porModo.get(modo)!.sort((a, b) => a.registrado - b.registrado || a.order_ref.localeCompare(b.order_ref));
        return { source_mode: modo, total: pedidos.length, mais_antigo_desde: pedidos[0]?.registrado_em ?? null,
          pedidos: pedidos.map(({ order_ref, registrado_em, espera_s }) => ({ order_ref, registrado_em, espera_s })) };
      }),
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
    contrato: "estado-atual-do-pronto@2",
    unit_id: entrada.unit_id,
    lido_em: entrada.agora,
    na_fila,
    consistencia_dos_fatos: consistenciaDosFatos(entrada.unit_id, entrada.fila, entrada.eventos),
    aguardando_saida,
    retirados_sem_novo_registro: retirados,
    fila_velha,
    nenhuma_acao_executada: true,
  };
}

/**
 * A fila e os fatos falam do mesmo momento? A origem informa a marca (último
 * fato publicado entre os tipos lidos aqui, lida DEPOIS da fila). Presente no
 * event log: todo pedido que saiu da fila, e toda saída ou retirada anterior,
 * já chegou — os fatos estão em dia. Ausente: atrasados, e quem lê fica
 * sabendo que um pedido pode estar entre os dois. Sem marca: desconhecida.
 */
function consistenciaDosFatos(unit_id: string, fila: FonteDaFila, eventos: FonteDosFatos): ConsistenciaDosFatos {
  if (!fila.disponivel || !eventos.disponivel) return "desconhecida";
  if (fila.marca_dos_fatos === undefined) return "desconhecida";
  if (fila.marca_dos_fatos === null) return "fatos_em_dia";
  const marca = fila.marca_dos_fatos;
  const chegou = fila.marca_ingerida ?? eventos.eventos.some((e) => e.event_id === marca && e.unit_id === unit_id);
  return chegou ? "fatos_em_dia" : "fatos_atrasados";
}

/* ------------------------------------------------------------------ *
 * A saída mínima do piloto como fonte da fila                          *
 * ------------------------------------------------------------------ */

export const OBSERVACAO_DA_FILA_SCHEMA = "deliveryos.ready-queue-observation.v1";
const CHAVES_DA_OBSERVACAO = ["availability", "entries", "facts_watermark", "invalid_entries", "observed_at",
  "origin", "reason", "schema", "total", "unit_id"];
const CHAVES_DA_ORIGEM = ["process_started_at", "storage_backend", "system"];
const CHAVES_DA_LINHA = ["channel", "order_ref", "registered_at", "source_mode"];
const CHAVES_DA_MARCA = ["availability", "covered_types", "last_event_id"];
/** A marca só vale se cobre exatamente os tipos que esta leitura usa. */
const TIPOS_COBERTOS_PELA_MARCA = ["delivery_ready", "delivery_removed", "trip_started"];

function objeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `null` = conjunto exato; senão, o motivo da recusa. */
function chavesExatas(v: Record<string, unknown>, esperadas: readonly string[]): "campos_nao_permitidos" | "observacao_invalida" | null {
  const ks = Object.keys(v);
  if (ks.some((k) => !esperadas.includes(k))) return "campos_nao_permitidos";
  if (esperadas.some((k) => !Object.prototype.hasOwnProperty.call(v, k))) return "observacao_invalida";
  return null;
}

const MOTIVO_SEGURO = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Valida a saída mínima do piloto e a transforma em fonte da fila.
 *
 * Falha FECHADA: um campo fora da lista (rótulo, autor, snapshot) derruba a
 * observação inteira, porque aceitar "o resto" seria aceitar que o piloto
 * mandou o que não devia. Outra unidade, observação no futuro além da
 * tolerância do relógio, linha com modo fora do vocabulário ou total que não
 * bate: indisponível, com motivo. Nada do objeto recebido é repassado — a
 * fonte é montada campo a campo.
 */
export function fonteDaObservacaoDoPiloto(observacao: unknown, opcoes: { unit_id: string; agora: string }): FonteDaFila {
  const recusa = (motivo: string): FonteDaFila => ({ disponivel: false, motivo });
  if (!objeto(observacao) || observacao.schema !== OBSERVACAO_DA_FILA_SCHEMA) return recusa("observacao_invalida");
  const topo = chavesExatas(observacao, CHAVES_DA_OBSERVACAO);
  if (topo) return recusa(topo);
  if (observacao.unit_id !== opcoes.unit_id) return recusa("unidade_divergente");
  const o = observacao.origin;
  if (!objeto(o)) return recusa("observacao_invalida");
  const doOrigem = chavesExatas(o, CHAVES_DA_ORIGEM);
  if (doOrigem) return recusa(doOrigem);
  if (o.system !== "entregas-pilot" || typeof o.storage_backend !== "string" || !o.storage_backend
      || ms(o.process_started_at) === null) return recusa("observacao_invalida");
  const origem: OrigemDaFila = { sistema: "entregas-pilot", armazenamento: o.storage_backend,
    processo_iniciado_em: new Date(ms(o.process_started_at)!).toISOString() };
  const observado = ms(observacao.observed_at);
  const agora = ms(opcoes.agora);
  if (observado === null || agora === null) return recusa("observacao_invalida");
  if (observado - agora > TOLERANCIA_DO_RELOGIO_MS) return { disponivel: false, motivo: "observacao_no_futuro", origem };
  const observado_em = new Date(observado).toISOString();

  if (observacao.availability === "unavailable") {
    const motivo = typeof observacao.reason === "string" && MOTIVO_SEGURO.test(observacao.reason)
      ? observacao.reason : "fila_indisponivel_na_origem";
    return { disponivel: false, motivo, origem, observado_em };
  }
  if (observacao.availability !== "available" || !Array.isArray(observacao.entries)) return recusa("observacao_invalida");
  const linhas: LinhaDaFilaDePronto[] = [];
  for (const e of observacao.entries) {
    if (!objeto(e)) return recusa("linha_invalida");
    const daLinha = chavesExatas(e, CHAVES_DA_LINHA);
    if (daLinha === "campos_nao_permitidos") return recusa(daLinha);
    if (daLinha) return recusa("linha_invalida");
    const order_ref = texto(e.order_ref);
    const registrado = ms(e.registered_at);
    const modoValido = e.source_mode === null || (SOURCE_MODES as readonly unknown[]).includes(e.source_mode);
    const canalValido = e.channel === null || typeof e.channel === "string";
    if (!order_ref || registrado === null || !modoValido || !canalValido) return recusa("linha_invalida");
    linhas.push({
      order_ref,
      registered_at: new Date(registrado).toISOString(),
      channel: e.channel as string | null,
      source_mode: e.source_mode === null ? "nao_declarado" : e.source_mode as SourceMode,
    });
  }
  if (observacao.total !== linhas.length) return recusa("observacao_invalida");

  const m = observacao.facts_watermark;
  if (!objeto(m)) return recusa("observacao_invalida");
  const daMarca = chavesExatas(m, CHAVES_DA_MARCA);
  if (daMarca) return recusa(daMarca);
  const cobre = Array.isArray(m.covered_types)
    && TIPOS_COBERTOS_PELA_MARCA.every((t) => (m.covered_types as unknown[]).includes(t));
  let marca_dos_fatos: string | null | undefined;
  if (m.availability === "available" && cobre && (m.last_event_id === null || (typeof m.last_event_id === "string" && m.last_event_id))) {
    marca_dos_fatos = m.last_event_id as string | null;
  } else if (m.availability === "available" || m.availability === "unavailable") {
    // Marca indisponível, ou que não cobre o que esta leitura usa: consistência desconhecida.
    marca_dos_fatos = undefined;
  } else {
    return recusa("observacao_invalida");
  }
  return { disponivel: true, linhas, origem, observado_em,
    ...(marca_dos_fatos !== undefined ? { marca_dos_fatos } : {}) };
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
 * leituras.
 *
 * A fila vem da origem DECLARADA por quem chama:
 *  - `observacao_do_piloto`: validada antes de abrir a transação; a marca é
 *    conferida no event log pela chave (`event_id`), sem varrer nada;
 *  - `postgres`: a tabela `entregas.ready_order`, sem `label` (pode ter
 *    endereço), lida só quando ela é declarada a autoridade da unidade;
 *  - nenhuma: indisponível. A tabela existe em todo banco da plataforma, e
 *    lê-la sem saber se a unidade roda em arquivo publicaria um zero falso.
 * Fila ilegível não derruba os fatos, e nada vira zero.
 */
export async function lerProntosDeEntregas(
  cliente: TransactionalSqlClient,
  opcoes: { agora: Date; unit_id: string; fila?: DeclaracaoDaFila },
): Promise<{ estado_atual: EstadoAtualDoPronto; trajetoria: TrajetoriaDoPronto }> {
  const agora = opcoes.agora.toISOString();
  const declarada = opcoes.fila;
  let observada: FonteDaFila | null = null;
  if (declarada?.origem === "observacao_do_piloto") {
    observada = "indisponivel" in declarada
      ? { disponivel: false, motivo: MOTIVO_SEGURO.test(declarada.indisponivel) ? declarada.indisponivel : "observacao_indisponivel" }
      : fonteDaObservacaoDoPiloto(declarada.observacao, { unit_id: opcoes.unit_id, agora });
  }
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
    if (observada) {
      fila = observada;
      if (observada.disponivel && typeof observada.marca_dos_fatos === "string" && eventos.disponivel) {
        await tx.query("SAVEPOINT leitura_marca");
        try {
          const achou = await tx.query(
            `SELECT 1 FROM platform.event_log WHERE event_id = $1 AND unit_id = $2`,
            [observada.marca_dos_fatos, opcoes.unit_id],
          );
          await tx.query("RELEASE SAVEPOINT leitura_marca");
          fila = { ...observada, marca_ingerida: achou.length > 0 };
        } catch {
          await tx.query("ROLLBACK TO SAVEPOINT leitura_marca");
          // Sem conferir a marca não se afirma consistência: some a marca.
          const { marca_dos_fatos: _m, ...semMarca } = observada;
          fila = semMarca;
        }
      }
    } else if (declarada?.origem === "postgres") {
      await tx.query("SAVEPOINT leitura_fila");
      try {
        const lido = await tx.query(`SELECT now() AS lido_em`);
        const linhas = await tx.query(
          `SELECT order_ref, channel, created_at FROM entregas.ready_order WHERE unit_id = $1`,
          [opcoes.unit_id],
        );
        await tx.query("RELEASE SAVEPOINT leitura_fila");
        fila = {
          disponivel: true,
          origem: { sistema: "entregas.ready_order", armazenamento: "postgres", processo_iniciado_em: null },
          observado_em: iso(lido[0]?.lido_em),
          // A tabela não guarda modo: cada linha é `nao_declarado`.
          linhas: linhas.map((l) => ({
            order_ref: String(l.order_ref),
            registered_at: iso(l.created_at),
            channel: l.channel === null || l.channel === undefined ? null : String(l.channel),
            source_mode: "nao_declarado" as const,
          })),
        };
      } catch (e) {
        await tx.query("ROLLBACK TO SAVEPOINT leitura_fila");
        fila = { disponivel: false, motivo: `fila_indisponivel:${classe(e)}`,
          origem: { sistema: "entregas.ready_order", armazenamento: "postgres", processo_iniciado_em: null } };
      }
    } else {
      fila = { disponivel: false, motivo: "origem_da_fila_nao_declarada" };
    }
    return { fila, eventos };
  });
  return {
    estado_atual: lerEstadoAtualDoPronto({ unit_id: opcoes.unit_id, agora, fila, eventos }),
    trajetoria: lerTrajetoriaDoPronto({ unit_id: opcoes.unit_id, eventos }),
  };
}
