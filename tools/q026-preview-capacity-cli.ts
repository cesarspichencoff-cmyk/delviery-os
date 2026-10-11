/**
 * Explicit command-line entrypoint for the PURE Q026 preview budget model.
 * Accept exactly one JSON value WITHOUT PostgreSQL URLs or credentials.
 * Never reaches a network, creates a project, or enables product flags.
 */
import { verificarOrcamentoQ026 } from "./q026-preview-capacity-gate";

try {
  if (process.argv.length!==3)throw Error("Q026_CAPACITY_ONE_JSON_ARG_REQUIRED");
  const result=verificarOrcamentoQ026(JSON.parse(process.argv[2]));
  console.log("Q026_PREVIEW_CAPACITY_BUDGET "+JSON.stringify(result));
  if (!result.sufficient_on_declared_assumptions)process.exitCode=2;
} catch(e) {
  console.error("Q026_PREVIEW_CAPACITY_BLOCKED "+
    (e instanceof Error ? e.message : "INVALID_INPUT"));
  process.exitCode=2;
}
