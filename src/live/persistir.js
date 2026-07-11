/* ============================================================================
 * DeliveryOS · src/live · PERSISTÊNCIA LOCAL
 * ----------------------------------------------------------------------------
 * Log de eventos JSONL append-only + leitura tolerante. O snapshot é derivado
 * e reconstruível 100% do log (derivado nunca vira evento).
 *
 * runtimeRoot é SEMPRE explícito — nenhum path absoluto de máquina fixado.
 * Produção esperada: %LOCALAPPDATA%\DeliveryOS\runtime (fora de repositório).
 * Testes: diretórios temporários do SO.
 *
 * F3-01 (fechada aqui): se o runtimeRoot estiver DENTRO de um repositório Git,
 * só os paths canônicos são aceitos (data/live/ ou runtime/ na raiz do repo).
 * Qualquer alias improvisado (data/live_backup/, tools/runtime/, docs/live/…)
 * é rejeitado com erro — antes de qualquer escrita.
 *
 * Leitura tolerante (Auditoria Mestra §10): linha que não parseia é contada e
 * registrada, nunca derruba o processo, nunca é "consertada" por adivinhação;
 * última linha truncada (queda no meio da escrita) é descartada com registro.
 * ==========================================================================*/
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ARQUIVO_EVENTOS = "eventos.live.jsonl";
const ARQUIVO_QUARENTENA = "quarentena.live.jsonl";

// prefixos canônicos relativos à raiz do repositório (Addendum §6 / F3-01)
const PREFIXOS_CANONICOS_EM_REPO = ["data/live", "runtime"];

/** Sobe a árvore a partir de dir procurando um repositório Git. */
function acharRaizDeRepositorio(dir) {
  let atual = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(atual, ".git"))) return atual;
    const pai = path.dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

/**
 * Valida o runtimeRoot (F3-01). Lança erro ANTES de qualquer escrita se o
 * path estiver dentro de um repositório fora dos prefixos canônicos.
 */
function validarRuntimeRoot(runtimeRoot) {
  if (typeof runtimeRoot !== "string" || runtimeRoot.length === 0) {
    throw new Error("runtime_root_obrigatorio: criar o armazenamento exige runtimeRoot explicito");
  }
  const absoluto = path.resolve(runtimeRoot);
  const raizRepo = acharRaizDeRepositorio(absoluto);
  if (raizRepo === null) return absoluto; // fora de repositório (temp, LOCALAPPDATA…): ok

  const relativo = path.relative(raizRepo, absoluto).split(path.sep).join("/");
  const canonico = PREFIXOS_CANONICOS_EM_REPO.some(
    (p) => relativo === p || relativo.startsWith(p + "/")
  );
  if (!canonico) {
    throw new Error(
      "runtime_root_nao_canonico: dentro de repositorio Git, dados vivos so podem " +
      "morar em data/live/ ou runtime/ (raiz do repo). Path improvisado rejeitado."
    );
  }
  return absoluto;
}

/**
 * Cria a abstração de armazenamento. Recebe o runtimeRoot explicitamente —
 * nunca decide sozinha onde gravar.
 */
function criarArmazenamento({ runtimeRoot }) {
  const raiz = validarRuntimeRoot(runtimeRoot);
  fs.mkdirSync(raiz, { recursive: true });
  const caminhoEventos = path.join(raiz, ARQUIVO_EVENTOS);
  const caminhoQuarentena = path.join(raiz, ARQUIVO_QUARENTENA);

  function anexarLinha(caminho, obj) {
    // uma linha por chamada, terminada em \n — a leitura tolera truncamento.
    fs.appendFileSync(caminho, JSON.stringify(obj) + "\n", "utf8");
  }

  function lerLinhas(caminho) {
    const resultado = { registros: [], linhas_invalidas: [] };
    if (!fs.existsSync(caminho)) return resultado;
    const conteudo = fs.readFileSync(caminho, "utf8");
    if (conteudo.length === 0) return resultado;
    const terminaEmNovaLinha = conteudo.endsWith("\n");
    const linhas = conteudo.split("\n");
    if (terminaEmNovaLinha) linhas.pop(); // último elemento vazio

    linhas.forEach((linha, i) => {
      const ultima = i === linhas.length - 1;
      if (linha.trim() === "") return;
      try {
        resultado.registros.push(JSON.parse(linha));
      } catch {
        resultado.linhas_invalidas.push({
          numero_linha: i + 1,
          motivo: (ultima && !terminaEmNovaLinha) ? "linha_final_truncada" : "linha_invalida"
          // nunca incluir o conteúdo da linha: pode carregar dado que não
          // deveria vazar para mensagens/relatórios.
        });
      }
    });
    return resultado;
  }

  return {
    raiz,
    caminhoEventos,
    caminhoQuarentena,
    anexarEvento: (evento) => anexarLinha(caminhoEventos, evento),
    anexarQuarentena: (registro) => anexarLinha(caminhoQuarentena, registro),
    lerEventos: () => lerLinhas(caminhoEventos),
    lerQuarentena: () => lerLinhas(caminhoQuarentena)
  };
}

module.exports = {
  criarArmazenamento,
  validarRuntimeRoot,
  ARQUIVO_EVENTOS,
  ARQUIVO_QUARENTENA,
  PREFIXOS_CANONICOS_EM_REPO
};
