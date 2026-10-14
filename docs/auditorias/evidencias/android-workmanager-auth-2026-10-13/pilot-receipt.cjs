"use strict";
const fs=require("node:fs"),https=require("node:https"),path=require("node:path");
const root=__dirname;
const ids=new Set();let requests=0,invalid=0;
const save=()=>fs.writeFileSync(path.join(root,"pilot-receipt-stats.json"),JSON.stringify({fixture_only:true,source_mode:"simulated",unique:ids.size,requests,duplicates:requests-ids.size,invalid,event_ids:[...ids]},null,2));
const srv=https.createServer({key:fs.readFileSync(path.join(root,"server.key")),cert:fs.readFileSync(path.join(root,"server.crt")),minVersion:"TLSv1.2"},(req,res)=>{
 const send=(status,body)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(body))};
 if(req.url==="/api/policies"&&req.method==="GET")return send(200,{ok:true,term:{publishable:false},gps_capture_enabled:false});
 if(req.url==="/api/events/batch"&&req.method==="POST"){
  let s="";req.on("data",x=>{s+=x;if(s.length>10000)req.destroy()});req.on("end",()=>{
   try{const j=JSON.parse(s),events=j.events;
   if(!Array.isArray(events)||events.length!==1)throw Error("one only");
   const e=events[0];if(!/^LAB-WM-20261013-E[12]$/.test(e.event_id)||e.idempotency_key!==e.event_id+"-IDEMP"||e.command?.source_mode!=="simulated")throw Error("not synthetic");
   requests++;ids.add(e.event_id);save();console.log("LAB_EVENT_RECEIPT",e.event_id,"unique",ids.size,"requests",requests);
   return send(200,{ok:true,results:[{event_id:e.event_id,ok:true}]});
   }catch{invalid++;save();return send(400,{ok:false})}
  });return;
 }
 return send(404,{ok:false});
});
srv.listen(5193,"127.0.0.1",()=>console.log("LAB_PILOT_FIXTURE_TLS_5193_READY"));
