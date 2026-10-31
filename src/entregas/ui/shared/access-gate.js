/* Entrada por código de acesso pessoal — console de expedição e rider-mobile.
 *
 * O piloto já autentica cada requisição pelo código de quem age (usuários do
 * arquivo do piloto ou de ENTREGAS_USERS) e o boot da página já sabe guardar
 * o código (`entregasPilotLogin`). Faltava a porta: sem código guardado, o
 * console e a tela do motoboy não ofereciam como entrar, e no tablet, no caixa
 * ou no celular a primeira tela parava em "acesso não autorizado".
 *
 * Nada novo de autenticação aqui: o mesmo código, a mesma sessão por
 * requisição, a mesma revogação (o responsável tira o código do cadastro).
 */
const TOKEN_KEY = "entregas_pilot_token";

function sair() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* armazenamento indisponível: nada guardado para apagar */
  }
  location.reload();
}

function montarSair(lugar) {
  if (!lugar || document.getElementById("accessLogout")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "accessLogout";
  b.className = "access-logout";
  b.textContent = "Sair";
  b.addEventListener("click", sair);
  lugar.appendChild(b);
}

function montarEntrada(antesDe, esconder) {
  const form = document.createElement("form");
  form.id = "accessGate";
  form.className = "access-gate";
  form.setAttribute("aria-labelledby", "accessGateTitle");
  form.innerHTML = `
    <h2 id="accessGateTitle">Entrar</h2>
    <p class="muted">Digite o seu código de acesso pessoal, entregue pelo responsável do piloto.</p>
    <label for="accessCode">Código de acesso</label>
    <input id="accessCode" type="password" autocomplete="current-password" required />
    <button id="accessEnter" type="submit" class="primary">Entrar</button>
    <p id="accessError" class="access-error" role="alert"></p>`;
  antesDe.parentNode.insertBefore(form, antesDe);
  if (esconder) antesDe.hidden = true;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const botao = document.getElementById("accessEnter");
    const erro = document.getElementById("accessError");
    const campo = document.getElementById("accessCode");
    botao.disabled = true;
    erro.textContent = "";
    try {
      const r = await window.entregasPilotLogin(campo.value);
      campo.value = "";
      if (!r || r.ok !== true) {
        erro.textContent = "Código não reconhecido.";
        return;
      }
      // A página recomeça já com o código: o fetch do boot passa a levá-lo.
      location.reload();
    } catch {
      erro.textContent = "Não foi possível entrar agora. Tente de novo.";
    } finally {
      botao.disabled = false;
    }
  });
  setTimeout(() => document.getElementById("accessCode")?.focus(), 0);
}

/**
 * Confere a sessão desta página. Com ator: põe "Sair" em `logoutIn` e devolve
 * o ator. Sem ator: mostra a entrada antes de `gateBefore` (escondendo-o se
 * `hideWhileLocked`) e devolve null — a página não deve buscar dados.
 */
export async function ensureAccess({ gateBefore, hideWhileLocked = false, logoutIn }) {
  // Sem o boot do piloto (servidor de demonstração), não há código a pedir.
  if (typeof window.entregasPilotLogin !== "function") return { actor_id: "demo", role: "demo" };
  let actor = null;
  try {
    const r = await fetch("/api/session");
    if (r.ok) actor = (await r.json()).actor || null;
  } catch {
    actor = null;
  }
  if (actor) {
    montarSair(logoutIn);
    return actor;
  }
  if (gateBefore) montarEntrada(gateBefore, hideWhileLocked);
  return null;
}
