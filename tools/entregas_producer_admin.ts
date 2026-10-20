/**
 * Administração das chaves de produtor do feed público (platform.producer_key).
 *
 * Mesmo rito do entregas_device_admin: status e plano não escrevem; aplicar
 * exige --apply=YES e o fingerprint exato do plano revisado. Banco pela
 * DELIVERYOS_DATABASE_URL do DONO — nenhum runtime escreve no registro.
 * Só a chave PÚBLICA passa por aqui; a privada nunca sai do produtor.
 */
import {
  PgProducerAdminStore,
  planRegister,
  planRevokeProducer,
  producerPlanFingerprint,
} from "../src/platform/admin/producer-admin";
import {
  createPgClient,
  dispensadoDeTls,
  isLocalUrl,
} from "../src/platform/persistence/sql-client";

type Mode = "status" | "register" | "revoke";

function usage(): never {
  console.error([
    "Uso:",
    "  npm run admin:entregas:producer -- status --producer <id> --kid <id>",
    "  npm run admin:entregas:producer -- register --producer <id> --kid <id> --unit ITAIM \\",
    "      --public-key <SPKI DER base64> --types trip_created,trip_started --modes simulated \\",
    "      --not-before <ISO> --not-after <ISO> --by <responsavel>",
    "  npm run admin:entregas:producer -- revoke --producer <id> --kid <id> --by <responsavel> --reason <texto>",
    "  ... --apply=YES --expect <fingerprint-do-plan>",
    "",
    "`real` nao e concedivel. Plan/status nao escrevem.",
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = argv[0] as Mode | undefined;
  if (!mode || !["status", "register", "revoke"].includes(mode)) usage();
  const v = valuesOf(argv);
  const producer = (v.get("producer") || "").trim();
  const kid = (v.get("kid") || "").trim();
  if (!producer || !kid) usage();
  const apply = v.get("apply") === "YES";
  const expect = v.get("expect")?.trim();
  if (apply && !expect) throw new Error("apply recusado: informe --expect <fingerprint-do-plan>");

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

  const fazerPlano = async (store: PgProducerAdminStore) => {
    if (mode === "register") {
      return planRegister(store, {
        producer_id: producer,
        key_id: kid,
        unit_id: v.get("unit") ?? "",
        public_key_spki_b64: v.get("public-key") ?? "",
        event_types: v.get("types") ?? "",
        modes: v.get("modes") ?? "",
        not_before: v.get("not-before") ?? "",
        not_after: v.get("not-after") ?? "",
        registered_by: v.get("by") ?? "",
      });
    }
    return {
      public_key: null,
      plan: await planRevokeProducer(store, {
        producer_id: producer,
        key_id: kid,
        revoked_by: v.get("by") ?? "",
        reason: v.get("reason") ?? "",
      }),
    };
  };

  try {
    if (mode === "status") {
      const store = new PgProducerAdminStore(client);
      console.log(JSON.stringify({
        schema: "deliveryos-producer-admin-status@1",
        database_user: await store.currentUser(),
        key: await store.key(producer, kid),
        write_performed: false,
      }, null, 2));
      return;
    }

    if (!apply) {
      const { plan } = await fazerPlano(new PgProducerAdminStore(client));
      console.log(JSON.stringify({
        ...plan,
        fingerprint: producerPlanFingerprint(plan),
        write_performed: false,
      }, null, 2));
      if (!plan.can_apply) process.exitCode = 3;
      return;
    }

    const result = await client.transaction(async (tx) => {
      const store = new PgProducerAdminStore(tx);
      const { plan, public_key } = await fazerPlano(store);
      const fingerprint = producerPlanFingerprint(plan);
      if (fingerprint !== expect) {
        throw new Error("apply recusado: estado atual não corresponde ao fingerprint revisado");
      }
      if (!plan.can_apply) throw new Error("apply recusado: " + plan.conflicts.join("; "));
      if (plan.no_op) return { fingerprint, applied: false, key: await store.key(producer, kid) };
      const t = plan.target as Record<string, unknown>;
      const changed = mode === "register"
        ? await store.register({
            producer_id: producer,
            key_id: kid,
            unit_id: String(t.unit_id),
            allowed_event_types: t.allowed_event_types as string[],
            allowed_modes: t.allowed_modes as string[],
            not_before: String(t.not_before),
            not_after: String(t.not_after),
            registered_by: String(t.registered_by),
            public_key: public_key!,
          })
        : await store.revoke({
            producer_id: producer,
            key_id: kid,
            revoked_by: String(t.revoked_by),
            reason: String(t.reason),
          });
      if (!changed) throw new Error("apply recusado: a chave mudou concorrentemente");
      return { fingerprint, applied: true, key: await store.key(producer, kid) };
    });

    console.log(JSON.stringify({
      schema: "deliveryos-producer-admin-apply@1",
      action: mode,
      producer_id: producer,
      key_id: kid,
      applied: result.applied,
      plan_fingerprint: result.fingerprint,
      key: result.key,
      write_performed: result.applied,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("[producer-admin]", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
