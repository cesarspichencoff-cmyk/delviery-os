'use strict';

const { buildBlindPlannerPacket, canonicalHash, validatePlan } = require('./contract');

class ConversationPlannerPort {
  constructor(options = {}) {
    if (new.target === ConversationPlannerPort) {
      throw Object.assign(new Error('B2_PLANNER_PORT_ABSTRACT'), { code: 'B2_PLANNER_PORT_ABSTRACT' });
    }
    this.adapter_id = String(options.adapter_id || 'b2-planner-adapter');
  }

  async plan() {
    throw Object.assign(new Error('B2_PLANNER_PORT_NOT_IMPLEMENTED'), { code: 'B2_PLANNER_PORT_NOT_IMPLEMENTED' });
  }
}

function validatePlannerPacket(packet) {
  const blind = buildBlindPlannerPacket(packet || {});
  if (!blind.current_message.trim()) return { accepted: false, reason: 'B2_PLANNER_MESSAGE_REQUIRED' };
  if (!['NONE', 'PREVENTIVE', 'URGENT'].includes(blind.safety_state)) {
    return { accepted: false, reason: 'B2_PLANNER_SAFETY_STATE_INVALID' };
  }
  return { accepted: true, packet: blind, hash: canonicalHash(blind) };
}

class ReplayPlanner extends ConversationPlannerPort {
  constructor(options = {}) {
    super({ adapter_id: options.adapter_id || 'b2-replay-planner' });
    this.frozenPlans = new Map(Object.entries(options.frozen_plans || {}));
  }

  async plan(rawPacket) {
    const checkedPacket = validatePlannerPacket(rawPacket);
    if (!checkedPacket.accepted) return checkedPacket;
    const frozen = this.frozenPlans.get(checkedPacket.hash);
    if (!frozen) return { accepted: false, reason: 'B2_REPLAY_PLAN_NOT_FOUND', packet_hash: checkedPacket.hash };
    const checkedPlan = validatePlan(frozen);
    if (!checkedPlan.accepted) return { accepted: false, reason: checkedPlan.reason, packet_hash: checkedPacket.hash };
    return {
      accepted: true,
      plan: checkedPlan.plan,
      plan_hash: checkedPlan.hash,
      packet_hash: checkedPacket.hash,
      adapter_id: this.adapter_id,
      frozen: true
    };
  }
}

class FunctionPlannerAdapter extends ConversationPlannerPort {
  constructor(options = {}) {
    super({ adapter_id: options.adapter_id || 'b2-function-planner' });
    if (typeof options.plan !== 'function') throw new TypeError('B2_PLANNER_FUNCTION_REQUIRED');
    this.planFunction = options.plan;
  }

  async plan(rawPacket) {
    const checkedPacket = validatePlannerPacket(rawPacket);
    if (!checkedPacket.accepted) return checkedPacket;
    const candidate = await this.planFunction(checkedPacket.packet, checkedPacket.hash);
    const checkedPlan = validatePlan(candidate);
    if (!checkedPlan.accepted) return { accepted: false, reason: checkedPlan.reason, packet_hash: checkedPacket.hash };
    return {
      accepted: true,
      plan: checkedPlan.plan,
      plan_hash: checkedPlan.hash,
      packet_hash: checkedPacket.hash,
      adapter_id: this.adapter_id,
      frozen: false
    };
  }
}

module.exports = { ConversationPlannerPort, ReplayPlanner, FunctionPlannerAdapter, validatePlannerPacket };
