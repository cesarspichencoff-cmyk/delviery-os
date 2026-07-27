/**
 * Catálogo de eventos do DeliveryOS.
 *
 * Um evento aqui é um FATO que aconteceu na operação. Não é comando, não é
 * intenção, não é opinião de nenhum motor. Por isso o nome é sempre no passado.
 *
 * Três carimbos que nunca se fundem, porque respondem a perguntas diferentes:
 *
 *   occurred_at  quando aconteceu no mundo
 *   observed_at  quando alguém viu
 *   received_at  quando o servidor recebeu
 *
 * Fundir os dois primeiros faz sincronização atrasada parecer operação
 * atrasada — é assim que se acusa um motoboy de demorar quando ele só estava
 * sem sinal debaixo de um viaduto.
 */

/* ------------------------------------------------------------------ *
 * Tipos de evento
 * ------------------------------------------------------------------ */

/**
 * Os tipos que a plataforma reconhece.
 *
 * Acrescentar tipo é aditivo e seguro. REMOVER ou RENOMEAR quebra replay do
 * histórico, porque o event log é append-only e guarda o nome antigo para
 * sempre — um evento gravado ontem precisa continuar legível amanhã.
 */
export const EVENT_TYPES = [
  "trip_created",
  "trip_started",
  "gps_batch_received",
  "arrival_detected",
  "delivery_confirmed",
  "occurrence_created",
  "trip_return_started",
  "trip_returned",
  "trip_closed",
  "source_event_received",
  "order_state_changed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_CATALOG_VERSION = "event-catalog@1.0.0";

/**
 * De onde o fato veio.
 *
 * `device` é o celular do motoboy; `source` é um observador de origem externa;
 * `operator` é gente decidindo; `system` é derivação da própria plataforma.
 */
export type EventOrigin = "device" | "source" | "operator" | "system";

export const EVENT_ORIGINS: readonly EventOrigin[] = ["device", "source", "operator", "system"];

/**
 * Se o fato é da operação real, de simulação, ou de braço de controle.
 *
 * `control` existe para permitir comparar uma recomendação contra o que teria
 * acontecido sem ela. Sem esse terceiro valor, "o Copiloto melhorou a operação"
 * é uma frase sem como ser verificada.
 *
 * NÃO existe valor padrão. A ausência do campo é recusada na validação — se
 * `real` fosse o padrão, um simulador esquecido ligado viraria histórico real
 * em silêncio, e ninguém descobriria até alguém decidir com base nele.
 */
export type SourceMode = "real" | "simulated" | "control";

export const SOURCE_MODES: readonly SourceMode[] = ["real", "simulated", "control"];

/* ------------------------------------------------------------------ *
 * Envelope
 * ------------------------------------------------------------------ */

/** Limite de tamanho do payload, em bytes. */
export const PAYLOAD_MAX_BYTES = 64 * 1024;

/**
 * Envelope de um fato.
 *
 * `causation_id` e `correlation_id` não são a mesma coisa e a confusão entre
 * eles custa caro numa investigação: correlação agrupa tudo que pertence à
 * mesma história (uma viagem inteira); causação aponta o evento específico que
 * provocou este. Sem causação, "por que isso aconteceu?" vira arqueologia.
 */
export interface EventEnvelope<T = Record<string, unknown>> {
  event_id: string;
  event_type: EventType;
  /** Versão do FORMATO do payload deste tipo. Evolui sozinha, por tipo. */
  event_version: string;
  unit_id: string;

  trip_id?: string;
  order_id?: string;
  device_id?: string;
  actor_id?: string;

  /** Quando aconteceu no mundo. */
  occurred_at: string;
  /** Quando o observador viu. Ausente quando observar e acontecer coincidem. */
  observed_at?: string;

  origin: EventOrigin;
  source_mode: SourceMode;

  /**
   * Ordem local de quem produziu. NUNCA presumir ordenação global: dois
   * aparelhos com relógios diferentes produzem carimbos que não se comparam.
   */
  sequence?: number;

  idempotency_key: string;
  correlation_id?: string;
  causation_id?: string;

  payload: T;
}

/* ------------------------------------------------------------------ *
 * Validação
 * ------------------------------------------------------------------ */

export type EventRejection =
  | "unknown_type"
  | "missing_field"
  | "invalid_timestamp"
  | "invalid_source_mode"
  | "payload_too_large"
  | "pii_suspected";

export type EventCheck =
  | { ok: true; envelope: EventEnvelope }
  | { ok: false; rejection: EventRejection; detail: string };

/**
 * Campos que nunca podem viajar num payload de fato operacional.
 *
 * A verificação é por NOME DE CHAVE, não por conteúdo: procurar CPF por regex
 * dentro do valor é um jogo que se perde, porque o dado sempre chega num
 * formato que a regex não previu. Recusar a chave é decidível.
 */
export const FORBIDDEN_PAYLOAD_KEYS = [
  "cpf",
  "rg",
  "documento",
  "document",
  "customer_name",
  "nome_cliente",
  "customer_phone",
  "telefone",
  "phone",
  "email",
  "address",
  "endereco",
  "password",
  "senha",
  "token",
  "authorization",
  "cookie",
  "card",
  "cartao",
] as const;

function ehIsoValido(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

/** Procura chave proibida em qualquer profundidade. */
function chaveProibida(valor: unknown, profundidade = 0): string | null {
  if (profundidade > 8 || valor === null || typeof valor !== "object") return null;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achou = chaveProibida(item, profundidade + 1);
      if (achou) return achou;
    }
    return null;
  }
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    const normal = chave.toLowerCase();
    if (FORBIDDEN_PAYLOAD_KEYS.some((p) => normal === p || normal.endsWith(`_${p}`))) {
      return chave;
    }
    const achou = chaveProibida(v, profundidade + 1);
    if (achou) return achou;
  }
  return null;
}

/**
 * Valida um envelope antes de ele virar fato.
 *
 * Recusa é melhor que quarentena silenciosa: o produtor precisa saber que o que
 * ele mandou não entrou. Quarentena sem aviso é perda de dado com etapa extra.
 */
export function checkEvent(bruto: unknown): EventCheck {
  if (!bruto || typeof bruto !== "object") {
    return { ok: false, rejection: "missing_field", detail: "envelope ausente" };
  }
  const e = bruto as Partial<EventEnvelope>;

  for (const campo of ["event_id", "event_type", "event_version", "unit_id", "idempotency_key"] as const) {
    if (typeof e[campo] !== "string" || !(e[campo] as string).trim()) {
      return { ok: false, rejection: "missing_field", detail: `${campo} ausente` };
    }
  }

  if (!EVENT_TYPES.includes(e.event_type as EventType)) {
    // Tipo desconhecido é recusa explícita, e não "ignora e segue". Ignorar em
    // silêncio faz um deploy com tipo novo apagar eventos até o consumidor
    // que os entende subir.
    return {
      ok: false,
      rejection: "unknown_type",
      detail: `tipo desconhecido: ${String(e.event_type)}`,
    };
  }

  if (!ehIsoValido(e.occurred_at)) {
    return { ok: false, rejection: "invalid_timestamp", detail: "occurred_at inválido" };
  }
  if (e.observed_at !== undefined && !ehIsoValido(e.observed_at)) {
    return { ok: false, rejection: "invalid_timestamp", detail: "observed_at inválido" };
  }

  // `origin` diz se o fato veio de um celular, de um observador, de gente ou
  // de derivacao da propria plataforma. Sem ele, uma auditoria nao consegue
  // distinguir o que foi OBSERVADO do que foi INFERIDO — e essa diferenca e a
  // que decide se um numero pode ser usado para cobrar alguem.
  //
  // Esta checagem faltava: o contrato documentado exigia o campo e o portao do
  // runtime nao. O teste que cruza os dois apontou a divergencia.
  if (!EVENT_ORIGINS.includes(e.origin as EventOrigin)) {
    return {
      ok: false,
      rejection: "missing_field",
      detail: `origin precisa ser device, source, operator ou system (veio: ${String(e.origin)})`,
    };
  }

  if (!SOURCE_MODES.includes(e.source_mode as SourceMode)) {
    // Sem padrão: ver `SourceMode`.
    return {
      ok: false,
      rejection: "invalid_source_mode",
      detail: `source_mode precisa ser real, simulated ou control (veio: ${String(e.source_mode)})`,
    };
  }

  if (e.sequence !== undefined) {
    if (!Number.isInteger(e.sequence) || (e.sequence as number) < 0) {
      return { ok: false, rejection: "missing_field", detail: "sequence inválida" };
    }
  }

  // Payload ausente virava `{}` em silencio, e com isso um produtor que
  // esqueceu de serializar o conteudo passava como se tivesse mandado um fato
  // legitimamente vazio. Ausente e vazio sao coisas diferentes: `{}` e uma
  // afirmacao ("nao ha nada a dizer"), ausencia e um defeito.
  if (e.payload === undefined || e.payload === null || typeof e.payload !== "object" || Array.isArray(e.payload)) {
    return { ok: false, rejection: "missing_field", detail: "payload ausente ou nao e objeto" };
  }
  const payload = e.payload;
  const tamanho = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (tamanho > PAYLOAD_MAX_BYTES) {
    // Payload sem limite é como uma linha de log vira um incidente de disco.
    return {
      ok: false,
      rejection: "payload_too_large",
      detail: `payload de ${tamanho} bytes excede ${PAYLOAD_MAX_BYTES}`,
    };
  }

  const proibida = chaveProibida(payload);
  if (proibida) {
    return {
      ok: false,
      rejection: "pii_suspected",
      detail: `payload contém campo proibido: ${proibida}`,
    };
  }

  return { ok: true, envelope: e as EventEnvelope };
}

/* ------------------------------------------------------------------ *
 * Compatibilidade de versão
 * ------------------------------------------------------------------ */

/**
 * Decide se um consumidor sabe ler um evento.
 *
 * **Major igual basta.** Dentro do mesmo major a evolução é aditiva por
 * contrato: campo novo só se acrescenta, nunca muda de sentido. Então um
 * consumidor antigo lê evento novo ignorando o que não conhece, e um consumidor
 * novo lê evento antigo tratando o campo ausente como ausente.
 *
 * Exigir `minor do evento <= minor do consumidor` seria a regra intuitiva e
 * seria errada: pararia todo consumidor ainda não atualizado no instante em que
 * um produtor acrescentasse um campo opcional — que é exatamente a mudança que
 * o versionamento aditivo existe para permitir.
 *
 * Major diferente é incompatível, e aí o evento vai para dead-letter em vez de
 * ser interpretado errado.
 */
export function podeLer(versaoDoEvento: string, versaoDoConsumidor: string): boolean {
  const major = (v: string): number =>
    Number.parseInt((v.split("@").pop() ?? "0").split(".")[0], 10) || 0;
  return major(versaoDoEvento) === major(versaoDoConsumidor);
}

/** Nome do stream de outbox para um tipo de evento. */
export function streamDe(tipo: EventType): string {
  if (tipo === "source_event_received" || tipo === "order_state_changed") return "fontes";
  return "entregas";
}
