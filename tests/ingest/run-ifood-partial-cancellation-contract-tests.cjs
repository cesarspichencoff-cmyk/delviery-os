'use strict';
// Real iFood XLSX statuses from an authorized historical export were aggregated
// on the POS. The rows here are FICTIONAL and contain no order/customer data.
const assert = require('node:assert/strict');
const ingest = require('../../dist/src/ingest/ifoodRelatorio.js');
const backtest = require('../../src/ingest/parserRelatorioIfood.js');
const row = (status) => ({
  'ID COMPLETO DO PEDIDO': '11111111-2222-4333-8444-555555555555',
  'ID CURTO DO PEDIDO': '4321',
  'DATA E HORA DO PEDIDO': '21/04/2026 19:30:00',
  'STATUS FINAL DO PEDIDO': status,
  'PEDIDO ACEITO PELA LOJA': 'SIM',
  'TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)': 15,
  'TEMPO DA ENTREGA REALIZADA (MIN)': 45,
  'DATA DO CANCELAMENTO': '21/04/2026 19:39:00',
});
let ok=0;
function check(status,wholeOrderCancelled){
 const r=row(status);
 const order=ingest.linhaParaPedido(r);
 const simulated=backtest.linhaParaRegistro(r);
 assert.ok(order && simulated, 'Both parsers should accept a structured fictional row');
 assert.equal(Boolean(order.cancelado_em),wholeOrderCancelled, 'TS total cancellation '+status);
 assert.equal(simulated.cancel,wholeOrderCancelled, 'Backtest total cancellation '+status);
 assert.equal(backtest.ehCancelado(status),wholeOrderCancelled, 'Shared status predicate '+status);
 if(wholeOrderCancelled){
   assert.equal(order.pronto_em,undefined);
   assert.equal(order.entregue_em,undefined);
   assert.equal(simulated.p,null);
   assert.equal(simulated.e,null);
 } else {
   assert.ok(order.pronto_em && order.entregue_em, 'Partial cancellation must not erase order completion');
   assert.equal(simulated.p,19*60+45);
   assert.equal(simulated.e,20*60+15);
   assert.equal(simulated.c,null);
 }
 ok++;
}
check('CONCLUIDO',false);
check('CANCELADO',true);
check('CANCELAMENTO PARCIAL',false);
check('CANCELAMENTO TOTAL',true);
check(' Cancelamento Parcial ',false);
assert.equal(backtest.ehCancelado('CANCELADO PARCIALMENTE'),false);
// Real March-April CSV had repeated four-digit IDs across unique UUIDs.
// Here two FICTIONAL records deliberately share the short code.
const makeError=(uuid) => ({...row('CANCELADO'),
 'ID COMPLETO DO PEDIDO':uuid,
 'MOTIVO DO CANCELAMENTO':'FICT_TEST_REASON'});
const error1=ingest.classificaErro(makeError('11111111-2222-4333-8444-555555555555'));
const error2=ingest.classificaErro(makeError('66666666-7777-4888-8999-aaaaaaaaaaaa'));
assert.ok(error1 && error2 && error1.tipo==='cancelamento' && error2.tipo==='cancelamento');
assert.notEqual(error1.pedido_id,error2.pedido_id,'Repeated short code MUST NOT collapse order errors');
assert.equal(error1.pedido_id,'11111111-2222-4333-8444-555555555555');
assert.equal(error2.pedido_id,'66666666-7777-4888-8999-aaaaaaaaaaaa');
ok++;
const complaint={...row('CONCLUIDO'),
 'CLIENTE INFORMOU PROBLEMA EM PEDIDO APÓS A ENTREGA':'SIM'};
const classified=ingest.classificaErro(complaint);
assert.equal(classified?.tipo,'problema_pos_entrega');
assert.equal(classified?.pedido_id,ingest.linhaParaPedido(complaint)?.pedido_id);
ok++;
console.log('IFOOD_REAL_EXPORT_STATUS_CONTRACT_PASS '+ok+'/7; FULL_CANCEL_NOT_PARTIAL; UUID_FIRST_ERROR_JOIN; FICTIONAL_ROWS_ONLY');
