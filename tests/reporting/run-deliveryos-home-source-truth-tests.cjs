'use strict';
// L4 safety contract for the existing Home's degraded source message.
// Static gate only. The browser/visual gate stays in run-m1b-home-visual-truth.
// Does not load operational sources, execute a web server or control a device.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'../..');
const home=readFileSync(join(root,'src/product/ui/surfaces/home.js'),'utf8');
const browser=readFileSync(join(root,'tests/product/run-m1b-home-visual-truth-tests.ts'),'utf8');
let ok=0;
function test(name,fn){fn();ok++;console.log('PASS '+name)}
const start=home.indexOf('function faixaTecnica(vm) {');
const end=home.indexOf('/* ------------------------------------------------------------------ *',start+2);
if(start<0||end<0)throw Error('HOME_TECHNICAL_STRIP_NOT_FOUND');
const technical=home.slice(start,end);
test('technical warning is rendered only for declared degraded sources',()=>{
 assert.match(technical,/if \(!vm\.degradado\) return "";/);
 assert.match(technical,/vm\.fontes_degradadas\.map/);
 assert.match(technical,/role="status"/);
});
test('degraded banner does not claim healthy remaining operation',()=>{
 assert.match(technical,/As demais areas so podem ser avaliadas com leitura confiavel/);
 for(const unsafe of [/o resto da operacao segue normal/i,/operacao esta normal/i,/tudo funciona normalmente/i])
  assert.doesNotMatch(technical,unsafe);
});
test('known-time label remains conditional rather than fabricated',()=>{
 assert.match(technical,/const h = hora\(vm\.observado_em\)/);
 assert.match(technical,/h \? ` · ultima leitura as \$\{esc\(h\)\}` : ""/);
});
test('no new action handler added to technical warning',()=>{
 for(const unsafe of [/addEventListener\(/,/onclick=/i,/fetch\(/,/localStorage\./,/setInterval\(/])
  assert.doesNotMatch(technical,unsafe);
});
test('browser QA checks visible degraded text not merely a comment',()=>{
 assert.match(browser,/locator\("\.org-tecnico__texto"\)\.innerText\(\)/);
 assert.match(browser,/assert\.doesNotMatch\(aviso, \/o resto da operacao segue normal\/i\)/);
});
console.log('DELIVERYOS_HOME_SOURCE_TRUTH_STATIC_PASS '+ok+'/'+ok+' NO_BROWSER_NO_POS');
