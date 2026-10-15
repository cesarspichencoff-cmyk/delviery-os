/** Contrato puro do modo de leitura local SHADOW. Sem banco/rede/segredo real. */
import assert from "node:assert/strict";
import { checarAcessoEscopado, configurarEscopoShadow } from "../../src/product/security/escopo-api-shadow";

const token = "ab".repeat(32); // SOMENTE fixture: nunca credencial de producao
const env = {
  DELIVERYOS_PRODUCT_SCOPE_MODE: "shadow_lab",
  DELIVERYOS_PRODUCT_SCOPE_UNIT: "ITAIM",
  DELIVERYOS_PRODUCT_SCOPE_TOKEN: token,
  DELIVERYOS_PRODUCT_READ_UNIT: "ITAIM",
  DELIVERYOS_DATABASE_URL: "postgresql://LAB_SYNTHETIC_UNUSED/db",
};

assert.equal(configurarEscopoShadow({}), null);
for (const change of [
  { DELIVERYOS_PRODUCT_SCOPE_MODE: undefined },
  { DELIVERYOS_PRODUCT_SCOPE_UNIT: "VILA-LAB" },
  { DELIVERYOS_PRODUCT_SCOPE_UNIT: "" },
  { DELIVERYOS_PRODUCT_SCOPE_TOKEN: "short" },
  { DELIVERYOS_PRODUCT_SCOPE_TOKEN: undefined },
  { DELIVERYOS_PRODUCT_READ_UNIT: "VILA-LAB" },
  { DELIVERYOS_DATABASE_URL: undefined },
  { TATA_READER_INSTALL_ROOT: "LAB_NONEMPTY" },
  { CONFERENCE_BRAIN_DATA_DIR: "LAB_NONEMPTY" },
]) {
  const invalid = { ...env, ...change };
  assert.throws(() => configurarEscopoShadow(invalid), /SHADOW_SCOPE_CONFIG_INVALID/);
}
const scope = configurarEscopoShadow(env);
assert.ok(scope);
const chk = (path: string, header?: string) =>
  checarAcessoEscopado(scope, new URL(path,"http://127.0.0.1:9925"), header);

for (const path of ["/api/entregas", "/api/copiloto?unit_id=ITAIM", "/api/health"]) {
  assert.deepEqual(chk(path), { autorizado: false, status: 401, erro: "autenticacao_necessaria" });
  assert.deepEqual(chk(path, "Bearer " + "cd".repeat(32)), { autorizado: false, status: 401, erro: "autenticacao_necessaria" });
  assert.deepEqual(chk(path, "Bearer garbage"), { autorizado: false, status: 401, erro: "autenticacao_necessaria" });
  assert.deepEqual(chk(path, "Bearer " + token), { autorizado: true });
}
for (const path of [
  "/api/entregas?unidade=VILA-LAB",
  "/api/copiloto?unit_id=VILA-LAB",
  "/api/entregas?unidade=ITAIM&unidade=VILA-LAB",
  "/api/entregas?unit_id=ITAIM",
  "/api/copiloto?unidade=ITAIM",
  "/api/historico?unit_id=ITAIM",
  "/api/fontes", "/api/conference-brain", "/api/navegacao", "/api/operacao-viva",
]) {
  const denied = chk(path, "Bearer " + token);
  assert.deepEqual(denied.autorizado, false, path);
  assert.equal(denied.status, 403, path);
}
console.log("ESCOPO_API_SHADOW_CONTRACT=PASS fail-closed config, bearer, explicit unit and denied routes");
