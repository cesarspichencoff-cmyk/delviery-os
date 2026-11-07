"use strict";
/**
 * Offline laboratory candidate only. Never writes or replaces the pinned
 * Academia motor, installed Reader, product catalog or physical printer.
 * Exact-blob and source-anchor checks deliberately fail closed.
 *
 * This limited change repairs only the legacy category/inner-container
 * contradiction for the human-confirmed Missoshiro spelling. It does NOT
 * approve a live native identity, kit, external bag count, observation,
 * operational preview, print or deploy. Missoshiru is NOT generalized.
 */
const crypto=require("node:crypto");
const SOURCE_BLOB="3167c309f02a0ad5a84fb43043b8866e3bee873c";
const SCHEMA="tata.comandas.missoshiro-motor-delta.v1.offline";
const EFFECTS=Object.freeze({file_write:false,service:false,network:false,sql:false,
  catalog_write:false,sequence_write:false,spooler:false,print:false,deploy:false});
const ARRAY_ANCHOR='    "guioza", "edamame", "missoshiro", "missoshiru", "tempura de milho doce",';
const ARRAY_REPLACEMENT='    "guioza", "edamame", "missoshiru", "tempura de milho doce",';
const CATEGORY_ANCHOR='    if (/^batera\\b/.test(name)) return { category: "caixa_fixa",';
const CATEGORY_LINE='    if (name === "missoshiro" && family === "acompanhamento" && station === "cozinha_quentes") return { category: "missoshiro_isopor_candidate", box: "POTE_ISOPOR", per_unit: true, status: FACT, why: "REGRA_HUMANA_REVIEW_ONLY_2026_11_06_POTE_ISOPOR_SEM_KIT" };\n';
function hold(reason){return{schema:SCHEMA,status:"HOLD",reason,
  candidate_source:null,category_fixed:false,kit_fixed:false,bags_fixed:false,
  native_identity_proven:false,operational_authorized:false,print_authorized:false,effects:EFFECTS};}
function patchPinnedMotorInMemory(source) {
  if(typeof source!=="string"||source.length<60000||source.length>130000)
    return hold("SOURCE_SIZE_OR_TYPE_INVALID");
  const payload=Buffer.from(source,"utf8");
  const blob=crypto.createHash("sha1").update(
    Buffer.concat([Buffer.from("blob "+payload.length+"\0"),payload])).digest("hex");
  if(blob!==SOURCE_BLOB)return hold("PINNED_BLOB_MISMATCH");
  if(source.split(ARRAY_ANCHOR).length!==2||
     source.split(CATEGORY_ANCHOR).length!==2)
    return hold("STRICT_SOURCE_ANCHORS_NOT_UNIQUE");
  const patched=source.replace(ARRAY_ANCHOR,ARRAY_REPLACEMENT)
    .replace(CATEGORY_ANCHOR,CATEGORY_LINE+CATEGORY_ANCHOR);
  if(patched===source||patched.includes(ARRAY_ANCHOR))
    return hold("DELTA_NOT_ESTABLISHED");
  const bytes=Buffer.from(patched,"utf8");
  return {schema:SCHEMA,status:"ISOLATED_CATEGORY_CANDIDATE_ONLY",
    reason:"KIT_AND_EXTERNAL_BAG_LOGIC_STILL_LEGACY_AND_MUST_HOLD",
    candidate_source:patched,
    candidate_sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
    original_blob_sha1:SOURCE_BLOB,category_fixed:true,kit_fixed:false,
    bags_fixed:false,native_identity_proven:false,operational_authorized:false,
    print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,SOURCE_BLOB,EFFECTS,patchPinnedMotorInMemory};
