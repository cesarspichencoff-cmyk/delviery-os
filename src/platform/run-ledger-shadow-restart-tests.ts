/** Existing R5-D3 shadow ledger restart safety; no official or live writes. */
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,appendFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {criarLedgerShadow} from "../product/eventos/ledger-shadow";
import {produzirTrabalhoPraca} from "../product/eventos/produtor-trabalho-praca";
const result=produzirTrabalhoPraca({
 tenant:"lab",unidade:"ITAIM",praca:"combinados",
 pedido_id:"reader-order:"+"a".repeat(64),
 grupo:"reader-line:"+"b".repeat(64),
 estado:"concluido",revisao:1,quantidade:2,
 operador:"term-1",ocorrido_em:"2026-11-04T15:30:00Z",
 observado_em:"2026-11-04T15:30:01Z",
});
assert.equal(result.ok,true);
if(!result.ok)throw Error("fixture_unavailable");
const evento={...result.evento,source:"fixture:registro-operacao"};
let count=0;
function test(label:string,fn:()=>void){fn();count++;console.log("PASS "+label);}
const dir=mkdtempSync(join(tmpdir(),"copiloto-ledger-restart-"));
try{
 test("restart index prevents same physical gesture being appended twice",()=>{
  const file=join(dir,"replay.jsonl");
  const first=criarLedgerShadow({arquivo:file,habilitado:true});
  assert.equal(first.registrar(evento).tipo,"gravado");
  const size=readFileSync(file).length;
  const restarted=criarLedgerShadow({arquivo:file,habilitado:true});
  assert.equal(restarted.registrar(evento).tipo,"duplicata_identica");
  assert.equal(restarted.replay().length,1);
  assert.equal(readFileSync(file).length,size);
 });
 test("restart index rejects different payload reusing the same event key",()=>{
  const file=join(dir,"conflict.jsonl");
  assert.equal(criarLedgerShadow({arquivo:file,habilitado:true}).registrar(evento).tipo,"gravado");
  const changed={...evento,occurred_at:"2026-11-04T15:29:59Z"};
  const fresh=criarLedgerShadow({arquivo:file,habilitado:true});
  assert.equal(fresh.registrar(changed).tipo,"conflito");
  assert.equal(fresh.replay().length,1);
 });
 test("corrupt trailing event blocks new append and leaves bytes unchanged",()=>{
  const file=join(dir,"corrupt.jsonl");
  assert.equal(criarLedgerShadow({arquivo:file,habilitado:true}).registrar(evento).tipo,"gravado");
  appendFileSync(file,"{INVALID}\n");
  const before=readFileSync(file,"utf8");
  const fresh=criarLedgerShadow({arquivo:file,habilitado:true});
  const after=fresh.registrar({...evento,source_event_id:"another-key"});
  assert.equal(after.tipo,"recusado");
  assert.equal(readFileSync(file,"utf8"),before);
 });
 test("incomplete last line is not silently hidden",()=>{
  const file=join(dir,"partial.jsonl");
  writeFileSync(file,JSON.stringify(evento));
  const fresh=criarLedgerShadow({arquivo:file,habilitado:true});
  assert.equal(fresh.registrar(evento).tipo,"recusado");
  assert.equal(readFileSync(file,"utf8"),JSON.stringify(evento));
 });
 test("incompatible duplicate records on disk prohibit further writes",()=>{
  const file=join(dir,"existing-conflict.jsonl");
  writeFileSync(file,JSON.stringify(evento)+"\n"+
   JSON.stringify({...evento,occurred_at:"2026-11-04T15:29:59Z"})+"\n");
  const initial=readFileSync(file,"utf8");
  const fresh=criarLedgerShadow({arquivo:file,habilitado:true});
  assert.equal(fresh.registrar(evento).tipo,"recusado");
  assert.equal(readFileSync(file,"utf8"),initial);
 });
 test("shadow off still performs no write or repair",()=>{
  const file=join(dir,"disabled.jsonl");
  const l=criarLedgerShadow({arquivo:file});
  assert.equal(l.registrar(evento).tipo,"ignorado_shadow_desligado");
  assert.equal(l.replay().length,0);
 });
}finally{rmSync(dir,{recursive:true,force:true});}
console.log("LEDGER_SHADOW_RESTART_PASS "+count+"/"+count+" SYNTHETIC_ONLY");
