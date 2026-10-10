// D1 cursor adapter candidate (NOT deployed). Requires explicit schema migration and opt-in.
import {checkpointShape,SOURCE} from './archive-consumer.mjs';
const MAX_BYTES=65000;
const assert=(condition,error)=>{if(!condition)throw Error(error);};

export const MIGRATION_SQL=`CREATE TABLE IF NOT EXISTS ci_archive_cursors (
  source_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
  cursor_json TEXT NOT NULL, updated_at TEXT NOT NULL
);`;

export class D1CursorStore {
  constructor(db){assert(db&&typeof db.prepare==='function','d1_binding_missing');this.db=db;}
  async load(){
    const row=await this.db.prepare('SELECT revision,cursor_json FROM ci_archive_cursors WHERE source_id=? LIMIT 1').bind(SOURCE).first();
    if(!row)return checkpointShape(null);
    let parsed;
    try{parsed=JSON.parse(row.cursor_json);}catch{throw Error('cursor_json_invalid');}
    const cursor=checkpointShape(parsed);
    assert(cursor.revision===Number(row.revision),'cursor_db_revision_mismatch');
    return cursor;
  }
  async compareAndSwap(expectedRevision,proposed,{now=new Date()}={}){
    const value=checkpointShape(proposed);
    assert(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0&&
      value.revision===expectedRevision+1,'cursor_cas_revision_invalid');
    const serialized=JSON.stringify(value);
    assert(new TextEncoder().encode(serialized).length<=MAX_BYTES,'cursor_cas_size_limit');
    const stamp=now.toISOString();
    let result;
    if(expectedRevision===0){
      result=await this.db.prepare('INSERT OR IGNORE INTO ci_archive_cursors(source_id,revision,cursor_json,updated_at) VALUES(?,?,?,?)')
        .bind(SOURCE,value.revision,serialized,stamp).run();
    }else{
      result=await this.db.prepare('UPDATE ci_archive_cursors SET revision=?,cursor_json=?,updated_at=? WHERE source_id=? AND revision=?')
        .bind(value.revision,serialized,stamp,SOURCE,expectedRevision).run();
    }
    if(result?.meta?.changes!==1)return {status:'CAS_CONFLICT',written:false};
    return {status:'COMMITTED',revision:value.revision,written:true};
  }
}

export function memoryCursorStore(){
  let state=checkpointShape(null);
  return {load:async()=>structuredClone(state),compareAndSwap:async(expected,proposed)=>{
    const next=checkpointShape(proposed);
    if(expected!==state.revision||next.revision!==expected+1)return {status:'CAS_CONFLICT',written:false};
    state=structuredClone(next);
    return {status:'COMMITTED',revision:state.revision,written:true};
  }};
}
