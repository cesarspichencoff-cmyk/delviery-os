/** Limite de tentativas de código de acesso (puro, relógio controlado). */
import assert from "node:assert/strict";
import { createAccessThrottle } from "./access-throttle";

let passou = 0;
const falhas: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

let agora = 1_000_000;
const relogio = () => agora;
console.log("=== Limite de tentativas de código de acesso ===");
teste("T1 quatro erros não travam; o quinto trava a origem", () => {
  const t = createAccessThrottle({ now: relogio });
  for (let i = 0; i < 4; i++) t.failure("a");
  assert.equal(t.blocked("a", "1000"), false);
  t.failure("a");
  assert.equal(t.blocked("a", "1000"), true, "código certo testado durante a trava não pode ser conferido");
});
teste("T2 quem já entrou daquela origem segue durante a trava", () => {
  const t = createAccessThrottle({ now: relogio });
  t.success("a", "1001");
  for (let i = 0; i < 5; i++) t.failure("a");
  assert.equal(t.blocked("a", "1001"), false);
  assert.equal(t.blocked("a", "1002"), true);
});
teste("T3 a trava é da origem: outra origem não é afetada", () => {
  const t = createAccessThrottle({ now: relogio });
  for (let i = 0; i < 5; i++) t.failure("a");
  assert.equal(t.blocked("b", "1000"), false);
});
teste("T4 a trava vence sozinha; erros fora da janela não somam", () => {
  const t = createAccessThrottle({ now: relogio, windowMs: 1000, lockMs: 5000 });
  for (let i = 0; i < 5; i++) t.failure("a");
  agora += 5001;
  assert.equal(t.blocked("a", "1000"), false);
  for (let i = 0; i < 4; i++) {
    t.failure("a");
    agora += 600;
  }
  assert.equal(t.blocked("a", "1000"), false, "erros espalhados além da janela travaram");
});
console.log(`\n${passou}/${passou + falhas.length} provas do limite de tentativas`);
if (falhas.length) process.exitCode = 1;
else console.log("ACCESS_THROTTLE_GREEN");
