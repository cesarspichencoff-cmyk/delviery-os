/**
 * G0/G4 SHADOW LAB: barreira de uma unidade para leitura HTTP local.
 * Nao implementa login humano nem credencial para navegador. Sem proxy
 * confiavel de identidade, NAO utilizar em rede ou piloto operacional.
 */
import { timingSafeEqual } from "node:crypto";

export interface EscopoApiShadow {
  readonly unit_id: string;
  /** Segredo somente em memoria do processo, nunca em resposta/HTML/log. */
  readonly segredo: Buffer;
}

export function configurarEscopoShadow(env: NodeJS.ProcessEnv): EscopoApiShadow | null {
  const modo = (env.DELIVERYOS_PRODUCT_SCOPE_MODE ?? "").trim();
  const unidade = (env.DELIVERYOS_PRODUCT_SCOPE_UNIT ?? "").trim();
  const token = (env.DELIVERYOS_PRODUCT_SCOPE_TOKEN ?? "").trim();
  if (!modo && !unidade && !token) return null;
  if (modo !== "shadow_lab" ||
      !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(unidade) ||
      !/^[0-9a-fA-F]{64}$/.test(token) ||
      (env.DELIVERYOS_DATABASE_URL ?? "").trim() === "" ||
      (env.DELIVERYOS_PRODUCT_READ_UNIT ?? "").trim() !== unidade ||
      (env.CONFERENCE_BRAIN_DATA_DIR ?? "").trim() !== "" ||
      (env.TATA_READER_INSTALL_ROOT ?? "").trim() !== "") {
    throw new Error("SHADOW_SCOPE_CONFIG_INVALID: banco, modo, unidade e segredo exigidos; stores externos proibidos");
  }
  return { unit_id: unidade, segredo: Buffer.from(token, "hex") };
}

export type DecisaoEscopo = { autorizado: true } |
  { autorizado: false; status: 401 | 403; erro: string };

export function checarAcessoEscopado(
  escopo: EscopoApiShadow,
  url: URL,
  authorization: string | undefined,
): DecisaoEscopo {
  // Credenciais do cliente nunca sao inferidas de query, cookie ou unidade.
  const recebido = typeof authorization === "string" && /^Bearer [0-9a-fA-F]{64}$/.test(authorization)
    ? Buffer.from(authorization.slice(7), "hex")
    : null;
  if (!recebido || !timingSafeEqual(recebido, escopo.segredo)) {
    return { autorizado: false, status: 401, erro: "autenticacao_necessaria" };
  }

  const parametros: Readonly<Record<string, "unidade" | "unit_id" | null>> = {
    "/api/health": null,
    "/api/entregas": "unidade",
    "/api/copiloto": "unit_id",
  };
  if (!Object.prototype.hasOwnProperty.call(parametros, url.pathname)) {
    return { autorizado: false, status: 403, erro: "rota_fora_do_escopo" };
  }
  const chave = parametros[url.pathname];
  if (chave && url.searchParams.has(chave)) {
    const unidades = url.searchParams.getAll(chave);
    if (unidades.length !== 1 || unidades[0] !== escopo.unit_id) {
      return { autorizado: false, status: 403, erro: "unidade_fora_do_escopo" };
    }
  }
  // Nenhum outro parametro pode atuar como seletor implícito de unidade.
  if ((chave !== "unit_id" && url.searchParams.has("unit_id")) ||
      (chave !== "unidade" && url.searchParams.has("unidade"))) {
    return { autorizado: false, status: 403, erro: "unidade_fora_do_escopo" };
  }
  return { autorizado: true };
}
