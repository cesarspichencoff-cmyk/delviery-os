"use strict";
/**
 * Homologation candidate V1 — the SMALLEST file set that runs the native chain
 * in shadow (no print), MEASURED from the require/import graph of its entry
 * points, never hand-picked. Each file is pinned by git blob id.
 *
 *   node tools/comandas_candidata_homologacao_v1.cjs            # print manifest
 *   node tools/comandas_candidata_homologacao_v1.cjs --write    # refresh pinned manifest
 *
 * The manifest describes WHAT would be installed for a shadow pilot. It does
 * not install, copy, start a service, touch a queue or print.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.join(__dirname,"..");
const MANIFEST="docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json";
const ENTRIES=[
 "tools/comandas_cadeia_nativa_v1_offline.cjs",
 "runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs",
];
// Data/config the chain reads at run time (configuration, not order data).
const RUNTIME_DATA=[
 "tools/fixtures/canonical-packaging-v63-pinned.js",
 "data/odhen_product_routing_compact_v1.json",
 "data/runtime_printer_map_v1.json",
 "data/production_printer_calibration_registry_v1.json",
 "data/non_production_delivery_items_v1.json",
 "data/comandas_catalog_equivalence_v1.json",
 "data/comandas_kit_rules_human_v1.json",
 "data/tata_sequence_attesters_v1.json",
];
const blob=b=>crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob "+b.length+"\0"),b])).digest("hex");
const rel=p=>path.relative(ROOT,p).split(path.sep).join("/");

function resolveSpec(fromFile,spec){
 if(!spec.startsWith("."))return null; // node: builtins / bare modules handled separately
 let target=path.resolve(path.dirname(fromFile),spec);
 // dist/src/x.js is compiled from src/x.ts: pin the SOURCE.
 const r=rel(target);
 if(r.startsWith("dist/src/"))target=path.join(ROOT,r.slice(5).replace(/\.js$/,".ts"));
 const candidates=[target,target+".ts",target+".js",target+".cjs",target.replace(/\.js$/,".ts")];
 return candidates.find(c=>fs.existsSync(c)&&fs.statSync(c).isFile())||null;
}
function specifiers(text){
 const out=[];
 for(const re of [/require\(\s*["']([^"']+)["']\s*\)/g,/\bfrom\s+["']([^"']+)["']/g,/\bimport\s+["']([^"']+)["']/g])
  for(const m of text.matchAll(re))out.push(m[1]);
 return out;
}
function closure(){
 const seen=new Map(),builtins=new Set(),missing=[];
 const queue=ENTRIES.map(e=>path.join(ROOT,e));
 while(queue.length){
  const f=queue.shift();if(seen.has(f))continue;
  const text=fs.readFileSync(f,"utf8");seen.set(f,text);
  for(const spec of specifiers(text)){
   if(!spec.startsWith(".")){builtins.add(spec.replace(/^node:/,""));continue;}
   const t=resolveSpec(f,spec);
   if(t)queue.push(t);else missing.push(rel(f)+" -> "+spec);
  }
 }
 return {files:[...seen.keys()].map(rel).sort(),builtins:[...builtins].sort(),missing};
}
function buildManifest(){
 const c=closure();
 const entry=f=>{const b=fs.readFileSync(path.join(ROOT,f));
  return {path:f,git_blob:blob(b),bytes:b.length};};
 const flags={child_process:[],network:[],file_write:[]};
 for(const f of c.files){
  const t=fs.readFileSync(path.join(ROOT,f),"utf8");
  if(/require\(["'](?:node:)?child_process["']\)/.test(t))flags.child_process.push(f);
  if(/require\(["'](?:node:)?(?:net|http|https|http2|tls|dgram)["']\)/.test(t))flags.network.push(f);
  if(/writeFileSync|appendFileSync|createWriteStream|renameSync/.test(t))flags.file_write.push(f);
 }
 return {schema:"tata.comandas.homologation-candidate.v1",
  scope:"SHADOW_NATIVE_CHAIN_NO_PRINT",
  entries:ENTRIES,code:c.files.map(entry),runtime_data:RUNTIME_DATA.map(entry),
  node_builtins:c.builtins,unresolved_relative_requires:c.missing,
  capability_flags:flags,
  // Identity is the EXACT bytes (git blob of the working file), never
  // "content modulo line endings": a Windows CRLF checkout must not change it.
  eol_policy:"BYTE_EXACT_GIT_BLOB; every file above is '-text' in .gitattributes",
  build:{command:"npm run build",typescript:"5.5.3 (package-lock)",dist_from:"src/*.ts listed above"},
  not_included:["print/spooler emitter","service or supervisor change","sequence writer","SQL client"],
  effects:{install:false,service:false,queue:false,print:false,sequence_write:false}};
}
/**
 * Candidate paths NOT protected from end-of-line conversion. Without '-text',
 * a Windows checkout (core.autocrlf) rewrites LF as CRLF and the installed
 * bytes stop matching the pinned blob (observed: PR #135 Windows CI run
 * 41398285659, job 125124301630).
 */
function byteExactAttributeGaps(manifest,attributesText){
 const lines=new Set(String(attributesText).split(/\r?\n/).map(l=>l.trim())
  .filter(l=>l&&!l.startsWith("#")).map(l=>l.replace(/\s+/g," ")));
 return [...manifest.code,...manifest.runtime_data].map(f=>f.path)
  .filter(p=>!lines.has(p+" -text"));
}
if(require.main===module){
 const m=buildManifest();
 if(process.argv.includes("--write"))
  fs.writeFileSync(path.join(ROOT,MANIFEST),JSON.stringify(m,null,2)+"\n");
 process.stdout.write(JSON.stringify(m,null,2)+"\n");
}
module.exports={buildManifest,byteExactAttributeGaps,MANIFEST,ENTRIES,RUNTIME_DATA};
