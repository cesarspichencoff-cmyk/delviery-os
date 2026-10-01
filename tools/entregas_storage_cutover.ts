import { dirname, join } from "node:path";

import {
  applyFileToPostgresCutover,
  planFileToPostgresCutover,
  readFilePilotStorageSnapshot,
  snapshotFingerprint,
} from "../src/entregas/pilot/storage-cutover";
import {
  createPgClient,
  dispensadoDeTls,
  isLocalUrl,
} from "../src/platform/persistence/sql-client";

interface Args {
  mode: "plan" | "apply";
  unit: string;
  data: string;
  ready: string;
  sourceStopped: boolean;
  expectedFingerprint?: string;
}

function usage(): never {
  console.error(
    [
      "Uso:",
      "  npm run cutover:entregas:plan -- --unit ITAIM --data <store.json> --ready <ready_orders.json>",
      "  npm run cutover:entregas:apply -- --unit ITAIM --data <store.json> --ready <ready_orders.json> --source-stopped=YES --expect <fingerprint-do-plan>",
      "",
      "Banco: DELIVERYOS_DATABASE_URL. Nenhuma URL/senha é impressa.",
      "Apply recusa sem confirmação de fonte parada E sem fingerprint do plan.",
    ].join("\n"),
  );
  process.exit(2);
}

function parse(argv: string[]): Args {
  const modeRaw = argv[0] ?? "plan";
  if (modeRaw !== "plan" && modeRaw !== "apply") usage();
  const values = new Map<string, string>();
  for (const token of argv.slice(1)) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      values.set(token.slice(2, eq), token.slice(eq + 1));
    }
  }
  // Aceita também --chave valor.
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--") || token.includes("=")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.set(token.slice(2), next);
      i += 1;
    }
  }

  const unit = (values.get("unit") || "").trim();
  if (!unit) usage();

  const dataDir = (process.env.ENTREGAS_DATA_DIR || "data/entregas-pilot").trim();
  const data = values.get("data") || join(dataDir, "store.json");
  const ready = values.get("ready") || join(dirname(data), "ready_orders.json");

  return {
    mode: modeRaw,
    unit,
    data,
    ready,
    sourceStopped: values.get("source-stopped") === "YES",
    expectedFingerprint: values.get("expect")?.trim(),
  };
}

function resolveSsl(url: string): boolean | undefined {
  const raw = process.env.DELIVERYOS_DATABASE_SSL?.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "sim", "yes"].includes(raw)) return true;
  if (["0", "false", "nao", "não", "no"].includes(raw)) {
    const privateHost = (
      process.env.DELIVERYOS_DATABASE_PRIVATE_HOST || ""
    ).trim();
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
  const args = parse(process.argv.slice(2));
  const url = (process.env.DELIVERYOS_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("DELIVERYOS_DATABASE_URL postgres:// é obrigatória");
  }

  if (args.mode === "apply") {
    if (!args.sourceStopped) {
      throw new Error(
        "apply recusado: pare o servidor de arquivo e informe --source-stopped=YES",
      );
    }
    if (!args.expectedFingerprint) {
      throw new Error(
        "apply recusado: informe --expect <source_fingerprint> produzido pelo plan",
      );
    }
  }

  const client = await createPgClient({
    url,
    ssl: resolveSsl(url) ?? !isLocalUrl(url),
    host_privado: (
      process.env.DELIVERYOS_DATABASE_PRIVATE_HOST || ""
    ).trim(),
    max: 2,
    connectionTimeoutMillis: 5_000,
    statementTimeoutMs: 30_000,
  });

  try {
    const snapshot = await readFilePilotStorageSnapshot({
      unit_id: args.unit,
      data_file: args.data,
      ready_file: args.ready,
    });
    const plan = await planFileToPostgresCutover({
      sql: client,
      snapshot,
    });

    if (args.mode === "plan") {
      console.log(
        JSON.stringify(
          {
            mode: "plan",
            ...plan,
            source_paths: {
              data: args.data,
              ready: args.ready,
            },
            apply_authorized: false,
          },
          null,
          2,
        ),
      );
      if (!plan.can_apply) process.exitCode = 3;
      return;
    }

    if (!plan.can_apply) {
      throw new Error(
        "apply recusado pelo plan atual: " + plan.conflicts.join("; "),
      );
    }
    if (plan.source_fingerprint !== args.expectedFingerprint) {
      throw new Error(
        "apply recusado: a fonte não corresponde ao fingerprint revisado no plan",
      );
    }

    // Segunda leitura imediatamente antes do efeito. Detecta mudança entre
    // plan e apply dentro desta própria execução. O servidor precisa continuar
    // parado; essa condição não pode ser provada por quem só lê os arquivos.
    const fresh = await readFilePilotStorageSnapshot({
      unit_id: args.unit,
      data_file: args.data,
      ready_file: args.ready,
    });
    const freshFingerprint = snapshotFingerprint(fresh);
    if (freshFingerprint !== args.expectedFingerprint) {
      throw new Error(
        "apply recusado: a fonte mudou depois do plan; gere um novo plan",
      );
    }

    const result = await applyFileToPostgresCutover({
      sql: client,
      snapshot: fresh,
    });
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          result,
          source_stopped_confirmed: true,
          next_step:
            "não apague store.json; inicie postgres somente após validar o snapshot do destino",
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

void main().catch((e) => {
  console.error(
    "[cutover] RECUSADO:",
    e instanceof Error ? e.message : String(e),
  );
  process.exit(78);
});
