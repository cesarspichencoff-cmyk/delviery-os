'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {PROJECT_ROOT,resolveProjectRelative}=require('../config');
const {nativeError}=require('./errors');
const {deepFreeze}=require('./catalogs');

function validTimeZone(value){try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date(0));return true;}catch{return false;}}
function validateSimulatorConfig(raw){if(!raw||raw.schema_version!=='conversation-native-simulator-v1'||raw.synthetic!==true)throw nativeError('SIMULATOR_CONFIG_INVALID');if(raw.seed!=='TATA-SIM-V1'||raw.store_time_zone!=='America/Sao_Paulo'||raw.initial_clock!=='2026-07-01T12:00:00-03:00')throw nativeError('SIMULATOR_CANONICAL_CONFIG_MISMATCH');if(!validTimeZone(raw.store_time_zone)||Number.isNaN(new Date(raw.initial_clock).getTime()))throw nativeError('SIMULATOR_CONFIG_INVALID');for(const key of ['reset_isolated_scenarios','preserve_multi_turn_sequences','deterministic_event_order'])if(raw[key]!==true)throw nativeError('SIMULATOR_CONFIG_INVALID');for(const key of ['real_drivers_enabled','real_read_enabled','real_write_enabled'])if(raw[key]!==false)throw nativeError('REAL_DRIVER_FLAGS_PROHIBITED');return deepFreeze({...raw});}
function loadSimulatorConfig(options={}){const projectRoot=path.resolve(options.projectRoot||PROJECT_ROOT);const file=resolveProjectRelative(options.file||'config/conversation-crm/native-simulator.example.json',{projectRoot,label:'native_simulator_config'});let raw;try{raw=JSON.parse(fs.readFileSync(file.resolved,'utf8'));}catch{throw nativeError('SIMULATOR_CONFIG_INVALID');}const config=validateSimulatorConfig(raw);return deepFreeze({...config,config_file:file,scenario_catalog_path:resolveProjectRelative(config.scenario_catalog,{projectRoot,label:'scenario_catalog'}),runtime_path:resolveProjectRelative(config.runtime_dir,{projectRoot,label:'runtime_dir'})});}

module.exports={validTimeZone,validateSimulatorConfig,loadSimulatorConfig};

