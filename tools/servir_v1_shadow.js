/* ============================================================================
 * Launcher de auditoria — sobe tools/servir_v1.js de verdade com
 * CAPACIDADE_VIVA_HUMAN_V2_SHADOW=true (Fase 2E.2). Não duplica nem altera
 * o servidor real — só garante a env var antes de exigi-lo.
 *   Uso: node tools/servir_v1_shadow.js   (ou via .claude/launch.json "v1-shadow")
 * ==========================================================================*/
"use strict";
process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW = process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW || "true";
require("./servir_v1.js");
