import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  type BackupIntegrityFailure,
  verifyBackupIntegrity,
} from "./backup-integrity";

export const BACKUP_OFFHOST_S3_SCHEMA = "deliveryos-backup-offhost-s3@1";

export interface S3OffhostConfig {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
}

export type S3OffhostUploadResult =
  | {
      ok: true;
      schema: typeof BACKUP_OFFHOST_S3_SCHEMA;
      bucket: string;
      prefix: string;
      snapshot_key: string;
      sidecar_key: string;
      manifest_key: string;
      sha256: string;
      bytes: number;
      uploaded_objects: 3;
      source_verified: true;
      remote_readback_verified: false;
      off_host_proven: false;
    }
  | {
      ok: false;
      schema: typeof BACKUP_OFFHOST_S3_SCHEMA;
      reason:
        | "config_invalid"
        | "source_invalid"
        | "remote_request_failed";
      detail?: string;
      source_reason?: BackupIntegrityFailure;
      partial_prefix?: string;
      off_host_proven: false;
    };

export type S3OffhostDownloadResult =
  | {
      ok: true;
      schema: typeof BACKUP_OFFHOST_S3_SCHEMA;
      snapshot_path: string;
      sidecar_path: string;
      manifest_path: string;
      sha256: string;
      bytes: number;
      remote_manifest_verified: true;
      downloaded_integrity_verified: true;
      off_host_proven: false;
    }
  | {
      ok: false;
      schema: typeof BACKUP_OFFHOST_S3_SCHEMA;
      reason:
        | "config_invalid"
        | "manifest_invalid"
        | "destination_missing"
        | "destination_not_directory"
        | "destination_exists"
        | "remote_request_failed"
        | "remote_verify_failed";
      detail?: string;
      off_host_proven: false;
    };

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeKeyPath(key: string): string {
  return key.split("/").map(awsEncode).join("/");
}

function amzTime(now: Date): { amz: string; date: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, date: iso.slice(0, 8) };
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

export function validateS3OffhostConfig(config: S3OffhostConfig): string | null {
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    return "endpoint_invalid";
  }

  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    return "endpoint_must_not_embed_credentials_or_query";
  }
  if (endpoint.pathname !== "/" && endpoint.pathname !== "") {
    return "endpoint_path_not_allowed";
  }

  const local =
    endpoint.hostname === "127.0.0.1" ||
    endpoint.hostname === "localhost" ||
    endpoint.hostname === "::1";
  if (endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) {
    return "https_required_outside_localhost";
  }

  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) {
    return "bucket_invalid";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,62}$/.test(config.region)) {
    return "region_invalid";
  }

  const prefix = normalizePrefix(config.prefix);
  if (!prefix || prefix.length > 180 || /(^|\/)\.\.?($|\/)/.test(prefix)) {
    return "prefix_invalid";
  }

  if (!config.access_key_id.trim() || !config.secret_access_key.trim()) {
    return "credentials_missing";
  }
  return null;
}

export interface SigV4VectorInput {
  method: "GET" | "PUT";
  canonical_uri: string;
  canonical_query?: string;
  headers: Record<string, string>;
  payload_sha256: string;
  access_key_id: string;
  secret_access_key: string;
  amz_date: string;
  region: string;
  service?: string;
}

export interface SigV4VectorResult {
  canonical_request: string;
  string_to_sign: string;
  signed_headers: string;
  scope: string;
  signature: string;
  authorization: string;
}

/**
 * Nucleo puro SigV4. Separado do transporte/path-style para ser verificavel
 * contra os vetores oficiais publicados pela AWS.
 */
export function computeSigV4(input: SigV4VectorInput): SigV4VectorResult {
  if (!/^\\d{8}T\\d{6}Z$/.test(input.amz_date)) {
    throw new Error("amz_date_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(input.payload_sha256)) {
    throw new Error("payload_sha256_invalid");
  }
  if (!input.canonical_uri.startsWith("/")) {
    throw new Error("canonical_uri_invalid");
  }

  const normalizedHeaders = new Map<string, string>();
  for (const [rawName, rawValue] of Object.entries(input.headers)) {
    const name = rawName.trim().toLowerCase();
    if (!name) throw new Error("header_name_invalid");
    const value = rawValue.trim().replace(/\\s+/g, " ");
    if (normalizedHeaders.has(name)) {
      throw new Error("duplicate_header_after_normalization");
    }
    normalizedHeaders.set(name, value);
  }
  if (!normalizedHeaders.has("host")) {
    throw new Error("host_header_required");
  }

  const signedHeaderNames = [...normalizedHeaders.keys()].sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => name + ":" + normalizedHeaders.get(name) + "\\n")
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    input.method,
    input.canonical_uri,
    input.canonical_query ?? "",
    canonicalHeaders,
    signedHeaders,
    input.payload_sha256,
  ].join("\\n");

  const date = input.amz_date.slice(0, 8);
  const service = input.service ?? "s3";
  const scope = date + "/" + input.region + "/" + service + "/aws4_request";
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amz_date,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\\n");

  const kDate = hmac("AWS4" + input.secret_access_key, date);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return {
    canonical_request: canonicalRequest,
    string_to_sign: stringToSign,
    signed_headers: signedHeaders,
    scope,
    signature,
    authorization:
      "AWS4-HMAC-SHA256 Credential=" +
      input.access_key_id +
      "/" +
      scope +
      ", SignedHeaders=" +
      signedHeaders +
      ", Signature=" +
      signature,
  };
}

/**
 * SigV4 minimo para o contrato off-host.
 *
 * Deliberadamente so aceita GET e PUT. DELETE, LIST e HEAD ficam fora da
 * superficie deste modulo para que o uploader possa operar com writeFiles
 * sem deleteFiles/readFiles no provedor real.
 */
export function signS3Request(args: {
  config: S3OffhostConfig;
  method: "GET" | "PUT";
  key: string;
  payload_sha256?: string;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const cfgError = validateS3OffhostConfig(args.config);
  if (cfgError) throw new Error(cfgError);

  const endpoint = new URL(args.config.endpoint);
  const key = args.key.replace(/^\/+/, "");
  const canonicalUri =
    "/" + awsEncode(args.config.bucket) + "/" + encodeKeyPath(key);
  endpoint.pathname = canonicalUri;

  const now = args.now ?? new Date();
  const { amz, date } = amzTime(now);
  const payloadHash = args.payload_sha256 ?? EMPTY_SHA256;

  const headersToSign: Record<string, string> = {
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (args.config.session_token) {
    headersToSign["x-amz-security-token"] = args.config.session_token;
  }

  const vector = computeSigV4({
    method: args.method,
    canonical_uri: canonicalUri,
    headers: headersToSign,
    payload_sha256: payloadHash,
    access_key_id: args.config.access_key_id,
    secret_access_key: args.config.secret_access_key,
    amz_date: amz,
    region: args.config.region,
  });

  return {
    url: endpoint.toString(),
    headers: {
      authorization: vector.authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
      ...(args.config.session_token
        ? { "x-amz-security-token": args.config.session_token }
        : {}),
    },
  };
}

async function request(args: {
  config: S3OffhostConfig;
  method: "GET" | "PUT";
  key: string;
  payload_sha256?: string;
  body?: NodeJS.ReadableStream | Buffer | string;
  content_length?: number;
}): Promise<Response> {
  const signed = signS3Request({
    config: args.config,
    method: args.method,
    key: args.key,
    payload_sha256: args.payload_sha256,
  });

  const init: RequestInit & { duplex?: "half" } = {
    method: args.method,
    headers: {
      ...signed.headers,
      ...(args.content_length !== undefined
        ? { "content-length": String(args.content_length) }
        : {}),
    },
  };
  if (args.body !== undefined) {
    init.body = args.body as BodyInit;
    if (typeof args.body !== "string" && !Buffer.isBuffer(args.body)) {
      init.duplex = "half";
    }
  }
  return fetch(signed.url, init);
}

async function putFile(
  config: S3OffhostConfig,
  key: string,
  path: string,
  sha256: string,
): Promise<void> {
  const bytes = statSync(path).size;
  const response = await request({
    config,
    method: "PUT",
    key,
    payload_sha256: sha256,
    body: createReadStream(path),
    content_length: bytes,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      "PUT " + key + " HTTP " + response.status + " " + body.slice(0, 300),
    );
  }
}

async function putText(
  config: S3OffhostConfig,
  key: string,
  text: string,
): Promise<void> {
  const body = Buffer.from(text, "utf8");
  const response = await request({
    config,
    method: "PUT",
    key,
    payload_sha256: sha256Hex(body),
    body,
    content_length: body.length,
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      "PUT " +
        key +
        " HTTP " +
        response.status +
        " " +
        responseBody.slice(0, 300),
    );
  }
}

async function downloadToFile(
  config: S3OffhostConfig,
  key: string,
  path: string,
): Promise<void> {
  const response = await request({ config, method: "GET", key });
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(
      "GET " + key + " HTTP " + response.status + " " + body.slice(0, 300),
    );
  }
  await pipeline(
    Readable.fromWeb(response.body as never),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
  );
}

async function getText(
  config: S3OffhostConfig,
  key: string,
): Promise<string> {
  const response = await request({ config, method: "GET", key });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      "GET " + key + " HTTP " + response.status + " " + body.slice(0, 300),
    );
  }
  return response.text();
}

/**
 * Uploader estritamente write-only.
 *
 * Ele verifica o pacote local e faz exatamente tres PUTs:
 * snapshot, sidecar e manifesto. Nao faz GET/HEAD/LIST/DELETE.
 *
 * A verificacao remota e o restore sao responsabilidade de
 * downloadBackupBundleS3 com uma segunda credencial de leitura.
 */
export async function exportBackupBundleS3(args: {
  snapshot_path: string;
  config: S3OffhostConfig;
  exported_at?: Date;
}): Promise<S3OffhostUploadResult> {
  const cfgError = validateS3OffhostConfig(args.config);
  if (cfgError) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "config_invalid",
      detail: cfgError,
      off_host_proven: false,
    };
  }

  const source = await verifyBackupIntegrity(args.snapshot_path);
  if (!source.ok) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "source_invalid",
      source_reason: source.reason,
      detail: source.reason,
      off_host_proven: false,
    };
  }

  const prefix = normalizePrefix(args.config.prefix);
  const snapshotName = basename(args.snapshot_path);
  const transferId = randomUUID();
  const bundle =
    "deliveryos-" +
    snapshotName.replace(/[^A-Za-z0-9._-]+/g, "_") +
    "-" +
    source.sha256.slice(0, 12) +
    "-" +
    transferId;
  const remotePrefix = prefix + "/" + bundle;
  const snapshotKey = remotePrefix + "/" + snapshotName;
  const sidecarKey = snapshotKey + ".sha256";
  const manifestKey = remotePrefix + "/deliveryos-backup-export.json";

  const manifest = {
    schema: BACKUP_OFFHOST_S3_SCHEMA,
    exported_at: (args.exported_at ?? new Date()).toISOString(),
    bucket: args.config.bucket,
    prefix: remotePrefix,
    snapshot_name: snapshotName,
    snapshot_key: snapshotKey,
    sidecar_key: sidecarKey,
    sha256: source.sha256,
    bytes: source.bytes,
    source_verified: true,
    remote_readback_verified: false,
    off_host_proven: false,
    note:
      "Write-only upload completed. Verify/read back with a separate read credential before claiming off-host proof.",
  };

  try {
    await putFile(args.config, snapshotKey, args.snapshot_path, source.sha256);

    const sidecarPath = args.snapshot_path + ".sha256";
    const sidecarBody = readFileSync(sidecarPath);
    await putFile(
      args.config,
      sidecarKey,
      sidecarPath,
      sha256Hex(sidecarBody),
    );

    await putText(
      args.config,
      manifestKey,
      JSON.stringify(manifest, null, 2) + "\n",
    );

    return {
      ok: true,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      bucket: args.config.bucket,
      prefix: remotePrefix,
      snapshot_key: snapshotKey,
      sidecar_key: sidecarKey,
      manifest_key: manifestKey,
      sha256: source.sha256,
      bytes: source.bytes,
      uploaded_objects: 3,
      source_verified: true,
      remote_readback_verified: false,
      off_host_proven: false,
    };
  } catch (error) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "remote_request_failed",
      detail: error instanceof Error ? error.message : String(error),
      partial_prefix: remotePrefix,
      off_host_proven: false,
    };
  }
}

/**
 * Verificador/restaurador read-only.
 *
 * Recebe o manifest_key conhecido, baixa exatamente os tres objetos
 * referenciados e valida que o manifesto nao consegue escapar do bundle/prefixo.
 * Nao lista bucket e nao apaga nada.
 */
export async function downloadBackupBundleS3(args: {
  config: S3OffhostConfig;
  manifest_key: string;
  destination_root: string;
}): Promise<S3OffhostDownloadResult> {
  const cfgError = validateS3OffhostConfig(args.config);
  if (cfgError) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "config_invalid",
      detail: cfgError,
      off_host_proven: false,
    };
  }

  const destRoot = args.destination_root;
  if (!existsSync(destRoot)) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "destination_missing",
      off_host_proven: false,
    };
  }
  if (!statSync(destRoot).isDirectory()) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "destination_not_directory",
      off_host_proven: false,
    };
  }

  const manifestKey = args.manifest_key.replace(/^\/+/, "");
  const allowedPrefix = normalizePrefix(args.config.prefix) + "/";
  if (
    !manifestKey.startsWith(allowedPrefix) ||
    !manifestKey.endsWith("/deliveryos-backup-export.json")
  ) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "manifest_invalid",
      detail: "manifest key outside configured prefix or wrong filename",
      off_host_proven: false,
    };
  }

  try {
    const manifestText = await getText(args.config, manifestKey);
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(manifestText) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        schema: BACKUP_OFFHOST_S3_SCHEMA,
        reason: "manifest_invalid",
        detail: "manifest is not valid JSON",
        off_host_proven: false,
      };
    }

    const snapshotName = String(manifest.snapshot_name ?? "");
    const snapshotKey = String(manifest.snapshot_key ?? "");
    const sidecarKey = String(manifest.sidecar_key ?? "");
    const sha256 = String(manifest.sha256 ?? "");
    const bytes = Number(manifest.bytes);
    const bundlePrefix = manifestKey.slice(0, manifestKey.lastIndexOf("/"));

    if (
      manifest.schema !== BACKUP_OFFHOST_S3_SCHEMA ||
      !snapshotName ||
      /[\\/]/.test(snapshotName) ||
      snapshotKey !== bundlePrefix + "/" + snapshotName ||
      sidecarKey !== snapshotKey + ".sha256" ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      manifest.off_host_proven !== false
    ) {
      return {
        ok: false,
        schema: BACKUP_OFFHOST_S3_SCHEMA,
        reason: "manifest_invalid",
        detail: "manifest fields violate backup contract",
        off_host_proven: false,
      };
    }

    const snapshotPath = join(destRoot, snapshotName);
    const sidecarPath = snapshotPath + ".sha256";
    const manifestPath = join(destRoot, "deliveryos-backup-export.json");

    if (
      existsSync(snapshotPath) ||
      existsSync(sidecarPath) ||
      existsSync(manifestPath)
    ) {
      return {
        ok: false,
        schema: BACKUP_OFFHOST_S3_SCHEMA,
        reason: "destination_exists",
        detail: "download destination already contains bundle files",
        off_host_proven: false,
      };
    }

    await downloadToFile(args.config, snapshotKey, snapshotPath);
    await downloadToFile(args.config, sidecarKey, sidecarPath);

    const verified = await verifyBackupIntegrity(snapshotPath, sidecarPath);
    if (
      !verified.ok ||
      verified.sha256 !== sha256 ||
      verified.bytes !== bytes
    ) {
      return {
        ok: false,
        schema: BACKUP_OFFHOST_S3_SCHEMA,
        reason: "remote_verify_failed",
        detail: verified.ok
          ? "download differs from manifest"
          : verified.reason,
        off_host_proven: false,
      };
    }

    writeFileSync(manifestPath, manifestText, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    return {
      ok: true,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      snapshot_path: snapshotPath,
      sidecar_path: sidecarPath,
      manifest_path: manifestPath,
      sha256,
      bytes,
      remote_manifest_verified: true,
      downloaded_integrity_verified: true,
      off_host_proven: false,
    };
  } catch (error) {
    return {
      ok: false,
      schema: BACKUP_OFFHOST_S3_SCHEMA,
      reason: "remote_request_failed",
      detail: error instanceof Error ? error.message : String(error),
      off_host_proven: false,
    };
  }
}
