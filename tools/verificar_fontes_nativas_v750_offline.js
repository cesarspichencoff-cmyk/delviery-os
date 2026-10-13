"use strict";
// Independent V7.50 byte decoder/golden, NO printer, port, spooler or file writing.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const source=fs.readFileSync(path.join(__dirname,"comandas_native_fonts_v750_offline.js"),"utf8");
assert.doesNotMatch(source,/\b(?:WritePrinter|OpenPrinter|StartDocPrinter|Get-Printer|Set-Printer|Start-Service|Restart-Service|lp|lpr|socket\.connect|net\.connect)\s*\(/i);
const app=require("./comandas_native_fonts_v750_offline.js");
const expectedSHA="E8FF2B0DA98577C1A25C9E0D61792C4B4BDE265D570989FBFE41BA05C8DDF5B9";
const result=app.proof(),data=result.bytes;
assert.equal(crypto.createHash("sha256").update(data).digest("hex").toUpperCase(),expectedSHA);
assert.equal(data.length,851);assert.equal(result.lines,19);
assert.deepEqual(app.encodeCp850("CONFERÊNCIA"),Buffer.from("434f4e464552d24e434941","hex"));
assert.deepEqual(app.encodeCp850("FINALIZAÇÃO"),Buffer.from("46494e414c495a4180c74f","hex"));
assert.deepEqual(app.encodeCp850("NÃO"),Buffer.from("4ec74f","hex"));
assert.deepEqual(app.encodeCp850("AC\u0327A\u0303O"),Buffer.from("4180c74f","hex"));
assert.throws(()=>app.encodeCp850("PEDIDO 🚨"),/UNREPRESENTABLE/);
assert.throws(()=>app.encodeCp850("\u001bPAUSA"),/UNREPRESENTABLE/);
assert.throws(()=>app.line("X".repeat(49)),/NO_TRUNCATE/);
assert.doesNotThrow(()=>app.line("X".repeat(48)));
assert.doesNotThrow(()=>app.line("X".repeat(64),{font:"B"}));
assert.throws(()=>app.line("X".repeat(65),{font:"B"}),/NO_TRUNCATE/);
function parse(p){
 let i=0;
 const expect=(...numbers)=>{for(const n of numbers){assert.equal(p[i++],n,"V750_COMMAND_BYTE_MISMATCH_"+(i-1))}};
 expect(27,116,2,27,97,0,29,33,0);
 let lines=[];
 for(let ix=0;ix<19;ix++){
  expect(27,77);
  const font=p[i++];
  assert.ok(font===0||font===1);
  expect(27,69);
  const emph=p[i++];assert.ok(emph===0||emph===1);
  expect(27,71);
  const strike=p[i++];assert.ok(strike===0||strike===1);
  assert.ok(!(emph&&strike),"NO_UNCONTROLLED_COMBINED_DOUBLE_PASS");
  const begin=i;
  while(i<p.length&&p[i]!==10){
   assert.ok(p[i]>=32,"CONTROL_CHAR_IN_TEXT");
   i++;if(i-begin>64)throw Error("LINE_GT_64");
  }
  assert.ok(i<p.length,"MISSING_LF");
  const line=p.subarray(begin,i);
  assert.ok(line.length>0 && line.length<=(font===0?48:64),"FONT_LINE_WIDTH_OVERFLOW");
  expect(10);
  lines.push({font,emph,strike,bytes:Buffer.from(line)});
 }
 expect(27,69,0,27,71,0,27,77,0,29,33,0,27,116,0,27,97,0);
 assert.equal(i,p.length,"UNEXPECTED_TRAILING_COMMANDS");
 const chars=Buffer.concat(lines.map(x=>x.bytes));
 assert.ok(chars.includes(Buffer.from("URAMAKI FICTICIO EXTRA ESPECIAL")));
 assert.ok(chars.includes(Buffer.from("NAO PRODUZIR")));
 assert.ok(chars.includes(Buffer.from("TEKNISA 0000000000")));
 assert.ok(chars.includes(Buffer.from("ACENTOS: N")));
 assert.ok(chars.includes(Buffer.from([0x4e,0xc7,0x4f])),"CP850_NAO_NOT_FOUND");
 assert.ok(lines.some(x=>x.emph===1&&x.strike===0));
 assert.ok(lines.some(x=>x.strike===1&&x.emph===0));
 assert.equal(lines.filter(x=>x.bytes.includes(Buffer.from("URAMAKI"))).length,2);
 return lines;
}
const lines=parse(data);
let mutations=0;
for(const [at,value] of [[2,1],[4,2],[9,8],[14,2],[21,0],[data.length-1,1]]){
 const b=Buffer.from(data);b[at]=value;
 assert.throws(()=>parse(b));mutations++;
}
if(process.argv[2]==="--fixture"){
 assert.equal(process.argv.length,4);
 const dir=path.resolve(process.argv[3]);
 assert.equal(path.basename(dir),"calibration-fictitious-v741");
 const meta=JSON.parse(fs.readFileSync(path.join(dir,"manifest-v741.json"),"utf8"));
 assert.equal(meta.real_order,false);assert.equal(meta.print_authorized,false);
 const file=path.join(dir,"v750-native-font-A-vs-B-offline.bin");
 const observed=fs.readFileSync(file);
 assert.ok(observed.equals(data),"SYNTHETIC_FIXTURE_BYTES_NOT_EQUAL");
}else assert.equal(process.argv.length,2);
console.log(JSON.stringify({schema:"tata.comandas.native-font-independent-v750",
 status:"PASS",payload_bytes:data.length,lines:lines.length,
 cp850_accent_reversible:true,emphasized_lines:lines.filter(x=>x.emph).length,
 double_strike_lines:lines.filter(x=>x.strike).length,
 mutation_rejections:mutations,unmodified_output_sha256:expectedSHA,
 physical_print:false,spooler_write:false,driver_or_teknisa_change:false}));
