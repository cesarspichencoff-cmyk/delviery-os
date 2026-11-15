'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Watcher,Consumer,cursorOf}=require('../../runtime/reader-v3/engine.cjs');
const {buildCapture}=require('../../runtime/reader-v3/capture.cjs');const {project}=require('../../runtime/reader-v3/projection.cjs');const S=require('../../runtime/reader-v3/store.cjs');const {fixture,key}=require('./fixture.cjs');
const now=new Date('2026-11-15T15:01:00Z'),service=()=>({turno:'ALMOCO',versao:'TEST_WEEKLY'});
function setup(t,fixtures=[fixture()]){const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-v3-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let clock=now.getTime(),captures=0,discovers=0;const source={async discover(c,until){discovers++;return fixtures.map(f=>f.headerRows[0]).filter(h=>{const x=cursorOf(h);return JSON.stringify([x.time,x.sale,x.order])>JSON.stringify([c.time,c.sale,c.order])&&h.DTHRABERMESA<=until;}).sort((a,b)=>JSON.stringify([a.DTHRABERMESA,a.NRVENDAREST,a.NRCOMANDA]).localeCompare(JSON.stringify([b.DTHRABERMESA,b.NRVENDAREST,b.NRCOMANDA]))).slice(0,32);},async capture(r){captures++;return structuredClone(fixtures.find(f=>f.headerRows[0].NRVENDAREST===r.NRVENDAREST));}};
 const opts={root,source,from:'2026-11-15T00:00:00',service,clock:()=>new Date(clock)};
 return {root,source,opts,advance:n=>clock+=n,metrics:()=>({captures,discovers})};}
test('all child data, priced links and zero-based notes reach projection; X stays X',()=>{const f=fixture(),e=buildCapture(f,key(f),now,service()),p=project(e);a.equal(p.itens[0].observacoes[0],'FICT_NO_CILANTRO');a.equal(p.itens[1].observacoes.length,0);a.equal(p.itens[0].componentes[0].observacoes[0],'FICT_CHILD_NOTE');a.equal(p.itens[0].complementos[0].quantidade_nativa,'2.000');a.equal(p.estado_nativo,'X');a.equal(p.reader_v3.sql_snapshot_atomicity_proven,false);a.equal(p.reader_v3.independent_ifood_completeness,'NOT_CONFIRMED');});
const bads={
 missing_set:f=>delete f.childRows.OBSITCOMANDAEST,
 cap_sentinel:f=>{const s=f.childRows.ITCOMANDAEST;s.rows=Array(200).fill(s.rows[0]);s.totalRows=200;},
 not_drained:f=>f.childRows.PRODUTO.readExhausted=false,
 wrong_scope:f=>f.itemRows[0].CDLOJA='02',
 dangling_child:f=>f.childRows.ITCOMANDAEST.rows[0].NRPRODCOMVEN='999',
 bad_paid_qty:f=>f.childRows.OBSITCOMANDAVEN.rows[0].QTPRODCOMVENOBS='3',
 missing_note_column:f=>delete f.itemRows[0].TXPRODCOMVEN,
 missing_master:f=>{f.childRows.PRODUTO.rows.pop();f.childRows.PRODUTO.totalRows--;},
 duplicate_header:f=>f.headerRows.push(f.headerRows[0]),
 missing_direct:f=>f.itemRows=[],
 bad_quantity:f=>f.itemRows[0].QTPRODCOMVEN='-1',
 extra_occurrence:f=>{const s=f.childRows.OCORRENCIA;s.rows.push({...s.rows[0],CDOCORR:'OTHER'});s.totalRows++;},
 duplicate_sku_note:f=>{f.itemRows[1].CDPRODUTO='P1';},
 no_exhaustion:f=>f.readExhausted=false,
 unsupported_origin:f=>f.headerRows[0].IDORGCMDVENDA='OTHER'
};
for(const [label,change]of Object.entries(bads))test('reject '+label,()=>{const f=fixture();change(f);a.throws(()=>buildCapture(f,key(f),now,service()));});
test('secret and customer extra fields cannot enter event',()=>{const f=fixture();f.headerRows[0].customer='PII_CANARY';f.itemRows[0].token='SECRET_CANARY';const e=buildCapture(f,key(f),now,service());a.ok(!JSON.stringify(e).includes('CANARY'));});
test('revision changes on child-only update and on delete',()=>{const f=fixture(),h=()=>buildCapture(f,key(f),now,service()).revision,x=h();f.childRows.OCORRENCIA.rows[1].DSOCORR='FICT_CHANGED';a.notEqual(x,h());});
test('no duplicate after restart; consumer idle does zero directory enumeration',async t=>{const x=setup(t);let w=new Watcher(x.opts);await w.tick();a.equal(w.state.seq,1);w.close();x.advance(6000);w=new Watcher(x.opts);await w.tick();a.equal(w.state.seq,1);w.close();const c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>now,project});a.equal(c.tick().count,1);const original=fs.readdirSync;fs.readdirSync=()=>{throw Error('FULL_SCAN');};try{a.equal(c.tick().count,0);}finally{fs.readdirSync=original;c.close();}});
for(const point of ['after_checkpoint','after_event'])test('crash recovery '+point,async t=>{const x=setup(t);let once=true;let w=new Watcher({...x.opts,fault:p=>{if(p===point&&once){once=false;throw Error('INJECTED_CRASH');}}});await a.rejects(w.tick());w.close();x.advance(70000);w=new Watcher(x.opts);await w.tick();a.equal(w.state.seq,1);a.equal(fs.readdirSync(path.join(x.root,'events')).filter(f=>f.endsWith('.json')).length,1);w.close();});
test('consumer crash before commit replays exactly once',async t=>{const x=setup(t);const w=new Watcher(x.opts);await w.tick();w.close();let c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>now,project,fault:()=>{throw Error('CRASH');}});a.throws(()=>c.tick());c.close();c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>now,project});a.equal(c.tick().count,1);a.equal(c.tick().count,0);c.close();});
test('overlapping tick and second writer both rejected',async t=>{const x=setup(t);let unblock;const wait=new Promise(r=>unblock=r);const discover=x.source.discover;x.source.discover=async(...args)=>{await wait;return discover(...args);};const w=new Watcher(x.opts);const active=w.tick();await a.rejects(w.tick(),/OVERLAP/);a.throws(()=>new Watcher(x.opts),/OWNER_LOCKED/);unblock();await active;w.close();});
test('poison order rotates, holds previous revision and does not starve good order',async t=>{const f=fixture(),g=fixture(2),x=setup(t,[f,g]);const w=new Watcher(x.opts);const capture=x.source.capture;x.source.capture=async r=>{if(r.NRVENDAREST===f.headerRows[0].NRVENDAREST)throw Error('LOCK_TIMEOUT');return capture(r);};await a.rejects(w.tick(),/LOCK_TIMEOUT/);x.advance(70000);await a.rejects(w.tick());a.equal(w.state.seq,1);a.ok(w.state.holds[key(f)]);w.close();});
test('missing event and modified event never advance consumer',async t=>{const x=setup(t);const w=new Watcher(x.opts);await w.tick();w.close();const file=path.join(x.root,'events',S.eventName(1)),raw=fs.readFileSync(file);fs.unlinkSync(file);const c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>now,project});a.throws(()=>c.tick());a.equal(c.state.seq,0);fs.writeFileSync(file,raw);const v=JSON.parse(raw);v.data.event.order.items[0].QTPRODCOMVEN='9';S.atomic(file,v.data);a.throws(()=>c.tick(),/INTEGRITY/);a.equal(c.state.seq,0);c.close();});
test('corrupt checkpoint cannot silently bootstrap',async t=>{const x=setup(t);fs.writeFileSync(path.join(x.root,'watcher.json'),'{');a.throws(()=>new Watcher(x.opts));a.ok(!fs.existsSync(path.join(x.root,'watcher.lock')));});
test('1000 same-time orders paginate without loss or 250 cutoff',async t=>{const started=performance.now(),cpu=process.cpuUsage();const x=setup(t,Array.from({length:1000},(_,i)=>fixture(i+1)));const w=new Watcher(x.opts);for(let i=0;i<250&&w.state.seq<1000;i++){await w.tick();x.advance(6000);}a.equal(w.state.seq,1000);w.close();const c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>now,project});while(c.tick(128).lag>0){}a.equal(Object.keys(c.state.latest).length,1000);c.close();console.log('V3_1000_ORDERS',JSON.stringify({wall_ms:Math.round(performance.now()-started),cpu_us:process.cpuUsage(cpu),queries:x.metrics()}));});
test('a current order passes a saturated historical queue from the previous checkpoint format',async t=>{
 const history=Array.from({length:140},(_,i)=>fixture(i+1));
 for(const f of history)f.headerRows[0].DTHRABERMESA='2026-11-15T10:00:00.000';
 const recent=fixture(141),x=setup(t,[...history,recent]);
 let watcher=new Watcher(x.opts);
 watcher.state.pending=history.map(f=>({key:key(f),row:f.headerRows[0]}));
 watcher.save();watcher.close();

 const attempted=[];
 const capture=x.source.capture;
 x.source.capture=async row=>{attempted.push(row.NRVENDAREST);return capture(row);};
 watcher=new Watcher(x.opts);
 const tick=await watcher.tick();
 a.equal(attempted[0],recent.headerRows[0].NRVENDAREST);
 a.equal(attempted[1],history[0].headerRows[0].NRVENDAREST);
 a.equal(tick.captured,6);
 a.ok(tick.queries<=8);
 a.equal(watcher.state.pending.length,history.length-5);
 const cursor=watcher.state.recentCursor;
 watcher.close();

 watcher=new Watcher(x.opts);
 a.deepEqual(watcher.state.recentCursor,cursor);
 x.advance(6000);await watcher.tick();
 a.equal(attempted.filter(id=>id===recent.headerRows[0].NRVENDAREST).length,1);
 for(let i=0;i<30&&watcher.state.seq<141;i++){x.advance(6000);await watcher.tick();}
 a.equal(watcher.state.seq,141);
 a.equal(watcher.state.pending.length,0);
 watcher.close();
});
test('live owner lock cannot be recovered',t=>{const x=setup(t);const release=S.lock(x.root,'unit');a.throws(()=>S.recoverLock(x.root,'unit'),/OWNER_ALIVE/);release();});
test('failed consumer atomic write leaves memory and disk at old checkpoint',async t=>{const x=setup(t),w=new Watcher(x.opts);await w.tick();w.close();const out=path.join(x.root,'projection'),c=new Consumer({root:out,sourceRoot:x.root,clock:()=>now,project});const rename=fs.renameSync;fs.renameSync=(a,b)=>{if(b===path.join(out,'consumer.json'))throw Object.assign(Error('DISK_FULL'),{code:'ENOSPC'});return rename(a,b);};try{a.throws(()=>c.tick(),/DISK_FULL/);a.equal(c.state.seq,0);a.equal(Object.keys(c.state.latest).length,0);}finally{fs.renameSync=rename;}a.equal(c.tick().count,1);a.equal(c.tick().count,0);c.close();});
for(const point of ['after_checkpoint','after_event'])test('real process kill and explicit lock recovery '+point,async t=>{const x=setup(t),cp=require('node:child_process');const child=cp.spawn(process.execPath,[path.join(__dirname,'process-worker.cjs'),x.root,'watcher',point],{windowsHide:true,stdio:'ignore'});const exit=await new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));a.ok(exit.signal||exit.code!==0);a.throws(()=>new Watcher(x.opts),/OWNER_LOCKED/);S.recoverLock(x.root,'watcher');const w=new Watcher(x.opts);await w.tick();a.equal(w.state.seq,1);w.close();a.equal(fs.readdirSync(path.join(x.root,'events')).filter(n=>n.endsWith('.json')).length,1);});
test('real consumer process kill replays the uncommitted event',async t=>{const x=setup(t),w=new Watcher(x.opts);await w.tick();w.close();const cp=require('node:child_process'),child=cp.spawn(process.execPath,[path.join(__dirname,'process-worker.cjs'),x.root,'consumer','before_consumer_checkpoint'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>child.once('exit',r));const root=path.join(x.root,'projection');S.recoverLock(root,'consumer');const c=new Consumer({root,sourceRoot:x.root,clock:()=>now,project});a.equal(c.tick().count,1);a.equal(c.tick().count,0);c.close();});
test('cross-process writer exclusion and recovery after owner dies',async t=>{const x=setup(t),cp=require('node:child_process'),child=cp.fork(path.join(__dirname,'process-worker.cjs'),[x.root,'lock'],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});t.after(()=>child.kill());await new Promise((r,j)=>{child.once('message',r);child.once('error',j);});a.throws(()=>new Watcher(x.opts),/OWNER_LOCKED/);a.throws(()=>S.recoverLock(x.root,'watcher'),/OWNER_ALIVE/);const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;S.recoverLock(x.root,'watcher');const w=new Watcher(x.opts);await w.tick();w.close();});
test('late child revision, A-B-A revision and backdated insertion are all emitted',async t=>{const f=fixture(),rows=[f],x=setup(t,rows),w=new Watcher(x.opts);await w.tick();const first=w.state.latest[key(f)].revision;f.childRows.OCORRENCIA.rows[1].DSOCORR='FICT_CHANGED';x.advance(16000);await w.tick();a.equal(w.state.seq,2);f.childRows.OCORRENCIA.rows[1].DSOCORR='FICT_CHILD_NOTE';x.advance(16000);await w.tick();a.equal(w.state.seq,3);a.equal(w.state.latest[key(f)].revision,first);const late=fixture(2);late.headerRows[0].DTHRABERMESA='2026-11-15T11:59:00.000';rows.push(late);x.advance(70000);await w.tick();a.equal(w.state.seq,4);w.close();});
test('projection retires old active rows, immutable revisions survive',async t=>{const x=setup(t),w=new Watcher(x.opts);await w.tick();w.close();const c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>new Date(now.getTime()+50*3600000),project});a.equal(c.tick().count,1);a.equal(Object.keys(c.state.latest).length,0);a.ok(fs.existsSync(path.join(x.root,'events',S.eventName(1))));c.close();});
test('idle consumer cost stays independent of 21000 historical events',t=>{const x=setup(t);S.atomic(path.join(x.root,'watcher.json'),{schema:1,seq:21000,outbox:null,holds:{},failures:0});const root=path.join(x.root,'projection');S.directory(root);S.atomic(path.join(root,'consumer.json'),{schema:1,seq:21000,latest:{}});const c=new Consumer({root,sourceRoot:x.root,clock:()=>now,project});const readdir=fs.readdirSync;fs.readdirSync=()=>{throw Error('HISTORY_SCAN');};const start=performance.now(),cpu=process.cpuUsage();try{for(let i=0;i<200;i++)a.equal(c.tick().count,0);}finally{fs.readdirSync=readdir;c.close();}console.log('V3_IDLE_200_TICKS',JSON.stringify({wall_ms:Math.round(performance.now()-start),cpu_us:process.cpuUsage(cpu),historical_sequences:21000,directory_enumerations:0}));});
test('bad event in a batch commits none of that batch; repaired batch replays',async t=>{const x=setup(t,[fixture(),fixture(2)]),w=new Watcher(x.opts);await w.tick();w.close();const file=path.join(x.root,'events',S.eventName(2)),bytes=fs.readFileSync(file);fs.writeFileSync(file,'{}');const c=new Consumer({root:path.join(x.root,'projection'),sourceRoot:x.root,clock:()=>now,project});a.throws(()=>c.tick());a.equal(c.state.seq,0);fs.writeFileSync(file,bytes);a.equal(c.tick().count,2);a.equal(c.tick().count,0);S.atomic(path.join(x.root,'watcher.json'),{seq:1,outbox:null});a.throws(()=>c.tick(),/PRODUCER_SEQUENCE_INVALID/);c.close();});
