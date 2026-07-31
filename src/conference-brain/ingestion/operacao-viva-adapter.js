/* ============================================================================
 * Adapter semântico: Operação Viva -> Conference Brain (bloco 4B4).
 * ----------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO RECUSA A FAZER É O QUE ELE TEM DE MAIS IMPORTANTE.
 *
 * As duas pontas têm, cada uma, "nove dimensões". Elas NÃO são a mesma lista
 * vista de ângulos diferentes:
 *
 *   Conference Brain  -> dimensões de um PEDIDO observado numa tela
 *                        (layout, visual, produção, prontidão, entregador,
 *                         despacho, conclusão, modalidade, loja)
 *   Operação Viva     -> dimensões da CARGA de uma operação de entrega
 *                        (carga, atraso, mobilidade, integridade, sincronização,
 *                         confiança, capacidade, ocorrências, envelhecimento)
 *
 * Casá-las por posição, quantidade ou nome parecido produziria um mapeamento
 * que passa em revisão e mente em produção. Por isso aqui não existe
 * correspondência campo a campo: existe uma CLASSIFICAÇÃO explícita de cada
 * dado recebido, e o direito de dizer "não há equivalência".
 *
 * ## A descoberta que decide o desenho
 *
 * O Brain é indexado por PEDIDO (`external_id`). A Operação Viva é indexada por
 * VIAGEM (`trip_id`). E a projeção do HEAD **não carrega identidade de pedido**:
 * `order_id` existe no envelope (`contracts/event-catalog.ts`) e é usado como
 * chave de partição na ingestão (`ingest/ingest-service.ts`), mas `projetar()`
 * não o propaga para `ViagemAcumulada`.
 *
 * Consequência inescapável: **este adapter nunca emite um pedido.** `orders` é
 * sempre `[]`, com o motivo declarado e legível por máquina. Emitir viagens
 * como se fossem pedidos faria o Brain gravar `live_observations` com um
 * `trip_id` no lugar do `external_id`, abrir relógio de Conferência para uma
 * viagem e reconciliar dimensões de pedido a partir de fato de motoboy. Seria
 * exatamente o mapeamento que parece certo e mente.
 *
 * O que atravessa a fronteira, então, é o que é honestamente atravessável:
 * escopo (unidade e modo), saúde da fonte, contexto operacional rotulado como
 * contexto, inferência rotulada como inferência, e procedência.
 *
 * ## Três carimbos que não se fundem
 *
 *   ultimo_fato_em  quando o fato aconteceu na rua   (occurred_at)
 *   calculada_em    quando a projeção foi computada
 *   lido_em         quando este adapter leu a projeção
 *
 * O Brain tem um `observed_at` que significa "quando o observador viu a tela".
 * Este adapter não vê tela nenhuma, então não produz `observed_at` — produz
 * `lido_em`, que é outra coisa e tem outro nome de propósito.
 *
 * ## Fronteiras
 *
 * - Roda FORA do runtime crítico. Nada em `src/platform/bin/` o importa, e a
 *   dependência aponta só nesta direção: o Brain lê um objeto simples da
 *   Operação Viva; a Operação Viva não conhece o Brain.
 * - NUNCA lança. Entrada inválida vira saúde declarada, não exceção.
 * - Não persiste, não escreve arquivo, não abre rede, não executa ação.
 * - Puro e determinístico: mesma projeção + mesmo relógio = mesma saída, byte
 *   a byte. Idempotente por consequência.
 * ==========================================================================*/
"use strict";

const { LIVE_SOURCE_HEALTH } = require("../contracts/live-states");
const { defineRule } = require("../contracts/rule-version");
const { FORBIDDEN_FIELDS } = require("../contracts/schemas");

const ADAPTER_VERSION = "operacao-viva-adapter-v1";

/**
 * A regra de mapeamento é versionada como qualquer outra regra do cérebro:
 * identidade, data, fonte, modo e reversão. Uma leitura feita sob a v1 não é
 * comparável a uma feita sob uma v2 que reclassifique um campo — e sem o
 * carimbo ninguém descobre isso depois.
 */
const REGRA_MAPEAMENTO = defineRule({
  id: "operacao-viva-para-conference-brain",
  version: "v1",
  date: "2026-07-31",
  source:
    "bloco 4B4; docs/execution/CONFERENCE_BRAIN_FORENSE.md secao 5 — as duas listas de nove dimensoes descrevem conceitos diferentes",
  mode: "shadow",
  params: {
    emite_pedido: false,
    motivo_sem_pedido: "projecao_sem_identidade_de_pedido",
    nunca_emite_saude: LIVE_SOURCE_HEALTH.AVAILABLE,
  },
});

/* ------------------------------------------------------------------ *
 * Classificação — o vocabulário exigido pelo bloco
 * ------------------------------------------------------------------ */

/**
 * Todo dado recebido da Operação Viva cai em exatamente uma destas cinco
 * classes. A classe não é decoração: ela decide ONDE o dado pode aparecer na
 * saída, e as três primeiras nunca se misturam na mesma gaveta.
 */
const CLASSIFICACAO = Object.freeze({
  /** Fato carimbado por quem observou. Atravessa verbatim. */
  OBSERVACAO_DIRETA: "observacao_direta",
  /** Derivado por cálculo — quase sempre contra um relógio. Nunca vira fato. */
  INFERENCIA: "inferencia",
  /** Sustenta auditoria (ids de evento, cursor, quarentena). Não é a afirmação. */
  EVIDENCIA_AUXILIAR: "evidencia_auxiliar",
  /** Descreve a operação, nunca um pedido. Nunca vira dimensão do Brain. */
  CONTEXTO_OPERACIONAL: "contexto_operacional",
  /** Não há equivalência comprovável. Ausência declarada, jamais preenchida. */
  SEM_EQUIVALENCIA_SEGURA: "sem_equivalencia_segura",
});
const CLASSIFICACAO_LIST = Object.freeze(Object.values(CLASSIFICACAO));

/**
 * O mapa é DADO, não código enterrado em `if`s. Assim ele pode ser lido
 * inteiro por um humano numa página, comparado entre versões, e verificado por
 * teste campo a campo — inclusive o teste que exige que nenhum campo novo da
 * projeção entre sem classificação.
 *
 * `destino: null` significa recusa. Não é lacuna a preencher depois: é a
 * afirmação de que preencher seria inventar.
 */
const MAPA_SEMANTICO = Object.freeze(
  [
    /* ---- escopo: a única identidade que as duas pontas compartilham ------ */
    {
      campo: "unit_id",
      classificacao: CLASSIFICACAO.OBSERVACAO_DIRETA,
      destino: "escopo.unit_id",
      motivo: "a unidade e a MESMA entidade dos dois lados — loja, praca. Atravessa verbatim.",
    },
    {
      campo: "source_mode",
      classificacao: CLASSIFICACAO.OBSERVACAO_DIRETA,
      destino: "escopo.source_mode",
      motivo:
        "declarado pelo produtor e sem valor padrao. Atravessa verbatim e particiona o run_id — real, simulado e controle nunca compartilham gaveta.",
    },

    /* ---- projeção ------------------------------------------------------- */
    {
      campo: "projection_version",
      classificacao: CLASSIFICACAO.EVIDENCIA_AUXILIAR,
      destino: "procedencia.projection_version",
      motivo: "permite saber sob qual versao de projecao a leitura foi feita.",
    },
    {
      campo: "calculada_em",
      classificacao: CLASSIFICACAO.EVIDENCIA_AUXILIAR,
      destino: "procedencia.calculada_em",
      motivo:
        "instante do CALCULO, nao do fato. Nunca vira observed_at do Brain — fundir os dois faz processamento atrasado parecer operacao atrasada.",
    },
    {
      campo: "cursor",
      classificacao: CLASSIFICACAO.EVIDENCIA_AUXILIAR,
      destino: "procedencia.cursor",
      motivo: "ultimo evento aplicado; e a ancora de retomada, nao uma afirmacao sobre a operacao.",
    },
    {
      campo: "quarentena",
      classificacao: CLASSIFICACAO.EVIDENCIA_AUXILIAR,
      destino: "procedencia.quarentena",
      motivo: "eventos recusados com motivo — evidencia de que algo NAO foi lido, que e informacao.",
    },

    /* ---- viagem: identidade e fatos ------------------------------------- */
    {
      campo: "viagens[].trip_id",
      classificacao: CLASSIFICACAO.OBSERVACAO_DIRETA,
      destino: "contexto.viagens[].identidade.trip_id",
      motivo:
        "identidade de VIAGEM, preservada como tal. NUNCA vira external_id: o Brain indexa pedido, e viagem nao e pedido.",
    },
    {
      campo: "viagens[].unit_id",
      classificacao: CLASSIFICACAO.OBSERVACAO_DIRETA,
      destino: "contexto.viagens[].identidade.unit_id",
      motivo: "mesma entidade do escopo; carregada para a viagem poder ser auditada isolada.",
    },
    {
      campo: "viagens[].estado",
      classificacao: CLASSIFICACAO.SEM_EQUIVALENCIA_SEGURA,
      destino: null,
      motivo:
        "estado de VIAGEM (criada/em_rota/chegou/entregue/...). Nenhuma dimensao do Brain descreve viagem: order_state e PRODUCAO na cozinha, courier_state e logistica do iFood, dispatch e por pedido. Mapear `entregue` para `finalized` fundiria logistica com producao — exatamente o erro que o modelo multidimensional existe para impedir.",
    },
    {
      campo: "viagens[].ultimo_fato_em",
      classificacao: CLASSIFICACAO.OBSERVACAO_DIRETA,
      destino: "contexto.viagens[].observado.ultimo_fato_em",
      motivo: "occurred_at do ultimo fato. Atravessa verbatim, e nunca no lugar de observed_at.",
    },
    {
      campo: "viagens[].ultima_posicao_em",
      classificacao: CLASSIFICACAO.EVIDENCIA_AUXILIAR,
      destino: "contexto.viagens[].observado.ultima_posicao_em",
      motivo:
        "carimbo da ultima posicao. E a BASE do calculo de frescor, entao viaja como evidencia; a leitura derivada dela vive em `inferido`.",
    },
    {
      campo: "viagens[].ocorrencias_abertas",
      classificacao: CLASSIFICACAO.CONTEXTO_OPERACIONAL,
      destino: "contexto.viagens[].observado.ocorrencias_abertas",
      motivo: "contagem de ocorrencias da viagem — descreve a operacao, nunca um pedido.",
    },
    {
      campo: "viagens[].source_mode",
      classificacao: CLASSIFICACAO.OBSERVACAO_DIRETA,
      destino: "contexto.viagens[].observado.source_mode",
      motivo: "repetido por viagem de proposito: uma viagem de modo divergente e detectavel item a item.",
    },
    {
      campo: "viagens[].eventos",
      classificacao: CLASSIFICACAO.EVIDENCIA_AUXILIAR,
      destino: "contexto.viagens[].evidencia.event_ids",
      motivo: "os event_id que compuseram a viagem — e por onde uma conclusao volta ate o fato que a gerou.",
    },
    {
      campo: "viagens[].device_id",
      classificacao: CLASSIFICACAO.SEM_EQUIVALENCIA_SEGURA,
      destino: null,
      motivo:
        "identificador pseudonimo de aparelho. O Brain nao tem uso para ele, e levar identificador de pessoa-aparelho para outro subsistema sem necessidade e o oposto de minimizacao. Descartado na fronteira.",
    },
    {
      campo: "viagens[].frescor",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.viagens[].inferido.frescor",
      motivo:
        "leitura contra RELOGIO, nao fato: os mesmos eventos dao `fresh` agora e `stale` daqui a dez minutos sem nada mudar no mundo. Vive em `inferido` para que nenhum consumidor o confunda com observacao.",
    },

    /* ---- as nove dimensões da Operação Viva ----------------------------- */
    {
      campo: "dimensoes.carga",
      classificacao: CLASSIFICACAO.CONTEXTO_OPERACIONAL,
      destino: "contexto.dimensoes.carga",
      motivo: "viagens abertas ao mesmo tempo. E carga de ENTREGA, nunca `active_orders` da Conferencia.",
    },
    {
      campo: "dimensoes.atraso",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.atraso",
      motivo: "contado comparando `agora` com o ultimo fato — depende de relogio, logo e inferencia.",
    },
    {
      campo: "dimensoes.mobilidade",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.mobilidade",
      motivo: "conta viagens com posicao FRESCA, e frescor e leitura de relogio.",
    },
    {
      campo: "dimensoes.integridade_sinal",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.integridade_sinal",
      motivo:
        "qualidade da INFORMACAO que chega. E a unica dimensao com ponte real para o Brain — vira saude da fonte, nunca dimensao de pedido.",
    },
    {
      campo: "dimensoes.saude_sincronizacao",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.saude_sincronizacao",
      motivo: "mesma evidencia da integridade vista de outro angulo; derivada, nunca observada.",
    },
    {
      campo: "dimensoes.confianca_evidencia",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.confianca_evidencia",
      motivo:
        "confianca da Operacao Viva sobre SUA leitura. NAO e o `confidence` de uma observacao de pedido do Brain, e nao pode ser reaproveitada como tal.",
    },
    {
      campo: "dimensoes.capacidade_operacional",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.capacidade_operacional",
      motivo:
        "depende de `capacidade_maxima` configurada e pode valer 'desconhecida'. Atravessa como esta — coagir para 0 inventaria saturacao.",
    },
    {
      campo: "dimensoes.ocorrencias",
      classificacao: CLASSIFICACAO.CONTEXTO_OPERACIONAL,
      destino: "contexto.dimensoes.ocorrencias",
      motivo: "soma de ocorrencias abertas; contexto da operacao.",
    },
    {
      campo: "dimensoes.risco_envelhecimento",
      classificacao: CLASSIFICACAO.INFERENCIA,
      destino: "contexto.dimensoes.risco_envelhecimento",
      motivo: "derivada de integridade e confianca, que ja sao derivadas. Inferencia de segunda ordem.",
    },
  ].map(Object.freeze),
);

/**
 * As nove dimensões de PEDIDO do Brain, e por que nenhuma é alimentada daqui.
 *
 * Esta lista existe para o teste poder afirmar a ausência: se um dia alguém
 * fizer o adapter emitir `courier` ou `order_state`, o gate acusa. Ausência
 * declarada é verificável; ausência por esquecimento não é.
 */
const DIMENSOES_DO_BRAIN_NAO_ALIMENTADAS = Object.freeze(
  [
    { dimensao: "layout", motivo: "descreve o MODO DA TELA do Gestor. A Operacao Viva nao tem tela." },
    { dimensao: "visual", motivo: "coluna/secao onde o cartao apareceu. Nao existe cartao nem coluna aqui." },
    {
      dimensao: "order_state",
      motivo:
        "PRODUCAO do pedido na cozinha. A Operacao Viva observa a rua depois que o pedido saiu — nunca a producao.",
    },
    {
      dimensao: "readiness",
      motivo: "prontidao INFORMADA a plataforma (botao 'Avisar Pedido Pronto'). Nao existe equivalente.",
    },
    {
      dimensao: "courier",
      motivo:
        "logistica do IFOOD. O motoboy da Operacao Viva e da propria loja; grava-lo aqui afirmaria que o iFood alocou entregador.",
    },
    {
      dimensao: "dispatch",
      motivo:
        "despacho POR PEDIDO. A loja de fato despacha, mas sem identidade de pedido nao ha a que prender o despacho.",
    },
    { dimensao: "completion", motivo: "conclusao do pedido. Viagem encerrada nao e pedido concluido." },
    { dimensao: "fulfillment", motivo: "modalidade so a partir de evidencia observada na tela." },
    { dimensao: "store", motivo: "loja aberta/fechada; a Operacao Viva nao observa o estado da loja." },
  ].map(Object.freeze),
);

/**
 * Campos que o Brain considera críticos para observar um pedido e que esta
 * fonte não tem como fornecer. Vai para `signals.criticalFieldsMissing`, que o
 * observador grava em `live_cycle_runs.fields_missing` — a ausência fica no
 * registro durável do próprio Brain, não só neste comentário.
 */
const CAMPOS_CRITICOS_AUSENTES = Object.freeze(
  ["completion", "courier", "dispatch", "external_id", "fulfillment", "layout", "order_state", "readiness", "store", "visual"],
);

/* ------------------------------------------------------------------ *
 * Saúde
 * ------------------------------------------------------------------ */

/**
 * Tradução de `integridade_sinal` para o vocabulário de saúde do Brain.
 *
 * Esta é a ÚNICA ponte semântica comprovável entre as duas pontas, e ela é
 * legítima por um motivo preciso: os dois lados falam da QUALIDADE DA
 * OBSERVAÇÃO, não da operação. `stale` de um lado e `stale` do outro querem
 * dizer a mesma coisa — "o que eu sei está velho".
 *
 * `available` nunca aparece, em nenhum caminho. No Brain, `available` é o que
 * autoriza afirmar carga operacional (`health.js#mayAffirmOperationalLoad`), e
 * esta fonte não observa um único pedido. Deixar passar um `available` daqui
 * faria a Conferência afirmar carga com base em dado que não é dela.
 */
const SAUDE_POR_INTEGRIDADE = Object.freeze({
  fresh: { state: LIVE_SOURCE_HEALTH.PARTIAL, reason: "operacao_viva_sem_dimensao_de_pedido" },
  aging: { state: LIVE_SOURCE_HEALTH.PARTIAL, reason: "operacao_viva_sinal_envelhecendo" },
  stale: { state: LIVE_SOURCE_HEALTH.STALE, reason: "operacao_viva_sinal_vencido" },
  unknown: { state: LIVE_SOURCE_HEALTH.PARTIAL, reason: "operacao_viva_sem_viagem_aberta" },
});

/** Razão que acompanha TODA leitura desta fonte — a ausência estrutural. */
const RAZAO_PERMANENTE = "sem_identidade_de_pedido_na_projecao";

/* ------------------------------------------------------------------ *
 * Utilitários puros
 * ------------------------------------------------------------------ */

function ehTextoNaoVazio(v) {
  return typeof v === "string" && v.trim() !== "";
}

/** ISO válido -> milissegundos; qualquer outra coisa -> null. Nunca lança. */
function instante(v) {
  if (!ehTextoNaoVazio(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Carrega um valor mantendo a distinção entre ausente e vazio.
 *
 * `undefined` vira `null` — declaradamente desconhecido. Nunca vira `0`, `""`
 * ou `false`: um zero inventado é indistinguível de um zero medido, e é assim
 * que entrada incompleta vira número falsamente preciso.
 */
function ouNulo(v) {
  return v === undefined || v === null ? null : v;
}

/** Procura chave proibida por NOME, em qualquer profundidade. Decidível. */
function chavesProibidas(valor, caminho, achadas, profundidade) {
  const p = profundidade || 0;
  if (p > 8 || valor === null || typeof valor !== "object") return achadas;
  if (Array.isArray(valor)) {
    for (const item of valor) chavesProibidas(item, caminho + "[]", achadas, p + 1);
    return achadas;
  }
  for (const [chave, v] of Object.entries(valor)) {
    const normal = chave.toLowerCase();
    if (FORBIDDEN_FIELDS.some((f) => normal === f || normal.endsWith("_" + f))) {
      achadas.push(caminho + "." + chave);
      continue; // não desce no valor recusado — ele não vai para lugar nenhum
    }
    chavesProibidas(v, caminho + "." + chave, achadas, p + 1);
  }
  return achadas;
}

/* ------------------------------------------------------------------ *
 * Adaptação
 * ------------------------------------------------------------------ */

function resultadoRecusado(motivo, detalhe, lidoEm) {
  return Object.freeze({
    adapter_version: ADAPTER_VERSION,
    regra_ref: REGRA_MAPEAMENTO.ref,
    lido_em: lidoEm,
    escopo: null,
    orders: [],
    orders_ausentes_porque: motivo,
    signals: Object.freeze({
      ordersFound: 0,
      criticalFieldsMissing: CAMPOS_CRITICOS_AUSENTES,
      operacao_viva: Object.freeze({ adaptada: false, motivo, detalhe: detalhe || null }),
    }),
    health: Object.freeze({
      state: LIVE_SOURCE_HEALTH.UNAVAILABLE,
      reason: motivo,
      reasons: Object.freeze([motivo, RAZAO_PERMANENTE]),
    }),
    // Sem contexto: uma projeção recusada não empresta nem um número. Deixar
    // passar "só as dimensões" de uma leitura recusada é como aceitar metade
    // de um dado que já se sabe não confiável.
    contexto: null,
    procedencia: null,
    recusas: Object.freeze({ pii: Object.freeze([]), identidade_de_pedido: Object.freeze([]) }),
  });
}

/**
 * Traduz uma `Projecao` da Operação Viva no que o Conference Brain sabe
 * consumir — e declara, na própria saída, tudo o que não foi traduzido.
 *
 * @param {object} projecao   uma `Projecao` (src/platform/projections/operacao-viva.ts)
 * @param {object} opcoes
 *   lidoEm       ISO — quando ESTE adapter leu a projeção. Obrigatório: sem ele
 *                não há como distinguir leitura de cálculo, e o adapter não
 *                inventa relógio.
 *   source_mode  modo esperado. Projeção de modo divergente é RECUSADA inteira.
 *   janelas      `{ fresh_ate_s, aging_ate_s }` — as mesmas da Operação Viva.
 *                Não é duplicado aqui de propósito: reimplementar a janela
 *                criaria uma segunda verdade que diverge no primeiro ajuste.
 * @returns {object} resultado congelado; nunca lança
 */
function adaptarProjecao(projecao, opcoes) {
  const o = opcoes || {};
  const lidoEm = ehTextoNaoVazio(o.lidoEm) ? o.lidoEm : null;

  if (lidoEm === null) return resultadoRecusado("lido_em_ausente", null, null);
  if (!projecao || typeof projecao !== "object" || Array.isArray(projecao)) {
    return resultadoRecusado("projecao_ausente_ou_invalida", null, lidoEm);
  }
  if (!ehTextoNaoVazio(projecao.unit_id)) {
    return resultadoRecusado("unit_id_ausente", null, lidoEm);
  }
  if (!ehTextoNaoVazio(projecao.source_mode)) {
    return resultadoRecusado("source_mode_ausente", null, lidoEm);
  }
  // Modo divergente não é filtrado item a item: é recusa da leitura inteira.
  // Misturar real com simulado num mesmo run produziria um número que não
  // descreve nem a operação nem o teste.
  if (ehTextoNaoVazio(o.source_mode) && o.source_mode !== projecao.source_mode) {
    return resultadoRecusado(
      "source_mode_divergente",
      "esperado=" + o.source_mode + " recebido=" + projecao.source_mode,
      lidoEm,
    );
  }

  const janelas = o.janelas && typeof o.janelas === "object" ? o.janelas : null;
  const agingS = janelas && Number.isFinite(janelas.aging_ate_s) ? janelas.aging_ate_s : null;

  const viagensBrutas = Array.isArray(projecao.viagens) ? projecao.viagens : [];
  const piiRecusada = [];
  const identidadeDePedido = [];
  const viagens = [];

  for (const v of viagensBrutas) {
    if (!v || typeof v !== "object") continue;

    // Allowlist, nunca blocklist: campos são copiados um a um, pelo nome. O que
    // este adapter não conhece simplesmente não atravessa — nem para ser
    // sanitizado depois. É a mesma disciplina do PiiGuard, aplicada à forma.
    chavesProibidas(v, "viagens[]", piiRecusada, 0);

    // Se um dia a projeção passar a carregar identidade de pedido, isto NÃO
    // deve virar mapeamento automático: passa a ser uma decisão com evidência,
    // tomada por gente. Até lá, aparecer é motivo de registro, não de uso.
    if (v.order_id !== undefined && v.order_id !== null) {
      identidadeDePedido.push(String(v.trip_id || "?"));
    }

    const ultimaPosicaoMs = instante(v.ultima_posicao_em);
    // Expiração deriva da MESMA base do frescor (a última posição) e da MESMA
    // janela da Operação Viva. Sem janela declarada, não há expiração a
    // afirmar — e `null` é a resposta honesta, nunca `false`.
    const expiraEm =
      ultimaPosicaoMs !== null && agingS !== null
        ? new Date(ultimaPosicaoMs + agingS * 1000).toISOString()
        : null;
    const expiraMs = instante(expiraEm);
    const lidoMs = instante(lidoEm);
    const expirado = expiraMs !== null && lidoMs !== null ? lidoMs > expiraMs : null;

    viagens.push({
      identidade: {
        trip_id: ouNulo(v.trip_id),
        unit_id: ouNulo(v.unit_id),
      },
      observado: {
        ultimo_fato_em: ouNulo(v.ultimo_fato_em),
        ultima_posicao_em: ouNulo(v.ultima_posicao_em),
        ocorrencias_abertas: ouNulo(v.ocorrencias_abertas),
        source_mode: ouNulo(v.source_mode),
      },
      inferido: {
        frescor: ouNulo(v.frescor),
        expira_em: expiraEm,
        expirado,
      },
      evidencia: {
        event_ids: Array.isArray(v.eventos) ? v.eventos.slice() : [],
      },
    });
  }

  // Ordem estável, independente da ordem de chegada. A política de ordenação da
  // Operação Viva (evento fora de ordem NÃO retrocede o estado) é dela e é
  // preservada por não ser reinterpretada aqui: este adapter não reordena
  // eventos, não recalcula estado e não desempata nada — só declara a política
  // que herdou e apresenta o resultado numa ordem reproduzível.
  viagens.sort((a, b) => String(a.identidade.trip_id).localeCompare(String(b.identidade.trip_id)));

  const d = projecao.dimensoes && typeof projecao.dimensoes === "object" ? projecao.dimensoes : {};
  const dimensao = (nome) => {
    const entrada = MAPA_SEMANTICO.find((m) => m.campo === "dimensoes." + nome);
    return {
      valor: ouNulo(d[nome]),
      classificacao: entrada ? entrada.classificacao : CLASSIFICACAO.SEM_EQUIVALENCIA_SEGURA,
    };
  };

  const integridade = ehTextoNaoVazio(d.integridade_sinal) ? d.integridade_sinal : "unknown";
  const saude = SAUDE_POR_INTEGRIDADE[integridade] || {
    state: LIVE_SOURCE_HEALTH.UNAVAILABLE,
    reason: "integridade_sinal_desconhecida:" + String(integridade),
  };

  const reasons = [saude.reason, RAZAO_PERMANENTE];
  if (agingS === null) reasons.push("janelas_nao_declaradas_expiracao_indeterminada");
  if (piiRecusada.length) reasons.push("campos_proibidos_descartados:" + piiRecusada.length);
  if (identidadeDePedido.length) reasons.push("identidade_de_pedido_presente_sem_decisao");

  chavesProibidas(projecao.dimensoes, "dimensoes", piiRecusada, 0);

  return Object.freeze({
    adapter_version: ADAPTER_VERSION,
    regra_ref: REGRA_MAPEAMENTO.ref,
    lido_em: lidoEm,

    escopo: Object.freeze({
      unit_id: projecao.unit_id,
      source_mode: projecao.source_mode,
    }),

    /**
     * Sempre vazio. Ver o cabeçalho: a projeção não carrega identidade de
     * pedido, e um pedido sem identidade é um pedido inventado.
     */
    orders: Object.freeze([]),
    orders_ausentes_porque: REGRA_MAPEAMENTO.params.motivo_sem_pedido,

    signals: Object.freeze({
      ordersFound: 0,
      criticalFieldsMissing: CAMPOS_CRITICOS_AUSENTES,
      // Namespace próprio: nada aqui pode ser confundido com sinal de tela
      // (`containerFound`, `captchaDetected`, `layoutSignatureMatch`...). Este
      // adapter não observa tela, e por isso não fornece — nem falsifica —
      // nenhum sinal de tela. É também por isso que ele entrega `health`
      // pronta: deixar `classifyCycleHealth` adivinhar a partir de sinais
      // ausentes produziria `layout_changed`, que aqui seria uma mentira.
      operacao_viva: Object.freeze({
        adaptada: true,
        viagens: viagens.length,
        integridade_sinal: integridade,
      }),
    }),

    health: Object.freeze({
      state: saude.state,
      reason: saude.reason,
      reasons: Object.freeze(reasons),
    }),

    contexto: Object.freeze({
      janelas: janelas ? Object.freeze({ ...janelas }) : null,
      dimensoes: Object.freeze({
        carga: dimensao("carga"),
        atraso: dimensao("atraso"),
        mobilidade: dimensao("mobilidade"),
        integridade_sinal: dimensao("integridade_sinal"),
        saude_sincronizacao: dimensao("saude_sincronizacao"),
        confianca_evidencia: dimensao("confianca_evidencia"),
        capacidade_operacional: dimensao("capacidade_operacional"),
        ocorrencias: dimensao("ocorrencias"),
        risco_envelhecimento: dimensao("risco_envelhecimento"),
      }),
      viagens: Object.freeze(viagens),
    }),

    procedencia: Object.freeze({
      projection_version: ouNulo(projecao.projection_version),
      calculada_em: ouNulo(projecao.calculada_em),
      cursor: projecao.cursor ? Object.freeze({ ...projecao.cursor }) : null,
      quarentena: Object.freeze(Array.isArray(projecao.quarentena) ? projecao.quarentena.slice() : []),
      politica_fora_de_ordem: "herdada_de_operacao_viva:evento_fora_de_ordem_nao_retrocede_estado",
    }),

    recusas: Object.freeze({
      pii: Object.freeze(piiRecusada.slice().sort()),
      identidade_de_pedido: Object.freeze(identidadeDePedido.slice().sort()),
    }),
  });
}

/* ------------------------------------------------------------------ *
 * Fronteira com o observador
 * ------------------------------------------------------------------ */

/**
 * `run_id` que particiona por unidade E por modo.
 *
 * `live_cycle_runs` tem chave natural `[run_id, cycle_id]`. Com o modo dentro
 * do `run_id`, um ciclo real e um ciclo simulado da mesma unidade nunca
 * ocupam a mesma linha — a separação vira estrutura, não disciplina.
 */
function runIdDe(unitId, sourceMode) {
  return ADAPTER_VERSION + ":" + String(unitId) + ":" + String(sourceMode);
}

/**
 * Constrói o `fetchOrders()` que `live/observer.js#createLiveObserver` espera.
 *
 * Nunca lança e nunca propaga falha da fonte: se `lerProjecao` explodir, o
 * ciclo recebe uma leitura declaradamente indisponível. O observador continua
 * girando, a Operação Viva não fica sabendo, e o runtime crítico — que não
 * importa este arquivo em lugar nenhum — não é tocado.
 *
 * @param {object} opcoes
 *   lerProjecao  () -> Projecao (pode ser assíncrona)
 *   source_mode  modo esperado; divergência é recusa declarada
 *   janelas      janelas da Operação Viva
 *   now          () -> ISO. Padrão: relógio de parede. O padrão existe para
 *                quem não configura, então é ele que precisa funcionar.
 */
function criarFetchOrders(opcoes) {
  const o = opcoes || {};
  const agora = typeof o.now === "function" ? o.now : () => new Date().toISOString();

  return async function fetchOrders() {
    const lidoEm = agora();
    let projecao;
    try {
      projecao = typeof o.lerProjecao === "function" ? await o.lerProjecao() : null;
    } catch (e) {
      // A mensagem da exceção pode carregar qualquer texto que a fonte tenha
      // tocado. Só a CLASSE do erro atravessa — nome de construtor é
      // vocabulário do código, não dado de operação.
      const classe = e && e.constructor && e.constructor.name ? e.constructor.name : "Error";
      return resultadoRecusado("fonte_indisponivel", "erro:" + classe, lidoEm);
    }
    return adaptarProjecao(projecao, {
      lidoEm,
      source_mode: o.source_mode,
      janelas: o.janelas,
    });
  };
}

module.exports = {
  ADAPTER_VERSION,
  REGRA_MAPEAMENTO,
  CLASSIFICACAO,
  CLASSIFICACAO_LIST,
  MAPA_SEMANTICO,
  DIMENSOES_DO_BRAIN_NAO_ALIMENTADAS,
  CAMPOS_CRITICOS_AUSENTES,
  SAUDE_POR_INTEGRIDADE,
  RAZAO_PERMANENTE,
  adaptarProjecao,
  criarFetchOrders,
  runIdDe,
};
