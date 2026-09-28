# Tally live webhook — authorization granted / authenticated access boundary — 2026-09-28

## Human authorization

César explicitly authorized the next production action in the Gate F plan:

- wire the signed observation-only webhook for live form `ZjVv1a`;
- preserve `external_effect_authorized=false`;
- do not alter the live form or Caixa Executivo workbook;
- do not create a synthetic production occurrence.

This authorization is current and does not need to be re-requested merely because execution is resumed in another chat/session.

## Immediate preflight after authorization

Public read-only revalidation confirmed:

- live public form URL `https://tally.so/r/ZjVv1a` resolves as `Caixa Pulse | Ocorrência de Turno`;
- the live form still exposes `Subtipo operacional` with Item faltando / Item errado / Outro;
- existing Worker health endpoint `https://tata-edge-cloud-shadow.tata-academia.workers.dev/health` returns `status=ok`;
- runtime remains `tata-edge-cloud-shadow@0.1.0`;
- `source_mode=read_only_operational_sources`;
- `external_effects_authorized=false`.

No form submission or production mutation was made during this preflight.

## Access routes checked

Included/authenticated execution routes were checked before using any paid fallback:

1. Opera Browser Connector — unavailable because the browser is not connected.
2. Remote Desktop Commander device `Foxxy` — authenticated token remains valid but device is offline.
3. Installed plugin directory — no Cloudflare or Tally plugin is available.
4. Repository GitHub Actions — current workflow contains CI only and has no deploy credential path.
5. Tally official API — API is free and supports forms/submissions, but the official webhook documentation still directs webhook creation through the published form's Integrations → Webhooks UI; no webhook-management API route was established from the loaded official docs.
6. Metered browser automation was not used because this project requires explicit authorization before new spend.

## Execution state

`AUTHORIZED != EXECUTED`

Current classification:

`GATE_F_AUTHORIZED / AUTHENTICATED_CONTROL_SURFACE_UNAVAILABLE`

The live Tally webhook is still unwired.

No Cloudflare variable, secret, deployment, Tally integration, form content, Google Sheet content, D1 data, or restaurant operational system was changed.

## Resume rule

As soon as an included authenticated control surface is available, resume directly without asking César for Gate F authorization again.

Preferred route:
- `Foxxy` online with the existing authenticated Wrangler/Tally browser context, or
- Opera Browser Connector connected to the already-authenticated Tally/Cloudflare sessions.

Then:
1. revalidate live form identity `ZjVv1a` and Worker health;
2. configure the Worker capture environment for `TALLY_CAPTURE_ENABLED=true` and `TALLY_EXPECTED_FORM_ID=ZjVv1a`, preserving signing-secret secrecy and D1 observation-only storage;
3. add the live Tally webhook endpoint `/sources/tally/occurrence-barrier` with signing secret;
4. do not submit synthetic data;
5. wait for the next real occurrence and prove exactly one idempotent D1 observation;
6. feed the minimized real envelope into Context Kernel v0.11;
7. preserve `OPERATOR_SELF_REPORT`, causal status UNPROVEN, attention authority NONE and external effects false.
