"use strict";
// Pure fixture test for the native Reader preflight. No source files, OS
// services, network, printer, process or production records are accessed.
const assert=require("node:assert/strict");
const {timestamp,replay}=require("../../runtime/reporting/native_reader_shadow_gate_v2.cjs");
const valid=[
 "2026-11-03T18:30:00",
 "2026-11-03T18:30:00.0000000",
 "2026-11-03T18:30:00Z",
 "2026-11-03T18:30:00+00:00",
 "2026-11-03T18:30:00-00:00",
 "2026-11-03T18:30:00+13:59",
 "2026-11-03T18:30:00-13:59",
 "2026-11-03T18:30:00+14:00",
 "2026-11-03T18:30:00-14:00",
 "2028-02-29T18:30:00"
];
const invalid=[
 "2026-11-03T18:30:00+14:01",
 "2026-11-03T18:30:00+14:59",
 "2026-11-03T18:30:00-14:01",
 "2026-11-03T18:30:00-14:59",
 "2026-11-03T18:30:00+15:00",
 "2026-11-03T18:30:00-15:00",
 "2026-11-03T18:30:00+13:60",
 "2026-02-30T18:30:00",
 "2026-02-29T18:30:00",
 "2026-13-01T18:30:00",
 "2026-11-03T24:00:00",
 "2026-11-03T18:30:60",
 "2026-11-03T18:30:00.00000000",
 "2026-11-03T18:30:00+14:00extra"
];
let passed=0;
for(const value of valid){assert.equal(timestamp(value),true,"VALID:"+value);passed++;}
for(const value of invalid){assert.equal(timestamp(value),false,"INVALID:"+value);passed++;}
const blocked=replay({pairs:[{event:{order:{DTHRABERMESA:"2026-11-03T18:30:00+14:59",items:[],observation_rows:[]}},decision:{items:[]}}]});
assert.equal(blocked.state,"HOLD");
assert.equal(blocked.reason,"NATIVE_TIMESTAMP_OR_SHAPE_INVALID");
assert.equal(blocked.operationalEventEmissionAuthorized,false);
assert.equal(blocked.ordersPublishable,0);
passed++;
console.log("NATIVE_READER_TIMESTAMP_OFFSET_GATE_PASS "+passed+"/"+passed+" PURE_FIXTURES_ONLY");
