"use strict";
/**
 * Exact-byte loader for the previously approved Academy packaging motor.
 * In-memory only. No source fetch, global install, SQL, service or printer.
 * A supplied SHA string or JavaScript function is NOT motor provenance.
 */
const crypto=require("node:crypto"),vm=require("node:vm");
const {PACKAGING_SOURCE_BLOB_V63,PACKAGING_SOURCE_SHA256_V78}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
function inspectPinnedMotorBytes(value){
 const deny=(reason)=>({status:"HOLD",reason,motor:null,
  blob_sha_verified:false,sha256_verified:false,print_authorized:false});
 if(!Buffer.isBuffer(value)||value.length<64||value.length>1024*1024)
  return deny("PINNED_MOTOR_BYTES_REQUIRED");
 const blob=crypto.createHash("sha1")
  .update(Buffer.from("blob "+value.length+"\0")).update(value).digest("hex");
 const digest=crypto.createHash("sha256").update(value).digest("hex");
 if(blob!==PACKAGING_SOURCE_BLOB_V63||digest!==PACKAGING_SOURCE_SHA256_V78)
  return deny("PACKAGING_MOTOR_BYTES_DRIFT");
 try{
  const sandbox=Object.create(null);
  vm.runInNewContext(value.toString("utf8"),sandbox,{timeout:1500});
  const api=sandbox.TATAPackaging;
  if(typeof api?.packComanda!=="function"||typeof api?.kitVerdict!=="function")
   return deny("PINNED_MOTOR_EXPORT_INVALID");
  return {status:"PINNED_EXACT_BYTES",reason:null,
   motor:{packComanda:api.packComanda,kitVerdict:api.kitVerdict},
   blob_sha_verified:true,sha256_verified:true,print_authorized:false};
 }catch{return deny("PINNED_MOTOR_EXECUTION_BLOCKED");}
}
module.exports={inspectPinnedMotorBytes};
