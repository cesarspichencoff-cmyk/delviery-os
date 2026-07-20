/* Cliente UI ENTREGAS — só HTTP para facade; sem estado de domínio próprio */
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.result?.error || data.error || res.statusText);
    err.payload = data;
    throw err;
  }
  if (data.result && data.result.ok === false) {
    const raw = data.result.error || "Ação não concluída";
    const err = new Error(humanizeDomainError(raw));
    err.payload = data;
    throw err;
  }
  return data;
}

/** Traduz rejeições técnicas do domínio para português operacional */
export function humanizeDomainError(msg) {
  const m = String(msg || "");
  if (/trip_started de retornando/i.test(m))
    return "Esta viagem já saiu. Não dá para confirmar saída de novo.";
  if (/trip_started de/i.test(m))
    return "Não é possível confirmar a saída neste momento.";
  if (/MAX_STOPS|Máximo de paradas/i.test(m))
    return "Essa viagem já tem o máximo de paradas permitido no piloto.";
  if (/HANDOFF_NOT_VERIFIED|verificado/i.test(m))
    return "Confira sacolas, nome do pedido e número do iFood antes de entregar ao motoboy.";
  if (/HANDOFF_VOLUMES|Volumes/i.test(m))
    return "A quantidade de sacolas precisa bater com o definido pela casa.";
  if (/Pedido deve estar identificado/i.test(m))
    return "Confira se o nome e o número do pedido estão corretos.";
  if (/conference_actor|handoff_actor|internos/i.test(m))
    return "Informe o responsável interno pela liberação.";
  if (/não autoriz/i.test(m)) return "Seu perfil não pode fazer esta ação.";
  if (/Trip não encontrada/i.test(m)) return "Viagem não encontrada.";
  return m;
}

export async function snapshot() {
  return api("/api/snapshot");
}

export async function command(body) {
  return api("/api/command", { method: "POST", body: JSON.stringify(body) });
}

export function setStatus(el, text, kind = "neutral") {
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

export function renderError(box, msg) {
  if (!box) return;
  if (!msg) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = msg;
}

/** Rótulos humanos — sem jargão de domínio na UI */
export function chip(state) {
  const map = {
    preparando_saida: ["Preparando saída", "neutral"],
    em_rota: ["Em rota", ""],
    retornando: ["Retornando", "warn"],
    encerrada: ["Encerrada", "neutral"],
    sem_atualizacao: ["Sem atualização", "warn"],
    entrega_sem_confirmacao: ["Aguardando confirmação", "warn"],
    entregue_confirmado: ["Entrega confirmada", ""],
    cliente_nao_encontrado: ["Cliente não encontrado", "danger"],
    chegada_detectada: ["Chegada registrada", ""],
    aguardando_saida: ["Aguardando saída", "neutral"],
    disponivel: ["Disponível", ""],
    pausa: ["Em pausa", "warn"],
    apoio_expedicao: ["Apoio à expedição", "warn"],
    indisponivel: ["Indisponível", "danger"],
    repassado: ["Expedição concluída", ""],
    aguardando_courier: ["Aguardando entregador", "warn"],
    em_conferencia: ["Em conferência", "warn"],
    excecao: ["Problema na expedição", "danger"],
    cancelado: ["Cancelada", "neutral"],
  };
  const [label, cls] = map[state] || [state, "neutral"];
  return `<span class="chip ${cls}" role="status">${label}</span>`;
}

/**
 * Fonte única de conectividade para cabeçalho + banner.
 * conn: "online" | "offline" | "syncing" (snapshot da facade)
 * pending: contagem de confirmações ainda não enviadas
 *
 * Distingue:
 * - aparelho offline
 * - aparelho online com sincronização pendente
 * - nunca usa "Sem rede" quando online
 */
export function connectionState(conn, pending = 0) {
  const offline = conn === "offline";
  const syncing = conn === "syncing";
  const hasPending = Number(pending) > 0;

  if (offline) {
    return {
      mode: "offline",
      header: "Offline",
      showBanner: true,
      bannerTitle: "Sem rede",
      bannerDetail: hasPending
        ? "Confirmações ficam neste aparelho e sobem sozinhas quando a rede voltar."
        : "Sem rede no momento. Confirmações ficam neste aparelho até a rede voltar.",
    };
  }
  if (syncing || hasPending) {
    return {
      mode: "pending_sync",
      header: "Online",
      showBanner: true,
      bannerTitle: "Sincronização pendente",
      bannerDetail: hasPending
        ? `${pending} atualização(ões) aguardando envio — aparelho com rede.`
        : "Enviando atualizações… aparelho com rede.",
    };
  }
  return {
    mode: "online",
    header: "Online",
    showBanner: false,
    bannerTitle: "",
    bannerDetail: "",
  };
}

/** Rótulo curto do cabeçalho — mesma fonte que o banner */
export function connectionLabel(conn, pending) {
  return connectionState(conn, pending).header;
}
