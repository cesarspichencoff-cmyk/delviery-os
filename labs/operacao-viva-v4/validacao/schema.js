/**
 * LAB · MODO DE VALIDAÇÃO — schema de importação e guarda de PII
 * ============================================================================
 * O arquivo importado vem de FORA. Ele é tratado como dado hostil até provar o
 * contrário: nada dele é executado, nada dele é interpretado como marcação, e
 * campo que não está no contrato é DESCARTADO em vez de copiado adiante.
 *
 * A regra que decide o desenho: **validar não é consertar**. Um importador que
 * "arruma" o arquivo aceita qualquer coisa e vira porta de entrada. Aqui, o que
 * não bate é recusado com motivo, e o que bate entra normalizado pelo mesmo
 * construtor que a interface usa.
 */

import {
  ANTECEDENCIAS,
  CORRECOES,
  SCHEMA,
  UTILIDADES,
  VEREDITOS,
  montarRegistro,
} from "./contrato.js";

export const SCHEMA_EXPORTACAO = "deliveryos-lab-validation-export@1";

/* ================================================================== *
 * PII
 * ================================================================== */

/**
 * O que nunca pode entrar num registro. São padrões, não nomes: procurar por
 * "César" pegaria uma pessoa e deixaria passar todas as outras.
 *
 * A lista é conservadora de propósito — ela recusa em vez de mascarar. Um dado
 * pessoal mascarado ainda esteve no arquivo.
 */
const PADROES_DE_PII = [
  { id: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { id: "cpf", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  { id: "telefone", re: /\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/ },
  { id: "cep", re: /\b\d{5}-?\d{3}\b/ },
  {
    id: "endereco",
    re: /\b(rua|avenida|av\.|alameda|travessa|rodovia)\s+[a-zà-ú]/i,
  },
  { id: "cartao", re: /\b(?:\d[ -]?){13,19}\b/ },
];

/** Marcação e execução. Nada disto tem função num comentário de validação. */
const PADROES_DE_EXECUCAO = [
  { id: "html", re: /<\s*[a-z!/]/i },
  { id: "javascript_uri", re: /javascript\s*:/i },
  { id: "data_uri", re: /data\s*:\s*[a-z]+\/[a-z]+/i },
  { id: "manipulador", re: /\bon[a-z]+\s*=/i },
];

/**
 * Campos ESTRUTURAIS: identificadores opacos, versões e carimbos que o próprio
 * Lab gera. Eles ficam FORA da varredura de PII.
 *
 * Isto não é conveniência — é a correção de dois defeitos reais, e os dois
 * foram encontrados pelo gate, não pela leitura:
 *
 *   `validation_id` é um UUID, e um segmento com oito dígitos seguidos casava
 *   com o padrão de CEP. A exportação recusava pacotes limpos **de vez em
 *   quando**, sem ninguém entender por quê.
 *
 *   `versao_fixture` vale `lab-v4-fixtures@1.0.0`, e um nome com `@` seguido de
 *   semver é indistinguível de um e-mail para qualquer expressão razoável. Esse
 *   era pior: recusava **toda** exportação, sempre.
 *
 * Uma guarda que reprova o caso legítimo ensina a ignorá-la, e aí ela não
 * protege mais nada. O custo do recorte está declarado: alguém poderia esconder
 * um telefone dentro de um identificador importado. Nenhuma tela do Lab exibe
 * identificador, e a varredura de conteúdo EXECUTÁVEL continua valendo em todo
 * campo, sem exceção.
 */
const CHAVES_ESTRUTURAIS = new Set([
  "schema",
  "validation_id",
  "scenario_id",
  "reading_id",
  "versao_fixture",
  "ator",
  "created_at",
  "updated_at",
  "exportado_em",
]);

/**
 * Varre todo texto de um objeto, em profundidade, dizendo de onde cada pedaço
 * veio. A chave também é texto e também é varrida.
 */
function textosDe(valor, chave = null, saida = []) {
  if (typeof valor === "string") {
    saida.push({ texto: valor, chave });
    return saida;
  }
  if (Array.isArray(valor)) {
    for (const v of valor) textosDe(v, chave, saida);
    return saida;
  }
  if (valor !== null && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      saida.push({ texto: k, chave: null });
      textosDe(v, k, saida);
    }
  }
  return saida;
}

/** Os achados de PII de um valor qualquer. Vazio = limpo. */
export function acharPII(valor) {
  const achados = [];
  for (const { texto, chave } of textosDe(valor)) {
    if (chave !== null && CHAVES_ESTRUTURAIS.has(chave)) continue;
    for (const p of PADROES_DE_PII) {
      if (p.re.test(texto) && !achados.includes(p.id)) achados.push(p.id);
    }
  }
  return achados;
}

/**
 * Marcação e execução são procuradas em TODO texto, sem recorte nenhum —
 * inclusive nos campos estruturais. Não existe identificador legítimo que
 * contenha `<script`, e o custo de um falso positivo aqui é zero.
 */
export function acharExecutavel(valor) {
  const achados = [];
  for (const { texto } of textosDe(valor)) {
    for (const p of PADROES_DE_EXECUCAO) {
      if (p.re.test(texto) && !achados.includes(p.id)) achados.push(p.id);
    }
  }
  return achados;
}

/* ================================================================== *
 * Importação
 * ================================================================== */

function recusa(motivo, detalhe) {
  return { ok: false, motivo, detalhe, registros: [] };
}

/**
 * Valida e normaliza um pacote de exportação.
 *
 * Devolve sempre um resultado discriminado — nunca lança, e nunca devolve
 * `null` ambíguo. Quem chama precisa poder mostrar o motivo da recusa.
 */
export function importar(texto) {
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch (e) {
    return recusa("json_invalido", `O arquivo não é JSON válido: ${e.message}`);
  }

  if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) {
    return recusa("formato_invalido", "O arquivo precisa ser um objeto de exportação do Lab.");
  }
  if (bruto.schema !== SCHEMA_EXPORTACAO) {
    return recusa(
      "schema_desconhecido",
      `Este importador só aceita ${SCHEMA_EXPORTACAO}. O arquivo declara "${String(bruto.schema)}".`,
    );
  }
  if (!Array.isArray(bruto.registros)) {
    return recusa("sem_registros", "O pacote não traz a lista de registros.");
  }
  if (bruto.registros.length > 5000) {
    return recusa("pacote_grande_demais", "Mais de 5000 registros — recusado sem ler.");
  }

  const executavel = acharExecutavel(bruto);
  if (executavel.length > 0) {
    return recusa(
      "conteudo_executavel",
      `O arquivo contém marcação ou URI executável (${executavel.join(", ")}). Recusado inteiro.`,
    );
  }

  const pii = acharPII(bruto);
  if (pii.length > 0) {
    return recusa(
      "pii_detectada",
      `O arquivo contém o que parece dado pessoal (${pii.join(", ")}). Recusado inteiro, sem importar nada.`,
    );
  }

  const registros = [];
  for (const [i, r] of bruto.registros.entries()) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) {
      return recusa("registro_invalido", `O registro ${i + 1} não é um objeto.`);
    }
    if (r.schema !== SCHEMA) {
      return recusa(
        "registro_de_outro_schema",
        `O registro ${i + 1} declara "${String(r.schema)}" e este Lab só lê ${SCHEMA}.`,
      );
    }
    if (!VEREDITOS.includes(r.verdict)) {
      return recusa("veredito_invalido", `O registro ${i + 1} traz um veredito fora do contrato.`);
    }
    try {
      // Passa pelo MESMO construtor da interface. Campo fora do contrato não
      // sobrevive à normalização: ele simplesmente não é copiado.
      registros.push(
        montarRegistro({
          scenario_id: r.scenario_id,
          reading_id: r.reading_id,
          alvo: r.alvo === "recomendacao" ? "recomendacao" : "leitura",
          verdict: r.verdict,
          correcoes: Array.isArray(r.correcoes)
            ? r.correcoes.filter((c) => CORRECOES.includes(c))
            : [],
          correcao_texto: r.correcao_texto,
          acao_mais_util: r.acao_mais_util,
          problema_nao_detectado: r.problema_nao_detectado,
          comentario: r.comentario,
          utilidade: UTILIDADES.includes(r.utilidade) ? r.utilidade : null,
          antecedencia: ANTECEDENCIAS.includes(r.antecedencia) ? r.antecedencia : null,
          contexto: r.contexto ?? {},
          versao_fixture: r.versao_fixture,
          validation_id: typeof r.validation_id === "string" ? r.validation_id : null,
          created_at: typeof r.created_at === "string" ? r.created_at : null,
        }),
      );
    } catch (e) {
      return recusa("registro_invalido", `O registro ${i + 1} foi recusado: ${e.message}`);
    }
  }

  return { ok: true, motivo: null, detalhe: null, registros };
}

/**
 * Monta o pacote de exportação e **se recusa a exportar PII**.
 *
 * A varredura acontece na saída também, e não só na entrada: um registro pode
 * ter sido escrito neste navegador, por esta interface, com um comentário que
 * a pessoa digitou sem pensar. A porta de saída é a última chance de segurar.
 */
export function exportar(registros, resumo) {
  const pacote = {
    schema: SCHEMA_EXPORTACAO,
    exportado_em: new Date().toISOString(),
    aviso:
      "Registros locais e experimentais do Lab Operação Viva V4. Não autenticados, não sincronizados, produzidos sobre fixture.",
    resumo,
    registros,
  };
  const pii = acharPII(pacote);
  if (pii.length > 0) {
    return {
      ok: false,
      motivo: "pii_detectada",
      detalhe: `A exportação foi recusada: os registros contêm o que parece dado pessoal (${pii.join(", ")}).`,
      json: null,
    };
  }
  return { ok: true, motivo: null, detalhe: null, json: JSON.stringify(pacote, null, 2) };
}
