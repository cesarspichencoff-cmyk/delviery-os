/**
 * Q-026 SHADOW — a separate real Node process for the Product System HTTP
 * server. Do not run this as the main test. Each child has its own PG pools,
 * admission counter and JavaScript event loop, as in a multi-worker preview.
 */
import type { Server } from "node:http";
import { criarServidor } from "../../tools/product_system_server";

if (!process.send || !process.env.DELIVERYOS_DATABASE_URL ||
    process.env.Q026_MULTIPROCESS_CHILD !== "1") {
  console.error("Q026_MULTIPROCESS_CHILD_MUST_BE_FORKED");
  process.exit(78);
}
let servidor: Server | null = null;
let closing=false;
void (async () => {
  servidor=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
    servidor!.once("error",reject);
    servidor!.listen(0,"127.0.0.1",resolve);
  });
  const address=servidor.address();
  if (!address || typeof address==="string") throw Error("NO_TCP_ADDRESS");
  process.send!({ready:true,port:address.port,pid:process.pid});
  process.on("message",(x)=>{
    if (!x || typeof x!=="object" || (x as {op?:string}).op!=="stop" || closing)return;
    closing=true;
    servidor!.close(()=>process.exit(0));
  });
})().catch((e)=>{
  console.error("Q026_MULTIPROCESS_CHILD_ERROR",e);
  process.send?.({ready:false,error:String(e)});
  process.exitCode=1;
});
