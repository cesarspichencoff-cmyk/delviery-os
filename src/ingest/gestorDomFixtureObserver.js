/* DeliveryOS — bancada OFFLINE de leitura passiva DOM (NAO integracao ao Gestor).
 * Sem API, rede, extensao instalada, armazenamento ou autoridade operacional.
 * O esquema DEMONSTRACAO e fixo: nao converter esse output em fato real.
 */
(function (host) {
  "use strict";
  const SCHEMA = "deliveryos.gestor-dom-fixture.v1";
  const STATES = Object.freeze({
    "Aceito": "aceito",
    "Em preparo": "em_producao",
    "Pronto": "pronto",
    "Despachado": "despachado",
    "Cancelado": "cancelado"
  });
  const REFERENCE = /^PED-[0-9]{3,8}$/;
  const MAX_ROWS = 50;
  const MAX_FIELD = 60;

  function start({ root, selectors, onSnapshot, maxAgeMs = 30000 }) {
    if (!root || typeof root.querySelectorAll !== "function") throw Error("ROOT_INVALIDO");
    if (typeof onSnapshot !== "function") throw Error("CALLBACK_INVALIDO");
    if (!selectors || typeof selectors !== "object") throw Error("SELETORES_AUSENTES");
    for (const key of ["container", "row", "reference", "status"]) {
      if (typeof selectors[key] !== "string" || !selectors[key].trim()
        || selectors[key].length > 100) throw Error("SELETOR_INVALIDO:" + key);
    }
    if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 60000)
      throw Error("TTL_INVALIDO");

    let running = true;
    let last = null;
    let digest = null;
    let pending = false;

    function read() {
      if (!running) return;
      const observedAt = new Date().toISOString();
      const region = root.querySelector(selectors.container);
      let state = "observado";
      let reason = null;
      const observations = [];
      if (!region) {
        state = "indisponivel"; reason = "REGIAO_AUSENTE";
      } else {
        const rows = Array.from(region.querySelectorAll(selectors.row));
        if (rows.length === 0) {
          // Lista vazia pode significar carregamento incompleto, nao zero pedidos.
          state = "indisponivel"; reason = "LISTA_VAZIA_SEM_PROVA";
        } else if (rows.length > MAX_ROWS) {
          state = "indisponivel"; reason = "LIMITE_EXCEDIDO";
        } else {
          const seen = new Set();
          for (const row of rows) {
            const refEl = row.querySelector(selectors.reference);
            const stateEl = row.querySelector(selectors.status);
            const ref = refEl?.textContent?.trim() ?? "";
            const label = stateEl?.textContent?.trim() ?? "";
            // Nao reproduz texto livre nem campos pessoais; apenas token e estado exatos.
            if (ref.length > MAX_FIELD || label.length > MAX_FIELD ||
                !REFERENCE.test(ref) || !Object.hasOwn(STATES, label) ||
                seen.has(ref)) {
              state = "indisponivel"; reason = "CAMPO_NAO_QUALIFICADO";
              observations.length = 0; break;
            }
            seen.add(ref);
            observations.push({ reference_token: ref, state: STATES[label] });
          }
        }
      }
      observations.sort((a, b) => a.reference_token.localeCompare(b.reference_token));
      const key = JSON.stringify({ state, reason, observations });
      last = { schema: SCHEMA, source_mode: "demonstracao", source_id: "gestor_dom_fixture",
        state, reason, observed_at: observedAt, observations };
      if (key !== digest) {
        digest = key;
        onSnapshot(last);
      }
    }

    function schedule() {
      if (!running || pending) return;
      pending = true;
      queueMicrotask(() => { pending = false; read(); });
    }
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    read();
    return Object.freeze({
      current(now = Date.now()) {
        if (!last) return { state: "indisponivel", reason: "SEM_LEITURA" };
        if (now - Date.parse(last.observed_at) > maxAgeMs)
          return { ...last, state: "indisponivel", reason: "DADOS_ANTIGOS",
            observations: [] };
        return last;
      },
      stop() { running = false; observer.disconnect(); },
    });
  }

  Object.defineProperty(host, "__DELIVERYOS_GESTOR_DOM_FIXTURE__", {
    value: Object.freeze({ start }), configurable: false, writable: false
  });
})(globalThis);
