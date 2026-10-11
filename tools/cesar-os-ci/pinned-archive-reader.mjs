// READ ONLY. Verifies one pinned public GitHub archive via Contents API before any future ingest.
// Integrity + authenticated GitHub HTTPS fetch is NOT private D1 ingest/receipt attestation.
import {requestJson} from './snapshot.mjs';
import {validateArchive,gitBlobSha,REPO,SOURCE,SNAPSHOT_BRANCH} from './archive-consumer.mjs';
const PATH=/^ci-snapshots\/deliveryos\/archive\/\d{4}\/\d{2}\/\d{2}\/\d{8}T\d{9}Z\.json$/;
const SHA=/^[a-f0-9]{40}$/;
const API='https://api.github.com/repos/'+REPO;
const fail=m=>{throw Error(m)};

export async function readPinnedArchive(token,archivePath,{fetchFn=fetch}={}){
 if(typeof token!=='string'||token.length<30||!PATH.test(archivePath||''))
   fail('pinned_archive_request_invalid');
 const result=await requestJson(API+'/contents/'+archivePath+'?ref='+SNAPSHOT_BRANCH,
   {token,method:'GET',fetchFn});
 if(result.status!==200)fail('pinned_archive_not_found');
 const record=result.value;
 if(record?.type!=='file'||record.path!==archivePath||
   record.encoding!=='base64'||!SHA.test(record.sha||'')||
   typeof record.content!=='string'||record.content.length>140000)
   fail('pinned_archive_response_invalid');
 const base64=record.content.replace(/[\r\n]/g,'');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||
    base64.length===0||base64.length%4!==0)
   fail('pinned_archive_base64_invalid');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length<1||bytes.length>100000||bytes.toString('base64')!==base64)
   fail('pinned_archive_bytes_invalid');
 if(record.size!==undefined&&record.size!==bytes.length)
   fail('pinned_archive_reported_size_mismatch');
 if(gitBlobSha(bytes)!==record.sha)
   fail('pinned_archive_blob_mismatch');
 let snapshot;
 try{snapshot=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{fail('pinned_archive_json_invalid');}
 const v=validateArchive(snapshot,archivePath,{rawBytes:bytes});
 return {
   schema:'cesar-os-pinned-github-archive-read-v1',
   source_id:SOURCE,archive_path:archivePath,
   snapshot_sha256:v.hash,git_blob_sha:v.git_blob_sha,
   record_count:snapshot.record_count,rawBytes:bytes,snapshot,
   verified_via:'GITHUB_CONTENTS_API_FIXED_ORIGIN',
   private_ingest_performed:false,
   archive_verification:'GITHUB_BLOB_READ_VERIFIED_NOT_INGESTED',
   external_effect_authorized:false
 };
}
