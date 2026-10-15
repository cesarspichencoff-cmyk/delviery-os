/**
 * LAB: sessão humana fictícia -> papel PostgreSQL fixo POR UNIDADE.
 * Não é autenticação, endpoint nem migration de produção.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type PgSqlClient } from "../../src/platform/persistence/sql-client";
import { criarRegistroDeSessoesFicticias, COOKIE_LAB, type AtorFicticio } from "./lab/operator-session-simulated";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
const temp=(process.env.RUNNER_TEMP??"").trim();
const u=base?new URL(base):null;
if (process.env.GITHUB_ACTIONS!=="true" || !temp ||
    u?.hostname!=="localhost" || u.port!=="55441" ||
    !(u.searchParams.get("host")??"").startsWith(temp+"/operator-pg-socket-")) {
  console.error("ROUTING_LAB_NOT_RUN: owned private socket required; NOT GREEN");
  process.exit(78);
}
const unitList=["ITAIM","VILA-LAB"] as const;
type Unit=typeof unitList[number];
const suffix=process.pid+"_"+Date.now().toString(36);
const roles:Record<Unit,string>={ITAIM:"role_i_"+suffix,"VILA-LAB":"role_v_"+suffix};
for (const role of Object.values(roles)) assert.match(role,/^[a-z][a-z0-9_]{3,60}$/);
type Count={n:number};
let passed=0;
function ok(condition:boolean,description:string) {
  assert.ok(condition,description);
  passed++;
  console.log("ok ROUTE-"+passed+" "+description);
}
async function main() {
  const lab=await bancoIsolado(base,undefined,"routeauth");
  const created:string[]=[];
  const policies:{table:string;name:string}[]=[];
  const pools=new Map<Unit,PgSqlClient>();
  try {
    await lab.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila Lab')");
    for (const [unit,id] of [["ITAIM","dev-it"],["VILA-LAB","dev-v"]] as const) {
      await lab.cliente.query("INSERT INTO identity.device(device_id,unit_id,label) VALUES ($1,$2,$1)",[id,unit]);
      await lab.cliente.query(
        "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode) VALUES ($1,$2,'trip',$1,'trip_created','{}'::jsonb,now(),now(),'device',$1,'trip_created@1.0.0','simulated')",
        ["event-"+id,unit]);
    }
    for (const unit of unitList) {
      const role=roles[unit];
      await lab.cliente.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
      created.push(role);
      await lab.cliente.query("GRANT CONNECT ON DATABASE "+lab.nome+" TO "+role);
      await lab.cliente.query("GRANT USAGE ON SCHEMA platform, identity TO "+role);
      await lab.cliente.query("GRANT SELECT ON platform.event_log, identity.device TO "+role);
    }
    for (const [table,prefix] of [["platform.event_log","e"],["identity.device","d"]] as const) {
      await lab.cliente.query("ALTER TABLE "+table+" ENABLE ROW LEVEL SECURITY");
      for (const unit of unitList) {
        const policy="pr_route_"+prefix+"_"+(unit==="ITAIM"?"i":"v");
        await lab.cliente.query("CREATE POLICY "+policy+" ON "+table+
          " FOR SELECT TO "+roles[unit]+" USING (unit_id = '"+unit+"')");
        policies.push({table,name:policy});
      }
    }
    for (const unit of unitList) {
      const url=new URL(lab.url);url.username=roles[unit];url.password="";
      pools.set(unit,await createPgClient({url:url.toString(),max:1}));
    }
    const cadastro=new Map<string,AtorFicticio>([
      ["fiction-it",{subject_id:"fiction-it",ativo:true,unidades:["ITAIM"],revisao_autorizacao:1}],
      ["fiction-v",{subject_id:"fiction-v",ativo:true,unidades:["VILA-LAB"],revisao_autorizacao:1}],
      ["fiction-manager",{subject_id:"fiction-manager",ativo:true,unidades:["ITAIM","VILA-LAB"],revisao_autorizacao:1}],
    ]);
    const auth=criarRegistroDeSessoesFicticias(cadastro,60000);
    let now=1_800_000_000_000;
    const issue=(who:string,unit:Unit)=>auth.emitir({modo:"LAB_SYNTHETIC_ONLY",subject_id:who},unit,now).token_apenas_para_harness;
    const a=issue("fiction-it","ITAIM"),b=issue("fiction-v","VILA-LAB");
    const managerI=issue("fiction-manager","ITAIM");
    const managerV=issue("fiction-manager","VILA-LAB");
    let queries=0;
    async function read(token:string,requestedUnit:string,headers:Record<string,string>={}) {
      // Headers de navegador nunca fornecem a autoridade: são ignorados.
      void headers;
      const session=auth.verificar(COOKIE_LAB+"="+token,now);
      if (!session.autorizado) return {status:session.status,unit:"",role:"",events:0,devices:0,pid:0};
      if (requestedUnit!==session.unidade) return {status:403,unit:"",role:"",events:0,devices:0,pid:0};
      if (session.unidade!=="ITAIM"&&session.unidade!=="VILA-LAB")
        return {status:403,unit:"",role:"",events:0,devices:0,pid:0};
      const unit=session.unidade as Unit;
      const db=pools.get(unit);
      if (!db) return {status:503,unit:"",role:"",events:0,devices:0,pid:0};
      queries++;
      return db.transaction(async tx=>{
        const name=await tx.query<{current_user:string}>("SELECT current_user");
        const ev=await tx.query<Count>("SELECT COUNT(*)::int AS n FROM platform.event_log");
        const devices=await tx.query<Count>("SELECT COUNT(*)::int AS n FROM identity.device");
        const pid=await tx.query<{pid:number}>("SELECT pg_backend_pid() AS pid");
        return {status:200,unit,role:name[0].current_user,events:ev[0].n,devices:devices[0].n,pid:pid[0].pid};
      });
    }
    ok((await read("aa".repeat(32),"ITAIM")).status===401 && queries===0,
      "cookie falso nega sem emprestar conexao");
    const ri=await read(a,"ITAIM"),rv=await read(b,"VILA-LAB");
    ok(ri.status===200&&ri.role===roles.ITAIM&&ri.unit==="ITAIM"&&ri.events===1&&ri.devices===1,
      "sessao Itaim escolhe pool/role Itaim e ve apenas seus fatos");
    ok(rv.status===200&&rv.role===roles["VILA-LAB"]&&rv.unit==="VILA-LAB"&&rv.events===1&&rv.devices===1,
      "sessao Vila-Lab escolhe pool/role Vila-Lab e ve apenas seus fatos");
    const before=queries;
    ok((await read(a,"VILA-LAB")).status===403&&queries===before,
      "URL cruzada rejeitada antes da query");
    ok((await read(a,"VILA-LAB",{"X-Unit":"VILA-LAB","X-Role":"admin"})).status===403&&queries===before,
      "cabecalho forjado nao troca role");
    ok((await read(a,"ITAIM' OR TRUE --")).status===403&&queries===before,
      "seletor malicioso nao produz query");
    ok((await read(managerI,"VILA-LAB")).status===403&&queries===before,
      "operador com duas concessoes nao muda unidade da sessao");
    ok((await read(managerV,"VILA-LAB")).role===roles["VILA-LAB"],
      "operador multiloja usa token distinto da unidade");
    const concurrent=await Promise.all([
      read(a,"ITAIM"),read(b,"VILA-LAB"),read(managerI,"ITAIM"),
      read(managerV,"VILA-LAB"),read(a,"ITAIM"),read(b,"VILA-LAB")
    ]);
    ok(concurrent.every(r=>r.status===200&&r.events===1&&r.devices===1&&
      r.role===roles[r.unit as Unit]),"concorrencia entre sessoes nao contamina papeis");
    ok(concurrent.filter(r=>r.unit==="ITAIM").every(r=>r.pid===ri.pid)&&
      concurrent.filter(r=>r.unit==="VILA-LAB").every(r=>r.pid===rv.pid)&&
      ri.pid!==rv.pid,"PIDs/pools fisicos sao reutilizados apenas na mesma unidade");
    ok(pools.size===2,"numero de pools limitado por unidade, nao por usuario");
    const dbI=pools.get("ITAIM")!,dbV=pools.get("VILA-LAB")!;
    await dbI.query("SELECT set_config('deliveryos.unit_scope',$1,false)",["VILA-LAB"]);
    ok((await dbI.query<Count>("SELECT COUNT(*)::int AS n FROM platform.event_log WHERE unit_id='VILA-LAB'"))[0].n===0,
      "GUC adversa nao supera o papel Itaim");
    await dbV.transaction(async tx=>{
      await tx.query("SELECT set_config('deliveryos.unit_scope',$1,true)",["ITAIM"]);
      assert.equal((await tx.query<Count>(
        "SELECT COUNT(*)::int AS n FROM identity.device WHERE unit_id='ITAIM'"))[0].n,0);
    });
    ok(true,"GUC adversa em transacao nao supera papel Vila-Lab");
    await assert.rejects(dbI.query("SET ROLE "+roles["VILA-LAB"]),
      (e:unknown)=>(e as {code?:string}).code==="42501");
    ok(true,"sem membership cruzada nao permite SET ROLE da outra unidade");
    await assert.rejects(dbI.query("ALTER TABLE platform.event_log DISABLE ROW LEVEL SECURITY"),
      (e:unknown)=>(e as {code?:string}).code==="42501");
    ok(true,"role de leitura nao pode desligar RLS");
    cadastro.set("fiction-it",{...cadastro.get("fiction-it")!,ativo:false});
    const qBefore=queries;
    ok((await read(a,"ITAIM")).status===403&&queries===qBefore,
      "operador ficticio revogado nao pega conexao");
    now+=60000;
    ok((await read(b,"VILA-LAB")).status===401&&queries===qBefore,
      "sessao expirada nao pega conexao");
    ok((await lab.cliente.query<Count>("SELECT COUNT(*)::int AS n FROM platform.event_log"))[0].n===2,
      "os dois fatos sintéticos continuam no banco, isolamento nao e apagamento");
    console.log("OPERATOR_ROLE_ROUTING_LAB: "+passed+"/"+passed+
      " PASS (SYNTHETIC SESSION ROLE ROUTING, NOT IN PRODUCT SERVER)");
  } finally {
    for (const pool of pools.values()) await pool.close();
    for (const p of policies.reverse()) await lab.cliente.query("DROP POLICY "+p.name+" ON "+p.table);
    for (const role of created.reverse()) {
      await lab.cliente.query("REVOKE SELECT ON platform.event_log, identity.device FROM "+role);
      await lab.cliente.query("REVOKE USAGE ON SCHEMA platform, identity FROM "+role);
      await lab.cliente.query("REVOKE CONNECT ON DATABASE "+lab.nome+" FROM "+role);
      await lab.cliente.query("DROP ROLE "+role);
    }
    await lab.descartar();
  }
}
void main().catch(e=>{console.error(e);process.exitCode=1});
