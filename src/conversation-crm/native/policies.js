'use strict';

const FOOD_SAFETY_INTENTS=new Set(['occurrence.quality','occurrence.taste','occurrence.freshness','occurrence.allergen','occurrence.foreign_body','occurrence.health_symptom']);
const HEALTH_URGENT=/\b(dificuldade respiratoria|desmaio|inconsciente|dor intensa|sangue|muita sede|pouca urina)\b/i;
const ABUSE_STATES=Object.freeze(['normal','needs_confirmation','manual_review','high_risk_review']);

function foodSafetyPolicy(classification,message){if(!FOOD_SAFETY_INTENTS.has(classification.intent))return null;const urgent=classification.intent==='occurrence.health_symptom'&&HEALTH_URGENT.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g,''));return Object.freeze({protocol_id:'FOOD_SAFETY_PROTOCOL_V1',incident_state:'food_safety_open',escalations:urgent?['E4','E3']:['E3'],quality_queue_required:true,management_queue_required:true,traceability:'traceability_pending',related_case_check:'related_case_check_pending',health_guidance_required:classification.intent==='occurrence.health_symptom'||classification.intent==='occurrence.allergen',automatic_closure_blocked:true,diagnosis_allowed:false,causality_allowed:false,synthetic:true});}

function abuseReview(signals={}){let score=0;for(const key of ['order_missing','chronology_conflict','duplicate_claim','prior_compensation','promise_fulfilled','evidence_conflict','unusual_recurrence'])if(signals[key]===true)score+=1;const state=score>=5?'high_risk_review':score>=3?'manual_review':score>=1?'needs_confirmation':'normal';return Object.freeze({state,internal_only:true,customer_visible:false,automatic_block:false,human_decision_required:state!=='normal',signals_count:score,synthetic:true});}

module.exports={FOOD_SAFETY_INTENTS,ABUSE_STATES,foodSafetyPolicy,abuseReview};
