'use strict';

const { approvePlan } = require('./authority');
const { DeterministicB2Writer, validateWriterText } = require('./writer');

function validatePublication(written, responsePlan, previousPublication = null) {
  const checked = validateWriterText(written?.text, responsePlan);
  if (!checked.accepted) return checked;
  if (!['AUTHORIZED_RESULT', 'EXPLICIT_LIMITATION', 'CONCRETE_NEXT_STEP'].includes(responsePlan.publication_outcome)) {
    return { accepted: false, reason: 'B2_NEEDS_TOOL_PUBLICATION_CONTRACT' };
  }
  if (previousPublication
    && previousPublication.progress_state_hash === responsePlan.progress_state_hash) {
    return { accepted: false, reason: 'B2_NO_PROGRESS_WITHOUT_STATE_CHANGE' };
  }
  return checked;
}

class B2Pipeline {
  constructor(options = {}) {
    this.planner = options.planner;
    this.authority = options.authority || { approve: approvePlan };
    this.writer = options.writer || new DeterministicB2Writer();
    this.fallbackWriter = options.fallbackWriter || new DeterministicB2Writer();
  }

  async execute(input = {}) {
    if (!this.planner || typeof this.planner.plan !== 'function') {
      return { accepted: false, stage: 'planner', reason: 'B2_PLANNER_NOT_CONFIGURED' };
    }
    const planned = await this.planner.plan(input.planner_packet);
    if (!planned?.accepted) return { accepted: false, stage: 'planner', reason: planned?.reason || 'B2_PLANNER_REJECTED' };
    const authorized = this.authority.approve(planned.plan, input.authority_context || {});
    if (!authorized.accepted) return { accepted: false, stage: 'authority', reason: authorized.reason, plan: planned.plan };
    let written = await this.writer.write(authorized.response_plan);
    let writerLimit = null;
    if (!written.accepted && this.writer !== this.fallbackWriter) {
      writerLimit = written.reason || 'B2_WRITER_REJECTED';
      written = await this.fallbackWriter.write(authorized.response_plan);
    }
    if (!written.accepted) return { accepted: false, stage: 'writer', reason: written.reason, writer_limit: writerLimit, plan: planned.plan, response_plan: authorized.response_plan };
    let publication = validatePublication(written, authorized.response_plan, input.previous_publication || null);
    if (!publication.accepted && this.writer !== this.fallbackWriter && written.source !== 'deterministic_b2_writer') {
      writerLimit = publication.reason;
      written = await this.fallbackWriter.write(authorized.response_plan);
      if (!written.accepted) {
        return { accepted: false, stage: 'writer', reason: written.reason, writer_limit: writerLimit, plan: planned.plan, response_plan: authorized.response_plan };
      }
      publication = validatePublication(written, authorized.response_plan, input.previous_publication || null);
    }
    if (!publication.accepted) {
      return {
        accepted: false,
        stage: 'validator',
        reason: publication.reason,
        writer_limit: writerLimit,
        plan: planned.plan,
        response_plan: authorized.response_plan,
        candidate_response: written.text
      };
    }
    return {
      accepted: true,
      stage: 'published',
      plan: planned.plan,
      planner_adapter: planned.adapter_id || null,
      planner_packet_hash: planned.packet_hash || null,
      planner_plan_hash: planned.plan_hash || null,
      response_plan: authorized.response_plan,
      response: publication.text,
      writer_source: written.source,
      writer_limit: writerLimit,
      response_hash: publication.hash,
      progress_state_hash: authorized.response_plan.progress_state_hash
    };
  }
}

module.exports = { B2Pipeline, validatePublication };
