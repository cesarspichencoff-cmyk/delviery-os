'use strict';
// Structural contract on actual Kotlin sources; no Android/Room/network effects.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const worker=read('android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt');
const policy=read('android/app/src/main/java/br/com/tata/entregas/sync/EventBatchHttpRejection.kt');
const helper=read('android/app/src/main/java/br/com/tata/entregas/sync/EventBatchHttpRejectionRoom.kt');
const roomTests=read('android/app/src/test/java/br/com/tata/entregas/EventBatchHttpRejectionRoomTest.kt');

function inspect(w,p,h,t){
 const fail=[];
 const check=(ok,id)=>{if(!ok)fail.push(id)};
 check(p.includes('httpStatus == 403 || delegationDenied'),'AUTH_CLASSIFICATION_MISSING');
 check(p.includes('EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION'),'UNATTESTED_CLASS_MISSING');
 check(w.includes('var unreceiptedBatchBlocked = false'),'HOLD_STATE_MISSING');
 const final=w.split('// Credencial recusada e RETENTAVEL.')[1]?.split('private fun ackJson')[0];
 check(typeof final==='string','WORKER_ENDING_MISSING');
 if(final){
   check(final.includes('if (credencialRecusada) DeviceSession.limparCredencial(db)'),'CREDENTIAL_CLEAR_WITHOUT_EARLY_RETURN_REQUIRED');
   check(final.includes('if (gpsDrain.remaining) return Result.retry()'),'GPS_BACKLOG_PRIORITY_REQUIRED');
   check(final.includes('if ((credencialRecusada || retryable) && shouldRetryFast(runAttemptCount))'),'RETRIES_MUST_BE_BOUNDED');
   check(!final.includes('return retryOrYield()'),'EARLY_SUCCESS_AFTER_RETRY_CAP');
   check(w.includes('val gpsBatchUnreceipted = gpsDrain.unreceiptedBatchBlocked'),'GPS_HOLD_NOT_PROPAGATED');
   const hold='if (pilotAuthorizationBlocked || unreceiptedBatchBlocked || gpsBatchUnreceipted || unconfirmedTermAck) return Result.failure()';
   check(final.includes(hold)&&final.indexOf(hold)<final.lastIndexOf('return Result.success()'),'FALSE_WORKER_SUCCESS');
 }
 const event=w.split('// 2. Eventos operacionais.')[1]?.split('// 3. Pontos de GPS.')[0];
 check(typeof event==='string','OUTBOX_SCOPE_MISSING');
 if(event){
   const start=event.lastIndexOf('is ApiResult.Rejected ->');
   check(start!==-1,'REJECTION_BRANCH_MISSING');
   const branch=event.slice(start);
   check(event.includes('decideEventReceipt('),'PER_EVENT_RECEIPT_REQUIRED');
   check(branch.includes('when (retainUnreceiptedEventBatch('),'ROOM_HELPER_NOT_CALLED');
   check(branch.includes('db = db,')&&branch.includes('eventIds = ids,')&&branch.includes('rejection = r,'),'ROOM_HELPER_WRONG_ARGS');
   check(branch.includes('delegationDenied = dispatch.delegationDenied'),'DELEGATION_PROVENANCE_MISSING');
   check(branch.includes('pilotAuthorizationBlocked = true'),'AUTH_BLOCK_NOT_USED');
   check(branch.includes('unreceiptedBatchBlocked = true'),'REJECTION_BLOCK_NOT_USED');
   check(!branch.includes('db.outbox().markRejected('),'WHOLE_BATCH_TERMINALLY_REJECTED');
   check(!branch.includes('db.outbox().markSent('),'WHOLE_BATCH_FALSE_SENT');
   check(!branch.includes('DeviceSession.limparCredencial('),'PILOT_CLEARS_PLATFORM_TOKEN');
 }
 check(h.includes('suspend fun retainUnreceiptedEventBatch('),'ROOM_HELPER_MISSING');
 check(h.includes('db.outbox().markFailed(eventIds, rejection.reason)'),'ROOM_FAILED_RETENTION_MISSING');
 check(h.includes('return classifyEventBatchHttpRejection('),'CLASSIFIER_BYPASSED');
 check(h.includes('httpStatus = rejection.status'),'HTTP_STATUS_NOT_BOUND');
 check(h.includes('delegationDenied = delegationDenied'),'AUTH_PROVENANCE_NOT_BOUND');
 check(h.includes('eventIds.size == eventIds.toSet().size'),'DUPLICATE_IDS_NOT_REFUSED');
 check(h.includes('eventIds.all { it.isNotBlank() }'),'BLANK_IDS_NOT_REFUSED');
 check(!h.includes('db.outbox().markSent(')&&!h.includes('db.outbox().markRejected('),'ROOM_HELPER_TERMINAL_EFFECT');
 const gps=w.split('// 3. Pontos de GPS.')[1]?.split('// 4. B5')[0];
 check(typeof gps==='string','GPS_SECTION_MISSING');
 if(gps){
   check(gps.includes('val gpsDrain = drainGpsQueue('),'GPS_DRAIN_MISSING');
   check(gps.includes('val gpsBatchUnreceipted = gpsDrain.unreceiptedBatchBlocked'),'GPS_HOLD_UNBOUND');
 }
 const gpsApply=w.split('internal suspend fun applyGpsBatchResponse(')[1]?.split('class SyncWorker(')[0];
 check(typeof gpsApply==='string','GPS_APPLY_MISSING');
 if(gpsApply){
   const reject=gpsApply.split('is ApiResult.Rejected ->')[1] || '';
   const terminal=reject.split('if (r.status == 400 || r.status == 403) {')[1]?.split('} else {')[0];
   const uncertain=reject.split('} else {')[1] || '';
   check(terminal?.includes('db.gpsPoints().markRejected(ids'),'GPS_TERMINAL_400_403_POLICY_MISSING');
   check(uncertain.includes('db.gpsPoints().markFailed(ids, "lote_gps_sem_recibo_http_'),'GPS_BATCH_RECEIPT_UNATTESTED_LOSS');
   check(uncertain.includes('GpsBatchOutcome(unreceiptedBatchBlocked = true)'),'GPS_BATCH_HOLD_MISSING');
   check(!uncertain.includes('db.gpsPoints().markRejected(ids'),'GPS_WHOLE_BATCH_REJECTED');
 }

 check(t.includes('Room.databaseBuilder(context, EntregasDatabase::class.java, dbName)'),'ROOM_TEST_NOT_FILE_BASED');
 check(t.includes('db.close()\n        db = open()\n        val saved = db.outbox().nextBatch(20).single()'),'ROOM_TEST_MISSING_REOPEN');
 check(t.includes('original.idempotencyKey'),'ROOM_TEST_NOT_CHECKING_IDEMPOTENCY');
 check(t.includes('respostaAtrasadaNaoReabreEventoTerminal'),'ROOM_TEST_TERMINAL_RACE_MISSING');
 return fail;
}
let total=0;
function test(name,fn){fn();total++;console.log('PASS '+name)}
test('real Kotlin worker, classifier, Room helper, and Room fixture source bound',()=>{
 assert.deepEqual(inspect(worker,policy,helper,roomTests),[]);
});
function mutant(label,which,original,replacement,expected){
 test(label,()=>{
   const sources=[worker,policy,helper,roomTests];
   const s=sources[which];
   assert.equal(s.split(original).length,2,'mutation anchor absent: '+label);
   sources[which]=s.replace(original,replacement);
   assert.ok(inspect(...sources).includes(expected),
     label+': '+inspect(...sources).join(','));
 });
}
mutant('403 remains authorization',1,'httpStatus == 403 || delegationDenied','false','AUTH_CLASSIFICATION_MISSING');
mutant('hold precedes worker success',0,
 'if (pilotAuthorizationBlocked || unreceiptedBatchBlocked || gpsBatchUnreceipted || unconfirmedTermAck) return Result.failure()',
 'if (pilotAuthorizationBlocked || unreceiptedBatchBlocked || gpsBatchUnreceipted) return Result.success()',
 'FALSE_WORKER_SUCCESS');
mutant('worker actually calls Room helper',0,
 'when (retainUnreceiptedEventBatch(','when (unusedRejectionHelper(','ROOM_HELPER_NOT_CALLED');
mutant('Room retains failed rather than terminal rejected',2,
 'db.outbox().markFailed(eventIds, rejection.reason)',
 'db.outbox().markRejected(eventIds, rejection.reason)',
 'ROOM_FAILED_RETENTION_MISSING');
mutant('no false sent from Room helper',2,
 'db.outbox().markFailed(eventIds, rejection.reason)',
 'db.outbox().markFailed(eventIds, rejection.reason)\n    db.outbox().markSent(eventIds)',
 'ROOM_HELPER_TERMINAL_EFFECT');
mutant('delegation provenance cannot be fabricated',0,
 'delegationDenied = dispatch.delegationDenied','delegationDenied = false',
 'DELEGATION_PROVENANCE_MISSING');
mutant('authorization failure signalled',0,
 'pilotAuthorizationBlocked = true\n                        EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION',
 'pilotAuthorizationBlocked = false\n                        EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION',
 'AUTH_BLOCK_NOT_USED');
mutant('uncertain rejection failure signalled',0,
 'unreceiptedBatchBlocked = true\n                    }',
 'unreceiptedBatchBlocked = false\n                    }',
 'REJECTION_BLOCK_NOT_USED');
mutant('platform token not reset by pilot 4xx',0,
 'unreceiptedBatchBlocked = true\n                    }',
 'unreceiptedBatchBlocked = true\n                        DeviceSession.limparCredencial(db)\n                    }',
 'PILOT_CLEARS_PLATFORM_TOKEN');
mutant('local duplicate IDs not accepted',2,
 'eventIds.size == eventIds.toSet().size','true',
 'DUPLICATE_IDS_NOT_REFUSED');
mutant('Room tests must close and reopen file',3,
 'db.close()\n        db = open()\n        val saved = db.outbox().nextBatch(20).single()',
 'db.close()\n        // reopen suppressed\n        val saved = db.outbox().nextBatch(20).single()',
 'ROOM_TEST_MISSING_REOPEN');
mutant('retry does not report success early',0,
 'if ((credencialRecusada || retryable) && shouldRetryFast(runAttemptCount))',
 'if (credencialRecusada || retryable)',
 'RETRIES_MUST_BE_BOUNDED');
mutant('GPS backlog keeps independent priority',0,
 'if (gpsDrain.remaining) return Result.retry()',
 'if (gpsDrain.remaining) return Result.success()',
 'GPS_BACKLOG_PRIORITY_REQUIRED');
mutant('per-event receipt path stays independent',0,
 'decideEventReceipt(','unsafeDecideEventReceipt(',
 'PER_EVENT_RECEIPT_REQUIRED');
mutant('GPS HTTP 4xx cannot terminally reject an unreceipted batch',0,
 'db.gpsPoints().markFailed(ids, "lote_gps_sem_recibo_http_${r.status}")',
 'db.gpsPoints().markRejected(ids, "lote_gps_sem_recibo_http_${r.status}")',
 'GPS_BATCH_RECEIPT_UNATTESTED_LOSS');
mutant('GPS unreceipted batch cannot make worker successful',0,
 'val gpsBatchUnreceipted = gpsDrain.unreceiptedBatchBlocked',
 'val gpsBatchUnreceipted = false',
 'GPS_HOLD_NOT_PROPAGATED');
console.log('ANDROID_EVENT_BATCH_HTTP_4XX_SOURCE_PASS '+total+'/'+total+
 ' NO_ANDROID_NO_ROOM_NO_NETWORK');
