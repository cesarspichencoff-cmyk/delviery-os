/**
 * LAB · MODO DE VALIDAÇÃO — o resumo do turno
 * ============================================================================
 * Função pura sobre os registros locais. Sem relógio, sem I/O, sem estado.
 *
 * O resumo é a única parte do Lab que fala sobre o SISTEMA em vez de falar
 * sobre a operação, e por isso ele tem uma regra própria: **onde não há
 * registro, ele diz que não há**. Nenhuma linha aqui devolve `0` para
 * significar "ninguém avaliou" — a diferença entre "avaliaram e não achavam
 * divergência" e "ninguém avaliou" é a informação mais útil de um turno.
 */

import { ROTULO_ANTECEDENCIA, ROTULO_UTILIDADE } from "./contrato.js";

/** Ausência com motivo. Nunca zero, nunca `null` solto. */
function semDado(explicacao) {
  return { observado: false, explicacao };
}

function comDado(valor, detalhe = null) {
  return { observado: true, valor, detalhe };
}

function maiorDivergencia(registros, campo, rotuloDe) {
  const conta = new Map();
  for (const r of registros) {
    const chave = r.contexto ? r.contexto[campo] : null;
    if (chave === null || chave === undefined) continue;
    if (r.verdict === "CORRECT") continue;
    conta.set(chave, (conta.get(chave) ?? 0) + 1);
  }
  if (conta.size === 0) {
    return semDado(
      "Nenhuma avaliação divergente foi registrada com esse contexto. Não dá para apontar um campeão.",
    );
  }
  // Empate resolvido por ordem alfabética, para o resumo ser determinístico.
  const ordenado = [...conta.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
  );
  const [chave, qtd] = ordenado[0];
  const empatados = ordenado.filter(([, n]) => n === qtd).map(([k]) => k);
  return comDado(
    rotuloDe ? rotuloDe(chave) : chave,
    empatados.length > 1
      ? `${qtd} divergência(s), empatado com ${empatados.length - 1} outro(s).`
      : `${qtd} divergência(s).`,
  );
}

function distribuicao(registros, campo, rotulos) {
  const conta = new Map();
  let comResposta = 0;
  for (const r of registros) {
    const v = r[campo];
    if (v === null || v === undefined) continue;
    comResposta += 1;
    conta.set(v, (conta.get(v) ?? 0) + 1);
  }
  if (comResposta === 0) {
    return semDado("Ninguém respondeu isso nas validações deste turno.");
  }
  const linhas = [...conta.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([k, n]) => ({ chave: k, rotulo: rotulos[k] ?? k, qtd: n }));
  return comDado(linhas, `${comResposta} de ${registros.length} avaliações responderam.`);
}

/**
 * O resumo do turno.
 *
 * `observados` é o número de sinais que as cenas visitadas apresentaram. Ele
 * vem de fora porque o resumo não conhece as cenas — e quando não vier, a
 * linha se declara sem dado em vez de inventar denominador.
 */
export function resumoDoTurno(registros, { observados = null } = {}) {
  const lista = Array.isArray(registros) ? registros : [];
  const conta = (p) => lista.filter(p).length;

  const corrigidas = lista.filter(
    (r) => r.correcoes.length > 0 || r.correcao_texto !== null,
  );
  const naoDetectados = lista.filter((r) => r.problema_nao_detectado !== null);

  return {
    sinais_observados:
      typeof observados === "number"
        ? comDado(observados, "Somados nas cenas visitadas neste navegador.")
        : semDado("As cenas visitadas não foram informadas ao resumo."),

    total_avaliado: comDado(lista.length),
    correto: comDado(conta((r) => r.verdict === "CORRECT")),
    parcialmente_correto: comDado(conta((r) => r.verdict === "PARTIALLY_CORRECT")),
    incorreto: comDado(conta((r) => r.verdict === "INCORRECT")),
    nao_confirmado: comDado(conta((r) => r.verdict === "UNCONFIRMED")),

    // Falso positivo é o sistema ter afirmado algo que não era verdade — ou
    // seja, exatamente um veredito `INCORRECT`. Não é uma métrica separada
    // com definição própria, e fingir que era daria dois números para a mesma
    // coisa.
    falsos_positivos: comDado(
      conta((r) => r.verdict === "INCORRECT"),
      "Leituras que a operação marcou como incorretas.",
    ),

    problemas_nao_detectados:
      naoDetectados.length > 0
        ? comDado(
            naoDetectados.length,
            "Registrados à mão por quem estava lá. O sistema não descobre isto sozinho.",
          )
        : semDado(
            "Ninguém registrou um problema que o sistema tenha deixado passar. Isso não prova que não houve.",
          ),

    recomendacoes_validadas: comDado(
      conta((r) => r.alvo === "recomendacao" && r.verdict === "CORRECT"),
    ),
    recomendacoes_corrigidas: comDado(
      corrigidas.filter((r) => r.alvo === "recomendacao").length,
    ),

    unidade_de_maior_divergencia: maiorDivergencia(lista, "unidade_id", null),
    fonte_de_maior_divergencia: maiorDivergencia(lista, "fonte_id", null),

    utilidade: distribuicao(lista, "utilidade", ROTULO_UTILIDADE),
    antecedencia: distribuicao(lista, "antecedencia", ROTULO_ANTECEDENCIA),

    cenarios_tocados: comDado([...new Set(lista.map((r) => r.scenario_id))].sort()),

    procedencia:
      "Todos os números vêm de fixture avaliada neste navegador. Nenhum turno real foi observado.",
  };
}
