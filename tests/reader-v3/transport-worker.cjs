'use strict';
// JSON-line process fixture, never SQL. Exit on parent pipe EOF like the real adapter.
const readline=require('node:readline');const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{const q=JSON.parse(line);if(q.op==='double')return process.stdout.write('{"ok":true,"value":1}\n{"ok":true,"value":2}\n');if(q.op==='bad')return process.stdout.write('{bad}\n');if(q.op==='oversize')return process.stdout.write('x'.repeat(4*1024*1024+1));if(q.op==='exit')return process.exit(2);if(q.op==='hang')return;process.stdout.write(JSON.stringify({ok:true,value:q})+'\n');});
input.on('close',()=>process.exit(0));
