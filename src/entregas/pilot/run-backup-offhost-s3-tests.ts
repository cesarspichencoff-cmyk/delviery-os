import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  signS3Request,
  validateS3OffhostConfig,
  type S3OffhostConfig,
} from "./backup-offhost-s3";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

function cfg(overrides: Partial<S3OffhostConfig> = {}): S3OffhostConfig {
  return {
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    bucket: "deliveryos-backup-test",
    prefix: "deliveryos-backups",
    access_key_id: "fixture-key-id",
    secret_access_key: "fixture-secret-key",
    ...overrides,
  };
}

async function main(): Promise<void> {
  await test("S31 exige HTTPS fora de localhost", () => {
    assert.equal(
      validateS3OffhostConfig(
        cfg({ endpoint: "http://s3.us-west-004.backblazeb2.com" }),
      ),
      "https_required_outside_localhost",
    );
    assert.equal(
      validateS3OffhostConfig(
        cfg({
          endpoint: "http://127.0.0.1:9000",
          region: "us-east-1",
          bucket: "deliveryos-minio",
        }),
      ),
      null,
    );
  });

  await test("S32 endpoint nao embute credencial, query ou path", () => {
    assert.equal(
      validateS3OffhostConfig(cfg({ endpoint: "https://a:b@example.com/" })),
      "endpoint_must_not_embed_credentials_or_query",
    );
    assert.equal(
      validateS3OffhostConfig(cfg({ endpoint: "https://example.com/?x=1" })),
      "endpoint_must_not_embed_credentials_or_query",
    );
    assert.equal(
      validateS3OffhostConfig(cfg({ endpoint: "https://example.com/base" })),
      "endpoint_path_not_allowed",
    );
  });

  await test("S33 bucket, region e prefixo sao validados", () => {
    assert.equal(validateS3OffhostConfig(cfg({ bucket: "X" })), "bucket_invalid");
    assert.equal(validateS3OffhostConfig(cfg({ region: "../x" })), "region_invalid");
    assert.equal(validateS3OffhostConfig(cfg({ prefix: "../x" })), "prefix_invalid");
    assert.equal(validateS3OffhostConfig(cfg()), null);
  });

  await test("S34 assinatura SigV4 e deterministica", () => {
    const signed = signS3Request({
      config: cfg(),
      method: "PUT",
      key: "deliveryos-backups/a b/file.dump",
      payload_sha256: createHash("sha256").update("abc").digest("hex"),
      now: new Date("2026-10-02T12:34:56.000Z"),
    });
    assert.equal(
      signed.url,
      "https://s3.us-west-004.backblazeb2.com/deliveryos-backup-test/deliveryos-backups/a%20b/file.dump",
    );
    assert.match(
      signed.headers.authorization,
      /^AWS4-HMAC-SHA256 Credential=fixture-key-id\/20261002\/us-west-004\/s3\/aws4_request,/,
    );
    assert.equal(signed.headers["x-amz-date"], "20261002T123456Z");
  });

  await test("S35 superficie S3 nao implementa DELETE, LIST nem HEAD", () => {
    const source = readFileSync(
      join(process.cwd(), "src/entregas/pilot/backup-offhost-s3.ts"),
      "utf8",
    );
    assert.equal(/method:\s*"DELETE"|\bDeleteObject\b|\bdeleteObject\b/.test(source), false);
    assert.equal(/method:\s*"HEAD"|\bListObjects\b|\blistObjects\b/.test(source), false);
    assert.match(source, /method: "GET" \| "PUT"/);
  });

  await test("S36 uploader e estritamente PUT-only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/entregas/pilot/backup-offhost-s3.ts"),
      "utf8",
    );
    const start = source.indexOf("export async function exportBackupBundleS3");
    const end = source.indexOf("/**\n * Verificador/restaurador", start);
    const uploader = source.slice(start, end);
    assert.equal(/downloadToFile|getText|method:\s*"GET"/.test(uploader), false);
    assert.match(uploader, /putFile/);
    assert.match(uploader, /putText/);
  });

  await test("S37 CLIs nao aceitam credenciais por argumento", () => {
    for (const rel of [
      "tools/entregas_backup_export_s3.ts",
      "tools/entregas_backup_fetch_s3.ts",
    ]) {
      const cli = readFileSync(join(process.cwd(), rel), "utf8");
      assert.equal(/--(?:access|secret|key|token)/i.test(cli), false);
      assert.match(cli, /ENTREGAS_BACKUP_S3_ACCESS_KEY_ID/);
      assert.match(cli, /ENTREGAS_BACKUP_S3_SECRET_ACCESS_KEY/);
    }
  });

  await test("S38 resultado e manifesto nunca carregam credenciais", () => {
    const source = readFileSync(
      join(process.cwd(), "src/entregas/pilot/backup-offhost-s3.ts"),
      "utf8",
    );
    const resultTypes = source.slice(
      source.indexOf("export type S3OffhostUploadResult"),
      source.indexOf("const EMPTY_SHA256"),
    );
    assert.equal(/secret_access_key\s*:/.test(resultTypes), false);
    assert.equal(/access_key_id\s*:/.test(resultTypes), false);

    const manifestBlock = source.slice(
      source.indexOf("const manifest = {"),
      source.indexOf("try {", source.indexOf("const manifest = {")),
    );
    assert.equal(/secret_access_key|access_key_id|session_token/.test(manifestBlock), false);
  });

  console.log(`BACKUP_OFFHOST_S3: ${passed}/${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
