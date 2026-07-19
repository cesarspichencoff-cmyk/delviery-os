/**
 * Copiloto Delivery — pacote de inteligência (referência)
 * Não altera motor.js, decisao.js nem interfaces oficiais.
 */
"use strict";

module.exports = {
  config: require("./config"),
  canonical: require("./canonical-model"),
  baselines: require("./baselines"),
  thresholds: require("./thresholds"),
  forecast: require("./forecast"),
  anomalies: require("./anomalies"),
  focus: require("./focus-engine"),
  stability: require("./focus-stability"),
  response: require("./response-contract"),
  voice: require("./voice-intents"),
  closing: require("./shift-closing"),
  briefing: require("./shift-briefing"),
  memory: require("./shift-memory"),
  playbooks: require("./playbooks"),
  shadow: require("./shadow-mode"),
  silence: require("./silence"),
  external: require("./external-signals"),
  microcoaching: require("./microcoaching"),
  metrics: require("./metrics")
};
