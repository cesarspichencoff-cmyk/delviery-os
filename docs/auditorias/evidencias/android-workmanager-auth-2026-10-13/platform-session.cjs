"use strict";
const fs=require("node:fs"),https=require("node:https"),path=require("node:path"),crypto=require("node:crypto");
const root=__dirname,token="test-only-"+crypto.randomBytes(15).toString("hex");
const stats={source_mode:"simulated",platform_fake:true,session_ok:0,queue_authorized:0,queue_missing_token:0,location_points_requests:0,invalid:0};
const save=()=>fs.writeFileSync(path.join(root,"platform-stats.json"),JSON.stringify(stats,null,2));
const tls={key:fs.readFileSync(path.join(root,"server.key")),cert:fs.readFileSync(path.join(root,"server.crt")),minVersion:"TLSv1.2"};
const server=https.createServer(tls,(req,res)=>{
 const respond=(code,body)=>{res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(body));};
 if(req.url==="/api/device/session"&&req.method==="POST"){
  let buffer="";req.on("data",x=>{buffer+=x;if(buffer.length>2048)req.destroy()});req.on("end",()=>{
   try{const j=JSON.parse(buffer);if(typeof j.device_id!=="string"||!j.device_id||typeof j.device_secret!=="string"||j.device_secret.length<32){stats.invalid++;save();return respond(403,{ok:false})}
   stats.session_ok++;save();return respond(200,{device_token:token,expires_in_s:14400,actor_id:"rid-WM-LAB"})}
   catch{stats.invalid++;save();return respond(400,{ok:false})}
  });return;
 }
 if(req.url==="/api/device/queue-depth"&&req.method==="POST"){
  if(req.headers.authorization!=="Bearer "+token){stats.queue_missing_token++;save();return respond(401,{ok:false})}
  stats.queue_authorized++;save();return respond(200,{ok:true,source_mode:"simulated"});
 }
 if(req.url==="/api/gps/batch"){stats.location_points_requests++;save();return respond(403,{ok:false})}
 return respond(404,{ok:false});
});
server.listen(8080,"127.0.0.1",()=>console.log("PLATFORM_FAKE_SESSION_TLS_LISTENING_8080_NO_LIVE"));
