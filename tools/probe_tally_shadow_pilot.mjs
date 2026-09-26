import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { TALLY_SHADOW_PILOT } = require("../dist/src/contextKernel/tallyShadowPilot.js");

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

function fingerprint(pageProps) {
  const blocks = (pageProps.blocks ?? []).map((block) => {
    const payload = block.payload ?? {};
    return {
      type: block.type ?? null,
      groupType: block.groupType ?? null,
      uuid: block.uuid ?? null,
      groupUuid: block.groupUuid ?? null,
      safeHTMLSchema: payload.safeHTMLSchema ?? null,
      text: payload.text ?? null,
      index: payload.index ?? null,      isRequired: payload.isRequired ?? null,
      isFirst: payload.isFirst ?? null,
      isLast: payload.isLast ?? null,
    };
  });
  const canonical = {
    formId: pageProps.formId ?? null,
    workspaceId: pageProps.workspaceId ?? null,
    name: pageProps.name ?? null,
    isClosed: pageProps.isClosed ?? null,
    blocks,
  };
  return createHash("sha256")
    .update(JSON.stringify(sortValue(canonical)), "utf8")
    .digest("hex");
}

const response = await fetch(TALLY_SHADOW_PILOT.public_url, {
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error("tally_shadow_http_" + response.status);
const html = await response.text();
const marker = '<script id="__NEXT_DATA__" type="application/json">';
const start = html.indexOf(marker);
if (start < 0) throw new Error("tally_shadow_next_data_missing");
const contentStart = start + marker.length;
const end = html.indexOf("</script>", contentStart);
if (end < 0) throw new Error("tally_shadow_next_data_unclosed");const pageProps = JSON.parse(html.slice(contentStart, end))?.props?.pageProps;
if (!pageProps) throw new Error("tally_shadow_page_props_missing");

const observed = {
  form_id: pageProps.formId,
  workspace_id: pageProps.workspaceId,
  block_count: (pageProps.blocks ?? []).length,
  sha256: fingerprint(pageProps),
};
const matches =
  observed.form_id === TALLY_SHADOW_PILOT.shadow_form_id &&
  observed.workspace_id === TALLY_SHADOW_PILOT.workspace_id &&
  observed.block_count === TALLY_SHADOW_PILOT.expected_block_count &&
  observed.sha256 === TALLY_SHADOW_PILOT.expected_sha256;

console.log(JSON.stringify({
  status: matches ? "PASS" : "DRIFT",
  observed_shadow: true,
  read_only: true,
  live_cutover_authorized: false,
  expected: {
    form_id: TALLY_SHADOW_PILOT.shadow_form_id,
    workspace_id: TALLY_SHADOW_PILOT.workspace_id,
    block_count: TALLY_SHADOW_PILOT.expected_block_count,
    sha256: TALLY_SHADOW_PILOT.expected_sha256,
  },
  observed,
}, null, 2));

if (!matches) process.exitCode = 2;