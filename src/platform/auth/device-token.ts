/**
 * Credencial de dispositivo.
 *
 * Um aparelho em campo não pode depender de uma sessão guardada na memória do
 * servidor: o piloto já perde estado em memória ao reiniciar, e um motoboy na
 * rua não tem como refazer login no meio da entrega. Então o token é
 * **assinado e autocontido** — o servidor o verifica sem consultar nada.
 *
 * A separação que faz isso funcionar:
 *
 *   o token prova QUEM é o aparelho;
 *   o registro decide se ele AINDA pode falar.
 *
 * Revogação continua imediata sem precisar rastrear token emitido: mesmo com um
 * token válido e dentro da validade, o aparelho revogado é recusado na consulta
 * ao registro. Guardar lista de tokens revogados seria estado a mais para
 * sincronizar, e estado que, se ficar velho, deixa entrar quem já não devia.
 *
 * O que este arquivo NÃO faz: I/O, log, e qualquer coisa com relógio próprio.
 * `agora` é sempre injetado — senão não há como testar expiração sem esperar.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEVICE_TOKEN_VERSION = "device-token@1.0.0";

/** Validade padrão. Longa o bastante para um turno inteiro sem renovar. */
export const VALIDADE_PADRAO_S = 12 * 60 * 60;

/* ------------------------------------------------------------------ *
 * Claims
 * ------------------------------------------------------------------ */

export interface ClaimsDoDispositivo {
  /** Aparelho a que este token pertence. */
  device_id: string;
  /** Unidade. O servidor recusa lote de outra unidade mesmo com token válido. */
  unit_id: string;
  /** Quem autorizou a emissão — o humano que fez login. */
  issued_by: string;
  /** Motoboy associado, quando o cadastro souber. */
  actor_id?: string;
  /** Emitido em (epoch, segundos). */
  iat: number;
  /** Expira em (epoch, segundos). */
  exp: number;
  /**
   * Identificador único da emissão.
   *
   * Não é usado para revogar — revogação é no registro. Serve para auditoria
   * conseguir dizer QUAL emissão foi usada, sem que o log precise carregar o
   * token inteiro.
   */
  jti: string;
  v: string;
}

/* ------------------------------------------------------------------ *
 * Segredo
 * ------------------------------------------------------------------ */

export class SegredoAusente extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "SegredoAusente";
  }
}

/** Curto demais é o mesmo que ausente, e é mais perigoso porque parece existir. */
export const TAMANHO_MINIMO_SEGREDO = 32;

/**
 * Lê o segredo do ambiente.
 *
 * Falha fechada: sem segredo, o processo não emite nem verifica nada. A
 * alternativa — gerar um segredo aleatório no boot — pareceria funcionar e
 * invalidaria todos os tokens a cada reinício, derrubando o campo inteiro sem
 * ninguém entender por quê.
 */
export function lerSegredo(env: NodeJS.ProcessEnv = process.env): string {
  const s = (env.DELIVERYOS_DEVICE_TOKEN_SECRET ?? "").trim();
  if (!s) {
    throw new SegredoAusente(
      "DELIVERYOS_DEVICE_TOKEN_SECRET ausente — nenhum token de aparelho pode ser emitido ou verificado",
    );
  }
  if (s.length < TAMANHO_MINIMO_SEGREDO) {
    throw new SegredoAusente(
      `DELIVERYOS_DEVICE_TOKEN_SECRET tem ${s.length} caracteres; mínimo ${TAMANHO_MINIMO_SEGREDO}`,
    );
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Emissão
 * ------------------------------------------------------------------ */

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function assinar(corpo: string, segredo: string): string {
  return base64url(createHmac("sha256", segredo).update(corpo).digest());
}

export interface OpcoesEmissao {
  device_id: string;
  unit_id: string;
  issued_by: string;
  actor_id?: string;
  agora: Date;
  validade_s?: number;
  segredo: string;
  /** Injetável só para teste tornar o `jti` determinístico. */
  jti?: string;
}

/**
 * Emite um token.
 *
 * O formato é `corpo.assinatura`, ambos base64url. Não é JWT de propósito: JWT
 * traz um campo `alg` que o verificador é tentado a obedecer, e obedecer a
 * `alg: none` é uma das falhas de autenticação mais repetidas que existem.
 * Aqui o algoritmo é fixo no código e não é negociável pelo token.
 */
export function emitirToken(o: OpcoesEmissao): { token: string; claims: ClaimsDoDispositivo } {
  if (!o.device_id?.trim()) throw new Error("device_id obrigatório");
  if (!o.unit_id?.trim()) throw new Error("unit_id obrigatório");
  if (!o.issued_by?.trim()) throw new Error("issued_by obrigatório");

  const iat = Math.floor(o.agora.getTime() / 1000);
  const claims: ClaimsDoDispositivo = {
    device_id: o.device_id,
    unit_id: o.unit_id,
    issued_by: o.issued_by,
    actor_id: o.actor_id,
    iat,
    exp: iat + (o.validade_s ?? VALIDADE_PADRAO_S),
    jti: o.jti ?? base64url(createHmac("sha256", o.segredo).update(`${o.device_id}|${iat}`).digest()).slice(0, 16),
    v: DEVICE_TOKEN_VERSION,
  };

  const corpo = base64url(Buffer.from(JSON.stringify(claims), "utf8"));
  return { token: `${corpo}.${assinar(corpo, o.segredo)}`, claims };
}

/* ------------------------------------------------------------------ *
 * Verificação
 * ------------------------------------------------------------------ */

/**
 * Motivos de recusa.
 *
 * A distinção entre `expirado` e `invalido` é o que permite ao aparelho saber
 * se vale a pena renovar. Um cliente que trata os dois igual ou desiste cedo
 * demais, ou insiste para sempre com uma credencial que nunca vai funcionar.
 */
export type RecusaDeToken =
  | "ausente"
  | "malformado"
  | "assinatura_invalida"
  | "expirado"
  | "versao_incompativel";

export type VerificacaoDeToken =
  | { ok: true; claims: ClaimsDoDispositivo }
  | { ok: false; recusa: RecusaDeToken; detalhe: string };

/**
 * Verifica um token.
 *
 * A assinatura é conferida ANTES de qualquer coisa que dependa do conteúdo —
 * inclusive antes de olhar a expiração. Ler claims de um token não verificado e
 * decidir com base neles é confiar no que o atacante escreveu.
 */
export function verificarToken(
  token: string | null | undefined,
  segredo: string,
  agora: Date,
): VerificacaoDeToken {
  if (!token?.trim()) {
    return { ok: false, recusa: "ausente", detalhe: "sem credencial" };
  }

  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) {
    return { ok: false, recusa: "malformado", detalhe: "formato inesperado" };
  }
  const [corpo, assinatura] = partes;

  const esperada = assinar(corpo, segredo);
  const a = Buffer.from(assinatura, "utf8");
  const b = Buffer.from(esperada, "utf8");
  // Comparação de tempo constante. `===` vaza, pelo tempo de resposta, quantos
  // bytes iniciais o atacante acertou — e isso é suficiente para descobrir a
  // assinatura byte a byte.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, recusa: "assinatura_invalida", detalhe: "assinatura não confere" };
  }

  let claims: ClaimsDoDispositivo;
  try {
    claims = JSON.parse(deBase64url(corpo).toString("utf8")) as ClaimsDoDispositivo;
  } catch {
    return { ok: false, recusa: "malformado", detalhe: "corpo ilegível" };
  }

  if (typeof claims.v !== "string" || claims.v.split("@")[0] !== DEVICE_TOKEN_VERSION.split("@")[0]) {
    return { ok: false, recusa: "versao_incompativel", detalhe: `versão ${String(claims.v)}` };
  }
  if (!claims.device_id || !claims.unit_id) {
    return { ok: false, recusa: "malformado", detalhe: "claims incompletas" };
  }
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") {
    return { ok: false, recusa: "malformado", detalhe: "carimbos ausentes" };
  }

  const agoraS = Math.floor(agora.getTime() / 1000);
  if (agoraS >= claims.exp) {
    return {
      ok: false,
      recusa: "expirado",
      detalhe: `expirou em ${new Date(claims.exp * 1000).toISOString()}`,
    };
  }

  return { ok: true, claims };
}

/* ------------------------------------------------------------------ *
 * Renovação
 * ------------------------------------------------------------------ */

/** Renova com folga: esperar expirar deixa o aparelho sem credencial em campo. */
export const FOLGA_DE_RENOVACAO_S = 60 * 60;

export function precisaRenovar(
  claims: ClaimsDoDispositivo,
  agora: Date,
  folga_s = FOLGA_DE_RENOVACAO_S,
): boolean {
  return Math.floor(agora.getTime() / 1000) >= claims.exp - folga_s;
}

/* ------------------------------------------------------------------ *
 * Log seguro
 * ------------------------------------------------------------------ */

/**
 * O que pode aparecer em log.
 *
 * Um token em log é um token em toda ferramenta de observabilidade que colete
 * aquele log, e em todo backup dele. O `jti` identifica a emissão para
 * auditoria sem permitir que ninguém a use.
 */
export function paraLog(claims: ClaimsDoDispositivo): Record<string, string> {
  return {
    device_id: claims.device_id,
    unit_id: claims.unit_id,
    jti: claims.jti,
    expira_em: new Date(claims.exp * 1000).toISOString(),
  };
}

/**
 * Remove qualquer token de um texto antes de ele virar log ou mensagem de erro.
 *
 * O caminho mais comum de vazamento não é alguém logar o token de propósito: é
 * o token vir dentro do corpo de uma resposta de erro que alguém repassou
 * inteira para a mensagem de falha.
 */
export function limparSegredos(texto: string): string {
  return texto
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[token removido]")
    .replace(/(bearer\s+)\S+/gi, "$1[removido]")
    .replace(/("?(?:token|authorization|secret|senha|password)"?\s*[:=]\s*"?)[^",;\s}]+/gi, "$1[removido]");
}
