import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  TALLY_CAIXA_PULSE_SURFACES,
} = require("../dist/src/contextKernel/tallyCaptureSurface.js");

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
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
      index: payload.index ?? null,
      isRequired: payload.isRequired ?? null,
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
  const raw = JSON.stringify(sortValue(canonical));
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

async function loadSurface(surface) {
  const response = await fetch(surface.public_url, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(
      "tally_surface_http_" + response.status + "_" + surface.form_id,
    );
  }
  const html = await response.text();
  const marker =
    '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("tally_next_data_missing");
  const contentStart = start + marker.length;
  const end = html.indexOf("</script>", contentStart);
  if (end < 0) throw new Error("tally_next_data_unclosed");
  const nextData = JSON.parse(html.slice(contentStart, end));
  const pageProps = nextData?.props?.pageProps;
  if (!pageProps) throw new Error("tally_page_props_missing");

  const observed = {
    form_id: pageProps.formId,
    workspace_id: pageProps.workspaceId,
    block_count: (pageProps.blocks ?? []).length,
    sha256: fingerprint(pageProps),
  };
  const matches =
    observed.form_id === surface.form_id &&
    observed.workspace_id === surface.workspace_id &&
    observed.block_count === surface.expected_block_count &&
    observed.sha256 === surface.expected_sha256;

  return {
    role: surface.role,
    public_url: surface.public_url,
    editor_url: surface.editor_url,
    expected: {
      form_id: surface.form_id,
      workspace_id: surface.workspace_id,
      block_count: surface.expected_block_count,
      sha256: surface.expected_sha256,
    },
    observed,
    matches,
  };
}

const results = [];
for (const surface of TALLY_CAIXA_PULSE_SURFACES) {
  results.push(await loadSurface(surface));
}

const status = results.every((item) => item.matches) ? "PASS" : "DRIFT";
console.log(JSON.stringify({
  status,
  observed_live: true,
  read_only: true,
  external_effects_authorized: false,
  results,
}, null, 2));

if (status !== "PASS") process.exitCode = 2;
