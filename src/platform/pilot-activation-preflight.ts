export type PreflightStatus =
  | "PASS"
  | "BLOCKED"
  | "PRESENT_UNVERIFIED"
  | "SAFE_OFF";

export interface ActivationProbeInput {
  readonly adb_available: boolean;
  readonly physical_devices: number;
  readonly emulator_devices: number;
  readonly unauthorized_devices: number;
  readonly docker_available: boolean;
  readonly operational_db_url_present: boolean;
  readonly product_reader_password_present: boolean;
  readonly source_ingest_requested: boolean | null;
  readonly source_ingest_production: string;
  readonly consumer_live: string;
  readonly product_reader_credential: string;
  readonly deployment_status: string;
}

export interface ActivationCheck {
  readonly id:
    | "E1_PHYSICAL_ANDROID"
    | "E2_OPERATIONAL_DB_AND_DEPLOY"
    | "E3_SOURCE_INGEST_ACTIVATION"
    | "E4_CONSUMER_LIVE"
    | "E6_PRODUCT_READER_CREDENTIAL";
  readonly status: PreflightStatus;
  readonly detail: string;
}

export interface ActivationPreflightResult {
  readonly version: "1.0.0";
  readonly effect_attempted: false;
  readonly safe_to_run_without_authorization: true;
  readonly checks: readonly ActivationCheck[];
  readonly diagnostics: {
    readonly adb_available: boolean;
    readonly physical_devices: number;
    readonly emulator_devices: number;
    readonly unauthorized_devices: number;
    readonly docker_available: boolean;
    readonly operational_db_url_present: boolean;
    readonly product_reader_password_present: boolean;
    readonly source_ingest_requested: boolean | null;
  };
}

function upper(x: string): string {
  return String(x ?? "").trim().toUpperCase();
}

export function evaluateActivationPreflight(
  input: ActivationProbeInput,
): ActivationPreflightResult {
  const checks: ActivationCheck[] = [];

  checks.push({
    id: "E1_PHYSICAL_ANDROID",
    status: input.physical_devices > 0 ? "PASS" : "BLOCKED",
    detail:
      input.physical_devices > 0
        ? "aparelho físico conectado ao adb; bateria de campo ainda precisa ser executada"
        : input.adb_available
          ? "adb disponível, mas nenhum aparelho físico conectado"
          : "adb indisponível no ambiente",
  });

  const deployment = upper(input.deployment_status);
  const deployLooksDone = new Set([
    "DEPLOYED",
    "ACTIVE",
    "CUTOVER_PROVEN",
  ]).has(deployment);
  const dbAndDeployPass =
    input.operational_db_url_present && deployLooksDone;
  checks.push({
    id: "E2_OPERATIONAL_DB_AND_DEPLOY",
    status: dbAndDeployPass
      ? "PASS"
      : input.operational_db_url_present
        ? "PRESENT_UNVERIFIED"
        : "BLOCKED",
    detail: dbAndDeployPass
      ? "URL operacional presente e STATE registra deploy/cutover provado"
      : input.operational_db_url_present
        ? "URL operacional está presente, mas autorização/deploy/cutover não estão provados no STATE"
        : "URL operacional ausente; autorização/deploy/cutover seguem externos",
  });

  const ingestActivated = upper(input.source_ingest_production) === "ACTIVATED";
  checks.push({
    id: "E3_SOURCE_INGEST_ACTIVATION",
    status: ingestActivated
      ? "PASS"
      : input.source_ingest_requested === true
        ? "PRESENT_UNVERIFIED"
        : "SAFE_OFF",
    detail: ingestActivated
      ? "STATE registra source-ingest de produção como ACTIVATED"
      : input.source_ingest_requested === true
        ? "toggle local pede ingest, mas produção continua sem prova de ativação"
        : "source-ingest continua desligado/não solicitado neste ambiente",
  });

  const consumerActivated =
    upper(input.consumer_live) === "ACTIVATED" ||
    upper(input.consumer_live) === "ENABLED";
  checks.push({
    id: "E4_CONSUMER_LIVE",
    status: consumerActivated ? "PASS" : "SAFE_OFF",
    detail: consumerActivated
      ? "STATE registra consumer_live ativo"
      : "consumer_live continua OFF/NOT_AUTHORIZED; nenhum toggle local é inferido",
  });

  const readerCreated =
    upper(input.product_reader_credential) === "CREATED";
  checks.push({
    id: "E6_PRODUCT_READER_CREDENTIAL",
    status:
      readerCreated && input.product_reader_password_present
        ? "PASS"
        : input.product_reader_password_present
          ? "PRESENT_UNVERIFIED"
          : "BLOCKED",
    detail:
      readerCreated && input.product_reader_password_present
        ? "credencial do reader está registrada como criada e a senha está presente no ambiente"
        : input.product_reader_password_present
          ? "senha do reader está presente, mas o STATE não prova criação da credencial"
          : "senha/credencial real do Product System reader ausente",
  });

  return {
    version: "1.0.0",
    effect_attempted: false,
    safe_to_run_without_authorization: true,
    checks,
    diagnostics: {
      adb_available: input.adb_available,
      physical_devices: input.physical_devices,
      emulator_devices: input.emulator_devices,
      unauthorized_devices: input.unauthorized_devices,
      docker_available: input.docker_available,
      operational_db_url_present: input.operational_db_url_present,
      product_reader_password_present: input.product_reader_password_present,
      source_ingest_requested: input.source_ingest_requested,
    },
  };
}
