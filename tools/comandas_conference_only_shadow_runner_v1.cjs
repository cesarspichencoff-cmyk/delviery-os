"use strict";
/**
 * Read-only conference-only wrapper around the EXISTING sanitized pair runner.
 * Intended location in repository: tools/
 * No printer, number writer, SQL, service or network APIs are imported here.
 *
 * Usage: node tools/comandas_conference_only_shadow_runner_v1.cjs
 *    <ABS_EVENT_JSON> <ABS_DECISION_JSON> [<ABS_EXACT_HUMAN_NOTE_CLAIM_JSON>]
 *
 * The underlying runner validates bundle identity and reads archived evidence.
 * The derived result reveals only a conference descriptor or HOLD.
 * Never use this wrapper as evidence of authorization for an operational effect.
 */
const {run}=require("./comandas_shadow_offline_run_v1.cjs");
const {projectConferenceFromSanitizedReplayV1}=require("./conference_only_from_sanitized_v1.cjs");
function runConferenceOnlyV1(eventFile,decisionFile,reviewFile) {
 const verifiedSanitized=run(eventFile,decisionFile,reviewFile);
 return projectConferenceFromSanitizedReplayV1(verifiedSanitized);
}
if(require.main===module){
 try{
  if(process.argv.length!==4 && process.argv.length!==5)
   throw Error("EXACT_EVENT_DECISION_OPTIONAL_CLAIM_PATHS_REQUIRED");
  const out=runConferenceOnlyV1(process.argv[2],process.argv[3],process.argv[4]);
  process.stdout.write(JSON.stringify(out)+"\n");
  if(out.status==="HOLD")process.exitCode=3;
 }catch(e){
  // Only bounded error CODES, never paths, full user-supplied messages or data.
  process.stderr.write("CONFERENCE_ONLY_SHADOW_HOLD\n");
  process.exitCode=4;
 }
}
module.exports={runConferenceOnlyV1};
