/** Controle de momentos do laboratório (dados estáticos de Entregas) */
(function () {
  "use strict";
  const moments = ["ambiente", "foco", "bloqueio", "fechamento", "mobile"];
  function apply(m) {
    document.body.dataset.moment = m;
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.hidden = p.getAttribute("data-panel") !== m;
    });
    document.querySelectorAll("[data-moment-btn]").forEach((b) => {
      b.setAttribute("aria-pressed", b.getAttribute("data-moment-btn") === m ? "true" : "false");
    });
    const sel = document.getElementById("moment-select");
    if (sel) sel.value = m;
  }
  function init() {
    const sel = document.getElementById("moment-select");
    if (sel) {
      sel.innerHTML = moments
        .map((m) => {
          const labels = {
            ambiente: "Desktop · Ambiente",
            foco: "Desktop · Foco",
            bloqueio: "Desktop · Bloqueio",
            fechamento: "Desktop · Fechamento",
            mobile: "Mobile · Próximo passo"
          };
          return `<option value="${m}">${labels[m]}</option>`;
        })
        .join("");
      sel.onchange = () => apply(sel.value);
    }
    document.querySelectorAll("[data-moment-btn]").forEach((b) => {
      b.addEventListener("click", () => apply(b.getAttribute("data-moment-btn")));
    });
    apply(document.body.dataset.moment || "ambiente");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
