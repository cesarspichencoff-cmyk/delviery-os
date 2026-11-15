'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {fixture,key}=require('./fixture.cjs');const {SqlSource}=require('../../runtime/reader-v3/sql-client.cjs');const {buildCapture}=require('../../runtime/reader-v3/capture.cjs');const {project}=require('../../runtime/reader-v3/projection.cjs');
const REPO=path.resolve(__dirname,'../..'),ps=process.env.TATA_PWSH||'pwsh';
function run(op,fixturePath){const r=cp.spawnSync(ps,['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'sql-lab.ps1'),'-Op',op,...(fixturePath?['-Fixture',fixturePath]:[])],{windowsHide:true,encoding:'utf8',timeout:110000});a.equal(r.status,0,(r.stderr||r.stdout).slice(-1600));return r.stdout;}
test('SQL Server real: parameterized eight rowsets, least privilege, lock timeout, recovery, dangling relation',async t=>{
 a.match(process.env.TATA_HARNESS_SQLSERVER||'',/^127\.0\.0\.1,\d{4,5}$/,'SQL lab is REQUIRED, not a skipped pass');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'reader-v3-sql-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const f=fixture(),h=f.headerRows[0];h.DTHRABERMESA=new Date(Date.now()-3*3600000-60000).toISOString().slice(0,19)+'.000';const day=h.DTHRABERMESA.slice(0,10),until=day+'T23:59:59.999';const tables={COMANDAVEN:[Object.fromEntries(Object.entries(h).filter(([k])=>k!=='DTHRABERMESA'))],VENDAREST:[{CDFILIAL:h.CDFILIAL,NRVENDAREST:h.NRVENDAREST,DTHRABERMESA:h.DTHRABERMESA}],ITCOMANDAVEN:f.itemRows.map((r,i)=>({...r,...{CDPRODPROMOCAO:i===0?'P4':null,NRSEQPRODCOM:i===0?'1':null}}))};
 for(const [n,s]of Object.entries(f.childRows))if(n!=='ITCOMANDAVEN_COMBO')tables[n]=s.rows.map(r=>n==='PRODUTO'?{...r,CDARVPROD:r.CDPRODUTO==='P1'?'9.20.00.010.00':'9.20.00.020.00'}:r);
 const fp=path.join(temp,'fixture.json');fs.writeFileSync(fp,JSON.stringify(tables));run('setup',fp);
 let script=fs.readFileSync(path.join(REPO,'runtime/reader-v3/sql-source.ps1'),'utf8');
 // Generated LAB copy only; production source exposes no bypass or SQL credentials.
 script=script.replace("$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name","$identity='NT SERVICE\\TataComandaReader'");
 script=script.replace(/\$connectionString='[^']*'/,"$connectionString=\"Server=$env:TATA_HARNESS_SQLSERVER;Database=reader_v3_lab;User ID=reader_v3_lab;Password=$env:READER_V3_LAB_PASSWORD;Encrypt=False;TrustServerCertificate=True;Connect Timeout=5\"");
 script=script.replace("$ir[0][0].login_name -ine 'NT SERVICE\\TataComandaReader'","$ir[0][0].login_name -ine 'reader_v3_lab'").replace("$ir[0][0].db_name -ine 'teknisa'","$ir[0][0].db_name -ine 'reader_v3_lab'");
 script=script.replace("$code='SQL_CAPTURE_FAILED';","[Console]::Error.WriteLine($_.Exception.ToString());$code='SQL_CAPTURE_FAILED';");
 fs.writeFileSync(path.join(temp,'source.ps1'),script);for(const n of ['discover.sql','capture.sql'])fs.copyFileSync(path.join(REPO,'runtime/reader-v3',n),path.join(temp,n));
 const source=new SqlSource({executable:ps,script:path.join(temp,'source.ps1')});t.after(()=>source.close());source.child.stderr.on('data',d=>console.log('LAB_ADAPTER_DIAGNOSTIC '+d.toString().slice(0,1200)));
 console.log('LAB_STAGE_DISCOVER');
 const discovered=await source.discover({time:day+'T00:00:00',sale:'',order:''},until);a.equal(discovered.length,1);
 const now=new Date(),service={turno:'ALMOCO',versao:'LAB'};
 console.log('LAB_STAGE_CAPTURE');const start=performance.now();const raw=await source.capture(h);const event=buildCapture(raw,key(f),now,service);a.equal(project(event).itens[0].componentes[0].observacoes[0],'FICT_CHILD_NOTE');
 console.log('SQL_CAPTURE_MS',Math.round(performance.now()-start));
 a.match(run('deny-write'),/WRITE_DENIED/);
 const locker=cp.spawn(ps,['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'sql-lab.ps1'),'-Op','lock'],{windowsHide:true,stdio:'ignore'});
 await new Promise(r=>setTimeout(r,1100));const t0=performance.now();await a.rejects(source.capture(h),/LOCK_TIMEOUT/);a.ok(performance.now()-t0<5000);await new Promise(r=>locker.on('exit',r));
 a.ok(buildCapture(await source.capture(h),key(f),now,service));
 run('remove');a.throws(()=>buildCapture({...raw,childRows:{...raw.childRows,OCORRENCIA:{rows:[],totalRows:0,readExhausted:true}}},key(f),now,service));
 const torn=await source.capture(h);a.throws(()=>buildCapture(torn,key(f),now,service));run('restore');a.ok(buildCapture(await source.capture(h),key(f),now,service));
 await a.rejects(source.capture({...h,NRVENDAREST:"';DROP"}),/SQL_CAPTURE_FAILED/);
 a.equal((await source.discover({time:h.DTHRABERMESA,sale:h.NRVENDAREST,order:h.NRCOMANDA},until)).length,0);
 const {runRuntime}=require('../../runtime/reader-v3/run.cjs'),S=require('../../runtime/reader-v3/store.cjs');
 const root=path.join(temp,'state'),projection=path.join(root,'projection');let finished=false;
 await runRuntime({cfg:{root,from:day+'T00:00:00'},service:()=>service,sourceFactory:()=>source,shouldStop:()=>finished,wait:async()=>{finished=true;}});
 const health=S.read(path.join(root,'health.json'));
 a.equal(health.state,'HEALTHY');a.equal(health.seq,1);a.equal(health.consumerSeq,1);
 const net=require('node:net'),port=await new Promise(r=>{const srv=net.createServer();srv.listen(0,'127.0.0.1',()=>{const p=srv.address().port;srv.close(()=>r(p));});});
 const home=cp.spawn(process.execPath,['dist/tools/product_system_server.js'],{cwd:REPO,windowsHide:true,stdio:'ignore',env:{...process.env,PRODUCT_UI_PORT:String(port),DELIVERYOS_READER_V3_PROJECTION_DIR:projection,DELIVERYOS_DATABASE_URL:'',TATA_READER_INSTALL_ROOT:'',DELIVERYOS_GESTOR_LOCAL_DIR:''}});
 t.after(async()=>{if(home.exitCode===null){const exited=new Promise(r=>home.once('exit',r));home.kill();await exited;}});
 let body;for(let i=0;i<70&&!body;i++){try{const response=await fetch(`http://127.0.0.1:${port}/api/home`);if(response.ok)body=await response.json();}catch{}if(!body)await new Promise(r=>setTimeout(r,100));}
 a.ok(body,'SQL to HTTP Home required');a.equal(body.pedidos_teknisa.contagens.pedidos,1);const order=body.pedidos_teknisa.pedidos[0];a.equal(order.retido,false);
 a.ok(order.itens[0].observacoes.some(x=>x.includes('Componente:')&&x.includes('FICT_CHILD_NOTE')));
 a.ok(order.itens[0].observacoes.some(x=>x.includes('Complemento:')));
 console.log('SQL_REAL_LOCK_RECOVERY_AND_CHILDREN_PROVEN_LAB_ONLY');
 console.log('SQL_REAL_TO_WATCHER_CONSUMER_HTTP_HOME_PASS');
});
