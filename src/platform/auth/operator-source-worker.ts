import {Worker} from 'node:worker_threads';
import {join,isAbsolute} from 'node:path';

/** One bounded, disposable worker per read. No request queue, cached orders or credentials.
 * appRoot selects our fixed implementation, never a path from an HTTP request/config field.
 */
export function createIsolatedTataReader(cfg:{appRoot:string;root:string;scope:unknown;maxAgeMs:number;timeoutMs?:number}) {
  const timeoutMs=cfg.timeoutMs??4000;
  if(!isAbsolute(cfg.appRoot)||!isAbsolute(cfg.root)||!Number.isSafeInteger(timeoutMs)||timeoutMs<50||timeoutMs>10000)throw Error('SOURCE_WORKER_CONFIG_INVALID');
  const file=join(cfg.appRoot,'runtime/reporting/copiloto_tata_worker_v1.cjs');
  const source=structuredClone({root:cfg.root,scope:cfg.scope,maxAgeMs:cfg.maxAgeMs});
  let busy=false;
  return {read:async(now:string):Promise<unknown>=>{
    if(busy)throw Error('SOURCE_READER_BUSY');busy=true;
    let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    try{
      worker=new Worker(file,{workerData:{...source,now},
        // Workers must not inherit a parent test preload or debugger configuration.
        execArgv:[],resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
      return await new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('SOURCE_READ_TIMEOUT')),timeoutMs);
        worker!.once('message',message=>{
          if(message?.ok!==true)return reject(Error('SOURCE_WORKER_FAILED'));
          resolve(message.data);
        });
        worker!.once('error',()=>reject(Error('SOURCE_WORKER_FAILED')));
        worker!.once('exit',()=>reject(Error('SOURCE_WORKER_EXITED')));
      });
    }finally{
      if(timer)clearTimeout(timer);
      // Keep the slot reserved until termination: timed-out work cannot accumulate.
      try{await worker?.terminate();}finally{busy=false;}
    }
  }};
}
