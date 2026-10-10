/** Isolated child-process A/B driver. Only synthetic disposable PostgreSQL16. */
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const {resolve}=require("node:path");
if(!process.env.DELIVERYOS_PG_URL){
 console.error("Q026_CARDINALITY_PG_REQUIRED");
 process.exit(78);
}
const script=resolve("tests/product/run-q026-high-trip-cardinality-child.ts");
function run(mode,n){
 return new Promise((done,fail)=>{
  const proc=spawn(process.execPath,["--import","tsx",script],{
   cwd:process.cwd(),
   env:{...process.env,Q026_CARDINALITY_MODE:mode,Q026_CARDINALITY_N:String(n)},
   stdio:["ignore","pipe","pipe"]
  });
  let stdout="",stderr="";
  proc.stdout.on("data",b=>{stdout+=String(b)});
  proc.stderr.on("data",b=>{stderr+=String(b)});
  const killer=setTimeout(()=>proc.kill("SIGKILL"),240000);
  proc.once("error",e=>{clearTimeout(killer);fail(e)});
  proc.once("close",code=>{
   clearTimeout(killer);
   if(code!==0)return fail(Error("CASE_"+mode+"_"+n+"_EXIT_"+code+" "+stderr.slice(-1800)));
   const found=stdout.split("\n").find(x=>x.startsWith("Q026_CARDINALITY_SHADOW_CASE "));
   if(!found)return fail(Error("CASE_MISSING_EVIDENCE "+stdout.slice(-1600)));
   try{done(JSON.parse(found.slice("Q026_CARDINALITY_SHADOW_CASE ".length)))}
   catch(e){fail(e)}
  });
 });
}
void(async()=>{
 for(const n of [30000,120000]){
  const canonical=await run("baseline",n);
  const compact=await run("incremental",n);
  assert.equal(canonical.distinct_trips,n);
  assert.equal(compact.distinct_trips,n);
  assert.equal(canonical.presentation_digest,compact.presentation_digest,
    "ERROR: incremental viewmodel/model diverged with high trip cardinality");
  console.log("Q026_HIGH_CARDINALITY_PARITY_PASS "+JSON.stringify({
   distinct_trips:n,events:n,one_event_each:true,
   digest_match:true,digest:compact.presentation_digest,
   baseline_peak_process_mib:canonical.peak_process_mib,
   incremental_peak_process_mib:compact.peak_process_mib,
   baseline_peak_delta_mib:+(canonical.peak_process_mib-canonical.peak_before_reader_mib).toFixed(2),
   incremental_peak_delta_mib:+(compact.peak_process_mib-compact.peak_before_reader_mib).toFixed(2),
   baseline_read_ms:canonical.read_wall_ms,
   incremental_read_ms:compact.read_wall_ms,
   boundary:"two independent Node processes with equivalent PG16 fixture; no performance superiority asserted"
  }));
 }
})().catch(e=>{console.error("Q026_HIGH_CARDINALITY_SHADOW_FAILED",e);process.exitCode=1});
