/**
 * Q-026: benchmark HTTP original vs otimizado, mesmo PostgreSQL descartavel.
 * Original = integration SHA d0716fd em worktree separado.
 * Sem banco ou baseline: skip visivel com exit 78. So dados simulated.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";

const URL_TESTE=(process.env.DELIVERYOS_PG_URL??"").trim();
const BASELINE=(process.env.Q026_BASELINE_CWD??"").trim();
const N=Number(process.env.Q026_EVENTS??100000);
if(!URL_TESTE||!BASELINE){console.error("PULADO: URL PG de teste ou baseline ausente");process.exit(78)}
assert.ok(Number.isSafeInteger(N)&&N>=1000&&N<=1030000&&N%1000===0);
assert.ok(existsSync(resolve(BASELINE,"tools/product_system_server.ts")));
const PORT=14000+(process.pid%1000);
function rssGrupo(pgid:number):number{
  let soma=0;
  for(const pid of readdirSync("/proc")){
    if(!/^\d+$/.test(pid))continue;
    try{
      const st=readFileSync("/proc/"+pid+"/stat","utf8");
      const f=st.slice(st.lastIndexOf(")")+2).trim().split(/\s+/);
      if(Number(f[2])!==pgid)continue;
      const status=readFileSync("/proc/"+pid+"/status","utf8");
      soma+=Number(/^VmRSS:\s*(\d+)\s*kB/m.exec(status)?.[1]??0);
    }catch{}
  }
  return soma;
}
interface Medida{ms:number;bytes:number;rss_mb:number;trip_count:number;fact_count:number;hash:string}
void(async()=>{
  const b=await bancoIsolado(URL_TESTE,undefined,"q026htt");
  async function subir(cwd:string):Promise<ChildProcess>{
    const filho=spawn("npx",["tsx","tools/product_system_server.ts"],{
      cwd,detached:true,stdio:["ignore","pipe","pipe"],
      env:{...process.env,PRODUCT_UI_PORT:String(PORT),DELIVERYOS_DATABASE_URL:b.url,
        DELIVERYOS_PG_URL:"",TATA_READER_INSTALL_ROOT:"",CONFERENCE_BRAIN_DATA_DIR:""}
    });
    let output="";
    filho.stdout?.on("data",x=>{output=(output+String(x)).slice(-4500)});
    filho.stderr?.on("data",x=>{output=(output+String(x)).slice(-4500)});
    for(let i=0;i<240;i++){
      if(filho.exitCode!==null)throw new Error("servidor saiu "+filho.exitCode+": "+output.slice(-1100));
      try{
        const r=await fetch("http://127.0.0.1:"+PORT+"/api/health",{signal:AbortSignal.timeout(900)});
        if(r.status===200)return filho;
      }catch{}
      await new Promise(r=>setTimeout(r,150));
    }
    throw new Error("servidor nao iniciou "+output.slice(-1100));
  }
  function parar(p:ChildProcess):void{if(p.pid)try{process.kill(-p.pid,"SIGTERM")}catch{}}
  async function medir(pgid:number):Promise<Medida>{
    let peak=0;
    const sample=()=>{try{peak=Math.max(peak,rssGrupo(pgid))}catch{}};
    const timer=setInterval(sample,150);sample();
    const t=performance.now();
    try{
      const r=await fetch("http://127.0.0.1:"+PORT+"/api/entregas?unidade=ITAIM",
        {signal:AbortSignal.timeout(180000)});
      const bytes=Buffer.from(await r.arrayBuffer());
      const ms=performance.now()-t;sample();
      assert.equal(r.status,200,"HTTP nao foi 200");
      const j=JSON.parse(bytes.toString("utf8")) as {
        leitura:{disponivel:boolean},
        realidade:{viagens:Array<{fatos:number;viagem_id:string;estado:string}>}
      };
      assert.equal(j.leitura.disponivel,true,"leitura virou demo/erro");
      assert.equal(j.realidade.viagens.length,N/1000);
      const total=j.realidade.viagens.reduce((s,v)=>s+v.fatos,0);
      assert.equal(total,N,"nao preservou todos eventos");
      assert.ok(j.realidade.viagens.every(x=>x.estado==="em_rota"),"estado inesperado");
      const resumo=j.realidade.viagens.map(x=>[x.viagem_id,x.fatos,x.estado]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
      return {ms:Math.round(ms*100)/100,bytes:bytes.byteLength,
        rss_mb:Math.round(peak/1024),trip_count:j.realidade.viagens.length,
        fact_count:total,hash:createHash("sha256").update(JSON.stringify(resumo)).digest("hex")};
    }finally{clearInterval(timer)}
  }
  try{
    console.log("Q026_PAIRED_HTTP_SEED n="+N+" simulated=true");
    await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim Bench')");
    const sql=[
      "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode)",
      "SELECT 'q026bench-'||g,'ITAIM','trip','Q026-T-'||((g-1)/1000)::integer,",
      "CASE WHEN (g-1)%1000=0 THEN 'trip_started' ELSE 'gps_batch_received' END,",
      "'{}'::jsonb, now()-(($1::bigint-g)::double precision*interval '0.1 seconds'),",
      "now(),'device','q026bench-key-'||g,",
      "CASE WHEN (g-1)%1000=0 THEN 'trip_started@1.0.0' ELSE 'gps_batch_received@1.0.0' END,",
      "'simulated' FROM generate_series($2::integer,$3::integer) AS g"
    ].join(" ");
    // O cliente tem statement_timeout de 15s: o seed em uma chamada de 1,03M
    // expirava sem iniciar o benchmark HTTP. Lotes limitados nao mudam os fatos.
    const inicioSeed=performance.now();
    for(let ini=1;ini<=N;ini+=50000){
      await b.cliente.query(sql,[N,ini,Math.min(N,ini+49999)]);
    }
    console.log("Q026_PAIRED_HTTP_SEEDED n="+N+" seed_ms="+
      Math.round((performance.now()-inicioSeed)*100)/100);
    const cont=await b.cliente.query<{n:string}>("SELECT count(*) AS n FROM platform.event_log");
    assert.equal(Number(cont[0].n),N);
    const result:{side:string;runs:Medida[]}[]=[];
    for(const [side,cwd] of [["baseline",BASELINE],["optimized",process.cwd()]] as const){
      const p=await subir(cwd);
      try{
        const runs=[await medir(p.pid!),await medir(p.pid!)];
        result.push({side,runs});
        for(let i=0;i<runs.length;i++)console.log("Q026_PAIRED_HTTP "+JSON.stringify({n:N,side,run:i+1,...runs[i]}));
      }finally{
        parar(p);
        await new Promise(r=>setTimeout(r,800));
      }
    }
    assert.equal(result[0].runs[0].hash,result[1].runs[0].hash,"viagens diferentes");
    assert.equal(result[0].runs[1].hash,result[1].runs[1].hash,"viagens diferentes no warm");
    const old=result[0].runs[1].ms,now=result[1].runs[1].ms;
    console.log("Q026_PAIRED_HTTP_RESULT "+JSON.stringify({n:N,baseline_warm_ms:old,
      optimized_warm_ms:now,ratio:Math.round(old/now*100)/100,same_trip_state:true,
      limits:"processos sequenciais; caches distintos; sintetico, nao producao"}));
    console.log("Q026_PAIRED_HTTP_PASS: base e experimento, mesmo banco descartavel");
  }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
