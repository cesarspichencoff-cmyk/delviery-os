import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  computeSigV4,
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

  await test("S34b PUT com Object Lock inclui Content-MD5 assinado", () => {
    const signed = signS3Request({
      config: cfg(),
      method: "PUT",
      key: "deliveryos-backups/object-lock.dump",
      payload_sha256: createHash("sha256").update("abc").digest("hex"),
      content_md5: createHash("md5").update("abc").digest("base64"),
      now: new Date("2026-10-02T12:34:56.000Z"),
    });
    assert.equal(signed.headers["content-md5"], "kAFQmDzST7DWlj99KOF/cg==");
    assert.match(
      signed.headers.authorization,
      /SignedHeaders=content-md5;host;x-amz-content-sha256;x-amz-date/,
    );
  });

  await test("S35 nucleo SigV4 confere com vetor oficial AWS GET Object", () => {
    const emptyHash =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const vector = computeSigV4({
      method: "GET",
      canonical_uri: "/test.txt",
      headers: {
        Host: "examplebucket.s3.amazonaws.com",
        Range: "bytes=0-9",
        "x-amz-content-sha256": emptyHash,
        "x-amz-date": "20130524T000000Z",
      },
      payload_sha256: emptyHash,
      access_key_id: "AKIAIOSFODNN7EXAMPLE",
      secret_access_key:
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      amz_date: "20130524T000000Z",
      region: "us-east-1",
    });

    assert.equal(
      createHash("sha256").update(vector.canonical_request).digest("hex"),
      "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972",
    );
    assert.equal(
      vector.signature,
      "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    assert.equal(
      vector.authorization,
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
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
    const end = source.indexOf("export async function downloadBackupBundleS3", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
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
