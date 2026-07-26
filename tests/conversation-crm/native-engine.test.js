'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadFeatureFlags}=require('../../src/conversation-crm/native/feature-flags');
const {loadRuntimeCatalogs}=require('../../src/conversation-crm/native/catalogs/operational');
const {loadCanonicalCatalogs}=require('../../src/conversation-crm/native/catalogs/oracle');
const {extractPartyCandidates}=require('../../src/conversation-crm/native/engine');
const {createTestConversationEngine}=require('./helpers/native-test-engine');
const {createMigrationMap,BLOCK_IDS}=require('../../src/conversation-crm/native/migration');
const {loadPlaceholderRegistry,resolvePlaceholder}=require('../../src/conversation-crm/native/placeholders');
const {SYNTHETIC_FIXTURES}=require('../../src/conversation-crm/native/fixtures');
const {abuseReview,foodSafetyPolicy}=require('../../src/conversation-crm/native/policies');
const {composeResponse}=require('../../src/conversation-crm/native/response-composer');

const flags=loadFeatureFlags({file:'config/conversation-crm/native-flags.simulator.json'});const catalogs=loadRuntimeCatalogs();const oracle=loadCanonicalCatalogs();const engine=createTestConversationEngine({flags,operationalCatalog:catalogs});

test('as 51 intenções têm cenário canônico e são resolvidas pelo texto sem scenario_id',()=>{const covered=new Set();for(const scenario of oracle.scenarios.scenarios){const result=engine.analyze({content:scenario.input,context:{}});assert.equal(result.intent,scenario.intent);assert.equal(result.scenario_id,null);assert.notEqual(result.intent,'reclamação');covered.add(result.intent);}assert.equal(covered.size,51);assert.deepEqual(covered,new Set(catalogs.intents.intents.map((item)=>item.id)));});

test('migração cobre 35 de 35 blocos e preserva R05 e O02',()=>{const migration=createMigrationMap(catalogs);assert.equal(BLOCK_IDS.length,35);assert.equal(migration.covered.length,35);assert.ok(migration.map.get('R05').includes('reservation.large_group'));assert.ok(migration.map.get('O02').includes('occurrence.missing_item'));});

test('registro carrega 47 placeholders sem transformar fixture em fato institucional',()=>{const registry=loadPlaceholderRegistry(catalogs);assert.equal(registry.records.length,47);assert.equal(registry.implementation_blockers_open,0);assert.equal(registry.production_blockers_open,46);assert.equal(registry.records[46].preliminary_classification,'CONFIRMADO');const resolved=resolvePlaceholder(registry,'{{TATA_ADDRESS}}',{synthetic:true,value:'ENDERECO_SINTETICO'});assert.equal(resolved.status,'synthetic_fixture');assert.equal(resolved.institutional_fact,false);});

test('todas as fixtures declaram origem sintética recursivamente onde há registros',()=>{assert.equal(SYNTHETIC_FIXTURES.synthetic,true);for(const collection of [SYNTHETIC_FIXTURES.units,SYNTHETIC_FIXTURES.subjects,SYNTHETIC_FIXTURES.orders])for(const item of collection)assert.equal(item.synthetic,true);for(const item of SYNTHETIC_FIXTURES.orders[0].items)assert.equal(item.synthetic,true);});

for(const[message,size]of [['Somos 10',10],['Estamos em dez',10],['Mesa para 9',9],['Grupo de 12',12],['10 pessoas chegando',10]])test(`grupo grande nativo reconhece ${message}`,()=>{const result=engine.analyze({content:message,context:{}});assert.equal(result.intent,'reservation.large_group');assert.equal(result.entities.party_size.value,size);assert.equal(result.legacy_projection.primary_block,'R05');assert.equal(result.escalation,'E1');});

test('oito e sete não atravessam o limiar de grupo grande',()=>{assert.notEqual(engine.analyze({content:'Somos 8',context:{}}).intent,'reservation.large_group');assert.notEqual(engine.analyze({content:'Mesa para 7',context:{}}).intent,'reservation.large_group');});

test('grupo grande pergunta só o que falta e não expõe valor de nome',()=>{const result=engine.analyze({content:'Grupo de 12',context:{customer_name:'SYNTHETIC_NAME',arrival_estimate:'SYNTHETIC_WINDOW'}});assert.deepEqual(result.fields_missing,[]);assert.equal(JSON.stringify(result).includes('SYNTHETIC_NAME'),false);});

test('erro de escrita não inventa quantidade e múltiplas quantidades viram conflito',()=>{const typo=engine.analyze({content:'Somos deis pessoas',context:{}});assert.notEqual(typo.intent,'reservation.large_group');assert.deepEqual(extractPartyCandidates('Somos 10, talvez 12 pessoas'),[10,12]);const conflict=engine.analyze({content:'Somos 10, talvez 12 pessoas',context:{}});assert.equal(conflict.entities.party_size.state,'conflict');assert.equal(conflict.capability_id,'human.queue.create');assert.ok(conflict.fields_missing.includes('party_size'));});

for(const[message,intent]of [['Faltou meu refrigerante no pedido','occurrence.missing_item'],['Não veio a bebida','occurrence.missing_item'],['Esqueceram o shoyu','occurrence.missing_item'],['Veio sem sobremesa','occurrence.missing_item'],['Não mandaram o item','occurrence.missing_item'],['Veio um item errado','occurrence.wrong_item'],['A quantidade errada veio no pedido','occurrence.wrong_quantity'],['Minha personalização foi ignorada','occurrence.personalization_ignored']])test(`ocorrência específica prevalece em ${message}`,()=>{const result=engine.analyze({content:message,context:{}});assert.equal(result.intent,intent);assert.equal(result.legacy_projection.primary_block,'O02');assert.notEqual(result.intent,'delivery');});

test('item faltando mantém campos mínimos, H02 e zero oferta automática',()=>{const result=engine.analyze({content:'Faltou meu refrigerante no pedido',context:{}});assert.deepEqual(result.fields_missing,['order_reference','order_channel']);assert.equal(result.escalation,'E2');const response=composeResponse({classification:result,result:{status:'unknown'},handoff:{status:'confirmed'}});assert.equal(/credito|reembolso|cortesia/i.test(response.text),false);});

for(const[message,intent]of [['Encontrei cabelo no prato','occurrence.foreign_body'],['O alimento está com cheiro estranho','occurrence.quality'],['Tive reação alérgica','occurrence.allergen'],['Duas pessoas tiveram vômito e diarreia','occurrence.health_symptom']])test(`segurança alimentar aplica protocolo em ${message}`,()=>{const result=engine.analyze({content:message,context:{}});assert.equal(result.intent,intent);assert.equal(result.policies.food_safety.automatic_closure_blocked,true);assert.equal(result.policies.food_safety.diagnosis_allowed,false);assert.equal(result.policies.food_safety.quality_queue_required,true);});

test('revisão de abuso é silenciosa, proporcional e nunca bloqueia automaticamente',()=>{assert.equal(abuseReview({}).state,'normal');const review=abuseReview({duplicate_claim:true,chronology_conflict:true,evidence_conflict:true});assert.equal(review.state,'manual_review');assert.equal(review.customer_visible,false);assert.equal(review.automatic_block,false);});

test('compositor não transforma unknown em conclusão confirmada',()=>{const classification={intent:'waitlist.create',scenario_id:'T',ideal_response:'Sua entrada foi confirmada.',fields_missing:[]};const response=composeResponse({classification,result:{status:'unknown'},handoff:null});assert.equal(/confirmada/i.test(response.text),false);assert.equal(response.status_reflected,'unknown');});
