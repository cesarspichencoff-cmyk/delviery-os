/**
 * DeliveryOS — Product System · HOME OPERACIONAL (R2)
 * ============================================================================
 * A home responde, em uma tela e nesta ordem:
 *   1. como esta a operacao        -> `modo` + `pulso`
 *   2. o que esta acontecendo      -> `ambientes` (com subareas)
 *   3. o que parece mais urgente   -> `foco`
 *   4. por que aquilo merece atencao -> `foco.evidencias` + `foco.impacto`
 *   5. o que a equipe pode fazer   -> `foco.orientacao` (UMA)
 *   6. que outros problemas seguem ativos -> `sinais_em_segundo_plano`
 *   7. que dados ainda faltam      -> `fontes` + `sinais_indisponiveis`
 *
 * HIERARQUIA PRESERVADA:
 *   estado geral -> pulso -> problemas simultaneos -> urgencia diferenciada
 *   -> UMA orientacao principal no Foco -> aprofundamento quando necessario
 *
 * O QUE ELA NAO E: tabela de viagens · catalogo de modulos · console do
 * Conference Brain · painel de integridade tecnica · tela do Copiloto ·
 * dashboard de metricas. As quatro superficies da Unidade 6 continuam existindo
 * como APROFUNDAMENTO — nenhuma foi descartada.
 *
 * TRAVAS ESTRUTURAIS DESTE ARQUIVO:
 *   - Calmo nunca e tela vazia: pulso, ambientes e sinais continuam presentes.
 *   - Exclusividade de slot: existe no maximo UM foco; os demais sinais recuam
 *     para segundo plano e NUNCA somem (D42).
 *   - Ambiente vermelho nunca fica oculto: a lista de ambientes e sempre inteira.
 *   - Area sem fonte nunca aparece verde: ela tem cor propria `sem_medicao`.
 *   - Ausencia nunca vira zero: pressao e `Campo<number>` (D37).
 *   - Nenhuma acao e executada, e nenhuma praca e pausada automaticamente.
 */

import {
  AMBIENTES,
  CAMINHO_DO_PEDIDO,
  ambientePorId,
  pracasDe,
  rotuloDaPraca,
  rotuloDoAmbiente,
  subareasDe,
  type Ambiente,
  type AmbienteId,
  type ModoDeMedicao,
  type PracaId,
} from "./areas";
import {
  ausente,
  observado,
  selo,
  type Campo,
  type Evidencia,
  type Limitacao,
  type Procedencia,
  type Selo,
} from "./estados";
import {
  SINAIS_INDISPONIVEIS,
  sinaisDe,
  type EstadoDeFonte,
  type LeituraOperacional,
  type Publico,
  type Sinal,
  type SinalIndisponivel,
} from "./sinais";

/* ================================================================== *
 * Vocabulario da home
 * ================================================================== */

export type ModoOperacional = "calmo" | "ambiente" | "foco";

/**
 * `sem_medicao` e uma cor propria, e nao um tom de verde. Ela existe justamente
 * para que a ausencia de fonte nunca seja lida como saude.
 */
export type CorDeAmbiente = "verde" | "amarelo" | "vermelho" | "sem_medicao";

export interface SubareaVM {
  readonly id: PracaId;
  readonly rotulo: string;
  readonly cor: CorDeAmbiente;
  readonly estado_texto: string;
  readonly motivo: string;
  readonly pressao: Campo<number>;
  /** Se esta subarea e a que causa o congestionamento do ambiente. */
  readonly causadora: boolean;
}

export interface AmbienteVM {
  readonly id: AmbienteId;
  readonly rotulo: string;
  readonly descricao: string;
  readonly cor: CorDeAmbiente;
  readonly estado_texto: string;
  readonly motivo: string;
  readonly medicao: ModoDeMedicao;
  readonly pressao: Campo<number>;
  readonly selos: readonly Selo[];
  /** Subareas visiveis. Vazio nos ambientes que nao tem (D46). */
  readonly subareas: readonly SubareaVM[];
  /** Quantos sinais ativos apontam para este ambiente. */
  readonly sinais_ativos: number;
}

export interface OrientacaoVM {
  /** Imperativo curto. Nunca um controle: nao ha o que clicar. */
  readonly acao: string;
  readonly porque: string;
  readonly primeiro_olhar: string;
  readonly impacto: string;
  readonly confianca: Campo<number>;
  /** Real, simulado, controle — declarada sempre (I10). */
  readonly procedencia: Procedencia;
  /** Trava literal: nada e executado por esta orientacao. */
  readonly executa: false;
  readonly selos: readonly Selo[];
}

export interface FocoVM {
  readonly situacao: string;
  readonly ambiente: AmbienteId | null;
  readonly ambiente_rotulo: string | null;
  readonly subarea: PracaId | null;
  readonly subarea_rotulo: string | null;
  readonly evidencias: readonly Evidencia[];
  readonly impacto: string;
  readonly tempo: string;
  readonly confianca: Campo<number>;
  /** UMA orientacao principal, ou `null` (foco puro). Nunca duas. */
  readonly orientacao: OrientacaoVM | null;
  readonly sinal: Sinal;
}

/**
 * Quanto uma relacao entre areas esta carregada AGORA. E o degrau da area de
 * origem, transposto para a relacao — a superficie nao escolhe nada disso.
 */
export type IntensidadeDeLigacao = "inerte" | "ativa" | "carregada";

/**
 * Uma relacao do caminho do pedido (`CAMINHO_DO_PEDIDO`, em `areas.ts`).
 *
 * O contrato canonico (Organismo V3.3, prancha 13) diz que a ligacao **so
 * aparece quando a dependencia esta ativa agora**, e engrossa quando a pressao
 * comeca a atravessa-la. Ela nasce aqui, e nao no CSS, porque a interface nao
 * escolhe ligacao — ver DECISIONS.md D53.
 *
 * `inerte` e o estado normal: o caminho existe, a linha fica quase invisivel.
 * Area em `sem_medicao` nunca origina relacao ativa: sem degrau observado, o
 * sistema nao afirma que a pressao esta passando por ali.
 */
export interface LigacaoVM {
  readonly de: AmbienteId;
  readonly para: AmbienteId;
  readonly de_rotulo: string;
  readonly para_rotulo: string;
  readonly ativa: boolean;
  readonly intensidade: IntensidadeDeLigacao;
  /** Frase operacional. `null` quando a relacao esta inerte — nada a dizer. */
  readonly texto: string | null;
}

export interface FonteVM {
  readonly id: string;
  readonly rotulo: string;
  readonly estado: EstadoDeFonte;
  readonly detalhe: string;
  readonly selos: readonly Selo[];
}

export interface ContextoDeFuncao {
  readonly funcao: Publico;
  readonly rotulo: string;
  readonly pergunta: string;
  readonly sinais: readonly Sinal[];
  /** O que esta funcao explicitamente nao ve hoje. */
  readonly ausencia: string | null;
}

export interface HomeVM {
  readonly modo: ModoOperacional;
  readonly titulo: string;
  readonly apoio: string;
  readonly procedencia: Procedencia;
  readonly observado_em: string;
  /** `true` quando a leitura veio de fixture. A tela precisa dizer isso. */
  readonly demonstracao: boolean;
  /**
   * Alguma fonte que normalmente responde esta `parcial` ou `stale`. Nao e um
   * quarto modo: e uma condicao que atravessa Calmo, Ambiente e Foco. Quando
   * verdadeira, a home diz QUAL fonte falta em vez de mostrar tudo verde.
   */
  readonly degradado: boolean;
  readonly selos: readonly Selo[];
  readonly pulso: Campo<number>;
  readonly ambientes: readonly AmbienteVM[];
  /** O caminho do pedido, com as relacoes ATIVAS marcadas. Nunca vazio. */
  readonly ligacoes: readonly LigacaoVM[];
  readonly foco: FocoVM | null;
  /** Todos os sinais ativos que NAO ocupam o foco. Nunca escondidos. */
  readonly sinais_em_segundo_plano: readonly Sinal[];
  readonly total_de_sinais: number;
  readonly fontes: readonly FonteVM[];
  readonly fontes_degradadas: readonly FonteVM[];
  readonly sinais_indisponiveis: readonly SinalIndisponivel[];
  readonly contextos: readonly ContextoDeFuncao[];
  readonly limitacoes: readonly Limitacao[];
  /** Onde aprofundar. A home aponta; ela nao vira as telas tecnicas. */
  readonly aprofundamentos: readonly { rota: string; nome: string; papel: string }[];
}

/* ================================================================== *
 * Cor de ambiente
 * ================================================================== */

const TEXTO_COR: Record<CorDeAmbiente, string> = {
  verde: "Fluindo",
  amarelo: "Atencao",
  vermelho: "Segurando o fluxo",
  sem_medicao: "Sem medicao automatica",
};

function corPorSeveridade(maior: 0 | 1 | 2 | 3): CorDeAmbiente {
  if (maior >= 3) return "vermelho";
  if (maior >= 1) return "amarelo";
  return "verde";
}

function maiorSeveridade(sinais: readonly Sinal[]): 0 | 1 | 2 | 3 {
  let m: 0 | 1 | 2 | 3 = 0;
  for (const s of sinais) if (s.severidade > m) m = s.severidade;
  return m;
}

/**
 * Pressao 0-100. Baseline = 50%, o dobro do baseline = 100% — a mesma escala do
 * protoripo. Sem carga OU sem baseline, devolve AUSENCIA, nunca 0.
 */
function pressaoDaPraca(l: LeituraOperacional, praca: PracaId): Campo<number> {
  const carga = l.carga_por_praca[praca];
  const base = l.baseline_por_praca[praca];
  if (carga === undefined) {
    return ausente(
      "nao_observado",
      `Nenhuma fonte mede a carga de ${rotuloDaPraca(praca)} nesta leitura.`,
    );
  }
  if (base === undefined || base <= 0) {
    return ausente(
      "evidencia_insuficiente",
      `Sem baseline calibrado para ${rotuloDaPraca(praca)}, a carga nao vira pressao.`,
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round((carga / base) * 50)));
  return observado(pct, l.procedencia, l.observado_em);
}

function pressaoDoAmbiente(
  l: LeituraOperacional,
  amb: Ambiente,
): Campo<number> {
  if (amb.medicao !== "carga_por_praca") {
    return ausente(
      "integracao_pendente",
      amb.motivo_sem_medicao ??
        `${amb.rotulo} nao e medida por carga de praca nesta leitura.`,
    );
  }
  let maior: Campo<number> | null = null;
  for (const p of pracasDe(amb.id)) {
    const c = pressaoDaPraca(l, p.id);
    if (!c.observado) continue;
    if (maior === null || !maior.observado || c.valor > maior.valor) maior = c;
  }
  return (
    maior ??
    ausente(
      "nao_observado",
      `Nenhuma praca de ${amb.rotulo} tem carga observada nesta leitura.`,
    )
  );
}

function subareaVM(
  l: LeituraOperacional,
  praca: PracaId,
  sinais: readonly Sinal[],
  causadora: PracaId | null,
): SubareaVM {
  const daSubarea = sinais.filter((s) => s.subarea === praca);
  const pressao = pressaoDaPraca(l, praca);
  const sevPintura = maiorSeveridade(daSubarea.filter((s) => s.pinta_ambiente));
  // Um problema visivel VENCE a ausencia de medicao: se ha sinal de pressao,
  // a subarea mostra a cor do problema mesmo sem carga observada. O contrario —
  // ausencia virando verde — e o que nunca pode acontecer.
  const cor: CorDeAmbiente =
    sevPintura >= 2
      ? corPorSeveridade(sevPintura)
      : !pressao.observado
        ? "sem_medicao"
        : corPorSeveridade(sevPintura);
  // O motivo prefere o sinal de PRESSAO. Um sinal informativo nao explica a cor
  // da subarea — e explicar a cor e a unica funcao desta linha.
  const motivo =
    daSubarea.find((s) => s.pinta_ambiente)?.resumo ??
    (pressao.observado
      ? `${rotuloDaPraca(praca)} em ritmo normal.`
      : pressao.explicacao);
  return {
    id: praca,
    rotulo: rotuloDaPraca(praca),
    cor,
    estado_texto: TEXTO_COR[cor],
    motivo,
    pressao,
    causadora: causadora === praca,
  };
}

function ambienteVM(
  l: LeituraOperacional,
  amb: Ambiente,
  sinais: readonly Sinal[],
): AmbienteVM {
  const doAmbiente = sinais.filter((s) => s.ambiente === amb.id);
  const pressao = pressaoDoAmbiente(l, amb);

  // As fontes que alimentam esta area. Se qualquer uma delas nao esta saudavel,
  // a area NAO pode aparecer verde — I6. "Sem fonte" nunca vira "tudo bem".
  const fontesDaArea = l.fontes.filter((f) => f.ambientes.includes(amb.id));
  // Uma fonte que se diz saudavel e nao entrega leitura nenhuma tambem nao
  // sustenta verde: para as areas medidas por carga, o verde exige a carga
  // OBSERVADA, nao a promessa da fonte.
  const fonteConfiavel =
    amb.medicao !== "sem_medicao_automatica" &&
    fontesDaArea.length > 0 &&
    fontesDaArea.every((f) => f.estado === "saudavel") &&
    (amb.medicao !== "carga_por_praca" || pressao.observado);

  const sevPintura = maiorSeveridade(doAmbiente.filter((s) => s.pinta_ambiente));

  // Ordem deliberada: problema visivel primeiro. Um ambiente vermelho nunca e
  // escondido por falta de fonte — e uma area sem fonte nunca fica verde.
  const cor: CorDeAmbiente =
    sevPintura >= 2
      ? corPorSeveridade(sevPintura)
      : !fonteConfiavel
        ? "sem_medicao"
        : corPorSeveridade(sevPintura);

  // A subarea causadora e a do sinal de pressao mais severo que aponta uma
  // subarea. "Sushi carregado" nunca esconde qual subarea causa isso (D46).
  const comSubarea = doAmbiente.filter(
    (s) => s.subarea !== null && s.pinta_ambiente,
  );
  const causadora = comSubarea.length > 0 ? comSubarea[0]!.subarea : null;

  const fontesFaltando = fontesDaArea.filter((f) => f.estado !== "saudavel");
  const motivo =
    doAmbiente.find((s) => s.pinta_ambiente)?.resumo ??
    (cor === "sem_medicao"
      ? fontesFaltando.length > 0
        ? `${fontesFaltando.map((f) => f.rotulo).join(" e ")}: ${fontesFaltando[0]!.detalhe}`
        : (amb.motivo_sem_medicao ?? "Sem fonte de medicao para esta area.")
      : `${amb.rotulo} em ritmo normal.`);

  const selos: Selo[] = [];
  if (cor === "sem_medicao") {
    const pior = fontesFaltando[0];
    selos.push(
      selo(
        pior?.estado === "stale" ? "stale" : pior?.estado === "parcial" ? "parcial" : "indisponivel",
        pior ? `fonte: ${pior.rotulo}` : "sem medicao automatica",
      ),
    );
  }

  return {
    id: amb.id,
    rotulo: amb.rotulo,
    descricao: amb.descricao,
    cor,
    estado_texto: TEXTO_COR[cor],
    motivo,
    medicao: amb.medicao,
    pressao,
    selos,
    subareas: subareasDe(amb.id).map((p) =>
      subareaVM(l, p.id, sinais, causadora),
    ),
    sinais_ativos: doAmbiente.length,
  };
}

/* ================================================================== *
 * Foco
 * ================================================================== */

/**
 * Eleger o foco. Exclusividade de slot: exatamente UM candidato, ou nenhum.
 * Criterio: severidade 3. Severidade 2 e Ambiente; severidade 1 e clima.
 */
/**
 * O que esta view model aceita da politica temporal. Deliberadamente MINIMO: so
 * o modo eleito e se a orientacao esta liberada. Tudo o mais — pendente, foco
 * ativo, cooldown, marcacoes — pertence ao estado da politica, e trazer para ca
 * seria recriar aqui o dono da atencao que C3 ja definiu.
 */
export interface EleicaoTemporal {
  readonly modo: ModoOperacional;
  readonly orientacao_permitida: boolean;
}

function elegerFoco(sinais: readonly Sinal[]): Sinal | null {
  const candidatos = sinais.filter((s) => s.severidade >= 3);
  return candidatos[0] ?? null;
}

/**
 * A orientacao vem do proprio sinal. Ela NAO e produzida por conexao com o motor
 * de decisao original (`decisao.js`) nem com o Copiloto Shadow — essa conexao e
 * R5 e continua proibida por D43. Aqui ela e a orientacao do sinal, com a mesma
 * procedencia da leitura, declarada.
 */
function orientacaoVM(
  sinal: Sinal,
  confianca: Campo<number>,
): OrientacaoVM | null {
  if (sinal.orientacao === null) return null;
  return {
    acao: sinal.orientacao,
    porque: sinal.resumo,
    primeiro_olhar:
      sinal.pedido_id !== null
        ? `Pedido ${sinal.pedido_id}`
        : sinal.subarea !== null
          ? rotuloDaPraca(sinal.subarea)
          : sinal.ambiente !== null
            ? ambientePorId(sinal.ambiente).rotulo
            : "A operacao como um todo",
    impacto: sinal.limitacao,
    confianca,
    procedencia: sinal.procedencia,
    executa: false,
    selos:
      sinal.procedencia === "real"
        ? [selo("real")]
        : [selo("somente_demonstracao", "orientacao de demonstracao")],
  };
}

function focoVM(sinal: Sinal, l: LeituraOperacional): FocoVM {
  // Confianca so aparece com evidencia rastreavel — regra da Unidade 6, reaplicada.
  const confianca: Campo<number> =
    sinal.evidencias.length > 0
      ? observado(
          sinal.severidade >= 3 ? 0.8 : 0.6,
          l.procedencia,
          l.observado_em,
        )
      : ausente(
          "evidencia_insuficiente",
          "Sem evidencia rastreavel, nenhuma confianca e apresentada.",
        );
  return {
    situacao: sinal.resumo,
    ambiente: sinal.ambiente,
    ambiente_rotulo:
      sinal.ambiente !== null ? ambientePorId(sinal.ambiente).rotulo : null,
    subarea: sinal.subarea,
    subarea_rotulo: sinal.subarea !== null ? rotuloDaPraca(sinal.subarea) : null,
    evidencias: sinal.evidencias,
    impacto: sinal.limitacao,
    tempo: `Leitura de ${l.observado_em}`,
    confianca,
    orientacao: orientacaoVM(sinal, confianca),
    sinal,
  };
}

/* ================================================================== *
 * Contextos por funcao
 * ================================================================== */

const PERGUNTAS: Record<Publico, { rotulo: string; pergunta: string }> = {
  gerente: {
    rotulo: "Gerente",
    pergunta: "O que merece minha atencao agora, e o que mais segue ativo?",
  },
  boqueta: {
    rotulo: "Boqueta",
    pergunta: "O que este pedido leva, e qual praca ainda deve?",
  },
  caixa: {
    rotulo: "Caixa",
    pergunta: "O que ja posso montar aqui na bancada?",
  },
  atendimento: {
    rotulo: "Atendimento",
    pergunta: "Que pedido esta atrasado, e o que posso dizer ao cliente?",
  },
};

const AUSENCIA_POR_FUNCAO: Record<Publico, string | null> = {
  gerente: null,
  boqueta:
    "A composicao vem do cardapio. O que ja saiu de cada praca depende de KDS ou impressora, que nao existem.",
  caixa:
    "A carga da propria Caixa fica sem medicao automatica: nenhuma fonte mede esta fila.",
  atendimento:
    "Reclamacao de cliente depende de SAC ou avaliacao — fonte externa, bloqueada.",
};

function contextos(sinais: readonly Sinal[]): readonly ContextoDeFuncao[] {
  return (["gerente", "boqueta", "caixa", "atendimento"] as Publico[]).map(
    (f) => ({
      funcao: f,
      rotulo: PERGUNTAS[f].rotulo,
      pergunta: PERGUNTAS[f].pergunta,
      sinais: sinais.filter((s) => s.publico.includes(f)),
      ausencia: AUSENCIA_POR_FUNCAO[f],
    }),
  );
}

/* ================================================================== *
 * A view model
 * ================================================================== */

const APROFUNDAMENTOS: readonly { rota: string; nome: string; papel: string }[] =
  [
    {
      rota: "/entregas",
      nome: "Entregas",
      papel: "Aprofundamento: quem esta na rua e com o que.",
    },
    {
      rota: "/operacao-viva",
      nome: "Operacao Viva",
      papel: "Detalhe tecnico: as dimensoes da unidade e a integridade do sinal.",
    },
    {
      rota: "/conference-brain",
      nome: "Conference Brain",
      papel: "Auditoria: o que foi observado e o que falta observar.",
    },
    {
      rota: "/copiloto",
      nome: "Copiloto",
      papel: "Inspecao: o ciclo da recomendacao em sombra.",
    },
  ];

function fonteVM(f: {
  id: string;
  rotulo: string;
  estado: EstadoDeFonte;
  detalhe: string;
}): FonteVM {
  return {
    ...f,
    selos: [
      selo(
        f.estado === "saudavel"
          ? "saudavel"
          : f.estado === "parcial"
            ? "parcial"
            : f.estado === "stale"
              ? "stale"
              : "indisponivel",
      ),
    ],
  };
}

/**
 * As relacoes do caminho do pedido, com o degrau da origem transposto.
 *
 * A regra e curta de proposito, e ela e a mesma da prancha 13 do V3.3:
 *   - origem `verde` ou `sem_medicao` -> `inerte`, sem texto;
 *   - origem `amarelo`  -> `ativa`;
 *   - origem `vermelho` -> `carregada`.
 *
 * `sem_medicao` cair em `inerte` e deliberado: uma area sem leitura nao pode
 * afirmar que esta empurrando pressao adiante. E o mesmo custo aceito em D51.
 */
function ligacoesVM(ambientes: readonly AmbienteVM[]): readonly LigacaoVM[] {
  const porId = new Map(ambientes.map((a) => [a.id, a]));
  return CAMINHO_DO_PEDIDO.map(({ de, para }) => {
    const origem = porId.get(de);
    const cor = origem ? origem.cor : "sem_medicao";
    const de_rotulo = rotuloDoAmbiente(de);
    const para_rotulo = rotuloDoAmbiente(para);
    const intensidade: IntensidadeDeLigacao =
      cor === "vermelho" ? "carregada" : cor === "amarelo" ? "ativa" : "inerte";
    return {
      de,
      para,
      de_rotulo,
      para_rotulo,
      ativa: intensidade !== "inerte",
      intensidade,
      texto:
        intensidade === "inerte"
          ? null
          : intensidade === "carregada"
            ? `${de_rotulo} esta segurando o fluxo que chega em ${para_rotulo}.`
            : `A tensao em ${de_rotulo} comeca a alcancar ${para_rotulo}.`,
    };
  });
}

export function homeVM(l: LeituraOperacional, temporal?: EleicaoTemporal): HomeVM {
  const sinais = sinaisDe(l);
  const foco = elegerFoco(sinais);

  // O modo. Calmo NAO significa ausencia de informacao: significa que nada
  // esta acima do piso de interrupcao.
  //
  // R5-A: quem elege o modo e a POLITICA TEMPORAL da Operacao Viva (C3), em
  // `src/product/atencao/politica-temporal.ts`. Esta view model apenas CONSOME o
  // resultado — ela nao guarda estado temporal, nao chama relogio e nao decide
  // permanencia, retirada nem cooldown.
  //
  // Quando `temporal` nao vem, a leitura e uma FOTOGRAFIA sem eixo de tempo: e o
  // caso das cenas de demonstracao, que sao instantes isolados e nao uma
  // sequencia. Nesse caminho o modo continua vindo da severidade, e isso esta
  // declarado aqui em vez de escondido — uma fixture sem tempo nao pode provar
  // debounce, e fingir que prova seria pior do que dizer que nao prova.
  const modo: ModoOperacional =
    temporal !== undefined
      ? temporal.modo
      : foco !== null
        ? "foco"
        : sinais.some((s) => s.severidade >= 2)
          ? "ambiente"
          : "calmo";

  const emAndamento = l.pedidos.length;
  const pulso: Campo<number> =
    l.pedidos.length > 0 || l.fontes.some((f) => f.estado === "saudavel")
      ? observado(emAndamento, l.procedencia, l.observado_em)
      : ausente(
          "indisponivel",
          "Nenhuma fonte de pedido respondeu. O pulso nao pode ser afirmado, e ausencia nao e zero.",
        );

  const fontes = l.fontes.map(fonteVM);
  const degradadas = fontes.filter((f) => f.estado !== "saudavel");
  // Ausencia ESTRUTURAL (Caixa, comanda) existe em toda leitura e nao caracteriza
  // degradacao. Degradado e quando uma fonte que normalmente responde parou.
  const degradado = fontes.some(
    (f) => f.estado === "stale" || f.estado === "parcial",
  );

  const titulo =
    modo === "foco"
      ? "Foco"
      : modo === "ambiente"
        ? "Ambiente"
        : "Em fluxo";

  const apoio = degradado
    ? "Parte das fontes parou de responder. O que segue vale so para o que ainda e observado."
    : modo === "foco"
      ? "Uma situacao pede decisao agora. As demais continuam visiveis abaixo."
      : modo === "ambiente"
        ? "Nada exige decisao imediata. Estes sinais merecem acompanhamento."
        : "Operacao fluindo. Nada precisa de voce agora — o que segue e o pulso da casa.";

  const limitacoes: Limitacao[] = [
    {
      titulo: "Nenhuma acao e executada",
      texto:
        "Esta home descreve e orienta. Nao existe controle que execute, nenhuma praca e pausada automaticamente, e nenhuma orientacao dispensa uma pessoa decidindo.",
    },
    {
      titulo: "Os dois motores continuam desconectados",
      texto:
        "O motor de decisao original e o Copiloto Shadow nao estao ligados (D43). A orientacao exibida vem do proprio sinal, com a procedencia declarada.",
    },
    {
      titulo: "Nove sinais do catalogo nao podem ser produzidos",
      texto:
        "Oito dependem de fonte inexistente (KDS, impressora, pausa do iFood, ficha tecnica) e um esta bloqueado por fonte externa (SAC). Eles aparecem declarados, nunca em silencio.",
    },
  ];

  if (l.procedencia !== "real") {
    limitacoes.unshift({
      titulo: "Leitura de demonstracao",
      texto:
        "Os pedidos desta leitura sao fixture. As REGRAS dos sinais e o cardapio (199 itens, 8 pracas) sao reais; os tempos e as cargas nao. Nada aqui representa a operacao neste momento.",
    });
  }

  const ambientes = AMBIENTES.map((a) => ambienteVM(l, a, sinais));

  return {
    modo,
    titulo,
    apoio,
    procedencia: l.procedencia,
    observado_em: l.observado_em,
    demonstracao: l.procedencia !== "real",
    degradado,
    selos:
      l.procedencia === "real"
        ? [selo("real")]
        : [selo("somente_demonstracao", "leitura de demonstracao")],
    pulso,
    ambientes,
    ligacoes: ligacoesVM(ambientes),
    foco: foco !== null ? focoVM(foco, l) : null,
    sinais_em_segundo_plano: sinais.filter((s) => s !== foco),
    total_de_sinais: sinais.length,
    fontes,
    fontes_degradadas: degradadas,
    sinais_indisponiveis: SINAIS_INDISPONIVEIS,
    contextos: contextos(sinais),
    limitacoes,
    aprofundamentos: APROFUNDAMENTOS,
  };
}
