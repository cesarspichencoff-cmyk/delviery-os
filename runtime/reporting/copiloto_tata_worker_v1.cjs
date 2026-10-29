'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {readTataFileFeed}=require('./copiloto_tata_file_feed_v1.cjs');
if(!parentPort)throw Error('WORKER_ONLY');
try{parentPort.postMessage({ok:true,data:readTataFileFeed(workerData)});}
catch{parentPort.postMessage({ok:false});}
