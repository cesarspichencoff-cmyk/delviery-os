'use strict';
// Loaded inside the EXISTING Node consumer process, never a third service or a detached child.
// Install only through a separately approved, hash-pinned supervised operation.
let started=false;
function start(configPath,shouldStop){
 if(started)throw Error('SIDECAR_ALREADY_STARTED');
 if(typeof shouldStop!=='function')throw Error('LEGACY_STOP_REQUIRED');
 started=true;
 // Delay startup until the legacy module has finished loading. Any V3 failure stays isolated.
 const completed=Promise.resolve().then(()=>require('./run.cjs').main(configPath,{shouldStop}));
 completed.catch(()=>console.error('READER_V3_SHADOW_HELD'));return completed;
}
module.exports={start};
if(require.main===module)throw Error('SERVICE_EMBED_ONLY');
