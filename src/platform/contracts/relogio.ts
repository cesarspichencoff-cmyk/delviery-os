/**
 * Relógio do aparelho — quando o `occurred_at` de um fato tem autoridade
 * temporal.
 *
 * CAPTURADO ≠ HORÁRIO CONFIÁVEL. Um ponto com relógio errado continua sendo um
 * ponto: a coordenada, o `occurred_at` que o aparelho mandou e a hora em que o
 * servidor recebeu ficam preservados. O que ele perde é a AUTORIDADE sobre o
 * tempo: o frescor passa a ser medido pelo relógio do servidor.
 *
 * O vocabulário e a tolerância NÃO nascem aqui. São os do contrato que já
 * existe no domínio de Entregas: `CLOCK_TRUST` em
 * `src/entregas/foundation/enums.ts` e `clock_skew_tolerance_ms` em
 * `src/entregas/gps/types.ts`. A plataforma não importa Entregas (regra
 * estrutural de `test:platform`), então os repete — e `test:platform:relogio`
 * reprova se divergirem.
 *
 * A regra do servidor é assimétrica, de propósito:
 *
 *   - ADIANTADO além da tolerância → `suspect`. Um ponto não pode ter
 *     acontecido depois de o servidor recebê-lo.
 *   - ATRASADO não é evidência de relógio errado: é o ponto capturado sem rede
 *     e sincronizado depois. Relógio atrasado só faz o dado parecer MAIS velho
 *     e nunca fabrica frescor. Limite declarado, não defeito.
 *
 * Função pura: nenhum relógio próprio, nenhum I/O.
 */

/** O mesmo vocabulário de `CLOCK_TRUST` (Entregas). */
export const CONFIANCAS_DO_RELOGIO = ["trusted", "suspect", "unknown"] as const;
export type ConfiancaDoRelogio = (typeof CONFIANCAS_DO_RELOGIO)[number];

/** 2 minutos: `DEFAULT_GPS_POLICY.clock_skew_tolerance_ms` (Entregas). */
export const TOLERANCIA_DO_RELOGIO_MS = 120_000;

function instanteDe(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Julga o relógio do produtor contra a hora em que o SERVIDOR recebeu.
 *
 * `recebido_em` é sempre do servidor, nunca do produtor. Sem os dois
 * instantes legíveis não há julgamento possível: `unknown`, nunca `trusted`.
 */
export function classificarRelogio(
  occurred_at: unknown,
  recebido_em: unknown,
  tolerancia_ms: number = TOLERANCIA_DO_RELOGIO_MS,
): ConfiancaDoRelogio {
  const ocorreu = instanteDe(occurred_at);
  const recebeu = instanteDe(recebido_em);
  if (ocorreu === null || recebeu === null) return "unknown";
  return ocorreu - recebeu > tolerancia_ms ? "suspect" : "trusted";
}

/** O que um consumidor sabe de um fato para decidir o tempo dele. */
export interface TempoDoFato {
  occurred_at: unknown;
  /** Hora do servidor: `received_at` no envelope, `recorded_at` no event log. */
  received_at?: unknown;
  /** O carimbo gravado na ingestão. Pode estar ausente, ou ser o padrão da 0001. */
  clock_trust?: unknown;
}

/**
 * A confiança que um CONSUMIDOR pode dar ao relógio de um fato.
 *
 * Nunca só o carimbo. Todo fato gravado antes desta correção carrega o padrão
 * da coluna (migration 0001): `trusted`, sem avaliação nenhuma. Por isso o
 * carimbo só vale se os instantes imutáveis concordarem, e carimbo ausente ou
 * fora do vocabulário é julgado pela mesma regra — nunca presumido confiável.
 */
export function relogioEfetivo(f: TempoDoFato): ConfiancaDoRelogio {
  const medido = classificarRelogio(f.occurred_at, f.received_at);
  const carimbo = (CONFIANCAS_DO_RELOGIO as readonly unknown[]).includes(f.clock_trust)
    ? (f.clock_trust as ConfiancaDoRelogio)
    : null;
  if (carimbo === "suspect" || medido === "suspect") return "suspect";
  if (carimbo === "unknown" || medido === "unknown") return "unknown";
  return "trusted";
}

/**
 * O instante que PODE decidir frescor.
 *
 * Relógio com autoridade: o `occurred_at`, exatamente como o aparelho mandou.
 * Sem autoridade: a hora em que o servidor recebeu — o ponto existia até ali, e
 * só isso é sabido. Nunca o `occurred_at` de um relógio adiantado: era ele que
 * fazia um ponto de amanhã ficar fresco amanhã.
 *
 * A FRONTEIRA do julgamento é a ingestão. Todo fato de aparelho passa por ela
 * e chega aos consumidores com os dois carimbos do servidor — na mensagem da
 * outbox e, no replay, do event log (`test:platform:relogio`, R9). Um envelope
 * SEM NENHUM dos dois não passou por ela: fixture, demonstração, ou mensagem
 * da outbox gravada antes desta correção. Para ele não há julgamento possível,
 * e vale o instante que o fato declara, como sempre valeu — o que ele não
 * recebe é classificação: o relógio dele continua `unknown`.
 *
 * Com carimbo e sem hora do servidor (não verificável): `undefined`. Não há
 * instante confiável, e o frescor fica `unknown` — nunca fresco por ausência.
 */
export function instanteConfiavel(f: TempoDoFato): string | undefined {
  const declarado = f.occurred_at instanceof Date ? f.occurred_at.toISOString() : String(f.occurred_at);
  if (relogioEfetivo(f) === "trusted") return declarado;
  const recebeu = instanteDe(f.received_at);
  if (recebeu !== null) return new Date(recebeu).toISOString();
  const foraDaIngestao = f.received_at === undefined && f.clock_trust === undefined;
  return foraDaIngestao && instanteDe(f.occurred_at) !== null ? declarado : undefined;
}
