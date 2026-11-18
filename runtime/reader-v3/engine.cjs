'use strict';
const path=require('node:path');const S=require('./store.cjs');const {buildCapture}=require('./capture.cjs');
const keyOf=r=>[r.CDFILIAL,r.CDLOJA,r.NRVENDAREST,r.NRCOMANDA].join('|');
function cursorOf(r){return {time:r.DTHRABERMESA,sale:r.NRVENDAREST,order:r.NRCOMANDA};}
function cmp(a,b){for(const k of ['time','sale','order']){if(a[k]!==b[k])return a[k]<b[k]?-1:1;}return 0;}
const initialCursor=from=>({time:from,sale:'',order:''});
const RECENT_MS=5*60*1000;
const CAPTURES_PER_TICK=6;
const HISTORY_QUEUE_LIMIT=96;
const RECENT_QUEUE_LIMIT=32;
const DISCOVERY_QUEUE_LIMIT=HISTORY_QUEUE_LIMIT+2*RECENT_QUEUE_LIMIT;
function validateDiscovery(rows,cursor,until){
 if(!Array.isArray(rows)||rows.length>32)throw Error('DISCOVERY_BOUNDS');let prev=cursor;
 for(const r of rows){if(r.CDFILIAL!=='0001'||r.CDLOJA!=='01'||!['DLV_IFO','DLV_NMO'].includes(r.IDORGCMDVENDA)||
  !/^[A-Za-z0-9_-]{1,10}$/.test(r.NRVENDAREST)||!/^[A-Za-z0-9_-]{1,10}$/.test(r.NRCOMANDA)||
  typeof r.DTHRABERMESA!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(r.DTHRABERMESA)||
  r.DTHRABERMESA>until||cmp(cursorOf(r),prev)<=0)throw Error('DISCOVERY_ORDER_OR_SCOPE');prev=cursorOf(r);}
}
class Watcher {
 constructor({root,source,from,service,clock=()=>new Date(),fault=()=>{}}){
  if(!/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(from))throw Error('EXPLICIT_START_REQUIRED');
  this.root=root;this.source=source;this.service=service;this.clock=clock;this.fault=fault;this.busy=false;
  this.release=S.lock(root,'watcher');
  try{S.directory(path.join(root,'events'));this.file=path.join(root,'watcher.json');this.state=S.readOrNew(this.file,()=>({schema:1,from,cursor:initialCursor(from),repair:initialCursor(from),repairAt:0,seq:0,pending:[],latest:{},holds:{},outbox:null,failures:0,nextAt:0}));
   if(this.state.schema!==1||this.state.from!==from||!Number.isSafeInteger(this.state.seq)||this.state.seq<0||!Array.isArray(this.state.pending))throw Error('CHECKPOINT_INVALID');
  }catch(e){this.release();throw e;}
 }
 save(){S.atomic(this.file,this.state);}
 flush(){const s=this.state;if(!s.outbox)return;const out=path.join(this.root,'events',S.eventName(s.outbox.seq));
  const prior=S.readOrNew(out,()=>null);if(prior&&S.hash(prior)!==S.hash(s.outbox))throw Error('OUTBOX_CONFLICT');
  if(!prior)S.atomic(out,s.outbox);this.fault('after_event');s.outbox=null;this.save();}
 async tick(){if(this.busy)throw Error('TICK_OVERLAP');this.busy=true;
  const start=Date.now(),now=this.clock(),ms=now.getTime();const stats={queries:0,captured:0,emitted:0,pending:0};
  try{
   this.flush();if(ms<this.state.nextAt)return {...stats,backoff:true};
   // Wall time is explicit, source native clock uses Sao Paulo UTC-03.
   const wallTime=ms-3*3600000;
   const until=new Date(wallTime).toISOString().slice(0,23);
   const recentFloor=new Date(wallTime-RECENT_MS).toISOString().slice(0,23);
   const isRecent=p=>p.row.DTHRABERMESA>=recentFloor;
   const enqueue=r=>{const k=keyOf(r);if(!this.state.pending.some(p=>p.key===k))this.state.pending.push({key:k,row:r});};
   const discover=async (cursor)=>{
    const rows=await this.source.discover(cursor,until);stats.queries++;
    validateDiscovery(rows,cursor,until);
    return rows;
   };
   const enqueueNew=row=>{if(!this.state.latest[keyOf(row)])enqueue(row);};
   // The recent cursor can skip ahead. The chronological cursor still discovers
   // orders outside that window, including those already pending at restart.
   let recentStartup=false;
   if(this.state.cursor.time<recentFloor&&this.state.pending.length<DISCOVERY_QUEUE_LIMIT&&this.state.pending.filter(isRecent).length<RECENT_QUEUE_LIMIT){
    const prior=this.state.recentCursor;
    const cursor=prior&&prior.time>=recentFloor?prior:initialCursor(recentFloor);
    const rows=await discover(cursor);
    rows.forEach(enqueueNew);
    recentStartup=!prior&&rows.length>0;
    this.state.recentCursor=rows.length?cursorOf(rows.at(-1)):cursor;
    this.save();
   }
   if(!recentStartup&&this.state.pending.length<HISTORY_QUEUE_LIMIT){
    if(ms>=this.state.repairAt){
     // Alternate chronological discovery with a bounded page for backdated inserts.
     const floor=new Date(wallTime-48*3600000).toISOString().slice(0,19);
     const cursor=this.state.repair.time>=floor?this.state.repair:initialCursor(floor);
     const rows=await discover(cursor);
     rows.forEach(row=>{const old=this.state.latest[keyOf(row)];if(!old||ms-old.checkedAt>=900000)enqueue(row);});
     this.state.repair=rows.length===32?cursorOf(rows.at(-1)):initialCursor(floor);
     this.state.repairAt=ms+60000;
    }else{
     const rows=await discover(this.state.cursor);
     rows.forEach(enqueueNew);
     if(rows.length)this.state.cursor=cursorOf(rows.at(-1));
    }
    this.save();
   }
   // Fast revisions for recent orders; historical/terminal state letters never imply completion.
   for(const [key,v] of Object.entries(this.state.latest)){
    const age=ms-Date.parse(v.row.DTHRABERMESA.slice(0,23)+'-03:00');
    const interval=age<300000?15000:age<7200000?60000:900000;
    const queueLimit=isRecent(v)?HISTORY_QUEUE_LIMIT+RECENT_QUEUE_LIMIT:HISTORY_QUEUE_LIMIT;
    if(age<=48*3600000&&ms-v.checkedAt>=interval&&this.state.pending.length<queueLimit)enqueue(v.row);
   }
   this.save();
   for(let n=0;n<CAPTURES_PER_TICK&&this.state.pending.length&&Date.now()-start<1500;n++){
    // Read a recent order first and reserve the second slot for older orders.
    const preferRecent=n!==1;
    const preferred=this.state.pending.findIndex(p=>isRecent(p)===preferRecent);
    const at=Math.max(0,preferred);
    const p=this.state.pending[at];let event;
    try{const raw=await this.source.capture(p.row);stats.queries++;stats.captured++;
     event=buildCapture(raw,p.key,now,this.service(raw.headerRows?.[0]?.DTHRABERMESA));
     delete this.state.holds[p.key];
    }catch(e){
     this.state.holds[p.key]={code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CAPTURE_FAILED',at:now.toISOString()};
     this.state.pending.splice(at,1);this.state.pending.push(p);this.save();throw e;
    }
    const old=this.state.latest[p.key];this.state.pending.splice(at,1);
    this.state.latest[p.key]={row:p.row,checkedAt:ms,revision:event.revision};
    if(!old||old.revision!==event.revision){this.state.seq++;this.state.outbox={seq:this.state.seq,event};stats.emitted++;}
    this.save();this.fault('after_checkpoint');this.flush();
   }
   // Only scheduling metadata is retired. Immutable events and consumer history remain intact.
   for(const [key,v] of Object.entries(this.state.latest))if(ms-Date.parse(v.row.DTHRABERMESA.slice(0,23)+'-03:00')>49*3600000)delete this.state.latest[key];
   this.state.failures=0;this.state.nextAt=ms+5000;this.save();stats.pending=this.state.pending.length;return stats;
  }catch(e){this.state.failures++;this.state.nextAt=ms+Math.min(60000,5000*2**Math.min(4,this.state.failures));this.save();throw e;
  }finally{this.busy=false;}
 }
 close(){if(this.busy)throw Error('TICK_ACTIVE');this.release();}
}
// Sequential exact-path consumer: no readdir/exists calls per historical event.
class Consumer {
 constructor({root,sourceRoot,project,clock=()=>new Date(),fault=()=>{}}){this.clock=clock;this.root=root;this.sourceRoot=sourceRoot;this.project=project;this.fault=fault;this.release=S.lock(root,'consumer');
  try{this.file=path.join(root,'consumer.json');this.state=S.readOrNew(this.file,()=>({schema:1,seq:0,latest:{}}));if(this.state.schema!==1||!Number.isSafeInteger(this.state.seq)||this.state.seq<0)throw Error('CONSUMER_CHECKPOINT_INVALID');}catch(e){this.release();throw e;}}
 tick(limit=32){if(!Number.isInteger(limit)||limit<1||limit>128)throw Error('BATCH_INVALID');let count=0;
  const producer=S.read(path.join(this.sourceRoot,'watcher.json'));
  const committed=producer.seq-(producer.outbox?1:0);
  if(!Number.isSafeInteger(committed)||committed<this.state.seq||producer.outbox&&producer.outbox.seq!==producer.seq)throw Error('PRODUCER_SEQUENCE_INVALID');
  const next=this.state.seq<committed?{...this.state,latest:{...this.state.latest}}:this.state;
  while(next.seq<committed&&count<limit){const n=next.seq+1;const entry=S.read(path.join(this.sourceRoot,'events',S.eventName(n)),4*1024*1024);
   if(entry.seq!==n||entry.event?.schema!=='deliveryos.reader-v3.capture.v1'||entry.event.revision!==S.hash({order:entry.event.order,childRows:entry.event.childRows,service:entry.event.service}))throw Error('EVENT_INTEGRITY');
   next.latest[entry.event.order_key]=this.project(entry.event);next.seq=n;count++;
  }
  if(count){
   // One durable commit per bounded batch, not one rewrite per historical event.
   // Failure anywhere retains the old in-memory and on-disk cursor for replay.
   for(const [k,p] of Object.entries(next.latest))if(this.clock().getTime()-Date.parse(p.aberto_em_local+'-03:00')>49*3600000)delete next.latest[k];
   this.fault('before_consumer_checkpoint');S.atomic(this.file,next);this.state=next;
  }
  S.atomic(path.join(this.root,'source-status.json'),{schema:1,at:new Date().toISOString(),seq:this.state.seq,producerSeq:committed,holds:producer.holds??{},failures:producer.failures});
  return {count,seq:this.state.seq,lag:committed-this.state.seq};}
 close(){this.release();}
}
module.exports={Watcher,Consumer,validateDiscovery,cursorOf};
