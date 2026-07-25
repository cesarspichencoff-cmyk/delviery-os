/* Tela do termo de localização — primeira coisa que o motoboy vê antes de
 * qualquer pedido de permissão do Android.
 *
 * Regras de tela (Adendo §4.4), todas verificáveis:
 *  - o checkbox NASCE desmarcado, sempre;
 *  - "CONCORDAR E CONTINUAR" fica desabilitado enquanto o checkbox não for
 *    marcado — e marcar é ato do dedo do motoboy, nunca default;
 *  - recusar é uma opção de verdade, com o mesmo peso visual;
 *  - nada de dark pattern: sem botão escondido, sem texto colapsado que
 *    esconde o essencial, sem contagem regressiva empurrando o aceite;
 *  - a consequência de recusar é dita de forma neutra e encaminha ao
 *    responsável — nunca ameaça.
 */

export const CONSENT_LABELS = {
  read_full: "LER TERMO COMPLETO",
  checkbox: "Li e compreendi como a localização será usada durante as viagens",
  accept: "CONCORDAR E CONTINUAR",
  decline: "NÃO CONCORDAR / VOLTAR",
  copy: "BAIXAR OU RECEBER UMA CÓPIA",
};

/**
 * Cria a máquina da tela. Sem DOM aqui — o estado é testável sozinho e o
 * render é uma função pura de estado, igual ao indicador de GPS.
 */
export function createConsentScreen(opts = {}) {
  const term = opts.term || null;
  const summary = opts.summary || "";
  const onAccept = opts.onAccept || (async () => ({ ok: true }));
  const onDecline = opts.onDecline || (async () => ({ ok: true }));
  const onRender = opts.onRender || (() => {});

  // Nasce desmarcado. Não existe caminho que inicialize isto como true.
  let checked = false;
  let expanded = false;
  let submitting = false;
  let result = null;
  let error = null;

  function state() {
    return {
      // Sem termo publicável não há tela de aceite — e o motivo aparece.
      available: Boolean(term),
      unavailable_reason: term
        ? null
        : "O termo de localização ainda não foi liberado pelo responsável.",
      title: term ? term.title : "",
      summary,
      body: expanded && term ? term.body : "",
      expanded,
      checked,
      // A única porta para o aceite passa pelo checkbox marcado à mão.
      can_accept: Boolean(term) && checked && !submitting && result !== "accepted",
      can_decline: !submitting,
      submitting,
      result,
      error,
      labels: CONSENT_LABELS,
      retention: term
        ? {
            evento_operacional_dias: term.retention.operational_event_days,
            ponto_detalhado_dias: term.retention.detailed_point_days,
            apos_o_prazo:
              term.retention.after_expiry === "delete"
                ? "os dados são apagados"
                : "os dados perdem detalhe",
          }
        : null,
      contact: term ? term.controller.contact_channel : null,
      version: term ? term.version : null,
    };
  }

  function render() {
    onRender(state());
  }

  return {
    toggleFull() {
      expanded = !expanded;
      render();
      return expanded;
    },
    /** Marcar é sempre ato explícito; nunca é chamado na inicialização. */
    setChecked(v) {
      checked = v === true;
      render();
      return checked;
    },
    async accept(ctx) {
      if (!state().can_accept) return { ok: false, error: "aceite_nao_habilitado" };
      submitting = true;
      error = null;
      render();
      try {
        const r = await onAccept({ ...ctx, term });
        result = r && r.ok ? "accepted" : null;
        if (!r || !r.ok) error = (r && r.error) || "falha ao registrar";
        return r;
      } catch (e) {
        error = e && e.message ? e.message : "falha ao registrar";
        return { ok: false, error };
      } finally {
        submitting = false;
        render();
      }
    },
    async decline(ctx) {
      submitting = true;
      render();
      try {
        const r = await onDecline({ ...ctx, term });
        result = "declined";
        return r;
      } finally {
        submitting = false;
        render();
      }
    },
    state,
    /** Nunca ativa GPS: quem decide é o portão, e ele exige aceite registrado. */
    consentGranted: () => result === "accepted",
  };
}

/** Frase neutra sobre a consequência de recusar. Sem ameaça, sem promessa. */
export const DECLINE_CONSEQUENCE =
  "Sem a localização, a operação não consegue acompanhar a viagem nem ajudar " +
  "rápido se acontecer algum problema no caminho. Se você não quiser " +
  "autorizar, procure o responsável pela operação para combinar como seguir.";

/** Renderiza no DOM. Nunca escreve coordenada — o termo não tem nenhuma. */
export function renderConsentScreen(el, s) {
  if (!el) return;
  el.dataset.available = String(s.available);
  el.dataset.checked = String(s.checked);
  el.dataset.canAccept = String(s.can_accept);
  el.dataset.result = s.result || "";
  if (!s.available) {
    el.textContent = s.unavailable_reason;
    return;
  }
  const parts = [s.title, s.summary];
  if (s.expanded) parts.push(s.body);
  if (s.retention) {
    parts.push(
      `Guardamos o registro da viagem por ${s.retention.evento_operacional_dias} dias e ` +
        `os pontos detalhados por ${s.retention.ponto_detalhado_dias} dias; depois disso, ` +
        `${s.retention.apos_o_prazo}.`,
    );
  }
  if (s.contact) parts.push(`Dúvidas e problemas: ${s.contact}`);
  if (s.error) parts.push(s.error);
  el.textContent = parts.filter(Boolean).join("\n\n");
}
