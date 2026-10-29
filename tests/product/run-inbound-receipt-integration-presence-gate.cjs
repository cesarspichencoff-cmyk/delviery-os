// P0: gate de PRESENCA do nucleo real de recibos no checkout do CI.
// Diferente de ensaio PG no Foxxy: so a revisao versionada conta.
// Nao aplica migration 0011, nao conecta bancos, nao cria credenciais.
"use strict";
const {readFileSync,existsSync}=require("node:fs");
const {join}=require("node:path");
const root=process.cwd();
const failures=[];
const source=(p)=> {
 const fp=join(root,p);
 if(!existsSync(fp))return null;
 return readFileSync(fp,"utf8");
};
function check(label,path,patterns){
 const s=source(path);
 if(s===null){failures.push(label+": MISSING_FILE "+path);return;}
 const missing=patterns.filter(p=>!p.test(s));
 if(missing.length){
  failures.push(label+": INCOMPLETE_SOURCE "+path+" missing="+missing.map(p=>p.source).join(","));
 }else console.log("P0_RECEIPT_PRESENT "+label);
}
// Sintaxe exigida e minima: a prova dinamica ainda sera dada por HTTP/Room/PG.
// Nao substituir estes checks por textos ficticios: CI executa testes reais em seguida.
check("receipt_domain","src/entregas/persistence/inbound-receipt.ts",[
 /canonicalInboundFingerprint/,/classifyInboundReceipt/,/DurableInboundReceipt/
]);
check("uow_contract","src/entregas/persistence/ports.ts",[
 /inboundReceipts\s*:/,/InboundReceipt/
]);
check("memory_uow","src/entregas/persistence/memory-uow.ts",[
 /inboundReceipts/,/stage/
]);
check("pg_uow","src/entregas/persistence/pg-uow.ts",[
 /inboundReceipts/,/inbound_receipt/
]);
check("application_service","src/entregas/operational/application-service.ts",[
 /execute\s*\(\s*cmd\s*:\s*Command\s*,\s*receipt\s*\?\s*:\s*DurableInboundReceipt/,
 /classifyInboundReceipt/,/inboundReceipts/
]);
check("http_endpoint","tools/entregas_pilot_server.ts",[
 /\/api\/events\/batch/,/ev\.event_id/,/idempotency_key/,/retryable/
]);
check("facade_receipt_bridge","src/entregas/pilot/pilot-facade.ts",[
 /executeAs\s*\(/,/DurableInboundReceipt/,/\.svc\.execute\s*\(/ 
]);
check("android_receipt_parser","android/app/src/main/java/br/com/tata/entregas/sync/EventReceipt.kt",[
 /retryable/,/EventReceiptDecision/
]);
if(failures.length){
 console.error("P0_RECEIPT_INTEGRATION_MISSING="+failures.length);
 failures.forEach(x=>console.error("  - "+x));
 console.error("PR_REVIEW_HOLD: receipts verified on Foxxy do not prove the GitHub HEAD.");
 console.error("STATIC_GATE_ONLY: even when green, runtime proof requires 3 HTTP + 2 Android.");
 process.exitCode=1;
}else{
 console.log("P0_RECEIPT_INTEGRATION_SOURCE_PRESENT=8/8");
 console.log("NOT_RELEASE_PROOF: run HTTP PG and Android end-to-end gates.");
}
