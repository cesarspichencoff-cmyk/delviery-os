/**
 * Product System — histórico operacional somente leitura.
 *
 * Nunca transporta payload bruto. A superfície recebe fatos já validados e
 * versões de recomendação já validadas pelo store append-only.
 */
import type { EventEnvelope } from "../../platform/contracts/event-catalog";
import { deRegistro } from "../../platform/copiloto/conference-bridge";
import { selo, type Procedencia, type Selo } from "./estados";

const PROCEDENCIA_DO_MODO: Readonly<Record<string, Procedencia>> = {
  real: "real",
  simulated: "simulado",
  control: "controle",
};

export interface LeituraHistoricaDoStore {
  readonly records: readonly Record<string, unknown>[];
  readonly complete: boolean;
  readonly source: string;
  readonly corrupted_lines: readonly unknown[];
  readonly invalid_lines: readonly unknown[];
  readonly io_failures: readonly unknown[];
}

export interface EventoHistoricoFonte {
  readonly event_id: string;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly unit_id: string;
  readonly trip_id?: string;
  readonly device_id?: string;
  readonly source_mode: string;
  readonly origin: string;
  readonly sequence?: number;
}

export function eventosHistoricosDeEnvelopes(
  eventos: readonly EventEnvelope[],
): EventoHistoricoFonte[] {
  return eventos.map((e) => ({
    event_id: e.event_id,
    event_type: e.event_type,
    occurred_at: e.occurred_at,
    unit_id: e.unit_id,
    trip_id: e.trip_id,
    device_id: e.device_id,
    source_mode: e.source_mode,
    origin: e.origin,
    sequence: e.sequence,
  }));
}

export type FonteHistoricoOperacao =
  | {
      readonly disponivel: true;
      readonly fonte: "platform.event_log" | "fixture";
      readonly eventos: readonly EventoHistoricoFonte[];
      readonly sem_modo: number;
      readonly corrompidas: readonly { event_id: string; motivo: string }[];
    }
  | { readonly disponivel: false; readonly motivo: string };

export type FonteHistoricoCopiloto =
  | {
      readonly disponivel: true;
      readonly fonte: "conference-brain-store" | "fixture";
      readonly leitura: LeituraHistoricaDoStore;
    }
  | { readonly disponivel: false; readonly motivo: string };

export interface EventoHistoricoVM {
  readonly event_id: string;
  readonly event_type: string;
  readonly ocorreu_em: string;
  readonly unit_id: string;
  readonly trip_id: string | null;
  readonly device_id: string | null;
  readonly source_mode: string;
  readonly origin: string;
  readonly sequence: number | null;
}
export interface VersaoRecomendacaoVM {
  readonly recommendation_id: string;
  readonly status: string;
  readonly criada_em: string;
  readonly terminal_em: string | null;
  readonly expira_em: string;
  readonly escopo: string;
  readonly conclusion_ref: string;
  readonly source_mode: string;
  readonly titulo: string;
}

export interface HistoricoVM {
  readonly modulo: "historico";
  readonly selos_de_cabecalho: readonly Selo[];
  readonly operacao_viva:
    | {
        readonly disponivel: true;
        readonly fonte: string;
        readonly modos: readonly Procedencia[];
        readonly eventos: readonly EventoHistoricoVM[];
        readonly sem_modo: number;
        readonly corrompidas: number;
      }
    | { readonly disponivel: false; readonly motivo: string };
  readonly copiloto:
    | {
        readonly disponivel: true;
        readonly fonte: string;
        readonly modos: readonly Procedencia[];
        readonly versoes: readonly VersaoRecomendacaoVM[];
        readonly completo: boolean;
        readonly linhas_corrompidas: number;
        readonly linhas_invalidas: number;
        readonly falhas_de_io: number;
      }
    | { readonly disponivel: false; readonly motivo: string };
  readonly limitacoes: readonly { titulo: string; texto: string }[];
}

function ordenarEventos(eventos: readonly EventoHistoricoFonte[]): EventoHistoricoFonte[] {
  return [...eventos].sort((a, b) => {
    const ta = Date.parse(a.occurred_at);
    const tb = Date.parse(b.occurred_at);
    if (ta !== tb) return ta - tb;
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.event_id.localeCompare(b.event_id);
  });
}

function modosDe(valores: readonly string[]): Procedencia[] {
  const vistos = new Set<Procedencia>();
  for (const valor of valores) {
    const p = PROCEDENCIA_DO_MODO[valor];
    if (p) vistos.add(p);
  }
  return [...vistos];
}
export function historicoVM(
  operacao: FonteHistoricoOperacao,
  copiloto: FonteHistoricoCopiloto,
): HistoricoVM {
  const op = operacao.disponivel
    ? {
        disponivel: true as const,
        fonte: operacao.fonte,
        modos: modosDe(operacao.eventos.map((e) => e.source_mode)),
        eventos: ordenarEventos(operacao.eventos).map((e) => ({
          event_id: e.event_id,
          event_type: e.event_type,
          ocorreu_em: e.occurred_at,
          unit_id: e.unit_id,
          trip_id: e.trip_id ?? null,
          device_id: e.device_id ?? null,
          source_mode: e.source_mode,
          origin: e.origin,
          sequence: e.sequence ?? null,
        })),
        sem_modo: operacao.sem_modo,
        corrompidas: operacao.corrompidas.length,
      }
    : operacao;

  const cp = copiloto.disponivel
    ? (() => {
        const versoes = copiloto.leitura.records.map((r, indice) => {
          const rec = deRegistro(r);
          return {
            indice,
            efetivo_em: rec.terminal_at ?? rec.created_at,
            item: {
              recommendation_id: rec.recommendation_id,
              status: rec.status,
              criada_em: rec.created_at,
              terminal_em: rec.terminal_at ?? null,
              expira_em: rec.expires_at,
              escopo: rec.escopo,
              conclusion_ref: rec.conclusion_ref,
              source_mode: rec.source_mode,
              titulo: rec.titulo,
            } satisfies VersaoRecomendacaoVM,
          };
        });
        versoes.sort((a, b) => {
          const ta = Date.parse(a.efetivo_em);
          const tb = Date.parse(b.efetivo_em);
          if (ta !== tb) return ta - tb;
          return a.indice - b.indice;
        });
        return {
          disponivel: true as const,
          fonte: copiloto.fonte,
          modos: modosDe(versoes.map((v) => v.item.source_mode)),
          versoes: versoes.map((v) => v.item),
          completo: copiloto.leitura.complete,
          linhas_corrompidas: copiloto.leitura.corrupted_lines.length,
          linhas_invalidas: copiloto.leitura.invalid_lines.length,
          falhas_de_io: copiloto.leitura.io_failures.length,
        };
      })()
    : copiloto;

  const selos: Selo[] = [];
  const modos = new Set<Procedencia>([
    ...(op.disponivel ? op.modos : []),
    ...(cp.disponivel ? cp.modos : []),
  ]);
  for (const modo of modos) selos.push(selo(modo));

  return {
    modulo: "historico",
    selos_de_cabecalho: selos,
    operacao_viva: op,
    copiloto: cp,
    limitacoes: [
      {
        titulo: "Historico nao reinterpreta fatos",
        texto: "A linha do tempo mostra eventos e versoes registradas. Ela nao inventa estado intermediario nem causa.",
      },
      {
        titulo: "Payload bruto nao atravessa",
        texto: "A superficie historica nunca devolve payload de evento nem conteudo de linha invalida/corrompida.",
      },
    ],
  };
}
