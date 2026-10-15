/**
 * Contra-prova AUTORIZADA em banco efemero: uma GUC mutavel nao e
 * identidade de tenant; politicas presas a roles independentes resistem
 * a mudanca unilateral desse contexto. NAO e migration de producao.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type PgSqlClient } from "../../src/platform/persistence/sql-client";

const base = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const temp = (process.env.RUNNER_TEMP ?? "").trim();
const u = base ? new URL(base) : null;
const socket = u?.searchParams.get("host") ?? "";
if (process.env.GITHUB_ACTIONS !== "true" || !temp ||
    !socket.startsWith(temp + "/operator-pg-socket-") ||
    u?.hostname !== "localhost" || u.port !== "55441") {
  console.error("RLS_THREAT_LAB_NOT_RUN: owned private PostgreSQL socket required; NOT GREEN");
  process.exit(78);
}
const suffix = "lab_" + process.pid + "_" + Date.now().toString(36);
const roles = {
  itaim: "rlsi_" + suffix,
  vila: "rlsv_" + suffix,
  guc: "rlsg_" + suffix,
};
for (const name of Object.values(roles)) assert.match(name, /^[a-z][a-z0-9_]{3,55}$/);
let checks = 0;
function prove(condition: boolean, title: string) {
  assert.ok(condition, title);
  checks++;
  console.log("ok THREAT-" + checks + " " + title);
}
type CountRow = { n: number };
async function count(db: PgSqlClient, where = ""): Promise<number> {
  const rows = await db.query<CountRow>("SELECT COUNT(*)::int AS n FROM platform.event_log" + where);
  return rows[0].n;
}

async function main() {
  const banco = await bancoIsolado(base, undefined, "auththreat");
  const installed: string[] = [];
  const policies: {table: string; name: string}[] = [];
  const conns: PgSqlClient[] = [];
  try {
    await banco.cliente.query(
      "INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila-Lab')"
    );
    for (const [unit, id] of [["ITAIM", "dev-it"], ["VILA-LAB", "dev-v"]] as const) {
      await banco.cliente.query(
        "INSERT INTO identity.device(device_id,unit_id,label) VALUES ($1,$2,$1)",[id,unit]
      );
      await banco.cliente.query(
        `INSERT INTO platform.event_log
          (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode)
          VALUES ($1,$2,'trip',$1,'trip_created','{}'::jsonb,now(),now(),'device',$1,'trip_created@1.0.0','simulated')`,
        ["trip-"+id,unit]
      );
    }
    for (const role of Object.values(roles)) {
      await banco.cliente.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
      );
      installed.push(role);
      await banco.cliente.query(`GRANT CONNECT ON DATABASE ${banco.nome} TO ${role}`);
      await banco.cliente.query(`GRANT USAGE ON SCHEMA identity, platform TO ${role}`);
      await banco.cliente.query(`GRANT SELECT ON platform.event_log, identity.device TO ${role}`);
    }
    await banco.cliente.query("ALTER TABLE platform.event_log ENABLE ROW LEVEL SECURITY");
    await banco.cliente.query("ALTER TABLE identity.device ENABLE ROW LEVEL SECURITY");

    // Policy propositalmente fragil para CONTRAPROVA, nunca para producao.
    for (const [table, prefix] of [
      ["platform.event_log", "evt"], ["identity.device", "dev"]
    ] as const) {
      for (const [label, role] of Object.entries(roles)) {
        const pname = "prv_" + prefix + "_" + label;
        const where = label === "guc"
          ? "unit_id = NULLIF(current_setting('deliveryos.unit_scope', true), '')"
          : `unit_id = '${label === "itaim" ? "ITAIM" : "VILA-LAB"}'`;
        await banco.cliente.query(
          `CREATE POLICY ${pname} ON ${table} FOR SELECT TO ${role} USING (${where})`
        );
        policies.push({table,name:pname});
      }
    }

    async function asRole(role: string) {
      const tenantUrl = new URL(banco.url);
      tenantUrl.username = role;
      tenantUrl.password = "";
      const db = await createPgClient({url:tenantUrl.toString(),max:1});
      conns.push(db);
      const rows = await db.query<{rolsuper: boolean;rolbypassrls: boolean}>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
      );
      prove(rows[0]?.rolsuper === false && rows[0]?.rolbypassrls === false,
        role === roles.guc ? "papel GUC sem bypass" : "papel vinculado sem bypass");
      return db;
    }
    const byGuc = await asRole(roles.guc);
    prove(await count(byGuc) === 0, "GUC sem contexto nao revela dados (somente estado inicial)");
    const gucWitness = await byGuc.transaction(async tx => {
      await tx.query("SELECT set_config('deliveryos.unit_scope',$1,true)",["ITAIM"]);
      const it = await tx.query<CountRow>(
        "SELECT COUNT(*)::int AS n FROM platform.event_log WHERE unit_id='ITAIM'"
      );
      await tx.query("SELECT set_config('deliveryos.unit_scope',$1,true)",["VILA-LAB"]);
      const vl = await tx.query<CountRow>(
        "SELECT COUNT(*)::int AS n FROM platform.event_log WHERE unit_id='VILA-LAB'"
      );
      return {it:it[0].n,vl:vl[0].n};
    });
    prove(gucWitness.it === 1 && gucWitness.vl === 1,
      "RISCO DEMONSTRADO: papel GUC mutavel seleciona duas unidades na mesma transacao");
    prove(await count(byGuc) === 0,
      "GUC volta a vazio apos COMMIT; isso NAO elimina a vulnerabilidade de contexto");

    const itaim = await asRole(roles.itaim);
    const vila = await asRole(roles.vila);
    prove(await count(itaim) === 1 && await count(vila) === 1,
      "cada role independente ve apenas um fato SEM parametro de unidade");
    prove(await count(itaim," WHERE unit_id='VILA-LAB'") === 0,
      "role Itaim nao le Vila-Lab nem por SELECT direto");
    prove(await count(vila," WHERE unit_id='ITAIM'") === 0,
      "role Vila-Lab nao le Itaim nem por SELECT direto");
    await itaim.query("SELECT set_config('deliveryos.unit_scope',$1,false)",["VILA-LAB"]);
    prove(await count(itaim) === 1 && await count(itaim," WHERE unit_id='VILA-LAB'") === 0,
      "role Itaim resiste a mudanca de GUC fora da transacao");
    await vila.transaction(async tx => {
      await tx.query("SELECT set_config('deliveryos.unit_scope',$1,true)",["ITAIM"]);
      const r=await tx.query<CountRow>(
        "SELECT COUNT(*)::int AS n FROM platform.event_log WHERE unit_id='ITAIM'"
      );
      assert.equal(r[0].n,0);
    });
    prove(await count(vila) === 1,
      "role Vila-Lab resiste a GUC adversa mesmo dentro de transacao");

    await assert.rejects(itaim.query(`SET ROLE ${roles.vila}`),
      (e:unknown) => (e as {code?:string}).code === "42501");
    prove(true,"role Itaim sem membership nao pode assumir role Vila-Lab");
    await assert.rejects(itaim.query("SELECT * FROM identity.actor"),
      (e:unknown) => (e as {code?:string}).code === "42501");
    prove(true,"role Itaim nao le tabela sem permissao");
    await assert.rejects(itaim.query("ALTER TABLE platform.event_log DISABLE ROW LEVEL SECURITY"),
      (e:unknown) => (e as {code?:string}).code === "42501");
    prove(true,"role Itaim nao consegue desligar RLS");
    const requests = await Promise.all([
      count(itaim),count(vila),count(itaim),count(vila)
    ]);
    prove(requests.every(x=>x===1),"dois pools de roles distintas mantem escopo sob concorrencia");
    prove((await banco.cliente.query<CountRow>("SELECT COUNT(*)::int AS n FROM platform.event_log"))[0].n === 2,
      "o banco de teste preserva dois fatos; recorte se deve a RLS e nao remocao");
    console.log("OPERATOR_RLS_GUC_THREAT_LAB: " + checks + "/" + checks +
      " PASS (ONE GUC RISK PROVEN, ROLE-BOUND MITIGATION PROVEN ONLY IN EPHEMERAL DB)");
  } finally {
    for (const conn of conns.reverse()) await conn.close();
    for (const p of policies.reverse()) {
      await banco.cliente.query(`DROP POLICY ${p.name} ON ${p.table}`);
    }
    for (const role of installed.reverse()) {
      await banco.cliente.query(`REVOKE SELECT ON platform.event_log, identity.device FROM ${role}`);
      await banco.cliente.query(`REVOKE USAGE ON SCHEMA identity, platform FROM ${role}`);
      await banco.cliente.query(`REVOKE CONNECT ON DATABASE ${banco.nome} FROM ${role}`);
      await banco.cliente.query(`DROP ROLE ${role}`);
    }
    await banco.descartar();
  }
}
void main().catch(e => { console.error(e);process.exitCode=1; });
