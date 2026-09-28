"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const MOTOR = require("../src/perfil-delivery/motor.js");

function item({ id, nome, praca, temp, cat="outro", qtd=1, contemKit=false }) {
  return {
    id:id || nome, nome, praca, dep:[], temp, sac:1, cat, trava:false,
    produzSozinho:null, pausavel:false, risco:"baixo", contemBebida:praca==="bar_bebidas",
    contemSobremesa:praca==="sobremesa", contemKit, sinais:[], qtd, obs:null
  };
}

const frio = item({ nome:"Sashimi de Salmão", praca:"duplas", temp:"frio", cat:"sashimi" });
const hotRoll = item({ nome:"Hot Roll", praca:"enrolados_quentes", temp:"quente", cat:"enrolado_quente" });
const cozinha = item({ nome:"Yakisoba", praca:"cozinha_quentes", temp:"quente", cat:"prato_quente" });
const seisLatas = item({ nome:"Coca-Cola Lata 350 ml", praca:"bar_bebidas", temp:"neutro", cat:"bebida", qtd:6 });
const sake300 = item({ nome:"Saquê 300 ml", praca:"bar_bebidas", temp:"neutro", cat:"bebida" });
const sake720 = item({ nome:"Saquê 720 ml", praca:"bar_bebidas", temp:"neutro", cat:"bebida" });
const wine720 = item({ nome:"Vinho 720 ml", praca:"bar_bebidas", temp:"neutro", cat:"bebida" });
const wine750 = item({ nome:"Vinho 750 ml", praca:"bar_bebidas", temp:"neutro", cat:"bebida" });
const comboGrande = item({ nome:"Combinado 2 pessoas", praca:"combinados", temp:"frio", cat:"combinado", qtd:8 });
const comboMisto = item({ nome:"Combinado Salmão 1 pessoa", praca:"combinados", temp:"misto", cat:"combinado" });
const sobremesaAmbiente = item({ nome:"Choux Cream", praca:"sobremesa", temp:"ambiente", cat:"sobremesa" });

assert.equal(MOTOR.resolver([hotRoll, frio]).segundaSacola, false,
  "Hot Roll + frio não força segunda sacola");
assert.equal(MOTOR.resolver([cozinha, frio]).segundaSacola, true,
  "quente da Cozinha + frio exige separação");
assert.equal(MOTOR.resolver([cozinha, comboMisto]).segundaSacola, true,
  "combinado fechado conta como frio para transporte mesmo com temp=misto");
assert.equal(MOTOR.resolver([hotRoll, comboMisto]).segundaSacola, false,
  "Hot Roll pode acompanhar combinado frio sem criar sacola quente");
assert.equal(MOTOR.resolver([cozinha, sobremesaAmbiente]).segundaSacola, true,
  "sobremesa ambiente + quente da Cozinha exige separação");
assert.equal(MOTOR.resolver([frio, seisLatas]).sacolasMinimas, 2,
  "6+ latas com comida geram um grupo separado");
assert.equal(MOTOR.resolver([seisLatas]).sacolasMinimas, 1,
  "6 latas sozinhas não significam duas sacolas");
assert.equal(MOTOR.resolver([frio, sake300]).segundaSacola, false,
  "saquê 300 ml não é bebida grande por regex");
assert.equal(MOTOR.resolver([frio, sake720]).segundaSacola, true,
  "saquê 720 ml com comida exige grupo separado");
assert.equal(MOTOR.resolver([frio, wine720]).segundaSacola, true,
  "vinho 720 ml com comida exige grupo separado");
assert.equal(MOTOR.resolver([frio, wine750]).segundaSacola, false,
  "vinho 750 ml não herda automaticamente a regra específica de 720 ml");
assert.equal(MOTOR.resolver([comboGrande]).segundaSacola, false,
  "combo ou quantidade bruta não criam segunda sacola");
assert.equal(MOTOR.resolver([comboGrande]).contemKit, false,
  "DeliveryOS não inventa kit por combo/pedido grande");
assert.equal(MOTOR.resolver([item({nome:"Sinal de kit",praca:"montagem_outros",temp:"neutro",contemKit:true})]).contemKit, true,
  "sinal explícito de kit vindo da fonte continua reconhecido");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app-v1", "app.js"), "utf8");
assert.match(app, /function detectarDuasSacolasV0\(I\)[\s\S]{0,220}I\.segundaSacola/,
  "UI deve consumir a decisão do motor, não duplicar regra");

const normalizador = fs.readFileSync(path.join(root, "src", "core", "normalizador.ts"), "utf8");
assert.match(normalizador, /quente:\s*\["hashi", "shoyu", "guardanapo"\]/,
  "Kit Quente normalizado não leva shoyuzara");
assert.match(normalizador, /kids:\s*\["hashi", "shoyu", "shoyuzara", "guardanapo", "adaptador"\]/,
  "Kit Kids normalizado leva shoyuzara + adaptador");
assert.doesNotMatch(normalizador, /COMPONENTES_KIT\s*=\s*\["hashi", "shoyu", "gengibre", "wasabi"\]/,
  "composição genérica antiga não pode voltar");

const doc = fs.readFileSync(path.join(root, "docs", "Logica_Embalagens_DeliveryOS_V0.md"), "utf8");
assert.match(doc, /\*\*240\*\*[\s\S]{0,120}1 sashimi/,
  "matriz textual deve ensinar 1 sashimi -> 240");
assert.match(doc, /2 duplas \+ 1 sashimi[\s\S]{0,100}1 caixa 450/,
  "documentação deve preservar o caso humano canônico");

console.log("truth-v132: ok");
