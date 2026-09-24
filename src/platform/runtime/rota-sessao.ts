/**
 * A rota de sessão do aparelho, separada do servidor HTTP.
 *
 * Mesmo desenho de `rota-ingestao.ts`: recebe corpo, devolve status e corpo,
 * não conhece socket nem relógio próprio. O `critical.ts` fica com o que é
 * dele; a decisão mora em `auth/device-session.ts`.
 *
 * O caminho é o que o Android JÁ chama (`POST /api/device/session`): mudar o
 * cliente custa reinstalar em campo; o servidor é a peça barata.
 */

import { emitirSessaoDeAparelho, corpoDeSessao, type RegistroDeSessao } from "../auth/device-session";
import { limparSegredos } from "../auth/device-token";
import type { RespostaDaRota } from "./rota-ingestao";

export const ROTA_SESSAO = "/api/device/session";

export interface DepsDaSessao {
  segredo: string;
  registro: RegistroDeSessao;
  agora: () => Date;
  validade_s?: number;
}

export async function tratarSessaoDeAparelho(corpoBruto: unknown, deps: DepsDaSessao): Promise<RespostaDaRota> {
  const pedido = (corpoBruto && typeof corpoBruto === "object" ? corpoBruto : {}) as Record<string, unknown>;
  const r = await emitirSessaoDeAparelho({
    pedido,
    registro: deps.registro,
    segredo_de_assinatura: deps.segredo,
    agora: deps.agora(),
    validade_s: deps.validade_s,
  });
  if (!r.ok) {
    return {
      status: r.status,
      corpo: {
        ok: false,
        classe: r.status === 403 ? "nao_autorizado" : "nao_autenticado",
        motivo: r.motivo,
        instrucao: r.instrucao,
        preservar_dados_locais: true,
        humano: limparSegredos(r.humano),
      },
    };
  }
  return { status: 200, corpo: corpoDeSessao(r) };
}
