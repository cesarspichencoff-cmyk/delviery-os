/**
 * Fronteira de procedência do feed público de Entregas.
 *
 * Decide, ANTES do adapter e de qualquer escrita, se um registro da outbox de
 * Entregas veio de um produtor que a plataforma reconhece, para aquela
 * unidade, aquele tipo e aquele modo. O que o JSON declara — `source`,
 * `source_mode`, `unit_id`, `producer_id` — nunca é prova: só serve para
 * localizar a chave candidata.
 *
 * Ordem fixa (cada passo só roda se o anterior passou):
 *   formato -> chave registrada -> ASSINATURA -> contrato das claims ->
 *   vida da chave -> iat -> evento público válido -> unidade -> tipo ->
 *   modo (real nunca) -> igualdade com o registro da outbox -> antirreplay
 *
 * Três saídas, e a diferença entre elas é o que mantém a operação viva:
 *   admitido     -> segue para o adapter com o modo ATRIBUÍDO pelo servidor;
 *   quarentena   -> recusa permanente: registrada e o cursor avança;
 *   indisponivel -> não sabemos (registro fora): nada é gravado, o cursor
 *                   NÃO avança, e o próximo tick tenta de novo.
 * Tratar indisponibilidade como quarentena descartaria evento legítimo.
 *
 * `real` não tem caminho aqui: nem o registro aceita concedê-lo (CHECK da
 * migration 0010), nem esta fronteira o admite. Abrir isso exige decisão
 * humana explícita, prova de fonte real e uma migration nova.
 */
import { createHash } from "node:crypto";

import {
  assinaturaConfere,
  chavePublicaEd25519,
  claimsDoContrato,
  decodificarAtestacao,
  eventoCanonicoIgual,
} from "../../entregas/contracts/producer-attestation";
import type { EntregasPublicEvent } from "../../entregas/contracts/events/types";
import { validatePublicEvent } from "../../entregas/contracts/events/validate";
import type { EscritorTransacional } from "./ingest-service";

/** Teto para relógio do produtor adiantado em relação ao servidor. */
export const FOLGA_DE_RELOGIO_MS = 30_000;

export type ModoConcedivel = "simulated" | "control";

export interface ChaveDeProdutor {
  readonly producer_id: string;
  readonly key_id: string;
  readonly unit_id: string;
  /** 32 bytes crus Ed25519. */
  readonly public_key: Uint8Array;
  readonly allowed_event_types: readonly string[];
  readonly allowed_modes: readonly ModoConcedivel[];
  readonly not_before: Date;
  readonly not_after: Date;
  readonly revoked_at: Date | null;
}

/** Registro controlado pelo servidor. O produtor nunca escreve aqui. */
export interface RegistroDeProdutores {
  buscar(producer_id: string, key_id: string): Promise<ChaveDeProdutor | null>;
}

export interface AdmissaoAnterior {
  readonly envelope_sha256: string;
  readonly source_ref: string;
}

export type MotivoDeQuarentena =
  | "atestacao_ausente"
  | "atestacao_formato_invalido"
  | "atestacao_codificacao_invalida"
  | "atestacao_claims_invalidas"
  | "produtor_desconhecido"
  | "chave_registrada_invalida"
  | "assinatura_invalida"
  | "contrato_da_atestacao_invalido"
  | "chave_revogada"
  | "chave_fora_da_validade"
  | "iat_no_futuro"
  | "iat_fora_da_vida_da_chave"
  | "evento_assinado_invalido"
  | "unidade_nao_concedida"
  | "tipo_nao_concedido"
  | "modo_ausente"
  | "real_sem_autoridade_de_mundo"
  | "modo_nao_concedido"
  | "evento_divergente_da_assinatura"
  | "nonce_reutilizado"
  | "evento_reutilizado";

/**
 * Linha do livro de admissões. Em quarentena, TODO identificador aqui é
 * declarado (vem do registro ou do token ainda não provado). Em admissão, os
 * identificadores foram provados pela assinatura e pelo registro.
 */
export interface RegistroDeAdmissao {
  readonly decision: "admitted" | "quarantined";
  readonly reason: MotivoDeQuarentena | "atestacao_verificada";
  readonly producer_id: string | null;
  readonly key_id: string | null;
  readonly nonce: string | null;
  readonly unit_id: string | null;
  readonly event_id: string | null;
  readonly event_type: string | null;
  readonly declared_mode: string | null;
  readonly assigned_mode: ModoConcedivel | null;
  readonly envelope_sha256: string;
  readonly source_ref: string;
  readonly received_at: string;
}

/**
 * Livro durável de admissões e quarentenas. Append-only no banco.
 * Toda escrita é idempotente por (source_ref, envelope_sha256): reler o mesmo
 * registro depois de uma queda nunca duplica nem vira "replay".
 */
export interface LivroDeAdmissoes {
  /**
   * Decisão já tomada para este registro de origem e estes bytes. A decisão é
   * UMA: se a quarentena foi gravada e o processo caiu antes do checkpoint, a
   * releitura não pode admitir o mesmo envelope (o registro de produtores
   * pode ter mudado no intervalo) — isso deixaria fato sem linha de admissão.
   */
  decisaoAnterior(
    source_ref: string,
    envelope_sha256: string,
  ): Promise<{ decision: "admitted" | "quarantined"; reason: string } | null>;
  admitidaPorNonce(producer_id: string, nonce: string): Promise<AdmissaoAnterior | null>;
  admitidaPorEvento(producer_id: string, event_id: string): Promise<AdmissaoAnterior | null>;
  quarentenar(r: RegistroDeAdmissao): Promise<void>;
  /** Admissão sem fato de plataforma (sinal independente sem equivalência). */
  admitirSemFato(r: RegistroDeAdmissao): Promise<void>;
  /** Escritor que grava a admissão e os fatos na MESMA transação. */
  escritor(r: RegistroDeAdmissao): EscritorTransacional;
}

export interface ItemAtestavel {
  /** Identidade do registro na fonte (outbox_id), nunca do payload. */
  readonly source_ref: string;
  readonly event: EntregasPublicEvent;
  readonly attestation: string | null;
}

export interface FeedAtestavel {
  pollAtestavel(
    cursor: string | null,
    limit?: number,
  ): Promise<{ itens: ItemAtestavel[]; next_cursor: string | null }>;
}

export type VereditoDeProcedencia =
  | {
      readonly tipo: "admitido";
      readonly evento: EntregasPublicEvent;
      readonly registro: RegistroDeAdmissao;
      /** Mesmo envelope, mesmo registro de origem, já admitido antes. */
      readonly releitura: boolean;
    }
  | { readonly tipo: "quarentena"; readonly registro: RegistroDeAdmissao }
  | { readonly tipo: "indisponivel"; readonly codigo: string };

export function digestoDoEnvelope(item: ItemAtestavel): string {
  const base =
    typeof item.attestation === "string" && item.attestation
      ? "pa:" + item.attestation
      : "sem-atestacao:" + JSON.stringify(item.event);
  return createHash("sha256").update(base, "utf8").digest("hex");
}

function declarado(item: ItemAtestavel, agora: Date, sha: string) {
  const e = item.event as Partial<EntregasPublicEvent> | undefined;
  const texto = (v: unknown) => (typeof v === "string" && v.length <= 256 ? v : null);
  return {
    producer_id: null,
    key_id: null,
    nonce: null,
    unit_id: texto(e?.unit_id),
    event_id: texto(e?.event_id),
    event_type: texto(e?.event_type),
    declared_mode: texto(e?.source_mode),
    assigned_mode: null,
    envelope_sha256: sha,
    source_ref: item.source_ref,
    received_at: agora.toISOString(),
  };
}

export async function julgarProcedencia(
  item: ItemAtestavel,
  agora: Date,
  deps: { registro: RegistroDeProdutores; livro: LivroDeAdmissoes },
): Promise<VereditoDeProcedencia> {
  const sha = digestoDoEnvelope(item);
  let base: Omit<RegistroDeAdmissao, "decision" | "reason"> = declarado(item, agora, sha);
  const quarentena = (reason: MotivoDeQuarentena): VereditoDeProcedencia => ({
    tipo: "quarentena",
    registro: { ...base, decision: "quarantined", reason },
  });

  let anterior: Awaited<ReturnType<LivroDeAdmissoes["decisaoAnterior"]>>;
  try {
    anterior = await deps.livro.decisaoAnterior(item.source_ref, sha);
  } catch {
    return { tipo: "indisponivel", codigo: "livro_de_admissoes_indisponivel" };
  }
  if (anterior?.decision === "quarantined") {
    return {
      tipo: "quarentena",
      registro: {
        ...base,
        decision: "quarantined",
        reason: anterior.reason as MotivoDeQuarentena,
      },
    };
  }
  // Admitido antes: verifica TUDO de novo. Se hoje falhar (chave revogada no
  // intervalo), a quarentena é no-op no livro e o fato já durável fica — sem
  // segundo fato, sem segunda admissão.

  const d = decodificarAtestacao(item.attestation);
  if (!d.ok) return quarentena(d.motivo);
  base = { ...base, producer_id: d.producer_id, key_id: d.kid };

  let chave: ChaveDeProdutor | null;
  try {
    chave = await deps.registro.buscar(d.producer_id, d.kid);
  } catch {
    return { tipo: "indisponivel", codigo: "registro_de_produtores_indisponivel" };
  }
  if (!chave || chave.producer_id !== d.producer_id || chave.key_id !== d.kid) {
    return quarentena("produtor_desconhecido");
  }

  let publica;
  try {
    publica = chavePublicaEd25519(chave.public_key);
  } catch {
    return quarentena("chave_registrada_invalida");
  }
  if (!assinaturaConfere(d, publica)) return quarentena("assinatura_invalida");

  // Daqui em diante as claims são do dono da chave — ainda não autorizadas.
  const claims = claimsDoContrato(d.bruto);
  if (!claims) return quarentena("contrato_da_atestacao_invalido");
  base = { ...base, nonce: claims.nonce };

  const t = agora.getTime();
  const inicio = chave.not_before.getTime();
  const fim = chave.not_after.getTime();
  // Revogada vale para tudo, inclusive o que foi assinado antes: a data do
  // comprometimento da chave não é conhecida.
  if (chave.revoked_at !== null) return quarentena("chave_revogada");
  if (!(t >= inicio && t < fim)) return quarentena("chave_fora_da_validade");
  const iat = claims.iat * 1000;
  if (iat > t + FOLGA_DE_RELOGIO_MS) return quarentena("iat_no_futuro");
  if (iat < inicio || iat >= fim) return quarentena("iat_fora_da_vida_da_chave");

  const v = validatePublicEvent(claims.event);
  if (!v.ok) return quarentena("evento_assinado_invalido");
  const e = v.event;
  base = {
    ...base,
    unit_id: e.unit_id,
    event_id: e.event_id,
    event_type: e.event_type,
    declared_mode: e.source_mode ?? null,
  };

  if (e.unit_id !== chave.unit_id) return quarentena("unidade_nao_concedida");
  if (!chave.allowed_event_types.includes(e.event_type)) return quarentena("tipo_nao_concedido");
  if (!e.source_mode) return quarentena("modo_ausente");
  if (e.source_mode === "real") return quarentena("real_sem_autoridade_de_mundo");
  const modo: ModoConcedivel = e.source_mode;
  if (!chave.allowed_modes.includes(modo)) return quarentena("modo_nao_concedido");

  // O registro da outbox precisa ser o que foi assinado. O evento que segue é
  // SEMPRE o de dentro da assinatura; o do registro só é comparado.
  if (!eventoCanonicoIgual(item.event, claims.event)) {
    return quarentena("evento_divergente_da_assinatura");
  }

  let porNonce: AdmissaoAnterior | null;
  let porEvento: AdmissaoAnterior | null;
  try {
    porNonce = await deps.livro.admitidaPorNonce(chave.producer_id, claims.nonce);
    porEvento = await deps.livro.admitidaPorEvento(chave.producer_id, e.event_id);
  } catch {
    return { tipo: "indisponivel", codigo: "livro_de_admissoes_indisponivel" };
  }
  const mesmo = (a: AdmissaoAnterior) =>
    a.envelope_sha256 === sha && a.source_ref === item.source_ref;
  if (porNonce && !mesmo(porNonce)) return quarentena("nonce_reutilizado");
  if (porEvento && !mesmo(porEvento)) return quarentena("evento_reutilizado");

  return {
    tipo: "admitido",
    evento: { ...e, source_mode: modo },
    registro: {
      ...base,
      decision: "admitted",
      reason: "atestacao_verificada",
      assigned_mode: modo,
    },
    releitura: porNonce !== null,
  };
}

/** O que o consumidor precisa saber da procedência — nada de PG aqui. */
export interface ProcedenciaDoConsumidor {
  pollAtestavel: FeedAtestavel["pollAtestavel"];
  julgar(item: ItemAtestavel, recebido_em: Date): Promise<VereditoDeProcedencia>;
  quarentenar(r: RegistroDeAdmissao): Promise<void>;
  admitirSemFato(r: RegistroDeAdmissao): Promise<void>;
  escritor(r: RegistroDeAdmissao): EscritorTransacional;
}

export class FronteiraDeProcedencia implements ProcedenciaDoConsumidor {
  constructor(
    private readonly deps: {
      feed: FeedAtestavel;
      registro: RegistroDeProdutores;
      livro: LivroDeAdmissoes;
    },
  ) {}

  pollAtestavel(cursor: string | null, limit?: number) {
    return this.deps.feed.pollAtestavel(cursor, limit);
  }

  julgar(item: ItemAtestavel, recebido_em: Date) {
    return julgarProcedencia(item, recebido_em, this.deps);
  }

  quarentenar(r: RegistroDeAdmissao) {
    return this.deps.livro.quarentenar(r);
  }

  admitirSemFato(r: RegistroDeAdmissao) {
    return this.deps.livro.admitirSemFato(r);
  }

  escritor(r: RegistroDeAdmissao) {
    return this.deps.livro.escritor(r);
  }
}
