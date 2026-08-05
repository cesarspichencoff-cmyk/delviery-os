/**
 * LAB · OPERAÇÃO VIVA V4 — a view model da rota experimental
 * ============================================================================
 * EXPERIMENTAL. Ela COMPÕE o produto; não o substitui.
 *
 * De onde vem cada coisa, e isto é o contrato deste arquivo:
 *
 *   sinais            -> `sinaisDe()`            (produto, intocado)
 *   Calmo/Ambiente/Foco -> `homeVM()`            (produto, intocado)
 *   rebaixamento do Calmo -> `elegerModoV4()`    (Lab, só rebaixa)
 *   unidades e consolidação -> `unidade-operacional.ts` (Lab, experimental)
 *   estados de fonte  -> `estado-fonte.ts`       (Lab, 8 estados)
 *   validade/retirada/ritmo/retirados -> DECLARADOS na fixture
 *
 * A fórmula de pressão é a MESMA do produto (`carga / baseline * 50`, limitada a
 * 0–100). O que muda é o agrupamento: Sushi Quentes conta por si, e por isso a
 * conta é refeita aqui em vez de reaproveitada de `pressaoDoAmbiente` — que
 * agrega pelo ambiente canônico e engoliria justamente a unidade que este Lab
 * existe para revelar. Mesma regra, recorte diferente, e declarado.
 *
 * Nada aqui executa. Não há verbo de ação, não há pausa automática, e nenhuma
 * orientação daqui dispensa uma pessoa decidindo.
 */

import { rotuloDaPraca, type PracaId } from "../../../src/product/viewmodels/areas";
import {
  ausente,
  observado,
  type Campo,
  type Evidencia,
  type Limitacao,
  type Procedencia,
} from "../../../src/product/viewmodels/estados";
import { homeVM, type ModoOperacional } from "../../../src/product/viewmodels/home-vm";
import {
  SINAIS_INDISPONIVEIS,
  sinaisDe,
  type ItemDoPedido,
  type PedidoLeitura,
  type Sinal,
  type SinalIndisponivel,
} from "../../../src/product/viewmodels/sinais";
import {
  descricao,
  type DescricaoDeEstado,
  type DivergenciaDeclarada,
} from "./estado-fonte";
import type {
  AusenciaMaterial,
  ContornoDoSinal,
  FonteV4,
  LeituraV4,
  RitmoDeclarado,
  SinalRetirado,
  ValidacaoEsperada,
} from "./leitura-v4";
import { apoioDoModo, elegerModoV4, tituloDoModo, type EleicaoV4 } from "./modo-v4";
import {
  CAMINHO_DO_PEDIDO_V4,
  decidirConsolidacao,
  LIMITE_CONHECIDO_DA_ROTA_DO_CAIXA,
  unidadeDaPraca,
  unidadePorId,
  UNIDADES,
  type DecisaoDeConsolidacao,
  type UnidadeOperacional,
  type UnidadeOperacionalId,
} from "./unidade-operacional";

/* ================================================================== *
 * Vocabulário da tela
 * ================================================================== */

/** `sem_medicao` é cor própria, nunca um tom de verde. */
export type CorDaUnidade = "verde" | "amarelo" | "vermelho" | "sem_medicao";

export type IntensidadeDeLigacao = "inerte" | "ativa" | "carregada";

export interface FonteVM {
  readonly id: string;
  readonly rotulo: string;
  readonly estado: DescricaoDeEstado;
  readonly detalhe: string;
  readonly ultima_atualizacao: string | null;
  readonly necessaria_para_calmo: boolean;
  readonly conta_pedidos: boolean;
  readonly unidades: readonly UnidadeOperacionalId[];
}

export interface ItemEmProducao {
  readonly nome: string;
  readonly qtd: number;
}

export interface UnidadeVM {
  readonly id: UnidadeOperacionalId;
  readonly rotulo: string;
  readonly descricao: string;
  readonly experimental: boolean;
  readonly parent: UnidadeOperacionalId | null;
  readonly cor: CorDaUnidade;
  readonly estado_texto: string;
  readonly motivo: string;
  readonly carga: Campo<number>;
  readonly pressao: Campo<number>;
  /**
   * Quantas praças a carga soma. Existe porque `carga 14 · pressão 50%` mentia
   * por omissão: 14 é a SOMA de três praças e 50% é a pressão da praça MAIS
   * carregada. Sem dizer quantas praças entraram, os dois números pareciam
   * falar da mesma coisa.
   */
  readonly pracas_contadas: number;
  readonly fontes: readonly FonteVM[];
  readonly sinais_ativos: readonly Sinal[];
  readonly itens_em_producao: readonly ItemEmProducao[];
  readonly ultima_atualizacao: string | null;
  readonly sem_medicao_porque: string | null;
}

export interface LigacaoVM {
  readonly de: UnidadeOperacionalId;
  readonly para: UnidadeOperacionalId;
  readonly de_rotulo: string;
  readonly para_rotulo: string;
  readonly intensidade: IntensidadeDeLigacao;
  readonly texto: string | null;
}

export interface FocoVM {
  readonly sinal: Sinal;
  readonly situacao: string;
  readonly unidade: UnidadeOperacionalId | null;
  readonly unidade_rotulo: string | null;
  readonly motivo_da_escolha: string;
  readonly pedidos_envolvidos: readonly string[];
  readonly itens_envolvidos: readonly ItemEmProducao[];
  readonly evidencias: readonly Evidencia[];
  readonly fontes: readonly FonteVM[];
  /**
   * Sempre AUSENTE, e é uma decisão, não uma pendência: nenhuma política apura
   * confiança neste caminho (D69/D70/D71). O texto abaixo é o que a tela mostra
   * — a ausência é declarada, nunca escondida.
   */
  readonly confianca: Campo<number>;
  readonly confianca_texto: string;
  readonly validade_ate: string | null;
  readonly condicao_de_retirada: string | null;
  readonly acao_humana: string | null;
  readonly impacto_esperado: string;
  readonly executa: false;
}

export interface OperacaoVivaV4VM {
  readonly cenario_id: string;
  readonly titulo_cenario: string;
  readonly demonstra: string;
  readonly versao_fixture: string;
  readonly procedencia: Procedencia;
  readonly demonstracao: true;
  readonly observado_em: string;

  readonly eleicao: EleicaoV4;
  readonly modo: ModoOperacional;
  readonly titulo: string;
  readonly apoio: string;

  readonly pulso: Campo<number>;
  readonly ritmo: RitmoDeclarado;
  readonly unidades: readonly UnidadeVM[];
  readonly ligacoes: readonly LigacaoVM[];
  readonly foco: FocoVM | null;
  /** Todo sinal ativo que não ocupa o Foco. Nunca escondido. */
  readonly ambiente: readonly Sinal[];
  readonly total_de_sinais: number;
  readonly sinais_retirados: readonly SinalRetirado[];
  readonly fontes: readonly FonteVM[];
  readonly divergencias: readonly DivergenciaDeclarada[];
  readonly ausencias_materiais: readonly AusenciaMaterial[];
  readonly consolidacoes: readonly DecisaoDeConsolidacao[];
  readonly sinais_indisponiveis: readonly SinalIndisponivel[];
  readonly limitacoes: readonly Limitacao[];
  readonly validacao_esperada: ValidacaoEsperada;
}

/* ================================================================== *
 * Pressão — mesma fórmula do produto, recorte do Lab
 * ================================================================== */

const TEXTO_COR: Record<CorDaUnidade, string> = {
  verde: "Fluindo",
  amarelo: "Atenção",
  vermelho: "Segurando o fluxo",
  sem_medicao: "Sem medição automática",
};

function pressaoDaPraca(l: LeituraV4, praca: PracaId): Campo<number> {
  const carga = l.base.carga_por_praca[praca];
  const base = l.base.baseline_por_praca[praca];
  if (carga === undefined) {
    return ausente(
      "nao_observado",
      `Nenhuma fonte mede a carga de ${rotuloDaPraca(praca)} nesta leitura.`,
    );
  }
  if (base === undefined || base <= 0) {
    return ausente(
      "evidencia_insuficiente",
      `Sem baseline calibrado para ${rotuloDaPraca(praca)}, a carga não vira pressão.`,
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round((carga / base) * 50)));
  return observado(pct, l.procedencia, l.observado_em);
}

/** A maior pressão observada entre as praças DESTA unidade. */
function pressaoDaUnidade(l: LeituraV4, u: UnidadeOperacional): Campo<number> {
  if (u.medicao !== "carga_por_praca") {
    return ausente(
      "integracao_pendente",
      u.motivo_sem_medicao ?? `${u.rotulo} não é medida por carga de praça.`,
    );
  }
  let maior: Campo<number> | null = null;
  for (const p of u.pracas) {
    const c = pressaoDaPraca(l, p);
    if (!c.observado) continue;
    if (maior === null || !maior.observado || c.valor > maior.valor) maior = c;
  }
  return (
    maior ??
    ausente(
      "nao_observado",
      `Nenhuma praça de ${u.rotulo} tem carga observada nesta leitura.`,
    )
  );
}

function cargaDaUnidade(l: LeituraV4, u: UnidadeOperacional): Campo<number> {
  if (u.medicao !== "carga_por_praca") {
    return ausente(
      "integracao_pendente",
      u.motivo_sem_medicao ?? `${u.rotulo} não tem contagem de carga própria.`,
    );
  }
  let total = 0;
  let algumaObservada = false;
  for (const p of u.pracas) {
    const c = l.base.carga_por_praca[p];
    if (c === undefined) continue;
    algumaObservada = true;
    total += c;
  }
  return algumaObservada
    ? observado(total, l.procedencia, l.observado_em)
    : ausente(
        "nao_observado",
        `Nenhuma praça de ${u.rotulo} reportou carga. Ausência não é zero.`,
      );
}

/* ================================================================== *
 * Sinais por unidade — onde a não-absorção acontece
 * ================================================================== */

/**
 * A que unidade um sinal pertence, na leitura do Lab.
 *
 * A subárea manda mais que o ambiente, e é isso que impede o agregado de Sushi
 * de engolir Sushi Quentes: um sinal de `enrolados_quentes` responde por
 * `sushi_quentes`, mesmo carregando `ambiente: "sushi"` do lado canônico.
 */
/**
 * A identidade de um sinal pelo CONTEÚDO, não pela referência.
 *
 * Ela existe por causa de um defeito real, encontrado rodando as cenas: o Lab
 * chama `sinaisDe()` e `homeVM()` chama `sinaisDe()` de novo, internamente. Os
 * dois arrays descrevem os mesmos sinais e são objetos DIFERENTES — então
 * `s !== focoSinal` nunca casava, e **o sinal do Foco aparecia também na lista
 * de secundários**, duplicado. Comparar por referência entre dois resultados de
 * funções puras distintas é sempre essa armadilha.
 */
function chaveDoSinal(s: Sinal): string {
  return `${s.codigo}|${s.alvo_rotulo}|${s.pedido_id ?? ""}|${s.resumo}`;
}

export function unidadeDoSinal(s: Sinal): UnidadeOperacionalId | null {
  if (s.subarea !== null) return unidadeDaPraca(s.subarea);
  if (s.ambiente !== null) return s.ambiente as UnidadeOperacionalId;
  return null;
}

function corPorSeveridade(maior: 0 | 1 | 2 | 3): CorDaUnidade {
  if (maior >= 3) return "vermelho";
  if (maior >= 1) return "amarelo";
  return "verde";
}

function maiorSeveridade(sinais: readonly Sinal[]): 0 | 1 | 2 | 3 {
  let m: 0 | 1 | 2 | 3 = 0;
  for (const s of sinais) if (s.severidade > m) m = s.severidade;
  return m;
}

/* ================================================================== *
 * Itens
 * ================================================================== */

function itensDasPracas(
  pedidos: readonly PedidoLeitura[],
  pracas: readonly PracaId[],
): ItemEmProducao[] {
  const conta = new Map<string, number>();
  for (const p of pedidos) {
    for (const i of p.itens) {
      if (i.praca === null || !pracas.includes(i.praca)) continue;
      conta.set(i.nome, (conta.get(i.nome) ?? 0) + i.qtd);
    }
  }
  return [...conta.entries()]
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome));
}

/* ================================================================== *
 * Fontes
 * ================================================================== */

/**
 * O pulso — quantos pedidos estão em andamento.
 *
 * Ele **não** é reaproveitado de `homeVM`, e o motivo é um caso real: lá o pulso
 * é afirmado quando qualquer fonte se diz saudável, e o Cardápio (seed estático)
 * está sempre saudável. Numa cena em que a fonte de pedidos não respondeu, isso
 * devolveria `0` com aparência de medição. Aqui o pulso exige a fonte que
 * realmente conta pedidos.
 */
function pulsoV4(l: LeituraV4): Campo<number> {
  const contadoras = l.fontes.filter((f) => f.conta_pedidos);
  const alguemContou = contadoras.some((f) => descricao(f.estado).sustenta_calmo);
  if (!alguemContou) {
    return ausente(
      "indisponivel",
      contadoras.length === 0
        ? "Nenhuma fonte desta leitura conta pedidos. O pulso não pode ser afirmado, e ausência não é zero."
        : "A fonte que conta pedidos não está saudável. O pulso não pode ser afirmado, e ausência não é zero.",
    );
  }
  return observado(l.base.pedidos.length, l.procedencia, l.observado_em);
}

function fonteVM(f: FonteV4): FonteVM {
  return {
    id: f.id,
    rotulo: f.rotulo,
    estado: descricao(f.estado),
    detalhe: f.detalhe,
    ultima_atualizacao: f.ultima_atualizacao,
    necessaria_para_calmo: f.necessaria_para_calmo,
    conta_pedidos: f.conta_pedidos,
    unidades: f.unidades,
  };
}

/* ================================================================== *
 * Unidade
 * ================================================================== */

function unidadeVM(
  l: LeituraV4,
  u: UnidadeOperacional,
  sinais: readonly Sinal[],
  fontes: readonly FonteVM[],
): UnidadeVM {
  const daUnidade = sinais.filter((s) => unidadeDoSinal(s) === u.id);
  const minhasFontes = fontes.filter((f) => f.unidades.includes(u.id));
  const pressao = pressaoDaUnidade(l, u);
  const carga = cargaDaUnidade(l, u);

  const sevPintura = maiorSeveridade(daUnidade.filter((s) => s.pinta_ambiente));

  // Uma fonte só sustenta verde se ela própria sustenta calma E, quando a
  // unidade é medida por carga, a carga tiver de fato chegado. Fonte que se diz
  // saudável e não entrega leitura não vale como leitura.
  const fonteConfiavel =
    u.medicao !== "sem_medicao_automatica" &&
    minhasFontes.length > 0 &&
    minhasFontes.every((f) => f.estado.sustenta_calmo) &&
    (u.medicao !== "carga_por_praca" || pressao.observado);

  // Ordem deliberada: problema visível primeiro. Uma unidade em pressão nunca é
  // escondida por falta de fonte, e uma unidade sem fonte nunca fica verde.
  const cor: CorDaUnidade =
    sevPintura >= 2
      ? corPorSeveridade(sevPintura)
      : !fonteConfiavel
        ? "sem_medicao"
        : corPorSeveridade(sevPintura);

  const degradadas = minhasFontes.filter((f) => !f.estado.sustenta_calmo);
  // A ORDEM IMPORTA, e ela foi corrigida olhando a tela. A versão anterior
  // preferia o sinal que pinta, e a Caixa — que nunca tem medição — passou a
  // explicar o próprio estado com "18 pedidos na última hora": um sinal de
  // chegada respondendo por uma área que ninguém mede. Numa unidade sem
  // medição, a manchete é a AUSÊNCIA. O sinal não some: ele continua inteiro
  // em `sinais_ativos` e no bloco de Ambiente.
  const motivo =
    cor === "sem_medicao"
      ? degradadas.length > 0
        ? `${degradadas.map((f) => f.rotulo).join(" e ")}: ${degradadas[0]!.estado.consequencia}`
        : (u.motivo_sem_medicao ?? "Sem fonte de medição para esta unidade.")
      : (daUnidade.find((s) => s.pinta_ambiente)?.resumo ??
        `${u.rotulo} em ritmo normal.`);

  const ultima = minhasFontes
    .map((f) => f.ultima_atualizacao)
    .filter((d): d is string => d !== null)
    .sort()
    .pop() ?? null;

  return {
    id: u.id,
    rotulo: u.rotulo,
    descricao: u.descricao,
    experimental: u.experimental,
    parent: u.parent,
    cor,
    estado_texto: TEXTO_COR[cor],
    motivo,
    carga,
    pressao,
    pracas_contadas: u.pracas.filter(
      (p) => l.base.carga_por_praca[p] !== undefined,
    ).length,
    fontes: minhasFontes,
    sinais_ativos: daUnidade,
    itens_em_producao: itensDasPracas(l.base.pedidos, u.pracas),
    ultima_atualizacao: ultima,
    sem_medicao_porque: cor === "sem_medicao" ? motivo : null,
  };
}

/* ================================================================== *
 * Ligações
 * ================================================================== */

function ligacoesVM(unidades: readonly UnidadeVM[]): LigacaoVM[] {
  const porId = new Map(unidades.map((u) => [u.id, u]));
  return CAMINHO_DO_PEDIDO_V4.map(({ de, para }) => {
    const origem = porId.get(de);
    const cor: CorDaUnidade = origem ? origem.cor : "sem_medicao";
    const de_rotulo = unidadePorId(de).rotulo;
    const para_rotulo = unidadePorId(para).rotulo;
    // `sem_medicao` cai em `inerte` de propósito: unidade sem leitura não pode
    // afirmar que está empurrando pressão adiante.
    const intensidade: IntensidadeDeLigacao =
      cor === "vermelho" ? "carregada" : cor === "amarelo" ? "ativa" : "inerte";
    return {
      de,
      para,
      de_rotulo,
      para_rotulo,
      intensidade,
      texto:
        intensidade === "inerte"
          ? null
          : intensidade === "carregada"
            ? `${de_rotulo} está segurando o fluxo que chega em ${para_rotulo}.`
            : `A tensão em ${de_rotulo} começa a alcançar ${para_rotulo}.`,
    };
  });
}

/* ================================================================== *
 * Foco
 * ================================================================== */

const CONFIANCA_NAO_ESTIMADA =
  "Confiança: não estimada. Nenhuma política apurou confiança para esta leitura, e o sistema não estima. Não há percentual, nota nem cor por trás disto.";

function contornoDe(
  l: LeituraV4,
  s: Sinal,
): ContornoDoSinal | null {
  return (
    l.contornos.find(
      (c) => c.codigo === s.codigo && c.alvo_rotulo === s.alvo_rotulo,
    ) ?? null
  );
}

function pedidosDoFoco(l: LeituraV4, s: Sinal, u: UnidadeOperacional | null): string[] {
  if (s.pedido_id !== null) return [s.pedido_id];
  if (u === null) return l.base.pedidos.map((p) => p.id);
  return l.base.pedidos
    .filter((p) => p.itens.some((i) => i.praca !== null && u.pracas.includes(i.praca)))
    .map((p) => p.id);
}

function itensDoFoco(
  l: LeituraV4,
  pedidos: readonly string[],
  u: UnidadeOperacional | null,
): ItemEmProducao[] {
  const envolvidos = l.base.pedidos.filter((p) => pedidos.includes(p.id));
  const pracas: readonly PracaId[] =
    u !== null && u.pracas.length > 0
      ? u.pracas
      : ([
          ...new Set(
            envolvidos.flatMap((p) =>
              p.itens.map((i) => i.praca).filter((x): x is PracaId => x !== null),
            ),
          ),
        ] as PracaId[]);
  return itensDasPracas(envolvidos, pracas);
}

function focoVM(
  l: LeituraV4,
  s: Sinal,
  fontes: readonly FonteVM[],
): FocoVM {
  const unidadeId = unidadeDoSinal(s);
  const u = unidadeId !== null ? unidadePorId(unidadeId) : null;
  const contorno = contornoDe(l, s);
  const pedidos = pedidosDoFoco(l, s, u);
  const minhasFontes =
    unidadeId !== null ? fontes.filter((f) => f.unidades.includes(unidadeId)) : fontes;

  return {
    sinal: s,
    situacao: s.resumo,
    unidade: unidadeId,
    unidade_rotulo: u !== null ? u.rotulo : null,
    motivo_da_escolha:
      contorno?.motivo_da_escolha ??
      `Foi eleito porque é o único sinal em severidade ${s.severidade} nesta leitura, e a Operação Viva mantém uma única orientação principal.`,
    pedidos_envolvidos: pedidos,
    itens_envolvidos: itensDoFoco(l, pedidos, u),
    evidencias: s.evidencias,
    fontes: minhasFontes,
    confianca: ausente(
      "nao_observado",
      "Nenhuma política apurou confiança para este sinal. O sistema não estima.",
    ),
    confianca_texto: CONFIANCA_NAO_ESTIMADA,
    validade_ate: contorno?.validade_ate ?? null,
    condicao_de_retirada: contorno?.condicao_de_retirada ?? null,
    acao_humana: s.orientacao,
    impacto_esperado: contorno?.impacto_esperado ?? s.limitacao,
    executa: false,
  };
}

/* ================================================================== *
 * A view model
 * ================================================================== */

export function operacaoVivaV4VM(l: LeituraV4): OperacaoVivaV4VM {
  if (l.procedencia === "real") {
    throw new Error(
      "O Lab não aceita leitura de procedência real: ele é uma superfície experimental sobre fixture.",
    );
  }

  const sinais = sinaisDe(l.base);
  // A eleição canônica vem do produto, declarada como demonstração — é o mesmo
  // caminho que a home usa para cena de fixture, e não abre bypass nenhum.
  const canonica = homeVM(l.base, {
    tipo: "demonstracao",
    motivo:
      "Cena do Lab Operação Viva V4: instante isolado de fixture, sem eixo de tempo para a política temporal.",
  });

  const fontes = l.fontes.map(fonteVM);
  const eleicao = elegerModoV4(
    canonica.modo,
    l.fontes,
    l.ausencias_materiais,
    l.divergencias,
  );

  const unidades = UNIDADES.map((u) => unidadeVM(l, u, sinais, fontes));

  // O sinal eleito, reencontrado NESTE array por chave de conteúdo. Sem isto o
  // Foco apareceria duas vezes: uma no painel e outra entre os secundários.
  const chaveDoFoco =
    canonica.foco !== null ? chaveDoSinal(canonica.foco.sinal) : null;
  const focoSinal =
    chaveDoFoco !== null
      ? (sinais.find((s) => chaveDoSinal(s) === chaveDoFoco) ?? null)
      : null;

  const limitacoes: Limitacao[] = [
    {
      titulo: "Leitura de demonstração",
      texto:
        "Os pedidos, tempos e cargas desta cena são FIXTURE. O cardápio (199 itens, 8 praças), os baselines calibrados e as REGRAS dos sinais são reais. Nada aqui representa a operação neste momento.",
    },
    {
      titulo: "Sushi Quentes é projeção experimental do Lab",
      texto:
        "O domínio canônico continua com cinco ambientes, e Sushi Quentes segue sendo subárea de Sushi (D45/D46). Esta rota a representa como unidade própria para testar a leitura operacional. A migração de domínio não ocorreu.",
    },
    {
      titulo: "Nenhuma ação é executada",
      texto:
        "Esta rota descreve e orienta. Não existe controle que execute, nenhuma praça é pausada automaticamente, e nenhuma orientação dispensa uma pessoa decidindo.",
    },
    {
      titulo: "Os dois motores continuam desconectados",
      texto:
        "O motor de decisão original e o Copiloto Shadow não estão ligados (D43). Validade e condição de retirada são DECLARADAS na fixture, não traduzidas entre motores.",
    },
    {
      titulo: "A rota do Caixa não é alcançável por medição",
      texto: LIMITE_CONHECIDO_DA_ROTA_DO_CAIXA,
    },
  ];

  return {
    cenario_id: l.cenario_id,
    titulo_cenario: l.titulo,
    demonstra: l.demonstra,
    versao_fixture: l.versao_fixture,
    procedencia: l.procedencia,
    demonstracao: true,
    observado_em: l.observado_em,

    eleicao,
    modo: eleicao.modo,
    titulo: tituloDoModo(eleicao),
    apoio: apoioDoModo(eleicao),

    pulso: pulsoV4(l),
    ritmo: l.ritmo,
    unidades,
    ligacoes: ligacoesVM(unidades),
    foco: focoSinal !== null ? focoVM(l, focoSinal, fontes) : null,
    ambiente: sinais.filter((s) => s !== focoSinal),
    total_de_sinais: sinais.length,
    sinais_retirados: l.sinais_retirados,
    fontes,
    divergencias: l.divergencias,
    ausencias_materiais: l.ausencias_materiais,
    consolidacoes: l.base.pedidos.map((p) =>
      decidirConsolidacao(p, l.condicoes_por_pedido[p.id] ?? {}),
    ),
    sinais_indisponiveis: SINAIS_INDISPONIVEIS,
    limitacoes,
    validacao_esperada: l.validacao_esperada,
  };
}

/** Reexportado para a superfície não precisar conhecer o produto direto. */
export type { ItemDoPedido, Sinal };
