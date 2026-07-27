/**
 * Decisão de autenticação de um aparelho.
 *
 * Junta as duas metades que ficam de propósito separadas: o token diz QUEM é, o
 * registro diz se AINDA pode falar. Nenhuma das duas basta sozinha — um token
 * válido de um aparelho roubado precisa ser recusado, e um aparelho autorizado
 * sem credencial também.
 *
 * O valor deste módulo está na TAXONOMIA da recusa. Hoje o Android trata todo
 * 4xx como rejeição definitiva, e por isso um 401 apaga a chance de reenviar um
 * ponto de GPS para sempre. A diferença entre "sua credencial venceu" e "seu
 * lote está malformado" é a diferença entre recuperar e perder.
 */

import type { DispositivoConhecido, RegistroDeDispositivos } from "../ingest/device-ingest";
import { verificarToken, type ClaimsDoDispositivo, type RecusaDeToken } from "./device-token";

/**
 * O que aconteceu, do ponto de vista de quem vai decidir o que fazer.
 *
 * `renovavel` é o campo que o cliente lê: ele diz "tente de novo depois de
 * autenticar", e é o que impede o descarte silencioso.
 */
export type ResultadoAutenticacao =
  | { ok: true; claims: ClaimsDoDispositivo; dispositivo: DispositivoConhecido }
  | {
      ok: false;
      motivo: MotivoRecusa;
      /** Vale a pena autenticar de novo e repetir? */
      renovavel: boolean;
      /** O aparelho deve parar de tentar até intervenção humana? */
      terminal: boolean;
      status: 401 | 403;
      detalhe: string;
    };

export type MotivoRecusa =
  | "credencial_ausente"
  | "credencial_invalida"
  | "credencial_expirada"
  | "dispositivo_desconhecido"
  | "dispositivo_revogado"
  | "unidade_divergente";

/** Como cada recusa de token vira uma decisão operacional. */
const DE_TOKEN: Record<RecusaDeToken, { motivo: MotivoRecusa; renovavel: boolean }> = {
  ausente: { motivo: "credencial_ausente", renovavel: true },
  malformado: { motivo: "credencial_invalida", renovavel: true },
  assinatura_invalida: { motivo: "credencial_invalida", renovavel: true },
  // Expirado é o caso normal de um turno longo, não um incidente.
  expirado: { motivo: "credencial_expirada", renovavel: true },
  // Versão incompatível é renovável porque o servidor pode ter sido atualizado
  // e o aparelho ainda carregar um token do formato antigo.
  versao_incompativel: { motivo: "credencial_invalida", renovavel: true },
};

export interface OpcoesAutenticacao {
  /** Valor bruto do header Authorization, ou o token puro. */
  authorization: string | null | undefined;
  segredo: string;
  registro: RegistroDeDispositivos;
  agora: Date;
  /** Quando informado, o lote precisa pertencer a esta unidade. */
  unidade_esperada?: string;
}

/** Extrai o token de `Bearer <token>`, tolerando o token puro. */
export function extrairBearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const t = authorization.trim();
  const m = /^bearer\s+(.+)$/i.exec(t);
  return (m ? m[1] : t).trim() || null;
}

/**
 * Autentica.
 *
 * A ORDEM importa e é a mesma do envelope de dispositivo: credencial primeiro,
 * depois cadastro, depois revogação, depois unidade. Um aparelho revogado
 * recebe "revogado" e não recebe pista de o que mais estaria errado — é assim
 * que um celular perdido sai do ar sem instruções de como voltar.
 */
export async function autenticarDispositivo(
  o: OpcoesAutenticacao,
): Promise<ResultadoAutenticacao> {
  const token = extrairBearer(o.authorization);

  const v = verificarToken(token, o.segredo, o.agora);
  if (!v.ok) {
    const { motivo, renovavel } = DE_TOKEN[v.recusa];
    return {
      ok: false,
      motivo,
      renovavel,
      terminal: false,
      status: 401,
      detalhe: v.detalhe,
    };
  }

  const dispositivo = await o.registro.buscar(v.claims.device_id);
  if (!dispositivo) {
    // Token bem assinado de aparelho que não existe mais no cadastro. Não é
    // renovável: autenticar de novo devolveria o mesmo nada.
    return {
      ok: false,
      motivo: "dispositivo_desconhecido",
      renovavel: false,
      terminal: true,
      status: 403,
      detalhe: "aparelho não cadastrado",
    };
  }

  if (dispositivo.revoked_at) {
    return {
      ok: false,
      motivo: "dispositivo_revogado",
      renovavel: false,
      terminal: true,
      status: 403,
      detalhe: "aparelho revogado",
    };
  }

  // A unidade do CADASTRO vence a do token. Um token emitido antes de o
  // aparelho mudar de loja não pode continuar escrevendo na loja antiga.
  if (o.unidade_esperada && dispositivo.unit_id !== o.unidade_esperada) {
    return {
      ok: false,
      motivo: "unidade_divergente",
      renovavel: false,
      terminal: true,
      status: 403,
      detalhe: "aparelho não pertence a esta unidade",
    };
  }
  if (v.claims.unit_id !== dispositivo.unit_id) {
    return {
      ok: false,
      motivo: "unidade_divergente",
      renovavel: true,
      terminal: false,
      status: 403,
      // Renovável: o cadastro mudou e o token ficou velho. Autenticar de novo
      // resolve, e o aparelho não perde nada esperando.
      detalhe: "unidade do token diverge do cadastro",
    };
  }

  return { ok: true, claims: v.claims, dispositivo };
}

/* ------------------------------------------------------------------ *
 * O que o cliente deve fazer
 * ------------------------------------------------------------------ */

/**
 * A instrução que o aparelho recebe junto da recusa.
 *
 * Vai no corpo da resposta porque o código HTTP sozinho não distingue os casos
 * que importam: 403 pode ser "revogado, pare" ou "unidade errada, renove", e
 * tratar os dois igual ou perde dado ou insiste para sempre.
 */
export type InstrucaoCliente = "renovar_e_repetir" | "parar_e_avisar" | "prosseguir";

export function instrucaoPara(r: ResultadoAutenticacao): InstrucaoCliente {
  if (r.ok) return "prosseguir";
  if (r.renovavel) return "renovar_e_repetir";
  return "parar_e_avisar";
}

/**
 * Corpo da resposta de recusa.
 *
 * NUNCA inclui o token, nem eco do header recebido. E `preservar_dados_locais`
 * é sempre `true`: nenhuma falha de autenticação autoriza o aparelho a apagar
 * um ponto de GPS. O dado do campo é insubstituível; a credencial não é.
 */
export function corpoDeRecusa(r: Extract<ResultadoAutenticacao, { ok: false }>): {
  ok: false;
  motivo: MotivoRecusa;
  instrucao: InstrucaoCliente;
  preservar_dados_locais: true;
  humano: string;
} {
  const humano: Record<MotivoRecusa, string> = {
    credencial_ausente: "Este aparelho ainda não foi autenticado.",
    credencial_invalida: "A credencial deste aparelho não é válida. Autentique novamente.",
    credencial_expirada: "A credencial deste aparelho venceu. Autentique novamente.",
    dispositivo_desconhecido: "Este aparelho não está cadastrado. Fale com o responsável.",
    dispositivo_revogado: "Este aparelho foi revogado. Fale com o responsável.",
    unidade_divergente: "Este aparelho não está autorizado para esta unidade.",
  };
  return {
    ok: false,
    motivo: r.motivo,
    instrucao: instrucaoPara(r),
    preservar_dados_locais: true,
    humano: humano[r.motivo],
  };
}
