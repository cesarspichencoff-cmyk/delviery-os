import { autenticarDispositivo, corpoDeRecusa } from "../auth/device-auth";
import type { RegistroDeDispositivos } from "../ingest/device-ingest";

export const ROTA_FILA_OFFLINE = "/api/device/queue-depth";
export const LIMITE_CONTADOR_FILA_OFFLINE = 1_000_000;

export interface RegistroFilaOffline extends RegistroDeDispositivos {
  registrarFilaOffline(
    device_id: string,
    dados: { pending_points: number; pending_events: number; agora: Date },
  ): Promise<boolean>;
}

export interface DepsFilaOffline {
  segredo: string;
  registro: RegistroFilaOffline;
  agora: () => Date;
}

export interface RespostaFilaOffline {
  status: number;
  corpo: Record<string, unknown>;
}

const CAMPOS = new Set(["pending_points", "pending_events"]);

function contador(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= 0 &&
    v <= LIMITE_CONTADOR_FILA_OFFLINE
  );
}

/**
 * Telemetria tecnica minima do telefone.
 *
 * O corpo aceita EXATAMENTE dois numeros. device_id, unidade, ator,
 * coordenada, viagem, payload e qualquer outro campo sao recusados. A
 * identidade vem exclusivamente do Bearer ja autenticado.
 *
 * Isto nao cria evento operacional nem entra no event log: e o ultimo estado
 * tecnico conhecido do aparelho, como app_version e last_session_at.
 */
export async function tratarFilaOffline(
  headers: Record<string, string | undefined>,
  corpoBruto: unknown,
  deps: DepsFilaOffline,
): Promise<RespostaFilaOffline> {
  const agora = deps.agora();
  const auth = await autenticarDispositivo({
    authorization: headers.authorization ?? headers.Authorization,
    segredo: deps.segredo,
    registro: deps.registro,
    agora,
  });

  if (!auth.ok) {
    return {
      status: auth.status,
      corpo: corpoDeRecusa(auth) as unknown as Record<string, unknown>,
    };
  }

  if (!corpoBruto || typeof corpoBruto !== "object" || Array.isArray(corpoBruto)) {
    return {
      status: 400,
      corpo: {
        classe: "contrato_invalido",
        detalhe: "corpo deve conter somente pending_points e pending_events",
      },
    };
  }

  const corpo = corpoBruto as Record<string, unknown>;
  const chaves = Object.keys(corpo);
  const extras = chaves.filter((k) => !CAMPOS.has(k));

  if (
    chaves.length !== 2 ||
    extras.length > 0 ||
    !contador(corpo.pending_points) ||
    !contador(corpo.pending_events)
  ) {
    return {
      status: 400,
      corpo: {
        classe: "contrato_invalido",
        detalhe:
          "envie somente pending_points e pending_events como inteiros entre 0 e 1000000",
      },
    };
  }

  // Segunda barreira contra corrida com revogacao: a autenticacao leu o
  // cadastro antes deste UPDATE. Se o humano revogar no intervalo, o UPDATE
  // condicionado nao toca a linha e a rota NAO responde sucesso.
  const persistiu = await deps.registro.registrarFilaOffline(auth.claims.device_id, {
    pending_points: corpo.pending_points,
    pending_events: corpo.pending_events,
    agora,
  });

  if (!persistiu) {
    return {
      status: 403,
      corpo: {
        classe: "nao_autorizado",
        motivo: "dispositivo_revogado_ou_indisponivel",
        preservar_dados_locais: true,
      },
    };
  }

  return {
    status: 200,
    corpo: {
      classe: "aceito",
      received_at: agora.toISOString(),
    },
  };
}
