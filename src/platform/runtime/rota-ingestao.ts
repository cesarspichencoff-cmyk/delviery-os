/**
 * A rota de ingestão, separada do servidor HTTP.
 *
 * Recebe cabeçalhos e corpo, devolve status e corpo. Não conhece `IncomingMessage`,
 * não escreve em socket, não lê relógio próprio. É o que permite testar a cadeia
 * inteira — autenticação, contrato, transação — sem subir servidor nem
 * sincronizar processos por texto, que já custou caro nesta base.
 *
 * O `critical.ts` fica com o que é dele: ler o corpo do socket e escrever a
 * resposta. A decisão mora aqui.
 */

import { autenticarDispositivo, corpoDeRecusa } from "../auth/device-auth";
import type { RegistroDeDispositivos } from "../ingest/device-ingest";
import { traduzirLoteGps, montarRecibo, type LoteGpsAndroid } from "../ingest/device-ingest";
import { ingerir, type EscritorTransacional } from "../ingest/ingest-service";
import { limparSegredos } from "../auth/device-token";
import type { SourceMode } from "../contracts/event-catalog";

export const ROTA_INGESTAO = "/api/gps/batch";

export interface DepsDaRota {
  segredo: string;
  registro: RegistroDeDispositivos;
  escritor: EscritorTransacional;
  agora: () => Date;
  /** Modo dos fatos que esta instância aceita. Nunca tem padrão implícito. */
  source_mode: SourceMode;
  raiz?: string;
}

export interface RespostaDaRota {
  status: number;
  corpo: Record<string, unknown>;
}

/**
 * Classificação da resposta.
 *
 * O aparelho decide o que fazer com a fila local a partir disto, então cada
 * caso precisa ser distinguível. Um `400` genérico faria o cliente escolher
 * entre reenviar para sempre ou apagar o que nunca chegou.
 */
export type ClasseDeResposta =
  | "aceito"
  | "nao_autenticado"
  | "nao_autorizado"
  | "contrato_invalido"
  | "nao_roteavel"
  | "duplicado"
  | "falha_transitoria"
  | "falha_de_persistencia";

function responder(status: number, classe: ClasseDeResposta, corpo: Record<string, unknown>): RespostaDaRota {
  return { status, corpo: { classe, ...corpo } };
}

/**
 * Trata um lote de GPS vindo do aparelho.
 *
 * A ordem é a mesma do desenho e não é negociável: quem é você, você ainda
 * pode falar, o que você mandou faz sentido, tem para onde ir, e só então
 * gravar. Responder antes do commit seria a única falha capaz de fazer o
 * aparelho apagar um ponto que nunca chegou.
 */
export async function tratarLoteGps(
  headers: Record<string, string | undefined>,
  corpoBruto: unknown,
  deps: DepsDaRota,
): Promise<RespostaDaRota> {
  const agora = deps.agora();

  const auth = await autenticarDispositivo({
    authorization: headers.authorization ?? headers.Authorization,
    segredo: deps.segredo,
    registro: deps.registro,
    agora,
  });

  if (!auth.ok) {
    const corpo = corpoDeRecusa(auth);
    return responder(
      auth.status,
      auth.status === 401 ? "nao_autenticado" : "nao_autorizado",
      corpo as unknown as Record<string, unknown>,
    );
  }

  // Traduz o formato que o Android já fala. Mudar o Kotlin significaria
  // reinstalar em cada aparelho em campo; o servidor é a peça barata.
  const lote = await traduzirLoteGps({
    corpo: (corpoBruto ?? {}) as LoteGpsAndroid,
    device_id_autenticado: auth.claims.device_id,
    registro: deps.registro,
    recebido_em: agora,
    source_mode: deps.source_mode,
  });

  if (!lote.ok) {
    return responder(400, "contrato_invalido", {
      motivo: lote.recusa,
      detalhe: lote.detalhe ? limparSegredos(lote.detalhe) : undefined,
      preservar_dados_locais: true,
    });
  }

  const r = await ingerir(lote.fatos, {
    escritor: deps.escritor,
    recebido_em: agora,
    raiz: deps.raiz,
  });

  if (!r.aceito) {
    // NADA foi gravado. `retentavel` é o campo que impede o aparelho de
    // apagar a fila local de um ponto que nunca chegou.
    return responder(503, "falha_de_persistencia", {
      retentavel: true,
      preservar_dados_locais: true,
      detalhe: r.erro ? limparSegredos(r.erro.detail) : "falha ao persistir",
    });
  }

  const recibo = montarRecibo({
    resultado: { ...lote, rejeitados: [...lote.rejeitados, ...r.recusados.map((x) => ({ idempotency_key: x.idempotency_key, motivo: x.motivo }))] },
    gravados: r.gravados,
    recebido_em: agora,
  });

  // Duplicata é sucesso: o fato já está gravado e o aparelho pode limpar a
  // fila local. Devolvê-la como erro faria ele reenviar para sempre.
  const classe: ClasseDeResposta =
    r.gravados === 0 && r.duplicados > 0 ? "duplicado" : "aceito";

  return responder(200, classe, {
    ...(recibo as unknown as Record<string, unknown>),
    duplicados: r.duplicados,
    nao_roteaveis: r.recusados.filter((x) => x.motivo === "nao_roteavel").length,
  });
}
