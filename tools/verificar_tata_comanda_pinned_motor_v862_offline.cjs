"use strict";
const assert=require("node:assert/strict");
const {inspectPinnedMotorBytes}=require("./tata_comanda_pinned_motor_loader_v862_offline.cjs");
const {PACKAGING_SOURCE_BLOB_V63,PACKAGING_SOURCE_SHA256_V78}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
let n=0;
const check=(name,fn)=>{fn();n++;};
const reject=(raw,reason)=>{
 const r=inspectPinnedMotorBytes(raw);
 assert.equal(r.status,"HOLD");assert.equal(r.reason,reason);
 assert.equal(r.motor,null);assert.equal(r.blob_sha_verified,false);
 assert.equal(r.sha256_verified,false);assert.equal(r.print_authorized,false);
};
check("source blob pin is exact previously approved pin",()=>{
 assert.equal(PACKAGING_SOURCE_BLOB_V63,"3167c309f02a0ad5a84fb43043b8866e3bee873c");
});
check("source sha256 pin preserved",()=>{
 assert.equal(PACKAGING_SOURCE_SHA256_V78,
  "1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e");
});
check("bare SHA label cannot stand in for source bytes",()=>{
 reject(PACKAGING_SOURCE_BLOB_V63,"PINNED_MOTOR_BYTES_REQUIRED");
});
check("caller supplied executable object cannot be accepted",()=>{
 reject({packComanda(){},kitVerdict(){}},"PINNED_MOTOR_BYTES_REQUIRED");
});
check("missing bytes are refused",()=>{
 reject(undefined,"PINNED_MOTOR_BYTES_REQUIRED");
});
check("too short input denied before VM",()=>{
 reject(Buffer.from("fake"),"PINNED_MOTOR_BYTES_REQUIRED");
});
check("oversize input denied before VM",()=>{
 reject(Buffer.alloc(1024*1024+1),"PINNED_MOTOR_BYTES_REQUIRED");
});
check("fake executable bytes mismatch both private source pins",()=>{
 reject(Buffer.from("globalThis.TATAPackaging={packComanda(){return {}},kitVerdict(){return {}}};".repeat(3)),
  "PACKAGING_MOTOR_BYTES_DRIFT");
});
check("tampered engine-like payload never runs without exact digest",()=>{
 const raw=Buffer.from("globalThis.TATAPackaging={packComanda(){throw Error('SPY')},kitVerdict(){return {}}};".repeat(2));
 reject(raw,"PACKAGING_MOTOR_BYTES_DRIFT");
});
console.log("TATA_COMANDA_PINNED_MOTOR_V862="+n+"/"+n+
 " EXACT_BLOB_SHA256_REQUIRED UNTRUSTED_CALLER_DENIED NO_HOST NO_NETWORK NO_PRINT");
