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
    return "Confirme a verificação do entregador do iFood antes de liberar.";
  if (/HANDOFF_VOLUMES|Volumes/i.test(m))
    return "Confira os volumes: o que saiu precisa bater com o esperado.";
  if (/Pedido deve estar identificado/i.test(m))
    return "Identifique o pedido correto antes de liberar.";
  if (/conference_actor|handoff_actor|internos/i.test(m))
    return "Informe quem conferiu e quem libera o pedido na casa.";
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

export function connectionLabel(conn, pending) {
  if (conn === "offline") {
    return pending > 0
      ? "Sem rede — confirmações guardadas neste aparelho"
      : "Sem rede no momento";
  }
  if (conn === "syncing") return "Enviando atualizações…";
  if (pending > 0) return `Enviando ${pending} atualização(ões)…`;
  return "Online";
}
