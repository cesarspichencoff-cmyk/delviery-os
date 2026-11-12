"use strict";
/**
 * Builds a closed, byte-verifiable offline SHADOW bundle.
 * No printer, service, host, sequence, SQL or deployment actions.
 * The 34-file candidate is NOT changed. Compiled dependencies are sealed separately.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {builtinModules}=require("node:module");
const ROOT=path.resolve(__dirname,"..");
const CANDIDATE="docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json";
const RUNNER="tools/comandas_shadow_offline_run_v1.cjs";
const BUILDER="tools/comandas_shadow_bundle_v1.cjs";
const CONFERENCE_RUNNER="tools/comandas_conference_only_shadow_runner_v1.cjs";
const CONFERENCE_ADAPTER="tools/conference_only_from_sanitized_v1.cjs";
const CONFERENCE_EXTRAS=Object.freeze([CONFERENCE_RUNNER,CONFERENCE_ADAPTER]);
const SCHEMA="tata.comandas.shadow-executable-bundle.v1";
const builtin=new Set([...builtinModules,...builtinModules.map(s=>"node:"+s)]);
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const blob=b=>crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob "+b.length+"\0"),b])).digest("hex");
function safeRel(p){
 if(typeof p!=="string"||!/^[A-Za-z0-9_./-]+$/.test(p)||p.startsWith("/")||
 p.split("/").some(s=>s===".."||s==="."||s===""))throw Error("UNSAFE_RELATIVE_PATH");
 return p;
}
function disk(root,rel){
 const p=path.resolve(root,...safeRel(rel).split("/"));
 if(!p.startsWith(path.resolve(root)+path.sep))throw Error("PATH_ESCAPE");
 return p;
}
function readCandidate(){
 const candidateBytes=fs.readFileSync(disk(ROOT,CANDIDATE));
 const m=JSON.parse(candidateBytes.toString("utf8"));
 if(m.scope!=="SHADOW_NATIVE_CHAIN_NO_PRINT"||m.code?.length!==26||m.runtime_data?.length!==8)
  throw Error("CANDIDATE_MANIFEST_UNEXPECTED");
 if(Object.values(m.effects||{}).some(v=>v!==false))throw Error("CANDIDATE_EFFECTS_NOT_FALSE");
 const all=[...m.code,...m.runtime_data],seen=new Set();
 for(const e of all){
  safeRel(e.path);
  if(seen.has(e.path))throw Error("CANDIDATE_DUPLICATE");
  seen.add(e.path);
  const b=fs.readFileSync(disk(ROOT,e.path));
  if(b.length!==e.bytes||blob(b)!==e.git_blob)throw Error("CANDIDATE_DRIFT:"+e.path);
 }
 return {m,all,candidate_manifest_sha256:sha(candidateBytes)};
}
function depPath(from,req){
 if(builtin.has(req))return null;
 if(!req.startsWith("."))throw Error("EXTERNAL_DEPENDENCY:"+req);
 const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),req));
 for(const ext of ["",".js",".json",".cjs"]){
  const rel=base+ext;
  if(rel.startsWith("..")||path.isAbsolute(rel))throw Error("IMPORT_ESCAPES_BUNDLE");
  try{const stat=fs.statSync(disk(ROOT,rel));if(stat.isFile())return rel;}catch(e){
   if(e.code!=="ENOENT")throw e;
  }
 }
 throw Error("UNRESOLVED_DEPENDENCY:"+from+"->"+req);
}
function compiledClosure(seed,already){
 const pending=[...seed],added=new Set(),scanned=new Set();
 while(pending.length){
  const rel=pending.pop();if(scanned.has(rel))continue;scanned.add(rel);
  const full=disk(ROOT,rel);
  if(!fs.existsSync(full))throw Error("BUILD_NOT_COMPILED:"+rel);
  if(!/\.(?:cjs|js)$/.test(rel))continue;
  const src=fs.readFileSync(full,"utf8");
  const re=/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for(const found of src.matchAll(re)){
   const imported=depPath(rel,found[1]);
   if(!imported)continue;
   if(!already.has(imported)&&!added.has(imported)){
    if(!imported.startsWith("dist/"))throw Error("UNPINNED_RUNTIME_DEPENDENCY:"+imported);
    added.add(imported);
   }
   pending.push(imported);
  }
 }
 return [...added].sort();
}
function entryFor(root,rel){
 const b=fs.readFileSync(disk(root,rel));
 return {path:rel,bytes:b.length,git_blob:blob(b),sha256:sha(b)};
}
function verify(root){
 const loc=disk(root,"shadow-bundle.manifest.json");
 const m=JSON.parse(fs.readFileSync(loc,"utf8"));
 if(m.schema!==SCHEMA||m.source_baseline_commit!=="4d660808f73e611023c30e71ac0f86e6c5db8833"||
 !/^[a-f0-9]{64}$/.test(m.candidate_manifest_sha256)||
 m.candidate_files!==34||m.conference_runner!==CONFERENCE_RUNNER||
 m.effects?.print!==false||m.effects?.operational_write!==false)
  throw Error("SHADOW_BUNDLE_SCHEMA_OR_SCOPE_CHANGED");
 const seen=new Set();
 for(const e of m.files){
  if(seen.has(e.path))throw Error("BUNDLE_DUPLICATE");
  seen.add(e.path);
  const b=fs.readFileSync(disk(root,e.path));
  if(b.length!==e.bytes||blob(b)!==e.git_blob||sha(b)!==e.sha256)
   throw Error("BUNDLE_FILE_DRIFT:"+e.path);
 }
 for(const rel of CONFERENCE_EXTRAS)if(!seen.has(rel))
  throw Error("CONFERENCE_EXCLUDED_FROM_BUNDLE:"+rel);
 const actual=[];
 function walk(base){
  for(const v of fs.readdirSync(base,{withFileTypes:true})){
   const p=path.join(base,v.name);
   if(v.isSymbolicLink())throw Error("BUNDLE_SYMLINK_FORBIDDEN");
   if(v.isDirectory())walk(p);
   else if(v.isFile())actual.push(path.relative(root,p).replace(/\\/g,"/"));
  }
 }
 walk(root);
 const expected=new Set([...seen,"shadow-bundle.manifest.json"]);
 if(actual.length!==expected.size||actual.some(x=>!expected.has(x)))throw Error("BUNDLE_EXTRA_OR_MISSING");
 return {schema:m.schema,files_verified:m.files.length,candidate_files:m.candidate_files,
  compiled_files:m.compiled_files,entry_runner:RUNNER,
  conference_runner:CONFERENCE_RUNNER,effects:m.effects,
  candidate_manifest_sha256:m.candidate_manifest_sha256,
  manifest_sha256:sha(fs.readFileSync(loc))};
}
function build(out){
 if(!path.isAbsolute(out)||fs.existsSync(out))throw Error("OUTPUT_MUST_BE_NEW_ABSOLUTE_DIR");
 const {all,candidate_manifest_sha256}=readCandidate();
 if(!fs.existsSync(disk(ROOT,RUNNER)))throw Error("RUNNER_MISSING");
 const candidatePaths=all.map(e=>e.path),existing=new Set([...candidatePaths,RUNNER,BUILDER,...CONFERENCE_EXTRAS]);
 const compiled=compiledClosure([...candidatePaths,RUNNER,BUILDER,...CONFERENCE_EXTRAS],existing);
 const files=[...candidatePaths,...compiled,RUNNER,BUILDER,...CONFERENCE_EXTRAS].sort();
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const rel of files){
   const target=disk(out,rel);
   fs.mkdirSync(path.dirname(target),{recursive:true});
   fs.copyFileSync(disk(ROOT,rel),target);
  }
  const manifest={schema:SCHEMA,source_baseline_commit:"4d660808f73e611023c30e71ac0f86e6c5db8833",
   candidate_manifest_sha256,candidate_files:34,compiled_files:compiled.length,runner:RUNNER,
   conference_runner:CONFERENCE_RUNNER,
   effects:{print:false,operational_write:false,service_change:false,sql:false,sequence_write:false},
   files:files.map(rel=>entryFor(out,rel))};
  fs.writeFileSync(disk(out,"shadow-bundle.manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  const proof=verify(out);
  return {status:"BUNDLE_BUILT_VERIFIED",...proof};
 }catch(e){fs.rmSync(out,{force:true,recursive:true});throw e}
}
if(require.main===module){
 try{
  const mode=process.argv[2],target=process.argv[3];
  if(!target||!path.isAbsolute(target)||!["build","verify"].includes(mode))throw Error("USAGE_BUILD_OR_VERIFY_WITH_ABSOLUTE_PATH");
  const r=mode==="build"?build(target):{status:"BUNDLE_VERIFIED",...verify(target)};
  process.stdout.write(JSON.stringify(r)+"\n");
 }catch(e){process.stderr.write("SHADOW_BUNDLE_HOLD="+e.message+"\n");process.exitCode=1;}
}
module.exports={build,verify,SCHEMA};
