/* ============================================================================
 * Ajuste visual cirúrgico — progressão cromática dos modos (Calmo/Ambiente/
 * Foco). Testes de fonte: classe/atributo correto por modo, estado "sem
 * dados" permanece neutro (nunca herda o verde do Calmo), ausência de
 * mudança estrutural (mesmos seletores/elementos, só tokens de cor).
 * ==========================================================================*/
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..");
const CSS = fs.readFileSync(path.join(RAIZ, "app-v1", "style.css"), "utf8");
const APP_JS = fs.readFileSync(path.join(RAIZ, "app-v1", "app.js"), "utf8");

function blocoDoSeletor(css, seletor) {
  const i = css.indexOf(seletor);
  assert.ok(i >= 0, "seletor não encontrado: " + seletor);
  const abre = css.indexOf("{", i);
  const fecha = css.indexOf("}", abre);
  return css.slice(abre, fecha + 1);
}

test("progressão cromática: os 7 tokens de modo existem, tipados via @property", () => {
  const TOKENS = ["--mode-bg", "--mode-glow", "--mode-surface", "--mode-line", "--mode-node", "--mode-text-muted", "--mode-accent"];
  for (const t of TOKENS) {
    assert.match(CSS, new RegExp("@property " + t.replace(/-/g, "\\-") + " \\{"), t + " não registrado via @property");
  }
});

test("progressão cromática: body[data-mode] define os três climas com os 7 tokens cada", () => {
  for (const modo of ["calmo", "ambiente", "foco"]) {
    const bloco = blocoDoSeletor(CSS, 'body[data-mode="' + modo + '"] {');
    for (const t of ["--mode-bg:", "--mode-glow:", "--mode-surface:", "--mode-line:", "--mode-node:", "--mode-text-muted:", "--mode-accent:"]) {
      assert.match(bloco, new RegExp(t.replace(/-/g, "\\-")), modo + " não define " + t);
    }
  }
});

test("progressão cromática: Calmo é o mais claro/vivo e Foco o mais profundo (por luminância do fundo)", () => {
  const luminanciaHex = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgDe = (modo) => {
    const bloco = blocoDoSeletor(CSS, 'body[data-mode="' + modo + '"] {');
    const m = bloco.match(/--mode-bg:\s*(#[0-9A-Fa-f]{6})/);
    assert.ok(m, "cor --mode-bg não encontrada para " + modo);
    return luminanciaHex(m[1]);
  };
  const calmo = bgDe("calmo"), ambiente = bgDe("ambiente"), foco = bgDe("foco");
  assert.ok(calmo > ambiente, "Calmo precisa ser mais luminoso que Ambiente");
  assert.ok(ambiente > foco, "Ambiente precisa ser mais luminoso que Foco (mais profundo/concentrado)");
});

test("progressão cromática: estado sem dados/pressão NUNCA referencia tokens de modo (não herda o verde do Calmo)", () => {
  const SELETORES = [
    ".cell.tone-faint {", ".cell.tone-tech {", ".cell.tone-warm {", ".cell.tone-ember {", ".cell.tone-cream {"
  ];
  for (const sel of SELETORES) {
    const bloco = blocoDoSeletor(CSS, sel);
    assert.doesNotMatch(bloco, /var\(--mode-/, sel + " não pode depender do clima (Calmo/Ambiente/Foco)");
  }
});

test("progressão cromática: só a praça saudável (tone-ivory) participa do clima", () => {
  const bloco = blocoDoSeletor(CSS, ".cell.tone-ivory {");
  assert.match(bloco, /var\(--mode-node\)/, "tone-ivory precisa reagir a --mode-node");
  assert.match(bloco, /var\(--mode-surface\)/);
});

test("progressão cromática: âmbar de pressão permanece fixo (não é token de modo)", () => {
  // cores de pressão/crítico já existiam antes da progressão — devem seguir literais
  assert.match(CSS, /\.cell\.tone-warm \{[\s\S]*?border-color: rgba\(224, 162, 90/);
  assert.match(CSS, /\.cell\.tone-ember \{[\s\S]*?border-color: rgba\(240, 179, 106/);
});

test("progressão cromática: transição declarada é curta e só nos 7 tokens (sem novas animações)", () => {
  const bloco = blocoDoSeletor(CSS, "\nbody {");
  assert.match(bloco, /transition:\s*--mode-bg 0\.5s ease/);
  // duração única e curta em todas as propriedades transicionadas
  const duracoes = bloco.match(/--mode-[a-z-]+ ([\d.]+)s/g) || [];
  assert.ok(duracoes.length >= 7, "esperava as 7 propriedades de modo na transição");
  for (const d of duracoes) assert.match(d, /0\.5s/, "duração deve ser uniforme e curta: " + d);
});

test("progressão cromática: prefers-reduced-motion continua zerando toda transição/animação", () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?transition-duration: 0\.01ms !important/);
});

test("progressão cromática: JS lê --mode-line para as ligações-base (sem cor fixa nova espalhada)", () => {
  assert.match(APP_JS, /function corLinhaBase\(\)/);
  assert.match(APP_JS, /getPropertyValue\("--mode-line"\)/);
  // linhas de pressão real (âmbar) continuam literais, fora do clima
  assert.match(APP_JS, /"#C98A46"/);
  // o congelado/frozen (estado técnico) permanece neutro, não usa corLinhaBase()
  assert.match(APP_JS, /frozen \? \{ w: 0\.8, c: "#1A2A22" \} : \{ w: 0\.9, c: corLinhaBase\(\) \}/);
});

test("ausência de mudança estrutural: nenhuma classe/elemento novo — só tokens de cor", () => {
  // topologia/estrutura continuam intocadas: mesmas 6 áreas, mesma função de render
  assert.match(APP_JS, /const CEL_DEF = \[/);
  assert.match(APP_JS, /\{ id: "caixa", nome: "Caixa"/);
  /* Células operacionais V1: o id topológico "motoboy" é preservado (posição,
   * ligações e QA intactos); só o rótulo passou a "Entregas", que é o domínio
   * real dessa célula enquanto aguarda integração. */
  assert.match(APP_JS, /\{ id: "motoboy", nome: "Entregas"/);
  const celDef = APP_JS.match(/const CEL_DEF = \[[\s\S]*?\];/)[0];
  assert.equal((celDef.match(/\{ id:/g) || []).length, 6, "topologia deve continuar com 6 áreas");
});
