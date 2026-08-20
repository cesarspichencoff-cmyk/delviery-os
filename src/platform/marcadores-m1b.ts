/**
 * O CLASSIFICADOR DE MARCADOR — e a recusa de mentir quando não há marcador.
 * ============================================================================
 * Genoma que este arquivo existe para matar: `PROTOCOL_STATE_GAP`.
 *
 * A rodada anterior chegou num estado real e legítimo — ambiente sadio, nenhuma
 * decisão estrutural pendente, nenhuma contaminação, implementação incompleta —
 * e o protocolo não tinha marcador para ele. Um protocolo sem marcador para um
 * estado alcançável não deixa o construtor honesto: deixa três saídas, e as três
 * são falsas — dizer que está pronto, inventar marcador novo, ou declarar um
 * blocker que não existe.
 *
 * A propriedade protegida aqui NÃO é "existe uma constante chamada
 * M1B_CONTINUATION_REQUIRED". É mais forte:
 *
 *     TODO ESTADO ALCANÇÁVEL TEM EXATAMENTE UM MARCADOR LEGAL, E QUANDO NÃO
 *     TEM, O CLASSIFICADOR RECUSA — ele nunca escolhe o marcador mais próximo.
 *
 * É por isso que `classificar` lança em vez de devolver um palpite: um palpite
 * aqui é exatamente a mentira que o buraco de estado produzia.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface EstadoDaMissao {
  readonly contaminacao: boolean;
  readonly procedencia_servidor: boolean;
  readonly decisao_estrutural: boolean;
  readonly ambiente: "ok" | "quebrado";
  readonly implementacao: "completa" | "incompleta";
}

interface RegraDeMarcador {
  readonly marcador: string;
  readonly quando: Record<string, unknown>;
  readonly afirma: string;
}

interface Protocolo {
  readonly marcadores: readonly RegraDeMarcador[];
  readonly _proibido: readonly string[];
}

export const CAMINHO_PROTOCOLO = "docs/execution/M1B_MARKER_PROTOCOL.json";

export function lerProtocolo(raiz: string): Protocolo {
  return JSON.parse(readFileSync(join(raiz, CAMINHO_PROTOCOLO), "utf8")) as Protocolo;
}

export class SemMarcadorLegal extends Error {}

/**
 * A primeira regra cuja condição inteira casa com o estado. Nenhuma aproximação:
 * se nada casar, isto LANÇA. Devolver "o mais parecido" seria reintroduzir o
 * buraco com outra roupa.
 */
export function classificar(estado: EstadoDaMissao, protocolo: Protocolo): string {
  for (const regra of protocolo.marcadores) {
    let casa = true;
    for (const [chave, valor] of Object.entries(regra.quando)) {
      if ((estado as unknown as Record<string, unknown>)[chave] !== valor) {
        casa = false;
        break;
      }
    }
    if (casa) return regra.marcador;
  }
  throw new SemMarcadorLegal(
    `nenhum marcador legal para o estado ${JSON.stringify(estado)} — ` +
      "o protocolo tem um buraco, e escolher o marcador mais proximo seria mentir",
  );
}

/** O estado que a rodada anterior alcançou e não soube nomear. */
export const ESTADO_TRABALHO_LEGITIMO_RESTANTE: EstadoDaMissao = {
  contaminacao: false,
  procedencia_servidor: true,
  decisao_estrutural: false,
  ambiente: "ok",
  implementacao: "incompleta",
};
