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
  return data;
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
    disponivel: ["Disponível", ""],
    pausa: ["Em pausa", "warn"],
    apoio_expedicao: ["Apoio à expedição", "warn"],
    indisponivel: ["Indisponível", "danger"],
    repassado: ["Entrega ao iFood concluída", ""],
    aguardando_courier: ["Aguardando entregador do iFood", "warn"],
    em_conferencia: ["Conferindo pedido", "warn"],
    excecao: ["Problema na expedição", "danger"],
  };
  const [label, cls] = map[state] || [state, "neutral"];
  return `<span class="chip ${cls}" role="status">${label}</span>`;
}
