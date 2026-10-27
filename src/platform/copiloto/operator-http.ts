import type {IncomingMessage, ServerResponse} from 'node:http';
import {createNeonOperatorSessions, operatorCredential} from '../auth/neon-operator-session';
import {createOperatorReadAuthority, OperatorReadGrant} from '../auth/operator-read-authority';

/** Review-only composition. Does not listen, configure a provider, approve users or install routes.
 * readFeed and assets are server-owned; never resolve them from request parameters.
 */
export function createOperatorHttp<T>(cfg: {
  sessions: ReturnType<typeof createNeonOperatorSessions>;
  lookupGrant: (issuer: string, subject: string, unit: string) => Promise<OperatorReadGrant|null>;
  readFeed: (unit: string) => Promise<T>; now: () => number;
  assets: {html: string; js: string; css: string};
}) {
  const sessions=cfg.sessions, origin=sessions.audience, host=new URL(origin).host;
  const read=createOperatorReadAuthority({issuer:sessions.issuer,audience:origin,unitId:'ITAIM',
    verifyIdentity:sessions.verifyIdentity,lookupGrant:cfg.lookupGrant,read:cfg.readFeed,now:cfg.now});
  const assets=new Map([
    ['/copiloto/pedidos/',{body:cfg.assets.html,type:'text/html; charset=utf-8'}],
    ['/copiloto/pedidos/app.js',{body:cfg.assets.js,type:'text/javascript; charset=utf-8'}],
    ['/copiloto/pedidos/app.css',{body:cfg.assets.css,type:'text/css; charset=utf-8'}],
  ]);
  return async (req:IncomingMessage,res:ServerResponse) => {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const json=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
    const deny=(status:number,code:string)=>json(status,{ok:false,code,data:null});
    try {
      if(req.headers.host!==host)return deny(403,'HOST_FORBIDDEN');
      if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return deny(403,'ORIGIN_FORBIDDEN');
      const route=req.url??'',asset=assets.get(route);
      if(asset){if(req.method!=='GET')return deny(405,'METHOD_NOT_ALLOWED');res.setHeader('Content-Type',asset.type);res.end(asset.body);return;}
      if(route==='/api/copiloto/orders'){
        if(req.method!=='GET')return deny(405,'METHOD_NOT_ALLOWED');
        const result=await read(operatorCredential(req.headers.cookie),'ITAIM');
        return json(result.status,{ok:result.ok,code:result.code,data:result.data});
      }
      if(!['/api/operator/login/begin','/api/operator/login/complete','/api/operator/logout'].includes(route))return deny(404,'NOT_FOUND');
      if(req.method!=='POST')return deny(405,'METHOD_NOT_ALLOWED');
      if(req.headers.origin!==origin)return deny(403,'ORIGIN_FORBIDDEN');
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return deny(415,'JSON_REQUIRED');
      let body:Record<string,unknown>;
      try{body=await boundedJson(req);}catch{return deny(400,'REQUEST_INVALID');}
      const result=route.endsWith('/begin')?await sessions.begin(req.headers.origin,body.email):
        route.endsWith('/complete')?await sessions.complete(req.headers.origin,req.headers.cookie,body.otp):
        sessions.logout(req.headers.origin,req.headers.cookie);
      if(result.setCookies.length)res.setHeader('Set-Cookie',result.setCookies);
      // Credentials belong only in HttpOnly headers, never in the JSON payload.
      json(result.status,{ok:result.ok,code:result.code});
    }catch{if(!res.writableEnded)deny(503,'SERVICE_UNAVAILABLE');}
  };
}
function boundedJson(req:IncomingMessage):Promise<Record<string,unknown>> {
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];let size=0,done=false;
    const finish=(error?:Error,value?:Record<string,unknown>)=>{
      if(done)return;done=true;clearTimeout(timer);
      req.off('data',data);req.off('end',end);req.off('aborted',abort);req.off('error',abort);
      if(error){req.resume();reject(error);}else resolve(value!);
    };
    const data=(chunk:Buffer)=>{size+=chunk.length;if(size>2048)finish(Error('BODY_LIMIT'));else chunks.push(chunk);};
    const abort=()=>finish(Error('BODY_ABORTED'));
    const end=()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error();finish(undefined,value);
    }catch{finish(Error('BODY_INVALID'));}};
    const timer=setTimeout(()=>finish(Error('BODY_TIMEOUT')),5000);timer.unref();
    req.on('data',data);req.once('end',end);req.once('aborted',abort);req.once('error',abort);
  });
}
