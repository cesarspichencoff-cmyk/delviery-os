'use strict';

const { approvePlan } = require('./authority');
const { DeterministicB2Writer } = require('./writer');

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
    return {
      accepted: true,
      stage: 'published',
      plan: planned.plan,
      response_plan: authorized.response_plan,
      response: written.text,
      writer_source: written.source,
      writer_limit: writerLimit,
      response_hash: written.hash
    };
  }
}

module.exports = { B2Pipeline };
