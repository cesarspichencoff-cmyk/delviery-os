import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PilotApplicationFacade } from "./pilot-facade";
import type { PilotConfig } from "./pilot-config";
import type { PilotLogger } from "./pilot-log";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "deliveryos-actor-"));
  try {
    const logger = {info(){}, warn(){}, error(){}} as unknown as PilotLogger;
    const cfg: PilotConfig = {
      mode: "test", unit_id: "LAB-UNIT", unit_name: "LAB", timezone: "America/Sao_Paulo",
      port: 0, bind: "127.0.0.1", data_dir: dir, source_mode: "simulated",
      max_stops: 3, banner: "LAB", users: [],
      features: {demo_seed:false,demo_controls:false,map_poc:false,gps_production:false,
        auto_assignment:false,copiloto:false,shell:false},
      backup: { auto_interval_minutes: 600, retain_count: 1, dir: "backup" },
    };
    const facade = new PilotApplicationFacade(cfg,logger);
    const rider = {actor_id:"LAB-RIDER",role:"motoboy_interno"} as const;
    const manager = {actor_id:"LAB-MANAGER",role:"gerente"} as const;
    const a = facade.withActor(rider, async () => {
      const snap = await facade.snapshot();
      return {actor: snap.actor?.actor_id, scoped: facade.getActor()?.actor_id};
    });
    const b = facade.withActor(manager, async () => {
      const snap = await facade.snapshot();
      return {actor: snap.actor?.actor_id, scoped: facade.getActor()?.actor_id};
    });
    const [aa,bb] = await Promise.all([a,b]);
    assert.deepEqual(aa, {actor:"LAB-RIDER", scoped:"LAB-RIDER"});
    assert.deepEqual(bb, {actor:"LAB-MANAGER", scoped:"LAB-MANAGER"});
    console.log("PASS: concurrent snapshots stay on their request actors");
    const none = await facade.withActor(null, () => facade.snapshot());
    assert.equal(none.actor, null);
    console.log("PASS: unauthenticated request has no inherited identity");
    assert.equal(facade.getActor(), null);
    console.log("REQUEST_ACTOR_ISOLATION_ALL_PASS");
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
main().catch(error => { console.error("ACTOR_ISOLATION_FAIL",error); process.exitCode=1; });
