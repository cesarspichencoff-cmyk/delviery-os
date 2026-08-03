/**
 * POLITICA TEMPORAL DA ATENCAO — Operacao Viva
 * ============================================================================
 * R5-A. Esta unidade existe porque a eleicao do modo era uma FOTOGRAFIA:
 *
 *   home-vm.ts:607   foco !== null ? "foco"
 *                    : sinais.some(s => s.severidade >= 2) ? "ambiente" : "calmo"
 *
 * Severidade instantanea, sem uma unica dimensao de tempo. Nao aparecia porque
 * cada cena e uma fixture estatica; numa leitura ao vivo a mesma operacao
 * oscilaria entre Calmo e Foco a cada atualizacao.
 *
 * A semantica dos quatro parametros foi LIDA de `src/perfil-delivery/motor.js`
 * (linhas 42-46 e 273-279), nao presumida. O registro completo — unidade, ponto
 * de inicio, condicao de reinicio, precedencia e comportamento em troca de causa
 * — esta em `docs/product/CONTRATO_TEMPORAL_ATENCAO.md` §1. Tres achados que
 * mudam o desenho e estao provados la:
 *
 *   1. a unidade e MINUTO (`motor.js:200`: "fotografa o minuto t");
 *   2. `STALE:120` NAO e frescor de fonte — e teto de plausibilidade da espera
 *      observada de um pedido. A obsolescencia de fonte e OUTRA coisa, e entra
 *      aqui como estado observado, nunca inferido por limiar inventado;
 *   3. NAO existe preempcao: a eleicao so ocorre quando nao ha foco ativo. Uma
 *      causa mais severa nao rouba o slot. Nenhuma excecao foi inventada.
 *
 * C3 — a Operacao Viva e a dona final da atencao. Esta funcao E esse dono.
 * C1 — Ambiente informa e nao orienta: `orientacao_permitida` so e verdadeira no
 *      Foco, e a guarda R5A-20 prova que nao existe caminho para o contrario.
 *
 * O QUE ELA NAO E: nao conecta `decisao.js`, nao conecta `shadow.ts`, nao ativa
 * runtime, nao emite recomendacao real. D43 continua de pe.
 *
 * Pureza: sem `Date.now()`, sem `Math.random()`, sem I/O. O instante entra pela
 * entrada. O estado e JSON puro — sem classe, sem Map, sem Date — para que
 * serializar, reiniciar e restaurar produza a mesma eleicao.
 */

import type { AmbienteId, PracaId } from "../viewmodels/areas";

/* ------------------------------------------------------------------ *
 * Parametros                                                          *
 * ------------------------------------------------------------------ */

/**
 * Os quatro limiares, em MINUTOS, mais os dois pisos de severidade.
 *
 * Os limiares temporais sao os valores medidos do motor. Os pisos sao
 * parametros porque motor e produto divergem, e resolver a divergencia mudaria
 * o modo visivel de cenas aprovadas — ver CONTRATO_TEMPORAL_ATENCAO §5 e PB2.
 * O padrao reproduz o produto; nenhum piso foi escolhido aqui.
 */
export interface PoliticaTemporal {
  /** Minutos que a MESMA causa precisa sustentar antes de poder virar Foco. */
  readonly debounce_min: number;
  /** Minutos ate a MESMA causa poder voltar. Comparacao estrita `>`. */
  readonly cooldown_min: number;
  /** Teto de duracao do Foco. Comparacao `>=`. */
  readonly max_foco_min: number;
  /** Severidade minima para uma causa contar como candidata a Ambiente. */
  readonly piso_ambiente: number;
  /** Severidade minima para uma causa contar como candidata a Foco. */
  readonly piso_foco: number;
}

/** Valores comprovados: temporais do `motor.js`, pisos do produto vigente. */
export const POLITICA_CANONICA: PoliticaTemporal = {
  debounce_min: 3,
  cooldown_min: 45,
  max_foco_min: 8,
  piso_ambiente: 2,
  piso_foco: 3,
};

/* ------------------------------------------------------------------ *
 * Identidade da causa                                                 *
 * ------------------------------------------------------------------ */

/**
 * O que a politica precisa saber de uma causa. Deliberadamente NAO inclui
 * `resumo`, `orientacao` nem `alvo_rotulo`: texto apresentado a uma pessoa nunca
 * e identidade. Trocar a frase nao pode reiniciar o debounce de uma tensao que
 * nao mudou.
 */
export interface CausaCandidata {
  /** Codigo do catalogo de sinais. */
  readonly codigo: string;
  readonly severidade: number;
  readonly ambiente: AmbienteId | null;
  readonly subarea: PracaId | null;
  /**
   * SOMENTE quando ha identificador real observado. D29 continua valendo: sem
   * `order_id` propagado nao existe recomendacao de pedido, e identidade de
   * pedido nao se fabrica.
   */
  readonly pedido_id: string | null;
  /** Fonte que sustenta a causa, quando declarada. */
  readonly fonte_id: string | null;
  /** Quantas evidencias sustentam. Nao entra na identidade; entra na auditoria. */
  readonly evidencias: number;
}

/**
 * Identidade estavel, composta e legivel para auditoria. Campo ausente vira `-`,
 * nunca some — assim `s5|sushi|-|-|carga` e `s5|sushi|-|B-9|carga` sao
 * distinguiveis sem ambiguidade de posicao.
 */
export function identidadeDaCausa(c: CausaCandidata): string {
  const p = (v: string | null): string => (v === null || v === "" ? "-" : v);
  return [
    p(c.codigo),
    p(c.ambiente),
    p(c.subarea),
    p(c.pedido_id),
    p(c.fonte_id),
  ].join("|");
}

/* ------------------------------------------------------------------ *
 * Estado, entrada e saida                                             *
 * ------------------------------------------------------------------ */

/** Estado de fonte observado. Espelha `EstadoDeFonte` de `sinais.ts`. */
export type EstadoDaFonte = "saudavel" | "parcial" | "stale" | "indisponivel";

/** O pendente que acumula debounce. */
export interface Pendente {
  readonly identidade: string;
  /** Instante, em minutos, em que ESTA identidade passou a ser o topo. */
  readonly desde_min: number;
}

/** O Foco ocupando o slot. Zero ou um — o tipo nao admite lista. */
export interface FocoAtivo {
  readonly identidade: string;
  readonly entrou_min: number;
  /** `entrou_min + max_foco_min`, fixado na eleicao e nunca renovado. */
  readonly ate_min: number;
  /** Severidade da ultima confirmacao da MESMA causa. */
  readonly severidade: number;
  readonly ultima_confirmacao_min: number;
}

/**
 * Estado temporal. JSON puro: sem classe, sem `Map`, sem `Date`. Ele e a unica
 * memoria da politica, e por isso precisa atravessar `JSON.stringify` sem perder
 * nada — a §6 da missao exige que serializar, reiniciar e restaurar continue a
 * mesma sequencia.
 */
export interface EstadoTemporal {
  readonly versao: 1;
  readonly pendente: Pendente | null;
  readonly foco: FocoAtivo | null;
  /**
   * Por identidade de causa: instante da ultima marcacao. Objeto simples, nao
   * `Map`, exatamente para sobreviver a serializacao.
   */
  readonly marcada_em_min: Readonly<Record<string, number>>;
  /** Ultimo instante processado. Existe para idempotencia e ordem. */
  readonly ultimo_min: number | null;
}

export const ESTADO_INICIAL: EstadoTemporal = {
  versao: 1,
  pendente: null,
  foco: null,
  marcada_em_min: {},
  ultimo_min: null,
};

export interface EntradaDaEleicao {
  readonly estado: EstadoTemporal;
  /** O relogio, injetado. Minutos absolutos na linha do tempo da leitura. */
  readonly agora_min: number;
  /** Candidatas ja classificadas pelo chamador, em ordem de precedencia. */
  readonly candidatas: readonly CausaCandidata[];
  /** Estado observado das fontes que sustentam a leitura. */
  readonly fontes: readonly { readonly id: string; readonly estado: EstadoDaFonte }[];
  /**
   * Idade da leitura em minutos, quando observada. `null` = nao observada —
   * e ausencia NUNCA vira zero.
   */
  readonly idade_da_leitura_min: number | null;
  readonly politica?: PoliticaTemporal;
}

export type ModoOperacional = "calmo" | "ambiente" | "foco";

export type MotivoDaTransicao =
  | "debounce_cumprido"
  | "debounce_em_curso"
  | "debounce_reiniciado_por_troca_de_causa"
  | "pendente_apagado"
  | "causa_desapareceu"
  | "teto_de_foco_atingido"
  | "cooldown_em_vigor"
  | "cooldown_vencido"
  | "fonte_obsoleta"
  | "carimbo_repetido"
  | "carimbo_retrocedido"
  | "sem_candidato"
  | "causa_mantida";

export interface ResultadoDaEleicao {
  readonly modo: ModoOperacional;
  /** A causa eleita, ou `null`. Nunca duas — o tipo nao admite. */
  readonly causa: CausaCandidata | null;
  readonly identidade: string | null;
  readonly estado: EstadoTemporal;
  /** Instante de entrada no Foco corrente. */
  readonly entrou_min: number | null;
  readonly ultima_confirmacao_min: number | null;
  /** Instante previsto de retirada por teto. */
  readonly retirada_prevista_min: number | null;
  readonly motivo: MotivoDaTransicao;
  /**
   * C1 executado como TIPO, nao como disciplina: so o Foco pode carregar
   * orientacao. Ambiente e Calmo recebem `false`, sempre.
   */
  readonly orientacao_permitida: boolean;
  readonly cooldown: {
    /** Identidades em cooldown agora, com o instante em que vencem. */
    readonly em_vigor: readonly { readonly identidade: string; readonly vence_min: number }[];
  };
  readonly obsolescencia: {
    readonly degradado: boolean;
    readonly fontes_obsoletas: readonly string[];
    readonly idade_da_leitura_min: number | null;
  };
  readonly auditoria: {
    readonly candidatas: number;
    readonly acima_do_piso_ambiente: number;
    readonly acima_do_piso_foco: number;
    readonly debounce_decorrido_min: number | null;
    readonly politica: PoliticaTemporal;
  };
}

/* ------------------------------------------------------------------ *
 * A eleicao                                                           *
 * ------------------------------------------------------------------ */

/** Fonte obsoleta e a que parou de responder ou responde parcialmente. */
function obsoletas(
  fontes: EntradaDaEleicao["fontes"],
): readonly string[] {
  return fontes
    .filter((f) => f.estado === "stale" || f.estado === "indisponivel" || f.estado === "parcial")
    .map((f) => f.id);
}

/**
 * Elege zero ou um modo, aplicando a politica temporal.
 *
 * PURA. O mesmo par (estado, entrada) devolve sempre o mesmo resultado, e o
 * estado devolvido e a entrada da proxima leitura — que e o que torna a
 * sequencia reconstruivel por eventos.
 */
export function elegerModo(entrada: EntradaDaEleicao): ResultadoDaEleicao {
  const pol = entrada.politica ?? POLITICA_CANONICA;
  const t = entrada.agora_min;
  const anterior = entrada.estado;
  const fontesObsoletas = obsoletas(entrada.fontes);
  const degradado = fontesObsoletas.length > 0;

  const obsolescencia = {
    degradado,
    fontes_obsoletas: fontesObsoletas,
    idade_da_leitura_min: entrada.idade_da_leitura_min,
  } as const;

  /** Fecha um resultado sem repetir a montagem em cada saida. */
  const resultado = (
    modo: ModoOperacional,
    causa: CausaCandidata | null,
    estado: EstadoTemporal,
    motivo: MotivoDaTransicao,
    decorrido: number | null,
  ): ResultadoDaEleicao => ({
    modo,
    causa,
    identidade: causa === null ? null : identidadeDaCausa(causa),
    estado,
    entrou_min: estado.foco?.entrou_min ?? null,
    ultima_confirmacao_min: estado.foco?.ultima_confirmacao_min ?? null,
    retirada_prevista_min: estado.foco?.ate_min ?? null,
    motivo,
    // C1: a orientacao pertence ao Foco. Nao existe outro caminho para `true`.
    orientacao_permitida: modo === "foco",
    cooldown: {
      em_vigor: Object.entries(estado.marcada_em_min)
        .filter(([, quando]) => t - quando <= pol.cooldown_min)
        .map(([identidade, quando]) => ({
          identidade,
          vence_min: quando + pol.cooldown_min,
        })),
    },
    obsolescencia,
    auditoria: {
      candidatas: entrada.candidatas.length,
      acima_do_piso_ambiente: entrada.candidatas.filter(
        (c) => c.severidade >= pol.piso_ambiente,
      ).length,
      acima_do_piso_foco: entrada.candidatas.filter((c) => c.severidade >= pol.piso_foco)
        .length,
      debounce_decorrido_min: decorrido,
      politica: pol,
    },
  });

  /* -- Ordem dos carimbos ------------------------------------------------
     Repetido e IDEMPOTENTE: reprocessar o mesmo minuto nao pode adiantar um
     debounce nem envelhecer um foco. Retrocedido e REJEITADO com motivo — a
     regra e explicita, e o estado volta intacto. Fundir os dois casos faria um
     replay fora de ordem corromper a linha do tempo em silencio. */
  if (anterior.ultimo_min !== null && t < anterior.ultimo_min) {
    const modo = anterior.foco !== null ? "foco" : "calmo";
    return resultado(modo, null, anterior, "carimbo_retrocedido", null);
  }

  const repetido = anterior.ultimo_min !== null && t === anterior.ultimo_min;

  /* -- Quem esta acima de cada piso ------------------------------------- */
  const paraAmbiente = entrada.candidatas.filter((c) => c.severidade >= pol.piso_ambiente);
  const paraFoco = entrada.candidatas.filter((c) => c.severidade >= pol.piso_foco);
  const topo = paraFoco[0] ?? null;
  const idTopo = topo === null ? null : identidadeDaCausa(topo);

  /* -- 1. Pendente: acumula, reinicia ou apaga --------------------------
     Reproduz `motor.js:273`. Trocar a identidade do topo zera o relogio;
     ausencia de topo APAGA o pendente — nao pausa. */
  let pendente: Pendente | null;
  let motivoPendente: MotivoDaTransicao;
  if (idTopo === null) {
    pendente = null;
    motivoPendente = anterior.pendente !== null ? "pendente_apagado" : "sem_candidato";
  } else if (anterior.pendente !== null && anterior.pendente.identidade === idTopo) {
    pendente = anterior.pendente;
    motivoPendente = "debounce_em_curso";
  } else {
    pendente = { identidade: idTopo, desde_min: t };
    motivoPendente =
      anterior.pendente !== null
        ? "debounce_reiniciado_por_troca_de_causa"
        : "debounce_em_curso";
  }

  const decorrido = pendente === null ? null : t - pendente.desde_min;
  const sustentado =
    pendente !== null && decorrido !== null && decorrido >= pol.debounce_min ? topo : null;

  /* -- 2. Foco corrente: mantem, retira por desaparecimento, ou por teto -
     Reproduz `motor.js:275-276`, inclusive a assimetria: desaparecer NAO grava
     marcacao (nao inicia cooldown); atingir o teto GRAVA. */
  let foco = anterior.foco;
  let marcada: Record<string, number> = { ...anterior.marcada_em_min };
  let motivoFoco: MotivoDaTransicao | null = null;

  if (foco !== null) {
    const viva = entrada.candidatas.find((c) => identidadeDaCausa(c) === foco!.identidade) ?? null;
    if (viva === null) {
      foco = null;
      // Distinguir as duas retiradas importa: "a tensao acabou" e "paramos de
      // conseguir ver" pedem leituras diferentes de quem opera. Nenhuma das
      // duas grava marcacao — retirada por desaparecimento nao inicia cooldown.
      motivoFoco = degradado ? "fonte_obsoleta" : "causa_desapareceu";
    } else if (!repetido && t >= foco.ate_min) {
      marcada[foco.identidade] = t;
      foco = null;
      motivoFoco = "teto_de_foco_atingido";
    } else {
      // A MESMA causa continua. A situacao e reconfirmada; a identidade nao
      // muda, o `ate_min` nao e renovado, e uma causa mais severa nao entra.
      foco = {
        ...foco,
        severidade: viva.severidade,
        ultima_confirmacao_min: t,
      };
      motivoFoco = "causa_mantida";
    }
  }

  /* -- 3. Eleicao: so quando o slot esta livre --------------------------
     Reproduz `motor.js:277-278`. Sem preempcao: nao ha ramo em que uma causa
     nova substitua um foco vivo. */
  let motivo: MotivoDaTransicao = motivoFoco ?? motivoPendente;
  let causaEleita: CausaCandidata | null = null;

  if (foco === null && sustentado !== null && !repetido) {
    const id = identidadeDaCausa(sustentado);
    const marca = marcada[id];
    // Comparacao ESTRITA, como no motor: `> COOLDOWN`, nao `>=`.
    const elegivel = marca === undefined || t - marca > pol.cooldown_min;
    if (elegivel) {
      // Fonte obsoleta nao promove a Foco: promover afirmaria que a tensao foi
      // observada agora, quando a fonte que a sustenta parou de responder.
      if (degradado) {
        motivo = "fonte_obsoleta";
      } else {
        marcada[id] = t;
        foco = {
          identidade: id,
          entrou_min: t,
          ate_min: t + pol.max_foco_min,
          severidade: sustentado.severidade,
          ultima_confirmacao_min: t,
        };
        causaEleita = sustentado;
        motivo = marca === undefined ? "debounce_cumprido" : "cooldown_vencido";
      }
    } else {
      // A RETIRADA vence o relato. No mesmo minuto em que o teto encerra um
      // Foco, o pendente ja sustentado tenta ser eleito e esbarra no cooldown
      // que a propria retirada acabou de abrir. Os dois fatos sao verdadeiros,
      // mas quem le precisa saber que o Foco ACABOU — o cooldown continua
      // visivel em `cooldown.em_vigor`. Deixar o cooldown sobrescrever o motivo
      // esconderia a unica transicao que aconteceu.
      if (motivoFoco === null) motivo = "cooldown_em_vigor";
    }
  } else if (foco !== null) {
    causaEleita = entrada.candidatas.find((c) => identidadeDaCausa(c) === foco!.identidade) ?? null;
  }

  /* -- 4. O modo -------------------------------------------------------
     Fonte obsoleta NUNCA vira Calmo: a ultima verdade conhecida e preservada
     como Ambiente, com a degradacao e a idade declaradas ao lado. Zerar para
     Calmo afirmaria saude que ninguem observou. */
  let modo: ModoOperacional;
  if (foco !== null) {
    modo = "foco";
  } else if (paraAmbiente.length > 0) {
    modo = "ambiente";
  } else if (degradado) {
    modo = "ambiente";
    if (motivo === "sem_candidato" || motivo === "pendente_apagado") motivo = "fonte_obsoleta";
  } else {
    modo = "calmo";
  }

  const estado: EstadoTemporal = {
    versao: 1,
    pendente,
    foco,
    marcada_em_min: marcada,
    ultimo_min: repetido ? anterior.ultimo_min : t,
  };

  return resultado(
    modo,
    modo === "foco" ? causaEleita : null,
    estado,
    repetido && motivo === "debounce_em_curso" ? "carimbo_repetido" : motivo,
    decorrido,
  );
}

/* ------------------------------------------------------------------ *
 * Serializacao                                                        *
 * ------------------------------------------------------------------ */

/**
 * O estado como texto. Existe para provar — e para permitir — que a politica
 * atravesse um reinicio de processo. Nao ha banco, fila nem runtime nesta
 * missao; ha a garantia de que nada aqui depende de uma funcao Node continuar
 * viva em memoria.
 */
export function serializar(e: EstadoTemporal): string {
  return JSON.stringify(e);
}

export function restaurar(texto: string): EstadoTemporal {
  const cru = JSON.parse(texto) as EstadoTemporal;
  if (cru.versao !== 1) {
    throw new Error(`estado temporal de versao desconhecida: ${String(cru.versao)}`);
  }
  return cru;
}
