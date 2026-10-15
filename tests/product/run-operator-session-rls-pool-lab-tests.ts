/**
 * PROVA DESCARTAVEL: duas sessoes humanas FICTICIAS compartilham UM pool PG.
 * Nunca criar role/policy fora do socket e porta do runner OWNED GitHub.
 * Nao e implementacao da conexao produtiva do DeliveryOS.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import {
  criarRegistroDeSessoesFicticias,
  COOKIE_LAB, type AtorFicticio,
} from "./lab/operator-session-simulated";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const localTmp = (process.env.RUNNER_TEMP ?? "").trim();
const url = URL_BASE ? new URL(URL_BASE) : null;
const socket = url?.searchParams.get("host") ?? "";
if (process.env.GITHUB_ACTIONS !== "true" || !localTmp ||
    url?.hostname !== "localhost" || url.port !== "55441" ||
    !socket.startsWith(localTmp + "/operator-pg-socket-")) {
  console.error("OPERATOR_RLS_POOL_NOT_RUN: runner-only owned UNIX socket required; NOT GREEN");
  process.exit(78);
}
const nome = "operator_lab_" + process.pid + "_" + Date.now().toString(36);
assert.match(nome,/^[a-z][a-z0-9_]{4,60}$/);
const banco = await bancoIsolado(URL_BASE, undefined, "usrpool");
let criado = false;
let policyEvent = false;
let policyDevice = false;
let tenant: Awaited<ReturnType<typeof createPgClient>> | null = null;
let n = 0;
function pass(cond:boolean,msg:string) { assert.ok(cond,msg); n++; console.log("ok POOL-"+n+" "+msg); }
type CountRow = { n: number };
const qCount = async (sql:string) => {
  if (!tenant) throw Error("NO_TENANT");
  const r=await tenant.query<CountRow>(sql);
  return r[0]?.n;
};
try {
  await banco.cliente.query(
    "INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila Lab')"
  );
  await banco.cliente.query(
    "INSERT INTO identity.device(device_id,unit_id,label) VALUES ('dev-itaim','ITAIM','Moto I'),('dev-vila','VILA-LAB','Moto V')"
  );
  for (const unit of ["ITAIM","VILA-LAB"]) {
    const id = unit==="ITAIM"?"ev-it":"ev-vl";
    await banco.cliente.query(
      `INSERT INTO platform.event_log
       (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode)
       VALUES ($1,$2,'trip',$1,'trip_created','{}'::jsonb,now(),now(),'device',$1,'trip_created@1.0.0','simulated')`,
       [id,unit]
    );
  }

  // Cria o papel apenas no cluster temporario da suite. NUNCA executa migration real.
  await banco.cliente.query(`CREATE ROLE ${nome} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  criado=true;
  await banco.cliente.query(`GRANT CONNECT ON DATABASE ${banco.nome} TO ${nome}`);
  await banco.cliente.query(`GRANT USAGE ON SCHEMA platform, identity TO ${nome}`);
  await banco.cliente.query(`GRANT SELECT ON platform.event_log, identity.device TO ${nome}`);
  await banco.cliente.query("ALTER TABLE platform.event_log ENABLE ROW LEVEL SECURITY");
  await banco.cliente.query("ALTER TABLE identity.device ENABLE ROW LEVEL SECURITY");
  const predicate = "unit_id = NULLIF(current_setting('deliveryos.unit_scope', true), '')";
  await banco.cliente.query(
    `CREATE POLICY usr_scope_lab_event ON platform.event_log FOR SELECT TO ${nome} USING (${predicate})`
  );
  policyEvent=true;
  await banco.cliente.query(
    `CREATE POLICY usr_scope_lab_device ON identity.device FOR SELECT TO ${nome} USING (${predicate})`
  );
  policyDevice=true;

  const tenantUrl = new URL(banco.url);
  tenantUrl.username=nome;
  tenantUrl.password="";
  tenant=await createPgClient({url:tenantUrl.toString(),max:1});
  const grants = new Map<string, AtorFicticio>([
    ["sim-a",{subject_id:"sim-a",ativo:true,unidades:["ITAIM"],revisao_autorizacao:1}],
    ["sim-b",{subject_id:"sim-b",ativo:true,unidades:["VILA-LAB"],revisao_autorizacao:1}],
  ]);
  const service=criarRegistroDeSessoesFicticias(grants,60_000);
  let now=1_800_000_000_000;
  const a=service.emitir({modo:"LAB_SYNTHETIC_ONLY",subject_id:"sim-a"},"ITAIM",now);
  const b=service.emitir({modo:"LAB_SYNTHETIC_ONLY",subject_id:"sim-b"},"VILA-LAB",now);
  const cookie=(t:string)=> COOKIE_LAB+"="+t;

  pass(await qCount("SELECT COUNT(*)::int AS n FROM platform.event_log")===0,
    "sem contexto SET LOCAL nem um registro de log e visivel");
  pass(await qCount("SELECT COUNT(*)::int AS n FROM identity.device")===0,
    "sem contexto SET LOCAL nenhum aparelho e visivel");

  async function leituraDeSessao(token:string,requestedUnit:string):Promise<{count:number; devices:number; pid:number}> {
    const d=service.verificar(cookie(token),now);
    if (!d.autorizado) throw Error("LAB_SESSION_UNAUTHORIZED");
    if (d.unidade!==requestedUnit) throw Error("LAB_SESSION_CROSS_UNIT");
    if (!tenant) throw Error("NO_CONNECTION");
    return tenant.transaction(async tx=>{
      const set = await tx.query<{set_config:string}>(
        "SELECT set_config('deliveryos.unit_scope', $1, true) AS set_config",
        [d.unidade]
      );
      assert.equal(set[0]?.set_config,d.unidade);
      const log=await tx.query<CountRow>("SELECT COUNT(*)::int AS n FROM platform.event_log");
      const devices=await tx.query<CountRow>("SELECT COUNT(*)::int AS n FROM identity.device");
      const foreign=d.unidade==="ITAIM"?"VILA-LAB":"ITAIM";
      const wrong=await tx.query<CountRow>(
        "SELECT COUNT(*)::int AS n FROM platform.event_log WHERE unit_id=$1",[foreign]
      );
      assert.equal(wrong[0]?.n,0);
      const pid=await tx.query<{pid:number}>("SELECT pg_backend_pid() AS pid");
      return {count:log[0].n,devices:devices[0].n,pid:pid[0].pid};
    });
  }
  const x=await leituraDeSessao(a.token_apenas_para_harness,"ITAIM");
  pass(x.count===1&&x.devices===1,"sessao A ve apenas Itaim em event_log e device");
  pass(await qCount("SELECT COUNT(*)::int AS n FROM platform.event_log")===0,
    "COMMIT limpa escopo antes de devolver conexao ao pool");
  const y=await leituraDeSessao(b.token_apenas_para_harness,"VILA-LAB");
  pass(y.count===1&&y.devices===1&&y.pid===x.pid,
    "mesmo backend fisico do pool serve outra unidade sem herdar contexto anterior");
  pass(await qCount("SELECT COUNT(*)::int AS n FROM identity.device")===0,
    "troca de unidade nao deixa scope residual na conexao");
  await assert.rejects(leituraDeSessao(a.token_apenas_para_harness,"VILA-LAB"),/CROSS_UNIT/);
  pass(true,"pedido cruzado recusado ANTES de abrir transacao de leitura");
  const concurrent=await Promise.all([
    leituraDeSessao(a.token_apenas_para_harness,"ITAIM"),
    leituraDeSessao(b.token_apenas_para_harness,"VILA-LAB"),
    leituraDeSessao(a.token_apenas_para_harness,"ITAIM"),
    leituraDeSessao(b.token_apenas_para_harness,"VILA-LAB"),
  ]);
  pass(concurrent.every(z=>z.count===1&&z.devices===1&&z.pid===x.pid),
    "quatro transacoes concorrentes compartilham pool max1 sem mistura de unidades");
  pass(await qCount("SELECT COUNT(*)::int AS n FROM platform.event_log")===0,
    "pool apos concorrencia continua fail-closed sem contexto");

  await assert.rejects(
    tenant.transaction(async tx=>{
      await tx.query("SELECT set_config('deliveryos.unit_scope',$1,true)",["ITAIM"]);
      assert.equal((await tx.query<CountRow>("SELECT COUNT(*)::int AS n FROM platform.event_log"))[0].n,1);
      throw Error("LAB_CANCELLED_TRANSACTION");
    }),
    /LAB_CANCELLED_TRANSACTION/
  );
  pass(await qCount("SELECT COUNT(*)::int AS n FROM platform.event_log")===0,
    "ROLLBACK de leitura cancelada limpa contexto do pool");
  await assert.rejects(
    tenant.query("SELECT COUNT(*)::int AS n FROM identity.actor"),
    (e:unknown)=>(e as {code?:string}).code==="42501"
  );
  pass(true,"papel nao consegue ler tabela fora de grants");
  await assert.rejects(
    tenant.query("ALTER TABLE platform.event_log DISABLE ROW LEVEL SECURITY"),
    (e:unknown)=>(e as {code?:string}).code==="42501"
  );
  pass(true,"papel nao consegue desativar RLS");
  grants.set("sim-a",{...grants.get("sim-a")!,ativo:false});
  await assert.rejects(leituraDeSessao(a.token_apenas_para_harness,"ITAIM"),/LAB_SESSION_UNAUTHORIZED/);
  pass(true,"revogacao humana ficticia invalida leitura da sessao A");
  now+=60_000;
  await assert.rejects(leituraDeSessao(b.token_apenas_para_harness,"VILA-LAB"),/LAB_SESSION_UNAUTHORIZED/);
  pass(true,"expiracao da sessao B invalida acesso SQL");
  pass(await qCount("SELECT COUNT(*)::int AS n FROM platform.event_log")===0,
    "apos revogacao e expiracao, conexao segue sem contexto");
  console.log("OPERATOR_SESSION_RLS_POOL_LAB: "+n+"/"+n+" PASS (EPHEMERAL POSTGRES, NOT A PRODUCTION ROLE)");
} finally {
  await tenant?.close();
  if (policyDevice) await banco.cliente.query("DROP POLICY usr_scope_lab_device ON identity.device");
  if (policyEvent) await banco.cliente.query("DROP POLICY usr_scope_lab_event ON platform.event_log");
  if (criado) {
    await banco.cliente.query(`REVOKE SELECT ON platform.event_log, identity.device FROM ${nome}`);
    await banco.cliente.query(`REVOKE USAGE ON SCHEMA platform, identity FROM ${nome}`);
    await banco.cliente.query(`REVOKE CONNECT ON DATABASE ${banco.nome} FROM ${nome}`);
    await banco.cliente.query(`DROP ROLE ${nome}`);
  }
  await banco.descartar();
}
