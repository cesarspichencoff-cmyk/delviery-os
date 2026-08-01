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
  skeleton,
} from "./components/ui.js";
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
};

async function obter(caminho) {
  const r = await fetch(caminho, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}`);
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
  "/entregas": { api: "/api/entregas", tela: telaEntregas },
  "/operacao-viva": { api: "/api/operacao-viva", tela: telaOperacaoViva },
  "/conference-brain": { api: "/api/conference-brain", tela: telaConferenceBrain },
  "/copiloto": { api: "/api/copiloto", tela: telaCopiloto },
};

function rotaDoHash() {
  const h = window.location.hash.replace(/^#/, "");
  return h && h.startsWith("/") ? h : "/entregas";
}

async function desenhar(rota, opcoes = {}) {
  const alvo = $("#superficie");
  const modulo = estado.navegacao.modulos.find((m) => m.rota === rota);
  desenharNavegacao(rota);
  desenharContexto(modulo, opcoes.preservandoContexto === true);

  if (!modulo) {
    alvo.innerHTML = estadoTela(
      "vazio",
      [{ estado: "indisponivel" }],
      "Esta rota nao existe",
      "O endereco pedido nao corresponde a nenhum modulo do DeliveryOS.",
    );
    return;
  }

  if (modulo.disponibilidade === "futuro") {
    alvo.innerHTML = telaModuloFuturo(modulo);
    return;
  }

  const s = SUPERFICIES[rota];
  alvo.setAttribute("aria-busy", "true");
  alvo.innerHTML = skeleton(4);
  try {
    const vm = await obter(s.api);
    alvo.innerHTML = s.tela(vm);
    ligarInspetores(alvo);
  } catch (e) {
    // Falha de leitura NAO vira tela vazia: vazio significaria "nao ha nada",
    // e o que houve foi "nao consegui perguntar".
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
  if (estado.rotaAtual && estado.rotaAtual !== nova) {
    estado.rotaAnterior = estado.rotaAtual;
  }
  estado.rotaAtual = nova;
  fecharMenu();
  desenhar(nova);
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
    $("#conexaoShell").innerHTML = selo({
      estado: saude.demo ? "somente_demonstracao" : "real",
    });

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
