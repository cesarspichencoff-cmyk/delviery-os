'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {PATTERNS}=require('./privacy');
const {nativeError}=require('./errors');

const SECRET_FILE=/^(?:\.env|.*\.(?:pem|key|p12|pfx)|credentials?\..*|cookies?\..*|session\..*)$/i;
function scanText(text){const types=[];for(const[type,pattern]of PATTERNS){pattern.lastIndex=0;if(pattern.test(text))types.push(type);}return types;}
function scanTree(root){const resolved=path.resolve(root);if(!fs.existsSync(resolved))return Object.freeze({root_label:path.basename(resolved),files:0,findings:[],passed:true});const findings=[];let files=0;const visit=(directory)=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);const relative=path.relative(resolved,full).split(path.sep).join('/');if(entry.isDirectory())visit(full);else{files+=1;if(SECRET_FILE.test(entry.name))findings.push({relative_path:relative,types:['secret_file_name']});const buffer=fs.readFileSync(full);if(buffer.includes(0))continue;const types=scanText(buffer.toString('utf8'));if(types.length)findings.push({relative_path:relative,types});}}};visit(resolved);return Object.freeze({root_label:path.basename(resolved),files,findings:Object.freeze(findings),passed:findings.length===0});}
function assertTreeSafe(root){const result=scanTree(root);if(!result.passed)throw nativeError('PRIVACY_SCAN_FAILED',{files:result.files,findings:result.findings.length});return result;}

module.exports={SECRET_FILE,scanText,scanTree,assertTreeSafe};
