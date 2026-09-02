'use strict';

const { B2Pipeline } = require('./pipeline');
const { FunctionPlannerAdapter } = require('./planner-port');
const { canonicalHash } = require('./contract');

const PUBLICATION_BLOCKS = Object.freeze([
  /\b(?:fixture|oracle|gold|fonte sint[eé]tica|dado sint[eé]tico)\b/iu,
  /\b(?:senha|token|cookie|cpf|e-?mail|telefone)\b/iu
]);

function scanPublicText(text) {
  const value = String(text || '');
  const finding = PUBLICATION_BLOCKS.find((pattern) => pattern.test(value));
  return { accepted: !finding, reason: finding ? 'B2_LAB_PUBLIC_TEXT_BLOCKED' : null };
}

async function runFrozenConversation(options = {}) {
  const scenario = options.scenario || {};
  const candidatePlans = Array.isArray(options.candidate_plans) ? options.candidate_plans : [];
  const turns = Array.isArray(scenario.turns) ? scenario.turns : [];
  if (!scenario.scenario_id || turns.length !== candidatePlans.length) {
    throw Object.assign(new Error('B2_LAB_SCENARIO_PLAN_MISMATCH'), { code: 'B2_LAB_SCENARIO_PLAN_MISMATCH' });
  }
  let planIndex = 0;
  const planner = new FunctionPlannerAdapter({
    adapter_id: String(options.adapter_id || 'work-strong-offline-frozen'),
    plan() { return candidatePlans[planIndex++]; }
  });
  const pipeline = new B2Pipeline({ planner, writer: options.writer, fallbackWriter: options.fallbackWriter });
  const transcript = [];
  const outputs = [];
  let previousPublication = null;
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const plannerPacket = {
      transcript: transcript.slice(-8),
      compact_state: turn.compact_state || null,
      references: turn.references || {},
      confirmed_facts: turn.confirmed_facts || [],
      available_capabilities: turn.available_capabilities || [],
      limits: turn.limits || [],
      safety_state: turn.safety_state || 'NONE',
      current_message: turn.message
    };
    const output = await pipeline.execute({
      planner_packet: plannerPacket,
      authority_context: turn.authority_context || {},
      previous_publication: previousPublication
    });
    const publicScan = scanPublicText(output.response);
    outputs.push(Object.freeze({
      turn: index + 1,
      input: turn.message,
      accepted: output.accepted,
      stage: output.stage,
      response: output.response || null,
      response_hash: output.response_hash || null,
      writer_source: output.writer_source || null,
      writer_limit: output.writer_limit || null,
      planner_packet_hash: output.planner_packet_hash || null,
      planner_plan_hash: output.planner_plan_hash || null,
      progress_state_hash: output.progress_state_hash || null,
      publication_outcome: output.response_plan?.publication_outcome || null,
      required_question: output.response_plan?.required_question || null,
      required_response_commitments: output.response_plan?.required_response_commitments || [],
      public_scan: publicScan
    }));
    if (output.accepted) {
      previousPublication = Object.freeze({
        response: output.response,
        progress_state_hash: output.progress_state_hash
      });
    }
    transcript.push({ role: 'user', text: turn.message }, { role: 'assistant', text: output.response || '' });
  }
  const stable = {
    scenario_id: scenario.scenario_id,
    seed: scenario.seed,
    customer_brief: scenario.customer_brief,
    turns: outputs
  };
  return Object.freeze({ ...stable, conversation_hash: canonicalHash(stable) });
}

function summarizeLab(conversations) {
  const turns = conversations.flatMap((conversation) => conversation.turns);
  const stable = {
    conversations: conversations.length,
    turns: turns.length,
    published: turns.filter((turn) => turn.accepted && turn.stage === 'published').length,
    failed_publications: turns.filter((turn) => !turn.accepted).length,
    writer_limits: turns.filter((turn) => turn.writer_limit).length,
    public_scan_failures: turns.filter((turn) => !turn.public_scan.accepted).length,
    conversation_hashes: conversations.map((conversation) => conversation.conversation_hash)
  };
  return Object.freeze({ ...stable, lab_hash: canonicalHash(stable) });
}

module.exports = { runFrozenConversation, summarizeLab, scanPublicText };

