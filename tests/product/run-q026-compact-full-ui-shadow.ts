/**
 * Q-026: contrato real da tela vs representacao SEM IDs.
 * PostgreSQL descartavel: duas unidades, tres modos, historia pre-0003,
 * atrasados e clocks suspeitos. Nao muda runtime nem reader operacional.
 */
import assert from "node:assert/strict";
import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";
import type { ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import type { RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { gerarLinhas, gravarLinhas, PERFIL_LOJA } from "./q026-replay-fixture";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url) {console.error("Q026_COMPACT_UI_PG_REQUIRED");process.exit(1)}
let checks=0;
const ok=(s:string)=>{checks++;console.log("  ok U"+checks+" "+s)};
const agora=PERFIL_LOJA.agora;
const agoraIso=agora.toISOString();

function somenteContagem(n:number):readonly string[]{
  return new Proxy({length:n}, {
    get(t,p) {
      if(p==="length") return t.length;
      throw new Error("UI requisitou ID individual "+String(p));
    },
    ownKeys(){throw new Error("UI enumerou vetor de IDs")}
  }) as unknown as readonly string[];
}
function semIds(r:RealidadeDeEntregas):RealidadeDeEntregas{
  return {
    ...r,
    projecoes:r.projecoes.map(p=>({
      ...p,viagens:p.viagens.map(v=>({
        ...v,eventos:somenteContagem(v.eventos.length)
      } as ViagemProjetada))
    }))
  };
}
const snap={
  trips:[],occurrences:[],connection:"online",pending_sync:0,last_error:null
} as unknown as UiSnapshot;
function render(r:RealidadeDeEntregas,unit:string|null){
  return entregasVM(snap,agoraIso,null,{disponivel:true,realidade:r},{unidade:unit});
}
const json=(v:unknown)=>JSON.stringify(v);

void(async()=>{
  const b=await bancoIsolado(url,"0002_event_log_contexto_dispositivo","q026vm");
  try{
    await b.cliente.query([
      "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,origin,idempotency_key,contract_version,device_id,sequence_local)",
      "VALUES ('old-unknown-ui','ITAIM','trip','T-UNKNOWN','trip_started','{}',",
      "'2026-09-30T10:00:00Z','device','old-unknown-ui','trip_started@1.0.0',",
      "'DEV-01',1)"
    ].join(" "));
    await b.migrarTudo();
    await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('LAB-BANCADA','Laboratorio')");
    const dados=gerarLinhas({
      ...PERFIL_LOJA,fatos:6000,semente:1337,aparelhos:16,pontos_por_viagem:80,
      unidades:["ITAIM","LAB-BANCADA"],empates:0.05,atrasados:0.05,suspeitos:0.02
    });
    const dispositivos=new Set(dados.map(d=>JSON.stringify([d.device_id,d.unit_id])));
    for(const spec of dispositivos){
      const [device,unit]=JSON.parse(spec) as [string,string];
      await b.cliente.query("INSERT INTO identity.device(device_id,unit_id,label) VALUES ($1,$2,$1)",[device,unit]);
    }
    await gravarLinhas(b.cliente,[...dados].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)));
    const full=await lerRealidadeDeEntregas(b.cliente,{agora});
    assert.equal(full.historico_sem_modo,1);
    assert.equal(full.projecoes.flatMap(p=>p.viagens).reduce((a,v)=>a+v.eventos.length,0),6000);
    assert.deepEqual([...new Set(full.projecoes.map(p=>p.unit_id))].sort(),["ITAIM","LAB-BANCADA"]);
    assert.deepEqual([...new Set(full.projecoes.map(p=>p.source_mode))].sort(),["control","real","simulated"]);
    ok("6000 fatos, duas unidades, real/simulated/control e UNKNOWN=1");
    const compact=semIds(full);
    let matched=0;
    for(const unit of [null,"ITAIM","LAB-BANCADA","SEM-UNIDADE"]){
      const a=render(full,unit),c=render(compact,unit);
      assert.equal(json(c),json(a),"JSON do VM diverge para filtro "+String(unit));
      assert.deepEqual(c,a,"Objeto do VM diverge para filtro "+String(unit));
      matched++;
    }
    ok("view model COMPLETO igual em 4 filtros; nenhum ID acessado");
    const vm=render(full,null);
    assert.equal(full.historico_sem_modo,1);
    assert.equal(vm.leitura.disponivel,true);
    ok("leitura com proveniencia e UNKNOWN preservados");
    const first=full.projecoes.find(p=>p.viagens.length>0)!;
    const mutant:RealidadeDeEntregas={
      ...full,projecoes:full.projecoes.map(p=>p===first?{
        ...p,viagens:p.viagens.map((v,i)=>i===0?{
          ...v,eventos:somenteContagem(v.eventos.length+1)
        }:v)
      }:p)
    };
    assert.notEqual(json(render(mutant,null)),json(vm),"um fato falso nao mudou resultado");
    ok("controle negativo: mutacao +1 fato detectada");
    assert.notEqual(json(render({...compact,historico_sem_modo:0},null)),json(vm),"UNKNOWN falso invisivel");
    ok("controle negativo: UNKNOWN 1->0 detectado");
    console.log("Q026_COMPACT_FULL_UI_PASS "+JSON.stringify({
      checks,filters:matched,events:6000,source_modes:["control","real","simulated"],
      unknown:1,byte_identical_viewmodels:true,
      note:"Somente contrato de UI; cursor misto independente nao testado."
    }));
  }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
