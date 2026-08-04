/**
 * CONFIANCA DURAVEL — a mesma verdade do dominio, no registro
 * ============================================================================
 * R5-D0-S. O dominio ja distingue `nao_estimada` de `apurada` (D70). O registro
 * duravel ainda trabalhava com `confidence: number`, e a divergencia tinha uma
 * consequencia concreta: uma recomendacao sem numero **passava no validador e
 * morria na hora de gravar**.
 *
 * A REPRESENTACAO NOVA E DISCRIMINADA E VERSIONADA:
 *
 *   confianca_schema: "confianca@2"
 *   confianca: { estado: "nao_estimada" }
 *            | { estado: "apurada", valor, politica, versao_da_politica, evidencias }
 *
 * `confidence` continua sendo escrito **quando apurada**, e so como ESPELHO de
 * leitura — nunca como verdade. Ele saiu de `required` no schema. Um leitor
 * antigo continua enxergando o numero; um leitor novo le a uniao.
 *
 * REGISTROS LEGADOS: um numero gravado antes desta missao **nao tem politica nem
 * evidencias de confianca**. Promove-lo a `apurada` seria inventar as duas
 * coisas. Entao ele nao e promovido: `deConfiancaDuravel` devolve um terceiro
 * ramo, `legado`, que o dominio nao aceita e que ninguem consegue confundir com
 * uma apuracao. Ver D74.
 */

import type { ConfiancaDaRecomendacao } from "./shadow";

/** Versao da representacao duravel da confianca. */
export const CONFIANCA_SCHEMA = "confianca@2";

/** O que vai para o registro. JSON puro. */
export interface ConfiancaDuravel {
  readonly confianca_schema: string;
  readonly confianca: ConfiancaDaRecomendacao;
  /**
   * Espelho de leitura, presente SOMENTE quando apurada. Nunca a verdade — a
   * verdade e `confianca`. Existe para nao quebrar leitor antigo, e sai do
   * `required` do schema exatamente para que a ausencia dele seja legitima.
   */
  readonly confidence?: number;
}

/**
 * Dominio -> registro. Nao arredonda, nao completa, nao converte.
 *
 * `nao_estimada` NAO ganha `confidence`: escrever `null` ali recriaria a
 * ambiguidade que a uniao existe para desfazer, e escrever `0` seria a mentira
 * que I9 proibe.
 */
export function paraConfiancaDuravel(c: ConfiancaDaRecomendacao): ConfiancaDuravel {
  if (c.estado === "nao_estimada") {
    return { confianca_schema: CONFIANCA_SCHEMA, confianca: { estado: "nao_estimada" } };
  }
  return {
    confianca_schema: CONFIANCA_SCHEMA,
    confianca: {
      estado: "apurada",
      valor: c.valor,
      politica: c.politica,
      versao_da_politica: c.versao_da_politica,
      evidencias: [...c.evidencias],
    },
    confidence: c.valor,
  };
}

export type MotivoIncompatibilidadeDuravel =
  | "schema_desconhecido"
  | "estado_desconhecido"
  | "apurada_sem_valor"
  | "apurada_sem_politica"
  | "apurada_sem_evidencias";

/**
 * Registro -> dominio, com o legado ISOLADO num ramo proprio.
 *
 * `legado` nao e `apurada` e nao e `nao_estimada`. Ele existe para que um numero
 * antigo possa ser LIDO e auditado sem nunca ser promovido: falta-lhe politica e
 * faltam-lhe as evidencias que sustentariam a apuracao, e inventar as duas seria
 * exatamente o que D69 recusou.
 */
export type LeituraConfiancaDuravel =
  | { readonly tipo: "ok"; readonly confianca: ConfiancaDaRecomendacao }
  | { readonly tipo: "legado"; readonly valor: number }
  | { readonly tipo: "incompativel"; readonly motivo: MotivoIncompatibilidadeDuravel };

export function deConfiancaDuravel(registro: Record<string, unknown>): LeituraConfiancaDuravel {
  const schema = registro["confianca_schema"];
  const bruta = registro["confianca"];

  // Registro anterior a esta missao: numero solto, sem uniao e sem schema.
  if (schema === undefined && bruta === undefined) {
    const n = registro["confidence"];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) {
      return { tipo: "legado", valor: n };
    }
    return { tipo: "incompativel", motivo: "schema_desconhecido" };
  }
  if (schema !== CONFIANCA_SCHEMA) {
    return { tipo: "incompativel", motivo: "schema_desconhecido" };
  }
  if (bruta === null || typeof bruta !== "object") {
    return { tipo: "incompativel", motivo: "estado_desconhecido" };
  }
  const c = bruta as Record<string, unknown>;
  if (c["estado"] === "nao_estimada") {
    return { tipo: "ok", confianca: { estado: "nao_estimada" } };
  }
  if (c["estado"] !== "apurada") {
    return { tipo: "incompativel", motivo: "estado_desconhecido" };
  }
  const valor = c["valor"];
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 1) {
    return { tipo: "incompativel", motivo: "apurada_sem_valor" };
  }
  const politica = c["politica"];
  const versao = c["versao_da_politica"];
  if (typeof politica !== "string" || politica.trim() === "" ||
      typeof versao !== "string" || versao.trim() === "") {
    return { tipo: "incompativel", motivo: "apurada_sem_politica" };
  }
  const evidencias = c["evidencias"];
  if (!Array.isArray(evidencias) || evidencias.length === 0) {
    return { tipo: "incompativel", motivo: "apurada_sem_evidencias" };
  }
  return {
    tipo: "ok",
    confianca: {
      estado: "apurada",
      valor,
      politica,
      versao_da_politica: versao,
      evidencias: evidencias.map(String),
    },
  };
}
