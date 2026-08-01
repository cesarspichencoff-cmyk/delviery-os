/**
 * DeliveryOS — Product System · arquitetura de navegacao
 *
 * A navegacao reflete o TRABALHO de quem opera, nao a estrutura de pastas do
 * codigo. Por isso os agrupamentos sao "o que esta acontecendo agora", "o que o
 * sistema entendeu" e "como a casa e conduzida" — e nao "platform", "entregas",
 * "conference-brain".
 *
 * `disponibilidade` e afirmacao verificavel, nao promessa: um modulo so e
 * `implementado` se existe rota renderizavel nesta unidade.
 */

import type { EstadoSemantico } from "./estados";

export type DisponibilidadeModulo = "implementado" | "futuro";

export interface Modulo {
  readonly id: string;
  readonly nome: string;
  /** Uma frase. O que a pessoa vem fazer aqui — nunca o que a tecnologia faz. */
  readonly descricao: string;
  readonly icone: string;
  readonly grupo: GrupoNavegacao;
  readonly rota: string;
  readonly disponibilidade: DisponibilidadeModulo;
  /** Selo que a navegacao mostra quando o modulo nao esta implementado. */
  readonly estado: EstadoSemantico;
  /** Visao conceitual: o que este modulo sera. Aparece na tela de modulo futuro. */
  readonly visao: string;
}

export type GrupoNavegacao = "agora" | "entendimento" | "casa";

export const GRUPOS: readonly {
  id: GrupoNavegacao;
  nome: string;
  descricao: string;
}[] = [
  {
    id: "agora",
    nome: "Agora",
    descricao: "O que esta acontecendo na rua e no balcao neste momento.",
  },
  {
    id: "entendimento",
    nome: "Entendimento",
    descricao: "O que o sistema observou, concluiu e ainda nao consegue afirmar.",
  },
  {
    id: "casa",
    nome: "A casa",
    descricao: "Como a operacao se sustenta, aprende e cresce.",
  },
];

export const MODULOS: readonly Modulo[] = [
  {
    id: "entregas",
    nome: "Entregas",
    descricao: "Quem esta na rua, com o que, e o que precisa de gente.",
    icone: "rota",
    grupo: "agora",
    rota: "/entregas",
    disponibilidade: "implementado",
    estado: "somente_demonstracao",
    visao: "",
  },
  {
    id: "operacao-viva",
    nome: "Operacao Viva",
    descricao: "As dimensoes da unidade e a integridade de cada sinal.",
    icone: "pulso",
    grupo: "agora",
    rota: "/operacao-viva",
    disponibilidade: "implementado",
    estado: "somente_demonstracao",
    visao: "",
  },
  {
    id: "conference-brain",
    nome: "Conference Brain",
    descricao: "O que foi observado, o que foi concluido, e o que falta observar.",
    icone: "camadas",
    grupo: "entendimento",
    rota: "/conference-brain",
    disponibilidade: "implementado",
    estado: "somente_demonstracao",
    visao: "",
  },
  {
    id: "copiloto",
    nome: "Copiloto",
    descricao: "Propostas em sombra. Nenhuma acao e executada.",
    icone: "sombra",
    grupo: "entendimento",
    rota: "/copiloto",
    disponibilidade: "implementado",
    estado: "shadow",
    visao: "",
  },
  {
    id: "crm-conversa",
    nome: "CRM e Conversa",
    descricao: "A memoria do que o cliente ja disse.",
    icone: "conversa",
    grupo: "casa",
    rota: "/crm-conversa",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "Quatro anos de conversa de WhatsApp viram conhecimento consultavel: quem e o cliente, o que ja deu errado com ele, e o que a casa aprendeu a nao repetir. Nao e caixa de entrada — e memoria.",
  },
  {
    id: "caixa",
    nome: "Caixa",
    descricao: "O dinheiro do dia, sem planilha paralela.",
    icone: "caixa",
    grupo: "casa",
    rota: "/caixa",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "Fechamento que nasce dos fatos ja registrados pela operacao, em vez de pedir digitacao no fim do expediente. Divergencia vira pergunta especifica, nao relatorio para procurar.",
  },
  {
    id: "suprimentos",
    nome: "Suprimentos",
    descricao: "O que vai faltar antes de faltar.",
    icone: "suprimentos",
    grupo: "casa",
    rota: "/suprimentos",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "Consumo real cruzado com cardapio e movimento para antecipar ruptura. Nao e estoque de ERP: e a pergunta 'o que compro hoje' respondida antes de alguem perceber o buraco.",
  },
  {
    id: "evolucao",
    nome: "Evolucao",
    descricao: "O que mudou na operacao, e se melhorou.",
    icone: "evolucao",
    grupo: "casa",
    rota: "/evolucao",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "Cada mudanca deliberada vira observacao com antes e depois. Aprendizado estrutural segue observacao, evidencia, proposta e aprovacao humana — nunca regra automatica permanente.",
  },
  {
    id: "treinamento",
    nome: "Treinamento",
    descricao: "O que a equipe precisa saber, no momento em que precisa.",
    icone: "treinamento",
    grupo: "casa",
    rota: "/treinamento",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "O conhecimento que hoje mora na cabeca de tres pessoas vira material que chega no contexto certo. Nasce das ocorrencias reais, nao de um curso escrito do zero.",
  },
  {
    id: "selecao-rh",
    nome: "Selecao e RH",
    descricao: "Quem entra, quem fica, e por que.",
    icone: "pessoas",
    grupo: "casa",
    rota: "/selecao-rh",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "Historico operacional que apoia decisao de gente sem virar vigilancia: o sistema mostra o que aconteceu, e a pessoa decide. Nunca ranking, nunca pontuacao de individuo.",
  },
  {
    id: "gestao",
    nome: "Gestao",
    descricao: "A leitura da casa inteira, em uma tela.",
    icone: "gestao",
    grupo: "casa",
    rota: "/gestao",
    disponibilidade: "futuro",
    estado: "futuro",
    visao:
      "A visao de quem responde pelo negocio: poucas afirmacoes sustentadas por evidencia, cada uma com o caminho de volta ate o fato que a produziu. Nao e BI, e nao mostra tudo.",
  },
];

export function modulosImplementados(): readonly Modulo[] {
  return MODULOS.filter((m) => m.disponibilidade === "implementado");
}

export function modulosFuturos(): readonly Modulo[] {
  return MODULOS.filter((m) => m.disponibilidade === "futuro");
}

export function moduloPorRota(rota: string): Modulo | undefined {
  return MODULOS.find((m) => m.rota === rota);
}

/**
 * As unidades que o seletor oferece. Vem de configuracao de apresentacao, nao de
 * banco: esta unidade nao consulta `identity`/`entregas` no PostgreSQL.
 */
export interface Unidade {
  readonly unit_id: string;
  readonly nome: string;
  readonly praca: string;
}

export const UNIDADES: readonly Unidade[] = [
  { unit_id: "demo-unit", nome: "TATA — unidade de demonstracao", praca: "demonstracao" },
];
