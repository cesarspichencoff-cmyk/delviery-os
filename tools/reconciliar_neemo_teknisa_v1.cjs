"use strict";
/**
 * Reconciliação MINIMIZADA de fontes já exportadas Neemo ↔ Teknisa.
 * Não consulta SQL, aplicativo, spooler ou GPS; não instala leitores.
 * Sem chute por nome, número parecido, hora, valor ou ordem de impressão.
 * Evidência declarada no manifesto é proposta para revisão, NÃO prova de mundo.
 * A saída contém APENAS contagens agregadas, nunca IDs/PII.
 */
const fs = require("node:fs");

const VERSION = "neemo-teknisa-correlation-review.v1";
const DIGEST = /^[a-f0-9]{64}$/i;
const ID = /^[A-Za-z0-9_.:|-]{1,128}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

function shape(obj, keys) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw Error("SCHEMA_INVALID");
  if (Object.keys(obj).length !== keys.length || keys.some(k => !has(obj,k))) throw Error("SCHEMA_INVALID");
}
function textId(x) { if(typeof x !== "string" || !ID.test(x)) throw Error("IDENTITY_FIELD_INVALID"); return x; }
function digest(x) { if(typeof x !== "string" || !DIGEST.test(x)) throw Error("DIGEST_FIELD_INVALID"); return x.toLowerCase(); }
function instant(x) { if(typeof x !== "string" || !TIME.test(x) || !Number.isFinite(Date.parse(x))) throw Error("TIME_FIELD_INVALID"); }
function key(arr) { return JSON.stringify(arr); }
function validateList(a) { if(!Array.isArray(a) || a.length > 1000) throw Error("LIST_INVALID"); }
function validateTeknisa(t) {
  shape(t,["unit_id","order_key","revision","snapshot_sha256","observed_at"]);
  textId(t.unit_id);textId(t.order_key);textId(t.revision);digest(t.snapshot_sha256);instant(t.observed_at);
}
function validateNeemo(n) {
  shape(n,["unit_id","order_id","revision","observed_at"]);
  textId(n.unit_id);textId(n.order_id);textId(n.revision);instant(n.observed_at);
}
function validateLink(l) {
  shape(l,["unit_id","teknisa_order_key","teknisa_revision","teknisa_snapshot_sha256","neemo_order_id","neemo_revision","evidence_sha256","evidence_kind"]);
  for(const k of ["unit_id","teknisa_order_key","teknisa_revision","neemo_order_id","neemo_revision"])textId(l[k]);
  digest(l.teknisa_snapshot_sha256);digest(l.evidence_sha256);
  if(!["independent_source_export","documented_vendor_reference"].includes(l.evidence_kind))throw Error("LINK_EVIDENCE_KIND_INVALID");
}
function audit(input) {
  shape(input,["schema","teknisa","neemo","links"]);
  if(input.schema!==VERSION)throw Error("SCHEMA_VERSION_INVALID");
  for(const collection of [input.teknisa,input.neemo,input.links])validateList(collection);
  input.teknisa.forEach(validateTeknisa);input.neemo.forEach(validateNeemo);input.links.forEach(validateLink);
  const tk=new Map(),ne=new Map(),tkRevisions=new Map(),neRevisions=new Map();
  function put(map,revs,keyBase,revision,full,obj){
    if(map.has(full))throw Error("DUPLICATE_SOURCE_RECORD");
    map.set(full,obj);
    const seen=revs.get(keyBase)||new Set(); seen.add(revision);revs.set(keyBase,seen);
  }
  for(const t of input.teknisa){
    const base=key([t.unit_id,t.order_key]);
    put(tk,tkRevisions,base,t.revision,key([t.unit_id,t.order_key,t.revision]),t);
  }
  for(const n of input.neemo){
    const base=key([n.unit_id,n.order_id]);
    put(ne,neRevisions,base,n.revision,key([n.unit_id,n.order_id,n.revision]),n);
  }
  let candidates=0,missing=0,drift=0,ambiguous=0;
  const usedT=new Set(),usedN=new Set(),once=new Set(),valid=[];
  for(const l of input.links){
    const tkey=key([l.unit_id,l.teknisa_order_key,l.teknisa_revision]);
    const nkey=key([l.unit_id,l.neemo_order_id,l.neemo_revision]);
    const pair=key([tkey,nkey]);
    if(once.has(pair)){ambiguous++;continue;}once.add(pair);
    const t=tk.get(tkey),n=ne.get(nkey);
    if(!t||!n){missing++;continue;}
    if(t.snapshot_sha256.toLowerCase()!==l.teknisa_snapshot_sha256.toLowerCase() ||
       tkRevisions.get(key([l.unit_id,l.teknisa_order_key])).size!==1 ||
       neRevisions.get(key([l.unit_id,l.neemo_order_id])).size!==1){drift++;continue;}
    valid.push([tkey,nkey,pair]);
  }
  // Uma fonte ligada a dois destinos ou um par repetido NAO se torna elegivel.
  const tDegree=new Map(),nDegree=new Map();
  for(const [t,n] of valid){tDegree.set(t,(tDegree.get(t)||0)+1);nDegree.set(n,(nDegree.get(n)||0)+1);}
  const linkCounts=new Map();
  for(const l of input.links){
    const t=key([l.unit_id,l.teknisa_order_key,l.teknisa_revision]);
    const n=key([l.unit_id,l.neemo_order_id,l.neemo_revision]);
    const pair=key([t,n]);
    linkCounts.set(pair,(linkCounts.get(pair)||0)+1);
  }
  for(const [t,n,pair] of valid){
    if(tDegree.get(t)>1||nDegree.get(n)>1||linkCounts.get(pair)>1)ambiguous++;
    else {candidates++;usedT.add(t);usedN.add(n);}
  }
  return Object.freeze({
    schema:VERSION,status:"REVIEW_ONLY_NOT_WORLD_PROOF",
    teknisa_records:input.teknisa.length,neemo_records:input.neemo.length,
    explicit_link_proposals:input.links.length,
    candidates_with_exact_pins:candidates,
    missing_source:missing,revision_or_snapshot_drift:drift,
    ambiguous_or_duplicate:ambiguous,
    unlinked_teknisa:input.teknisa.length-usedT.size,
    unlinked_neemo:input.neemo.length-usedN.size,
    permits_trip_creation:false,permits_printing:false,
    permits_operational_claim:false,
    next_gate:"INDEPENDENT_PROVENANCE_AND_REAL_ORDER_REVIEW"
  });
}
if(require.main===module){
  try{
    if(process.argv.length!==3)throw Error("ARGUMENTS_INVALID");
    const p=process.argv[2];const st=fs.lstatSync(p);
    if(!st.isFile()||st.isSymbolicLink()||st.size>1048576)throw Error("INPUT_FILE_UNSAFE");
    const value=JSON.parse(fs.readFileSync(p,"utf8"));
    process.stdout.write(JSON.stringify(audit(value))+"\n");
  }catch(_){process.stderr.write("CORRELATION_HOLD: invalid or unverifiable input\n");process.exitCode=1;}
}
module.exports={audit,VERSION};
