/* ES5/bootstrap: never evaluate modern code on a legacy Android WebView.
 * No eval/new Function, no remote script, no user/order payloads.
 * Fail closed from initial HTML until the separate modern module executes. */
(function () {
  var main = document.getElementById("main");
  var nav = document.querySelector(".m-nav");
  var hold = document.getElementById("compatibilityHold");
  var title = document.getElementById("compatibilityTitle");
  var detail = document.getElementById("compatibilityDetail");
  var conn = document.getElementById("connLine");
  if (!main || !nav || !hold || !title || !detail || !conn) return;

  var started = false;
  var timeout = setTimeout(function () {
    if (started) return;
    title.textContent = "Não foi possível iniciar o Entregas";
    detail.textContent =
      "O componente Android WebView pode estar desatualizado ou o aplicativo indisponível. " +
      "Nenhuma ação foi registrada por esta tela. Avise o responsável antes de repetir uma confirmação.";
    hold.setAttribute("role", "alert");
    conn.textContent = "Aplicativo indisponível";
  }, 1200);

  window.__entregasRiderCompatibilityPassed = function () {
    if (started) return;
    started = true;
    clearTimeout(timeout);
    // Only the modern module can release UI. No command/GPS is issued here.
    hold.hidden = true;
    main.hidden = false;
    main.style.display = "";
    nav.hidden = false;
    nav.style.display = "";
    conn.textContent = "Conexão…";
    var app = document.createElement("script");
    app.type = "module";
    app.src = "/rider-mobile/rider.js";
    document.body.appendChild(app);
  };

  var probe = document.createElement("script");
  probe.type = "module";
  probe.src = "/rider-mobile/compat-modern-probe.js";
  document.body.appendChild(probe);
})();
