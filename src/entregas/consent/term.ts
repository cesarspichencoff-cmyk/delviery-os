/**
 * Termo de ciência e autorização para uso de localização.
 *
 * Regras estruturais (Adendo §4):
 *  - o termo é VERSIONADO e tem hash: é preciso poder provar depois qual texto
 *    exato o motoboy leu;
 *  - mudança material exige nova ciência antes da próxima viagem rastreada;
 *  - correção ortográfica preserva a versão material, mas fica registrada;
 *  - o texto NÃO pode ser publicado com campo em branco (§5) — quem tenta
 *    publicar incompleto recebe erro, não um termo com "[preencher]" na tela.
 *
 * Este módulo não decide política jurídica: ele carrega o texto aprovado,
 * garante integridade e detecta o que ainda falta preencher.
 */

import { createHash } from "node:crypto";

/** Campos que dependem de decisão do responsável — não invento nenhum. */
export interface TermController {
  /** Razão social do controlador, conforme cadastro real. */
  legal_name: string;
  cnpj: string;
  /** Canal de dúvidas, acesso, correção e denúncia de rastreamento indevido. */
  contact_channel: string;
  /** Papel responsável pelo canal (função, nunca nome de pessoa). */
  contact_owner: string;
}

export interface TermRetention {
  /** Retenção do evento operacional (viagem, chegada, retorno). */
  operational_event_days: number;
  /** Retenção do ponto detalhado de GPS — normalmente menor. */
  detailed_point_days: number;
  /** O que acontece ao vencer: apagar ou reduzir granularidade. */
  after_expiry: "delete" | "reduce_granularity";
}

/**
 * Papéis que podem consultar localização. Lista fechada: acrescentar papel é
 * mudança material (§4.6).
 */
export const TERM_ACCESS_ROLES = [
  "despacho_autorizado",
  "gerencia_autorizada",
  "administracao_tecnica_restrita",
] as const;
export type TermAccessRole = (typeof TERM_ACCESS_ROLES)[number];

export interface LocationTerm {
  /** Versão publicada, ex. "1.0.0". Muda em qualquer alteração. */
  version: string;
  /**
   * Versão MATERIAL. Duas versões com o mesmo material_version dizem a mesma
   * coisa — correção ortográfica muda `version`, não esta.
   */
  material_version: string;
  unit_id: string;
  title: string;
  /** Corpo apresentado ao motoboy. */
  body: string;
  effective_date: string;
  controller: TermController;
  retention: TermRetention;
  access_roles: readonly TermAccessRole[];
  language: string;
  /** true quando o responsável aprovou a publicação deste texto. */
  approved: boolean;
}

/**
 * Marcador de campo pendente. Deliberadamente feio e impossível de confundir
 * com conteúdo real — se vazar para a tela, salta aos olhos.
 */
export const PENDING = "[[PENDENTE]]" as const;

export interface TermPendingField {
  field: string;
  message: string;
}

/**
 * Lista o que falta o responsável decidir. Enquanto houver item aqui, o termo
 * não pode ser apresentado.
 */
export function pendingFields(term: LocationTerm): TermPendingField[] {
  const out: TermPendingField[] = [];
  const check = (field: string, value: unknown, message: string) => {
    if (typeof value !== "string" || !value.trim() || value.includes(PENDING)) {
      out.push({ field, message });
    }
  };

  check("controller.legal_name", term.controller.legal_name, "razão social do controlador");
  check("controller.cnpj", term.controller.cnpj, "CNPJ do controlador");
  check("controller.contact_channel", term.controller.contact_channel, "canal de contato");
  check("controller.contact_owner", term.controller.contact_owner, "responsável pelo canal");
  check("effective_date", term.effective_date, "data de vigência");
  check("version", term.version, "versão do termo");

  if (term.body.includes(PENDING)) {
    out.push({ field: "body", message: "o texto ainda contém campo por preencher" });
  }
  if (!Number.isFinite(term.retention.operational_event_days) || term.retention.operational_event_days <= 0) {
    out.push({ field: "retention.operational_event_days", message: "prazo de retenção do evento operacional" });
  }
  if (!Number.isFinite(term.retention.detailed_point_days) || term.retention.detailed_point_days <= 0) {
    out.push({ field: "retention.detailed_point_days", message: "prazo de retenção do ponto detalhado" });
  }
  if (!term.access_roles.length) {
    out.push({ field: "access_roles", message: "papéis com acesso à localização" });
  }
  if (!term.approved) {
    out.push({ field: "approved", message: "aprovação do responsável pelo produto" });
  }

  return out;
}

/** Falha fechada: sem aprovação e sem campos preenchidos, não apresenta. */
export function isPublishable(term: LocationTerm): boolean {
  return pendingFields(term).length === 0;
}

/**
 * Hash do que foi APRESENTADO. Cobre o texto e tudo que o motoboy precisa
 * enxergar para o consentimento fazer sentido (finalidade, retenção, acesso,
 * controlador). Não cobre metadados irrelevantes para a leitura.
 */
export function hashTerm(term: LocationTerm): string {
  const material = [
    term.material_version,
    term.unit_id,
    term.language,
    term.title,
    term.body,
    term.controller.legal_name,
    term.controller.cnpj,
    term.controller.contact_channel,
    String(term.retention.operational_event_days),
    String(term.retention.detailed_point_days),
    term.retention.after_expiry,
    [...term.access_roles].sort().join(","),
  ].join("\n\n");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * Mudança material (§4.6): finalidade, dados, retenção, papéis, terceiros,
 * background, unidade, map matching externo. Na prática: se o hash material
 * mudou, é material. Correção ortográfica preserva `material_version` e o
 * corpo entra no hash — por isso a comparação é feita pelo par
 * (material_version, campos de política), não pelo texto inteiro.
 */
export function isMaterialChange(previous: LocationTerm, next: LocationTerm): boolean {
  if (previous.material_version !== next.material_version) return true;
  if (previous.unit_id !== next.unit_id) return true;
  if (previous.retention.operational_event_days !== next.retention.operational_event_days) return true;
  if (previous.retention.detailed_point_days !== next.retention.detailed_point_days) return true;
  if (previous.retention.after_expiry !== next.retention.after_expiry) return true;
  const a = [...previous.access_roles].sort().join(",");
  const b = [...next.access_roles].sort().join(",");
  if (a !== b) return true;
  if (previous.controller.legal_name !== next.controller.legal_name) return true;
  if (previous.controller.cnpj !== next.controller.cnpj) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Texto base — unidade ITAIM
 * ------------------------------------------------------------------ */

const BODY_V1 = `Para acompanhar as viagens e ajudar no controle das entregas, o
aplicativo usa a localização do aparelho durante uma viagem ativa.

QUANDO LIGA E QUANDO DESLIGA
A localização começa somente quando uma viagem é iniciada no sistema. Ela é
encerrada quando a viagem termina, é cancelada ou é encerrada pelo responsável
autorizado. Fora de uma viagem ativa, o aplicativo não deve rastrear o
aparelho — nem em pausa, nem fora do expediente.

O QUE É REGISTRADO
Durante a viagem, o sistema pode registrar a posição do aparelho, o horário, a
precisão do sinal, o estado online ou offline, e a velocidade e a direção
quando o próprio aparelho fornecer essas informações. Também são guardados os
registros técnicos necessários para os dados subirem quando a internet voltar.

PARA QUE É USADO
Para acompanhar a viagem, mostrar a última posição disponível, identificar
perda de sinal, ajudar no atendimento de ocorrências, registrar o histórico da
rota e apoiar a identificação da chegada e do retorno à unidade.

O QUE A LOCALIZAÇÃO NÃO FAZ
A localização não confirma sozinha que uma entrega foi concluída, que o
cliente recebeu o pedido ou que um pagamento foi feito. A confirmação da
entrega continua dependendo do procedimento operacional.
A localização não será usada isoladamente para aplicar punição, nem para criar
ranking automático de velocidade ou de produtividade.
Ficar sem sinal não é irregularidade. Falha de GPS, área sem cobertura e
bateria acabando acontecem — e não serão tratadas como conduta errada.

QUEM PODE VER
O acesso fica restrito aos responsáveis autorizados pela operação e pela
administração do sistema. Consultas administrativas relevantes à rota ficam
registradas.

POR QUANTO TEMPO FICA GUARDADO
Conforme a política de retenção mostrada nesta tela.

SE A PERMISSÃO ESTIVER DESLIGADA
O aplicativo continua funcionando e a viagem pode ser feita, mas a operação
deixa de ver onde você está — o que atrapalha o apoio em caso de ocorrência.
Se a permissão estiver desligada e isso for um problema para a viagem, procure
o responsável pela operação.

DÚVIDAS E PROBLEMAS
Você pode pedir informações sobre o uso dos dados, solicitar correção e
avisar sobre qualquer funcionamento incorreto — inclusive se achar que houve
rastreamento fora de viagem — pelos canais informados nesta tela.

Ao continuar, você declara que recebeu estas informações, entendeu quando e
para que a localização será usada, e autoriza o uso do recurso durante as
viagens realizadas pelo TATÁ Entregas.`;

/**
 * Versão inicial. Nasce NÃO publicável de propósito: os campos que dependem de
 * decisão do responsável estão marcados com PENDENTE e `approved: false`.
 * Preencher é ato humano, registrado — não default de código.
 */
export const TERM_ITAIM_V1: LocationTerm = {
  version: "1.0.0",
  material_version: "1",
  unit_id: "ITAIM",
  title: "TERMO DE CIÊNCIA E AUTORIZAÇÃO PARA USO DE LOCALIZAÇÃO — TATÁ ENTREGAS · UNIDADE ITAIM",
  body: BODY_V1,
  effective_date: PENDING,
  controller: {
    legal_name: PENDING,
    cnpj: PENDING,
    contact_channel: PENDING,
    contact_owner: PENDING,
  },
  retention: {
    // Números presentes para dar forma à estrutura; a decisão é do responsável
    // e `approved: false` impede que virem política por omissão.
    operational_event_days: 365,
    detailed_point_days: 30,
    after_expiry: "reduce_granularity",
  },
  access_roles: TERM_ACCESS_ROLES,
  language: "pt-BR",
  approved: false,
};

/** Resumo curto mostrado ANTES do termo completo (§4.7 passo 1). */
export const TERM_SUMMARY_ITAIM =
  "O aplicativo usa sua localização somente durante uma viagem ativa, para " +
  "a operação acompanhar a entrega e ajudar se algo der errado. Fora da " +
  "viagem, não. A localização não confirma entrega sozinha e não gera " +
  "ranking nem punição automática.";
