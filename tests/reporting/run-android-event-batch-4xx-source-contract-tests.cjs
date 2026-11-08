'use strict';
// Contract of the real Android source; does not execute Android, Room or network.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const worker=read('android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt');
const policy=read('android/app/src/main/java/br/com/tata/entregas/sync/EventBatchHttpRejection.kt');
function inspect(w,p){
 const fail=[];
 const check=(c,s)=>{if(!c)fail.push(s)};
 check(p.includes('httpStatus == 403 || delegationDenied'),'AUTH_CLASSIFICATION_MISSING');
 check(p.includes('EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION'),'UNATTESTED_HOLD_MISSING');
 check(w.includes('var unreceiptedBatchBlocked = false'),'HOLD_STATE_MISSING');
 check(w.includes('if (pilotAuthorizationBlocked || unreceiptedBatchBlocked) return Result.failure()'),'FALSE_WORKER_SUCCESS');
 const event=w.split('// 2. Eventos operacionais.')[1]?.split('// 3. Pontos de GPS.')[0];
 check(typeof event==='string','OUTBOX_SCOPE_MISSING');
 if(event){
   const start=event.lastIndexOf('is ApiResult.Rejected ->');
   check(start!==-1,'REJECTED_BRANCH_MISSING');
   const branch=event.slice(start);
   check(event.includes('decideEventReceipt('),'PER_EVENT_RECEIPT_REQUIRED');
   check(branch.includes('db.outbox().markFailed(ids, r.reason)'),'ROOM_RETENTION_MISSING');
   check(branch.includes('classifyEventBatchHttpRejection('),'REJECTION_POLICY_NOT_USED');
   check(branch.includes('delegationDenied = dispatch.delegationDenied'),'DELEGATION_PROVENANCE_MISSING');
   check(branch.includes('pilotAuthorizationBlocked = true'),'AUTH_BLOCK_NOT_USED');
   check(branch.includes('unreceiptedBatchBlocked = true'),'REJECTION_BLOCK_NOT_USED');
   check(!branch.includes('db.outbox().markRejected('),'WHOLE_BATCH_TERMINALLY_REJECTED');
   check(!branch.includes('db.outbox().markSent('),'WHOLE_BATCH_FALSELY_SENT');
   check(!branch.includes('DeviceSession.limparCredencial('),'PILOT_4XX_CLEARED_PLATFORM_TOKEN');
 }
 return fail;
}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name)}
test('real Kotlin source rejects whole-batch terminal effects',()=>assert.deepEqual(inspect(worker,policy),[]));
function mutate(label,s,isPolicy,needle,replacement,reason){
 test(label,()=>{
   assert.ok(s.includes(needle),'missing mutation anchor');
   const actual=inspect(isPolicy?worker:s.replace(needle,replacement),
                        isPolicy?s.replace(needle,replacement):policy);
   assert.ok(actual.includes(reason),label+': '+actual.join(','));
 });
}
mutate('403 authorization remains separate',policy,true,
 'httpStatus == 403 || delegationDenied','false','AUTH_CLASSIFICATION_MISSING');
mutate('must not return false success',worker,false,
 'if (pilotAuthorizationBlocked || unreceiptedBatchBlocked) return Result.failure()',
 'if (pilotAuthorizationBlocked || unreceiptedBatchBlocked) return Result.success()','FALSE_WORKER_SUCCESS');
mutate('preserve Room records',worker,false,
 'db.outbox().markFailed(ids, r.reason)\n                    when (classifyEventBatchHttpRejection(',
 'db.outbox().markRejected(ids, r.reason)\n                    when (classifyEventBatchHttpRejection(','ROOM_RETENTION_MISSING');
mutate('do not bypass policy',worker,false,'when (classifyEventBatchHttpRejection(',
 'when (classifyEventBatchHttpRejectionIgnored(','REJECTION_POLICY_NOT_USED');
mutate('do not forge delegation evidence',worker,false,'delegationDenied = dispatch.delegationDenied',
 'delegationDenied = false','DELEGATION_PROVENANCE_MISSING');
mutate('do not suppress visible authorization failure',worker,false,
 'pilotAuthorizationBlocked = true\n                        EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION',
 'pilotAuthorizationBlocked = false\n                        EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION',
 'AUTH_BLOCK_NOT_USED');
mutate('do not suppress visible protocol failure',worker,false,
 'unreceiptedBatchBlocked = true\n                    }','unreceiptedBatchBlocked = false\n                    }',
 'REJECTION_BLOCK_NOT_USED');
mutate('pilot 4xx cannot erase platform token',worker,false,
 'unreceiptedBatchBlocked = true\n                    }',
 'unreceiptedBatchBlocked = true\n                        DeviceSession.limparCredencial(db)\n                    }',
 'PILOT_4XX_CLEARED_PLATFORM_TOKEN');
console.log('ANDROID_EVENT_BATCH_HTTP_4XX_SOURCE_PASS '+n+'/'+n+' NO_ANDROID_NO_ROOM_NO_NETWORK');
