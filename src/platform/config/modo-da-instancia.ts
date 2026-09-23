/**
 * O modo da instância do runtime CRÍTICO — Q-017.
 *
 * `DELIVERYOS_SOURCE_MODE` declara a NATUREZA dos fatos que esta instância
 * grava: `real`, `simulated` ou `control`. Não diz por onde o dado chegou —
 * aparelho, tela, API, planilha —, diz se ele é do mundo real, de simulação ou
 * de braço de controle. A estratégia de aquisição é outra decisão, e nada aqui
 * a toca.
 *
 * Decisão do César (Q-017): **AUSENTE ≠ REAL.** Não existe padrão. Sem uma
 * declaração válida o crítico recusa o boot com `exit 78` — antes de abrir
 * conexão com o banco, antes de migration, antes de escutar.
 *
 * Por que não existe padrão: desde a Q-016 o modo fica gravado em
 * `platform.event_log`, sobrevive a reinício e governa a reconstrução da
 * Operação Viva. Um padrão deixou de ser valor em memória e virou carimbo
 * durável com cara de atestação — que ninguém fez.
 *
 * O contrato do envelope JÁ recusava a ausência (`event-catalog.ts`,
 * `SourceMode`). O padrão antigo, `?? "real"` em `bin/critical.ts`, entrava
 * ANTES de o envelope existir: o validador recebia um `real` bem formado e
 * não tinha como saber que ninguém o tinha declarado. Por isso a recusa mora
 * aqui, na borda da configuração, e não no validador.
 *
 * Só o crítico lê esta variável. O assíncrono não grava fato de campo: o modo
 * de cada fato que ele consome ou reconstrói vem do próprio fato.
 */

import { SOURCE_MODES, type SourceMode } from "../contracts/event-catalog";
import { ConfigError } from "./platform-config";

export const VARIAVEL_DO_MODO = "DELIVERYOS_SOURCE_MODE";

export type MotivoDoModo = "ausente" | "vazio" | "invalido";

/**
 * É um `ConfigError`: o crítico trata as duas recusas pelo MESMO caminho —
 * mensagem, `exit 78`, nenhum efeito colateral.
 */
export class ModoDaInstanciaInvalido extends ConfigError {
  constructor(
    readonly motivo: MotivoDoModo,
    message: string,
  ) {
    super(message, VARIAVEL_DO_MODO);
    this.name = "ModoDaInstanciaInvalido";
  }
}

/**
 * Forma de um valor que pode ser ecoado no log: curto e só letras. Qualquer
 * outra coisa — uma URL com senha, um segredo colado na linha errada do
 * `.env` — aparece só pelo tamanho. O erro de configuração é justamente onde
 * um valor fora do lugar costuma vazar.
 */
const ECOAVEL = /^[A-Za-z_-]{1,24}$/;

/** "real, simulated ou control" — derivado da lista, para não divergir dela. */
const VALIDOS = `${SOURCE_MODES.slice(0, -1).join(", ")} ou ${SOURCE_MODES[SOURCE_MODES.length - 1]}`;

/**
 * Lê e valida o modo. **Nunca devolve um valor que não foi declarado.**
 *
 * Aceita exatamente `real`, `simulated` ou `control`, com diferença de
 * maiúsculas (`REAL` é recusado). Só o espaço em volta é removido, como em
 * toda variável de `platform-config.ts`: `" simulated\n"` declara `simulated`;
 * espaço sozinho não declara nada.
 */
export function lerModoDaInstancia(env: NodeJS.ProcessEnv = process.env): SourceMode {
  const bruto = env[VARIAVEL_DO_MODO];
  if (bruto === undefined) {
    throw new ModoDaInstanciaInvalido(
      "ausente",
      `${VARIAVEL_DO_MODO} ausente: declare ${VALIDOS}. Ausência não é real (Q-017).`,
    );
  }
  const valor = bruto.trim();
  if (valor === "") {
    throw new ModoDaInstanciaInvalido(
      "vazio",
      `${VARIAVEL_DO_MODO} vazio: declare ${VALIDOS}. Vazio não é real (Q-017).`,
    );
  }
  if (!(SOURCE_MODES as readonly string[]).includes(valor)) {
    const visto = ECOAVEL.test(valor) ? `"${valor}"` : `valor de ${valor.length} caractere(s), não exibido`;
    throw new ModoDaInstanciaInvalido(
      "invalido",
      `${VARIAVEL_DO_MODO} inválido (${visto}): aceita só ${VALIDOS}.`,
    );
  }
  return valor as SourceMode;
}
