/**
 * LAB · MODO DE VALIDAÇÃO — o contrato do registro
 * ============================================================================
 * EXPERIMENTAL, LOCAL, NÃO AUTENTICADO, NÃO SINCRONIZADO.
 *
 * Este módulo é JavaScript puro de propósito: ele roda igual no navegador e no
 * Node, então o gate consegue testar a REGRA sem navegador, e o Playwright
 * testa a PERSISTÊNCIA com navegador. Nenhuma das duas metades fica sem prova.
 *
 * O que ele NÃO faz, e não é omissão: não fala com servidor, não identifica
 * ninguém, não sincroniza e não afirma nada sobre operação. O servidor do Lab
 * recusa qualquer método que não seja GET ou HEAD — D38 e B7 continuam
 * valendo, e a validação humana existe sem precisar quebrá-los.
 */

export const SCHEMA = "deliveryos-lab-validation@1";

/** O ator. Não é identidade autenticada, e o nome existe para lembrar disso. */
export const ATOR = "LOCAL_ANONYMOUS_VALIDATOR";

/** Os quatro vereditos que a missão fixa. Nada além destes é aceito. */
export const VEREDITOS = ["CORRECT", "PARTIALLY_CORRECT", "INCORRECT", "UNCONFIRMED"];

export const ROTULO_VEREDITO = {
  CORRECT: "Correto",
  PARTIALLY_CORRECT: "Parcialmente correto",
  INCORRECT: "Incorreto",
  UNCONFIRMED: "Não consigo confirmar",
};

/**
 * As correções que a operação pode registrar. Vieram da missão §9, e são
 * fechadas: texto livre entra em `correcao_texto`, separado, porque motivo
 * tipado é contável e frase solta não é.
 */
export const CORRECOES = [
  "praca_correta",
  "pedido_ja_concluido",
  "reimpressao",
  "cancelamento",
  "fonte_desatualizada",
  "interpretacao_correta",
];

export const ROTULO_CORRECAO = {
  praca_correta: "A praça certa era outra",
  pedido_ja_concluido: "O pedido já estava concluído",
  reimpressao: "Era reimpressão",
  cancelamento: "O pedido foi cancelado",
  fonte_desatualizada: "A fonte estava desatualizada",
  interpretacao_correta: "A leitura estava certa, a conclusão é que não",
};

export const UTILIDADES = ["ajudou", "indiferente", "atrapalhou"];

export const ROTULO_UTILIDADE = {
  ajudou: "Ajudou",
  indiferente: "Tanto faz",
  atrapalhou: "Atrapalhou",
};

/** O sistema avisou antes, junto, ou depois de a pessoa já ter percebido. */
export const ANTECEDENCIAS = ["antes", "junto", "depois"];

export const ROTULO_ANTECEDENCIA = {
  antes: "Avisou antes de eu perceber",
  junto: "Avisou junto",
  depois: "Eu já sabia antes",
};

/**
 * Os sete estados que a interface mostra. Quatro vêm do veredito; os outros
 * três são situação, não julgamento:
 *
 *   nao_avaliado — ninguém olhou ainda
 *   corrigido    — houve veredito E houve correção registrada
 *   expirado     — a validade da leitura venceu antes de alguém confirmar
 */
export const ESTADOS_DE_VALIDACAO = [
  "nao_avaliado",
  "correto",
  "parcialmente_correto",
  "incorreto",
  "nao_confirmado",
  "corrigido",
  "expirado",
];

export const ROTULO_ESTADO = {
  nao_avaliado: "Não avaliado",
  correto: "Correto",
  parcialmente_correto: "Parcialmente correto",
  incorreto: "Incorreto",
  nao_confirmado: "Não confirmado",
  corrigido: "Corrigido",
  expirado: "Expirado",
};

const POR_VEREDITO = {
  CORRECT: "correto",
  PARTIALLY_CORRECT: "parcialmente_correto",
  INCORRECT: "incorreto",
  UNCONFIRMED: "nao_confirmado",
};

/**
 * O estado que a tela mostra para uma leitura.
 *
 * A ordem das perguntas é deliberada:
 *
 *   1. expirou sem ninguém avaliar  -> `expirado`
 *   2. ninguém avaliou              -> `nao_avaliado`
 *   3. avaliou e corrigiu           -> `corrigido`
 *   4. avaliou                      -> o veredito
 *
 * Expiração vem antes de tudo porque leitura vencida não é acerto nem erro, e
 * tratá-la como "não avaliado" apagaria a informação de que a janela passou.
 * Mas expiração NÃO apaga um veredito já dado: quem confirmou dentro da
 * validade confirmou, e o relógio não desfaz isso.
 */
export function estadoDeValidacao(registro, { validadeVencida = false } = {}) {
  if (registro === null || registro === undefined) {
    return validadeVencida ? "expirado" : "nao_avaliado";
  }
  if (registro.correcoes.length > 0 || registro.correcao_texto !== null) {
    return "corrigido";
  }
  return POR_VEREDITO[registro.verdict] ?? "nao_avaliado";
}

/** `true` quando `validade_ate` é anterior ao instante da leitura. */
export function validadeVencida(validadeAte, observadoEm) {
  if (typeof validadeAte !== "string" || typeof observadoEm !== "string") return false;
  return Date.parse(validadeAte) < Date.parse(observadoEm);
}

/* ================================================================== *
 * Construção do registro
 * ================================================================== */

function agora() {
  return new Date().toISOString();
}

/**
 * Um id estável e opaco. `crypto.randomUUID` existe no navegador e no Node 24;
 * o caminho alternativo existe para o caso de a página ser servida por origem
 * sem contexto seguro, onde `crypto` pode não estar completo.
 */
export function novoId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `val-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Monta um registro de validação.
 *
 * Toda entrada é normalizada aqui, num lugar só: veredito fora da lista é
 * recusado, correção desconhecida é descartada, e texto é limitado. A marcação
 * de procedência não é parâmetro — ela é literal, porque um registro que
 * pudesse se declarar sincronizado ou autenticado mentiria sobre o que é.
 */
export function montarRegistro(entrada) {
  const {
    scenario_id,
    reading_id,
    alvo = "leitura",
    verdict,
    correcoes = [],
    correcao_texto = null,
    acao_mais_util = null,
    problema_nao_detectado = null,
    comentario = null,
    utilidade = null,
    antecedencia = null,
    contexto = {},
    versao_fixture,
    validation_id = null,
    created_at = null,
  } = entrada;

  if (!VEREDITOS.includes(verdict)) {
    throw new Error(`Veredito fora do contrato: ${String(verdict)}`);
  }
  if (typeof scenario_id !== "string" || scenario_id.length === 0) {
    throw new Error("Registro sem cenário não pode existir.");
  }
  if (typeof reading_id !== "string" || reading_id.length === 0) {
    throw new Error("Registro sem leitura avaliada não pode existir.");
  }
  if (alvo !== "leitura" && alvo !== "recomendacao") {
    throw new Error(`Alvo fora do contrato: ${String(alvo)}`);
  }

  const t = agora();
  return {
    schema: SCHEMA,
    validation_id: validation_id ?? novoId(),
    scenario_id,
    reading_id,
    alvo,
    verdict,
    correcoes: correcoes.filter((c) => CORRECOES.includes(c)),
    correcao_texto: texto(correcao_texto, 280),
    acao_mais_util: texto(acao_mais_util, 280),
    problema_nao_detectado: texto(problema_nao_detectado, 280),
    comentario: texto(comentario, 280),
    utilidade: UTILIDADES.includes(utilidade) ? utilidade : null,
    antecedencia: ANTECEDENCIAS.includes(antecedencia) ? antecedencia : null,
    contexto: {
      unidade_id: typeof contexto.unidade_id === "string" ? contexto.unidade_id : null,
      fonte_id: typeof contexto.fonte_id === "string" ? contexto.fonte_id : null,
    },
    versao_fixture: typeof versao_fixture === "string" ? versao_fixture : "desconhecida",
    ator: ATOR,
    created_at: created_at ?? t,
    updated_at: t,
    // Literal, nunca parâmetro. Um registro não pode se declarar outra coisa.
    marcacao: {
      local: true,
      experimental: true,
      autenticado: false,
      sincronizado: false,
      origem: "fixture",
    },
  };
}

function texto(v, max) {
  if (typeof v !== "string") return null;
  const limpo = v.trim();
  if (limpo.length === 0) return null;
  return limpo.slice(0, max);
}

/** O aviso que a interface exibe permanentemente. Escrito uma vez, aqui. */
export const AVISO_PERMANENTE =
  "Validação experimental salva somente neste navegador. Não está sincronizada e não identifica o usuário.";
