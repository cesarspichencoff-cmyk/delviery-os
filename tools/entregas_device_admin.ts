import {
  PgDeviceAdminStore,
  planAuthorize,
  planFingerprint,
  planRevoke,
} from "../src/platform/admin/device-admin";
import {
  createPgClient,
  dispensadoDeTls,
  isLocalUrl,
} from "../src/platform/persistence/sql-client";

type Mode = "status" | "authorize" | "revoke";

interface Args {
  mode: Mode;
  device: string;
  unit?: string;
  actor?: string;
  label?: string;
  proof?: string;
  by?: string;
  apply: boolean;
  expect?: string;
}

function usage(): never {
  console.error([
    "Uso:",
    "  npm run admin:entregas:device -- status --device <id>",
    "  npm run admin:entregas:device -- authorize --device <id> --unit ITAIM --actor <motoboy> --label <rotulo> --proof <codigo-sha256>",
    "  npm run admin:entregas:device -- authorize ... --apply=YES --expect <fingerprint-do-plan>",
    "  npm run admin:entregas:device -- revoke --device <id> --by <responsavel>",
    "  npm run admin:entregas:device -- revoke ... --apply=YES --expect <fingerprint-do-plan>",
    "",
    "Banco: DELIVERYOS_DATABASE_URL. Plan/status nao escrevem.",
    "Apply exige --apply=YES e o fingerprint exato do plan imediatamente anterior.",
  ].join("\n"));
  process.exit(2);
}

function valuesOf(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      values.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.set(token.slice(2), next);
      i += 1;
    }
  }
  return values;
}

function parse(argv: string[]): Args {
  const mode = argv[0] as Mode | undefined;
  if (!mode || !["status", "authorize", "revoke"].includes(mode)) usage();
  const v = valuesOf(argv);
  const device = (v.get("device") || "").trim();
  if (!device) usage();

  const args: Args = {
    mode,
    device,
    unit: v.get("unit")?.trim(),
    actor: v.get("actor")?.trim(),
    label: v.get("label")?.trim(),
    proof: v.get("proof")?.trim(),
    by: v.get("by")?.trim(),
    apply: v.get("apply") === "YES",
    expect: v.get("expect")?.trim(),
  };
  if (mode === "authorize" && (!args.unit || !args.actor || !args.label || !args.proof)) usage();
  if (mode === "revoke" && !args.by) usage();
  if (args.apply && !args.expect) {
    throw new Error("apply recusado: informe --expect <fingerprint-do-plan>");
  }
  return args;
}

function resolveSsl(url: string): boolean | undefined {
  const raw = process.env.DELIVERYOS_DATABASE_SSL?.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "sim", "yes"].includes(raw)) return true;
  if (["0", "false", "nao", "não", "no"].includes(raw)) {
    const privateHost = (process.env.DELIVERYOS_DATABASE_PRIVATE_HOST || "").trim();
    if (!dispensadoDeTls(url, privateHost)) {
      throw new Error(
        "DELIVERYOS_DATABASE_SSL=false recusado: host não é local nem rede privada declarada",
      );
    }
    return false;
  }
  throw new Error("DELIVERYOS_DATABASE_SSL inválido");
}

async function makePlan(store: PgDeviceAdminStore, args: Args) {
  if (args.mode === "authorize") {
    return planAuthorize(store, {
      device_id: args.device,
      unit_id: args.unit!,
      actor_id: args.actor!,
      label: args.label!,
      device_proof_sha256: args.proof!,
    });
  }
  if (args.mode === "revoke") {
    return planRevoke(store, {
      device_id: args.device,
      revoked_by: args.by!,
    });
  }
  throw new Error("status não produz plano de escrita");
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  const url = (process.env.DELIVERYOS_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("DELIVERYOS_DATABASE_URL postgres:// é obrigatória");
  }

  const client = await createPgClient({
    url,
    ssl: resolveSsl(url) ?? !isLocalUrl(url),
    host_privado: (process.env.DELIVERYOS_DATABASE_PRIVATE_HOST || "").trim(),
    max: 2,
    connectionTimeoutMillis: 5_000,
    statementTimeoutMs: 15_000,
  });

  try {
    if (args.mode === "status") {
      const store = new PgDeviceAdminStore(client);
      console.log(JSON.stringify({
        schema: "deliveryos-device-admin-status@1",
        database_user: await store.currentUser(),
        device: await store.device(args.device),
        write_performed: false,
      }, null, 2));
      return;
    }

    if (!args.apply) {
      const store = new PgDeviceAdminStore(client);
      const plan = await makePlan(store, args);
      console.log(JSON.stringify({
        ...plan,
        fingerprint: planFingerprint(plan),
        write_performed: false,
      }, null, 2));
      if (!plan.can_apply) process.exitCode = 3;
      return;
    }

    const result = await client.transaction(async (tx) => {
      const store = new PgDeviceAdminStore(tx);
      const plan = await makePlan(store, args);
      const fingerprint = planFingerprint(plan);
      if (fingerprint !== args.expect) {
        throw new Error("apply recusado: estado atual não corresponde ao fingerprint revisado");
      }
      if (!plan.can_apply) {
        throw new Error("apply recusado: " + plan.conflicts.join("; "));
      }
      if (plan.no_op) {
        return { plan, fingerprint, applied: false, device: await store.device(args.device) };
      }

      const changed = args.mode === "authorize"
        ? await store.authorize({
            device_id: args.device,
            unit_id: args.unit!,
            actor_id: args.actor!,
            label: args.label!,
            device_proof_sha256: args.proof!,
          })
        : await store.revoke({
            device_id: args.device,
            revoked_by: args.by!,
          });

      if (!changed) {
        throw new Error("apply recusado: o aparelho mudou concorrentemente");
      }
      return { plan, fingerprint, applied: true, device: await store.device(args.device) };
    });

    console.log(JSON.stringify({
      schema: "deliveryos-device-admin-apply@1",
      action: args.mode,
      device_id: args.device,
      applied: result.applied,
      plan_fingerprint: result.fingerprint,
      device: result.device,
      write_performed: result.applied,
    }, null, 2));
  } finally {
    await client.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
