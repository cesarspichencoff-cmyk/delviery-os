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
  shadow: require("./shadow")
};
