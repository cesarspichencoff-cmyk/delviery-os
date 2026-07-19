/* ============================================================================
 * Pipeline de calibração Capacidade Viva — export público.
 * ==========================================================================*/
"use strict";

module.exports = {
  labels: require("./labels"),
  loader: require("./loader"),
  normalizer: require("./normalizer"),
  quality: require("./quality"),
  catalog: require("./catalog"),
  replay: require("./replay"),
  calibrator: require("./calibrator"),
  shadow: require("./shadow"),
  timezone: require("./timezone"),
  taxonomy: require("./taxonomy"),
  episodes: require("./episodes"),
  sensitivity: require("./sensitivity"),
  baselines: require("./baselines"),
  intervencaoSane: require("./intervencao-sane"),
  reviewSet: require("./review-set")
};
