/**
 * TATÁ Comanda — adaptador histórico read-only para o Product System.
 *
 * Entrada: evidência agregada já sanitizada. Este módulo NÃO abre SQL Server,
 * não concede permissão e não converte o snapshot em estado ao vivo.
 */

export interface TataComandaHistoricoDisponivel {
  readonly disponivel: true;
  readonly fonte: "tata_comanda_readonly_audit";
  readonly ao_vivo: false;
  readonly data_operacional: string;
  readonly unidade: string;
  readonly loja: string;
  readonly pedidos: number;
  readonly unidades: number;
  readonly canais: Readonly<Record<string, number>>;
  readonly receita_nativa_brl: number;
  readonly conciliacao_financeira: {
    readonly pedidos_exatos: number;
    readonly pedidos_diretos: number;
    readonly pedidos_com_taxa_servico: number;
    readonly taxa_servico_residual_brl: number;
  };
  readonly ciclo_kds: {
    readonly pedidos_com_inicio: number;
    readonly pedidos_com_fim: number;
    readonly media_p_para_f_min: number | null;
    readonly semantica: "ciclo_local_kds";
    readonly prova_tempo_producao: false;
    readonly prova_tempo_entrega: false;
  };
  readonly revisoes: {
    readonly envelopes: number;
    readonly pedidos_selecionados: number;
    readonly pedidos_semanticamente_corrigidos: number;
    readonly unidades_recuperadas: number;
    readonly relogio: "source_event.observed_at";
  };
  readonly desconhecidos: readonly string[];
  readonly privacidade: {
    readonly customer_pii: false;
    readonly payload_bruto: false;
  };
}

export type TataComandaHistoricoVM =
  | TataComandaHistoricoDisponivel
  | { readonly disponivel: false; readonly motivo: string };

type R = Record<string, unknown>;

function obj(v: unknown, codigo: string): R {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(codigo);
  return v as R;
}
function texto(v: unknown, codigo: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(codigo);
  return v.trim();
}
function numero(v: unknown, codigo: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(codigo);
  return v;
}
function inteiro(v: unknown, codigo: string): number {
  const n = numero(v, codigo);
  if (!Number.isInteger(n)) throw new Error(codigo);
  return n;
}
function listaTexto(v: unknown, codigo: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(codigo);
  return [...v] as string[];
}

/**
 * Fail-closed: se o arquivo perder a identidade, a privacidade ou a matemática
 * básica, ele não aparece como histórico válido.
 */
export function adaptarAuditoriaTataComanda(raw: unknown): TataComandaHistoricoDisponivel {
  const raiz = obj(raw, "TATA_COMANDA_AUDIT_INVALID");
  if (raiz.schema !== "deliveryos.tata-comanda-day-truth.2026-10-05.v1") {
    throw new Error("TATA_COMANDA_AUDIT_SCHEMA_MISMATCH");
  }
  if (raiz.status !== "PROVEN_AGGREGATE_READONLY_AUDIT") {
    throw new Error("TATA_COMANDA_AUDIT_NOT_PROVEN");
  }

  const scope = obj(raiz.scope, "TATA_COMANDA_SCOPE_REQUIRED");
  if (scope.customer_pii !== false) throw new Error("TATA_COMANDA_PII_BOUNDARY_BROKEN");

  const orders = obj(raiz.orders, "TATA_COMANDA_ORDERS_REQUIRED");
  const total = inteiro(orders.total, "TATA_COMANDA_ORDER_TOTAL_INVALID");
  const units = inteiro(orders.units, "TATA_COMANDA_UNITS_INVALID");
  const channels = obj(orders.channels, "TATA_COMANDA_CHANNELS_REQUIRED");
  const canais: Record<string, number> = {};
  for (const [k, v] of Object.entries(channels)) canais[k] = inteiro(v, "TATA_COMANDA_CHANNEL_COUNT_INVALID");
  if (Object.values(canais).reduce((a, b) => a + b, 0) !== total) {
    throw new Error("TATA_COMANDA_CHANNEL_TOTAL_MISMATCH");
  }

  const lifecycle = obj(raiz.lifecycle_coverage, "TATA_COMANDA_LIFECYCLE_REQUIRED");
  const semantics = obj(raiz.lifecycle_semantics, "TATA_COMANDA_LIFECYCLE_SEMANTICS_REQUIRED");
  const financial = obj(raiz.financial, "TATA_COMANDA_FINANCIAL_REQUIRED");
  const revisions = obj(raiz.revision_clock, "TATA_COMANDA_REVISION_REQUIRED");

  const direct = inteiro(financial.direct_exact_orders, "TATA_COMANDA_DIRECT_RECONCILIATION_INVALID");
  const service = inteiro(financial.service_fee_residual_orders, "TATA_COMANDA_SERVICE_FEE_ORDERS_INVALID");
  const exact = inteiro(financial.native_total_exact_orders, "TATA_COMANDA_NATIVE_TOTAL_INVALID");
  if (direct + service !== total || exact !== total) {
    throw new Error("TATA_COMANDA_FINANCIAL_ORDER_TOTAL_MISMATCH");
  }

  const unknowns = listaTexto(raiz.unknowns, "TATA_COMANDA_UNKNOWNS_INVALID");
  if (!unknowns.includes("PRODUCTION_TIME_MISSING") || !unknowns.includes("DELIVERY_TIME_MISSING")) {
    throw new Error("TATA_COMANDA_TIME_BOUNDARY_MISSING");
  }

  return Object.freeze({
    disponivel: true,
    fonte: "tata_comanda_readonly_audit",
    ao_vivo: false,
    data_operacional: texto(scope.business_date, "TATA_COMANDA_BUSINESS_DATE_REQUIRED"),
    unidade: texto(scope.unit_id, "TATA_COMANDA_UNIT_REQUIRED"),
    loja: texto(scope.store_id, "TATA_COMANDA_STORE_REQUIRED"),
    pedidos: total,
    unidades: units,
    canais: Object.freeze(canais),
    receita_nativa_brl: numero(financial.movement_total_brl, "TATA_COMANDA_REVENUE_INVALID"),
    conciliacao_financeira: Object.freeze({
      pedidos_exatos: exact,
      pedidos_diretos: direct,
      pedidos_com_taxa_servico: service,
      taxa_servico_residual_brl: numero(financial.service_fee_residual_total_brl, "TATA_COMANDA_SERVICE_FEE_INVALID"),
    }),
    ciclo_kds: Object.freeze({
      pedidos_com_inicio: inteiro(lifecycle.kds_p, "TATA_COMANDA_KDS_P_INVALID"),
      pedidos_com_fim: inteiro(lifecycle.kds_f, "TATA_COMANDA_KDS_F_INVALID"),
      media_p_para_f_min:
        semantics.kds_p_to_f_average_minutes === null
          ? null
          : numero(semantics.kds_p_to_f_average_minutes, "TATA_COMANDA_KDS_AVG_INVALID"),
      semantica: "ciclo_local_kds",
      prova_tempo_producao: false,
      prova_tempo_entrega: false,
    }),
    revisoes: Object.freeze({
      envelopes: inteiro(revisions.source_envelopes, "TATA_COMANDA_ENVELOPES_INVALID"),
      pedidos_selecionados: inteiro(revisions.selected_orders, "TATA_COMANDA_SELECTED_INVALID"),
      pedidos_semanticamente_corrigidos: inteiro(
        revisions.semantic_order_changes_when_fixing_clock,
        "TATA_COMANDA_REVISION_CHANGES_INVALID",
      ),
      unidades_recuperadas: inteiro(revisions.recovered_units, "TATA_COMANDA_RECOVERED_UNITS_INVALID"),
      relogio: "source_event.observed_at",
    }),
    desconhecidos: Object.freeze(unknowns),
    privacidade: Object.freeze({ customer_pii: false, payload_bruto: false }),
  });
}

export function tataComandaHistoricoIndisponivel(motivo: string): TataComandaHistoricoVM {
  return { disponivel: false, motivo };
}
