/**
 * Bootstrap e renovação da credencial de um aparelho.
 *
 * O elo que faltava na cadeia. `device-token.ts` sabe emitir e verificar;
 * `device-auth.ts` sabe decidir se um token vale para ingerir. Nenhum dos dois
 * respondia à primeira pergunta de um aparelho novo: COMO ele consegue o
 * primeiro token sem carregar segredo de assinatura nem credencial humana
 * permanente no APK.
 *
 * A resposta é um segredo PRÓPRIO do aparelho, gerado nele, que só viaja no
 * bootstrap:
 *
 *   o humano AUTORIZA o device_id (linha em identity.device);
 *   o aparelho PROVA que é ele com o segredo;
 *   no primeiro contato de um aparelho autorizado, o servidor VINCULA o hash
 *   do segredo; depois disso, só o mesmo segredo recebe token.
 *
 * Renovar é o mesmo ato: o segredo vale sempre, o token vale um turno. Um
 * token vencido nunca vira problema de campo — o aparelho pede outro com o
 * segredo, e a expiração só governa a ingestão.
 *
 * O que este módulo NÃO faz: I/O, log, relógio próprio. `agora` é injetado, e
 * o registro chega como interface — a decisão é testável sem banco.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { emitirToken, VALIDADE_PADRAO_S, type ClaimsDoDispositivo } from "./device-token";
import type { DispositivoConhecido } from "../ingest/device-ingest";

export const DEVICE_SESSION_VERSION = "device-session@1.0.0";

/** Quem "autorizou" a emissão, nas claims: o vínculo de segredo, não uma pessoa. */
export const EMISSOR_POR_VINCULO = "vinculo-de-segredo";

/** Curto demais é o mesmo que ausente. 32 hex = 128 bits do SecureRandom do Android. */
export const TAMANHO_MINIMO_SEGREDO_DO_APARELHO = 32;

/* ------------------------------------------------------------------ *
 * Registro — o que a rota precisa saber e fazer
 * ------------------------------------------------------------------ */

export interface DispositivoComVinculo extends DispositivoConhecido {
  /** NULL até o primeiro contato. */
  secret_hash?: string | null;
}

export interface RegistroDeSessao {
  buscar(device_id: string): Promise<DispositivoComVinculo | null>;
  /**
   * Vincula o hash SE ainda não há vínculo. Devolve `false` quando alguém
   * vinculou antes — e então quem chama compara com o que ficou gravado.
   * Precisa ser atômico no banco: `WHERE secret_hash IS NULL`.
   */
  vincularSegredo(device_id: string, secret_hash: string, agora: Date): Promise<boolean>;
  /** Marca a emissão: `last_session_at`, `app_version`, e a linha de auditoria. */
  registrarSessao(device_id: string, dados: { app_version?: string; jti: string; agora: Date }): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Pedido e resultado
 * ------------------------------------------------------------------ */

export interface PedidoDeSessao {
  device_id?: unknown;
  device_secret?: unknown;
  app_version?: unknown;
  client?: unknown;
}

export type MotivoDeSessao =
  | "pedido_malformado"
  | "segredo_ausente"
  | "segredo_fraco"
  | "dispositivo_desconhecido"
  | "dispositivo_revogado"
  | "segredo_divergente";

export type InstrucaoDeSessao = "corrigir_cliente" | "aguardar_humano" | "parar_e_avisar";

export type ResultadoDeSessao =
  | {
      ok: true;
      token: string;
      claims: ClaimsDoDispositivo;
      expires_in_s: number;
      /** Verdadeiro só na PRIMEIRA emissão, quando o hash foi vinculado agora. */
      vinculou_agora: boolean;
      dispositivo: DispositivoConhecido;
    }
  | {
      ok: false;
      /**
       * 401 = o aparelho não é (ainda) reconhecido: precisa de humano, mas o
       * cliente continua tentando com folga. 403 = parar: revogado, ou segredo
       * que não é o vinculado. O Android marca 403 como revogação local e
       * para de insistir — por isso "desconhecido" é 401, não 403: um aparelho
       * que o gerente ainda vai cadastrar não pode se trancar sozinho.
       */
      status: 400 | 401 | 403;
      motivo: MotivoDeSessao;
      instrucao: InstrucaoDeSessao;
      preservar_dados_locais: true;
      humano: string;
    };

const HUMANO: Record<MotivoDeSessao, string> = {
  pedido_malformado: "O pedido de sessão veio incompleto.",
  segredo_ausente: "Este aplicativo não apresentou a credencial do aparelho. Atualize o aplicativo.",
  segredo_fraco: "A credencial do aparelho é curta demais. Atualize o aplicativo.",
  dispositivo_desconhecido: "Este aparelho ainda não foi autorizado. Fale com o responsável.",
  dispositivo_revogado: "Este aparelho foi revogado. Fale com o responsável.",
  segredo_divergente: "Este aparelho não é o que foi vinculado a esta identidade. Fale com o responsável.",
};

const INSTRUCAO: Record<MotivoDeSessao, InstrucaoDeSessao> = {
  pedido_malformado: "corrigir_cliente",
  segredo_ausente: "corrigir_cliente",
  segredo_fraco: "corrigir_cliente",
  dispositivo_desconhecido: "aguardar_humano",
  dispositivo_revogado: "parar_e_avisar",
  segredo_divergente: "parar_e_avisar",
};

const STATUS: Record<MotivoDeSessao, 400 | 401 | 403> = {
  pedido_malformado: 400,
  segredo_ausente: 401,
  segredo_fraco: 401,
  dispositivo_desconhecido: 401,
  dispositivo_revogado: 403,
  segredo_divergente: 403,
};

function recusar(motivo: MotivoDeSessao): ResultadoDeSessao {
  return {
    ok: false,
    status: STATUS[motivo],
    motivo,
    instrucao: INSTRUCAO[motivo],
    preservar_dados_locais: true,
    humano: HUMANO[motivo],
  };
}

/* ------------------------------------------------------------------ *
 * Hash e comparação
 * ------------------------------------------------------------------ */

/** O que fica no banco. Nunca o segredo. */
export function hashDoSegredo(segredo: string): string {
  return createHash("sha256").update(segredo, "utf8").digest("hex");
}

function mesmoHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------------ *
 * A decisão
 * ------------------------------------------------------------------ */

export interface OpcoesDeSessao {
  pedido: PedidoDeSessao;
  registro: RegistroDeSessao;
  segredo_de_assinatura: string;
  agora: Date;
  validade_s?: number;
}

/**
 * Emite (ou renova) a credencial de um aparelho.
 *
 * A ORDEM importa: forma do pedido, depois cadastro, depois revogação, depois
 * o segredo. Um aparelho revogado recebe "revogado" e nada sobre o segredo —
 * é assim que um celular perdido sai do ar sem instruções de como voltar.
 */
export async function emitirSessaoDeAparelho(o: OpcoesDeSessao): Promise<ResultadoDeSessao> {
  const device_id = typeof o.pedido.device_id === "string" ? o.pedido.device_id.trim() : "";
  if (!device_id) return recusar("pedido_malformado");

  const segredo = typeof o.pedido.device_secret === "string" ? o.pedido.device_secret.trim() : "";
  if (!segredo) return recusar("segredo_ausente");
  if (segredo.length < TAMANHO_MINIMO_SEGREDO_DO_APARELHO) return recusar("segredo_fraco");

  const dispositivo = await o.registro.buscar(device_id);
  if (!dispositivo) return recusar("dispositivo_desconhecido");
  if (dispositivo.revoked_at) return recusar("dispositivo_revogado");

  const hash = hashDoSegredo(segredo);
  let vinculou_agora = false;
  if (!dispositivo.secret_hash) {
    // Primeiro contato. O UPDATE condicional é a única proteção contra dois
    // primeiros contatos simultâneos: quem perde relê e compara.
    vinculou_agora = await o.registro.vincularSegredo(device_id, hash, o.agora);
    if (!vinculou_agora) {
      const relido = await o.registro.buscar(device_id);
      if (!relido?.secret_hash || !mesmoHash(relido.secret_hash, hash)) return recusar("segredo_divergente");
    }
  } else if (!mesmoHash(dispositivo.secret_hash, hash)) {
    return recusar("segredo_divergente");
  }

  const { token, claims } = emitirToken({
    device_id: dispositivo.device_id,
    // A unidade vem do CADASTRO, nunca do pedido: o aparelho não escolhe loja.
    unit_id: dispositivo.unit_id,
    actor_id: dispositivo.actor_id,
    issued_by: EMISSOR_POR_VINCULO,
    agora: o.agora,
    validade_s: o.validade_s ?? VALIDADE_PADRAO_S,
    segredo: o.segredo_de_assinatura,
  });

  await o.registro.registrarSessao(device_id, {
    app_version: typeof o.pedido.app_version === "string" ? o.pedido.app_version.slice(0, 64) : undefined,
    jti: claims.jti,
    agora: o.agora,
  });

  return {
    ok: true,
    token,
    claims,
    expires_in_s: claims.exp - claims.iat,
    vinculou_agora,
    dispositivo: {
      device_id: dispositivo.device_id,
      unit_id: dispositivo.unit_id,
      actor_id: dispositivo.actor_id,
      revoked_at: null,
    },
  };
}

/**
 * Corpo da resposta de sucesso — o que o `DeviceSession.kt` lê.
 *
 * `device_token` e `expires_in_s` são os campos que o Android já consome;
 * `expires_at` é o mesmo instante em ISO, para quem preferir não somar.
 * NUNCA inclui o segredo do aparelho nem o segredo de assinatura.
 */
export function corpoDeSessao(r: Extract<ResultadoDeSessao, { ok: true }>): Record<string, unknown> {
  return {
    ok: true,
    device_token: r.token,
    expires_in_s: r.expires_in_s,
    expires_at: new Date(r.claims.exp * 1000).toISOString(),
    device_id: r.dispositivo.device_id,
    unit_id: r.dispositivo.unit_id,
    actor_id: r.dispositivo.actor_id ?? null,
    vinculado_agora: r.vinculou_agora,
    api_version: DEVICE_SESSION_VERSION,
  };
}
