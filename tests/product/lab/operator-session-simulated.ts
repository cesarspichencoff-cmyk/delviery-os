/**
 * SOMENTE TESTE: sistema de sessao EFEMERO e integralmente FICTICIO.
 * Nao verifica IdP, login, senha ou colaborador real; nao importavel em prod.
 * A emissao representa atestacao simulada pela propria suite de testes.
 */
import { createHash, randomBytes } from "node:crypto";

export interface AtorFicticio {
  readonly subject_id: string;
  readonly ativo: boolean;
  readonly unidades: readonly string[];
  readonly revisao_autorizacao: number;
}
export interface AtestacaoFicticia {
  readonly modo: "LAB_SYNTHETIC_ONLY";
  readonly subject_id: string;
}
interface SessaoInterna {
  readonly subject_id: string;
  readonly unidade: string;
  readonly revisao_autorizacao: number;
  readonly ate_ms: number;
}
export type DecisaoSessao =
  | { readonly autorizado: true; readonly subject_id: string; readonly unidade: string }
  | { readonly autorizado: false; readonly status: 401 | 403; readonly motivo: string };

export const COOKIE_LAB = "__Host-deliveryos_session";
const TTL_MAX_MS = 10 * 60 * 1000;
const HASH_COOKIE = /^[0-9a-f]{64}$/;
function digest(v: string): string { return createHash("sha256").update(v).digest("hex"); }

export function criarRegistroDeSessoesFicticias(
  cadastro: ReadonlyMap<string, AtorFicticio>,
  ttl_ms = TTL_MAX_MS,
) {
  if (!Number.isSafeInteger(ttl_ms) || ttl_ms <= 0 || ttl_ms > TTL_MAX_MS) {
    throw Error("LAB_SESSION_TTL_INVALID");
  }
  const sessoes = new Map<string, SessaoInterna>();

  function emitir(atestacao: AtestacaoFicticia, unidade: string, agora_ms: number) {
    if (atestacao.modo !== "LAB_SYNTHETIC_ONLY" ||
        !Number.isFinite(agora_ms) ||
        !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(unidade)) throw Error("LAB_ATTESTATION_INVALID");
    const pessoa = cadastro.get(atestacao.subject_id);
    if (!pessoa?.ativo || !pessoa.unidades.includes(unidade)) throw Error("LAB_GRANT_REQUIRED");
    const token = randomBytes(32).toString("hex");
    sessoes.set(digest(token), {
      subject_id: pessoa.subject_id, unidade,
      revisao_autorizacao: pessoa.revisao_autorizacao,
      ate_ms: agora_ms + ttl_ms,
    });
    // Simula cabecalho HTTP sem disponibilizar token em pagina ou JSON.
    return {
      token_apenas_para_harness: token,
      set_cookie: `${COOKIE_LAB}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.ceil(ttl_ms / 1000)}`,
    };
  }
  function cookieEstrito(cabecalho: string | undefined): string | null {
    if (typeof cabecalho !== "string" || cabecalho.length > 4096) return null;
    const campos = cabecalho.split(";");
    const alvos = campos.map((v) => v.trim())
      .filter((v) => v.startsWith(COOKIE_LAB + "="));
    if (alvos.length !== 1) return null;
    const valor = alvos[0].slice(COOKIE_LAB.length + 1);
    return HASH_COOKIE.test(valor) ? valor : null;
  }
  function verificar(cabecalho: string | undefined, agora_ms: number): DecisaoSessao {
    const token = cookieEstrito(cabecalho);
    if (!token || !Number.isFinite(agora_ms)) {
      return { autorizado: false, status: 401, motivo: "sessao_ausente_ou_invalida" };
    }
    const chave = digest(token);
    const sessao = sessoes.get(chave);
    if (!sessao || agora_ms >= sessao.ate_ms) {
      if (sessao) sessoes.delete(chave);
      return { autorizado: false, status: 401, motivo: "sessao_expirada_ou_revogada" };
    }
    const pessoa = cadastro.get(sessao.subject_id);
    if (!pessoa?.ativo || pessoa.revisao_autorizacao !== sessao.revisao_autorizacao ||
        !pessoa.unidades.includes(sessao.unidade)) {
      sessoes.delete(chave);
      return { autorizado: false, status: 403, motivo: "vinculo_revogado" };
    }
    return { autorizado: true, subject_id: sessao.subject_id, unidade: sessao.unidade };
  }
  function revogar(token: string): void {
    if (HASH_COOKIE.test(token)) sessoes.delete(digest(token));
  }
  return { emitir, verificar, revogar };
}
