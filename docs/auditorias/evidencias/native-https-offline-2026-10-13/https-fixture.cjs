"use strict";
const https=require("node:https"),fs=require("node:fs"),path=require("node:path");
const root=__dirname,expectedId="LAB-NATIVE-OFFLINE-20261013-E1",expectedKey="LAB-NATIVE-OFFLINE-20261013-IDEMP-1";
const counts=new Map();let requestCount=0,invalidCount=0;
const statsFile=path.join(root,"native-receipts.json");
function save(){fs.writeFileSync(statsFile,JSON.stringify({test_only:true,source_mode:"simulated",endpoint:"temporary_lab_tls",accepted_unique_events:counts.size,requests:requestCount,duplicates:Math.max(0,requestCount-counts.size),errors:invalidCount,event_ids:[...counts.keys()]},null,2));}
const server=https.createServer({key:fs.readFileSync(path.join(root,"server.key")),cert:fs.readFileSync(path.join(root,"server.crt")),minVersion:"TLSv1.2"},(req,res)=>{
 if(req.url==="/api/health"&&req.method==="GET"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,mode:"test",source_mode:"simulated",gps:false}));return;}
 if(req.url!=="/api/events/batch"||req.method!=="POST"){res.writeHead(404);res.end();return;}
 let str="";req.on("data",x=>{str+=x;if(str.length>18000)req.destroy();});
 req.on("end",()=>{try{
 const data=JSON.parse(str),arr=data.events;
 if(!Array.isArray(arr)||arr.length!==1)throw Error("expected_one_synthetic_event");
 const e=arr[0];
 if(e.event_id!==expectedId||e.idempotency_key!==expectedKey||e.command?.source_mode!=="simulated"||e.command?.unit_id!=="LAB-NATIVE-20261013")throw Error("not_lab_event");
 requestCount++;counts.set(e.event_id,true);save();
 const result={ok:true,results:[{event_id:e.event_id,ok:true}],simulated:true};
 res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(result));
 console.log("RECEIPT_VALIDATED",e.event_id,"UNIQUE",counts.size,"REQUESTS",requestCount);
 }catch(e){invalidCount++;save();res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({ok:false,error:"lab_fixture_rejected"}));console.log("RECEIPT_REJECTED",String(e.message).slice(0,100));}});
});
server.listen(5193,"127.0.0.1",()=>console.log("LAB_TLS_RECEIPT_LISTENING_LOOPBACK_ONLY"));
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
