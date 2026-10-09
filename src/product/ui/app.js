/**
 * DeliveryOS — Product System · App Shell
 *
 * Roteamento por hash porque o servidor de apresentacao e estatico e nao reescreve
 * caminho. `#/entregas` corresponde a rota `/entregas` declarada em modulos.ts.
 *
 * Este arquivo nao conhece regra de dominio. Ele busca view models prontas e
 * escolhe qual superficie desenhar.
 */

import { icone } from "./components/icons.js";
import {
  carregarEstados,
  esc,
  estadoTela,
  ligarInspetores,
  selo,
  selos,
  skeleton,
} from "./components/ui.js";
import { telaHome } from "./surfaces/home.js";
import { telaEntregas } from "./surfaces/entregas.js";
import { telaOperacaoViva } from "./surfaces/operacao-viva.js";
import { telaConferenceBrain } from "./surfaces/conference-brain.js";
import { telaCopiloto } from "./surfaces/copiloto.js";
import { telaModuloFuturo } from "./surfaces/modulo-futuro.js";

const $ = (s) => document.querySelector(s);

const estado = {
  navegacao: null,
  unidade: null,
  rotaAtual: null,
  rotaAnterior: null,
  /** O intervalo que envelhece a leitura na tela. Um so, trocado a cada desenho. */
  relogioDaLeitura: null,
  /** O selo do shell quando a tela nao traz leitura do servidor (de /api/health). */
  molduraPadrao: [],
  /** Cada desenho incrementa; uma releitura que volta depois de outro desenho e descartada. */
  geracao: 0,
  relendo: false,
};

async function obter(caminho) {
  const r = await fetch(caminho, { headers: { accept: "application/json" } });
  if (!r.ok) throw Object.assign(new Error(`${caminho} respondeu ${r.status}`), { status: r.status });
  return r.json();
}

/* ------------------------------------------------------------------ *
 * Navegacao
 * ------------------------------------------------------------------ */

function itemNav(m, rota) {
  const atual = m.rota === rota ? ' aria-current="page"' : "";
  const futuro = m.disponibilidade === "futuro";
  return `<li><a class="nav-item" href="#${esc(m.rota)}"${atual} data-disponibilidade="${esc(
    m.disponibilidade,
  )}"><span class="nav-item__icone">${icone(m.icone)}</span><span class="nav-item__texto"><span class="nav-item__nome">${esc(
    m.nome,
  )}</span><span class="nav-item__descricao">${esc(m.descricao)}</span>${
    futuro ? `<span class="linha-selos">${selo({ estado: m.estado })}</span>` : ""
  }</span></a></li>`;
}

function desenharNavegacao(rota) {
  const { grupos, modulos } = estado.navegacao;
  $("#navPrincipal").innerHTML = grupos
    .map((g) => {
      const doGrupo = modulos.filter((m) => m.grupo === g.id);
      if (doGrupo.length === 0) return "";
      return `<div class="nav-grupo"><h2 class="nav-grupo__titulo">${esc(
        g.nome,
      )}</h2><p class="nav-grupo__descricao">${esc(
        g.descricao,
      )}</p><ul class="nav-lista">${doGrupo
        .map((m) => itemNav(m, rota))
        .join("")}</ul></div>`;
    })
    .join("");

  // Mobile: so os implementados. Modulo futuro nao ocupa dedo de quem opera.
  $("#navMobile").innerHTML = modulos
    .filter((m) => m.disponibilidade === "implementado")
    .map(
      (m) =>
        `<a class="nav-mobile__item" href="#${esc(m.rota)}"${
          m.rota === rota ? ' aria-current="page"' : ""
        }>${icone(m.icone, 18)}<span>${esc(m.nome)}</span></a>`,
    )
    .join("");
}

function desenharUnidades() {
  const sel = $("#seletorUnidade");
  sel.innerHTML = estado.navegacao.unidades
    .map((u) => `<option value="${esc(u.unit_id)}">${esc(u.nome)}</option>`)
    .join("");
  sel.value = estado.unidade;
  atualizarUnidadeVisivel();
  sel.addEventListener("change", () => {
    estado.unidade = sel.value;
    atualizarUnidadeVisivel();
    // A troca de unidade PRESERVA o contexto: a mesma rota e redesenhada.
    desenhar(estado.rotaAtual, { preservandoContexto: true });
  });
}

function atualizarUnidadeVisivel() {
  const u = estado.navegacao.unidades.find((x) => x.unit_id === estado.unidade);
  $("#unidadeAtiva").textContent = u
    ? `Unidade ativa · ${u.unit_id} · ${u.praca}`
    : "Unidade ativa · nao selecionada";
}

/**
 * A MOLDURA (selo do shell e unidade ativa) diz a origem do que a tela mostra
 * em PRIMEIRO PLANO. Sobre a leitura do servidor, "SOMENTE DEMONSTRACAO" e
 * "unidade ativa: demo-unit" eram a moldura desmentindo a tela (2026-10-09).
 */
const PROCEDENCIAS = ["real", "simulado", "controle", "controle_positivo_sintetico"];

function desenharMoldura(rota, vm) {
  const l = rota === "/entregas" && vm && vm.leitura && vm.leitura.disponivel === true ? vm.leitura : null;
  const sel = $("#seletorUnidade");
  if (!l) {
    $("#conexaoShell").innerHTML = selos(estado.molduraPadrao);
    sel.hidden = false;
    atualizarUnidadeVisivel();
    return;
  }
  // O modo dos fatos lidos (real, simulado, controle). Leitura sem fato com
  // modo fica com os selos dela mesma — nunca com a demonstracao por padrao.
  const modos = l.selos.filter((s) => PROCEDENCIAS.includes(s.estado));
  $("#conexaoShell").innerHTML = selos(modos.length ? modos : l.selos);
  // O seletor escolhe a unidade da DEMONSTRACAO; a leitura filtra pelas
  // unidades que o servidor encontrou. Um controle que nao age sobre a tela sai
  // dela enquanto a leitura esta em primeiro plano.
  sel.hidden = true;
  $("#unidadeAtiva").textContent = `Unidade da leitura · ${l.unidade_selecionada ?? "todas"}`;
}

function desenharContexto(modulo, preservandoContexto) {
  const anterior = estado.rotaAnterior;
  const voltar =
    anterior && anterior !== estado.rotaAtual
      ? `<button class="contexto__voltar" type="button" id="btnVoltar">Voltar para ${esc(
          nomeDaRota(anterior),
        )}</button>`
      : "";
  $("#contexto").innerHTML =
    `<p class="contexto__trilha">DeliveryOS / ${esc(
      grupoDaRota(modulo),
    )} / ${esc(modulo ? modulo.nome : "Desconhecido")}</p>${voltar}` +
    (preservandoContexto
      ? `<p class="contexto__trilha">Contexto preservado na troca de unidade</p>`
      : "");
  const btn = $("#btnVoltar");
  if (btn) btn.addEventListener("click", () => {
    window.location.hash = anterior;
  });
}

function nomeDaRota(rota) {
  const m = estado.navegacao.modulos.find((x) => x.rota === rota);
  return m ? m.nome : rota;
}
function grupoDaRota(modulo) {
  if (!modulo) return "—";
  const g = estado.navegacao.grupos.find((x) => x.id === modulo.grupo);
  return g ? g.nome : "—";
}

/* ------------------------------------------------------------------ *
 * Roteamento
 * ------------------------------------------------------------------ */

const SUPERFICIES = {
  "/": { api: "/api/home", tela: telaHome },
  "/entregas": { api: "/api/entregas", tela: telaEntregas },
  "/operacao-viva": { api: "/api/operacao-viva", tela: telaOperacaoViva },
  "/conference-brain": { api: "/api/conference-brain", tela: telaConferenceBrain },
  "/copiloto": { api: "/api/copiloto", tela: telaCopiloto },
};

/**
 * `#/entregas?unidade=ITAIM` = rota `/entregas` + consulta. A consulta e
 * NAVEGACAO (link, compartilhavel, sobrevive a recarga), nunca estado escondido.
 */
function hashAtual() {
  const [caminho, consulta = ""] = window.location.hash.replace(/^#/, "").split("?");
  return { caminho, consulta: new URLSearchParams(consulta) };
}

function rotaDoHash() {
  const h = hashAtual().caminho;
  // A rota inicial e a HOME OPERACIONAL. Entregas deixou de ser a home: ela
  // virou home por ter sido a primeira implementada, nao por decisao de produto.
  return h && h.startsWith("/") ? h : "/";
}

/**
 * A leitura da rua se declara LEITURA: ela envelhece na tela. A idade e medida
 * desde a CHEGADA da resposta, com `performance.now()` — nunca comparando o
 * relogio deste navegador com o do servidor. As janelas vem da propria
 * superficie (as mesmas da Operacao Viva), nao deste arquivo.
 */
function ligarLeitura(alvo, opcoes) {
  clearInterval(estado.relogioDaLeitura);
  estado.relogioDaLeitura = null;
  alvo.querySelectorAll("[data-reler]").forEach((b) => b.addEventListener("click", () => relerSemApagar(alvo)));
  if (opcoes.focar) {
    const el = alvo.querySelector(opcoes.focar);
    if (el) el.focus();
  }
  const rua = alvo.querySelector('[data-territorio="rua"][data-fresca-ate-s]');
  if (!rua) return;
  const fresca = Number(rua.dataset.frescaAteS);
  const envelhecendo = Number(rua.dataset.envelhecendoAteS);
  const idade = rua.querySelector("[data-idade-da-leitura]");
  const chegou = performance.now();
  const marcar = () => {
    const s = (performance.now() - chegou) / 1000;
    if (idade) idade.textContent = s < 60 ? "lida agora" : `lida ha ${Math.floor(s / 60)} min`;
    rua.dataset.envelhecida = s >= envelhecendo ? "sim" : s >= fresca ? "envelhecendo" : "nao";
  };
  marcar();
  estado.relogioDaLeitura = setInterval(marcar, 15000);
}

/**
 * Reler SEM apagar (2026-10-09). A leitura na tela se declara — hora e idade —
 * e continua sendo o que se sabe enquanto a nova nao chega: medido, reler leva
 * 2,5 s com 100 mil fatos no log e 8 s com 300 mil. Esqueleto no lugar dela
 * seria tela morta; erro no lugar dela apagaria o que se sabia. Sem leitura na
 * tela (estado tecnico), reler e um desenho comum.
 */
async function relerSemApagar(alvo) {
  const rua = alvo.querySelector('[data-territorio="rua"][data-lida-as]');
  const aviso = rua && rua.querySelector("[data-releitura]");
  if (!aviso) {
    desenhar(estado.rotaAtual, { focar: "[data-reler]" });
    return;
  }
  if (estado.relendo) return;
  estado.relendo = true;
  const geracao = estado.geracao;
  const rota = estado.rotaAtual;
  const botoes = alvo.querySelectorAll("[data-reler]");
  // `data-relendo`, nao `aria-busy`: dentro de regiao ocupada o leitor de tela
  // pode calar mudancas — e o aviso "relendo" (regiao viva) mora nela.
  rua.dataset.relendo = "sim";
  botoes.forEach((b) => b.setAttribute("aria-disabled", "true"));
  aviso.dataset.estado = "relendo";
  aviso.textContent = " · relendo…";
  try {
    const vm = await obter(apiDaRota(rota));
    if (geracao !== estado.geracao) return; // outra tela foi desenhada no meio
    alvo.innerHTML = SUPERFICIES[rota].tela(vm);
    desenharMoldura(rota, vm);
    ligarInspetores(alvo);
    ligarLeitura(alvo, { focar: "[data-reler]" });
  } catch (e) {
    if (geracao !== estado.geracao) return;
    delete rua.dataset.relendo;
    botoes.forEach((b) => b.removeAttribute("aria-disabled"));
    aviso.dataset.estado = "falhou";
    const motivo = e && e.status ? `o servidor respondeu ${e.status}` : "sem resposta do servidor";
    aviso.textContent = `Nao foi possivel ler de novo (${motivo}). Esta continua sendo a leitura das ${rua.dataset.lidaAs}, e segue envelhecendo.`;
  } finally {
    if (geracao === estado.geracao) estado.relendo = false;
  }
}

function apiDaRota(rota) {
  const s = SUPERFICIES[rota];
  // A cena so viaja para a HOME, e so porque esta build e de demonstracao.
  const cena = new URLSearchParams(window.location.search).get("cena");
  let api =
    rota === "/" && cena ? `${s.api}?cena=${encodeURIComponent(cena)}` : s.api;
  if ((rota === "/operacao-viva" || rota === "/copiloto") && estado.unidade) {
    api += `${api.includes("?") ? "&" : "?"}unit_id=${encodeURIComponent(estado.unidade)}`;
  }
  // Entregas filtra pela unidade DA LEITURA (as que o servidor encontrou), nao
  // pelo seletor do shell, que e de apresentacao.
  const unidadeDaLeitura = rota === "/entregas" ? hashAtual().consulta.get("unidade") : null;
  if (unidadeDaLeitura) {
    api += `${api.includes("?") ? "&" : "?"}unidade=${encodeURIComponent(unidadeDaLeitura)}`;
  }
  return api;
}

async function desenhar(rota, opcoes = {}) {
  estado.geracao += 1;
  estado.relendo = false;
  const alvo = $("#superficie");
  const modulo = estado.navegacao.modulos.find((m) => m.rota === rota);
  desenharNavegacao(rota);
  desenharContexto(modulo, opcoes.preservandoContexto === true);

  if (!modulo) {
    desenharMoldura(rota, null);
    alvo.innerHTML = estadoTela(
      "vazio",
      [{ estado: "indisponivel" }],
      "Esta rota nao existe",
      "O endereco pedido nao corresponde a nenhum modulo do DeliveryOS.",
    );
    return;
  }

  if (modulo.disponibilidade === "futuro") {
    desenharMoldura(rota, null);
    alvo.innerHTML = telaModuloFuturo(modulo);
    return;
  }

  const s = SUPERFICIES[rota];
  const api = apiDaRota(rota);
  clearInterval(estado.relogioDaLeitura);
  alvo.setAttribute("aria-busy", "true");
  alvo.innerHTML = skeleton(4);
  try {
    const vm = await obter(api);
    alvo.innerHTML = s.tela(vm);
    desenharMoldura(rota, vm);
    ligarInspetores(alvo);
    ligarLeitura(alvo, opcoes);
  } catch (e) {
    // Falha de leitura NAO vira tela vazia: vazio significaria "nao ha nada",
    // e o que houve foi "nao consegui perguntar".
    desenharMoldura(rota, null);
    alvo.innerHTML = estadoTela(
      "degradado",
      [{ estado: "erro_recuperavel" }],
      "Nao foi possivel ler esta superficie",
      `A leitura falhou (${e.message}). Isto NAO significa que nao ha nada — significa que nao foi possivel perguntar. Nada nesta tela representa o estado atual.`,
    );
  } finally {
    alvo.setAttribute("aria-busy", "false");
  }
}

function aoTrocarRota() {
  const nova = rotaDoHash();
  // Mesma rota, outra consulta (o filtro de unidade): o foco volta ao link
  // escolhido, em vez de cair no inicio da pagina.
  const soConsulta = estado.rotaAtual === nova;
  if (estado.rotaAtual && estado.rotaAtual !== nova) {
    estado.rotaAnterior = estado.rotaAtual;
  }
  estado.rotaAtual = nova;
  fecharMenu();
  desenhar(nova, soConsulta ? { focar: `a[href="${window.location.hash.replace(/["\\]/g, "")}"]` } : {});
}

/* ------------------------------------------------------------------ *
 * Menu mobile
 * ------------------------------------------------------------------ */

function fecharMenu() {
  const nav = $("#navPrincipal");
  const btn = $("#btnMenu");
  nav.dataset.aberto = "nao";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Abrir navegacao");
}

function ligarMenu() {
  const nav = $("#navPrincipal");
  const btn = $("#btnMenu");
  btn.addEventListener("click", () => {
    const aberto = nav.dataset.aberto === "sim";
    nav.dataset.aberto = aberto ? "nao" : "sim";
    btn.setAttribute("aria-expanded", String(!aberto));
    btn.setAttribute("aria-label", aberto ? "Abrir navegacao" : "Fechar navegacao");
    if (!aberto) {
      const primeiro = nav.querySelector(".nav-item");
      if (primeiro) primeiro.focus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.dataset.aberto === "sim") {
      fecharMenu();
      btn.focus();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function iniciar() {
  try {
    const [saude, estados, navegacao] = await Promise.all([
      obter("/api/health"),
      obter("/api/estados"),
      obter("/api/navegacao"),
    ]);
    carregarEstados(estados.estados);
    estado.navegacao = navegacao;
    estado.unidade = navegacao.unidades[0] ? navegacao.unidades[0].unit_id : null;

    $("#faixaAmbiente").textContent = saude.banner;
    estado.molduraPadrao = [{ estado: saude.demo ? "somente_demonstracao" : "real" }];
    $("#conexaoShell").innerHTML = selos(estado.molduraPadrao);

    desenharUnidades();
    ligarMenu();
    window.addEventListener("hashchange", aoTrocarRota);
    aoTrocarRota();
  } catch (e) {
    $("#superficie").innerHTML = estadoTela(
      "degradado",
      [{ estado: "erro_bloqueante" }],
      "O Product System nao conseguiu iniciar",
      `Falha ao carregar a base da aplicacao (${e.message}). Nenhuma superficie sera desenhada, porque desenhar sem o vocabulario de estados produziria uma tela que parece correta e nao e.`,
    );
  }
}

iniciar();
