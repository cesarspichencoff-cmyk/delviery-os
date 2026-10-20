/**
 * Atestação de produtor do feed público de Entregas — formato `pa1`.
 *
 *   pa1.<base64url(claims JSON)>.<base64url(Ed25519, 64 bytes)>
 *
 * A assinatura cobre os BYTES transmitidos (`"pa1." + segmento de claims`),
 * nunca uma re-serialização: JSON.stringify não é canônico entre linguagens e
 * o JSONB do PostgreSQL reordena chaves. Quem verifica decodifica os bytes que
 * foram assinados e só usa o evento que está DENTRO deles.
 *
 * Este módulo é só formato e criptografia. Ele NÃO decide se o produtor está
 * autorizado, para qual unidade, tipo ou modo: isso é da fronteira da
 * plataforma, contra um registro que o produtor não controla. Assinatura
 * válida prova posse da chave, não autoridade sobre o mundo.
 *
 * Prefixo, audiência e escopo próprios: um token de delegação do piloto
 * (`pt1`, credencial do ATOR) nunca serve como atestação do PRODUTOR do feed,
 * e vice-versa.
 */
import {
  createPublicKey,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import type { EntregasPublicEvent } from "./events/types";

export const PRODUCER_ATTESTATION_PREFIX = "pa1";
export const PRODUCER_ATTESTATION_VERSION = "producer-attestation@1";
export const PRODUCER_ATTESTATION_AUDIENCE = "deliveryos-platform-ingest";
export const PRODUCER_ATTESTATION_SCOPE = "entregas:public-event:produce";

/**
 * Tamanho máximo do token inteiro e do JSON de claims decodificado. Os dois
 * precisam caber um no outro: claims no teto, em base64url, mais prefixo e
 * assinatura, ainda ficam abaixo do teto do token — que é também o CHECK da
 * coluna entregas.public_outbox.attestation (0010).
 */
export const PRODUCER_ATTESTATION_MAX_TOKEN = 32_768;
export const PRODUCER_ATTESTATION_MAX_CLAIMS = 24_000;

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const NONCE = /^[0-9a-f]{32}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

/** Prefixo DER de SubjectPublicKeyInfo para Ed25519 (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface ProducerAttestationClaims {
  readonly v: typeof PRODUCER_ATTESTATION_VERSION;
  readonly aud: typeof PRODUCER_ATTESTATION_AUDIENCE;
  readonly scope: typeof PRODUCER_ATTESTATION_SCOPE;
  readonly producer_id: string;
  readonly kid: string;
  /** Epoch em segundos, relógio do produtor. */
  readonly iat: number;
  /** 128 bits em hex: identidade única deste envelope. */
  readonly nonce: string;
  readonly event: EntregasPublicEvent;
}

export interface AssinanteDeProdutor {
  readonly producer_id: string;
  readonly kid: string;
  assinar(event: EntregasPublicEvent): string;
}

export function idDeProdutorValido(v: unknown): v is string {
  return typeof v === "string" && ID.test(v);
}

export function criarAssinanteDeProdutor(o: {
  producer_id: string;
  kid: string;
  privateKey: KeyObject;
  now?: () => Date;
  nonce?: () => string;
}): AssinanteDeProdutor {
  if (!idDeProdutorValido(o.producer_id)) throw new Error("producer_id_invalido");
  if (!idDeProdutorValido(o.kid)) throw new Error("kid_invalido");
  if (o.privateKey.type !== "private" || o.privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("chave_de_produtor_invalida");
  }
  const now = o.now ?? (() => new Date());
  const nonce = o.nonce ?? (() => randomBytes(16).toString("hex"));
  return {
    producer_id: o.producer_id,
    kid: o.kid,
    assinar(event) {
      const claims: ProducerAttestationClaims = {
        v: PRODUCER_ATTESTATION_VERSION,
        aud: PRODUCER_ATTESTATION_AUDIENCE,
        scope: PRODUCER_ATTESTATION_SCOPE,
        producer_id: o.producer_id,
        kid: o.kid,
        iat: Math.floor(now().getTime() / 1000),
        nonce: nonce(),
        // Cópia JSON: o que é assinado é exatamente o que viaja.
        event: JSON.parse(JSON.stringify(event)) as EntregasPublicEvent,
      };
      const corpo = Buffer.from(JSON.stringify(claims), "utf8");
      if (corpo.length > PRODUCER_ATTESTATION_MAX_CLAIMS) {
        throw new Error("evento_grande_demais_para_atestar");
      }
      const segmento = corpo.toString("base64url");
      const assinatura = sign(
        null,
        Buffer.from(PRODUCER_ATTESTATION_PREFIX + "." + segmento, "utf8"),
        o.privateKey,
      );
      const token = PRODUCER_ATTESTATION_PREFIX + "." + segmento + "." + assinatura.toString("base64url");
      if (token.length > PRODUCER_ATTESTATION_MAX_TOKEN) throw new Error("evento_grande_demais_para_atestar");
      return token;
    },
  };
}

export type MotivoDeFormato =
  | "atestacao_ausente"
  | "atestacao_formato_invalido"
  | "atestacao_codificacao_invalida"
  | "atestacao_claims_invalidas";

/**
 * Resultado de decodificar SEM confiar: `producer_id` e `kid` só servem para
 * localizar a chave candidata. Nada aqui foi provado ainda.
 */
export type AtestacaoDecodificada =
  | {
      readonly ok: true;
      readonly producer_id: string;
      readonly kid: string;
      readonly bruto: Readonly<Record<string, unknown>>;
      readonly entrada: Buffer;
      readonly assinatura: Buffer;
    }
  | { readonly ok: false; readonly motivo: MotivoDeFormato };

export function decodificarAtestacao(token: unknown): AtestacaoDecodificada {
  if (token === undefined || token === null || token === "") {
    return { ok: false, motivo: "atestacao_ausente" };
  }
  if (typeof token !== "string" || token.length > PRODUCER_ATTESTATION_MAX_TOKEN) {
    return { ok: false, motivo: "atestacao_formato_invalido" };
  }
  const partes = token.split(".");
  if (
    partes.length !== 3 ||
    partes[0] !== PRODUCER_ATTESTATION_PREFIX ||
    !B64URL.test(partes[1]) ||
    !B64URL.test(partes[2])
  ) {
    return { ok: false, motivo: "atestacao_formato_invalido" };
  }
  const corpo = Buffer.from(partes[1], "base64url");
  const assinatura = Buffer.from(partes[2], "base64url");
  // Codificação canônica: dois textos diferentes nunca decodificam iguais.
  if (
    corpo.length > PRODUCER_ATTESTATION_MAX_CLAIMS ||
    assinatura.length !== 64 ||
    corpo.toString("base64url") !== partes[1] ||
    assinatura.toString("base64url") !== partes[2]
  ) {
    return { ok: false, motivo: "atestacao_codificacao_invalida" };
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo.toString("utf8"));
  } catch {
    return { ok: false, motivo: "atestacao_claims_invalidas" };
  }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { ok: false, motivo: "atestacao_claims_invalidas" };
  }
  const c = bruto as Record<string, unknown>;
  if (!idDeProdutorValido(c.producer_id) || !idDeProdutorValido(c.kid)) {
    return { ok: false, motivo: "atestacao_claims_invalidas" };
  }
  return {
    ok: true,
    producer_id: c.producer_id,
    kid: c.kid,
    bruto: c,
    entrada: Buffer.from(PRODUCER_ATTESTATION_PREFIX + "." + partes[1], "utf8"),
    assinatura,
  };
}

/** Verificação criptográfica pura. Qualquer exceção é "não confere". */
export function assinaturaConfere(
  d: Extract<AtestacaoDecodificada, { ok: true }>,
  chave: KeyObject,
): boolean {
  if (chave.type !== "public" || chave.asymmetricKeyType !== "ed25519") return false;
  try {
    return verify(null, d.entrada, chave, d.assinatura);
  } catch {
    return false;
  }
}

/**
 * Contrato das claims, conferido DEPOIS da assinatura. Devolve as claims
 * tipadas ou null; o evento ainda precisa da validação de contrato público.
 */
export function claimsDoContrato(
  bruto: Readonly<Record<string, unknown>>,
): ProducerAttestationClaims | null {
  if (
    bruto.v !== PRODUCER_ATTESTATION_VERSION ||
    bruto.aud !== PRODUCER_ATTESTATION_AUDIENCE ||
    bruto.scope !== PRODUCER_ATTESTATION_SCOPE ||
    !idDeProdutorValido(bruto.producer_id) ||
    !idDeProdutorValido(bruto.kid) ||
    !Number.isSafeInteger(bruto.iat) ||
    (bruto.iat as number) <= 0 ||
    typeof bruto.nonce !== "string" ||
    !NONCE.test(bruto.nonce) ||
    !bruto.event ||
    typeof bruto.event !== "object" ||
    Array.isArray(bruto.event)
  ) {
    return null;
  }
  return bruto as unknown as ProducerAttestationClaims;
}

/** Chave pública Ed25519 a partir dos 32 bytes crus guardados no registro. */
export function chavePublicaEd25519(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new Error("chave_publica_ed25519_tamanho");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(raw)]),
    format: "der",
    type: "spki",
  });
}

export function bytesDaChavePublicaEd25519(chave: KeyObject): Buffer {
  if (chave.asymmetricKeyType !== "ed25519") throw new Error("chave_nao_ed25519");
  const der = chave.export({ format: "der", type: "spki" });
  if (der.length !== 44 || !der.subarray(0, 12).equals(ED25519_SPKI_PREFIX)) {
    throw new Error("chave_spki_inesperada");
  }
  return Buffer.from(der.subarray(12));
}

/**
 * Igualdade de valor JSON independente de ordem de chaves. Propriedade com
 * `undefined` conta como ausente — é o que JSON faria com ela.
 */
export function eventoCanonicoIgual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return typeof a === "number" && typeof b === "number" ? Object.is(a, b) : false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => eventoCanonicoIgual(x, bb[i]));
  }
  const chaves = (o: object) =>
    Object.keys(o).filter((k) => (o as Record<string, unknown>)[k] !== undefined).sort();
  const ka = chaves(a);
  const kb = chaves(b);
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) =>
    eventoCanonicoIgual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
